-- Add columns to sms_transactions table
ALTER TABLE public.sms_transactions 
ADD COLUMN paycode_status character varying,
ADD COLUMN generated_code character varying;

-- Add columns to subscriptions table  
ALTER TABLE public.subscriptions
ADD COLUMN paycode_status character varying,
ADD COLUMN generated_code character varying,
ADD COLUMN activated_date timestamp with time zone;

-- Add foreign key constraints
ALTER TABLE public.sms_transactions 
ADD CONSTRAINT fk_sms_transactions_transaction_id 
FOREIGN KEY (transaction_id) REFERENCES public.transactions(transaction_id);

-- Create function to sync transaction data to sms_transactions
CREATE OR REPLACE FUNCTION public.sync_sms_transaction_data()
RETURNS trigger
LANGUAGE plpgsql
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

-- Create function to sync transaction data to subscriptions
CREATE OR REPLACE FUNCTION public.sync_subscription_data()
RETURNS trigger
LANGUAGE plpgsql
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
  ) AND paycode_status IS NULL OR generated_code IS NULL;
  
  RETURN NEW;
END;
$function$;

-- Create triggers to keep data in sync
CREATE TRIGGER sync_sms_transaction_trigger
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (NEW.type = 'sms')
  EXECUTE FUNCTION public.sync_sms_transaction_data();

CREATE TRIGGER sync_subscription_trigger  
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (NEW.type = 'subscription')
  EXECUTE FUNCTION public.sync_subscription_data();

-- Update existing records to sync data
UPDATE public.sms_transactions 
SET 
  paycode_status = t.status,
  generated_code = t.generated_code,
  date_purchased = CASE WHEN t.status = 'paid' THEN t.date_paid ELSE sms_transactions.date_purchased END
FROM public.transactions t
WHERE sms_transactions.transaction_id = t.transaction_id;

-- Update existing subscriptions to sync data  
UPDATE public.subscriptions
SET 
  paycode_status = t.status,
  generated_code = t.generated_code,
  activated_date = CASE WHEN t.status = 'paid' THEN t.date_paid ELSE NULL END,
  status = CASE WHEN t.status = 'paid' THEN 'Active' ELSE 'Inactive' END,
  start_date = CASE WHEN t.status = 'paid' THEN t.date_paid ELSE subscriptions.start_date END,
  end_date = CASE WHEN t.status = 'paid' THEN t.date_paid + (subscriptions.duration_months * INTERVAL '1 month') ELSE subscriptions.end_date END
FROM public.transactions t
JOIN public.merchants m ON m.merchant_id = t.merchant_id
WHERE subscriptions.user_id = m.merchant_id AND t.type = 'subscription';