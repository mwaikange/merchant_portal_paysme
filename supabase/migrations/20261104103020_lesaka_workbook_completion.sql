-- Completion is defined by the 18 cases in Lesaka's supplied Excel, repeated for 3 cycles.
ALTER TABLE public.lesaka_uat_executions
 ADD COLUMN assessment_history jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD COLUMN source_execution_id uuid REFERENCES public.lesaka_uat_executions(id) ON DELETE SET NULL;
CREATE INDEX lesaka_uat_source_execution_idx ON public.lesaka_uat_executions(source_execution_id) WHERE source_execution_id IS NOT NULL;
CREATE FUNCTION public.lesaka_passed_workbook_cases(p_campaign uuid) RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT count(*)::integer FROM generate_series(1,3) c CROSS JOIN unnest(ARRAY['TC-VS-001','TC-VS-002','TC-VS-003','TC-VS-004','TC-VS-005','TC-VS-006','TC-VS-007','TC-VS-008','TC-VS-009','TC-VS-010','TC-VR-001','TC-VR-002','TC-VR-003','TC-VR-004','TC-VR-005','TC-VR-006','TC-VR-007','TC-VR-008']) k
 WHERE (SELECT verdict FROM public.lesaka_uat_executions WHERE campaign_id=p_campaign AND cycle=c AND case_id=k ORDER BY started_at DESC,id DESC LIMIT 1)='pass';
$$;
REVOKE ALL ON FUNCTION public.lesaka_passed_workbook_cases(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lesaka_passed_workbook_cases(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.purge_lesaka_uat_campaign(p_campaign uuid,p_merchant uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.lesaka_uat_campaigns WHERE id=p_campaign AND merchant_id=p_merchant AND (customer_until IS NULL OR customer_until<=now()) FOR UPDATE) THEN RAISE EXCEPTION 'Stop customer checkout testing before cleanup'; END IF;
 IF EXISTS(SELECT 1 FROM public.lesaka_uat_executions WHERE campaign_id=p_campaign AND verdict IN ('running','uncertain')) OR EXISTS(SELECT 1 FROM public.lesaka_uat_customer_attempts WHERE campaign_id=p_campaign AND outcome IN ('running','uncertain')) THEN RAISE EXCEPTION 'Resolve running or uncertain results before cleanup'; END IF;
 IF public.lesaka_passed_workbook_cases(p_campaign)=54 THEN UPDATE public.lesaka_integration_modes SET uat_completed_at=coalesce(uat_completed_at,now()) WHERE merchant_id=p_merchant; END IF;
 UPDATE public.transactions SET status='cancelled' WHERE is_test AND test_provider='lesaka' AND test_session_id=p_campaign AND merchant_id=p_merchant AND status='pending';
 DELETE FROM public.lesaka_voucher_attempts WHERE environment='staging' AND merchant_id=p_merchant AND transaction_id IN (SELECT transaction_id FROM public.transactions WHERE is_test AND test_session_id=p_campaign);
 DELETE FROM public.lesaka_uat_customer_attempts WHERE campaign_id=p_campaign;
 DELETE FROM public.lesaka_uat_notes WHERE execution_id IN (SELECT id FROM public.lesaka_uat_executions WHERE campaign_id=p_campaign);
 UPDATE public.lesaka_uat_inventory SET locked_by=NULL WHERE campaign_id=p_campaign;
 UPDATE public.lesaka_uat_executions SET replay_of=NULL WHERE campaign_id=p_campaign;
 DELETE FROM public.lesaka_uat_executions WHERE campaign_id=p_campaign;
 DELETE FROM public.lesaka_uat_inventory WHERE campaign_id=p_campaign;
 DELETE FROM public.lesaka_uat_campaigns WHERE id=p_campaign AND merchant_id=p_merchant;
END;
$$;
CREATE OR REPLACE FUNCTION public.set_lesaka_environment(p_merchant uuid,p_environment text,p_reference text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c uuid; m public.lesaka_integration_modes;
BEGIN
 IF p_environment NOT IN ('staging','production') THEN RAISE EXCEPTION 'Invalid environment'; END IF;
 SELECT * INTO m FROM public.lesaka_integration_modes WHERE merchant_id=p_merchant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lesaka setup is required'; END IF;
 IF EXISTS(SELECT 1 FROM public.lesaka_voucher_attempts WHERE merchant_id=p_merchant AND status IN ('redeeming','uncertain','redeemed','reconciliation_required')) THEN RAISE EXCEPTION 'Resolve pending Lesaka payments before switching'; END IF;
 IF p_environment='staging' THEN
  UPDATE public.lesaka_integration_modes SET environment='staging' WHERE merchant_id=p_merchant; RETURN;
 END IF;
 IF length(trim(coalesce(p_reference,''))) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Lesaka approval reference is required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lesaka_merchant_credentials WHERE merchant_id=p_merchant AND environment='production') THEN RAISE EXCEPTION 'Save live credentials first'; END IF;
 SELECT id INTO c FROM public.lesaka_uat_campaigns WHERE merchant_id=p_merchant ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF m.uat_completed_at IS NULL AND m.production_approved_at IS NULL AND (c IS NULL OR public.lesaka_passed_workbook_cases(c)<>54) THEN RAISE EXCEPTION 'All eighteen Excel workbook cases must pass in each of three cycles'; END IF;
 IF c IS NOT NULL THEN UPDATE public.lesaka_uat_campaigns SET customer_until=NULL WHERE id=c; PERFORM public.purge_lesaka_uat_campaign(c,p_merchant); END IF;
 UPDATE public.lesaka_integration_modes SET environment='production',production_approved_at=coalesce(production_approved_at,now()),approval_reference=trim(p_reference) WHERE merchant_id=p_merchant;
END;
$$;
