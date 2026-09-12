-- Make the payment database the single producer of the SMS admin-load queue.
-- Any payment channel only needs to mark the canonical transaction paid; this
-- trigger then hands the linked SMS purchase to the Admin Portal.

CREATE OR REPLACE FUNCTION public.sync_sms_transaction_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       OLD.generated_code IS DISTINCT FROM NEW.generated_code
       OR OLD.status IS DISTINCT FROM NEW.status
     )
  THEN
    UPDATE public.sms_transactions AS st
    SET
      paycode_status = NEW.status,
      generated_code = NEW.generated_code,
      date_purchased = CASE
        WHEN NEW.status = 'paid' THEN COALESCE(NEW.date_paid, st.date_purchased, now())
        ELSE st.date_purchased
      END,
      admin_load_status = CASE
        -- Do not reopen a request already being handled or already completed.
        WHEN NEW.status = 'paid' AND st.admin_load_status = 'not_paid' THEN 'pending_load'
        WHEN NEW.status = 'cancelled' AND st.admin_load_status = 'not_paid' THEN 'cancelled'
        ELSE st.admin_load_status
      END,
      admin_load_requested_at = CASE
        WHEN NEW.status = 'paid' AND st.admin_load_status = 'not_paid'
          THEN COALESCE(st.admin_load_requested_at, NEW.date_paid, now())
        ELSE st.admin_load_requested_at
      END,
      updated_at = now()
    WHERE st.transaction_id = NEW.transaction_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill paid SMS purchases that pre-date the automatic queue handoff.
-- This includes the two currently paid-but-not-loaded purchases. Completed or
-- already queued records are deliberately left unchanged.
UPDATE public.sms_transactions AS st
SET
  paycode_status = 'paid',
  admin_load_status = 'pending_load',
  admin_load_requested_at = COALESCE(st.admin_load_requested_at, t.date_paid, now()),
  date_purchased = COALESCE(t.date_paid, st.date_purchased),
  updated_at = now()
FROM public.transactions AS t
WHERE t.transaction_id = st.transaction_id
  AND t.type = 'sms'
  AND t.status = 'paid'
  AND st.admin_load_status = 'not_paid';
