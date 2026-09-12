-- Create a secure function to expose merchant public info (business_name) without requiring auth
CREATE OR REPLACE FUNCTION public.get_merchant_public_info(p_merchant_id uuid)
RETURNS TABLE(merchant_id uuid, business_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT m.merchant_id, COALESCE(m.business_name, 'PaySME Store')
  FROM public.merchants m
  WHERE m.merchant_id = p_merchant_id;
END;
$$;

-- Comments for clarity
COMMENT ON FUNCTION public.get_merchant_public_info(uuid)
IS 'Returns limited public info (business_name) for a merchant id; SECURITY DEFINER enables anon access.';