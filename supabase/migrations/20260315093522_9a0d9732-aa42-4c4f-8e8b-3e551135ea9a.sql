
-- Backfill: sync cancelled subscriptions to transactions
UPDATE public.transactions t
SET status = 'cancelled', updated_at = now()
FROM public.subscriptions s
WHERE s.generated_code = t.generated_code
  AND s.paycode_status = 'cancelled'
  AND t.status != 'cancelled';

-- Backfill: sync cancelled sms_transactions to transactions
UPDATE public.transactions t
SET status = 'cancelled', updated_at = now()
FROM public.sms_transactions st
WHERE st.generated_code = t.generated_code
  AND st.paycode_status = 'cancelled'
  AND t.status != 'cancelled';
