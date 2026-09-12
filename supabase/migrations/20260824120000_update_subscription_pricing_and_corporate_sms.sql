-- Update the commercial plan catalogue while retaining annual_partner as the
-- stable internal key for existing subscriptions and entitlement checks.
BEGIN;

ALTER TABLE public.subscription_plan_rules
  ADD COLUMN IF NOT EXISTS bulk_sms_discount_rate NUMERIC(6,5) NOT NULL DEFAULT 0
    CHECK (bulk_sms_discount_rate >= 0 AND bulk_sms_discount_rate <= 1),
  ADD COLUMN IF NOT EXISTS personalized_sms_sender_id_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE public.subscription_plan_rules
SET
  display_name = CASE plan_key
    WHEN 'annual_partner' THEN 'Corporate'
    ELSE display_name
  END,
  monthly_amount = CASE plan_key
    WHEN 'starter' THEN 200.00
    WHEN 'growth' THEN 500.00
    WHEN 'scale' THEN 1000.00
    WHEN 'annual_partner' THEN 3000.00
    ELSE monthly_amount
  END,
  bulk_sms_discount_rate = CASE
    WHEN plan_key = 'annual_partner' THEN 0.25000
    ELSE 0
  END,
  personalized_sms_sender_id_enabled = (plan_key = 'annual_partner'),
  updated_at = now()
WHERE plan_key IN ('starter', 'growth', 'scale', 'annual_partner');

COMMENT ON COLUMN public.subscription_plan_rules.bulk_sms_discount_rate IS
  'Discount applied by the server when an active merchant purchases Bulk SMS credits.';

COMMENT ON COLUMN public.subscription_plan_rules.personalized_sms_sender_id_enabled IS
  'Whether the plan includes setup and use of a personalized Bulk SMS Sender ID.';

COMMIT;
