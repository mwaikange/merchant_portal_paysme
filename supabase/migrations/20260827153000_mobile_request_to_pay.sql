-- Tracks SDK-initiated mobile Request-to-Pay operations separately from the
-- payment transaction itself. This gives the public SDK endpoint safe
-- idempotency, resend recovery, and rate-limit audit data without changing the
-- existing transaction/payment-confirmation flow.

CREATE TABLE IF NOT EXISTS public.mobile_request_to_pay (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  transaction_id text,
  invoice_id text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  customer_mobile text NOT NULL,
  customer_email text NOT NULL,
  customer_town text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'transaction_created', 'sms_sent', 'sms_failed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  sms_sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS mobile_request_to_pay_merchant_created_idx
  ON public.mobile_request_to_pay (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mobile_request_to_pay_transaction_idx
  ON public.mobile_request_to_pay (transaction_id)
  WHERE transaction_id IS NOT NULL;

ALTER TABLE public.mobile_request_to_pay ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.mobile_request_to_pay IS
  'Audit and idempotency records for PaySME.requestToPay SDK calls. Service-role access only.';

