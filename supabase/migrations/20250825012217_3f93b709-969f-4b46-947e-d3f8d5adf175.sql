-- Fix security definer functions by setting search_path
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';