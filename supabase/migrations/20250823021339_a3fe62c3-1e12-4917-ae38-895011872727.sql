-- Create default PaySME merchant account
INSERT INTO public.merchants (
  merchant_id, 
  email, 
  vendor_id, 
  api_key, 
  business_name, 
  mobile_number, 
  setup_complete, 
  subscription_status, 
  kyc_status, 
  sms_credits,
  subscription_end_date
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'mwaikange@gmail.com',
  'VEN-0098', 
  'pk_paysme_default_merchant_key_2024',
  'PaySME',
  '0818083704',
  true,
  'active',
  'completed',
  999999,
  '2035-08-22T00:00:00.000Z'
) ON CONFLICT (merchant_id) DO UPDATE SET
  email = EXCLUDED.email,
  vendor_id = EXCLUDED.vendor_id,
  business_name = EXCLUDED.business_name,
  mobile_number = EXCLUDED.mobile_number,
  setup_complete = EXCLUDED.setup_complete,
  subscription_status = EXCLUDED.subscription_status,
  kyc_status = EXCLUDED.kyc_status,
  sms_credits = EXCLUDED.sms_credits,
  subscription_end_date = EXCLUDED.subscription_end_date;

-- Update the generate_pay_code function to generate numeric only codes
CREATE OR REPLACE FUNCTION public.generate_pay_code()
RETURNS text
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN (
    SELECT string_agg(
      (floor(random() * 10))::text, 
      ''
    )
    FROM generate_series(1, 12)
  );
END;
$function$;