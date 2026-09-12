
-- RPC to look up pending transactions for a merchant by email or mobile
CREATE OR REPLACE FUNCTION public.lookup_pending_transaction(
  p_merchant_id uuid,
  p_email text DEFAULT NULL,
  p_mobile text DEFAULT NULL
)
RETURNS TABLE(
  transaction_id text,
  generated_code text,
  amount numeric,
  invoice_id text,
  status text,
  business_name text,
  date_generated timestamptz,
  user_email text,
  user_mobile text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    t.transaction_id,
    t.generated_code,
    t.amount,
    t.invoice_id,
    t.status,
    t.business_name,
    t.date_generated,
    t.user_email,
    t.user_mobile
  FROM public.transactions t
  WHERE t.merchant_id = p_merchant_id
    AND t.status = 'pending'
    AND (
      (p_email IS NOT NULL AND t.user_email = p_email)
      OR
      (p_mobile IS NOT NULL AND t.user_mobile = p_mobile)
    )
  ORDER BY t.created_at DESC
  LIMIT 5;
$$;
