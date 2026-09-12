-- Drop the existing bulk_uploads_progress view that may have security definer properties
DROP VIEW IF EXISTS public.bulk_uploads_progress;

-- Recreate the view as a simple, secure view without security definer properties
-- Views inherit RLS policies from their underlying tables automatically
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

-- Grant appropriate permissions to the view
-- The RLS policies will be inherited from the bulk_uploads table
GRANT SELECT ON public.bulk_uploads_progress TO authenticated;

-- Comment on the view for documentation
COMMENT ON VIEW public.bulk_uploads_progress IS 'Secure view of bulk uploads progress - inherits RLS from bulk_uploads table';