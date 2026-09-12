-- Backfill merchant_client_id on bulk_subscribers using mobile_number match
UPDATE public.bulk_subscribers bs
SET merchant_client_id = mc.merchant_client_id
FROM public.merchant_clients mc
WHERE mc.merchant_id = bs.merchant_id
  AND mc.mobile_number = bs.user_mobile
  AND bs.merchant_client_id IS NULL;

-- Create missing merchant_clients for unmatched bulk_subscribers
INSERT INTO public.merchant_clients (merchant_id, mobile_number, email)
SELECT DISTINCT ON (bs.merchant_id, bs.user_mobile) bs.merchant_id, bs.user_mobile, bs.user_email
FROM public.bulk_subscribers bs
WHERE bs.merchant_client_id IS NULL
  AND bs.user_mobile IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.merchant_clients mc
    WHERE mc.merchant_id = bs.merchant_id AND mc.mobile_number = bs.user_mobile
  );

-- Now link the newly created clients
UPDATE public.bulk_subscribers bs
SET merchant_client_id = mc.merchant_client_id
FROM public.merchant_clients mc
WHERE mc.merchant_id = bs.merchant_id
  AND mc.mobile_number = bs.user_mobile
  AND bs.merchant_client_id IS NULL;

-- Create backfill bulk_uploads records for orphan subscribers
INSERT INTO public.bulk_uploads (merchant_id, filename, total_records, processed_records, failed_records, status)
SELECT 
  merchant_id,
  'backfill-import',
  COUNT(*)::int,
  COUNT(*)::int,
  0,
  'completed'
FROM public.bulk_subscribers
WHERE bulk_upload_id IS NULL
GROUP BY merchant_id;

-- Link orphan bulk_subscribers to backfill bulk_uploads
UPDATE public.bulk_subscribers bs
SET bulk_upload_id = bu.id
FROM public.bulk_uploads bu
WHERE bu.merchant_id = bs.merchant_id
  AND bu.filename = 'backfill-import'
  AND bs.bulk_upload_id IS NULL;