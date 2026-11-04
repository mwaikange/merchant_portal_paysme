-- Standard merchant checkouts must include Lesaka's compatible provider key.
-- Preserve vendor obligations, custom method lists and completed transactions.
ALTER TABLE public.transactions
  ALTER COLUMN allowed_payment_methods SET DEFAULT
  ARRAY['paysme_code','paysme_vendor','card','mtc_maris','paypulse','wayame','paytoday','kazang']::text[];

UPDATE public.transactions
SET allowed_payment_methods = array_append(allowed_payment_methods, 'kazang')
WHERE status = 'pending'
  AND vendor_redeemable = true
  AND vendor_obligation_id IS NULL
  AND allowed_payment_methods =
      ARRAY['paysme_code','paysme_vendor','card','mtc_maris','paypulse','wayame','paytoday']::text[];
