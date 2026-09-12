-- Fix RLS policy for merchant_clients to allow merchants to insert clients
CREATE POLICY "Merchants can insert their own clients" 
ON public.merchant_clients 
FOR INSERT 
WITH CHECK (auth.uid() = merchant_id);