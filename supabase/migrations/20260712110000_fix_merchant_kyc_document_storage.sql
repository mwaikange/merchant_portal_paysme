-- Ensure merchant KYC uploads use a private, size-limited bucket and matching RLS.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'vendor-kyc-documents',
  'vendor-kyc-documents',
  false,
  4194304,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "paysme_merchant_read_own_vendor_kyc_documents" ON storage.objects;
DROP POLICY IF EXISTS "paysme_merchant_upload_own_vendor_kyc_documents" ON storage.objects;
DROP POLICY IF EXISTS "paysme_merchant_update_own_vendor_kyc_documents" ON storage.objects;
DROP POLICY IF EXISTS "paysme_merchant_delete_own_vendor_kyc_documents" ON storage.objects;

CREATE POLICY "paysme_merchant_read_own_vendor_kyc_documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vendor-kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "paysme_merchant_upload_own_vendor_kyc_documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vendor-kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "paysme_merchant_update_own_vendor_kyc_documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vendor-kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'vendor-kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "paysme_merchant_delete_own_vendor_kyc_documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vendor-kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can insert their own KYC documents" ON public.kyc_documents;
CREATE POLICY "Users can insert their own KYC documents"
ON public.kyc_documents
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.kyc_submissions
    WHERE kyc_submissions.id = kyc_documents.kyc_submission_id
      AND kyc_submissions.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete their own KYC documents" ON public.kyc_documents;
CREATE POLICY "Users can delete their own KYC documents"
ON public.kyc_documents
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
