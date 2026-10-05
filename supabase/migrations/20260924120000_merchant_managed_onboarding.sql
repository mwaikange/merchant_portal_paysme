-- Managed merchant onboarding, renewals, notices, commercial terms and audit trail.
-- Existing subscription rows are deliberately left untouched.

create extension if not exists pgcrypto;

-- Public pricing is a preference at first contact, not a self-service purchase.
alter table public.merchant_waitlist add column if not exists preferred_package text;
alter table public.merchant_waitlist add column if not exists preferred_duration_months integer;
alter table public.merchant_waitlist add constraint merchant_interest_duration_check check (preferred_duration_months is null or preferred_duration_months in (6, 12));

create table if not exists public.merchant_onboarding_cases (
  case_id uuid primary key default gen_random_uuid(),
  case_reference text not null unique default ('ONB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  case_type text not null check (case_type in ('initial', 'renewal')),
  merchant_id uuid references public.merchants(merchant_id) on delete restrict,
  waitlist_id uuid references public.merchant_waitlist(waitlist_id) on delete set null,
  source_subscription_id uuid references public.subscriptions(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'commercial_setup', 'ready_to_activate', 'activated', 'cancelled')),
  current_stage text not null default 'interest_received',
  initiated_by_type text not null check (initiated_by_type in ('merchant', 'admin', 'system')),
  initiated_by uuid,
  initiated_at timestamptz not null default now(),
  activated_at timestamptz,
  activated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merchant_onboarding_events (
  event_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.merchant_onboarding_cases(case_id) on delete cascade,
  stage text not null check (stage in ('interest_received','sales_call_completed','nda_signed','portal_demo_completed','commercial_review','merchant_services_agreement_signed','commercial_setup','billing_mandate_completed','merchant_activated')),
  completed boolean not null default false,
  completed_at timestamptz,
  responsible_admin_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_id, stage)
);

create table if not exists public.merchant_documents (
  document_id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.merchant_onboarding_cases(case_id) on delete cascade,
  merchant_id uuid references public.merchants(merchant_id) on delete restrict,
  document_type text not null check (document_type in ('nda','merchant_services_agreement','billing_mandate','other')),
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  agreement_version text,
  signed_at timestamptz,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_document_id uuid references public.merchant_documents(document_id) on delete set null
);

create table if not exists public.merchant_commercial_terms (
  commercial_terms_id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.merchant_onboarding_cases(case_id) on delete restrict,
  merchant_id uuid not null references public.merchants(merchant_id) on delete restrict,
  package text not null check (package in ('starter','growth','scale','corporate','custom')),
  monthly_subscription_fee numeric(12,2) not null check (monthly_subscription_fee >= 0),
  transaction_fee_percent numeric(6,3) not null check (transaction_fee_percent >= 0),
  contract_start_date date not null,
  contract_duration_months integer not null check (contract_duration_months in (3,6,12)),
  contract_end_date date not null,
  billing_frequency text not null default 'monthly' check (billing_frequency in ('monthly','upfront','sponsored')),
  billing_amount numeric(12,2) not null check (billing_amount >= 0),
  is_sponsorship boolean not null default false,
  override_applied boolean not null default false,
  override_reason text,
  override_authorised_by uuid,
  override_authorised_at timestamptz,
  configured_by uuid not null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint three_month_admin_sponsorship_only check (contract_duration_months <> 3 or (is_sponsorship and billing_frequency = 'sponsored')),
  constraint override_requires_reason check (not override_applied or nullif(btrim(override_reason), '') is not null),
  constraint valid_contract_dates check (contract_end_date >= contract_start_date)
);

