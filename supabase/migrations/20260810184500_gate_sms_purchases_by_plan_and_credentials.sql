CREATE OR REPLACE FUNCTION public.merchant_has_bulk_sms_access(p_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchants m
    WHERE m.merchant_id = p_merchant_id
      AND NULLIF(BTRIM(m.sms_client_id), '') IS NOT NULL
      AND NULLIF(BTRIM(m.sms_key), '') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.subscriptions s
        JOIN public.subscription_plan_rules r
          ON r.plan_key = CASE
            WHEN s.plan_type LIKE 'annual_partner%' THEN 'annual_partner'
            WHEN s.plan_type LIKE 'scale%' THEN 'scale'
            WHEN s.plan_type LIKE 'growth%' THEN 'growth'
            WHEN s.plan_type LIKE 'starter%' THEN 'starter'
            ELSE regexp_replace(s.plan_type, '_(3|6|9|12)_months$', '')
          END
        WHERE s.user_id = p_merchant_id
          AND s.status = 'active'
          AND s.paycode_status = 'paid'
          AND s.end_date > now()
          AND r.is_active = true
          AND (r.bulk_invoice_enabled OR r.bulk_paycode_enabled)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.merchant_has_bulk_sms_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_has_bulk_sms_access(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can insert their own SMS transactions" ON public.sms_transactions;
CREATE POLICY "Eligible merchants can insert their own SMS transactions"
ON public.sms_transactions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.merchant_has_bulk_sms_access(user_id)
);

COMMENT ON FUNCTION public.merchant_has_bulk_sms_access(uuid) IS
  'True only for Scale-or-higher merchants with active paid access and complete merchant-owned SMSPortal credentials.';
