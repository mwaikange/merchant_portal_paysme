-- Update the handle_new_merchant trigger function to accept additional user metadata
CREATE OR REPLACE FUNCTION public.handle_new_merchant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert into merchants table with metadata from registration
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

  -- Also create initial KYC submission with registration data
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

-- Backfill existing merchants with data from their KYC submissions where available
UPDATE public.merchants 
SET 
  business_name = kyc.business_name,
  mobile_number = kyc.mobile_number,
  updated_at = now()
FROM public.kyc_submissions kyc
WHERE merchants.merchant_id = kyc.user_id 
  AND merchants.business_name IS NULL 
  AND kyc.business_name IS NOT NULL;

-- Update business_name in transactions to use the merchant's business name instead of "Test Business"  
UPDATE public.transactions 
SET business_name = m.business_name
FROM public.merchants m
WHERE transactions.merchant_id = m.merchant_id 
  AND m.business_name IS NOT NULL
  AND (transactions.business_name IS NULL OR transactions.business_name = 'Test Business');