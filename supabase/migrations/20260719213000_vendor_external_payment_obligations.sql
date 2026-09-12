-- Restricted external checkout for PaySME Vendor token purchases and
-- token-advance repayments. These obligations may never be paid from the
-- PaySME Vendor network or a vendor's internal balances.

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Preserve every transaction type already present in production while adding
-- the two restricted Vendor Account purposes. Some historical rows predate
-- the last static constraint and use legacy types that must remain editable.
DO $$
DECLARE
  v_allowed_types text[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT value
    FROM unnest(
      COALESCE(
        (SELECT array_agg(DISTINCT type) FROM public.transactions WHERE type IS NOT NULL),
        ARRAY[]::text[]
      ) || ARRAY[
        'api',
        'bulk',
        'sms',
        'subscription',
        'vendor_token_topup',
        'vendor_advance_installment'
      ]::text[]
    ) AS expanded(value)
    ORDER BY value
  ) INTO v_allowed_types;

  EXECUTE format(
    'ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (type = ANY (%L::text[]))',
    v_allowed_types
  );
END;
$$;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_purpose text NOT NULL DEFAULT 'merchant_payment',
  ADD COLUMN IF NOT EXISTS vendor_redeemable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allowed_payment_methods text[] NOT NULL DEFAULT
    ARRAY['paysme_code', 'paysme_vendor', 'card', 'mtc_maris', 'paypulse', 'wayame', 'paytoday']::text[];

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_restricted_vendor_method_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_restricted_vendor_method_check
  CHECK (
    vendor_redeemable
    OR payment_method IS NULL
    OR payment_method NOT IN ('paysme_code', 'paysme_vendor')
  );

