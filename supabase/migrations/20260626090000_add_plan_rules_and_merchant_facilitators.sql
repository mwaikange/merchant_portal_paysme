-- Step 1 foundation for plan-aware payment method eligibility.
-- This migration adds:
-- 1. plan rules used by the portal/SDK/backend to decide which payment methods are available.
-- 2. merchant facilitator codes supplied by each merchant after registering with a facilitator.

CREATE TABLE IF NOT EXISTS public.subscription_plan_rules (
  plan_rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  monthly_amount NUMERIC(12,2) NOT NULL,
  paysme_transaction_fee_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
  card_payments_enabled BOOLEAN NOT NULL DEFAULT false,
  card_monthly_limit NUMERIC(14,2),
  other_payment_types_enabled BOOLEAN NOT NULL DEFAULT true,
  other_payment_monthly_limit NUMERIC(14,2),
  bulk_invoice_enabled BOOLEAN NOT NULL DEFAULT false,
  bulk_paycode_enabled BOOLEAN NOT NULL DEFAULT false,
  custom_branding_enabled BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plan_rules_card_limit_check
    CHECK (
      (card_payments_enabled = false AND card_monthly_limit IS NULL)
      OR
      (card_payments_enabled = true AND (card_monthly_limit IS NULL OR card_monthly_limit >= 0))
    ),
  CONSTRAINT subscription_plan_rules_other_limit_check
    CHECK (other_payment_monthly_limit IS NULL OR other_payment_monthly_limit >= 0)
);

COMMENT ON TABLE public.subscription_plan_rules IS
  'Plan-level payment method and feature rules. card_monthly_limit NULL means unlimited when card_payments_enabled is true.';

COMMENT ON COLUMN public.subscription_plan_rules.paysme_transaction_fee_rate IS
  'Decimal rate charged by PaySME on non-card/PaySME/facilitator payment types, e.g. 0.0185 for 1.85%.';

CREATE TABLE IF NOT EXISTS public.merchant_payment_facilitators (
  merchant_payment_facilitator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE CASCADE,
  payment_provider_id UUID REFERENCES public.payment_providers(payment_provider_id) ON DELETE SET NULL,
  provider_key TEXT NOT NULL,
  provider_display_name TEXT NOT NULL,
  provider_merchant_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT merchant_payment_facilitators_status_check
    CHECK (status IN ('pending', 'active', 'inactive', 'rejected')),
  CONSTRAINT merchant_payment_facilitators_provider_key_check
    CHECK (provider_key IN ('adumo', 'mtc_maris', 'wayame', 'paypulse', 'paytoday')),
  CONSTRAINT merchant_payment_facilitators_unique_provider
    UNIQUE (merchant_id, provider_key)
);

COMMENT ON TABLE public.merchant_payment_facilitators IS
  'Merchant-specific facilitator codes used by PaySME to route card/facilitator payments through the merchant''s own facilitator account.';

CREATE INDEX IF NOT EXISTS idx_subscription_plan_rules_active
  ON public.subscription_plan_rules(is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_facilitators_merchant
  ON public.merchant_payment_facilitators(merchant_id);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_facilitators_provider
  ON public.merchant_payment_facilitators(provider_key, enabled, status);

DROP TRIGGER IF EXISTS trg_subscription_plan_rules_updated_at ON public.subscription_plan_rules;
CREATE TRIGGER trg_subscription_plan_rules_updated_at
BEFORE UPDATE ON public.subscription_plan_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_merchant_payment_facilitators_updated_at ON public.merchant_payment_facilitators;
CREATE TRIGGER trg_merchant_payment_facilitators_updated_at
BEFORE UPDATE ON public.merchant_payment_facilitators
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.subscription_plan_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_payment_facilitators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active plan rules" ON public.subscription_plan_rules;
CREATE POLICY "Authenticated users can view active plan rules"
ON public.subscription_plan_rules
FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Service role full access to plan rules" ON public.subscription_plan_rules;
CREATE POLICY "Service role full access to plan rules"
ON public.subscription_plan_rules
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Merchants can view own facilitator codes" ON public.merchant_payment_facilitators;
CREATE POLICY "Merchants can view own facilitator codes"
ON public.merchant_payment_facilitators
FOR SELECT
TO authenticated
USING (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Merchants can insert own facilitator codes" ON public.merchant_payment_facilitators;
CREATE POLICY "Merchants can insert own facilitator codes"
ON public.merchant_payment_facilitators
FOR INSERT
TO authenticated
WITH CHECK (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Merchants can update own facilitator codes" ON public.merchant_payment_facilitators;
CREATE POLICY "Merchants can update own facilitator codes"
ON public.merchant_payment_facilitators
FOR UPDATE
TO authenticated
USING (merchant_id = auth.uid())
WITH CHECK (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to merchant facilitator codes" ON public.merchant_payment_facilitators;
CREATE POLICY "Service role full access to merchant facilitator codes"
ON public.merchant_payment_facilitators
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

INSERT INTO public.subscription_plan_rules (
  plan_key,
  display_name,
  monthly_amount,
  paysme_transaction_fee_rate,
  card_payments_enabled,
  card_monthly_limit,
  other_payment_types_enabled,
  other_payment_monthly_limit,
  bulk_invoice_enabled,
  bulk_paycode_enabled,
  custom_branding_enabled,
  sort_order,
  is_active
)
VALUES
  ('starter', 'Starter', 200.00, 0.0200, false, NULL, true, NULL, false, false, false, 10, true),
  ('growth', 'Growth', 300.00, 0.0185, true, 10000.00, true, NULL, false, false, false, 20, true),
  ('scale', 'Scale', 500.00, 0.0150, true, 50000.00, true, NULL, true, true, false, 30, true),
  ('annual_partner', 'Annual Partner', 1000.00, 0.0100, true, NULL, true, NULL, true, true, true, 40, true)
ON CONFLICT (plan_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  monthly_amount = EXCLUDED.monthly_amount,
  paysme_transaction_fee_rate = EXCLUDED.paysme_transaction_fee_rate,
  card_payments_enabled = EXCLUDED.card_payments_enabled,
  card_monthly_limit = EXCLUDED.card_monthly_limit,
  other_payment_types_enabled = EXCLUDED.other_payment_types_enabled,
  other_payment_monthly_limit = EXCLUDED.other_payment_monthly_limit,
  bulk_invoice_enabled = EXCLUDED.bulk_invoice_enabled,
  bulk_paycode_enabled = EXCLUDED.bulk_paycode_enabled,
  custom_branding_enabled = EXCLUDED.custom_branding_enabled,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();
