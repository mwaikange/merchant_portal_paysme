-- First, let's check existing transaction types and update the constraint
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Add new constraint that includes sms and subscription types
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
CHECK (type IN ('api', 'bulk', 'sms', 'subscription'));

-- Update transaction ID generation functions to support custom prefixes
CREATE OR REPLACE FUNCTION public.generate_transaction_id_with_type(transaction_type text DEFAULT 'regular')
RETURNS text
LANGUAGE plpgsql
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

-- Update existing generate_transaction_id function to use the new system
CREATE OR REPLACE FUNCTION public.generate_transaction_id()
RETURNS text
LANGUAGE sql
AS $$
    SELECT public.generate_transaction_id_with_type('regular');
$$;

-- Insert PaySME merchant if it doesn't exist (fixed UUID for PaySME)
INSERT INTO public.merchants (
    merchant_id,
    email,
    business_name,
    vendor_id,
    api_key,
    setup_complete,
    subscription_status,
    kyc_status,
    sms_credits
) VALUES (
    '00000000-1986-0026-0000-000000000001',
    'admin@paysme.co.na',
    'PaySME',
    'USV_PAYSME',
    'pk_paysme_system_key',
    true,
    'active',
    'approved',
    999999
) ON CONFLICT (merchant_id) DO UPDATE SET
    business_name = 'PaySME',
    email = 'admin@paysme.co.na';

-- Backfill existing SMS and subscription transactions with proper merchant client linking
-- First, update SMS transactions to use PaySME as merchant
UPDATE public.sms_transactions st
SET merchant_id = '00000000-1986-0026-0000-000000000001'
WHERE merchant_id != '00000000-1986-0026-0000-000000000001';

-- Update corresponding transactions for SMS purchases
UPDATE public.transactions t
SET 
    transaction_id = 'SMS_TX' || lpad(floor(random() * 10000000000)::text, 10, '0'),
    merchant_id = '00000000-1986-0026-0000-000000000001',
    type = 'sms',
    business_name = 'PaySME'
WHERE EXISTS (
    SELECT 1 FROM public.sms_transactions st 
    WHERE st.transaction_id = t.transaction_id
) AND t.transaction_id NOT LIKE 'SMS_TX%';

-- Update subscription-related transactions
UPDATE public.transactions t
SET 
    transaction_id = 'SUB_TX' || lpad(floor(random() * 10000000000)::text, 10, '0'),
    merchant_id = '00000000-1986-0026-0000-000000000001',
    type = 'subscription',
    business_name = 'PaySME'
WHERE t.invoice_id LIKE 'SUB_%' AND t.transaction_id NOT LIKE 'SUB_TX%';

-- Create merchant clients for existing merchants in PaySME's client list for SMS/subscription transactions
INSERT INTO public.merchant_clients (merchant_id, email, mobile_number)
SELECT DISTINCT 
    '00000000-1986-0026-0000-000000000001' as merchant_id,
    m.email,
    m.mobile_number
FROM public.merchants m
WHERE m.merchant_id != '00000000-1986-0026-0000-000000000001'
    AND NOT EXISTS (
        SELECT 1 FROM public.merchant_clients mc 
        WHERE mc.merchant_id = '00000000-1986-0026-0000-000000000001' 
        AND mc.email = m.email
    );

-- Update SMS transaction records to link to the new merchant_client_id structure
UPDATE public.transactions t
SET merchant_client_id = (
    SELECT mc.merchant_client_id 
    FROM public.merchant_clients mc
    JOIN public.merchants m ON m.email = t.user_email
    WHERE mc.merchant_id = '00000000-1986-0026-0000-000000000001'
        AND mc.email = t.user_email
    LIMIT 1
)
WHERE t.type IN ('sms', 'subscription') 
    AND t.merchant_id = '00000000-1986-0026-0000-000000000001'
    AND t.merchant_client_id IS NULL;