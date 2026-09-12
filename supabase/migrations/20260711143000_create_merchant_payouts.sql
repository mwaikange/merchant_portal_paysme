-- PaySME Vendor payout batches created and managed by the admin panel.
CREATE TABLE IF NOT EXISTS public.merchant_payouts (
  payout_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount NUMERIC(14,2) GENERATED ALWAYS AS (gross_amount - fee_amount) STORED,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  transaction_count INTEGER NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
  transaction_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  payment_method TEXT,
  payout_reference TEXT,
  admin_notes TEXT,
  scheduled_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID,
  processed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT merchant_payouts_valid_period CHECK (period_end >= period_start),
  CONSTRAINT merchant_payouts_fee_not_above_gross CHECK (fee_amount <= gross_amount),
  CONSTRAINT merchant_payouts_paid_not_above_net CHECK (amount_paid <= gross_amount - fee_amount)
);

CREATE INDEX IF NOT EXISTS idx_merchant_payouts_merchant_period
  ON public.merchant_payouts (merchant_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_merchant_payouts_status_created
  ON public.merchant_payouts (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_payouts_reference
  ON public.merchant_payouts (payout_reference)
  WHERE payout_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prepare_merchant_payout_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    NEW.amount_paid := NEW.gross_amount - NEW.fee_amount;
    NEW.paid_at := COALESCE(NEW.paid_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_merchant_payout_status ON public.merchant_payouts;
CREATE TRIGGER trg_prepare_merchant_payout_status
BEFORE INSERT OR UPDATE ON public.merchant_payouts
FOR EACH ROW
EXECUTE FUNCTION public.prepare_merchant_payout_status();

ALTER TABLE public.merchant_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants can view own payouts" ON public.merchant_payouts;
CREATE POLICY "Merchants can view own payouts"
ON public.merchant_payouts
FOR SELECT
TO authenticated
USING (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view merchant payouts" ON public.merchant_payouts;
CREATE POLICY "Admins can view merchant payouts"
ON public.merchant_payouts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE admin_users.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can create merchant payouts" ON public.merchant_payouts;
CREATE POLICY "Admins can create merchant payouts"
ON public.merchant_payouts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE admin_users.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can update merchant payouts" ON public.merchant_payouts;
CREATE POLICY "Admins can update merchant payouts"
ON public.merchant_payouts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE admin_users.auth_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE admin_users.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can delete merchant payouts" ON public.merchant_payouts;
CREATE POLICY "Admins can delete merchant payouts"
ON public.merchant_payouts
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE admin_users.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Service role can manage merchant payouts" ON public.merchant_payouts;
CREATE POLICY "Service role can manage merchant payouts"
ON public.merchant_payouts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT ON public.merchant_payouts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.merchant_payouts TO authenticated;
GRANT ALL ON public.merchant_payouts TO service_role;
