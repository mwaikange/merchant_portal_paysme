-- Enforce one active PaySME portal tab/session per authenticated account.
-- The browser holds an origin Web Lock for same-browser tabs, while this
-- database lease prevents concurrent access from other browsers/devices.

create table if not exists public.account_session_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auth_session_id uuid not null,
  tab_id uuid not null,
  acquired_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.account_session_locks enable row level security;

revoke all on table public.account_session_locks from public, anon, authenticated;

create or replace function public.claim_account_session(
  p_session_id uuid,
  p_tab_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token_session_id uuid;
  v_claimed boolean := false;
begin
  if v_user_id is null or p_session_id is null or p_tab_id is null then
    return false;
  end if;

  begin
    v_token_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    return false;
  end;

  if v_token_session_id is null or v_token_session_id <> p_session_id then
    return false;
  end if;

  insert into public.account_session_locks (
    user_id,
    auth_session_id,
    tab_id,
    acquired_at,
    last_seen_at
  )
  values (
    v_user_id,
    p_session_id,
    p_tab_id,
    now(),
    now()
  )
  on conflict (user_id) do update
  set
    auth_session_id = excluded.auth_session_id,
    tab_id = excluded.tab_id,
    acquired_at = case
      when account_session_locks.auth_session_id = excluded.auth_session_id
       and account_session_locks.tab_id = excluded.tab_id
      then account_session_locks.acquired_at
      else now()
    end,
    last_seen_at = now()
  where
    account_session_locks.last_seen_at < now() - interval '90 seconds'
    or (
      account_session_locks.auth_session_id = excluded.auth_session_id
      and account_session_locks.tab_id = excluded.tab_id
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.release_account_session(
  p_session_id uuid,
  p_tab_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token_session_id uuid;
  v_released boolean := false;
begin
  if v_user_id is null or p_session_id is null or p_tab_id is null then
    return false;
  end if;

  begin
    v_token_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    return false;
  end;

  if v_token_session_id is null or v_token_session_id <> p_session_id then
    return false;
  end if;

  delete from public.account_session_locks
  where user_id = v_user_id
    and auth_session_id = p_session_id
    and tab_id = p_tab_id
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.claim_account_session(uuid, uuid) from public;
revoke all on function public.release_account_session(uuid, uuid) from public;
grant execute on function public.claim_account_session(uuid, uuid) to authenticated;
grant execute on function public.release_account_session(uuid, uuid) to authenticated;

comment on table public.account_session_locks is
  'Short-lived leases used to restrict each authenticated PaySME account to one active portal tab/device.';
