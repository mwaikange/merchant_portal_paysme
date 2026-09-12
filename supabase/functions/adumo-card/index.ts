import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// DEV ONLY fallbacks. Production card payments use merchant-specific Adumo
// credentials stored in merchant_payment_facilitators.
const ADUMO_JWT_SECRET = Deno.env.get("ADUMO_JWT_SECRET") || "";
const ADUMO_MERCHANT_ID = Deno.env.get("ADUMO_MERCHANT_ID") || "";
const ADUMO_3DS_APP_UID = Deno.env.get("ADUMO_3DS_APP_UID") || "";
// A PUID enables Adumo's 1Click/tokenised-card experience and must identify one
// specific cardholder. Production must provide a customer-specific PUID or
// omit the field; never fall back to a staging/shared cardholder profile.
const ADUMO_PUID = Deno.env.get("ADUMO_PUID") || "";
// The current live Adumo application is provisioned for ZAR. NAD and ZAR are
// settled at parity, but Adumo requires the authorisation currency to match the
// currency enabled on the Application UID.
const ADUMO_CURRENCY_CODE = "ZAR";

// Adumo URLs
const ADUMO_PRODUCTION_URL = "https://apiv3.adumoonline.com/product/payment/v1/initialisevirtual";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── JWT helpers (HS256) ──────────────────────────────────────────────
function base64url(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlStr(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64urlStr(JSON.stringify(header));
  const encodedPayload = base64urlStr(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput))
  );
  return `${signingInput}.${base64url(sig)}`;
}

async function verifyAndDecodeJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const signingInput = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigB64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
    const sigStr = atob(sigB64);
    const sigArray = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) sigArray[i] = sigStr.charCodeAt(i);

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigArray,
      new TextEncoder().encode(signingInput)
    );
    if (!valid) return null;

    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadStr = atob(payloadB64);
    return JSON.parse(payloadStr);
  } catch {
    return null;
  }
}

