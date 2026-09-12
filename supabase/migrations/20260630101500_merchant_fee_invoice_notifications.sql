alter table public.merchant_fee_invoices
  add column if not exists notification_sent_at timestamptz,
  add column if not exists last_notification_sent_at timestamptz,
  add column if not exists notification_count integer not null default 0,
  add column if not exists email_sent_at timestamptz,
  add column if not exists sms_sent_at timestamptz,
  add column if not exists last_notification_error text;

create or replace function public.send_merchant_fee_invoice_notifications(
  p_merchant_id uuid default null,
  p_dry_run boolean default true
)
returns table (
  invoice_id uuid,
  merchant_id uuid,
  invoice_number text,
  amount numeric,
  email text,
  mobile_number text,
  generated_code text,
  payment_link text,
  notification_action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_site_url text := 'https://www.paysme.site';
  v_code_link text;
  v_payment_link text;
  v_sms_content text;
  v_email_payload jsonb;
  v_sms_payload jsonb;
  v_auth_headers jsonb;
  v_mobile text;
begin
  v_auth_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
  );

  for r in
    select
      mfi.invoice_id,
      mfi.merchant_id,
      mfi.invoice_number,
      mfi.amount,
      mfi.generated_code,
      mfi.payment_link,
      mfi.due_date,
      mfi.status,
      mfi.last_notification_sent_at,
      m.email,
      m.mobile_number,
      m.business_name
    from public.merchant_fee_invoices mfi
    join public.merchants m on m.merchant_id = mfi.merchant_id
    where mfi.status in ('pending', 'overdue')
      and coalesce(mfi.amount, 0) > 0
      and (p_merchant_id is null or mfi.merchant_id = p_merchant_id)
      and (
        mfi.last_notification_sent_at is null
        or mfi.last_notification_sent_at <= now() - interval '3 days'
      )
    order by mfi.due_date nulls first, mfi.created_at nulls first
  loop
    v_code_link := v_site_url || '/c/' || replace(coalesce(r.generated_code, ''), ' ', '');
    v_payment_link := v_code_link;

    invoice_id := r.invoice_id;
    merchant_id := r.merchant_id;
    invoice_number := r.invoice_number;
    amount := r.amount;
    email := r.email;
    v_mobile := regexp_replace(coalesce(r.mobile_number, ''), '[^0-9]', '', 'g');
    if v_mobile ~ '^0(81|83|85)[0-9]{7}$' then
      v_mobile := '264' || substring(v_mobile from 2);
    end if;

    mobile_number := nullif(v_mobile, '');
    generated_code := r.generated_code;
    payment_link := v_payment_link;

    if p_dry_run then
      notification_action := 'dry_run';
      return next;
      continue;
    end if;

    begin
      if r.email is not null and length(trim(r.email)) > 0 then
        v_email_payload := jsonb_build_object(
          'type', 'merchant_fee_invoice',
          'merchant_id', r.merchant_id::text,
          'invoice_number', r.invoice_number,
          'fee_amount', r.amount,
          'generated_code', r.generated_code,
          'payment_link', v_payment_link,
          'due_date', r.due_date
        );

        perform net.http_post(
          url := 'https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/send-email',
          headers := v_auth_headers,
          body := v_email_payload
        );
      end if;

      if v_mobile is not null and length(trim(v_mobile)) > 0 then
        v_sms_content := concat(
          'PaySME fee invoice ', r.invoice_number, E'\n',
          'Amount due: N$ ', to_char(r.amount, 'FM999999990.00'), E'\n',
          'Code: ', r.generated_code, E'\n',
          'Pay link: ', v_payment_link, E'\n',
          'Please settle to keep your merchant portal and payment options active.'
        );

        v_sms_payload := jsonb_build_object(
          'action', 'send_single',
          'payload', jsonb_build_object(
            'mobile', v_mobile,
            'content', v_sms_content
          )
        );

        perform net.http_post(
          url := 'https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/send-sms',
          headers := v_auth_headers,
          body := v_sms_payload
        );
      end if;

      update public.merchant_fee_invoices mfi
      set
        notification_sent_at = coalesce(mfi.notification_sent_at, now()),
        last_notification_sent_at = now(),
        notification_count = coalesce(mfi.notification_count, 0) + 1,
        email_sent_at = case
          when r.email is not null and length(trim(r.email)) > 0 then now()
          else mfi.email_sent_at
        end,
        sms_sent_at = case
          when v_mobile is not null and length(trim(v_mobile)) > 0 then now()
          else mfi.sms_sent_at
        end,
        last_notification_error = null
      where mfi.invoice_id = r.invoice_id;

      notification_action := 'sent';
      return next;
    exception when others then
      update public.merchant_fee_invoices mfi
      set last_notification_error = sqlerrm
      where mfi.invoice_id = r.invoice_id;

      notification_action := 'failed: ' || sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

grant execute on function public.send_merchant_fee_invoice_notifications(uuid, boolean) to authenticated;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'send-merchant-fee-invoice-reminders';

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'send-merchant-fee-invoice-reminders',
    '15 8 * * *',
    $cron$select public.send_merchant_fee_invoice_notifications(null, false);$cron$
  );
end $$;
