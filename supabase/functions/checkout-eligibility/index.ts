import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const customerFacilitatorKeys = ["mtc_maris", "wayame", "paypulse", "paytoday", "kazang"];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPlanKey(planType?: string | null) {
  if (!planType) return "";
  if (planType.startsWith("annual_partner")) return "annual_partner";
  if (planType.startsWith("starter")) return "starter";
  if (planType.startsWith("growth")) return "growth";
  if (planType.startsWith("scale")) return "scale";
  return planType.replace(/_(3|6|9|12)_months$/, "");
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

async function getRequestPayload(req: Request) {
  const url = new URL(req.url);

  if (req.method === "GET") {
    return {
      merchant_id: url.searchParams.get("merchant_id") || "",
      api_key: url.searchParams.get("api_key") || "",
      amount_nad: Number(url.searchParams.get("amount_nad") || url.searchParams.get("amount") || 0),
      hosted_payment: url.searchParams.get("hosted_payment") === "true",
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    merchant_id: body.merchant_id || body.vendor_uuid || "",
    api_key: body.api_key || "",
    amount_nad: Number(body.amount_nad || body.amount || 0),
    hosted_payment: body.hosted_payment === true,
  };
}

async function getCardFacilitator() {
  const { data, error } = await supabase
    .from("facilitators")
    .select("facilitator_id, facilitator_key, display_name")
    .eq("facilitator_key", "adumo")
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getCurrentMonthCardSales(merchantId: string) {
  const cardFacilitator = await getCardFacilitator();
  if (!cardFacilitator?.facilitator_id) {
    return {
      card_facilitator_id: null,
      card_used_this_month: 0,
    };
  }

  const { data, error } = await supabase
    .from("transactions")
    .select("amount, amount_paid")
    .eq("merchant_id", merchantId)
    .eq("status", "paid")
    .eq("facilitator_id", cardFacilitator.facilitator_id)
    .eq("payment_method", "card")
    .gte("date_paid", startOfCurrentMonth().toISOString());

  if (error) throw error;

  const total = (data || []).reduce((sum, tx) => {
    return sum + Number(tx.amount_paid ?? tx.amount ?? 0);
  }, 0);

  return {
    card_facilitator_id: cardFacilitator.facilitator_id,
    card_used_this_month: total,
  };
}

async function getBillingStatus(merchantId: string) {
  const { data, error } = await supabase
    .from("merchant_billing_status")
    .select("outstanding_fee_amount, outstanding_due_date, billing_locked")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function lockedMethods(reason: string) {
  return {
    paysme_code: { enabled: false, reason },
    card: { enabled: false, reason },
    mtc_maris: { enabled: false, reason },
    wayame: { enabled: false, reason },
    paypulse: { enabled: false, reason },
    paytoday: { enabled: false, reason },
    kazang: { enabled: false, reason },
  };
}

function isBillingPastDue(billingStatus: Record<string, unknown> | null) {
  const outstanding = Number(billingStatus?.outstanding_fee_amount || 0);
  if (outstanding <= 0) return false;
  if (billingStatus?.billing_locked === true) return true;
  if (!billingStatus?.outstanding_due_date) return false;

  const dueDate = new Date(`${billingStatus.outstanding_due_date}T23:59:59Z`);
  return Number.isFinite(dueDate.getTime()) && dueDate < new Date();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { merchant_id, api_key, amount_nad: rawAmount, hosted_payment } = await getRequestPayload(req);
    const amount_nad = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;

    if (!merchant_id || (!api_key && !hosted_payment)) {
      return jsonResponse({ error: "Missing merchant_id/vendor_uuid or api_key" }, 400);
    }

    let merchantQuery = supabase
      .from("merchants")
      .select("merchant_id, business_name, api_key")
      .eq("merchant_id", merchant_id);

    if (!hosted_payment) {
      merchantQuery = merchantQuery.eq("api_key", api_key);
    }

    const { data: merchant, error: merchantError } = await merchantQuery.maybeSingle();

    if (merchantError) throw merchantError;
    if (!merchant) {
      return jsonResponse({ error: "Invalid merchant credentials" }, 401);
    }

    const billingStatus = await getBillingStatus(merchant.merchant_id);
    const billingLocked = isBillingPastDue(billingStatus);
    const billingLockReason = "Payments are temporarily disabled for this merchant.";

    if (billingLocked) {
      return jsonResponse({
        merchant_id: merchant.merchant_id,
        business_name: merchant.business_name,
        amount_nad,
        billing: {
          locked: true,
          outstanding_fee_amount: billingStatus?.outstanding_fee_amount ?? null,
          outstanding_due_date: billingStatus?.outstanding_due_date ?? null,
          reason: billingLockReason,
        },
        plan: null,
        methods: lockedMethods(billingLockReason),
      });
    }

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("id, plan_type, duration_months, amount, status, paycode_status, end_date")
      .eq("user_id", merchant.merchant_id)
      .eq("status", "active")
      .eq("paycode_status", "paid")
      .order("created_at", { ascending: false });

    if (subscriptionError) throw subscriptionError;

    const activeSubscription = (subscriptions || []).find((subscription) => {
      if (!subscription.end_date) return false;
      return new Date(subscription.end_date) > new Date();
    });

    if (!activeSubscription) {
      return jsonResponse({
        merchant_id: merchant.merchant_id,
        business_name: merchant.business_name,
        plan: null,
        billing: {
          locked: false,
          outstanding_fee_amount: billingStatus?.outstanding_fee_amount ?? null,
          outstanding_due_date: billingStatus?.outstanding_due_date ?? null,
          reason: null,
        },
        amount_nad,
        methods: {
          paysme_code: { enabled: false, reason: "Active paid subscription required" },
          card: { enabled: false, reason: "Active paid subscription required" },
          mtc_maris: { enabled: false, reason: "Active paid subscription required" },
          wayame: { enabled: false, reason: "Active paid subscription required" },
          paypulse: { enabled: false, reason: "Active paid subscription required" },
          paytoday: { enabled: false, reason: "Active paid subscription required" },
          kazang: { enabled: false, reason: "Active paid subscription required" },
        },
      });
    }

    const planKey = getPlanKey(activeSubscription.plan_type);
    const { data: planRule, error: planRuleError } = await supabase
      .from("subscription_plan_rules")
      .select("*")
      .eq("plan_key", planKey)
      .eq("is_active", true)
      .maybeSingle();

    if (planRuleError) throw planRuleError;
    if (!planRule) {
      return jsonResponse({ error: `Plan rule not found for ${planKey}` }, 500);
    }

    const { data: facilitatorRows, error: facilitatorError } = await supabase
      .from("merchant_payment_facilitators")
      .select("provider_key, provider_display_name, provider_merchant_code, enabled, status, facilitator_id, metadata")
      .eq("merchant_id", merchant.merchant_id)
      .eq("enabled", true);

    if (facilitatorError) throw facilitatorError;

    const facilitatorsByKey = new Map(
      (facilitatorRows || []).map((row) => [row.provider_key, row])
    );

    const cardSales = await getCurrentMonthCardSales(merchant.merchant_id);
    const projectedCardSales = cardSales.card_used_this_month + Math.max(Number(amount_nad || 0), 0);
    const cardLimit = planRule.card_monthly_limit === null ? null : Number(planRule.card_monthly_limit);
    const hasAdumoCode = !!facilitatorsByKey.get("adumo")?.provider_merchant_code;
    const cardLimitReached = cardLimit !== null && cardSales.card_used_this_month >= cardLimit;
    const cardWouldExceedLimit = cardLimit !== null && projectedCardSales > cardLimit;

    const methods: Record<string, Record<string, unknown>> = {
      paysme_code: {
        enabled: true,
        reason: null,
      },
    };

    for (const key of customerFacilitatorKeys) {
      const facilitator = facilitatorsByKey.get(key);
      const hasCode = !!facilitator?.provider_merchant_code;
      const merchantEnabled = facilitator?.enabled !== false;
      const metadata = (facilitator?.metadata || {}) as Record<string, unknown>;
      const wayameVerified = key !== "wayame" || (
        facilitator?.status === "active" &&
        metadata.verification_status === "verified" &&
        Boolean(metadata.merchant_alias)
      );
      const enabled = Boolean(planRule.other_payment_types_enabled && hasCode && merchantEnabled && facilitator?.status !== "rejected" && wayameVerified);
      methods[key] = {
        enabled,
        reason: !planRule.other_payment_types_enabled
          ? "Other payment types are not available on this plan"
          : !hasCode
            ? "Facilitator merchant code required"
            : !wayameVerified
              ? "Verify the merchant WayaMe payment address before enabling checkout"
            : !merchantEnabled
              ? "This payment method is hidden by the merchant"
              : facilitator?.status === "rejected"
                ? "This facilitator setup needs attention"
                : null,
        status: facilitator?.status || "not_configured",
        provider_merchant_code_present: hasCode,
        merchant_enabled: merchantEnabled,
      };
    }

    const adumoEnabled = facilitatorsByKey.get("adumo")?.enabled !== false;
    methods.card = {
      enabled: Boolean(planRule.card_payments_enabled && hasAdumoCode && adumoEnabled && !cardLimitReached && !cardWouldExceedLimit),
      reason: !planRule.card_payments_enabled
        ? "Card payments are not available on this plan"
        : !hasAdumoCode
          ? "Adumo merchant code required"
          : !adumoEnabled
            ? "Card payments are hidden by the merchant"
          : cardLimitReached
            ? "Monthly card limit reached"
            : cardWouldExceedLimit
              ? "This payment would exceed the monthly card limit"
              : null,
      provider: "adumo",
      card_monthly_limit: cardLimit,
      card_used_this_month: cardSales.card_used_this_month,
      projected_card_sales: projectedCardSales,
      card_facilitator_id: cardSales.card_facilitator_id,
      merchant_enabled: adumoEnabled,
    };

    return jsonResponse({
      merchant_id: merchant.merchant_id,
      business_name: merchant.business_name,
      amount_nad,
      billing: {
        locked: false,
        outstanding_fee_amount: billingStatus?.outstanding_fee_amount ?? null,
        outstanding_due_date: billingStatus?.outstanding_due_date ?? null,
        reason: null,
      },
      plan: {
        plan_type: activeSubscription.plan_type,
        plan_key: planRule.plan_key,
        display_name: planRule.display_name,
        duration_months: activeSubscription.duration_months,
        end_date: activeSubscription.end_date,
        paysme_transaction_fee_rate: Number(planRule.paysme_transaction_fee_rate),
        card_payments_enabled: planRule.card_payments_enabled,
        card_monthly_limit: cardLimit,
        other_payment_types_enabled: planRule.other_payment_types_enabled,
        bulk_invoice_enabled: planRule.bulk_invoice_enabled,
        bulk_paycode_enabled: planRule.bulk_paycode_enabled,
      },
      methods,
    });
  } catch (error) {
    console.error("checkout-eligibility error:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unexpected checkout eligibility error",
    }, 500);
  }
});
