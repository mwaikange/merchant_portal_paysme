-- Fix RPC return type mismatch and grant execute
DROP FUNCTION IF EXISTS public.get_merchant_public_info(uuid);

CREATE OR REPLACE FUNCTION public.get_merchant_public_info(p_merchant_id uuid)
RETURNS TABLE (
  merchant_id uuid,
  business_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    m.merchant_id,
    COALESCE(m.business_name::text, 'PaySME Store'::text)
  FROM public.merchants m
  WHERE m.merchant_id = p_merchant_id;
END;
$function$;

-- Ensure the web client can call this function
GRANT EXECUTE ON FUNCTION public.get_merchant_public_info(uuid) TO anon, authenticated;