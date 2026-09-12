alter table public.sms_transactions
  add column if not exists admin_load_status text not null default 'not_paid',
  add column if not exists admin_load_requested_at timestamptz,
  add column if not exists admin_loaded_at timestamptz,
  add column if not exists admin_loaded_by uuid,
  add column if not exists admin_load_notes text;

alter table public.sms_transactions
  drop constraint if exists sms_transactions_admin_load_status_check;

alter table public.sms_transactions
  add constraint sms_transactions_admin_load_status_check
  check (admin_load_status in ('not_paid', 'pending_load', 'loaded', 'cancelled'));

update public.sms_transactions
set
  admin_load_status = case
    when paycode_status = 'paid' then 'pending_load'
    when paycode_status = 'cancelled' then 'cancelled'
    else 'not_paid'
  end,
  admin_load_requested_at = case
    when paycode_status = 'paid' and admin_load_requested_at is null then now()
    else admin_load_requested_at
  end
where admin_load_status is null
   or admin_load_status = 'not_paid';
