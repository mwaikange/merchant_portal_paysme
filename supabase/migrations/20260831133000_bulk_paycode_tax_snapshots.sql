ALTER TABLE public.bulk_subscribers
  ADD COLUMN IF NOT EXISTS tax_mode text,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS net_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12,2);

UPDATE public.bulk_subscribers bs
SET
  tax_mode = COALESCE(m.tax_mode, 'not_registered'),
  vat_rate = COALESCE(m.vat_rate, 0),
  net_amount = CASE
    WHEN m.tax_mode = 'vat_inclusive' AND m.vat_rate > 0 THEN round(bs.amount / (1 + m.vat_rate / 100), 2)
    ELSE round(bs.amount, 2)
  END,
  vat_amount = CASE
    WHEN m.tax_mode = 'vat_exclusive' AND m.vat_rate > 0 THEN round(bs.amount * m.vat_rate / 100, 2)
    WHEN m.tax_mode = 'vat_inclusive' AND m.vat_rate > 0 THEN round(bs.amount - (bs.amount / (1 + m.vat_rate / 100)), 2)
    ELSE 0
  END,
  gross_amount = CASE
    WHEN m.tax_mode = 'vat_exclusive' AND m.vat_rate > 0 THEN round(bs.amount + (bs.amount * m.vat_rate / 100), 2)
    ELSE round(bs.amount, 2)
  END
FROM public.merchants m
WHERE m.merchant_id = bs.merchant_id
  AND bs.tax_mode IS NULL;

CREATE OR REPLACE FUNCTION public.require_merchant_tax_directive_for_paycode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  merchant_tax_mode text;
  merchant_vat_rate numeric;
  directive_saved_at timestamptz;
  entered_amount numeric;
BEGIN
  IF TG_TABLE_NAME = 'transactions'
    AND NEW.merchant_id = '00000000-1986-0026-0000-000000000001'::uuid
    AND COALESCE(NEW.invoice_id, '') LIKE 'SUB\_%' ESCAPE '\'
  THEN
    RETURN NEW;
  END IF;

  SELECT m.tax_mode, m.vat_rate, m.tax_settings_completed_at
  INTO merchant_tax_mode, merchant_vat_rate, directive_saved_at
  FROM public.merchants m
  WHERE m.merchant_id = NEW.merchant_id;

  IF directive_saved_at IS NULL THEN
    RAISE EXCEPTION 'Save Tax Settings before generating a paycode'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_TABLE_NAME = 'bulk_subscribers' THEN
    entered_amount := round(NEW.amount, 2);
    NEW.tax_mode := COALESCE(merchant_tax_mode, 'not_registered');
    NEW.vat_rate := CASE WHEN NEW.tax_mode = 'not_registered' THEN 0 ELSE COALESCE(merchant_vat_rate, 0) END;

    IF NEW.tax_mode = 'vat_exclusive' AND NEW.vat_rate > 0 THEN
      NEW.net_amount := entered_amount;
      NEW.vat_amount := round(entered_amount * NEW.vat_rate / 100, 2);
      NEW.gross_amount := round(NEW.net_amount + NEW.vat_amount, 2);
      NEW.amount := NEW.gross_amount;
    ELSIF NEW.tax_mode = 'vat_inclusive' AND NEW.vat_rate > 0 THEN
      NEW.gross_amount := entered_amount;
      NEW.net_amount := round(entered_amount / (1 + NEW.vat_rate / 100), 2);
      NEW.vat_amount := round(NEW.gross_amount - NEW.net_amount, 2);
    ELSE
      NEW.tax_mode := 'not_registered';
      NEW.vat_rate := 0;
      NEW.net_amount := entered_amount;
      NEW.vat_amount := 0;
      NEW.gross_amount := entered_amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.bulk_subscribers.tax_mode IS 'VAT treatment snapshotted when the paycode is generated.';
COMMENT ON COLUMN public.bulk_subscribers.gross_amount IS 'Final customer amount including any VAT added at paycode generation.';