CREATE TABLE IF NOT EXISTS public.vendor_payment_obligations (
  obligation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('vendor_token_topup', 'vendor_advance_installment')),
  token_topup_id uuid REFERENCES public.vendor_topup_credits(id) ON DELETE RESTRICT,
  advance_id uuid REFERENCES public.vendor_token_advances(advance_id) ON DELETE RESTRICT,
  transaction_id text UNIQUE REFERENCES public.transactions(transaction_id) ON DELETE SET NULL,
  requested_amount numeric(12,2) NOT NULL CHECK (requested_amount > 0),
  amount_due numeric(12,2) NOT NULL CHECK (amount_due > 0),
  token_credit_amount numeric(12,2),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NAD' CHECK (currency = 'NAD'),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'checkout_created', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded')
  ),
  allowed_payment_methods text[] NOT NULL DEFAULT ARRAY['card', 'mtc_maris', 'paypulse', 'wayame']::text[],
  selected_payment_method text,
  vendor_redeemable boolean NOT NULL DEFAULT false CHECK (vendor_redeemable = false),
  sms_notifications_enabled boolean NOT NULL DEFAULT false CHECK (sms_notifications_enabled = false),
  checkout_token_hash text NOT NULL,
  checkout_expires_at timestamptz NOT NULL,
  provider_reference text,
  paid_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_payment_obligation_source_check CHECK (
    (purpose = 'vendor_token_topup' AND token_topup_id IS NOT NULL AND advance_id IS NULL AND token_credit_amount IS NOT NULL)
    OR
    (purpose = 'vendor_advance_installment' AND advance_id IS NOT NULL AND token_topup_id IS NULL AND token_credit_amount IS NULL)
  )
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS vendor_obligation_id uuid
  REFERENCES public.vendor_payment_obligations(obligation_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_payment_obligations_active_advance
  ON public.vendor_payment_obligations(advance_id)
  WHERE purpose = 'vendor_advance_installment'
    AND status IN ('pending', 'checkout_created', 'processing');

CREATE INDEX IF NOT EXISTS idx_vendor_payment_obligations_vendor_status
  ON public.vendor_payment_obligations(vendor_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_vendor_obligation
  ON public.transactions(vendor_obligation_id)
  WHERE vendor_obligation_id IS NOT NULL;

ALTER TABLE public.vendor_payment_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendor can view own payment obligations"
  ON public.vendor_payment_obligations;
CREATE POLICY "Vendor can view own payment obligations"
  ON public.vendor_payment_obligations
  FOR SELECT TO authenticated
  USING (
    vendor_id IN (
      SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role manages vendor payment obligations"
  ON public.vendor_payment_obligations;
CREATE POLICY "Service role manages vendor payment obligations"
  ON public.vendor_payment_obligations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Settlement records are server-owned. Vendors may inspect their own data but
-- cannot mark a top-up complete, alter an advance balance, or invent history.
DROP POLICY IF EXISTS "Vendor can insert own topups" ON public.vendor_topup_credits;
DROP POLICY IF EXISTS "Vendor can update own advances" ON public.vendor_token_advances;
DROP POLICY IF EXISTS "Vendor can insert own transactions" ON public.vendor_transactions;
DROP POLICY IF EXISTS "Vendors can insert own transactions" ON public.vendor_transactions;

CREATE OR REPLACE FUNCTION public.settle_vendor_payment_obligation_from_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obligation public.vendor_payment_obligations%ROWTYPE;
  v_remaining numeric(12,2);
  v_paid_at timestamptz := COALESCE(NEW.date_paid, now());
BEGIN
  IF NEW.vendor_obligation_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'failed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.vendor_payment_obligations
    SET status = 'failed', updated_at = now()
    WHERE obligation_id = NEW.vendor_obligation_id
      AND status IN ('pending', 'checkout_created', 'processing');
    RETURN NEW;
  END IF;

  IF NEW.status <> 'paid'
     OR COALESCE(NEW.finalized, false) <> true
     OR (OLD.status = 'paid' AND COALESCE(OLD.finalized, false) = true) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_obligation
  FROM public.vendor_payment_obligations
  WHERE obligation_id = NEW.vendor_obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor payment obligation was not found';
  END IF;

  IF v_obligation.status = 'paid' THEN
    RETURN NEW;
  END IF;

  IF v_obligation.transaction_id IS DISTINCT FROM NEW.transaction_id THEN
    RAISE EXCEPTION 'Transaction does not belong to this vendor payment obligation';
  END IF;

  IF NEW.payment_method IS NULL
     OR NEW.payment_method IN ('paysme_code', 'paysme_vendor')
     OR NOT (NEW.payment_method = ANY(v_obligation.allowed_payment_methods)) THEN
    RAISE EXCEPTION 'This obligation requires an approved external payment method';
  END IF;

  IF abs(COALESCE(NEW.amount_paid, NEW.amount) - v_obligation.amount_due) >= 0.005 THEN
    RAISE EXCEPTION 'Paid amount does not match the vendor payment obligation';
  END IF;

  IF v_obligation.purpose = 'vendor_token_topup' THEN
    UPDATE public.vendor_topup_credits
    SET status = 'completed',
        payment_reference = NEW.transaction_id,
        updated_at = v_paid_at
    WHERE id = v_obligation.token_topup_id
      AND vendor_id = v_obligation.vendor_id
      AND status <> 'completed';

    UPDATE public.vendors
    SET token_balance = round((COALESCE(token_balance, 0) + v_obligation.token_credit_amount)::numeric, 2),
        updated_at = v_paid_at
    WHERE vendor_id = v_obligation.vendor_id;

    INSERT INTO public.vendor_transactions (
      vendor_id, transaction_type, amount, status, generated_code,
      merchant_name, notes, processed_at, updated_at
    ) VALUES (
      v_obligation.vendor_id,
      'Token Balance Purchase',
      v_obligation.token_credit_amount,
      'completed',
      NEW.generated_code,
      'PaySME Vendor Account',
      'Externally paid vendor token top-up',
      v_paid_at,
      v_paid_at
    );
  ELSE
    SELECT balance_remaining INTO v_remaining
    FROM public.vendor_token_advances
    WHERE advance_id = v_obligation.advance_id
      AND vendor_id = v_obligation.vendor_id
      AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND OR v_remaining < v_obligation.amount_due THEN
      RAISE EXCEPTION 'Advance is no longer payable for this amount';
    END IF;

    v_remaining := round((v_remaining - v_obligation.amount_due)::numeric, 2);

    UPDATE public.vendor_token_advances
    SET balance_remaining = v_remaining,
        total_paid = round((COALESCE(total_paid, 0) + v_obligation.amount_due)::numeric, 2),
        payment_count = COALESCE(payment_count, 0) + 1,
        last_payment_date = v_paid_at,
        last_payment_amount = v_obligation.amount_due,
        status = CASE WHEN v_remaining = 0 THEN 'paid_up' ELSE 'active' END,
        updated_at = v_paid_at
    WHERE advance_id = v_obligation.advance_id;

    INSERT INTO public.vendor_transactions (
      vendor_id, transaction_type, amount, status, generated_code,
      merchant_name, advance_id, notes, processed_at, updated_at
    ) VALUES (
      v_obligation.vendor_id,
      'Installment Payment (Advance)',
      v_obligation.amount_due,
      'completed',
      NEW.generated_code,
      'PaySME Token Advance',
      v_obligation.advance_id,
      'Externally paid token-advance installment',
      v_paid_at,
      v_paid_at
    );
  END IF;

  UPDATE public.vendor_payment_obligations
  SET status = 'paid',
      selected_payment_method = NEW.payment_method,
      paid_at = v_paid_at,
      settled_at = now(),
      updated_at = now()
  WHERE obligation_id = v_obligation.obligation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settle_vendor_payment_obligation ON public.transactions;
CREATE TRIGGER trg_settle_vendor_payment_obligation
AFTER UPDATE OF status, finalized, amount_paid, payment_method ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.settle_vendor_payment_obligation_from_transaction();

CREATE OR REPLACE FUNCTION public.reject_restricted_vendor_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.vendor_redeemable, true) = false
     AND NEW.payment_method IN ('paysme_code', 'paysme_vendor') THEN
    RAISE EXCEPTION 'This transaction cannot be paid through the PaySME Vendor network';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_restricted_vendor_payment ON public.transactions;
CREATE TRIGGER trg_reject_restricted_vendor_payment
BEFORE INSERT OR UPDATE OF payment_method, vendor_redeemable ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.reject_restricted_vendor_payment();

-- The existing fee snapshot trigger defaults a null method to paysme_code.
-- Restricted Vendor App obligations must remain method-neutral until an
-- approved external provider is selected, and they are PaySME's own internal
-- account receipts rather than merchant sales subject to a platform fee.
CREATE OR REPLACE FUNCTION public.normalize_vendor_obligation_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_purpose IN ('vendor_token_topup', 'vendor_advance_installment') THEN
    IF NEW.status = 'pending' AND COALESCE(NEW.finalized, false) = false THEN
      NEW.payment_method := NULL;
    END IF;
    NEW.tnx_fee_rate := 0;
    NEW.tnx_fee := 0;
    NEW.tnx_fee_plan_key := NULL;
    NEW.tnx_fee_plan_type := NULL;
    NEW.tnx_fee_applies_to := 'internal';
    NEW.tnx_fee_source := 'vendor_account_payment';
    NEW.tnx_fee_snapshot_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_normalize_vendor_obligation_transaction ON public.transactions;
CREATE TRIGGER zz_normalize_vendor_obligation_transaction
BEFORE INSERT OR UPDATE OF merchant_id, amount, amount_paid, payment_method,
  payment_provider_id, type, status, date_paid, payment_purpose
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.normalize_vendor_obligation_transaction();
