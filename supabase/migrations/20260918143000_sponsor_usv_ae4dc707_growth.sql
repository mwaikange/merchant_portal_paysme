begin;

do $$
declare
  target_merchant_id uuid;
  sponsored_at timestamptz := now();
begin
  select merchant_id into target_merchant_id
  from public.merchants
  where upper(vendor_id) = 'USV_AE4DC707'
  limit 1;

  if target_merchant_id is null then
    raise exception 'Merchant USV_AE4DC707 was not found';
  end if;

  update public.subscriptions
  set status = 'cancelled'
  where user_id = target_merchant_id
    and status = 'active'
    and coalesce(end_date, sponsored_at) > sponsored_at;

  insert into public.subscriptions (
    user_id, amount, duration_months, plan_type, recurring, status,
    start_date, end_date, activated_date, generated_code, paycode_status
  ) values (
    target_merchant_id, 0, 3, 'growth_3_months', false, 'active',
    sponsored_at, sponsored_at + interval '3 months', sponsored_at, null, 'paid'
  );
end;
$$;

commit;
