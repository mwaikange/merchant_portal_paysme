-- Central merchant VAT configuration and QR Basket-only teller accounts.
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS tax_mode text NOT NULL DEFAULT 'not_registered',
  ADD COLUMN IF NOT EXISTS vat_rate numeric(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_registration_number text;

ALTER TABLE public.merchants DROP CONSTRAINT IF EXISTS merchants_tax_mode_check;
ALTER TABLE public.merchants ADD CONSTRAINT merchants_tax_mode_check
  CHECK (tax_mode IN ('not_registered', 'vat_inclusive', 'vat_exclusive'));
ALTER TABLE public.merchants DROP CONSTRAINT IF EXISTS merchants_vat_rate_check;
ALTER TABLE public.merchants ADD CONSTRAINT merchants_vat_rate_check CHECK (
  (tax_mode = 'not_registered' AND vat_rate = 0)
  OR (tax_mode IN ('vat_inclusive', 'vat_exclusive') AND vat_rate = 15)
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS tax_mode text,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(6,3),
  ADD COLUMN IF NOT EXISTS net_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS vat_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS gross_amount numeric(14,2);

CREATE TABLE IF NOT EXISTS public.merchant_qr_basket_users (
  basket_user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  mobile_number text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  must_change_password boolean NOT NULL DEFAULT true,
  last_sign_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, mobile_number)
);

CREATE INDEX IF NOT EXISTS merchant_qr_basket_users_merchant_idx
  ON public.merchant_qr_basket_users (merchant_id, status, created_at DESC);

ALTER TABLE public.merchant_qr_basket_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Merchant admins can view their basket users" ON public.merchant_qr_basket_users;
CREATE POLICY "Merchant admins can view their basket users"
  ON public.merchant_qr_basket_users FOR SELECT TO authenticated
  USING (merchant_id = auth.uid());

COMMENT ON COLUMN public.merchants.tax_mode IS
  'not_registered: no VAT; vat_inclusive: entered prices include VAT; vat_exclusive: VAT is added at checkout';
COMMENT ON TABLE public.merchant_qr_basket_users IS
  'Restricted teller identities. These users may access merchant-qr-baskets only, never the merchant portal.';

-- Public hosted pages need only presentation-safe merchant fields.
DROP FUNCTION IF EXISTS public.get_merchant_public_info(uuid);
CREATE FUNCTION public.get_merchant_public_info(p_merchant_id uuid)
RETURNS TABLE (
  merchant_id uuid,
  business_name text,
  tax_mode text,
  vat_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.merchant_id, m.business_name, m.tax_mode, m.vat_rate
  FROM public.merchants m
  WHERE m.merchant_id = p_merchant_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_merchant_public_info(uuid) TO anon, authenticated;
