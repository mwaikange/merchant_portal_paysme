-- Do not update legacy test transactions while closing UAT sessions. Their
-- status trigger validates an obsolete bulk-subscriber state; preserve the
-- transactions and close sessions only through customer_until.
CREATE OR REPLACE FUNCTION public.set_lesaka_environment(p_merchant uuid,p_environment text,p_reference text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $$
DECLARE
 c uuid;
 m public.lesaka_integration_modes;
BEGIN
 IF p_environment NOT IN ('staging','production') THEN RAISE EXCEPTION 'Invalid environment'; END IF;
 SELECT * INTO m FROM public.lesaka_integration_modes WHERE merchant_id=p_merchant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lesaka setup is required'; END IF;
 IF EXISTS(SELECT 1 FROM public.lesaka_voucher_attempts WHERE merchant_id=p_merchant AND status IN ('redeeming','uncertain','redeemed','reconciliation_required')) THEN
  RAISE EXCEPTION 'Resolve pending Lesaka payments before switching';
 END IF;
 IF p_environment='staging' THEN
  UPDATE public.lesaka_integration_modes SET environment='staging' WHERE merchant_id=p_merchant;
  RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lesaka_merchant_credentials WHERE merchant_id=p_merchant AND environment='production') THEN
  RAISE EXCEPTION 'Save live credentials first';
 END IF;
 SELECT id INTO c FROM public.lesaka_uat_campaigns WHERE merchant_id=p_merchant ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF m.uat_completed_at IS NULL AND m.production_approved_at IS NULL AND (c IS NULL OR public.lesaka_passed_workbook_cases(c)<>51) THEN
  RAISE EXCEPTION 'Complete the required workbook cases or record production approval for this merchant';
 END IF;
 IF c IS NOT NULL AND (
  EXISTS(SELECT 1 FROM public.lesaka_uat_executions WHERE campaign_id=c AND verdict IN ('running','uncertain')) OR
  EXISTS(SELECT 1 FROM public.lesaka_uat_customer_attempts WHERE campaign_id=c AND outcome IN ('running','uncertain'))
 ) THEN
  RAISE EXCEPTION 'Resolve running or uncertain staging tests before switching';
 END IF;
 -- Close customer testing for this merchant without deleting or rewriting its evidence.
 UPDATE public.lesaka_uat_campaigns SET customer_until=NULL WHERE merchant_id=p_merchant;
 UPDATE public.lesaka_integration_modes
  SET environment='production',
      production_approved_at=coalesce(production_approved_at,now()),
      approval_reference=coalesce(nullif(trim(coalesce(p_reference,'')),''),approval_reference)
  WHERE merchant_id=p_merchant;
END;
$$;
