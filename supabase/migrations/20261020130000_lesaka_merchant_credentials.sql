BEGIN;

-- AES-256-GCM encrypted by the Edge Function BEFORE database writes. The key
-- lives in server secrets, outside the database. No browser SELECT policies.
CREATE TABLE IF NOT EXISTS public.lesaka_merchant_credentials (
  merchant_id uuid NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  encrypted_credentials jsonb NOT NULL CHECK (
    jsonb_typeof(encrypted_credentials) = 'object' AND
    encrypted_credentials ?& ARRAY['version', 'iv', 'ciphertext'] AND
    encrypted_credentials->>'version' = '1' AND
    jsonb_typeof(encrypted_credentials->'iv') = 'string' AND
    jsonb_typeof(encrypted_credentials->'ciphertext') = 'string'
  ),
  store_id text CHECK (length(store_id) <= 128),
  credential_version uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, environment)
);
ALTER TABLE public.lesaka_merchant_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesaka_merchant_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lesaka_merchant_credentials TO service_role;

ALTER TABLE public.lesaka_voucher_attempts ADD COLUMN IF NOT EXISTS credential_version uuid;

-- The endpoint validates merchant API permissions before invoking this
-- server-only function. Save credentials and facilitator binding atomically.
CREATE OR REPLACE FUNCTION public.save_lesaka_merchant_credentials(
  p_merchant_id uuid, p_environment text, p_credentials jsonb, p_store_id text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE fid uuid;
BEGIN
  SELECT facilitator_id INTO fid FROM public.facilitators WHERE facilitator_key = 'kazang' AND status = 'active';
  IF fid IS NULL THEN RAISE EXCEPTION 'Lesaka facilitator is not configured'; END IF;
  PERFORM 1 FROM public.merchants WHERE merchant_id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Merchant was not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.lesaka_voucher_attempts
    WHERE merchant_id = p_merchant_id AND environment = p_environment
      AND status IN ('redeeming', 'uncertain', 'redeemed', 'reconciliation_required')
  ) THEN
    RAISE EXCEPTION 'Resolve pending Lesaka voucher payments before replacing credentials';
  END IF;
  INSERT INTO public.lesaka_merchant_credentials (merchant_id, environment, encrypted_credentials, store_id)
  VALUES (p_merchant_id, p_environment, p_credentials, nullif(btrim(p_store_id), ''))
  ON CONFLICT (merchant_id, environment) DO UPDATE SET
    encrypted_credentials = EXCLUDED.encrypted_credentials,
    store_id = EXCLUDED.store_id, credential_version = gen_random_uuid(), updated_at = now();

  INSERT INTO public.merchant_payment_facilitators
    (merchant_id, facilitator_id, provider_key, provider_display_name, provider_merchant_code, status, enabled)
  VALUES (p_merchant_id, fid, 'kazang', 'Lesaka', '', 'pending', true)
  ON CONFLICT (merchant_id, provider_key) DO UPDATE SET
    facilitator_id = EXCLUDED.facilitator_id, provider_display_name = 'Lesaka';
END;
$$;
REVOKE ALL ON FUNCTION public.save_lesaka_merchant_credentials(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_lesaka_merchant_credentials(uuid, text, jsonb, text) TO service_role;

UPDATE public.facilitators SET display_name = 'Lesaka' WHERE facilitator_key = 'kazang';
UPDATE public.merchant_payment_facilitators SET provider_display_name = 'Lesaka' WHERE provider_key = 'kazang';

COMMENT ON TABLE public.lesaka_merchant_credentials IS
  'Per-merchant AES-256-GCM encrypted Lesaka credentials. Key is stored outside the DB. Server access only; plaintext is never returned to browsers.';
COMMIT;
