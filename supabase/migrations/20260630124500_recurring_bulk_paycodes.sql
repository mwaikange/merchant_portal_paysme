-- Recurring PayCode schedule metadata for bulk subscribers.
-- Existing bulk_subscribers rows remain valid; recurring rows can now be grouped
-- and scheduled as a full set of future PayCodes.

alter table public.bulk_subscribers
  add column if not exists subscription_group_id uuid,
  add column if not exists subscription_base_code text,
  add column if not exists subscription_sequence integer,
  add column if not exists subscription_total_cycles integer,
  add column if not exists subscription_months integer,
  add column if not exists scheduled_send_at timestamp with time zone,
  add column if not exists sms_status text default 'pending',
  add column if not exists sms_provider_message_id text,
  add column if not exists sms_scheduled_at timestamp with time zone;

create index if not exists idx_bulk_subscribers_subscription_group
  on public.bulk_subscribers(subscription_group_id);

create index if not exists idx_bulk_subscribers_scheduled_send
  on public.bulk_subscribers(merchant_id, scheduled_send_at, sms_status);

alter table public.bulk_subscribers
  drop constraint if exists bulk_subscribers_subscription_sequence_check;

alter table public.bulk_subscribers
  add constraint bulk_subscribers_subscription_sequence_check
  check (
    subscription_sequence is null
    or (
      subscription_sequence >= 1
      and subscription_total_cycles is not null
      and subscription_total_cycles >= subscription_sequence
    )
  );

alter table public.bulk_subscribers
  drop constraint if exists bulk_subscribers_subscription_months_check;

alter table public.bulk_subscribers
  add constraint bulk_subscribers_subscription_months_check
  check (subscription_months is null or subscription_months between 1 and 120);

alter table public.bulk_subscribers
  drop constraint if exists bulk_subscribers_sms_status_check;

alter table public.bulk_subscribers
  add constraint bulk_subscribers_sms_status_check
  check (
    sms_status is null
    or sms_status in ('pending', 'scheduled', 'sent', 'failed', 'cancelled')
  );

create or replace function public.process_due_bulk_scheduled_sms()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_headers jsonb;
begin
  v_auth_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
  );

  perform net.http_post(
    url := 'https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/process-scheduled-sms',
    headers := v_auth_headers,
    body := jsonb_build_object('limit', 500)
  );
end;
$$;

grant execute on function public.process_due_bulk_scheduled_sms() to authenticated;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'process-due-bulk-scheduled-sms';

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'process-due-bulk-scheduled-sms',
    '*/5 * * * *',
    $cron$select public.process_due_bulk_scheduled_sms();$cron$
  );
end $$;
