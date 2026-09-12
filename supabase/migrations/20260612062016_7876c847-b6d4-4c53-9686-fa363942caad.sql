
-- 1. Remove anon-readable vendor policy
DROP POLICY IF EXISTS "Vendors can login by vendor_code" ON public.vendors;

-- 2. Fix vendor_token_advances: replace user_metadata-based policies
DROP POLICY IF EXISTS "Vendor can view own advances" ON public.vendor_token_advances;
DROP POLICY IF EXISTS "Vendor can update own advances" ON public.vendor_token_advances;

CREATE POLICY "Vendor can view own advances"
ON public.vendor_token_advances
FOR SELECT
TO authenticated
USING (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Vendor can update own advances"
ON public.vendor_token_advances
FOR UPDATE
TO authenticated
USING (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()))
WITH CHECK (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

-- 3. Remove overly broad vendor_kyc_applications policies
DROP POLICY IF EXISTS "Authenticated users can read vendor_kyc_applications" ON public.vendor_kyc_applications;
DROP POLICY IF EXISTS "Authenticated users can update vendor_kyc_applications" ON public.vendor_kyc_applications;

-- 4. Restrict vendors self-update to safe columns via column-level GRANT
REVOKE UPDATE ON public.vendors FROM authenticated;
GRANT UPDATE (full_name, mobile_number, pin_hash, password_hash, password_changed, temp_password, updated_at)
  ON public.vendors TO authenticated;

-- 5. Hide materialized view from public API
REVOKE ALL ON public.admin_dashboard_stats FROM anon, authenticated;
GRANT SELECT ON public.admin_dashboard_stats TO service_role;

-- 6. Storage policies for private vendor-kyc-documents bucket.
-- Convention: object path = '{vendor_id}/...'
DROP POLICY IF EXISTS "Vendor can read own KYC documents" ON storage.objects;
DROP POLICY IF EXISTS "Vendor can upload own KYC documents" ON storage.objects;
DROP POLICY IF EXISTS "Vendor can update own KYC documents" ON storage.objects;
DROP POLICY IF EXISTS "Vendor can delete own KYC documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access to vendor-kyc-documents" ON storage.objects;

CREATE POLICY "Vendor can read own KYC documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vendor-kyc-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT vendor_id::text FROM public.vendors WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "Vendor can upload own KYC documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vendor-kyc-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT vendor_id::text FROM public.vendors WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "Vendor can update own KYC documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'vendor-kyc-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT vendor_id::text FROM public.vendors WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "Vendor can delete own KYC documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'vendor-kyc-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT vendor_id::text FROM public.vendors WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "Service role full access to vendor-kyc-documents"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'vendor-kyc-documents')
WITH CHECK (bucket_id = 'vendor-kyc-documents');
