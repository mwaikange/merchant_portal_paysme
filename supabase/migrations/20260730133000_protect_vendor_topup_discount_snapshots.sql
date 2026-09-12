-- Preserve the exact discount terms applied when a Vendor top-up checkout
-- was created. Programme changes must only affect future top-ups.

CREATE OR REPLACE FUNCTION public.protect_vendor_topup_discount_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.topup_type IS DISTINCT FROM OLD.topup_type
     OR NEW.amount_requested IS DISTINCT FROM OLD.amount_requested
     OR NEW.amount_credited IS DISTINCT FROM OLD.amount_credited
     OR NEW.discount_applied IS DISTINCT FROM OLD.discount_applied
     OR NEW.discount_rate_applied IS DISTINCT FROM OLD.discount_rate_applied
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid THEN
    RAISE EXCEPTION 'Vendor top-up financial snapshot fields are immutable after checkout creation.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_vendor_topup_discount_snapshot
  ON public.vendor_topup_credits;
CREATE TRIGGER protect_vendor_topup_discount_snapshot
BEFORE UPDATE ON public.vendor_topup_credits
FOR EACH ROW
EXECUTE FUNCTION public.protect_vendor_topup_discount_snapshot();

CREATE OR REPLACE FUNCTION public.protect_vendor_payment_obligation_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.token_topup_id IS DISTINCT FROM OLD.token_topup_id
     OR NEW.advance_id IS DISTINCT FROM OLD.advance_id
     OR NEW.requested_amount IS DISTINCT FROM OLD.requested_amount
     OR NEW.amount_due IS DISTINCT FROM OLD.amount_due
     OR NEW.token_credit_amount IS DISTINCT FROM OLD.token_credit_amount
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.discount_rate IS DISTINCT FROM OLD.discount_rate
     OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'Vendor payment obligation financial snapshot fields are immutable after checkout creation.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_vendor_payment_obligation_snapshot
  ON public.vendor_payment_obligations;
CREATE TRIGGER protect_vendor_payment_obligation_snapshot
BEFORE UPDATE ON public.vendor_payment_obligations
FOR EACH ROW
EXECUTE FUNCTION public.protect_vendor_payment_obligation_snapshot();

COMMENT ON COLUMN public.vendor_topup_credits.discount_rate_applied IS
  'Immutable discount-rate snapshot used when this individual top-up checkout was created.';
COMMENT ON COLUMN public.vendor_topup_credits.discount_applied IS
  'Immutable monetary discount snapshot used for lifetime pre-discount benefit totals.';
