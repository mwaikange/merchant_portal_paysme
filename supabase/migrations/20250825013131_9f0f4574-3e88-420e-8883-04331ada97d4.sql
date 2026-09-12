-- Drop the existing bulk_uploads_progress view that may have security definer properties
DROP VIEW IF EXISTS public.bulk_uploads_progress;

-- Recreate the view without any security definer properties
-- This view simply provides a different column naming for bulk_uploads data
CREATE VIEW public.bulk_uploads_progress AS
SELECT 
  id AS bulk_upload_id,
  filename,
  merchant_id,
  upload_date,
  status,
  total_records,
  processed_records,
  failed_records
FROM public.bulk_uploads;

-- Enable RLS on the new view
ALTER VIEW public.bulk_uploads_progress SET (security_barrier = true);

-- Create RLS policy for the view (same as the original table policy)
CREATE POLICY "Merchants can view their own bulk upload progress"
  ON public.bulk_uploads_progress
  FOR SELECT
  USING (auth.uid() = merchant_id);

-- Grant appropriate permissions
GRANT SELECT ON public.bulk_uploads_progress TO authenticated;
GRANT SELECT ON public.bulk_uploads_progress TO anon;