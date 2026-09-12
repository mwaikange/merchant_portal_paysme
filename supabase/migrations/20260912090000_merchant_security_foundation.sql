begin;

create extension if not exists pgcrypto;

create table if not exists public.merchant_memberships (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(merchant_id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  role text not null check (role in ('owner','admin','staff')),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  invitation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists merchant_memberships_merchant_email_key
  on public.merchant_memberships (merchant_id, lower(email));
create unique index if not exists merchant_memberships_merchant_user_key
  on public.merchant_memberships (merchant_id, user_id) where user_id is not null;
create index if not exists merchant_memberships_user_idx on public.merchant_memberships(user_id);

create table if not exists public.merchant_security_settings (
  merchant_id uuid primary key references public.merchants(merchant_id) on delete cascade,
  network_restrictions_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.merchant_approved_networks (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(merchant_id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 80),
  network cidr not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, network)
);

create table if not exists public.merchant_action_approvals (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(merchant_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  source_ip inet,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at <= created_at + interval '5 minutes')
);
create index if not exists merchant_action_approvals_lookup_idx
  on public.merchant_action_approvals(merchant_id,user_id,action,expires_at) where used_at is null;

create table if not exists public.merchant_security_audit (
  id bigint generated always as identity primary key,
  merchant_id uuid not null references public.merchants(merchant_id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  result text not null check (result in ('success','denied','failed')),
  source_ip inet,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists merchant_security_audit_merchant_created_idx
  on public.merchant_security_audit(merchant_id,created_at desc);

insert into public.merchant_memberships(merchant_id,user_id,email,full_name,role,status)
select m.merchant_id, m.merchant_id, coalesce(m.email,u.email,''), coalesce(nullif(m.business_name,''),u.email,'Merchant owner'), 'owner', 'active'
from public.merchants m
join auth.users u on u.id=m.merchant_id
on conflict do nothing;

insert into public.merchant_security_settings(merchant_id)
select merchant_id from public.merchants on conflict do nothing;

create or replace function public.touch_merchant_security_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end $$;

drop trigger if exists merchant_memberships_touch on public.merchant_memberships;
create trigger merchant_memberships_touch before update on public.merchant_memberships
for each row execute function public.touch_merchant_security_updated_at();
drop trigger if exists merchant_security_settings_touch on public.merchant_security_settings;
create trigger merchant_security_settings_touch before update on public.merchant_security_settings
for each row execute function public.touch_merchant_security_updated_at();
drop trigger if exists merchant_approved_networks_touch on public.merchant_approved_networks;
create trigger merchant_approved_networks_touch before update on public.merchant_approved_networks
for each row execute function public.touch_merchant_security_updated_at();

create or replace function public.enforce_merchant_staff_limit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare staff_count integer;
begin
  if new.role='owner' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.merchant_id::text, 9281));
  select count(*) into staff_count from public.merchant_memberships
  where merchant_id=new.merchant_id and role<>'owner' and id<>new.id
    and (status in ('pending','active','suspended'))
    and (invitation_expires_at is null or invitation_expires_at>now() or status<>'pending');
  if staff_count>=4 then raise exception using errcode='P0001',message='A merchant may have no more than four staff accounts'; end if;
  return new;
end $$;
drop trigger if exists merchant_staff_limit on public.merchant_memberships;
create trigger merchant_staff_limit before insert or update on public.merchant_memberships
for each row execute function public.enforce_merchant_staff_limit();

create or replace function public.request_source_ip()
returns inet language plpgsql stable security definer set search_path=public,pg_temp as $$
declare headers jsonb; raw_ip text;
begin
  begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb; exception when others then return null; end;
  raw_ip:=nullif(headers->>'cf-connecting-ip','');
  if raw_ip is null then return null; end if;
  begin return raw_ip::inet; exception when others then return null; end;
end $$;

create or replace function public.user_has_verified_mfa(p_user_id uuid)
returns boolean language sql stable security definer set search_path=auth,public,pg_temp as $$
  select p_user_id=auth.uid()
    and exists(select 1 from auth.mfa_factors where user_id=p_user_id and status='verified');
$$;

create or replace function public.merchant_role_for(p_merchant_id uuid,p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path=public,pg_temp as $$
  select case when p_user_id is distinct from auth.uid() then null
    when p_user_id=p_merchant_id then 'owner'
    else (select role from public.merchant_memberships where merchant_id=p_merchant_id and user_id=p_user_id and status='active' limit 1) end;
$$;

create or replace function public.merchant_network_allowed(p_merchant_id uuid,p_ip inet default public.request_source_ip())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case when not coalesce((select network_restrictions_enabled from public.merchant_security_settings where merchant_id=p_merchant_id),false) then true
    when p_ip is null then false
    else exists(select 1 from public.merchant_approved_networks where merchant_id=p_merchant_id and p_ip <<= network) end;
$$;

create or replace function public.merchant_portal_allowed(p_merchant_id uuid,p_permission text default 'operations')
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); actor_role text; enrolled boolean; aal text:=coalesce(auth.jwt()->>'aal','aal1');
begin
  if uid is null then return false; end if;
  actor_role:=public.merchant_role_for(p_merchant_id,uid);
  if actor_role is null then return false; end if;
  if actor_role='staff' and p_permission in ('tax','kyc','security','api','staff') then return false; end if;
  enrolled:=public.user_has_verified_mfa(uid);
  if actor_role='staff' and (not enrolled or aal<>'aal2') then return false; end if;
  if enrolled and aal<>'aal2' then return false; end if;
  return public.merchant_network_allowed(p_merchant_id);
end $$;

create or replace function public.get_my_merchant_security_context()
returns table(merchant_id uuid,actor_role text,membership_status text,network_restrictions_enabled boolean,current_ip text,network_allowed boolean,mfa_enrolled boolean,current_aal text,access_allowed boolean)
language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare uid uuid:=auth.uid(); mid uuid; r text; s text; ip inet; enrolled boolean; aal text;
begin
  if uid is null then return; end if;
  select x.merchant_id,x.role,x.status into mid,r,s from (
    select m.merchant_id,'owner'::text role,'active'::text status,0 priority from public.merchants m where m.merchant_id=uid
    union all
    select mm.merchant_id,mm.role,mm.status,1 from public.merchant_memberships mm where mm.user_id=uid
  ) x order by x.priority limit 1;
  if mid is null then return; end if;
  ip:=public.request_source_ip(); enrolled:=public.user_has_verified_mfa(uid); aal:=coalesce(auth.jwt()->>'aal','aal1');
  return query select mid,r,s,coalesce(ms.network_restrictions_enabled,false),ip::text,public.merchant_network_allowed(mid,ip),enrolled,aal,
    s='active' and (r<>'staff' or (enrolled and aal='aal2')) and (not enrolled or aal='aal2') and public.merchant_network_allowed(mid,ip)
  from public.merchant_security_settings ms where ms.merchant_id=mid;
end $$;

create or replace function public.activate_my_staff_membership()
returns boolean language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare changed integer;
begin
  update public.merchant_memberships set status='active'
  where user_id=auth.uid() and lower(email)=lower(coalesce(auth.jwt()->>'email','')) and status='pending'
    and invitation_expires_at>now();
  get diagnostics changed=row_count; return changed>0;
end $$;

alter table public.merchant_memberships enable row level security;
alter table public.merchant_security_settings enable row level security;
alter table public.merchant_approved_networks enable row level security;
alter table public.merchant_action_approvals enable row level security;
alter table public.merchant_security_audit enable row level security;

create policy merchant_memberships_owner_admin_read on public.merchant_memberships for select to authenticated
using (public.merchant_role_for(merchant_id) in ('owner','admin'));
create policy merchant_memberships_self_read on public.merchant_memberships for select to authenticated using (user_id=auth.uid());
create policy merchant_security_settings_owner_admin_read on public.merchant_security_settings for select to authenticated
using (public.merchant_role_for(merchant_id) in ('owner','admin'));
create policy merchant_networks_owner_admin_read on public.merchant_approved_networks for select to authenticated
using (public.merchant_role_for(merchant_id) in ('owner','admin'));
create policy merchant_security_audit_owner_admin_read on public.merchant_security_audit for select to authenticated
using (public.merchant_role_for(merchant_id) in ('owner','admin'));

revoke all on public.merchant_memberships,public.merchant_security_settings,public.merchant_approved_networks,public.merchant_action_approvals,public.merchant_security_audit from anon;
grant select on public.merchant_memberships,public.merchant_security_settings,public.merchant_approved_networks,public.merchant_security_audit to authenticated;
revoke insert,update,delete on public.merchant_memberships,public.merchant_security_settings,public.merchant_approved_networks from authenticated;
revoke all on public.merchant_action_approvals from authenticated;
revoke insert,update,delete on public.merchant_security_audit from anon,authenticated;
revoke all on function public.enforce_merchant_staff_limit() from public;
grant execute on function public.request_source_ip(),public.user_has_verified_mfa(uuid),public.merchant_role_for(uuid,uuid),public.merchant_network_allowed(uuid,inet),public.merchant_portal_allowed(uuid,text),public.get_my_merchant_security_context(),public.activate_my_staff_membership() to authenticated;

commit;
