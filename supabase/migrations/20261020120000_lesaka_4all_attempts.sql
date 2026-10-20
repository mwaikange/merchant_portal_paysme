-- Durable references must be recorded BEFORE redeeming a full-value voucher.
-- PINs and provider authentication credentials are deliberately never stored.
CREATE TABLE IF NOT EXISTS public.lesaka_voucher_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id varchar NOT NULL REFERENCES public.transactions(transaction_id),
  merchant_id uuid NOT NULL REFERENCES public.merchants(merchant_id),
  facilitator_id uuid NOT NULL REFERENCES public.facilitators(facilitator_id),
  merchant_code text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  voucher_fingerprint text NOT NULL CHECK (voucher_fingerprint ~ '^[a-f0-9]{64}$'),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'NAD' CHECK (currency = 'NAD'),
  request_time timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'redeeming'
    CHECK (status IN ('redeeming', 'uncertain', 'redeemed', 'paid', 'tested', 'reconciliation_required')),
  provider_transaction_id uuid,
  error_code text,
  trace_id text,
  completed_at timestamptz,
  -- An uncertain result never creates a second redemption reference.
  UNIQUE (transaction_id, environment),
  UNIQUE (voucher_fingerprint, environment)
);

ALTER TABLE public.lesaka_voucher_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesaka_voucher_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lesaka_voucher_attempts TO service_role;

COMMENT ON TABLE public.lesaka_voucher_attempts IS
  'Server-only Lesaka 4All redemption references. Uncertain outcomes retain their reference; staging never marks real transactions paid.';
