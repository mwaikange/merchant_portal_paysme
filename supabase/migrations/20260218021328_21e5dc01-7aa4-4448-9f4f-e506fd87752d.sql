
-- Add missing UPDATE policies for tables merchants need to modify

-- Subscriptions: merchants need to update their own subscriptions
CREATE POLICY "Users can update their own subscriptions"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- SMS Transactions: merchants need to update their own SMS transactions
CREATE POLICY "Users can update their own SMS transactions"
ON public.sms_transactions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Bulk Subscribers: merchants need to update their own bulk subscribers
CREATE POLICY "Merchants can update their own bulk subscribers"
ON public.bulk_subscribers
FOR UPDATE
TO authenticated
USING (auth.uid() = merchant_id)
WITH CHECK (auth.uid() = merchant_id);

-- Bulk Uploads: merchants need to update their own bulk uploads
CREATE POLICY "Merchants can update their own bulk uploads"
ON public.bulk_uploads
FOR UPDATE
TO authenticated
USING (auth.uid() = merchant_id)
WITH CHECK (auth.uid() = merchant_id);
