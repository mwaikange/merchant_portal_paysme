alter table public.merchants
  add column if not exists sms_client_id text,
  add column if not exists sms_key text;
