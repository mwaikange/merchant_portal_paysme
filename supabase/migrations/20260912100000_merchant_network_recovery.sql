begin;

-- Support-only recovery for an organisation accidentally locked out by its
-- approved-network policy. Ownership verification happens in the support
-- process; this function requires an active PaySME administrator and records
-- the support reference in the immutable merchant security audit.
create or replace function public.paysme_support_recover_merchant_network(
  p_merchant_id uuid,
  p_support_user_id uuid,
  p_support_reference text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  support_is_authorised boolean;
  affected integer;
begin
  if nullif(trim(p_support_reference), '') is null then
    raise exception using errcode = '22023', message = 'A verified support reference is required';
  end if;

  select exists (
    select 1
    from public.admin_users
    where auth_user_id = p_support_user_id
      and is_active = true
  ) into support_is_authorised;

  if not support_is_authorised then
    raise exception using errcode = '42501', message = 'An active PaySME administrator is required';
  end if;

  update public.merchant_security_settings
     set network_restrictions_enabled = false,
         updated_by = p_support_user_id,
         updated_at = now()
   where merchant_id = p_merchant_id;
  get diagnostics affected = row_count;

  if affected <> 1 then
    raise exception using errcode = 'P0002', message = 'Merchant security settings were not found';
  end if;

  insert into public.merchant_security_audit (
    merchant_id, actor_user_id, action, result, source_ip, summary
  ) values (
    p_merchant_id,
    p_support_user_id,
    'network.support_recovery',
    'success',
    public.request_source_ip(),
    jsonb_build_object(
      'support_reference', left(trim(p_support_reference), 120),
      'change', 'network restrictions disabled after verified ownership recovery'
    )
  );

  return true;
end;
$$;

revoke all on function public.paysme_support_recover_merchant_network(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.paysme_support_recover_merchant_network(uuid, uuid, text) to service_role;

commit;
