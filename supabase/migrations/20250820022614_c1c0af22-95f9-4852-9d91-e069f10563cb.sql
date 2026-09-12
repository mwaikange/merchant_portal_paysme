-- Create trigger to automatically create merchant record when auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_merchant()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.merchants (
    merchant_id,
    email,
    vendor_id,
    api_key,
    setup_complete,
    subscription_status,
    kyc_status,
    sms_credits
  ) VALUES (
    NEW.id,
    NEW.email,
    'USV_' || UPPER(SUBSTR(REPLACE(NEW.id::text, '-', ''), 1, 8)),
    'pk_' || REPLACE(gen_random_uuid()::text, '-', ''),
    false,
    'inactive',
    'pending',
    0
  );
  RETURN NEW;
END;
$$;

-- Create trigger that fires after user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_merchant();

-- Enable RLS on merchants table for security
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for merchants
CREATE POLICY "Merchants can view their own data" 
  ON public.merchants 
  FOR SELECT 
  USING (auth.uid() = merchant_id);

CREATE POLICY "Merchants can update their own data" 
  ON public.merchants 
  FOR UPDATE 
  USING (auth.uid() = merchant_id);

-- Allow merchants to view their own transactions
CREATE POLICY "Merchants can view their own transactions" 
  ON public.transactions 
  FOR SELECT 
  USING (auth.uid() = merchant_id);

-- Allow merchants to view their own bulk uploads
CREATE POLICY "Merchants can view their own bulk uploads" 
  ON public.bulk_uploads 
  FOR SELECT 
  USING (auth.uid() = merchant_id);

-- Allow merchants to view their own merchant clients
CREATE POLICY "Merchants can view their own clients" 
  ON public.merchant_clients 
  FOR SELECT 
  USING (auth.uid() = merchant_id);