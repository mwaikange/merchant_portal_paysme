-- Remove existing overly permissive payment_providers policies
DROP POLICY IF EXISTS "Anonymous can read payment providers" ON public.payment_providers;
DROP POLICY IF EXISTS "Authenticated users can view payment providers" ON public.payment_providers;

-- Create a secure function for webhook signature validation (used by edge functions)
CREATE OR REPLACE FUNCTION public.get_provider_signature_key(provider_name TEXT)
RETURNS TEXT AS $$
DECLARE
  signature_key TEXT;
BEGIN
  SELECT pp.signature_key INTO signature_key
  FROM public.payment_providers pp
  WHERE pp.name = provider_name 
    AND pp.status = 'active';
  
  RETURN signature_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a secure function for getting basic provider info (non-sensitive data only)
CREATE OR REPLACE FUNCTION public.get_provider_basic_info()
RETURNS TABLE (
  payment_provider_id UUID,
  name VARCHAR,
  status VARCHAR,
  contact_email VARCHAR,
  contact_number VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pp.payment_provider_id,
    pp.name,
    pp.status,
    pp.contact_email,
    pp.contact_number,
    pp.created_at
  FROM public.payment_providers pp
  WHERE pp.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create restricted RLS policy - only system functions can access sensitive data
CREATE POLICY "System functions can access payment providers"
  ON public.payment_providers
  FOR SELECT
  USING (false); -- No direct access - must use security definer functions

-- Allow basic provider info through the secure function for authenticated users
-- This will be handled through the function calls, not direct table access

-- Grant execute permissions on the functions to authenticated users for webhook processing
GRANT EXECUTE ON FUNCTION public.get_provider_signature_key(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_basic_info() TO authenticated;