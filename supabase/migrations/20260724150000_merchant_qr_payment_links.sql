-- Reusable, backend-owned hosted QR payment links for Merchant Portal products.
-- Every scan creates a normal PaySME transaction; the QR stores no credentials.

CREATE TABLE public.merchant_qr_payment_links (
  qr_payment_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE CASCADE,
  slug varchar(64) NOT NULL UNIQUE,
  product_reference varchar(100) NOT NULL,
  description varchar(240),
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  currency varchar(3) NOT NULL DEFAULT 'NAD' CHECK (currency = 'NAD'),
  recurring boolean NOT NULL DEFAULT false,
  recurring_period varchar(20),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CHECK (
    (recurring = false AND recurring_period IS NULL)
    OR
    (recurring = true AND recurring_period IN ('weekly', 'monthly', 'quarterly', 'yearly'))
  )
);

CREATE INDEX idx_merchant_qr_links_merchant_created
  ON public.merchant_qr_payment_links(merchant_id, created_at DESC);
CREATE INDEX idx_merchant_qr_links_active_slug
  ON public.merchant_qr_payment_links(slug)
  WHERE status = 'active';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS qr_payment_link_id uuid
    REFERENCES public.merchant_qr_payment_links(qr_payment_link_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_qr_payment_link
  ON public.transactions(qr_payment_link_id, status, date_generated DESC)
  WHERE qr_payment_link_id IS NOT NULL;

ALTER TABLE public.merchant_qr_payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchant can view own QR payment links"
  ON public.merchant_qr_payment_links
  FOR SELECT TO authenticated
  USING (merchant_id = auth.uid());

CREATE POLICY "Service role manages QR payment links"
  ON public.merchant_qr_payment_links
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_merchant_qr_payment_links_updated_at
BEFORE UPDATE ON public.merchant_qr_payment_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

