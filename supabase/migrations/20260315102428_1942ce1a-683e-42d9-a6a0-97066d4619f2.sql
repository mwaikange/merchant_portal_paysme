
-- 1. Create server-side function to safely deduct SMS credits
CREATE OR REPLACE FUNCTION public.deduct_sms_credits(p_count integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE merchants
  SET sms_credits = sms_credits - p_count,
      updated_at = NOW()
  WHERE merchant_id = auth.uid()
    AND sms_credits >= p_count;
  
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_sms_credits(integer) TO authenticated;

-- 2. Replace the broad UPDATE policy with one that protects critical fields
DROP POLICY IF EXISTS "Merchants can update their own data" ON public.merchants;

CREATE POLICY "Merchants can update safe fields only"
  ON public.merchants
  FOR UPDATE
  USING (auth.uid() = merchant_id)
  WITH CHECK (
    auth.uid() = merchant_id AND
    sms_credits = (SELECT m.sms_credits FROM merchants m WHERE m.merchant_id = auth.uid()) AND
    subscription_status = (SELECT m.subscription_status FROM merchants m WHERE m.merchant_id = auth.uid()) AND
    kyc_status = (SELECT m.kyc_status FROM merchants m WHERE m.merchant_id = auth.uid()) AND
    api_key = (SELECT m.api_key FROM merchants m WHERE m.merchant_id = auth.uid())
  );
