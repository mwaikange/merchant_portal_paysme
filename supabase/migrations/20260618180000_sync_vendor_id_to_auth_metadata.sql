-- Make merchants.vendor_id available to Supabase Auth email templates.
-- Supabase templates can read auth user metadata through {{ .Data.vendor_id }},
-- but they cannot query public.merchants directly.

CREATE OR REPLACE FUNCTION public.sync_merchant_vendor_id_to_auth_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data =
    COALESCE(raw_user_meta_data, '{}'::jsonb) ||
    jsonb_build_object('vendor_id', NEW.vendor_id)
  WHERE id = NEW.merchant_id
    AND NEW.vendor_id IS NOT NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_merchant_vendor_id_to_auth_metadata
ON public.merchants;

CREATE TRIGGER sync_merchant_vendor_id_to_auth_metadata
AFTER INSERT OR UPDATE OF vendor_id
ON public.merchants
FOR EACH ROW
EXECUTE FUNCTION public.sync_merchant_vendor_id_to_auth_metadata();

-- Backfill existing merchant auth users so reset/welcome templates can show USV ID.
UPDATE auth.users AS u
SET raw_user_meta_data =
  COALESCE(u.raw_user_meta_data, '{}'::jsonb) ||
  jsonb_build_object('vendor_id', m.vendor_id)
FROM public.merchants AS m
WHERE u.id = m.merchant_id
  AND m.vendor_id IS NOT NULL;
