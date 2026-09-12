-- Register Kazang throughout the generic facilitator model. The customer flow
-- remains simulation-only until Kazang supplies production API credentials and
-- documentation; no simulation response is allowed to finalize a transaction.

BEGIN;

ALTER TABLE public.facilitators
  DROP CONSTRAINT IF EXISTS facilitators_key_check,
  DROP CONSTRAINT IF EXISTS facilitators_payment_method_check;

ALTER TABLE public.facilitators
  ADD CONSTRAINT facilitators_key_check
    CHECK (facilitator_key IN ('adumo', 'mtc_maris', 'wayame', 'paypulse', 'paytoday', 'kazang')),
  ADD CONSTRAINT facilitators_payment_method_check
    CHECK (payment_method IN ('card', 'mtc_maris', 'wayame', 'paypulse', 'paytoday', 'kazang'));

INSERT INTO public.facilitators (
  facilitator_key,
  display_name,
  payment_method,
  is_card,
  status,
  sort_order
) VALUES (
  'kazang',
  'Kazang',
  'kazang',
  false,
  'active',
  60
)
ON CONFLICT (facilitator_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  payment_method = EXCLUDED.payment_method,
  is_card = EXCLUDED.is_card,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

ALTER TABLE public.merchant_payment_facilitators
  DROP CONSTRAINT IF EXISTS merchant_payment_facilitators_provider_key_check;

ALTER TABLE public.merchant_payment_facilitators
  ADD CONSTRAINT merchant_payment_facilitators_provider_key_check
    CHECK (provider_key IN ('adumo', 'mtc_maris', 'wayame', 'paypulse', 'paytoday', 'kazang'));

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_method_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_payment_method_check
    CHECK (
      payment_method IS NULL
      OR payment_method IN ('paysme_vendor', 'paysme_code', 'card', 'mtc_maris', 'wayame', 'paypulse', 'paytoday', 'bank_eft', 'kazang')
    );

ALTER TABLE public.mobiwand_payment_attempts
  DROP CONSTRAINT IF EXISTS mobiwand_payment_attempts_provider_check;

ALTER TABLE public.mobiwand_payment_attempts
  ADD CONSTRAINT mobiwand_payment_attempts_provider_check
    CHECK (provider_key IN ('mtc_maris', 'paypulse', 'paytoday', 'kazang'));

COMMENT ON TABLE public.facilitators IS
  'Non-PaySME payment partners such as Adumo, MTC Maris, WayaMe, PayPulse, PayToday, and Kazang.';

COMMIT;
