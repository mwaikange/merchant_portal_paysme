-- Use the existing transactions.tnx_fee_rate and transactions.tnx_fee columns,
-- but calculate them from the merchant's subscription plan instead of the old 10% platform fee.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS tnx_fee_plan_key TEXT,
  ADD COLUMN IF NOT EXISTS tnx_fee_plan_type TEXT,
  ADD COLUMN IF NOT EXISTS tnx_fee_applies_to TEXT,
  ADD COLUMN IF NOT EXISTS tnx_fee_source TEXT,
  ADD COLUMN IF NOT EXISTS tnx_fee_snapshot_at TIMESTAMPTZ;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_tnx_fee_applies_to_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_tnx_fee_applies_to_check
  CHECK (
    tnx_fee_applies_to IS NULL
    OR tnx_fee_applies_to IN ('paysme_vendor', 'paysme_code', 'facilitator', 'card', 'internal')
  );

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_method_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('paysme_vendor', 'paysme_code', 'card', 'mtc_maris', 'wayame', 'paypulse', 'paytoday')
  );

CREATE INDEX IF NOT EXISTS idx_transactions_tnx_fee_plan
  ON public.transactions(tnx_fee_plan_key, tnx_fee_applies_to);

CREATE OR REPLACE FUNCTION public.transaction_plan_key(p_plan_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_plan_type LIKE 'annual_partner%' THEN 'annual_partner'
    WHEN p_plan_type LIKE 'starter%' THEN 'starter'
    WHEN p_plan_type LIKE 'growth%' THEN 'growth'
    WHEN p_plan_type LIKE 'scale%' THEN 'scale'
    ELSE regexp_replace(COALESCE(p_plan_type, 'starter'), '_(3|6|9|12)_months$', '')
  END;
$function$;

CREATE OR REPLACE FUNCTION public.current_platform_fee_rate(p_fee_key TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rate NUMERIC;
BEGIN
  IF p_fee_key IN ('starter', 'growth', 'scale', 'annual_partner') THEN
    SELECT paysme_transaction_fee_rate
    INTO v_rate
    FROM public.subscription_plan_rules
    WHERE subscription_plan_rules.plan_key = p_fee_key
      AND is_active = true
    LIMIT 1;

    RETURN COALESCE(v_rate, 0);
  END IF;

  SELECT paysme_transaction_fee_rate
  INTO v_rate
  FROM public.subscription_plan_rules
  WHERE subscription_plan_rules.plan_key = 'starter'
    AND is_active = true
  LIMIT 1;

  RETURN COALESCE(v_rate, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_transaction_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_amount NUMERIC;
  v_as_of TIMESTAMPTZ;
  v_plan_type TEXT;
  v_plan_key TEXT;
  v_rate NUMERIC := 0;
  v_applies_to TEXT;
BEGIN
  v_amount := COALESCE(NEW.amount_paid, NEW.amount, 0);
  v_as_of := COALESCE(NEW.date_paid, NEW.date_generated, NEW.created_at, now());

  IF COALESCE(NEW.type, '') IN ('subscription', 'sms') THEN
    NEW.tnx_fee_rate := 0;
    NEW.tnx_fee := 0;
    NEW.tnx_fee_plan_key := NULL;
    NEW.tnx_fee_plan_type := NULL;
    NEW.tnx_fee_applies_to := 'internal';
    NEW.tnx_fee_source := 'internal_payme_service';
    NEW.tnx_fee_snapshot_at := now();
    RETURN NEW;
  END IF;

  IF NEW.payment_method IS NULL THEN
    NEW.payment_method := CASE
      WHEN NEW.payment_provider_id IS NOT NULL THEN 'paysme_vendor'
      ELSE 'paysme_code'
    END;
  END IF;

  v_applies_to := CASE
    WHEN NEW.payment_method = 'card' THEN 'card'
    WHEN NEW.payment_method IN ('paysme_vendor', 'paysme_code') THEN NEW.payment_method
    ELSE 'facilitator'
  END;

  SELECT s.plan_type
  INTO v_plan_type
  FROM public.subscriptions s
  WHERE s.user_id = NEW.merchant_id
    AND s.status = 'active'
    AND s.paycode_status = 'paid'
    AND COALESCE(s.start_date, s.created_at, '-infinity'::TIMESTAMPTZ) <= v_as_of
    AND COALESCE(s.end_date, 'infinity'::TIMESTAMPTZ) > v_as_of
  ORDER BY COALESCE(s.start_date, s.created_at) DESC NULLS LAST
  LIMIT 1;

  IF v_plan_type IS NULL THEN
    SELECT s.plan_type
    INTO v_plan_type
    FROM public.subscriptions s
    WHERE s.user_id = NEW.merchant_id
      AND s.status = 'active'
      AND s.paycode_status = 'paid'
    ORDER BY COALESCE(s.start_date, s.created_at) DESC NULLS LAST
    LIMIT 1;
  END IF;

  v_plan_key := public.transaction_plan_key(v_plan_type);
  v_rate := CASE
    WHEN NEW.payment_method = 'card' THEN 0
    ELSE public.current_platform_fee_rate(v_plan_key)
  END;

  NEW.tnx_fee_rate := v_rate;
  NEW.tnx_fee := round(v_amount * v_rate, 2);
  NEW.tnx_fee_plan_key := v_plan_key;
  NEW.tnx_fee_plan_type := v_plan_type;
  NEW.tnx_fee_applies_to := v_applies_to;
  NEW.tnx_fee_source := CASE
    WHEN v_plan_type IS NULL THEN 'default_starter_no_active_subscription'
    ELSE 'merchant_subscription_snapshot'
  END;
  NEW.tnx_fee_snapshot_at := now();

  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.transactions'::regclass
      AND NOT tgisinternal
      AND pg_get_triggerdef(oid) ILIKE '%set_transaction_fee%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.transactions', r.tgname);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_apply_transaction_fee_snapshot ON public.transactions;
CREATE TRIGGER trg_set_transaction_fee
BEFORE INSERT OR UPDATE OF merchant_id, amount, amount_paid, payment_method, payment_provider_id, type, status, date_paid
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.set_transaction_fee();

UPDATE public.transactions
SET
  payment_method = CASE
    WHEN type IN ('subscription', 'sms') THEN payment_method
    WHEN payment_method IS NOT NULL THEN payment_method
    WHEN payment_provider_id IS NOT NULL THEN 'paysme_vendor'
    ELSE 'paysme_code'
  END,
  tnx_fee_rate = NULL,
  tnx_fee_plan_key = NULL,
  tnx_fee_snapshot_at = NULL
WHERE type NOT IN ('subscription', 'sms')
   OR tnx_fee_rate IS NULL
   OR tnx_fee IS NULL
   OR payment_method IS NULL;
