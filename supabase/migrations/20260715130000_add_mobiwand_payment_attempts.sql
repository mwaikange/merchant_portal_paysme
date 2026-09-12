-- Shared MobiWand gateway state for MTC Maris and PayPulse.
-- Partner credentials remain Supabase secrets; only the non-secret partner code is
-- stored with an attempt for auditing and callback verification.

CREATE TABLE IF NOT EXISTS public.mobiwand_payment_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR NOT NULL REFERENCES public.transactions(transaction_id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE CASCADE,
  facilitator_id UUID NOT NULL REFERENCES public.facilitators(facilitator_id) ON DELETE RESTRICT,
  provider_key TEXT NOT NULL,
  partner_code TEXT NOT NULL,
  merchant_code TEXT NOT NULL,
  merchant_transaction_number TEXT NOT NULL,
  tracking_id TEXT NOT NULL UNIQUE,
  initiate_transaction_number TEXT NOT NULL,
  payment_transaction_number TEXT,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NAD',
  mobile_number TEXT NOT NULL,
  origin_url TEXT,
  status TEXT NOT NULL DEFAULT 'initiated',
  provider_status TEXT,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mobiwand_payment_attempts_provider_check
    CHECK (provider_key IN ('mtc_maris', 'paypulse')),
  CONSTRAINT mobiwand_payment_attempts_status_check
    CHECK (status IN ('initiated', 'processing', 'paid', 'failed', 'cancelled', 'timed_out')),
  CONSTRAINT mobiwand_payment_attempts_amount_check
    CHECK (amount > 0),
  CONSTRAINT mobiwand_payment_attempts_currency_check
    CHECK (currency = 'NAD')
);

CREATE INDEX IF NOT EXISTS idx_mobiwand_attempts_transaction
  ON public.mobiwand_payment_attempts(transaction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mobiwand_attempts_merchant
  ON public.mobiwand_payment_attempts(merchant_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_mobiwand_payment_attempts_updated_at ON public.mobiwand_payment_attempts;
CREATE TRIGGER trg_mobiwand_payment_attempts_updated_at
BEFORE UPDATE ON public.mobiwand_payment_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.mobiwand_payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to MobiWand attempts" ON public.mobiwand_payment_attempts;
CREATE POLICY "Service role full access to MobiWand attempts"
ON public.mobiwand_payment_attempts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.mobiwand_payment_attempts IS
  'Server-side MobiWand handoff and callback state for MTC Maris and PayPulse payments.';

COMMENT ON COLUMN public.mobiwand_payment_attempts.merchant_transaction_number IS
  'The PaySME generated code supplied to MobiWand; never the merchant invoice number.';
