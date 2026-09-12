-- GoTrue's admin user-list endpoint scans these Auth token fields as strings.
-- A legacy/manual Auth row containing SQL NULL can therefore make the entire
-- /admin/users request fail with "converting NULL to string is unsupported".

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change = COALESCE(email_change, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR email_change IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;

CREATE OR REPLACE FUNCTION public.normalize_auth_user_token_strings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  NEW.confirmation_token := COALESCE(NEW.confirmation_token, '');
  NEW.recovery_token := COALESCE(NEW.recovery_token, '');
  NEW.email_change_token_new := COALESCE(NEW.email_change_token_new, '');
  NEW.email_change_token_current := COALESCE(NEW.email_change_token_current, '');
  NEW.email_change := COALESCE(NEW.email_change, '');
  NEW.phone_change := COALESCE(NEW.phone_change, '');
  NEW.phone_change_token := COALESCE(NEW.phone_change_token, '');
  NEW.reauthentication_token := COALESCE(NEW.reauthentication_token, '');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_auth_user_token_strings() FROM PUBLIC;

DROP TRIGGER IF EXISTS normalize_auth_user_token_strings
  ON auth.users;
CREATE TRIGGER normalize_auth_user_token_strings
BEFORE INSERT OR UPDATE OF
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  email_change,
  phone_change,
  phone_change_token,
  reauthentication_token
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.normalize_auth_user_token_strings();

COMMENT ON FUNCTION public.normalize_auth_user_token_strings() IS
  'Keeps GoTrue Auth token string fields non-null so /admin/users can scan every user row.';