function generateJti(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function createAdumoMerchantReference(invoiceId: string, generatedCode: string): string {
  const cleanedInvoice = String(invoiceId || "")
    .replace(/[^a-zA-Z0-9_# ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 20);
  const cleanedCode = String(generatedCode || "")
    .replace(/[^a-zA-Z0-9_# ]/g, "")
    .slice(0, 8);
  const source = cleanedInvoice || cleanedCode || "PAYSME";
  return `PS_${source}_${Math.floor(Date.now() / 1000)}`.slice(0, 38);
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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function validateFailedCardRetry(
  merchantId: string,
  apiKey: string,
  generatedCode: string,
  invoiceId: string,
  amount: number,
) {
  if (!apiKey) {
    return { transaction: null, error: "SDK api_key is required to retry a failed payment", status: 400 };
  }

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("merchant_id")
    .eq("merchant_id", merchantId)
    .eq("api_key", apiKey)
    .maybeSingle();
  if (merchantError) throw merchantError;
  if (!merchant) {
    return { transaction: null, error: "Invalid merchant credentials", status: 401 };
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("transaction_id, amount, invoice_id, status, finalized, vendor_redeemable, allowed_payment_methods")
    .eq("merchant_id", merchantId)
    .eq("generated_code", generatedCode)
    .maybeSingle();
  if (transactionError) throw transactionError;

  const isValidRetry = transaction &&
    transaction.status === "failed" &&
    transaction.finalized !== true &&
    transaction.vendor_redeemable !== false &&
    transaction.allowed_payment_methods?.includes("card") &&
    String(transaction.invoice_id || "") === String(invoiceId || "") &&
    Math.abs(Number(transaction.amount) - amount) < 0.005;

  if (!isValidRetry) {
    return {
      transaction: null,
      error: "This failed payment cannot be retried or its transaction details have changed",
      status: 409,
    };
  }

  return { transaction, error: null, status: 200 };
}

async function validateCardTransaction(
  merchantId: string,
  generatedCode: string,
  invoiceId: string,
  amount: number,
) {
  const { data: transaction, error } = await supabase
    .from("transactions")
    .select("transaction_id, amount, invoice_id, type, status, finalized, qr_payment_link_id, basket_id")
    .eq("merchant_id", merchantId)
    .eq("generated_code", generatedCode)
    .maybeSingle();
  if (error) throw error;

  // QR, basket, subscription and SMS checkouts must reuse the exact pending
  // transaction details already stored by PaySME. Other legacy checkouts keep
  // their existing initiation behavior.
  const requiresStoredTransaction = Boolean(
    transaction?.qr_payment_link_id
    || transaction?.basket_id
    || transaction?.type === "subscription"
    || transaction?.type === "sms"
  );
  if (!requiresStoredTransaction) {
    return { valid: true, error: null };
  }

  const valid = transaction.status === "pending"
    && transaction.finalized !== true
    && String(transaction.invoice_id || "") === String(invoiceId || "")
    && Math.abs(Number(transaction.amount) - amount) < 0.005;

  return {
    valid,
    error: valid ? null : "Checkout amount, reference or payment status has changed",
  };
}

async function getAdumoFacilitator() {
  const { data, error } = await supabase
    .from("facilitators")
    .select("facilitator_id, facilitator_key, display_name")
    .eq("facilitator_key", "adumo")
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getActiveSubscription(merchantId: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan_type, duration_months, end_date, paycode_status, status")
    .eq("user_id", merchantId)
    .eq("status", "active")
    .eq("paycode_status", "paid")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).find((subscription: any) => {
    if (!subscription.end_date) return false;
    return new Date(subscription.end_date) > new Date();
  }) || null;
}

async function getCurrentMonthCardSales(merchantId: string, facilitatorId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("amount, amount_paid")
    .eq("merchant_id", merchantId)
    .eq("status", "paid")
    .eq("facilitator_id", facilitatorId)
    .eq("payment_method", "card")
    .gte("date_paid", startOfCurrentMonth().toISOString());

  if (error) throw error;

  return (data || []).reduce((sum: number, tx: any) => {
    return sum + Number(tx.amount_paid ?? tx.amount ?? 0);
  }, 0);
}

async function findAdumoMrefLog(mref: string) {
  const { data: mrefLogs, error: mrefError } = await supabase
    .from("webhook_logs")
    .select("payload, id")
    .eq("provider_name", "adumo_mref_map")
    .order("received_at", { ascending: false })
    .limit(100);

  console.log("mref lookup error:", mrefError);
  console.log("Total mref_map rows found:", mrefLogs?.length);
  console.log("Looking for mref:", mref);
  console.log("Available mrefs:", mrefLogs?.map((l: any) => l.payload?.mref));

  return mrefLogs?.find((l: any) => l.payload?.mref === mref) || null;
}

async function checkCardEligibility(merchantId: string, amount: number) {
  const adumoFacilitator = await getAdumoFacilitator();
  if (!adumoFacilitator?.facilitator_id) {
    return {
      enabled: false,
      reason: "Adumo facilitator is not configured",
      status: 500,
      adumoFacilitator: null,
      adumoCode: null,
    };
  }

  const activeSubscription = await getActiveSubscription(merchantId);
  if (!activeSubscription) {
    return {
      enabled: false,
      reason: "Active paid subscription required",
      status: 403,
      adumoFacilitator,
      adumoCode: null,
    };
  }

  const { data: planRule, error: planRuleError } = await supabase
    .from("subscription_plan_rules")
    .select("plan_key, card_payments_enabled, card_monthly_limit")
    .eq("plan_key", getPlanKey(activeSubscription.plan_type))
    .eq("is_active", true)
    .maybeSingle();

  if (planRuleError) throw planRuleError;
  if (!planRule) {
    return {
      enabled: false,
      reason: "Subscription plan rule not found",
      status: 500,
      adumoFacilitator,
      adumoCode: null,
    };
  }

  if (!planRule.card_payments_enabled) {
    return {
      enabled: false,
      reason: "Card payments are not available on this plan",
      status: 403,
      adumoFacilitator,
      adumoCode: null,
    };
  }

  const { data: adumoCode, error: adumoCodeError } = await supabase
    .from("merchant_payment_facilitators")
    .select("provider_merchant_code, provider_application_id, provider_jwt_secret, enabled, status, facilitator_id")
    .eq("merchant_id", merchantId)
    .eq("provider_key", "adumo")
    .eq("enabled", true)
    .maybeSingle();

  if (adumoCodeError) throw adumoCodeError;
  if (!adumoCode?.provider_merchant_code || adumoCode.status === "rejected") {
    return {
      enabled: false,
      reason: "Adumo credentials not configured. Please enter your Merchant ID, Application ID and JWT Secret in your payment settings.",
      status: 403,
      adumoFacilitator,
      adumoCode: null,
    };
  }

  if (!adumoCode.provider_application_id || !adumoCode.provider_jwt_secret) {
    return {
      enabled: false,
      reason: "Adumo credentials incomplete - ApplicationID and JWT Secret required",
      status: 403,
      adumoFacilitator,
      adumoCode: null,
    };
  }

  const usedThisMonth = await getCurrentMonthCardSales(merchantId, adumoFacilitator.facilitator_id);
  const cardLimit = planRule.card_monthly_limit === null ? null : Number(planRule.card_monthly_limit);
  const projectedCardSales = usedThisMonth + Math.max(Number(amount || 0), 0);

  if (cardLimit !== null && usedThisMonth >= cardLimit) {
    return {
      enabled: false,
      reason: "Monthly card limit reached",
      status: 403,
      adumoFacilitator,
      adumoCode,
      usedThisMonth,
      cardLimit,
    };
  }

  if (cardLimit !== null && projectedCardSales > cardLimit) {
    return {
      enabled: false,
      reason: "This payment would exceed the monthly card limit",
      status: 403,
      adumoFacilitator,
      adumoCode,
      usedThisMonth,
      cardLimit,
      projectedCardSales,
    };
  }

  return {
    enabled: true,
    reason: null,
    status: 200,
    adumoFacilitator,
    adumoCode,
    usedThisMonth,
    cardLimit,
    projectedCardSales,
  };
}

async function checkVendorObligationCardEligibility(
  merchantId: string,
  amount: number,
  vendorObligationId: string,
  generatedCode: string,
) {
  const adumoFacilitator = await getAdumoFacilitator();
  if (!adumoFacilitator?.facilitator_id) {
    return { enabled: false, reason: "Adumo facilitator is not configured", status: 500, adumoFacilitator: null, adumoCode: null };
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("transaction_id, amount, status, finalized, vendor_redeemable, allowed_payment_methods")
    .eq("merchant_id", merchantId)
    .eq("generated_code", generatedCode)
    .eq("vendor_obligation_id", vendorObligationId)
    .maybeSingle();
  if (transactionError) throw transactionError;
  if (!transaction || transaction.status !== "pending" || transaction.finalized === true ||
      transaction.vendor_redeemable !== false ||
      !transaction.allowed_payment_methods?.includes("card") ||
      Math.abs(Number(transaction.amount) - amount) >= 0.005) {
    return { enabled: false, reason: "Invalid or expired vendor checkout", status: 409, adumoFacilitator, adumoCode: null };
  }

  const { data: adumoCode, error: adumoCodeError } = await supabase
    .from("merchant_payment_facilitators")
    .select("provider_merchant_code, provider_application_id, provider_jwt_secret, enabled, status, facilitator_id")
    .eq("merchant_id", merchantId)
    .eq("provider_key", "adumo")
    .eq("enabled", true)
    .maybeSingle();
  if (adumoCodeError) throw adumoCodeError;
  if (!adumoCode?.provider_merchant_code || !adumoCode.provider_application_id ||
      !adumoCode.provider_jwt_secret || adumoCode.status === "rejected") {
    return { enabled: false, reason: "PaySME card credentials are incomplete", status: 403, adumoFacilitator, adumoCode: null };
  }

  return {
    enabled: true,
    reason: null,
    status: 200,
    adumoFacilitator,
    adumoCode,
    usedThisMonth: 0,
    cardLimit: null,
    projectedCardSales: amount,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  try {
    // ── ACTION: initiate — SDK calls this to get JWT + form data ────
    if (req.method === "POST" && (path === "adumo-card" || path === "initiate")) {
      const action = url.searchParams.get("action");
      
      // If action param present, fall through to specific handlers below
      if (action === "webhook" || action === "redirect-success" || action === "redirect-failed") {
        // Fall through
      } else {
        // Normal initiation flow
        const body = await req.json();
        const {
          merchant_id, amount, invoice_id, generated_code, town, email, mobile,
          business_name, origin_url, sms_notifications_enabled, vendor_obligation_id,
          api_key, retry_failed,
        } = body;

        if (!merchant_id || !amount || !invoice_id || !generated_code) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const amountNumber = Number(amount);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
          return jsonResponse({ error: "Amount must be a positive number" }, 400);
        }

        if (vendor_obligation_id && req.headers.get("Authorization") !== `Bearer ${supabaseServiceKey}`) {
          return jsonResponse({ error: "Restricted vendor checkout requires server authorization" }, 401);
        }

        if (retry_failed === true && vendor_obligation_id) {
          return jsonResponse({ error: "Restricted vendor payments cannot use the public retry flow" }, 400);
        }

        let failedRetryTransaction: any = null;
        if (retry_failed === true) {
          const retryValidation = await validateFailedCardRetry(
            merchant_id,
            String(api_key || ""),
            generated_code,
            invoice_id,
            amountNumber,
          );
          if (!retryValidation.transaction) {
            return jsonResponse({ error: retryValidation.error }, retryValidation.status);
          }
          failedRetryTransaction = retryValidation.transaction;
        }

        if (!vendor_obligation_id && retry_failed !== true) {
          const checkoutValidation = await validateCardTransaction(
            merchant_id,
            generated_code,
            invoice_id,
            amountNumber,
          );
          if (!checkoutValidation.valid) {
            return jsonResponse({ error: checkoutValidation.error }, 409);
          }
        }

        const eligibility = vendor_obligation_id
          ? await checkVendorObligationCardEligibility(merchant_id, amountNumber, vendor_obligation_id, generated_code)
          : await checkCardEligibility(merchant_id, amountNumber);
        if (!eligibility.enabled) {
          return jsonResponse({
            ok: false,
            error: eligibility.reason,
            card_monthly_limit: eligibility.cardLimit ?? null,
            card_used_this_month: eligibility.usedThisMonth ?? 0,
            projected_card_sales: eligibility.projectedCardSales ?? null,
          }, eligibility.status || 403);
        }

        const now = Math.floor(Date.now() / 1000);
        const mref = createAdumoMerchantReference(invoice_id, generated_code);
        const merchantMerchantId = eligibility.adumoCode.provider_merchant_code;
        const merchantAppId = eligibility.adumoCode.provider_application_id;
        const merchantJwtSecret = eligibility.adumoCode.provider_jwt_secret;

        const jwtPayload = {
          iss: "PaySME",
          cuid: merchantMerchantId,
          auid: merchantAppId,
          amount: Number(amount).toFixed(2),
          mref,
          jti: generateJti(),
          iat: now - 60,
          exp: now + 600,
          notificationURL: `${supabaseUrl}/functions/v1/adumo-card?action=webhook`,
        };

        const token = await signJwt(jwtPayload, merchantJwtSecret);

        const { data: merchant } = await supabase
          .from("merchants")
          .select("webhook_url, webhook_secret, return_url")
          .eq("merchant_id", merchant_id)
          .single();

        // Issue 4: Store origin_url in the mref mapping
        const capturedOrigin = origin_url || "https://paysme.site";

        const { data: mappingLog, error: mappingError } = await supabase.from("webhook_logs").insert({
          provider_name: "adumo_mref_map",
          payload: {
            mref,
            merchant_id,
            invoice_id,
            generated_code,
            amount: amountNumber,
            town: town || null,
            email: email || null,
            mobile: mobile || null,
            business_name: business_name || null,
            origin_url: capturedOrigin,
            merchant_webhook_url: merchant?.webhook_url || null,
            merchant_webhook_secret: merchant?.webhook_secret || null,
            merchant_return_url: merchant?.return_url || null,
            facilitator_id: eligibility.adumoFacilitator?.facilitator_id || null,
            payment_method: "card",
            sms_notifications_enabled: sms_notifications_enabled !== false,
            vendor_obligation_id: vendor_obligation_id || null,
            facilitator_merchant_code: merchantMerchantId,
            adumo_jwt_secret: merchantJwtSecret,
            adumo_merchant_id: merchantMerchantId,
            adumo_application_id: merchantAppId,
            adumo_currency_code: ADUMO_CURRENCY_CODE,
            adumo_puid: ADUMO_PUID,
            adumo_environment_url: ADUMO_PRODUCTION_URL,
            token_issued: true,
          },
          status: "pending",
        }).select("id").single();

        if (mappingError || !mappingLog) throw mappingError || new Error("Adumo transaction mapping was not created");

        if (failedRetryTransaction) {
          const { data: resetTransaction, error: resetError } = await supabase
            .from("transactions")
            .update({
              status: "pending",
              finalized: false,
              date_paid: null,
              amount_paid: null,
              payment_provider_signature: null,
              payment_provider_id: null,
              facilitator_id: null,
              facilitator_merchant_code: null,
              payment_method: "card",
              updated_at: new Date().toISOString(),
            })
            .eq("transaction_id", failedRetryTransaction.transaction_id)
            .eq("status", "failed")
            .select("transaction_id")
            .maybeSingle();

          if (resetError || !resetTransaction) {
            await supabase
              .from("webhook_logs")
              .update({ status: "failed" })
              .eq("id", mappingLog.id);
            if (resetError) console.error("Failed card retry reset error:", resetError);
            return jsonResponse({ error: "This payment was already retried or is no longer retryable" }, 409);
          }
        }

        // Redirect URLs go through edge function handlers (Adumo POSTs, not GETs)
        const successUrl = `${supabaseUrl}/functions/v1/adumo-card?action=redirect-success`;
        const failedUrl = `${supabaseUrl}/functions/v1/adumo-card?action=redirect-failed`;

        return new Response(JSON.stringify({
          ok: true,
          token,
          mref,
          currency_code: ADUMO_CURRENCY_CODE,
          // AuthoriseCurrencyCode is only valid for Adumo applications with
          // Multi-Currency Processing (MCP/FX) enabled. This live application
          // uses its configured ZAR settlement currency, so the SDK must omit
          // the override from the Virtual form post.
          currency_override_enabled: false,
          puid: ADUMO_PUID,
          merchant_id: merchantMerchantId,
          application_id: merchantAppId,
          adumo_url: ADUMO_PRODUCTION_URL,
          redirect_success_url: successUrl,
          redirect_failed_url: failedUrl,
          retry: Boolean(failedRetryTransaction),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── ACTION: webhook — Adumo calls this on payment completion ────
    if (req.method === "POST" && url.searchParams.get("action") === "webhook") {
      const rawBody = await req.text();
      console.log("RAW WEBHOOK BODY:", rawBody);
      
      let body: any;
      try {
        body = JSON.parse(rawBody);
      } catch (parseErr) {
        console.error("Failed to parse webhook body as JSON:", parseErr);
        console.log("Raw body (first 500 chars):", rawBody.substring(0, 500));
        return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
      }
      
      console.log("Webhook fields received:", Object.keys(body));

      const { merchantReference, token: adumoToken, status, amount, transactionId, message, possibleFraudulentTransaction, puid, tkn } = body;

      console.log("merchantReference:", merchantReference);
      console.log("token present:", !!adumoToken);

      await supabase.from("webhook_logs").insert({
        provider_name: "adumo_webhook_received",
        payload: {
          merchantReference: merchantReference || null,
          status: status || null,
          amount: amount || null,
          transactionId: transactionId || null,
          message: message || null,
          possibleFraudulentTransaction: possibleFraudulentTransaction ?? null,
          puid: puid || null,
          tkn: tkn || null,
          token_present: !!adumoToken,
          body,
        },
        status: "received",
      });

      if (!merchantReference || !adumoToken) {
        console.error("MISSING FIELDS - merchantReference:", merchantReference, "token:", adumoToken);
        console.error("Full body was:", JSON.stringify(body));
        return new Response("Missing fields", { status: 400, headers: corsHeaders });
      }

      // Validate Adumo JWT
      let decoded: Record<string, unknown> | null = null;

      // Look up mref mapping — search ALL statuses, most recent first
      const { data: mrefLogs, error: mrefError } = await supabase
        .from("webhook_logs")
        .select("payload, id, status")
        .eq("provider_name", "adumo_mref_map")
        .order("received_at", { ascending: false })
        .limit(100);

      console.log("mref lookup error:", mrefError);
      console.log("Total mref_map rows found:", mrefLogs?.length);
      console.log("Looking for mref:", merchantReference);
      console.log("Available mrefs:", mrefLogs?.map((l: any) => l.payload?.mref));

      const mrefLog = mrefLogs?.find((l: any) => l.payload?.mref === merchantReference);
      if (!mrefLog) {
        console.error("mref mapping not found for:", merchantReference);
        return new Response("Transaction mapping not found", { status: 404, headers: corsHeaders });
      }

      if (mrefLog.status !== "pending") {
        console.warn("Ignoring duplicate or inactive Adumo callback for:", merchantReference, "mapping status:", mrefLog.status);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const mapping = mrefLog.payload as any;
      const webhookJwtSecret = mapping.adumo_jwt_secret;
      const expectedMerchantId = mapping.adumo_merchant_id;
      const expectedAppId = mapping.adumo_application_id;

      if (!webhookJwtSecret || !expectedMerchantId || !expectedAppId) {
        console.error("Adumo mapping missing merchant credentials for:", merchantReference);
        return new Response("Adumo mapping missing credentials", { status: 500, headers: corsHeaders });
      }

      decoded = await verifyAndDecodeJwt(adumoToken, webhookJwtSecret);
      if (!decoded) {
        console.error("Invalid Adumo webhook JWT");
        return new Response("Invalid token", { status: 401, headers: corsHeaders });
      }

      if (decoded.cuid !== expectedMerchantId || decoded.auid !== expectedAppId || decoded.mref !== merchantReference) {
        console.error("JWT field mismatch - cuid:", decoded.cuid, "expected:", expectedMerchantId, "auid:", decoded.auid, "expected:", expectedAppId, "mref:", decoded.mref, "expected:", merchantReference);
        return new Response("JWT validation failed", { status: 401, headers: corsHeaders });
      }

      const isSuccess = String(decoded.result) === "0" || status === "SETTLED" || status === "AUTHORISED" || status === "AUTHORIZED";

      console.log("Payment result - isSuccess:", isSuccess, "status:", status, "decoded.result:", decoded.result);

      // Update transaction in DB
      const txUpdate = isSuccess
        ? await supabase
          .from("transactions")
          .update({
            status: "paid",
            date_paid: new Date().toISOString(),
            amount_paid: Number(amount || mapping.amount),
            finalized: true,
            payment_provider_signature: adumoToken,
            facilitator_id: mapping.facilitator_id || null,
            payment_method: mapping.payment_method || "card",
            facilitator_merchant_code: mapping.facilitator_merchant_code || null,
          })
          .eq("generated_code", mapping.generated_code)
          .eq("invoice_id", mapping.invoice_id)
          .eq("status", "pending")
        : await supabase
          .from("transactions")
          .update({
            status: "failed",
            finalized: false,
            payment_provider_signature: adumoToken,
            facilitator_id: mapping.facilitator_id || null,
            payment_method: mapping.payment_method || "card",
            facilitator_merchant_code: mapping.facilitator_merchant_code || null,
          })
          .eq("generated_code", mapping.generated_code)
          .eq("invoice_id", mapping.invoice_id)
          .eq("status", "pending");

      if (txUpdate.error) {
        console.error("Transaction update failed:", txUpdate.error);
        await supabase.from("webhook_logs").insert({
          provider_name: "adumo_transaction_update_error",
          payload: {
            mref: merchantReference,
            generated_code: mapping.generated_code,
            invoice_id: mapping.invoice_id,
            attempted_status: isSuccess ? "paid" : "failed",
            error: txUpdate.error,
          },
          status: "failed",
        });
        return new Response("Transaction update failed", { status: 500, headers: corsHeaders });
      }

      const { data: transactionPolicy } = await supabase
        .from("transactions")
        .select("sms_notifications_enabled")
        .eq("generated_code", mapping.generated_code)
        .eq("invoice_id", mapping.invoice_id)
        .maybeSingle();

      // Mark ONLY this specific mref row as processed
      await supabase
        .from("webhook_logs")
        .update({ status: "processed" })
        .eq("id", mrefLog.id);

      // Forward notification to merchant's webhook URL
      console.log("=== MERCHANT FORWARD ===");
      console.log("merchant_webhook_url:", mapping.merchant_webhook_url);
      console.log("merchant_id:", mapping.merchant_id);

      if (!mapping.merchant_webhook_url) {
        console.warn("No merchant webhook URL — skipping forward");
      } else {
        const merchantPayload = {
          paySMECode: mapping.generated_code,
          invoiceId: mapping.invoice_id,
          status: isSuccess ? "paid" : "failed",
          result: isSuccess ? 0 : -1,
          amount: Number(amount || mapping.amount),
          currency: ADUMO_CURRENCY_CODE,
          adumoTransactionId: transactionId,
          paymentMethod: "CARD",
          message: message || "",
          timestamp: body.timestamp || Date.now().toString(),
          fraud: possibleFraudulentTransaction || false,
        };

        console.log("Forwarding payload:", JSON.stringify(merchantPayload));

        try {
          const forwardRes = await fetch(mapping.merchant_webhook_url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": mapping.merchant_webhook_secret || "",
            },
            body: JSON.stringify(merchantPayload),
          });
          console.log("Merchant forward HTTP status:", forwardRes.status);
        } catch (e) {
          console.error("Merchant forward failed:", e);
        }
      }

      // Send payment confirmation SMS to customer (fire-and-forget)
      if (isSuccess && mapping.mobile && transactionPolicy?.sms_notifications_enabled !== false) {
        try {
          const smsUrl = `${supabaseUrl}/functions/v1/send-sms`;
          fetch(smsUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              action: "send_payment_confirmation",
              payload: {
                mobile: mapping.mobile,
                generated_code: mapping.generated_code,
                amount: Number(amount || mapping.amount),
                business_name: mapping.business_name || "PaySME",
              },
            }),
          }).catch(e => console.error("SMS confirmation send failed:", e));
        } catch (e) {
          console.error("SMS confirmation error:", e);
        }
      }

      // Log the webhook
      await supabase.from("webhook_logs").insert({
        provider_name: "Adumo",
        payload: body,
        status: "processed",
      });

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ── ACTION: redirect-success — Adumo redirects user here ────────
    if (req.method === "POST" && url.searchParams.get("action") === "redirect-success") {
      const formData = await req.formData();
      const result = formData.get("_RESULT");
      const responseToken = formData.get("_RESPONSE_TOKEN") as string;
      const mref = formData.get("_MERCHANTREFERENCE") as string;
      const statusVal = formData.get("_STATUS") as string;

      console.log("Adumo redirect success:", { result, mref, status: statusVal });

      // Look up origin_url and merchant return_url from mref mapping
      let originUrl = "https://paysme.site";
      let merchantReturnUrl: string | null = null;
      let mrefMapping: any = null;
      if (mref) {
        const { data: mrefLogs } = await supabase
          .from("webhook_logs")
          .select("payload")
          .eq("provider_name", "adumo_mref_map")
          .order("received_at", { ascending: false })
          .limit(100);
        mrefMapping = mrefLogs?.find((l: any) => l.payload?.mref === mref);
        if (mrefMapping?.payload?.origin_url) {
          originUrl = mrefMapping.payload.origin_url;
        }
        if (mrefMapping?.payload?.merchant_return_url) {
          merchantReturnUrl = mrefMapping.payload.merchant_return_url;
        }
      }

      if (responseToken && mrefMapping?.payload?.adumo_jwt_secret) {
        const decoded = await verifyAndDecodeJwt(responseToken, mrefMapping.payload.adumo_jwt_secret);
        if (decoded) {
          console.log("Redirect JWT valid, result:", decoded.result);
        }
      }

      // Use merchant's return_url if configured, otherwise fall back to origin_url
      const returnDestination = merchantReturnUrl || originUrl;
      const generatedCode = mrefMapping?.payload?.generated_code || "";
      const invoiceId = mrefMapping?.payload?.invoice_id || "";
      const params = new URLSearchParams();
      if (mref) params.set("mref", mref);
      if (result) params.set("result", String(result));
      if (statusVal) params.set("status", String(statusVal));
      if (generatedCode) params.set("generated_code", generatedCode);
      if (invoiceId) params.set("invoice_id", invoiceId);
      params.set("origin", returnDestination);

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: `https://paysme.site/payment/success?${params.toString()}` },
      });
    }

    // ── ACTION: redirect-failed ─────────────────────────────────────
    if (req.method === "POST" && url.searchParams.get("action") === "redirect-failed") {
      const formData = await req.formData();
      const mref = formData.get("_MERCHANTREFERENCE") as string;
      const statusVal = formData.get("_STATUS") as string;
      const result = formData.get("_RESULT") as string;
      const errorCode = formData.get("_ERROR_CODE") as string;
      const errorMessage = formData.get("_ERROR_MESSAGE") as string;

      console.log("Adumo redirect failed:", { mref, status: statusVal, result, errorCode, errorMessage });

      // Look up origin_url and merchant return_url from mref mapping
      let originUrl = "https://paysme.site";
      let merchantReturnUrl: string | null = null;
      let mrefMapping: any = null;
      if (mref) {
        const { data: mrefLogs } = await supabase
          .from("webhook_logs")
          .select("payload")
          .eq("provider_name", "adumo_mref_map")
          .order("received_at", { ascending: false })
          .limit(100);
        mrefMapping = mrefLogs?.find((l: any) => l.payload?.mref === mref);
        if (mrefMapping?.payload?.origin_url) {
          originUrl = mrefMapping.payload.origin_url;
        }
        if (mrefMapping?.payload?.merchant_return_url) {
          merchantReturnUrl = mrefMapping.payload.merchant_return_url;
        }
      }

      const returnDestination = merchantReturnUrl || originUrl;
      const generatedCode = mrefMapping?.payload?.generated_code || "";
      const invoiceId = mrefMapping?.payload?.invoice_id || "";
      const params = new URLSearchParams();
      if (mref) params.set("mref", mref);
      if (statusVal) params.set("status", statusVal);
      if (result) params.set("result", result);
      if (errorCode) params.set("error_code", errorCode);
      if (errorMessage) params.set("error_message", errorMessage);
      if (generatedCode) params.set("generated_code", generatedCode);
      if (invoiceId) params.set("invoice_id", invoiceId);
      params.set("origin", returnDestination);

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: `https://paysme.site/payment/failed?${params.toString()}` },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Adumo edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
