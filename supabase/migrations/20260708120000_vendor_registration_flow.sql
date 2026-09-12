-- Vendor website registration must not be treated as merchant signup.
CREATE OR REPLACE FUNCTION public.handle_new_merchant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := COALESCE(
    NEW.raw_user_meta_data ->> 'role',
    NEW.raw_user_meta_data ->> 'user_type'
  );
BEGIN
  IF v_role IS DISTINCT FROM 'merchant' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.merchants (
    merchant_id,
    email,
    business_name,
    mobile_number,
    vendor_id,
    api_key,
    setup_complete,
    subscription_status,
    kyc_status,
    sms_credits
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'business_name', NEW.raw_user_meta_data ->> 'businessName'),
    COALESCE(NEW.raw_user_meta_data ->> 'mobile_number', NEW.raw_user_meta_data ->> 'mobile'),
    'USV_' || UPPER(SUBSTR(REPLACE(NEW.id::text, '-', ''), 1, 8)),
    'pk_' || REPLACE(gen_random_uuid()::text, '-', ''),
    false,
    'inactive',
    'pending',
    0
  );

  INSERT INTO public.kyc_submissions (
    user_id,
    email,
    business_name,
    first_name,
    last_name,
    mobile_number,
    business_type,
    industry,
    kyc_status
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'business_name', NEW.raw_user_meta_data ->> 'businessName'),
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'firstName'),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', NEW.raw_user_meta_data ->> 'surname'),
    COALESCE(NEW.raw_user_meta_data ->> 'mobile_number', NEW.raw_user_meta_data ->> 'mobile'),
    COALESCE(NEW.raw_user_meta_data ->> 'business_type', NEW.raw_user_meta_data ->> 'businessType'),
    COALESCE(NEW.raw_user_meta_data ->> 'business_industry', NEW.raw_user_meta_data ->> 'businessIndustry'),
    'pending'
  );

  RETURN NEW;
END;
$function$;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS surname text,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS id_number_hash text,
  ADD COLUMN IF NOT EXISTS credit_application_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS mobile_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temp_password_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS id_front_path text,
  ADD COLUMN IF NOT EXISTS id_back_path text,
  ADD COLUMN IF NOT EXISTS selfie_path text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_id_number_hash ON public.vendors(id_number_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_mobile_number_unique ON public.vendors(mobile_number) WHERE mobile_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vendor_registration_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
  sms_code_hash text NOT NULL,
  sms_expires_at timestamptz NOT NULL,
  sms_verified_at timestamptz,
  email_token_hash text,
  email_confirmed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_registration_confirmations_vendor
  ON public.vendor_registration_confirmations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_registration_confirmations_email_token
  ON public.vendor_registration_confirmations(email_token_hash);

ALTER TABLE public.vendor_registration_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to vendor registration confirmations"
  ON public.vendor_registration_confirmations;
CREATE POLICY "Service role full access to vendor registration confirmations"
  ON public.vendor_registration_confirmations FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-documents', 'vendor-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Service role full access to vendor-documents" ON storage.objects;
CREATE POLICY "Service role full access to vendor-documents"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'vendor-documents')
WITH CHECK (bucket_id = 'vendor-documents');
