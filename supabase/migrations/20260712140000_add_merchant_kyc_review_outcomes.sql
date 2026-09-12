-- Extend merchant KYC review states and expose admin audit messages read-only to merchants.

-- The existing protection trigger must not intercept this migration's normalization update.
DROP TRIGGER IF EXISTS trg_protect_merchant_kyc_admin_fields ON public.kyc_submissions;

UPDATE public.kyc_submissions
SET kyc_status = CASE
  WHEN LOWER(TRIM(kyc_status)) IN ('complete', 'completed') THEN 'approved'
  WHEN LOWER(TRIM(kyc_status)) IN ('rejected', 'denied') THEN 'declined'
  WHEN LOWER(TRIM(kyc_status)) IN ('incomplete', 'pending', 'processing', 'sent_back', 'declined', 'approved')
    THEN LOWER(TRIM(kyc_status))
  ELSE 'incomplete'
END;

DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.kyc_submissions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kyc_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.kyc_submissions DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.kyc_submissions
  ADD CONSTRAINT kyc_submissions_kyc_status_check
  CHECK (kyc_status IN ('incomplete', 'pending', 'processing', 'sent_back', 'declined', 'approved'));

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE admin_users.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.protect_merchant_kyc_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  -- SQL Editor and service-role operations do not carry a merchant user JWT.
  IF auth.uid() IS NULL OR auth.role() = 'service_role' OR public.is_current_user_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'KYC submission does not belong to the current user';
  END IF;

  v_new_status := LOWER(TRIM(COALESCE(NEW.kyc_status, 'incomplete')));

  IF TG_OP = 'INSERT' THEN
    NEW.kyc_status := CASE
      WHEN v_new_status = 'pending' AND NEW.finalized IS TRUE AND NEW.documents_uploaded IS TRUE
        THEN 'pending'
      ELSE 'incomplete'
    END;
    NEW.banking_verified := false;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_notes := NULL;
    RETURN NEW;
  END IF;

  v_old_status := LOWER(TRIM(COALESCE(OLD.kyc_status, 'incomplete')));

  IF v_old_status IN ('pending', 'processing', 'approved', 'declined') THEN
    RAISE EXCEPTION 'KYC cannot be edited while its status is %', v_old_status;
  END IF;

  IF v_old_status NOT IN ('incomplete', 'sent_back') THEN
    RAISE EXCEPTION 'Unsupported merchant KYC status transition';
  END IF;

  IF v_new_status = 'pending' THEN
    IF NEW.finalized IS NOT TRUE OR NEW.documents_uploaded IS NOT TRUE THEN
      RAISE EXCEPTION 'KYC must be finalized with uploaded documents before submission';
    END IF;

    NEW.kyc_status := 'pending';
    NEW.banking_verified := false;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_notes := NULL;
  ELSIF v_new_status = v_old_status THEN
    NEW.kyc_status := OLD.kyc_status;
    NEW.banking_verified := OLD.banking_verified;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.review_notes := OLD.review_notes;
  ELSE
    RAISE EXCEPTION 'Merchants may only submit KYC as pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_merchant_kyc_admin_fields ON public.kyc_submissions;
CREATE TRIGGER trg_protect_merchant_kyc_admin_fields
BEFORE INSERT OR UPDATE ON public.kyc_submissions
FOR EACH ROW
EXECUTE FUNCTION public.protect_merchant_kyc_admin_fields();

ALTER TABLE public.merchant_kyc_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants can view own KYC activity" ON public.merchant_kyc_activity_log;
CREATE POLICY "Merchants can view own KYC activity"
ON public.merchant_kyc_activity_log
FOR SELECT
TO authenticated
USING (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view merchant KYC activity" ON public.merchant_kyc_activity_log;
CREATE POLICY "Admins can view merchant KYC activity"
ON public.merchant_kyc_activity_log
FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can create merchant KYC activity" ON public.merchant_kyc_activity_log;
CREATE POLICY "Admins can create merchant KYC activity"
ON public.merchant_kyc_activity_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_current_user_admin());

GRANT SELECT, INSERT ON public.merchant_kyc_activity_log TO authenticated;
GRANT ALL ON public.merchant_kyc_activity_log TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'kyc_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kyc_submissions;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'merchant_kyc_activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_kyc_activity_log;
  END IF;
END;
$$;
