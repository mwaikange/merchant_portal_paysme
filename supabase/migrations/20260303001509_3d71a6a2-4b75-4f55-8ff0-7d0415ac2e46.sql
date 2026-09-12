
DROP FUNCTION IF EXISTS public.validate_payment_code(text);

CREATE OR REPLACE FUNCTION public.validate_payment_code(pay_code text)
 RETURNS TABLE(transaction_id character varying, generated_code character varying, amount numeric, status character varying, business_name text, date_generated timestamp with time zone, invoice_id character varying, user_email character varying, user_mobile character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.transaction_id,
    t.generated_code,
    t.amount,
    t.status,
    t.business_name,
    t.date_generated,
    t.invoice_id,
    t.user_email,
    t.user_mobile
  FROM public.transactions t
  WHERE t.generated_code = pay_code 
    AND t.status = 'pending';
END;
$$;
