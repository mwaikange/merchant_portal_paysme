/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const PAYSME_MERCHANT_ID = "00000000-1986-0026-0000-000000000001";
const EXTERNAL_METHODS = ["card", "mtc_maris", "paypulse", "wayame"];
const IMPLEMENTED_METHODS = ["card", "mtc_maris", "paypulse"];
const ACTIVE_STATUSES = ["pending", "checkout_created", "processing"];
const REPLACEABLE_STATUSES = ["pending", "checkout_created"];
const MINIMUM_TOKEN_TOPUP = 200;
const MINIMUM_INSTALLMENT_PAYMENT = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function normalizeNamibianMobile(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^0(81|83|85)\d{7}$/.test(digits)) return `264${digits.slice(1)}`;
  if (/^264(81|83|85)\d{7}$/.test(digits)) return digits;
  return null;
}

function createOpaqueToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function authenticatedVendor(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new ResponseError(401, "Authentication is required");

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new ResponseError(401, "The vendor session is invalid or expired");

  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("vendor_id, auth_user_id, vendor_code, vendor_type, full_name, business_name, email, mobile_number, is_active, kyc_status")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (vendorError) throw vendorError;
  if (!vendor) throw new ResponseError(403, "This user is not linked to a vendor account");
  if (!vendor.is_active) throw new ResponseError(403, "The vendor account is not active");
  return vendor;
}

class ResponseError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function getAvailableMethods() {
  const { data, error } = await supabase
    .from("merchant_payment_facilitators")
    .select("provider_key, provider_display_name, provider_merchant_code, provider_application_id, provider_jwt_secret, enabled, status")
    .eq("merchant_id", PAYSME_MERCHANT_ID)
    .in("provider_key", ["adumo", "mtc_maris", "paypulse", "wayame"]);

  if (error) throw error;
  const byKey = new Map((data || []).map((row) => [row.provider_key, row]));
  const facilitatorKey: Record<string, string> = {
    card: "adumo",
    mtc_maris: "mtc_maris",
    paypulse: "paypulse",
    wayame: "wayame",
  };

  return Object.fromEntries(EXTERNAL_METHODS.map((method) => {
    const setup = byKey.get(facilitatorKey[method]);
    const implemented = IMPLEMENTED_METHODS.includes(method);
    const providerSecretReady = method === "card"
      ? Boolean(setup?.provider_application_id && setup?.provider_jwt_secret)
      : method === "mtc_maris" || method === "paypulse";
    const configured = Boolean(setup?.provider_merchant_code && providerSecretReady &&
      setup?.enabled !== false && setup?.status !== "rejected");
    return [method, {
      enabled: implemented && configured,
      status: setup?.status || "not_configured",
      reason: !implemented
        ? "This payment method is not available yet"
        : !setup?.provider_merchant_code
          ? "This payment method is temporarily unavailable"
          : !providerSecretReady
            ? "This payment method is temporarily unavailable"
          : setup?.enabled === false
            ? "This payment method is temporarily unavailable"
            : setup?.status === "rejected"
              ? "This payment method is temporarily unavailable"
              : null,
    }];
  }));
}

async function ensurePaySmeClient(vendor: Record<string, any>) {
  const mobile = normalizeNamibianMobile(vendor.mobile_number);
  const { data, error } = await supabase.rpc("get_or_create_merchant_client", {
    p_merchant_id: PAYSME_MERCHANT_ID,
    p_email: vendor.email || "",
    p_mobile: mobile || "",
  });
  if (error) throw error;
  return { merchantClientId: data as string, mobile };
}

async function expireOldObligations(vendorId: string, advanceId?: string) {
  let query = supabase
    .from("vendor_payment_obligations")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("vendor_id", vendorId)
    .in("status", ACTIVE_STATUSES)
    .lt("checkout_expires_at", new Date().toISOString());
  if (advanceId) query = query.eq("advance_id", advanceId);
  const { error } = await query;
  if (error) throw error;
}

