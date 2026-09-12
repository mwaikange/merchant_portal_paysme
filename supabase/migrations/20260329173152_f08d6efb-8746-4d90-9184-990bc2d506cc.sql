
-- 1. Trigger: sync transaction status changes back to bulk_subscribers
CREATE OR REPLACE FUNCTION public.sync_bulk_subscriber_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.type = 'bulk') THEN
    UPDATE public.bulk_subscribers
    SET status = NEW.status,
        date_paid = CASE WHEN NEW.status = 'paid' THEN NEW.date_paid ELSE bulk_subscribers.date_paid END,
        amount_paid = CASE WHEN NEW.status = 'paid' THEN NEW.amount_paid ELSE bulk_subscribers.amount_paid END,
        updated_at = now()
    WHERE transaction_id = NEW.transaction_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_bulk_subscriber_status ON public.transactions;
CREATE TRIGGER trg_sync_bulk_subscriber_status
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_bulk_subscriber_status();

-- 2. Backfill: copy email/mobile from bulk_subscribers to transactions where missing
UPDATE public.transactions t
SET user_email = bs.user_email,
    user_mobile = bs.user_mobile,
    business_name = COALESCE(t.business_name, (SELECT m.business_name FROM merchants m WHERE m.merchant_id = t.merchant_id))
FROM public.bulk_subscribers bs
WHERE t.transaction_id = bs.transaction_id
  AND t.type = 'bulk'
  AND (t.user_email IS NULL OR t.user_mobile IS NULL);

-- 3. Backfill: sync paid status back to bulk_subscribers for already-paid transactions
UPDATE public.bulk_subscribers bs
SET status = t.status,
    date_paid = t.date_paid,
    amount_paid = t.amount_paid,
    updated_at = now()
FROM public.transactions t
WHERE bs.transaction_id = t.transaction_id
  AND t.status IN ('paid', 'expired', 'cancelled')
  AND bs.status = 'pending';
