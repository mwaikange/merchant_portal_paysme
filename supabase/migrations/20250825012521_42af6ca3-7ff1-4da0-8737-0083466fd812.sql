-- Remove the overly permissive anonymous read policy that exposes customer data
DROP POLICY IF EXISTS "Anonymous can read pending transactions" ON public.transactions;

-- Create a secure function for payment validation that only returns non-sensitive data
CREATE OR REPLACE FUNCTION public.validate_payment_code(pay_code TEXT)
RETURNS TABLE (
  transaction_id VARCHAR,
  generated_code VARCHAR,
  amount NUMERIC,
  status VARCHAR,
  business_name TEXT,
  date_generated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.transaction_id,
    t.generated_code,
    t.amount,
    t.status,
    t.business_name,
    t.date_generated
  FROM public.transactions t
  WHERE t.generated_code = pay_code 
    AND t.status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Create a more restrictive policy for payment code validation only
-- This replaces the dangerous anonymous read access with secure function-based access
CREATE POLICY "Anonymous can validate payment codes only"
  ON public.transactions
  FOR SELECT
  TO anon
  USING (
    -- Only allow reading transactions through the secure validation function
    -- This policy will be used in conjunction with the security definer function
    generated_code IS NOT NULL 
    AND status = 'pending'
    AND current_setting('app.payment_validation', true) = 'true'
  );

-- Grant execute permission on the validation function to anonymous users
GRANT EXECUTE ON FUNCTION public.validate_payment_code(TEXT) TO anon;