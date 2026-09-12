create or replace function public.insert_bulk_transaction()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  client_id uuid;
  merchant_business_name text;
begin
  if exists (select 1 from public.transactions where transaction_id = new.transaction_id) then
    return new;
  end if;

  select m.business_name
    into merchant_business_name
  from public.merchants m
  where m.merchant_id = new.merchant_id;

  client_id := public.get_or_create_merchant_client(
    new.merchant_id,
    new.user_email,
    new.user_mobile
  );

  if new.merchant_client_id is null then
    new.merchant_client_id := client_id;
  end if;

  insert into public.transactions (
    transaction_id,
    merchant_id,
    merchant_client_id,
    generated_code,
    invoice_id,
    amount,
    user_email,
    user_mobile,
    status,
    type,
    date_generated,
    created_at,
    business_name
  ) values (
    new.transaction_id,
    new.merchant_id,
    coalesce(client_id, new.merchant_client_id),
    new.generated_code,
    new.reference,
    new.amount,
    new.user_email,
    new.user_mobile,
    'pending',
    'bulk',
    coalesce(new.date_generated, now()),
    now(),
    coalesce(merchant_business_name, 'PaySME Store')
  );

  return new;
end;
$function$;

update public.transactions t
set business_name = coalesce(m.business_name, 'PaySME Store')
from public.merchants m
where t.merchant_id = m.merchant_id
  and t.type = 'bulk'
  and (t.business_name is null or btrim(t.business_name) = '');
