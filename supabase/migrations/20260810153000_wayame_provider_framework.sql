-- Simulation-first WayaMe/IPN provider state. Merchant identity remains in the
-- existing merchant_payment_facilitators row (provider_key = 'wayame') and its
-- generic metadata JSONB field.

CREATE TABLE IF NOT EXISTS public.wayame_payment_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL REFERENCES public.transactions(transaction_id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE CASCADE,
  merchant_payment_facilitator_id UUID NOT NULL
    REFERENCES public.merchant_payment_facilitators(merchant_payment_facilitator_id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL UNIQUE,
  network_reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_status TEXT NOT NULL DEFAULT 'PENDING',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'NAD' CHECK (currency = 'NAD'),
  merchant_alias TEXT NOT NULL,
  merchant_code TEXT,
  qr_payload TEXT,
  app_intent TEXT,
  origin_url TEXT,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wayame_payment_attempts_status_check
    CHECK (status IN ('pending', 'paid', 'failed', 'declined', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_wayame_attempts_transaction
  ON public.wayame_payment_attempts(transaction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wayame_attempts_merchant_status
  ON public.wayame_payment_attempts(merchant_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_wayame_payment_attempts_updated_at ON public.wayame_payment_attempts;
CREATE TRIGGER trg_wayame_payment_attempts_updated_at
BEFORE UPDATE ON public.wayame_payment_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wayame_payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants can view own WayaMe attempts" ON public.wayame_payment_attempts;
CREATE POLICY "Merchants can view own WayaMe attempts"
ON public.wayame_payment_attempts
FOR SELECT TO authenticated
USING (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Service role manages WayaMe attempts" ON public.wayame_payment_attempts;
CREATE POLICY "Service role manages WayaMe attempts"
ON public.wayame_payment_attempts
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.wayame_payment_attempts IS
  'Normalised WayaMe/IPN payment-request state shared by simulation and future sponsor adapters.';
