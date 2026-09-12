
-- Create a SECURITY DEFINER function to add SMS credits when SMS top-up payment is confirmed
-- This will be called by the webhook handler (service_role) when an SMS type transaction is paid
CREATE OR REPLACE FUNCTION public.add_sms_credits(p_merchant_id uuid, p_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE merchants
  SET sms_credits = COALESCE(sms_credits, 0) + p_count,
      updated_at = NOW()
  WHERE merchant_id = p_merchant_id;
END;
$$;
