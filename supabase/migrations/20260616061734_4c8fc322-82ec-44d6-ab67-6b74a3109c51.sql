
-- 1. Recreate view with security_invoker so it respects caller's RLS
DROP VIEW IF EXISTS public.bulk_uploads_progress;
CREATE VIEW public.bulk_uploads_progress
WITH (security_invoker = true) AS
SELECT id AS bulk_upload_id,
       filename,
       merchant_id,
       upload_date,
       status,
       total_records,
       processed_records,
       failed_records
FROM public.bulk_uploads;

GRANT SELECT ON public.bulk_uploads_progress TO authenticated;
GRANT ALL ON public.bulk_uploads_progress TO service_role;

-- 2. Add restrictive policies to RLS-enabled tables with no policy
CREATE POLICY "Service role manages admin_users"
  ON public.admin_users FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin users can view their own row"
  ON public.admin_users FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Service role manages platform_fee_settings"
  ON public.platform_fee_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can read active fee settings"
  ON public.platform_fee_settings FOR SELECT TO authenticated
  USING (is_active = true);

-- 3. Fix function search_path on all remaining functions
ALTER FUNCTION public.backfill_active_advances() SET search_path = public;
ALTER FUNCTION public.backfill_approved_advances() SET search_path = public;
ALTER FUNCTION public.calculate_subscription_end_date() SET search_path = public;
ALTER FUNCTION public.create_transaction_api(uuid, numeric, text, text, text, text) SET search_path = public;
ALTER FUNCTION public.current_platform_fee_rate(text) SET search_path = public;
ALTER FUNCTION public.delete_old_webhook_logs() SET search_path = public;
ALTER FUNCTION public.enforce_transaction_status() SET search_path = public;
ALTER FUNCTION public.expire_old_transactions() SET search_path = public;
ALTER FUNCTION public.expire_past_due_subscriptions() SET search_path = public;
ALTER FUNCTION public.generate_pay_code() SET search_path = public;
ALTER FUNCTION public.generate_temp_password() SET search_path = public;
ALTER FUNCTION public.generate_transaction_id() SET search_path = public;
ALTER FUNCTION public.generate_webhook_secret() SET search_path = public;
ALTER FUNCTION public.get_current_advance_balance(uuid) SET search_path = public;
ALTER FUNCTION public.get_or_create_merchant_client(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.get_total_token_balance(uuid) SET search_path = public;
ALTER FUNCTION public.get_vendor_auth_info(text) SET search_path = public;
ALTER FUNCTION public.increment_balance(uuid, numeric) SET search_path = public;
ALTER FUNCTION public.insert_bulk_transaction() SET search_path = public;
ALTER FUNCTION public.process_bulk_upload(uuid) SET search_path = public;
ALTER FUNCTION public.set_signature_key() SET search_path = public;
ALTER FUNCTION public.set_transaction_fee() SET search_path = public;
ALTER FUNCTION public.sync_bulk_subscriber_status() SET search_path = public;
ALTER FUNCTION public.sync_sms_transaction_data() SET search_path = public;
ALTER FUNCTION public.sync_subscription_data() SET search_path = public;
ALTER FUNCTION public.sync_transaction_vendor_id_from_vendor_transaction() SET search_path = public;
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.update_kyc_updated_at() SET search_path = public;
ALTER FUNCTION public.update_token_balance_on_approval() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 4. Revoke EXECUTE from anon/authenticated on server-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.add_sms_credits(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_provider_signature_key(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_old_webhook_logs() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_merchant() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_welcome_email() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_transaction_id_with_type(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_vendor_credentials(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_vendor_auth_info(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_active_advances() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.backfill_approved_advances() FROM anon, authenticated, public;
