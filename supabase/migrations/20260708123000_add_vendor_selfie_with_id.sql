ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS selfie_path text;

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
