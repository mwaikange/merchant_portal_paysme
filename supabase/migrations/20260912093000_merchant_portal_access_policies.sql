begin;

create or replace function public.merchant_role_for(p_merchant_id uuid,p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when p_user_id is distinct from auth.uid() then null
    when p_user_id=p_merchant_id and exists(select 1 from public.merchants where merchant_id=p_merchant_id) then 'owner'
    else (select role from public.merchant_memberships where merchant_id=p_merchant_id and user_id=p_user_id and status='active' limit 1)
  end;
$$;

do $$
declare item record;
begin
  for item in
    select * from (values
      ('merchants','merchant_id','operations'),
      ('transactions','merchant_id','operations'),
      ('merchant_clients','merchant_id','operations'),
      ('bulk_subscribers','merchant_id','operations'),
      ('bulk_uploads','merchant_id','operations'),
      ('sms_transactions','user_id','operations'),
      ('subscriptions','user_id','operations'),
      ('merchant_fee_invoices','merchant_id','operations'),
      ('merchant_payouts','merchant_id','operations'),
      ('merchant_qr_basket_users','merchant_id','operations'),
      ('merchant_qr_baskets','merchant_id','operations'),
      ('merchant_qr_payment_links','merchant_id','operations'),
      ('mobile_request_to_pay','merchant_id','operations'),
      ('mobiwand_payment_attempts','merchant_id','operations'),
      ('wayame_payment_attempts','merchant_id','operations'),
      ('vendor_transactions','merchant_id','operations'),
      ('kyc_documents','user_id','kyc'),
      ('kyc_submissions','user_id','kyc'),
      ('merchant_kyc_activity_log','merchant_id','kyc'),
      ('merchant_payment_facilitators','merchant_id','api')
    ) as configured(table_name,key_column,permission_name)
  loop
    if to_regclass(format('public.%I',item.table_name)) is not null then
      execute format('drop policy if exists merchant_portal_access_guard on public.%I',item.table_name);
      execute format(
        'create policy merchant_portal_access_guard on public.%I as restrictive for all to authenticated using (public.merchant_role_for(%I) is null or public.merchant_portal_allowed(%I,%L)) with check (public.merchant_role_for(%I) is null or public.merchant_portal_allowed(%I,%L))',
        item.table_name,item.key_column,item.key_column,item.permission_name,item.key_column,item.key_column,item.permission_name
      );
    end if;
  end loop;
end $$;

create policy merchant_staff_read_merchant on public.merchants for select to authenticated
using (public.merchant_portal_allowed(merchant_id,'operations'));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'transactions','merchant_clients','bulk_subscribers','bulk_uploads','merchant_qr_basket_users',
    'merchant_qr_baskets','merchant_qr_payment_links'
  ]
  loop
    if to_regclass(format('public.%I',table_name)) is not null then
      execute format('drop policy if exists merchant_staff_operations on public.%I',table_name);
      execute format('create policy merchant_staff_operations on public.%I for all to authenticated using (public.merchant_portal_allowed(merchant_id,%L)) with check (public.merchant_portal_allowed(merchant_id,%L))',table_name,'operations','operations');
    end if;
  end loop;
end $$;

create policy merchant_staff_sms_operations on public.sms_transactions for all to authenticated
using (public.merchant_portal_allowed(user_id,'operations'))
with check (public.merchant_portal_allowed(user_id,'operations'));

create policy merchant_staff_subscription_read on public.subscriptions for select to authenticated
using (public.merchant_portal_allowed(user_id,'operations'));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'merchant_fee_invoices','merchant_payouts','mobile_request_to_pay','mobiwand_payment_attempts',
    'wayame_payment_attempts','vendor_transactions'
  ]
  loop
    if to_regclass(format('public.%I',table_name)) is not null then
      execute format('drop policy if exists merchant_staff_operational_read on public.%I',table_name);
      execute format('create policy merchant_staff_operational_read on public.%I for select to authenticated using (public.merchant_portal_allowed(merchant_id,%L))',table_name,'operations');
    end if;
  end loop;
end $$;

create policy merchant_admin_kyc_submissions on public.kyc_submissions for all to authenticated
using (public.merchant_role_for(user_id) in ('owner','admin') and public.merchant_portal_allowed(user_id,'kyc'))
with check (public.merchant_role_for(user_id) in ('owner','admin') and public.merchant_portal_allowed(user_id,'kyc'));

create policy merchant_admin_kyc_documents on public.kyc_documents for all to authenticated
using (public.merchant_role_for(user_id) in ('owner','admin') and public.merchant_portal_allowed(user_id,'kyc'))
with check (public.merchant_role_for(user_id) in ('owner','admin') and public.merchant_portal_allowed(user_id,'kyc'));

create policy merchant_admin_facilitators on public.merchant_payment_facilitators for all to authenticated
using (public.merchant_role_for(merchant_id) in ('owner','admin') and public.merchant_portal_allowed(merchant_id,'api'))
with check (public.merchant_role_for(merchant_id) in ('owner','admin') and public.merchant_portal_allowed(merchant_id,'api'));

commit;
