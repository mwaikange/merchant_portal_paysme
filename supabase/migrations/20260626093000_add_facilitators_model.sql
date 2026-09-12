-- Correction: facilitator partners are not PaySME vendors and should not depend on
-- the legacy payment_providers staging table.

CREATE TABLE IF NOT EXISTS public.facilitators (
  facilitator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitator_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  is_card BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facilitators_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT facilitators_key_check
    CHECK (facilitator_key IN ('adumo', 'mtc_maris', 'wayame', 'paypulse', 'paytoday')),
  CONSTRAINT facilitators_payment_method_check
    CHECK (payment_method IN ('card', 'mtc_maris', 'wayame', 'paypulse', 'paytoday'))
);

COMMENT ON TABLE public.facilitators IS
  'Non-PaySME payment partners such as Adumo, MTC Maris, WayaMe, PayPulse, and PayToday.';

INSERT INTO public.facilitators (
  facilitator_key,
  display_name,
  payment_method,
  is_card,
  sort_order
) VALUES
  ('adumo', 'Adumo', 'card', true, 10),
  ('mtc_maris', 'MTC Maris', 'mtc_maris', false, 20),
  ('wayame', 'WayaMe', 'wayame', false, 30),
  ('paypulse', 'PayPulse', 'paypulse', false, 40),
  ('paytoday', 'PayToday', 'paytoday', false, 50)
ON CONFLICT (facilitator_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  payment_method = EXCLUDED.payment_method,
  is_card = EXCLUDED.is_card,
  sort_order = EXCLUDED.sort_order,
  status = 'active',
  updated_at = now();

ALTER TABLE public.merchant_payment_facilitators
  ADD COLUMN IF NOT EXISTS facilitator_id UUID REFERENCES public.facilitators(facilitator_id) ON DELETE SET NULL;

UPDATE public.merchant_payment_facilitators mpf
SET facilitator_id = f.facilitator_id
FROM public.facilitators f
WHERE mpf.facilitator_id IS NULL
  AND mpf.provider_key = f.facilitator_key;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS facilitator_id UUID REFERENCES public.facilitators(facilitator_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS facilitator_merchant_code TEXT;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_method_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('paysme_code', 'card', 'mtc_maris', 'wayame', 'paypulse', 'paytoday')
  );

CREATE INDEX IF NOT EXISTS idx_facilitators_key_active
  ON public.facilitators(facilitator_key, status);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_facilitators_facilitator
  ON public.merchant_payment_facilitators(facilitator_id);

CREATE INDEX IF NOT EXISTS idx_transactions_facilitator_paid_month
  ON public.transactions(merchant_id, facilitator_id, status, date_paid);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method_paid_month
  ON public.transactions(merchant_id, payment_method, status, date_paid);

DROP TRIGGER IF EXISTS trg_facilitators_updated_at ON public.facilitators;
CREATE TRIGGER trg_facilitators_updated_at
BEFORE UPDATE ON public.facilitators
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.facilitators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active facilitators" ON public.facilitators;
CREATE POLICY "Authenticated users can view active facilitators"
ON public.facilitators
FOR SELECT
TO authenticated
USING (status = 'active');

DROP POLICY IF EXISTS "Service role full access to facilitators" ON public.facilitators;
CREATE POLICY "Service role full access to facilitators"
ON public.facilitators
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
