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
    '00000000-1986-0026-0000-000000000001'::uuid,
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

-- Create merchant clients for existing merchants in PaySME's client list for SMS/subscription transactions
INSERT INTO public.merchant_clients (merchant_id, email, mobile_number)
SELECT DISTINCT 
    '00000000-1986-0026-0000-000000000001'::uuid as merchant_id,
    m.email,
    m.mobile_number
FROM public.merchants m
WHERE m.merchant_id != '00000000-1986-0026-0000-000000000001'::uuid
    AND NOT EXISTS (
        SELECT 1 FROM public.merchant_clients mc 
        WHERE mc.merchant_id = '00000000-1986-0026-0000-000000000001'::uuid 
        AND mc.email = m.email
    )
ON CONFLICT (merchant_id, mobile_number) DO NOTHING;

-- Update SMS transactions table to use PaySME as merchant (this will help with future transactions)
UPDATE public.sms_transactions st
SET merchant_id = '00000000-1986-0026-0000-000000000001'::uuid
WHERE merchant_id != '00000000-1986-0026-0000-000000000001'::uuid;

-- For existing transactions, just update the type and merchant info without changing IDs to avoid FK conflicts
UPDATE public.transactions t
SET 
    type = 'sms',
    business_name = 'PaySME'
WHERE EXISTS (
    SELECT 1 FROM public.sms_transactions st 
    WHERE st.transaction_id = t.transaction_id
) AND t.type != 'sms';

-- Update subscription-related transactions type
UPDATE public.transactions t
SET 
    type = 'subscription',
    business_name = 'PaySME'
WHERE t.invoice_id LIKE 'SUB_%' AND t.type != 'subscription';