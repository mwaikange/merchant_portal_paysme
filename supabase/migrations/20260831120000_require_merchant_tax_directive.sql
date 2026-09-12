ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS tax_settings_completed_at timestamptz;

COMMENT ON COLUMN public.merchants.tax_settings_completed_at IS
  'Timestamp proving the merchant deliberately saved a VAT treatment. Paycode generation is blocked while null.';

CREATE OR REPLACE FUNCTION public.require_merchant_tax_directive_for_paycode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Buying a PaySME package is not a merchant business paycode and remains available.
  IF TG_TABLE_NAME = 'transactions'
    AND NEW.merchant_id = '00000000-1986-0026-0000-000000000001'::uuid
    AND COALESCE(NEW.invoice_id, '') LIKE 'SUB\_%' ESCAPE '\'
  THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.merchants m
    WHERE m.merchant_id = NEW.merchant_id
      AND m.tax_settings_completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Save Tax Settings before generating a paycode'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_tax_directive_before_transaction_paycode ON public.transactions;
CREATE TRIGGER require_tax_directive_before_transaction_paycode
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.require_merchant_tax_directive_for_paycode();

DROP TRIGGER IF EXISTS require_tax_directive_before_bulk_paycode ON public.bulk_subscribers;
CREATE TRIGGER require_tax_directive_before_bulk_paycode
BEFORE INSERT ON public.bulk_subscribers
FOR EACH ROW EXECUTE FUNCTION public.require_merchant_tax_directive_for_paycode();
