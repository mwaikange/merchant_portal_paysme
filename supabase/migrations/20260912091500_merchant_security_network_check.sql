begin;

create or replace function public.merchant_network_entries_allow(
  p_merchant_id uuid,
  p_ip inet
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select p_ip is not null and exists (
    select 1
    from public.merchant_approved_networks
    where merchant_id=p_merchant_id and p_ip <<= network
  );
$$;

revoke all on function public.merchant_network_entries_allow(uuid,inet) from public,anon,authenticated;
grant execute on function public.merchant_network_entries_allow(uuid,inet) to service_role;

create or replace function public.merchant_network_change_keeps_access(
  p_merchant_id uuid,
  p_ip inet,
  p_excluded_id uuid default null,
  p_replacement cidr default null
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select p_ip is not null and (
    (p_replacement is not null and p_ip <<= p_replacement)
    or exists (
      select 1 from public.merchant_approved_networks
      where merchant_id=p_merchant_id
        and (p_excluded_id is null or id<>p_excluded_id)
        and p_ip <<= network
    )
  );
$$;

revoke all on function public.merchant_network_change_keeps_access(uuid,inet,uuid,cidr) from public,anon,authenticated;
grant execute on function public.merchant_network_change_keeps_access(uuid,inet,uuid,cidr) to service_role;

commit;
