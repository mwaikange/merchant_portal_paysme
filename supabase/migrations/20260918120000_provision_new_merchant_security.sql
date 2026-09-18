begin;

-- The merchant security foundation originally backfilled rows that existed when
-- the migration ran, but new merchants created by handle_new_merchant() did not
-- receive either record. Provision both records for every future merchant.
create or replace function public.provision_merchant_security_defaults()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  insert into public.merchant_security_settings(merchant_id)
  values (new.merchant_id)
  on conflict (merchant_id) do nothing;

  if exists (select 1 from auth.users where id=new.merchant_id) then
    insert into public.merchant_memberships(
      merchant_id,
      user_id,
      email,
      full_name,
      role,
      status
    )
    select
      new.merchant_id,
      new.merchant_id,
      coalesce(nullif(new.email,''),u.email,''),
      coalesce(nullif(new.business_name,''),nullif(new.email,''),u.email,'Merchant owner'),
      'owner',
      'active'
    from auth.users u
    where u.id=new.merchant_id
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists provision_merchant_security_defaults_trigger on public.merchants;
create trigger provision_merchant_security_defaults_trigger
after insert on public.merchants
for each row execute function public.provision_merchant_security_defaults();

revoke all on function public.provision_merchant_security_defaults() from public,anon,authenticated;

-- Repair accounts registered after the security-foundation backfill.
insert into public.merchant_security_settings(merchant_id)
select m.merchant_id
from public.merchants m
on conflict (merchant_id) do nothing;

insert into public.merchant_memberships(merchant_id,user_id,email,full_name,role,status)
select
  m.merchant_id,
  m.merchant_id,
  coalesce(nullif(m.email,''),u.email,''),
  coalesce(nullif(m.business_name,''),nullif(m.email,''),u.email,'Merchant owner'),
  'owner',
  'active'
from public.merchants m
join auth.users u on u.id=m.merchant_id
on conflict do nothing;

-- A missing settings row must never hide an otherwise valid owner or staff
-- membership. Defaults are safe: network restrictions are disabled.
create or replace function public.get_my_merchant_security_context(p_merchant_identifier text default null)
returns table(
  merchant_id uuid,
  actor_role text,
  membership_status text,
  network_restrictions_enabled boolean,
  current_ip text,
  network_allowed boolean,
  mfa_enrolled boolean,
  current_aal text,
  access_allowed boolean
)
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  mid uuid;
  r text;
  s text;
  ip inet;
  enrolled boolean;
  aal text;
  restrictions_enabled boolean;
  allowed boolean;
begin
  if uid is null then return; end if;

  select x.merchant_id,x.role,x.status
  into mid,r,s
  from (
    select m.merchant_id,'owner'::text role,'active'::text status,0 priority
    from public.merchants m
    where m.merchant_id=uid
      and (
        p_merchant_identifier is null
        or lower(p_merchant_identifier) in (lower(m.merchant_id::text),lower(m.vendor_id))
      )

    union all

    select mm.merchant_id,mm.role,mm.status,1
    from public.merchant_memberships mm
    join public.merchants m on m.merchant_id=mm.merchant_id
    where mm.user_id=uid
      and (
        p_merchant_identifier is null
        or lower(p_merchant_identifier) in (lower(m.merchant_id::text),lower(m.vendor_id))
      )
  ) x
  order by x.priority
  limit 1;

  if mid is null then return; end if;

  ip:=public.request_source_ip();
  enrolled:=public.user_has_verified_mfa(uid);
  aal:=coalesce(auth.jwt()->>'aal','aal1');
  restrictions_enabled:=coalesce((
    select ms.network_restrictions_enabled
    from public.merchant_security_settings ms
    where ms.merchant_id=mid
  ),false);
  allowed:=public.merchant_network_allowed(mid,ip);

  return query
  select
    mid,
    r,
    s,
    restrictions_enabled,
    ip::text,
    allowed,
    enrolled,
    aal,
    s='active'
      and (r<>'staff' or (enrolled and aal='aal2'))
      and (not enrolled or aal='aal2')
      and allowed;
end;
$$;

revoke all on function public.get_my_merchant_security_context(text) from public,anon;
grant execute on function public.get_my_merchant_security_context(text) to authenticated;

commit;
