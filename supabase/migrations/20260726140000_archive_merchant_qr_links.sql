-- Archived QR products without payment history are automatically removed after
-- 30 days. Products with direct or basket payment history remain archived so
-- merchant transaction records retain their source attribution.

CREATE OR REPLACE FUNCTION public.purge_archived_merchant_qr_payment_links()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.merchant_qr_payment_links AS link
    WHERE link.status = 'inactive'
      AND link.deactivated_at <= now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1
        FROM public.transactions AS transaction
        WHERE transaction.qr_payment_link_id = link.qr_payment_link_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.merchant_qr_basket_items AS basket_item
        JOIN public.transactions AS transaction
          ON transaction.basket_id = basket_item.basket_id
        WHERE basket_item.qr_payment_link_id = link.qr_payment_link_id
      )
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_deleted_count
  FROM deleted;

  RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_archived_merchant_qr_payment_links()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_archived_merchant_qr_payment_links()
  TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'purge-archived-merchant-qr-links';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'purge-archived-merchant-qr-links',
    '17 2 * * *',
    'SELECT public.purge_archived_merchant_qr_payment_links();'
  );
END;
$$;
