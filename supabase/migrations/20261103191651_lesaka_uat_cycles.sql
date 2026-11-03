-- Private staging evidence. Browser access is through the authenticated UAT function only.
CREATE TABLE public.lesaka_uat_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(merchant_id),
  credential_version uuid NOT NULL,
  UNIQUE (merchant_id, credential_version),
  environment text NOT NULL DEFAULT 'staging' CHECK (environment = 'staging'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  title text NOT NULL DEFAULT 'Lesaka integration UAT',
  inventory_sha256 text CHECK (inventory_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE INDEX lesaka_uat_campaign_merchant_idx ON public.lesaka_uat_campaigns(merchant_id, created_at DESC);

CREATE TABLE public.lesaka_uat_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.lesaka_uat_campaigns(id),
  fixture_id text NOT NULL,
  value_minor integer NOT NULL CHECK (value_minor > 0),
  serial_number text NOT NULL CHECK (serial_number ~ '^[0-9]{12}$'),
  pin_fingerprint text NOT NULL CHECK (pin_fingerprint ~ '^[a-f0-9]{64}$'),
  allocation text NOT NULL CHECK (allocation IN ('automated', 'manual')),
  encrypted_pin jsonb,
  source_line integer NOT NULL CHECK (source_line > 0),
  observed_state text,
  locked_by uuid,
  CHECK ((allocation = 'manual' AND encrypted_pin IS NULL) OR
    (allocation = 'automated' AND jsonb_typeof(encrypted_pin) = 'object' AND encrypted_pin ?& ARRAY['iv','ciphertext'])),
  UNIQUE (campaign_id, fixture_id), UNIQUE (campaign_id, pin_fingerprint), UNIQUE (campaign_id, serial_number),
  UNIQUE (campaign_id, id)
);

CREATE TABLE public.lesaka_uat_executions (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.lesaka_uat_campaigns(id),
  cycle integer NOT NULL CHECK (cycle BETWEEN 1 AND 3),
  case_id text NOT NULL CHECK (case_id ~ '^TC-(VS|VR|STAT|RED|EDGE)-[0-9]{2,3}$'),
  fixture_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('automated','manual')),
  actor_user_id uuid REFERENCES auth.users(id),
  client_reference text NOT NULL,
  request_time timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  lease_time timestamptz NOT NULL DEFAULT now(),
  redemption_started boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  verdict text NOT NULL CHECK (verdict IN ('running','pass','fail','review','blocked','uncertain','error')),
  reason text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  replay_of uuid REFERENCES public.lesaka_uat_executions(id),
  FOREIGN KEY (campaign_id,fixture_id) REFERENCES public.lesaka_uat_inventory(campaign_id,id)
);
CREATE UNIQUE INDEX lesaka_uat_one_running_per_campaign ON public.lesaka_uat_executions(campaign_id) WHERE verdict = 'running';
CREATE INDEX lesaka_uat_result_lookup_idx ON public.lesaka_uat_executions(campaign_id,cycle,case_id,started_at DESC);
ALTER TABLE public.lesaka_uat_inventory ADD CONSTRAINT lesaka_uat_inventory_lock_fk FOREIGN KEY (locked_by) REFERENCES public.lesaka_uat_executions(id);

CREATE TABLE public.lesaka_uat_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.lesaka_uat_executions(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL CHECK (length(note) BETWEEN 1 AND 2000)
);
CREATE INDEX lesaka_uat_notes_execution_idx ON public.lesaka_uat_notes(execution_id);

ALTER TABLE public.lesaka_uat_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesaka_uat_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesaka_uat_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesaka_uat_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesaka_uat_campaigns,public.lesaka_uat_inventory,public.lesaka_uat_executions,public.lesaka_uat_notes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.lesaka_uat_campaigns,public.lesaka_uat_inventory,public.lesaka_uat_executions TO service_role;
GRANT SELECT,INSERT ON public.lesaka_uat_notes TO service_role;

-- Atomic import: manual PINs are not stored; no denomination may allocate more than its first half to automation.
CREATE FUNCTION public.import_lesaka_uat_inventory(p_campaign uuid,p_sha256 text,p_items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lesaka_uat_inventory WHERE campaign_id=p_campaign) THEN
    RAISE EXCEPTION 'Inventory already imported';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Invalid inventory';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) item GROUP BY (item->>'value_minor')
    HAVING count(*) FILTER (WHERE item->>'allocation'='automated') <> floor(count(*)::numeric/2)) THEN
    RAISE EXCEPTION 'Half the inventory must remain reserved for manual testing';
  END IF;
  INSERT INTO public.lesaka_uat_inventory(campaign_id,fixture_id,value_minor,serial_number,pin_fingerprint,allocation,encrypted_pin,source_line)
  SELECT p_campaign,item->>'fixture_id',(item->>'value_minor')::integer,item->>'serial_number',item->>'pin_fingerprint',item->>'allocation',
    CASE WHEN item->>'allocation'='automated' THEN item->'encrypted_pin' ELSE NULL END,(item->>'source_line')::integer
  FROM jsonb_array_elements(p_items) item;
  UPDATE public.lesaka_uat_campaigns SET inventory_sha256=p_sha256 WHERE id=p_campaign;
END;
$$;
REVOKE ALL ON FUNCTION public.import_lesaka_uat_inventory(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_lesaka_uat_inventory(uuid,text,jsonb) TO service_role;
COMMENT ON TABLE public.lesaka_uat_executions IS 'Staging-only test evidence, independent of transactions, balances, SMS and merchant payment webhooks. Review/blocked/uncertain results cannot complete a test cycle.';
