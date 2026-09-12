alter table public.bulk_subscribers
  add column if not exists sms_parts_reserved integer not null default 1;

update public.bulk_subscribers
set sms_parts_reserved = 1
where sms_parts_reserved is null
   or sms_parts_reserved < 1;
