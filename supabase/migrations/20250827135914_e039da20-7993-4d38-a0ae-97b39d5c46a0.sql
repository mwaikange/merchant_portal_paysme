-- First, let's fix the existing sync functions to work properly
-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS sync_sms_transaction_data ON public.transactions;
DROP TRIGGER IF EXISTS sync_subscription_data ON public.transactions;
DROP FUNCTION IF EXISTS public.sync_sms_transaction_data() CASCADE;
DROP FUNCTION IF EXISTS public.sync_subscription_data() CASCADE;

-- Create improved sync function for SMS transactions
CREATE OR REPLACE FUNCTION public.sync_sms_transaction_data()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only proceed if this is an update to generated_code or status
  IF (TG_OP = 'UPDATE' AND (OLD.generated_code IS DISTINCT FROM NEW.generated_code OR OLD.status IS DISTINCT FROM NEW.status)) THEN
    
    -- Update sms_transactions table
    UPDATE public.sms_transactions st
    SET
      paycode_status = NEW.status,
      generated_code = NEW.generated_code,
      date_purchased = CASE WHEN NEW.status = 'paid' THEN NEW.date_paid ELSE st.date_purchased END,
      updated_at = now()
    WHERE st.transaction_id = NEW.transaction_id;

  END IF;

  RETURN NEW;
END;
$$;

-- Create improved sync function for subscriptions
CREATE OR REPLACE FUNCTION public.sync_subscription_data()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only proceed if this is an update to generated_code or status
  IF (TG_OP = 'UPDATE' AND (OLD.generated_code IS DISTINCT FROM NEW.generated_code OR OLD.status IS DISTINCT FROM NEW.status)) THEN
    
    -- Update subscriptions table
    UPDATE public.subscriptions s
    SET
      paycode_status = NEW.status,
      generated_code = NEW.generated_code,
      activated_date = CASE
        WHEN NEW.status = 'paid' AND (s.paycode_status IS NULL OR s.paycode_status <> 'paid') THEN NEW.date_paid
        WHEN NEW.status = 'expired' THEN NULL
        ELSE s.activated_date
      END,
      status = CASE 
        WHEN NEW.status = 'paid' THEN 'active' 
        WHEN NEW.status = 'expired' THEN 'expired'
        ELSE 'inactive' 
      END,
      start_date = CASE
        WHEN NEW.status = 'paid' AND (s.paycode_status IS NULL OR s.paycode_status <> 'paid') THEN NEW.date_paid
        ELSE s.start_date
      END,
      end_date = CASE
        WHEN NEW.status = 'paid' AND (s.paycode_status IS NULL OR s.paycode_status <> 'paid') THEN NEW.date_paid + (s.duration_months * INTERVAL '1 month')
        ELSE s.end_date
      END
    WHERE s.user_id = NEW.merchant_id
    AND EXISTS (
      SELECT 1 FROM public.transactions t2 
      WHERE t2.transaction_id = NEW.transaction_id 
      AND t2.invoice_id LIKE 'SUB_%'
    );

  END IF;

  RETURN NEW;
END;
$$;

-- Create the triggers
CREATE TRIGGER sync_sms_transaction_data
AFTER UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_sms_transaction_data();

CREATE TRIGGER sync_subscription_data
AFTER UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_subscription_data();