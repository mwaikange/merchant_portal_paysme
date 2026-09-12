-- Fix webhook_logs: restrict access to merchant's own logs only
DROP POLICY IF EXISTS "Authenticated users can view webhook logs" ON public.webhook_logs;

-- Merchants can only view webhook logs related to their own transactions
CREATE POLICY "Merchants can view their own webhook logs" 
ON public.webhook_logs 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.transaction_id = (webhook_logs.payload->>'transaction_id')
    AND t.merchant_id = auth.uid()
  )
);