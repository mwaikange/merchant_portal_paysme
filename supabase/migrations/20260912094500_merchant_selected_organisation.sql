begin;

drop function if exists public.get_my_merchant_security_context();
create function public.get_my_merchant_security_context(p_merchant_identifier text default null)
returns table(merchant_id uuid,actor_role text,membership_status text,network_restrictions_enabled boolean,current_ip text,network_allowed boolean,mfa_enrolled boolean,current_aal text,access_allowed boolean)
language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); mid uuid; r text; s text; ip inet; enrolled boolean; aal text;
begin
  if uid is null then return; end if;
  select x.merchant_id,x.role,x.status into mid,r,s from (
    select m.merchant_id,'owner'::text role,'active'::text status,0 priority
      from public.merchants m
      where m.merchant_id=uid
        and (p_merchant_identifier is null or lower(p_merchant_identifier) in (lower(m.merchant_id::text),lower(m.vendor_id)))
    union all
    select mm.merchant_id,mm.role,mm.status,1
      from public.merchant_memberships mm
      join public.merchants m on m.merchant_id=mm.merchant_id
      where mm.user_id=uid
        and (p_merchant_identifier is null or lower(p_merchant_identifier) in (lower(m.merchant_id::text),lower(m.vendor_id)))
  ) x order by x.priority limit 1;
  if mid is null then return; end if;
  ip:=public.request_source_ip(); enrolled:=public.user_has_verified_mfa(uid); aal:=coalesce(auth.jwt()->>'aal','aal1');
  return query select mid,r,s,coalesce(ms.network_restrictions_enabled,false),ip::text,public.merchant_network_allowed(mid,ip),enrolled,aal,
    s='active' and (r<>'staff' or (enrolled and aal='aal2')) and (not enrolled or aal='aal2') and public.merchant_network_allowed(mid,ip)
  from public.merchant_security_settings ms where ms.merchant_id=mid;
end $$;

revoke all on function public.get_my_merchant_security_context(text) from public,anon;
grant execute on function public.get_my_merchant_security_context(text) to authenticated;

commit;