create table if not exists public.merchant_billing_mandates (
  mandate_id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.merchant_onboarding_cases(case_id) on delete restrict,
  merchant_id uuid not null references public.merchants(merchant_id) on delete restrict,
  billing_method text not null,
  collection_status text not null default 'pending' check (collection_status in ('pending','submitted','active','failed','cancelled','not_required')),
  account_holder text,
  bank_name text,
  masked_account_reference text,
  debit_day integer check (debit_day between 1 and 31),
  provider_name text,
  provider_mandate_reference text,
  mandate_status text,
  effective_date date,
  configured_by uuid not null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merchant_renewal_requests (
  renewal_request_id uuid primary key default gen_random_uuid(),
  request_reference text not null unique default ('REN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  merchant_id uuid not null references public.merchants(merchant_id) on delete restrict,
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  case_id uuid not null unique references public.merchant_onboarding_cases(case_id) on delete restrict,
  initiated_by_type text not null check (initiated_by_type in ('merchant','admin')),
  initiated_by uuid not null,
  status text not null default 'open' check (status in ('open','agreement_pending','ready_to_activate','completed','cancelled')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists merchant_renewal_one_open_per_subscription
  on public.merchant_renewal_requests(subscription_id)
  where status not in ('completed','cancelled');

create table if not exists public.merchant_renewal_email_alerts (
  renewal_request_id uuid primary key references public.merchant_renewal_requests(renewal_request_id) on delete cascade,
  status text not null check (status in ('sending','sent','failed')),
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  error_message text
);

create table if not exists public.admin_notices (
  notice_id uuid primary key default gen_random_uuid(),
  notice_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','urgent')),
  title text not null,
  message text not null,
  merchant_id uuid references public.merchants(merchant_id) on delete set null,
  case_id uuid references public.merchant_onboarding_cases(case_id) on delete set null,
  entity_type text,
  entity_id text,
  status text not null default 'unread' check (status in ('unread','read','resolved','dismissed')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid,
  resolved_at timestamptz,
  resolved_by uuid
);

create table if not exists public.platform_audit_events (
  audit_id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('merchant','admin','system','anonymous')),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  merchant_id uuid,
  case_id uuid,
  reference text,
  reason text,
  previous_values jsonb,
  new_values jsonb,
  source text,
  result text not null default 'success' check (result in ('success','failed','blocked')),
  details jsonb not null default '{}'::jsonb
);

create index if not exists platform_audit_events_occurred_idx on public.platform_audit_events(occurred_at desc);
create index if not exists platform_audit_events_merchant_idx on public.platform_audit_events(merchant_id, occurred_at desc);
create index if not exists admin_notices_status_idx on public.admin_notices(status, created_at desc);
create index if not exists onboarding_cases_merchant_idx on public.merchant_onboarding_cases(merchant_id, created_at desc);

create or replace function public.record_managed_merchant_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  kind text := 'system';
  payload jsonb;
  mid uuid;
  cid uuid;
  entity_key text;
begin
  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  mid := nullif(payload->>'merchant_id','')::uuid;
  cid := nullif(payload->>'case_id','')::uuid;
  entity_key := coalesce(payload->>'case_id', payload->>'event_id', payload->>'document_id', payload->>'commercial_terms_id', payload->>'mandate_id', payload->>'renewal_request_id', payload->>'notice_id');
  if uid is not null then
    kind := case when public.is_current_user_admin() then 'admin' else 'merchant' end;
  end if;
  insert into public.platform_audit_events(actor_type, actor_id, action, entity_type, entity_id, merchant_id, case_id, previous_values, new_values, source)
  values (kind, uid, lower(tg_op), tg_table_name, entity_key, mid, cid,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-paysme-source', 'database'));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['merchant_onboarding_cases','merchant_onboarding_events','merchant_documents','merchant_commercial_terms','merchant_billing_mandates','merchant_renewal_requests','admin_notices'] loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.record_managed_merchant_audit()', 'audit_' || t, t);
  end loop;
end $$;

create or replace function public.request_merchant_subscription_renewal(p_subscription_id uuid)
returns table(renewal_request_id uuid, request_reference text, case_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sub public.subscriptions%rowtype;
  new_case uuid;
  new_request uuid;
  new_reference text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into sub from public.subscriptions where id = p_subscription_id and user_id = uid for update;
  if not found then raise exception 'Subscription not found'; end if;
  if sub.status <> 'active' or sub.end_date is null then raise exception 'Only an active subscription can be renewed'; end if;
  if sub.end_date::date > current_date + 30 then raise exception 'Renewal opens 30 days before expiry'; end if;
  if sub.end_date::date < current_date then raise exception 'This subscription has expired; contact PaySME Admin'; end if;
  if exists(select 1 from public.merchant_renewal_requests r where r.subscription_id = sub.id and r.status not in ('completed','cancelled')) then
    raise exception 'A renewal request is already open';
  end if;

  insert into public.merchant_onboarding_cases(case_type, merchant_id, source_subscription_id, current_stage, initiated_by_type, initiated_by)
  values ('renewal', uid, sub.id, 'sales_call_completed', 'merchant', uid) returning merchant_onboarding_cases.case_id into new_case;
  insert into public.merchant_onboarding_events(case_id, stage, completed, completed_at, notes)
  values (new_case, 'interest_received', true, now(), 'Renewal initiated by merchant portal'),
         (new_case, 'sales_call_completed', false, null, 'Commercial renewal discussion required'),
         (new_case, 'commercial_review', false, null, 'Confirm package, fees and contract duration'),
         (new_case, 'merchant_services_agreement_signed', false, null, 'Upload the updated signed agreement');
  insert into public.merchant_renewal_requests(merchant_id, subscription_id, case_id, initiated_by_type, initiated_by)
  values (uid, sub.id, new_case, 'merchant', uid)
  returning merchant_renewal_requests.renewal_request_id, merchant_renewal_requests.request_reference into new_request, new_reference;
  insert into public.admin_notices(notice_type, severity, title, message, merchant_id, case_id, entity_type, entity_id)
  values ('renewal_requested', 'warning', 'Merchant renewal requested', 'A merchant initiated contract renewal. Start the sales call and updated agreement workflow.', uid, new_case, 'merchant_renewal_request', new_request::text);
  return query select new_request, new_reference, new_case;
end $$;

alter table public.merchant_onboarding_cases enable row level security;
alter table public.merchant_onboarding_events enable row level security;
alter table public.merchant_documents enable row level security;
alter table public.merchant_commercial_terms enable row level security;
alter table public.merchant_billing_mandates enable row level security;
alter table public.merchant_renewal_requests enable row level security;
alter table public.merchant_renewal_email_alerts enable row level security;
alter table public.admin_notices enable row level security;
alter table public.platform_audit_events enable row level security;

create policy renewal_merchant_read on public.merchant_renewal_requests for select to authenticated using (merchant_id = auth.uid());
create policy onboarding_case_merchant_read on public.merchant_onboarding_cases for select to authenticated using (merchant_id = auth.uid());
create policy onboarding_event_merchant_read on public.merchant_onboarding_events for select to authenticated using (exists(select 1 from public.merchant_onboarding_cases c where c.case_id = merchant_onboarding_events.case_id and c.merchant_id = auth.uid()));
create policy commercial_terms_merchant_read on public.merchant_commercial_terms for select to authenticated using (merchant_id = auth.uid());
create policy billing_mandate_merchant_read on public.merchant_billing_mandates for select to authenticated using (merchant_id = auth.uid());

do $$ declare t text; begin
  foreach t in array array['merchant_onboarding_cases','merchant_onboarding_events','merchant_documents','merchant_commercial_terms','merchant_billing_mandates','merchant_renewal_requests','merchant_renewal_email_alerts','admin_notices','platform_audit_events'] loop
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_role', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant execute on function public.request_merchant_subscription_renewal(uuid) to authenticated, service_role;
revoke all on function public.record_managed_merchant_audit() from public;

create or replace function public.create_onboarding_case_from_waitlist()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_case uuid;
begin
  if exists(select 1 from public.merchant_onboarding_cases where waitlist_id = new.waitlist_id and case_type = 'initial' and status <> 'cancelled') then return new; end if;
  insert into public.merchant_onboarding_cases(case_type, waitlist_id, current_stage, initiated_by_type)
  values ('initial', new.waitlist_id, 'interest_received', 'system') returning case_id into new_case;
  insert into public.merchant_onboarding_events(case_id, stage, completed, completed_at, notes)
  values (new_case, 'interest_received', true, coalesce(new.created_at, now()), 'Created from public merchant waitlist');
  insert into public.admin_notices(notice_type, severity, title, message, case_id, entity_type, entity_id)
  values ('merchant_interest_received', 'info', 'New merchant interest received', new.company_name || ' joined the PaySME merchant waitlist.', new_case, 'merchant_waitlist', new.waitlist_id::text);
  return new;
end $$;

drop trigger if exists create_onboarding_from_waitlist on public.merchant_waitlist;
create trigger create_onboarding_from_waitlist after insert on public.merchant_waitlist for each row execute function public.create_onboarding_case_from_waitlist();

with inserted as (
  insert into public.merchant_onboarding_cases(case_type, waitlist_id, current_stage, initiated_by_type, initiated_at)
  select 'initial', w.waitlist_id, 'interest_received', 'system', w.created_at
  from public.merchant_waitlist w
  where not exists(select 1 from public.merchant_onboarding_cases c where c.waitlist_id = w.waitlist_id and c.case_type = 'initial')
  returning case_id, waitlist_id, initiated_at
)
insert into public.merchant_onboarding_events(case_id, stage, completed, completed_at, notes)
select case_id, 'interest_received', true, initiated_at, 'Backfilled from public merchant waitlist' from inserted;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-onboarding-documents','merchant-onboarding-documents',false,15728640,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;


create or replace function public.complete_merchant_password_change()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('must_change_password', false),
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.complete_merchant_password_change() from public;
grant execute on function public.complete_merchant_password_change() to authenticated;
