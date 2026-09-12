import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type BulkSmsAccess = {
  loading: boolean;
  packageEligible: boolean;
  hasSmsCredentials: boolean;
  canUseBulkSms: boolean;
};

const planKey = (planType?: string | null) => {
  const value = String(planType || "");
  if (value.startsWith("annual_partner")) return "annual_partner";
  if (value.startsWith("scale")) return "scale";
  if (value.startsWith("growth")) return "growth";
  if (value.startsWith("starter")) return "starter";
  return value.replace(/_(3|6|9|12)_months$/, "");
};

export function useBulkSmsAccess(): BulkSmsAccess {
  const { merchant } = useAuth();
  const [loading, setLoading] = useState(true);
  const [packageEligible, setPackageEligible] = useState(false);

  const hasSmsCredentials = Boolean(merchant?.sms_client_id?.trim() && merchant?.sms_key?.trim());

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!merchant?.merchant_id) {
        if (active) {
          setPackageEligible(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data: subscriptions, error } = await supabase
        .from("subscriptions")
        .select("plan_type, end_date")
        .eq("user_id", merchant.merchant_id)
        .eq("status", "active")
        .eq("paycode_status", "paid")
        .order("created_at", { ascending: false });

      const subscription = !error
        ? (subscriptions || []).find(row => row.end_date && new Date(row.end_date) > new Date())
        : null;
      if (!subscription) {
        if (active) {
          setPackageEligible(false);
          setLoading(false);
        }
        return;
      }

      const { data: rule, error: ruleError } = await supabase
        .from("subscription_plan_rules")
        .select("bulk_invoice_enabled, bulk_paycode_enabled")
        .eq("plan_key", planKey(subscription.plan_type))
        .eq("is_active", true)
        .maybeSingle();

      if (active) {
        setPackageEligible(!ruleError && Boolean(rule?.bulk_invoice_enabled || rule?.bulk_paycode_enabled));
        setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [merchant?.merchant_id]);

  return {
    loading,
    packageEligible,
    hasSmsCredentials,
    canUseBulkSms: packageEligible && hasSmsCredentials,
  };
}
