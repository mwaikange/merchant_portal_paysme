-- Fix security issues for the functions I just created
CREATE OR REPLACE FUNCTION public.generate_transaction_id_with_type(transaction_type text DEFAULT 'regular')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    random_number bigint;
BEGIN
    random_number := floor(random() * 10000000000);
    
    CASE transaction_type
        WHEN 'sms' THEN
            RETURN 'SMS_TX' || lpad(random_number::text, 10, '0');
        WHEN 'subscription' THEN
            RETURN 'SUB_TX' || lpad(random_number::text, 10, '0');
        ELSE
            -- Default format for regular transactions
            RETURN 'tx_' || to_char(now(), 'YYYYMMDDHH24MISS') || '_' || 
                   lpad(floor(random() * 1000000)::text, 6, '0');
    END CASE;
END;
$$;