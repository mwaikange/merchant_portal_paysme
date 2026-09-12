-- Remove the problematic policy that still allows some anonymous access
DROP POLICY IF EXISTS "Anonymous can validate payment codes only" ON public.transactions;

-- The transactions table should have NO anonymous access
-- All payment validation should go through the secure validate_payment_code function
-- This completely eliminates the data exposure risk

-- Update the existing "Payment vendors can validate by code only" policy to be more restrictive
-- This policy was too broad and allowed reading all transaction data
DROP POLICY IF EXISTS "Payment vendors can validate by code only" ON public.transactions;

-- Create a very restrictive policy only for authenticated payment processing systems
-- This requires proper authentication and limits data exposure
CREATE POLICY "Authenticated payment systems can validate codes"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    generated_code IS NOT NULL 
    AND status = 'pending'
    AND (auth.jwt() ->> 'provider_name') IS NOT NULL
  );