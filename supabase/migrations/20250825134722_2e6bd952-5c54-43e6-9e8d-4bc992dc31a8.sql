-- Fix critical security issues: Enable RLS on tables that are missing it

-- Enable RLS on bulk_uploads_progress table
ALTER TABLE public.bulk_uploads_progress ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for bulk_uploads_progress
CREATE POLICY "Merchants can view their own bulk upload progress" 
ON public.bulk_uploads_progress
FOR SELECT 
USING (auth.uid() = merchant_id);

CREATE POLICY "Service can manage bulk upload progress" 
ON public.bulk_uploads_progress
FOR ALL 
USING (true)
WITH CHECK (true);

-- Fix search_path for the new functions to make them more secure
CREATE OR REPLACE FUNCTION public.sync_sms_transaction_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Update sms_transactions when related transaction changes
  UPDATE public.sms_transactions 
  SET 
    paycode_status = NEW.status,
    generated_code = NEW.generated_code,
    date_purchased = CASE WHEN NEW.status = 'paid' THEN NEW.date_paid ELSE date_purchased END,
    updated_at = now()
  WHERE transaction_id = NEW.transaction_id;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_subscription_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Update subscriptions when related transaction changes
  UPDATE public.subscriptions 
  SET 
    paycode_status = NEW.status,
    generated_code = NEW.generated_code,
    activated_date = CASE 
      WHEN NEW.status = 'paid' AND paycode_status != 'paid' THEN NEW.date_paid
      WHEN NEW.status = 'expired' THEN NULL
      ELSE activated_date 
    END,
    status = CASE 
      WHEN NEW.status = 'paid' THEN 'Active'
      ELSE 'Inactive'
    END,
    start_date = CASE 
      WHEN NEW.status = 'paid' AND paycode_status != 'paid' THEN NEW.date_paid
      ELSE start_date
    END,
    end_date = CASE 
      WHEN NEW.status = 'paid' AND paycode_status != 'paid' THEN NEW.date_paid + (duration_months * INTERVAL '1 month')
      ELSE end_date
    END
  WHERE user_id IN (
    SELECT m.merchant_id 
    FROM public.merchants m 
    WHERE m.merchant_id = NEW.merchant_id
  ) AND (paycode_status IS NULL OR generated_code IS NULL);
  
  RETURN NEW;
END;
$function$;