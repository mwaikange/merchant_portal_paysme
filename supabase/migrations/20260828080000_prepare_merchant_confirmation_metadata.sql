-- Prepare merchant identity metadata before Supabase Auth renders its first
-- confirmation email. This guarantees the template already has the USV ID and
-- avoids racing a second custom welcome email against Supabase's own mailer.
CREATE OR REPLACE FUNCTION public.prepare_auth_user_account_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role text := COALESCE(
    NEW.raw_user_meta_data ->> 'role',
    NEW.raw_user_meta_data ->> 'user_type'
  );
  v_has_merchant_form boolean :=
    COALESCE(NEW.raw_user_meta_data ->> 'business_name', NEW.raw_user_meta_data ->> 'businessName') IS NOT NULL
    AND COALESCE(NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'firstName') IS NOT NULL
    AND COALESCE(NEW.raw_user_meta_data ->> 'business_type', NEW.raw_user_meta_data ->> 'businessType') IS NOT NULL;
  v_vendor_id text;
BEGIN
  IF v_role = 'merchant' OR (v_role IS NULL AND v_has_merchant_form) THEN
    v_vendor_id := 'USV_' || UPPER(SUBSTR(REPLACE(NEW.id::text, '-', ''), 1, 8));
    NEW.raw_user_meta_data :=
      COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'role', 'merchant',
        'user_type', 'merchant',
        'vendor_id', v_vendor_id
      );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prepare_auth_user_account_metadata_before_insert
ON auth.users;

CREATE TRIGGER prepare_auth_user_account_metadata_before_insert
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.prepare_auth_user_account_metadata();

-- The branded Supabase confirmation template now serves as the welcome email.
-- Sending another SMTP email from a merchant insert caused a mail race during
-- registration and could make the initial confirmation message fail.
DROP TRIGGER IF EXISTS trigger_send_welcome_email ON public.merchants;
