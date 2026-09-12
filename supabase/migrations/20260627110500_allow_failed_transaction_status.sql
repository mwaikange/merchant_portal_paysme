-- Allow card/facilitator failures to be recorded instead of leaving transactions pending.
alter table public.transactions
drop constraint if exists transactions_status_check;

alter table public.transactions
add constraint transactions_status_check
check (
  status::text = any (
    array[
      'pending'::varchar,
      'paid'::varchar,
      'failed'::varchar,
      'expired'::varchar,
      'cancelled'::varchar
    ]::text[]
  )
);
