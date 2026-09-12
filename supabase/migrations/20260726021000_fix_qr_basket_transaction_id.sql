-- PaySME transaction IDs are varchar values such as "tx_..."; they are not UUIDs.
-- Recreate the basket checkout RPC with a text return type to match transactions.
DROP FUNCTION IF EXISTS public.create_qr_basket_transaction(text, text, text, text, uuid);

CREATE FUNCTION public.create_qr_basket_transaction(
  p_slug text,
  p_payer_name text,
  p_email text,
  p_mobile text,
  p_idempotency_key uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_basket public.merchant_qr_baskets%ROWTYPE;
  v_business_name text;
  v_transaction_id text;
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

REVOKE ALL ON FUNCTION public.create_qr_basket_transaction(text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_qr_basket_transaction(text, text, text, text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
