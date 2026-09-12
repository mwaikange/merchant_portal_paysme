-- Shared identity registry for all applications using this Supabase project.
-- A user may hold more than one role, so the primary key includes user_type.
CREATE TABLE IF NOT EXISTS public.user_accounts (
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type text NOT NULL CHECK (user_type IN ('merchant', 'vendor', 'admin')),
  source_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id, user_type)
);

CREATE INDEX IF NOT EXISTS user_accounts_user_type_idx
  ON public.user_accounts (user_type, auth_user_id);

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own account types" ON public.user_accounts;
CREATE POLICY "Users can read their own account types"
ON public.user_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "PaySME admins can read account types" ON public.user_accounts;
CREATE POLICY "PaySME admins can read account types"
ON public.user_accounts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users admin_user
    WHERE admin_user.auth_user_id = auth.uid()
      AND admin_user.is_active = true
  )
);

DROP POLICY IF EXISTS "Service role manages account types" ON public.user_accounts;
CREATE POLICY "Service role manages account types"
ON public.user_accounts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT ON public.user_accounts TO authenticated;
GRANT ALL ON public.user_accounts TO service_role;

CREATE OR REPLACE FUNCTION public.sync_merchant_user_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.user_accounts
    WHERE auth_user_id = OLD.merchant_id AND user_type = 'merchant';
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.merchant_id IS DISTINCT FROM NEW.merchant_id THEN
    DELETE FROM public.user_accounts
    WHERE auth_user_id = OLD.merchant_id AND user_type = 'merchant';
  END IF;

  INSERT INTO public.user_accounts (auth_user_id, user_type, source_record_id, updated_at)
  VALUES (NEW.merchant_id, 'merchant', NEW.merchant_id, now())
  ON CONFLICT (auth_user_id, user_type)
  DO UPDATE SET source_record_id = EXCLUDED.source_record_id, updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_vendor_user_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.auth_user_id IS NOT NULL THEN
      DELETE FROM public.user_accounts
      WHERE auth_user_id = OLD.auth_user_id AND user_type = 'vendor';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id
     AND OLD.auth_user_id IS NOT NULL THEN
    DELETE FROM public.user_accounts
    WHERE auth_user_id = OLD.auth_user_id AND user_type = 'vendor';
  END IF;

  IF NEW.auth_user_id IS NOT NULL THEN
    INSERT INTO public.user_accounts (auth_user_id, user_type, source_record_id, updated_at)
    VALUES (NEW.auth_user_id, 'vendor', NEW.vendor_id, now())
    ON CONFLICT (auth_user_id, user_type)
    DO UPDATE SET source_record_id = EXCLUDED.source_record_id, updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_admin_user_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.auth_user_id IS NOT NULL THEN
      DELETE FROM public.user_accounts
      WHERE auth_user_id = OLD.auth_user_id AND user_type = 'admin';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id
     AND OLD.auth_user_id IS NOT NULL THEN
    DELETE FROM public.user_accounts
    WHERE auth_user_id = OLD.auth_user_id AND user_type = 'admin';
  END IF;

  IF NEW.auth_user_id IS NOT NULL THEN
    INSERT INTO public.user_accounts (auth_user_id, user_type, source_record_id, updated_at)
    VALUES (NEW.auth_user_id, 'admin', NEW.id, now())
    ON CONFLICT (auth_user_id, user_type)
    DO UPDATE SET source_record_id = EXCLUDED.source_record_id, updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_merchant_user_account_trigger ON public.merchants;
CREATE TRIGGER sync_merchant_user_account_trigger
AFTER INSERT OR UPDATE OF merchant_id OR DELETE ON public.merchants
FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_user_account();

DROP TRIGGER IF EXISTS sync_vendor_user_account_trigger ON public.vendors;
CREATE TRIGGER sync_vendor_user_account_trigger
AFTER INSERT OR UPDATE OF auth_user_id OR DELETE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.sync_vendor_user_account();

DROP TRIGGER IF EXISTS sync_admin_user_account_trigger ON public.admin_users;
CREATE TRIGGER sync_admin_user_account_trigger
AFTER INSERT OR UPDATE OF auth_user_id OR DELETE ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_user_account();

INSERT INTO public.user_accounts (auth_user_id, user_type, source_record_id)
SELECT merchant_id, 'merchant', merchant_id
FROM public.merchants
ON CONFLICT (auth_user_id, user_type)
DO UPDATE SET source_record_id = EXCLUDED.source_record_id, updated_at = now();

INSERT INTO public.user_accounts (auth_user_id, user_type, source_record_id)
SELECT auth_user_id, 'vendor', vendor_id
FROM public.vendors
WHERE auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id, user_type)
DO UPDATE SET source_record_id = EXCLUDED.source_record_id, updated_at = now();

INSERT INTO public.user_accounts (auth_user_id, user_type, source_record_id)
SELECT auth_user_id, 'admin', id
FROM public.admin_users
WHERE auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id, user_type)
DO UPDATE SET source_record_id = EXCLUDED.source_record_id, updated_at = now();
