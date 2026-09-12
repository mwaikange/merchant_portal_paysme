-- Enable RLS on all tables (excluding views)
ALTER TABLE public.bulk_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create additional RLS policies for bulk_subscribers
CREATE POLICY "Merchants can view their own bulk subscribers" 
  ON public.bulk_subscribers 
  FOR SELECT 
  USING (auth.uid() = merchant_id);

CREATE POLICY "Merchants can insert their own bulk subscribers" 
  ON public.bulk_subscribers 
  FOR INSERT 
  WITH CHECK (auth.uid() = merchant_id);

-- Create additional RLS policies for bulk_uploads
CREATE POLICY "Merchants can insert their own bulk uploads" 
  ON public.bulk_uploads 
  FOR INSERT 
  WITH CHECK (auth.uid() = merchant_id);

-- Create additional RLS policies for merchant_clients
CREATE POLICY "Merchants can insert their own clients" 
  ON public.merchant_clients 
  FOR INSERT 
  WITH CHECK (auth.uid() = merchant_id);

-- Create additional RLS policies for transactions
CREATE POLICY "Merchants can insert their own transactions" 
  ON public.transactions 
  FOR INSERT 
  WITH CHECK (auth.uid() = merchant_id);

CREATE POLICY "Merchants can update their own transactions" 
  ON public.transactions 
  FOR UPDATE 
  USING (auth.uid() = merchant_id);

-- Create policies for subscriptions (user-specific)
CREATE POLICY "Users can view their own subscriptions" 
  ON public.subscriptions 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" 
  ON public.subscriptions 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Create policies for referrals
CREATE POLICY "Users can view referrals they're involved in" 
  ON public.referrals 
  FOR SELECT 
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Create policies for payment_providers (admin only - for now allow all authenticated users to view)
CREATE POLICY "Authenticated users can view payment providers" 
  ON public.payment_providers 
  FOR SELECT 
  TO authenticated 
  USING (true);