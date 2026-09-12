
-- Backfill sms_transactions with generated_code from transactions
UPDATE public.sms_transactions st
SET generated_code = t.generated_code,
    paycode_status = t.status
FROM public.transactions t
WHERE t.transaction_id = st.transaction_id
  AND st.generated_code IS NULL;

-- Backfill subscriptions: match by user email and closest created_at
-- Sub 97770c16 (created 2026-03-12) matches SUB_TX5635999738 (code 8524-0089-6863)
UPDATE public.subscriptions
SET generated_code = '8524-0089-6863', paycode_status = 'pending'
WHERE id = '97770c16-8357-4598-a38a-d983ff7dff3a' AND generated_code IS NULL;

-- Sub 53d97b20 (created 2026-03-15) matches SUB_TX9487682392 (code 0179-3553-1384)
UPDATE public.subscriptions
SET generated_code = '0179-3553-1384', paycode_status = 'pending'
WHERE id = '53d97b20-478f-4d43-97ff-ba0b27d308a9' AND generated_code IS NULL;
