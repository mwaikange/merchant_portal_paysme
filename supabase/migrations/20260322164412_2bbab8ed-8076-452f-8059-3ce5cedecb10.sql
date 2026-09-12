-- Update the merchants RLS policy to allow return_url to be updated
-- The current policy blocks changes to sms_credits, subscription_status, kyc_status, api_key
-- We need to keep that restriction but allow webhook_url and return_url changes

DROP POLICY IF EXISTS "Merchants can update safe fields only" ON public.merchants;

CREATE POLICY "Merchants can update safe fields only"
ON public.merchants
FOR UPDATE
TO public
USING (auth.uid() = merchant_id)
WITH CHECK (
  auth.uid() = merchant_id
  AND sms_credits = (SELECT m.sms_credits FROM merchants m WHERE m.merchant_id = auth.uid())
  AND (subscription_status)::text = ((SELECT m.subscription_status FROM merchants m WHERE m.merchant_id = auth.uid()))::text
  AND (kyc_status)::text = ((SELECT m.kyc_status FROM merchants m WHERE m.merchant_id = auth.uid()))::text
  AND (api_key)::text = ((SELECT m.api_key FROM merchants m WHERE m.merchant_id = auth.uid()))::text
);