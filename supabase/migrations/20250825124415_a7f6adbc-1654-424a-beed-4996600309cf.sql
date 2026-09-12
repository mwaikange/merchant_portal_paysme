-- Add unique constraint to prevent duplicate bulk subscriber entries
-- This prevents the same invoice/reference being uploaded multiple times for the same merchant

-- First, let's add a unique constraint on bulk_subscribers to prevent duplicates
ALTER TABLE public.bulk_subscribers 
ADD CONSTRAINT unique_merchant_reference 
UNIQUE (merchant_id, reference);

-- Add deduplication check to the insert_bulk_transaction trigger
-- This will prevent duplicate transaction creation if the same data is processed multiple times
CREATE OR REPLACE FUNCTION public.insert_bulk_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    client_id uuid;
    existing_transaction_id varchar;
BEGIN
    -- Check if transaction already exists for this merchant and reference
    SELECT transaction_id INTO existing_transaction_id
    FROM transactions
    WHERE merchant_id = NEW.merchant_id 
      AND invoice_id = NEW.reference
      AND type = 'bulk';

    -- If transaction already exists, skip creation
    IF existing_transaction_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Check if client exists
    SELECT merchant_client_id INTO client_id
    FROM merchant_clients
    WHERE mobile_number = NEW.user_mobile 
      AND merchant_id = NEW.merchant_id;

    -- If client does not exist, create new merchant_client
    IF client_id IS NULL THEN
        INSERT INTO merchant_clients (
            merchant_id, 
            email, 
            mobile_number, 
            created_at
        )
        VALUES (
            NEW.merchant_id, 
            NEW.user_email, 
            NEW.user_mobile, 
            NOW()
        )
        RETURNING merchant_client_id INTO client_id;
    END IF;

    -- Insert into transactions (only if not already exists)
    INSERT INTO transactions (
        transaction_id,
        merchant_id,
        merchant_client_id,
        invoice_id,
        amount,
        status,
        type,
        date_generated,
        created_at
    ) VALUES (
        'tx_' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '_' || substr(md5(random()::text), 1, 6),
        NEW.merchant_id,
        client_id,
        NEW.reference,
        NEW.amount,
        'pending',
        'bulk',
        NEW.created_at,
        NOW()
    );

    RETURN NEW;
END;
$function$;