-- pgcrypto is installed in the extensions schema on hosted Supabase projects.
-- The basket RPC generates its hosted slug with gen_random_bytes().
ALTER FUNCTION public.create_merchant_qr_basket(uuid, uuid, jsonb, integer)
  SET search_path TO public, extensions;

-- Ensure the basket RPCs added by the preceding migration are visible through
-- the PostgREST API immediately after deployment.
NOTIFY pgrst, 'reload schema';
