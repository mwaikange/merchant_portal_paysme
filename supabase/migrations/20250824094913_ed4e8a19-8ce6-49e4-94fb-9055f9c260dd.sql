-- Create RLS policies for webhook_logs table
-- Allow system/service role to insert webhook logs (for edge functions)
CREATE POLICY "System can insert webhook logs" 
ON public.webhook_logs 
FOR INSERT 
TO service_role 
WITH CHECK (true);

-- Allow authenticated users to view webhook logs (for debugging)
CREATE POLICY "Authenticated users can view webhook logs" 
ON public.webhook_logs 
FOR SELECT 
TO authenticated 
USING (true);