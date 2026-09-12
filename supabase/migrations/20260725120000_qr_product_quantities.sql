-- Allow reusable product QR links to sell multiple units while keeping the
-- stored link amount as the authoritative unit price.

ALTER TABLE public.merchant_qr_payment_links
  ADD COLUMN IF NOT EXISTS allow_quantity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_quantity integer NOT NULL DEFAULT 1;

ALTER TABLE public.merchant_qr_payment_links
  DROP CONSTRAINT IF EXISTS merchant_qr_payment_links_quantity_rules_check;

ALTER TABLE public.merchant_qr_payment_links
  ADD CONSTRAINT merchant_qr_payment_links_quantity_rules_check
  CHECK (
    min_quantity = 1
    AND max_quantity BETWEEN 1 AND 100
    AND (
      (allow_quantity = false AND max_quantity = 1)
      OR
      (allow_quantity = true AND recurring = false AND max_quantity >= 2)
    )
  );

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS qr_unit_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS qr_quantity integer;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_qr_quantity_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_qr_quantity_check
  CHECK (
    qr_quantity IS NULL
    OR (
      qr_payment_link_id IS NOT NULL
      AND qr_quantity BETWEEN 1 AND 100
      AND qr_unit_amount IS NOT NULL
      AND qr_unit_amount > 0
    )
  );
