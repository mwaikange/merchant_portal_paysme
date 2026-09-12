-- Queue one pending merchant payout for every paid PaySME Vendor transaction.
-- This migration is safe to run after the merchant_payouts table migration.

ALTER TABLE public.merchant_payouts
  ADD COLUMN IF NOT EXISTS source_transaction_id TEXT;

DROP INDEX IF EXISTS public.idx_merchant_payouts_reference;

CREATE INDEX IF NOT EXISTS idx_merchant_payouts_reference
  ON public.merchant_payouts (payout_reference)
  WHERE payout_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_payouts_source_transaction
  ON public.merchant_payouts (source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_paysme_vendor_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross NUMERIC(14,2);
  v_fee NUMERIC(14,2);
  v_paid_date DATE;
BEGIN
  IF (
    (NEW.status = 'paid' OR NEW.date_paid IS NOT NULL OR COALESCE(NEW.amount_paid, 0) > 0)
    AND (
      NEW.payment_method = 'paysme_vendor'
      OR NEW.tnx_fee_applies_to = 'paysme_vendor'
    )
    AND COALESCE(NEW.type, '') NOT IN ('subscription', 'sms')
  ) THEN
    v_gross := GREATEST(COALESCE(NULLIF(NEW.amount_paid, 0), NEW.amount, 0), 0);
    v_fee := LEAST(GREATEST(COALESCE(NEW.tnx_fee, 0), 0), v_gross);
    v_paid_date := COALESCE(NEW.date_paid, NEW.date_generated, NEW.created_at, now())::DATE;

    INSERT INTO public.merchant_payouts (
      merchant_id,
      period_start,
      period_end,
      gross_amount,
      fee_amount,
      amount_paid,
      transaction_count,
      transaction_ids,
      source_transaction_id,
      status
    )
    VALUES (
      NEW.merchant_id,
      v_paid_date,
      v_paid_date,
      v_gross,
      v_fee,
      0,
      1,
      ARRAY[NEW.transaction_id::TEXT],
      NEW.transaction_id::TEXT,
      'pending'
    )
    ON CONFLICT (source_transaction_id) WHERE source_transaction_id IS NOT NULL
    DO UPDATE SET
      merchant_id = EXCLUDED.merchant_id,
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      gross_amount = EXCLUDED.gross_amount,
      fee_amount = EXCLUDED.fee_amount,
      transaction_ids = EXCLUDED.transaction_ids,
      transaction_count = 1,
      updated_at = now()
    WHERE merchant_payouts.status IN ('pending', 'processing');
  ELSE
    DELETE FROM public.merchant_payouts
    WHERE source_transaction_id = NEW.transaction_id::TEXT
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_paysme_vendor_payout ON public.transactions;
CREATE TRIGGER trg_sync_paysme_vendor_payout
AFTER INSERT OR UPDATE OF
  status,
  date_paid,
  amount_paid,
  amount,
  payment_method,
  tnx_fee_applies_to,
  tnx_fee
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_paysme_vendor_payout();

-- Backfill all qualifying historical transactions. Existing queued rows are updated,
-- while paid/cancelled payout records are never reset to pending.
INSERT INTO public.merchant_payouts (
  merchant_id,
  period_start,
  period_end,
  gross_amount,
  fee_amount,
  amount_paid,
  transaction_count,
  transaction_ids,
  source_transaction_id,
  status
)
SELECT
  transactions.merchant_id,
  COALESCE(transactions.date_paid, transactions.date_generated, transactions.created_at, now())::DATE,
  COALESCE(transactions.date_paid, transactions.date_generated, transactions.created_at, now())::DATE,
  GREATEST(COALESCE(NULLIF(transactions.amount_paid, 0), transactions.amount, 0), 0),
  LEAST(
    GREATEST(COALESCE(transactions.tnx_fee, 0), 0),
    GREATEST(COALESCE(NULLIF(transactions.amount_paid, 0), transactions.amount, 0), 0)
  ),
  0,
  1,
  ARRAY[transactions.transaction_id::TEXT],
  transactions.transaction_id::TEXT,
  'pending'
FROM public.transactions
WHERE (
    transactions.status = 'paid'
    OR transactions.date_paid IS NOT NULL
    OR COALESCE(transactions.amount_paid, 0) > 0
  )
  AND (
    transactions.payment_method = 'paysme_vendor'
    OR transactions.tnx_fee_applies_to = 'paysme_vendor'
  )
  AND COALESCE(transactions.type, '') NOT IN ('subscription', 'sms')
ON CONFLICT (source_transaction_id) WHERE source_transaction_id IS NOT NULL
DO UPDATE SET
  merchant_id = EXCLUDED.merchant_id,
  period_start = EXCLUDED.period_start,
  period_end = EXCLUDED.period_end,
  gross_amount = EXCLUDED.gross_amount,
  fee_amount = EXCLUDED.fee_amount,
  transaction_ids = EXCLUDED.transaction_ids,
  transaction_count = 1,
  updated_at = now()
WHERE merchant_payouts.status IN ('pending', 'processing');
