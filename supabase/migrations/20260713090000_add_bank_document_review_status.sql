-- Track bank-document review independently and keep proof-of-banking paths synchronized.

DROP TRIGGER IF EXISTS trg_protect_merchant_kyc_admin_fields ON public.kyc_submissions;
DROP TRIGGER IF EXISTS trg_protect_merchant_kyc_admin_fields_update ON public.kyc_submissions;

ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS bank_doc_status TEXT;

UPDATE public.kyc_submissions
SET bank_doc_status = CASE
  WHEN banking_verified IS TRUE THEN 'verified'
  WHEN LOWER(TRIM(kyc_status)) IN ('sent_back', 'declined') THEN 'sent_back'
  WHEN LOWER(TRIM(kyc_status)) IN ('pending', 'processing') THEN 'pending'
  ELSE bank_doc_status
END
WHERE bank_doc_status IS NULL
   OR bank_doc_status NOT IN ('pending', 'sent_back', 'verified');

ALTER TABLE public.kyc_submissions
  DROP CONSTRAINT IF EXISTS kyc_submissions_bank_doc_status_check;

ALTER TABLE public.kyc_submissions
  ADD CONSTRAINT kyc_submissions_bank_doc_status_check
  CHECK (bank_doc_status IS NULL OR bank_doc_status IN ('pending', 'sent_back', 'verified'));

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
    NEW.bank_doc_status := NULL;
    NEW.banking_verified := false;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_notes := NULL;
    RETURN NEW;
  END IF;

  v_old_status := LOWER(TRIM(COALESCE(OLD.kyc_status, 'incomplete')));

  IF OLD.bank_doc_status = 'sent_back' THEN
    RAISE EXCEPTION 'Only replacement bank documents may be uploaded while banking documents are sent back';
  END IF;

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
    NEW.bank_doc_status := OLD.bank_doc_status;
    NEW.banking_verified := false;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_notes := NULL;
  ELSIF v_new_status = v_old_status THEN
    NEW.kyc_status := OLD.kyc_status;
    NEW.bank_doc_status := OLD.bank_doc_status;
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

CREATE TRIGGER trg_protect_merchant_kyc_admin_fields
BEFORE INSERT ON public.kyc_submissions
FOR EACH ROW
EXECUTE FUNCTION public.protect_merchant_kyc_admin_fields();

CREATE TRIGGER trg_protect_merchant_kyc_admin_fields_update
BEFORE UPDATE OF
  user_id,
  business_type,
  business_name,
  first_name,
  last_name,
  email,
  mobile_number,
  date_of_birth,
  id_number,
  region,
  town,
  address,
  income_source,
  annual_income,
  industry,
  bank_name,
  branch,
  branch_code,
  account_number,
  account_holder_name,
  account_type,
  kyc_status,
  bank_doc_status,
  banking_verified,
  finalized,
  reviewed_by,
  reviewed_at,
  review_notes
ON public.kyc_submissions
FOR EACH ROW
EXECUTE FUNCTION public.protect_merchant_kyc_admin_fields();

CREATE OR REPLACE FUNCTION public.refresh_kyc_document_rollup(p_submission_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.kyc_submissions AS submission
  SET document_urls = COALESCE(
        (
          SELECT array_agg(document.document_url ORDER BY document.uploaded_at, document.id)
          FROM public.kyc_documents AS document
          WHERE document.kyc_submission_id = p_submission_id
        ),
        ARRAY[]::TEXT[]
      ),
      proof_of_banking_document_url = (
        SELECT document.document_url
        FROM public.kyc_documents AS document
        WHERE document.kyc_submission_id = p_submission_id
          AND document.document_type IN ('banking_confirmation', 'bank_statement', 'proof_of_banking')
        ORDER BY
          CASE document.document_type
            WHEN 'banking_confirmation' THEN 1
            WHEN 'bank_statement' THEN 2
            ELSE 3
          END,
          document.uploaded_at DESC,
          document.id DESC
        LIMIT 1
      ),
      documents_uploaded = EXISTS (
        SELECT 1
        FROM public.kyc_documents AS document
        WHERE document.kyc_submission_id = p_submission_id
      )
  WHERE submission.id = p_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_kyc_document_rollup_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_kyc_document_rollup(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.kyc_submission_id ELSE NEW.kyc_submission_id END
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_kyc_document_rollup ON public.kyc_documents;
CREATE TRIGGER trg_refresh_kyc_document_rollup
AFTER INSERT OR UPDATE OR DELETE ON public.kyc_documents
FOR EACH ROW
EXECUTE FUNCTION public.refresh_kyc_document_rollup_trigger();

DO $$
DECLARE
  v_submission_id UUID;
BEGIN
  FOR v_submission_id IN SELECT id FROM public.kyc_submissions
  LOOP
    PERFORM public.refresh_kyc_document_rollup(v_submission_id);
  END LOOP;
END;
$$;
