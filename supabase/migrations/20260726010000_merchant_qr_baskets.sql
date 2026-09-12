-- Transaction-specific QR baskets assembled from merchant-owned reusable QR products.
-- Prices, merchant ownership, quantities, totals, and expiry are resolved server-side.

CREATE TABLE public.merchant_qr_baskets (
  basket_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE RESTRICT,
  slug varchar(64) NOT NULL UNIQUE,
  client_request_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  currency varchar(3) NOT NULL DEFAULT 'NAD' CHECK (currency = 'NAD'),
  subtotal_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0 AND total_amount <= 1000000),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  locked_at timestamptz NOT NULL DEFAULT now(),
  checkout_started_at timestamptz,
  checkout_idempotency_key uuid,
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, client_request_id),
  CHECK (expires_at > created_at)
);

CREATE TABLE public.merchant_qr_basket_items (
  basket_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  basket_id uuid NOT NULL REFERENCES public.merchant_qr_baskets(basket_id) ON DELETE RESTRICT,
  qr_payment_link_id uuid REFERENCES public.merchant_qr_payment_links(qr_payment_link_id) ON DELETE SET NULL,
  product_reference_snapshot varchar(100) NOT NULL,
  description_snapshot varchar(240),
  unit_price_snapshot numeric(12,2) NOT NULL CHECK (unit_price_snapshot > 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  line_total_snapshot numeric(12,2) NOT NULL CHECK (line_total_snapshot > 0 AND line_total_snapshot <= 1000000),
  currency varchar(3) NOT NULL DEFAULT 'NAD' CHECK (currency = 'NAD'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (basket_id, qr_payment_link_id)
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS basket_id uuid
    REFERENCES public.merchant_qr_baskets(basket_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payer_name varchar(120);

CREATE UNIQUE INDEX idx_transactions_one_per_qr_basket
  ON public.transactions(basket_id)
  WHERE basket_id IS NOT NULL;

CREATE INDEX idx_qr_baskets_merchant_created
  ON public.merchant_qr_baskets(merchant_id, created_at DESC);
CREATE INDEX idx_qr_baskets_pending_expiry
  ON public.merchant_qr_baskets(expires_at)
  WHERE status = 'pending';
CREATE INDEX idx_qr_basket_items_basket_sort
  ON public.merchant_qr_basket_items(basket_id, sort_order);

ALTER TABLE public.merchant_qr_baskets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_qr_basket_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own QR baskets"
  ON public.merchant_qr_baskets FOR SELECT TO authenticated
  USING (merchant_id = auth.uid());

CREATE POLICY "Merchants can view own QR basket items"
  ON public.merchant_qr_basket_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchant_qr_baskets basket
      WHERE basket.basket_id = merchant_qr_basket_items.basket_id
        AND basket.merchant_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages QR baskets"
  ON public.merchant_qr_baskets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages QR basket items"
  ON public.merchant_qr_basket_items FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_merchant_qr_baskets_updated_at
BEFORE UPDATE ON public.merchant_qr_baskets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_merchant_qr_basket(
  p_merchant_id uuid,
  p_client_request_id uuid,
  p_items jsonb,
  p_ttl_minutes integer DEFAULT 15
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_basket_id uuid;
  v_item jsonb;
  v_product public.merchant_qr_payment_links%ROWTYPE;
  v_product_id uuid;
  v_quantity integer;
  v_max_quantity integer;
  v_line_total numeric(12,2);
  v_total numeric(12,2) := 0;
  v_count integer := 0;
  v_sort integer := 0;
BEGIN
  IF p_merchant_id IS NULL OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Merchant and request IDs are required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'A basket must contain between 1 and 100 products';
  END IF;
  IF p_ttl_minutes NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Basket expiry must be between 1 and 60 minutes';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT value->>'qr_payment_link_id')
    FROM jsonb_array_elements(p_items)
  ) THEN
    RAISE EXCEPTION 'A product may only appear once in a basket';
  END IF;

  SELECT basket_id INTO v_basket_id
  FROM public.merchant_qr_baskets
  WHERE merchant_id = p_merchant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    RETURN v_basket_id;
  END IF;

  INSERT INTO public.merchant_qr_baskets (
    merchant_id, slug, client_request_id, expires_at
  ) VALUES (
    p_merchant_id,
    encode(gen_random_bytes(24), 'hex'),
    p_client_request_id,
    now() + make_interval(mins => p_ttl_minutes)
  )
  RETURNING basket_id INTO v_basket_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'qr_payment_link_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    SELECT * INTO v_product
    FROM public.merchant_qr_payment_links
    WHERE qr_payment_link_id = v_product_id
      AND merchant_id = p_merchant_id
      AND status = 'active'
      AND recurring = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A selected QR product is unavailable';
    END IF;

    v_max_quantity := CASE WHEN v_product.allow_quantity THEN v_product.max_quantity ELSE 1 END;
    IF v_quantity < v_product.min_quantity OR v_quantity > v_max_quantity THEN
      RAISE EXCEPTION 'Quantity for % must be between % and %',
        v_product.product_reference, v_product.min_quantity, v_max_quantity;
    END IF;

    v_line_total := round(v_product.amount * v_quantity, 2);
    v_total := v_total + v_line_total;
    v_count := v_count + v_quantity;
    v_sort := v_sort + 1;
    IF v_total > 1000000 THEN
      RAISE EXCEPTION 'Basket total cannot exceed N$1,000,000.00';
    END IF;

    INSERT INTO public.merchant_qr_basket_items (
      basket_id,
      qr_payment_link_id,
      product_reference_snapshot,
      description_snapshot,
      unit_price_snapshot,
      quantity,
      line_total_snapshot,
      currency,
      sort_order
    ) VALUES (
      v_basket_id,
      v_product.qr_payment_link_id,
      v_product.product_reference,
      v_product.description,
      v_product.amount,
      v_quantity,
      v_line_total,
      v_product.currency,
      v_sort
    );
  END LOOP;

  UPDATE public.merchant_qr_baskets
  SET subtotal_amount = v_total,
      total_amount = v_total,
      item_count = v_count,
      locked_at = now()
  WHERE basket_id = v_basket_id;

  RETURN v_basket_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT basket_id INTO v_basket_id
    FROM public.merchant_qr_baskets
    WHERE merchant_id = p_merchant_id AND client_request_id = p_client_request_id;
    IF v_basket_id IS NULL THEN
      RAISE;
    END IF;
    RETURN v_basket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_merchant_qr_basket(p_basket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_basket public.merchant_qr_baskets%ROWTYPE;
BEGIN
  SELECT * INTO v_basket
  FROM public.merchant_qr_baskets
  WHERE basket_id = p_basket_id
  FOR UPDATE;

  IF FOUND AND v_basket.status = 'pending' AND v_basket.expires_at <= now() THEN
    UPDATE public.transactions
    SET status = 'expired', updated_at = now()
    WHERE basket_id = v_basket.basket_id AND status = 'pending';

    UPDATE public.merchant_qr_baskets
    SET status = 'expired'
    WHERE basket_id = v_basket.basket_id AND status = 'pending';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_qr_basket_transaction(
  p_slug text,
  p_payer_name text,
  p_email text,
  p_mobile text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_basket public.merchant_qr_baskets%ROWTYPE;
  v_business_name text;
  v_transaction_id uuid;
  v_merchant_client_id uuid;
BEGIN
  SELECT * INTO v_basket
  FROM public.merchant_qr_baskets
  WHERE slug = trim(p_slug)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Basket was not found';
  END IF;

  IF v_basket.status = 'pending' AND v_basket.expires_at <= now() THEN
    UPDATE public.transactions
    SET status = 'expired', updated_at = now()
    WHERE basket_id = v_basket.basket_id AND status = 'pending';
    UPDATE public.merchant_qr_baskets
    SET status = 'expired'
    WHERE basket_id = v_basket.basket_id;
    RAISE EXCEPTION 'This basket has expired';
  END IF;

  IF v_basket.status <> 'pending' THEN
    RAISE EXCEPTION 'This basket is %', v_basket.status;
  END IF;

  SELECT transaction_id INTO v_transaction_id
  FROM public.transactions
  WHERE basket_id = v_basket.basket_id;
  IF FOUND THEN
    IF v_basket.checkout_idempotency_key = p_idempotency_key THEN
      RETURN v_transaction_id;
    END IF;
    RAISE EXCEPTION 'Checkout has already started on another device';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Checkout idempotency key is required';
  END IF;
  IF length(trim(coalesce(p_payer_name, ''))) < 2 OR length(trim(p_payer_name)) > 120 THEN
    RAISE EXCEPTION 'Enter the customer name';
  END IF;

  SELECT business_name INTO v_business_name
  FROM public.merchants
  WHERE merchant_id = v_basket.merchant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant account was not found';
  END IF;

  v_merchant_client_id := public.get_or_create_merchant_client(
    v_basket.merchant_id,
    lower(trim(coalesce(p_email, ''))),
    trim(coalesce(p_mobile, ''))
  );

  INSERT INTO public.transactions (
    merchant_id,
    merchant_client_id,
    amount,
    type,
    payment_method,
    invoice_id,
    user_email,
    user_mobile,
    payer_name,
    business_name,
    basket_id
  ) VALUES (
    v_basket.merchant_id,
    v_merchant_client_id,
    v_basket.total_amount,
    'api',
    'paysme_code',
    'BASKET-' || upper(substr(v_basket.basket_id::text, 1, 8)),
    lower(trim(p_email)),
    trim(p_mobile),
    trim(p_payer_name),
    coalesce(v_business_name, 'PaySME'),
    v_basket.basket_id
  )
  RETURNING transaction_id INTO v_transaction_id;

  UPDATE public.merchant_qr_baskets
  SET checkout_started_at = now(), checkout_idempotency_key = p_idempotency_key
  WHERE basket_id = v_basket.basket_id;

  RETURN v_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_merchant_qr_basket(
  p_basket_id uuid,
  p_merchant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_basket public.merchant_qr_baskets%ROWTYPE;
BEGIN
  SELECT * INTO v_basket
  FROM public.merchant_qr_baskets
  WHERE basket_id = p_basket_id AND merchant_id = p_merchant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Basket was not found';
  END IF;
  IF v_basket.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending baskets can be cancelled';
  END IF;
  IF v_basket.checkout_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Checkout has already started and cannot be cancelled';
  END IF;

  UPDATE public.merchant_qr_baskets
  SET status = 'cancelled', cancelled_at = now()
  WHERE basket_id = p_basket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_qr_basket_transaction_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.basket_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  UPDATE public.merchant_qr_baskets
  SET status = NEW.status,
      paid_at = CASE WHEN NEW.status = 'paid' THEN coalesce(NEW.date_paid, now()) ELSE paid_at END,
      failed_at = CASE WHEN NEW.status = 'failed' THEN now() ELSE failed_at END,
      cancelled_at = CASE WHEN NEW.status = 'cancelled' THEN now() ELSE cancelled_at END
  WHERE basket_id = NEW.basket_id
    AND NEW.status IN ('paid', 'failed', 'expired', 'cancelled');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_qr_basket_transaction_status
AFTER UPDATE OF status ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_qr_basket_transaction_status();

REVOKE ALL ON FUNCTION public.create_merchant_qr_basket(uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_merchant_qr_basket(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_qr_basket_transaction(text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_merchant_qr_basket(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_merchant_qr_basket(uuid, uuid, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_merchant_qr_basket(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_qr_basket_transaction(text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_merchant_qr_basket(uuid, uuid) TO service_role;