async function cancelReplaceableAdvanceCheckouts(vendorId: string, advanceId: string) {
  const { data, error } = await supabase
    .from("vendor_payment_obligations")
    .select("obligation_id, transaction_id")
    .eq("vendor_id", vendorId)
    .eq("advance_id", advanceId)
    .in("status", REPLACEABLE_STATUSES);
  if (error) throw error;
  if (!data?.length) return;

  const transactionIds = data
    .map((row) => row.transaction_id)
    .filter((transactionId): transactionId is string => Boolean(transactionId));
  if (transactionIds.length) {
    const { error: transactionError } = await supabase
      .from("transactions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in("transaction_id", transactionIds)
      .eq("status", "pending");
    if (transactionError) throw transactionError;
  }

  const { error: obligationError } = await supabase
    .from("vendor_payment_obligations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .in("obligation_id", data.map((row) => row.obligation_id))
    .in("status", REPLACEABLE_STATUSES);
  if (obligationError) throw obligationError;
}

async function createCheckout(vendor: Record<string, any>, payload: Record<string, any>) {
  const purpose = String(payload.purpose || "");
  if (!['vendor_token_topup', 'vendor_advance_installment'].includes(purpose)) {
    throw new ResponseError(400, "purpose must be vendor_token_topup or vendor_advance_installment");
  }

  const token = createOpaqueToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  let source: Record<string, any>;
  let requestedAmount: number;
  let amountDue: number;
  let discountAmount = 0;
  let discountRate = 0;
  let tokenCreditAmount: number | null = null;
  let invoiceId: string;

  if (purpose === "vendor_token_topup") {
    requestedAmount = money(payload.token_value_requested);
    if (requestedAmount < MINIMUM_TOKEN_TOPUP || requestedAmount > 1_000_000) {
      throw new ResponseError(400, `Token top-up must be between N$${MINIMUM_TOKEN_TOPUP.toFixed(2)} and N$1,000,000.00`);
    }
    const { data: configuredDiscountRate, error: discountRateError } = await supabase
      .rpc("effective_vendor_topup_discount_rate", { p_vendor_id: vendor.vendor_id });
    if (discountRateError) throw discountRateError;
    discountRate = Number(configuredDiscountRate);
    if (!Number.isFinite(discountRate) || discountRate < 0 || discountRate > 1) {
      throw new ResponseError(503, "Vendor top-up discount is not configured");
    }
    discountAmount = money(requestedAmount * discountRate);
    amountDue = money(requestedAmount - discountAmount);
    tokenCreditAmount = requestedAmount;

    const { data, error } = await supabase.from("vendor_topup_credits").insert({
      vendor_id: vendor.vendor_id,
      topup_type: String(vendor.vendor_type || "").toLowerCase().includes("credit") ? "credit_topup" : "prepaid",
      amount_requested: requestedAmount,
      amount_credited: requestedAmount,
      discount_applied: discountAmount,
      discount_rate_applied: discountRate,
      amount_paid: amountDue,
      status: "pending",
    }).select("id").single();
    if (error) throw error;
    source = { token_topup_id: data.id, advance_id: null };
    invoiceId = `VTOP_${data.id.replace(/-/g, "").slice(0, 16)}`;
  } else {
    const advanceId = String(payload.advance_id || "");
    if (!advanceId) throw new ResponseError(400, "advance_id is required");
    await expireOldObligations(vendor.vendor_id, advanceId);

    const { data: advance, error } = await supabase
      .from("vendor_token_advances")
      .select("advance_id, balance_remaining, min_installment, status")
      .eq("advance_id", advanceId)
      .eq("vendor_id", vendor.vendor_id)
      .maybeSingle();
    if (error) throw error;
    if (!advance || advance.status !== "active") throw new ResponseError(404, "Active token advance not found");

    const balance = money(advance.balance_remaining);
    const scheduledMinimum = Math.min(money(advance.min_installment), balance);
    const minimumPayment = Math.min(MINIMUM_INSTALLMENT_PAYMENT, balance);
    requestedAmount = payload.requested_amount == null ? scheduledMinimum : money(payload.requested_amount);
    if (requestedAmount < minimumPayment || requestedAmount > balance) {
      throw new ResponseError(400, `Instalment payment must be between N$${minimumPayment.toFixed(2)} and N$${balance.toFixed(2)}`);
    }
    await cancelReplaceableAdvanceCheckouts(vendor.vendor_id, advanceId);
    amountDue = requestedAmount;
    source = { token_topup_id: null, advance_id: advance.advance_id };
    invoiceId = `VADV_${advance.advance_id.replace(/-/g, "").slice(0, 16)}_${Date.now()}`;
  }

  const { data: obligation, error: obligationError } = await supabase
    .from("vendor_payment_obligations")
    .insert({
      vendor_id: vendor.vendor_id,
      purpose,
      ...source,
      requested_amount: requestedAmount,
      amount_due: amountDue,
      token_credit_amount: tokenCreditAmount,
      discount_amount: discountAmount,
      discount_rate: purpose === "vendor_token_topup" ? discountRate : null,
      status: "checkout_created",
      allowed_payment_methods: EXTERNAL_METHODS,
      checkout_token_hash: tokenHash,
      checkout_expires_at: expiresAt,
    })
    .select("obligation_id")
    .single();
  if (obligationError) {
    if (obligationError.code === "23505") {
      throw new ResponseError(409, "This advance already has an active payment checkout");
    }
    throw obligationError;
  }

  const client = await ensurePaySmeClient(vendor);
  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .insert({
      merchant_id: PAYSME_MERCHANT_ID,
      merchant_client_id: client.merchantClientId,
      amount: amountDue,
      type: purpose,
      payment_purpose: purpose,
      payment_method: null,
      invoice_id: invoiceId,
      user_email: vendor.email || null,
      user_mobile: client.mobile,
      business_name: "PaySME Vendor Account",
      vendor_redeemable: false,
      sms_notifications_enabled: false,
      allowed_payment_methods: EXTERNAL_METHODS,
      vendor_obligation_id: obligation.obligation_id,
    })
    .select("transaction_id")
    .single();

  if (transactionError) {
    await supabase.from("vendor_payment_obligations").update({ status: "failed", updated_at: now })
      .eq("obligation_id", obligation.obligation_id);
    throw transactionError;
  }

  const { error: linkError } = await supabase
    .from("vendor_payment_obligations")
    .update({ transaction_id: transaction.transaction_id, updated_at: now })
    .eq("obligation_id", obligation.obligation_id);
  if (linkError) throw linkError;

  return {
    checkout_session_id: obligation.obligation_id,
    checkout_token: token,
    purpose,
    amount_due: amountDue,
    token_value: tokenCreditAmount,
    discount_amount: discountAmount,
    discount_rate: purpose === "vendor_token_topup" ? discountRate : null,
    currency: "NAD",
    status: "checkout_created",
    allowed_methods: EXTERNAL_METHODS,
    methods: await getAvailableMethods(),
    expires_at: expiresAt,
    presentation: "native_modal",
    sms_notifications_enabled: false,
    vendor_network_enabled: false,
  };
}

async function loadSession(vendorId: string, payload: Record<string, any>, requireToken = true) {
  const sessionId = String(payload.checkout_session_id || "");
  if (!sessionId) throw new ResponseError(400, "checkout_session_id is required");
  const { data, error } = await supabase
    .from("vendor_payment_obligations")
    .select("*")
    .eq("obligation_id", sessionId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ResponseError(404, "Checkout session not found");

  if (data.transaction_id) {
    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .select("transaction_id, generated_code, invoice_id, amount, status, finalized, payment_method")
      .eq("transaction_id", data.transaction_id)
      .maybeSingle();
    if (transactionError) throw transactionError;
    data.transactions = transaction;
  }

  if (requireToken) {
    const suppliedHash = await sha256(String(payload.checkout_token || ""));
    if (!payload.checkout_token || suppliedHash !== data.checkout_token_hash) {
      throw new ResponseError(401, "Invalid checkout token");
    }
  }
  if (ACTIVE_STATUSES.includes(data.status) && new Date(data.checkout_expires_at) <= new Date()) {
    await supabase.from("vendor_payment_obligations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("obligation_id", data.obligation_id);
    data.status = "expired";
  }
  return data;
}

function publicSession(session: Record<string, any>) {
  return {
    checkout_session_id: session.obligation_id,
    purpose: session.purpose,
    amount_due: money(session.amount_due),
    token_value: session.token_credit_amount == null ? null : money(session.token_credit_amount),
    discount_amount: money(session.discount_amount),
    discount_rate: session.discount_rate == null ? null : Number(session.discount_rate),
    currency: session.currency,
    status: session.status,
    selected_payment_method: session.selected_payment_method,
    allowed_methods: session.allowed_payment_methods,
    expires_at: session.checkout_expires_at,
    paid_at: session.paid_at,
    vendor_network_enabled: false,
    sms_notifications_enabled: false,
  };
}

async function callInternalFunction(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ error: "Invalid provider response" }));
  if (!response.ok) throw new ResponseError(response.status, result.error || "Payment provider request failed", result.code);
  return result;
}

async function providerAction(vendor: Record<string, any>, payload: Record<string, any>) {
  const session = await loadSession(vendor.vendor_id, payload, true);
  if (!ACTIVE_STATUSES.includes(session.status)) {
    throw new ResponseError(409, `Checkout is ${session.status}`);
  }
  const method = String(payload.method || "");
  if (!session.allowed_payment_methods.includes(method) || ["paysme_code", "paysme_vendor"].includes(method)) {
    throw new ResponseError(403, "This payment method is not allowed for this checkout");
  }
  if (!IMPLEMENTED_METHODS.includes(method)) throw new ResponseError(501, "This payment method is not available yet");

  const methods = await getAvailableMethods();
  if (!methods[method]?.enabled) throw new ResponseError(409, methods[method]?.reason || "Payment method is unavailable");

  const transaction = Array.isArray(session.transactions) ? session.transactions[0] : session.transactions;
  if (!transaction) throw new ResponseError(500, "Checkout transaction is missing");

  let result: Record<string, unknown>;
  if (method === "card") {
    result = await callInternalFunction("adumo-card", {
      merchant_id: PAYSME_MERCHANT_ID,
      amount: session.amount_due,
      invoice_id: transaction.invoice_id,
      generated_code: transaction.generated_code,
      email: vendor.email,
      mobile: normalizeNamibianMobile(vendor.mobile_number),
      business_name: "PaySME Vendor Account",
      origin_url: payload.origin_url || "",
      sms_notifications_enabled: false,
      vendor_obligation_id: session.obligation_id,
    });
  } else {
    const mobiwandAction = String(payload.provider_action || "initiate");
    try {
      result = await callInternalFunction("mobiwand-payment", {
        action: mobiwandAction === "request_provider_code" || mobiwandAction === "confirm_provider_code"
          ? mobiwandAction
          : undefined,
        provider: method,
        merchant_id: PAYSME_MERCHANT_ID,
        hosted_payment: true,
        generated_code: transaction.generated_code,
        confirmation_code: payload.confirmation_code,
        origin_url: payload.origin_url || "",
        sms_notifications_enabled: false,
        vendor_obligation_id: session.obligation_id,
      });
    } catch (error) {
      if (mobiwandAction === "request_provider_code" &&
          error instanceof ResponseError && error.code === "provider_request_api_pending") {
        result = { ok: true, code: error.code, provider_code_entry_ready: true };
      } else if (error instanceof ResponseError && error.code === "provider_confirmation_api_pending") {
        throw new ResponseError(503, `${method === "mtc_maris" ? "MTC Maris" : "PayPulse"} could not confirm this payment yet. Please try again later or choose another payment method.`, error.code);
      } else {
        throw error;
      }
    }
  }

  const providerCodeEntryPending = result.code === "provider_request_api_pending";
  await supabase.from("vendor_payment_obligations").update({
    ...(providerCodeEntryPending ? {} : { status: "processing" }),
    selected_payment_method: method,
    updated_at: new Date().toISOString(),
  }).eq("obligation_id", session.obligation_id);

  return {
    ...result,
    checkout_session_id: session.obligation_id,
    presentation: "native_modal",
    sms_notifications_enabled: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new ResponseError(500, "Payment service credentials are not configured");
    }
    const vendor = await authenticatedVendor(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "create");

    if (action === "create") {
      return jsonResponse({ ok: true, checkout: await createCheckout(vendor, body) }, 201);
    }
    if (action === "status") {
      const session = await loadSession(vendor.vendor_id, body, false);
      return jsonResponse({ ok: true, checkout: publicSession(session), methods: await getAvailableMethods() });
    }
    if (action === "initiate_payment") {
      return jsonResponse({ ok: true, payment: await providerAction(vendor, body) });
    }
    if (action === "cancel") {
      const session = await loadSession(vendor.vendor_id, body, true);
      if (!ACTIVE_STATUSES.includes(session.status)) throw new ResponseError(409, `Checkout is ${session.status}`);
      if (session.transaction_id) {
        const { error: transactionError } = await supabase.from("transactions")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("transaction_id", session.transaction_id)
          .eq("status", "pending");
        if (transactionError) throw transactionError;
      }
      await supabase.from("vendor_payment_obligations").update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("obligation_id", session.obligation_id);
      return jsonResponse({ ok: true, checkout: { ...publicSession(session), status: "cancelled" } });
    }
    throw new ResponseError(400, "Unknown action");
  } catch (error) {
    console.error("vendor-payment-checkout error", error);
    const status = error instanceof ResponseError ? error.status : 500;
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unexpected checkout error",
      ...(error instanceof ResponseError && error.code ? { code: error.code } : {}),
    }, status);
  }
});
