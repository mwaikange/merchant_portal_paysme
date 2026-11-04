CREATE TABLE public.lesaka_integration_modes (
 merchant_id uuid PRIMARY KEY REFERENCES public.merchants(merchant_id),
 environment text NOT NULL DEFAULT 'staging' CHECK(environment IN ('staging','production')),
 production_approved_at timestamptz,
 uat_completed_at timestamptz,
 approval_reference text,
 inventory_source_sha256 text CHECK(inventory_source_sha256 ~ '^[a-f0-9]{64}$'),
 CHECK(environment='staging' OR production_approved_at IS NOT NULL)
);
INSERT INTO public.lesaka_integration_modes(merchant_id) SELECT DISTINCT merchant_id FROM public.lesaka_merchant_credentials WHERE environment='staging' ON CONFLICT DO NOTHING;
ALTER TABLE public.lesaka_uat_campaigns ADD COLUMN customer_cycle integer CHECK(customer_cycle BETWEEN 1 AND 3), ADD COLUMN customer_until timestamptz;
CREATE TABLE public.lesaka_uat_customer_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.lesaka_uat_campaigns(id),
 merchant_id uuid NOT NULL REFERENCES public.merchants(merchant_id),
 cycle integer NOT NULL CHECK(cycle BETWEEN 1 AND 3),
 transaction_id varchar NOT NULL REFERENCES public.transactions(transaction_id),
 generated_code text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('sdk','hosted')),
 fixture_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 outcome text NOT NULL DEFAULT 'running' CHECK(outcome IN ('running','tested','rejected','uncertain','error','resolved')),
 message text NOT NULL DEFAULT '',
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(evidence)='array'),
 FOREIGN KEY(campaign_id,fixture_id) REFERENCES public.lesaka_uat_inventory(campaign_id,id)
);
CREATE INDEX lesaka_customer_campaign_idx ON public.lesaka_uat_customer_attempts(campaign_id,created_at);
CREATE INDEX lesaka_customer_transaction_idx ON public.lesaka_uat_customer_attempts(transaction_id,created_at);
ALTER TABLE public.lesaka_integration_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesaka_uat_customer_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesaka_integration_modes,public.lesaka_uat_customer_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.lesaka_integration_modes TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.lesaka_uat_customer_attempts TO service_role;
ALTER TABLE public.transactions ADD COLUMN is_test boolean NOT NULL DEFAULT false, ADD COLUMN test_provider text, ADD COLUMN test_session_id uuid;
CREATE INDEX transactions_test_session_idx ON public.transactions(test_session_id) WHERE is_test;
CREATE FUNCTION public.protect_test_transaction() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
 IF OLD.is_test AND (NOT NEW.is_test OR NEW.test_session_id IS DISTINCT FROM OLD.test_session_id OR NEW.test_provider IS DISTINCT FROM OLD.test_provider) THEN RAISE EXCEPTION 'Test checkouts cannot be promoted to live'; END IF;
 END IF;
 IF NEW.is_test AND (NEW.status='paid' OR NEW.finalized IS TRUE OR coalesce(NEW.amount_paid,0)>0) THEN RAISE EXCEPTION 'Test checkouts cannot settle live payments'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_test_transaction() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_test_transaction BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.protect_test_transaction();
CREATE FUNCTION public.lesaka_passed_guide_cases(p_campaign uuid) RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT count(*)::integer FROM generate_series(1,3) c CROSS JOIN unnest(ARRAY['TC-STAT-01','TC-STAT-02','TC-STAT-03','TC-STAT-04','TC-STAT-05','TC-RED-01','TC-RED-02','TC-RED-03','TC-RED-04','TC-RED-05','TC-EDGE-01','TC-EDGE-02']) k
 WHERE (SELECT verdict FROM public.lesaka_uat_executions WHERE campaign_id=p_campaign AND cycle=c AND case_id=k ORDER BY started_at DESC,id DESC LIMIT 1)='pass';
$$;
REVOKE ALL ON FUNCTION public.lesaka_passed_guide_cases(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lesaka_passed_guide_cases(uuid) TO service_role;
CREATE FUNCTION public.purge_lesaka_uat_campaign(p_campaign uuid,p_merchant uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.lesaka_uat_campaigns WHERE id=p_campaign AND merchant_id=p_merchant AND (customer_until IS NULL OR customer_until<=now()) FOR UPDATE) THEN RAISE EXCEPTION 'Stop customer checkout testing before cleanup'; END IF;
 IF EXISTS(SELECT 1 FROM public.lesaka_uat_executions WHERE campaign_id=p_campaign AND verdict IN ('running','uncertain')) OR EXISTS(SELECT 1 FROM public.lesaka_uat_customer_attempts WHERE campaign_id=p_campaign AND outcome IN ('running','uncertain')) THEN RAISE EXCEPTION 'Resolve running or uncertain results before cleanup'; END IF;
 IF public.lesaka_passed_guide_cases(p_campaign)=36 THEN UPDATE public.lesaka_integration_modes SET uat_completed_at=coalesce(uat_completed_at,now()) WHERE merchant_id=p_merchant; END IF;
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
REVOKE ALL ON FUNCTION public.purge_lesaka_uat_campaign(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_lesaka_uat_campaign(uuid,uuid) TO service_role;
GRANT DELETE ON public.lesaka_uat_campaigns,public.lesaka_uat_inventory,public.lesaka_uat_executions,public.lesaka_uat_notes TO service_role;
ALTER TABLE public.lesaka_uat_executions ADD COLUMN origin text NOT NULL DEFAULT 'portal' CHECK(origin IN ('portal','checkout')), ADD COLUMN customer_attempt_id uuid REFERENCES public.lesaka_uat_customer_attempts(id) ON DELETE SET NULL;
GRANT DELETE ON public.lesaka_voucher_attempts TO service_role;
CREATE FUNCTION public.set_lesaka_environment(p_merchant uuid,p_environment text,p_reference text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
 IF m.uat_completed_at IS NULL AND m.production_approved_at IS NULL AND (c IS NULL OR public.lesaka_passed_guide_cases(c)<>36) THEN RAISE EXCEPTION 'All twelve guide cases must pass in each of three cycles'; END IF;
 IF c IS NOT NULL THEN UPDATE public.lesaka_uat_campaigns SET customer_until=NULL WHERE id=c; PERFORM public.purge_lesaka_uat_campaign(c,p_merchant); END IF;
 UPDATE public.lesaka_integration_modes SET environment='production',production_approved_at=coalesce(production_approved_at,now()),approval_reference=trim(p_reference) WHERE merchant_id=p_merchant;
END;
$$;
REVOKE ALL ON FUNCTION public.set_lesaka_environment(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_lesaka_environment(uuid,text,text) TO service_role;
