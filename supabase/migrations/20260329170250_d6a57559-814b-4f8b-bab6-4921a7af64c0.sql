
-- Fix the trigger function to use bulk_subscriber's own generated_code and transaction_id
CREATE OR REPLACE FUNCTION public.insert_bulk_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    client_id uuid;
BEGIN
    -- Check if transaction already exists
    IF EXISTS (SELECT 1 FROM transactions WHERE transaction_id = NEW.transaction_id) THEN
        RETURN NEW;
    END IF;

    -- Resolve merchant_client
    client_id := public.get_or_create_merchant_client(
        NEW.merchant_id, NEW.user_email, NEW.user_mobile
    );

    -- Update the bulk_subscriber's merchant_client_id if not set
    IF NEW.merchant_client_id IS NULL THEN
        NEW.merchant_client_id := client_id;
    END IF;

    -- Insert corresponding transaction using the SAME generated_code and transaction_id
    INSERT INTO transactions (
        transaction_id,
        merchant_id,
        merchant_client_id,
        generated_code,
        invoice_id,
        amount,
        user_email,
        user_mobile,
        status,
        type,
        date_generated,
        created_at
    ) VALUES (
        NEW.transaction_id,
        NEW.merchant_id,
        COALESCE(client_id, NEW.merchant_client_id),
        NEW.generated_code,
        NEW.reference,
        NEW.amount,
        NEW.user_email,
        NEW.user_mobile,
        'pending',
        'bulk',
        COALESCE(NEW.date_generated, now()),
        now()
    );

    RETURN NEW;
END;
$function$;

-- Attach trigger to bulk_subscribers
DROP TRIGGER IF EXISTS trg_insert_bulk_transaction ON public.bulk_subscribers;
CREATE TRIGGER trg_insert_bulk_transaction
    BEFORE INSERT ON public.bulk_subscribers
    FOR EACH ROW
    EXECUTE FUNCTION public.insert_bulk_transaction();

-- Backfill: insert transactions for existing bulk_subscribers that don't have one
INSERT INTO public.transactions (
    transaction_id, merchant_id, merchant_client_id, generated_code,
    invoice_id, amount, user_email, user_mobile, status, type, date_generated, created_at
)
SELECT
    bs.transaction_id, bs.merchant_id, bs.merchant_client_id, bs.generated_code,
    bs.reference, bs.amount, bs.user_email, bs.user_mobile,
    COALESCE(bs.status, 'pending'), 'bulk', COALESCE(bs.date_generated, bs.created_at), COALESCE(bs.created_at, now())
FROM public.bulk_subscribers bs
WHERE NOT EXISTS (
    SELECT 1 FROM public.transactions t WHERE t.transaction_id = bs.transaction_id
);
