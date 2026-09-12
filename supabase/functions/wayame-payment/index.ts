import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import QRCode from "npm:qrcode@1.5.4";

type NormalizedStatus = "pending" | "paid" | "failed" | "declined" | "expired" | "cancelled";

type MerchantVerification = {
  valid: boolean;
  merchantAlias: string;
  merchantName: string;
  merchantCode: string;
  institutionName: string;
  institutionCode?: string | null;
  status: string;
  raw: Record<string, unknown>;
};

type PaymentRequestInput = {
  paysmeTransactionId: string;
  paysmeReference: string;
  partnerId: string;
  merchant: {
    paysmeMerchantId: string;
    providerMerchantCode: string;
    paymentAlias: string;
  };
  payment: { amount: string; currency: "NAD" };
  notifyUrl: string;
  idempotencyKey: string;
};

type PaymentRequestResult = {
  requestId: string;
  networkReference: string | null;
  status: NormalizedStatus;
  providerStatus: string;
  qrPayload: string | null;
  appIntent: string | null;
  expiresAt: string | null;
  raw: Record<string, unknown>;
};

type PaymentNotification = {
  requestId: string;
  networkReference: string | null;
  paysmeReference: string;
  amount: number;
  currency: string;
  status: NormalizedStatus;
  providerStatus: string;
  raw: Record<string, unknown>;
};

interface WayaMeProvider {
  readonly mode: "simulation" | "production";
  readonly sponsorName: string;
  verifyMerchantAddress(alias: string): Promise<MerchantVerification>;
  createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequestResult>;
  getPaymentStatus(requestId: string): Promise<PaymentNotification | null>;
  processNotification(payload: Record<string, unknown>, headers: Headers, rawBody: string): Promise<PaymentNotification>;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wayame-signature, x-wayame-timestamp",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function wayameEnvironment() {
  return {
    partnerId: Deno.env.get("WAYAME_PARTNER_ID") || "",
    aggregatorId: Deno.env.get("WAYAME_AGGREGATOR_ID") || "",
    clientId: Deno.env.get("WAYAME_CLIENT_ID") || "",
    clientSecret: Deno.env.get("WAYAME_CLIENT_SECRET") || "",
    apiKey: Deno.env.get("WAYAME_API_KEY") || "",
    webhookSecret: Deno.env.get("WAYAME_WEBHOOK_SECRET") || "",
  };
}

function assertWayameEnvironment() {
  const config = wayameEnvironment();
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`WayaMe environment credentials are incomplete: ${missing.join(", ")}`);
  return config;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function safeOrigin(value: unknown) {
  try {
    const url = new URL(asString(value));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function getPlanKey(planType?: string | null) {
  if (!planType) return "";
  if (planType.startsWith("annual_partner")) return "annual_partner";
  if (planType.startsWith("starter")) return "starter";
  if (planType.startsWith("growth")) return "growth";
  if (planType.startsWith("scale")) return "scale";
  return planType.replace(/_(3|6|9|12)_months$/, "");
}

function normalizeStatus(value: unknown): NormalizedStatus {
  const status = asString(value).trim().toUpperCase();
  if (["SUCCESS", "PAID", "COMPLETED", "AUTHORISED", "AUTHORIZED", "SETTLED", "0"].includes(status)) return "paid";
  if (["DECLINED", "REJECTED"].includes(status)) return "declined";
  if (["EXPIRED", "TIMED_OUT", "TIMEOUT"].includes(status)) return "expired";
  if (["CANCELLED", "CANCELED"].includes(status)) return "cancelled";
  if (["FAILED", "ERROR", "-1"].includes(status)) return "failed";
  return "pending";
}

function mockMerchantCode(alias: string) {
  let hash = 0;
  for (let index = 0; index < alias.length; index += 1) hash = ((hash << 5) - hash + alias.charCodeAt(index)) | 0;
  return `SIM-WAY-${Math.abs(hash).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}

function randomReference(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

class MockWayaMeProvider implements WayaMeProvider {
  readonly mode = "simulation" as const;
  readonly sponsorName = Deno.env.get("WAYAME_SPONSOR_NAME") || "PaySME WayaMe Simulator";

  async verifyMerchantAddress(alias: string): Promise<MerchantVerification> {
    assertWayameEnvironment();
    const normalized = alias.trim().toLowerCase();
    // Simulation deliberately accepts any non-empty address. The sponsor adapter
    // becomes the source of truth for address validation in production mode.
    const valid = normalized.length > 0;
    if (!valid) {
      return { valid: false, merchantAlias: normalized, merchantName: "", merchantCode: "", institutionName: "", status: "INVALID", raw: {} };
    }
    const localName = normalized.split("@")[0].replace(/[._-]+/g, " ").trim().toUpperCase();
    return {
      valid: true,
      merchantAlias: normalized,
      merchantName: `${localName || "WAYAME"} (SIMULATION)`,
      merchantCode: mockMerchantCode(normalized),
      institutionName: "Mock Participating Bank",
      institutionCode: "SIMBANK",
      status: "ACTIVE",
      raw: { simulation: true },
    };
  }

  async createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const environment = assertWayameEnvironment();
    const requestId = randomReference("WYREQ");
    const networkReference = randomReference("WY");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const qr = new URLSearchParams({
      request_id: requestId,
      merchant: input.merchant.paymentAlias,
      amount: input.payment.amount,
      currency: input.payment.currency,
      reference: input.paysmeReference,
    });
    return {
      requestId,
      networkReference,
      status: "pending",
      providerStatus: "PENDING",
      qrPayload: `wayame://pay?${qr.toString()}`,
      appIntent: null,
      expiresAt,
      raw: {
        simulation: true,
        sponsor: this.sponsorName,
        partner_id: input.partnerId,
        aggregator_id_present: Boolean(environment.aggregatorId),
        client_id_present: Boolean(environment.clientId),
        api_credentials_present: Boolean(environment.apiKey && environment.clientSecret),
      },
    };
  }

  async getPaymentStatus(_requestId: string): Promise<PaymentNotification | null> {
    return null;
  }

  async processNotification(payload: Record<string, unknown>, headers: Headers, rawBody: string): Promise<PaymentNotification> {
    const secret = assertWayameEnvironment().webhookSecret;
    const signature = (headers.get("x-wayame-signature") || "").replace(/^sha256=/i, "").toLowerCase();
    const expected = await hmacHex(secret, rawBody);
    if (!signature || !constantTimeEqual(signature, expected)) throw new Error("WayaMe simulation notification signature is invalid");
    return {
      requestId: asString(payload.request_id),
      networkReference: asString(payload.network_reference) || null,
      paysmeReference: asString(payload.merchant_reference),
      amount: Number(payload.amount),
      currency: asString(payload.currency || "NAD").toUpperCase(),
      status: normalizeStatus(payload.status),
      providerStatus: asString(payload.status || "PENDING"),
      raw: payload,
    };
  }
}

class SponsorWayaMeProvider implements WayaMeProvider {
  readonly mode = "production" as const;
  readonly sponsorName = Deno.env.get("WAYAME_SPONSOR_NAME") || "WayaMe Sponsor";
  private readonly baseUrl = Deno.env.get("WAYAME_API_BASE_URL") || "";

  private route(name: string) {
    const route = Deno.env.get(name) || "";
    if (!this.baseUrl || !route) throw new Error(`WayaMe sponsor route ${name} is not configured`);
    return `${this.baseUrl.replace(/\/$/, "")}/${route.replace(/^\//, "")}`;
  }

  private headers(idempotencyKey?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const apiKey = Deno.env.get("WAYAME_API_KEY");
    const clientId = Deno.env.get("WAYAME_CLIENT_ID");
    const clientSecret = Deno.env.get("WAYAME_CLIENT_SECRET");
    if (apiKey) headers["x-api-key"] = apiKey;
    if (clientId) headers["x-client-id"] = clientId;
    if (clientSecret) headers.Authorization = `Bearer ${clientSecret}`;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return headers;
  }

  private async request(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(asString(data.message || data.error) || `WayaMe sponsor returned HTTP ${response.status}`);
    return data as Record<string, unknown>;
  }

  async verifyMerchantAddress(alias: string): Promise<MerchantVerification> {
    const data = await this.request(this.route("WAYAME_MERCHANT_VERIFY_ROUTE"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ partner_id: Deno.env.get("WAYAME_PARTNER_ID") || "", merchant_alias: alias }),
    });
    return {
      valid: Boolean(data.valid ?? asString(data.status).toUpperCase() === "ACTIVE"),
      merchantAlias: asString(data.merchant_alias || data.alias || alias),
      merchantName: asString(data.merchant_name || data.name),
      merchantCode: asString(data.merchant_code || data.merchant_id),
      institutionName: asString(data.institution || data.institution_name),
      institutionCode: asString(data.institution_code) || null,
      status: asString(data.status || "UNKNOWN"),
      raw: data,
    };
  }

  async createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const data = await this.request(this.route("WAYAME_PAYMENT_REQUEST_ROUTE"), {
      method: "POST",
      headers: this.headers(input.idempotencyKey),
      body: JSON.stringify({
        partner_id: input.partnerId,
        merchant_id: input.merchant.providerMerchantCode,
        merchant_alias: input.merchant.paymentAlias,
        amount: input.payment.amount,
        currency: input.payment.currency,
        merchant_reference: input.paysmeReference,
        notify_url: input.notifyUrl,
      }),
    });
    return {
      requestId: asString(data.request_id || data.payment_request_id),
      networkReference: asString(data.network_reference || data.provider_reference) || null,
      status: normalizeStatus(data.status),
      providerStatus: asString(data.status || "PENDING"),
      qrPayload: asString(data.qr_payload) || null,
      appIntent: asString(data.app_intent || data.deep_link) || null,
      expiresAt: asString(data.expires_at) || null,
      raw: data,
    };
  }

  async getPaymentStatus(requestId: string): Promise<PaymentNotification | null> {
    const route = this.route("WAYAME_PAYMENT_STATUS_ROUTE").replace("{requestId}", encodeURIComponent(requestId));
    const data = await this.request(route, { method: "GET", headers: this.headers() });
    return {
      requestId: asString(data.request_id || requestId),
      networkReference: asString(data.network_reference) || null,
      paysmeReference: asString(data.merchant_reference),
      amount: Number(data.amount),
      currency: asString(data.currency || "NAD").toUpperCase(),
      status: normalizeStatus(data.status),
      providerStatus: asString(data.status || "PENDING"),
      raw: data,
    };
  }

  async processNotification(payload: Record<string, unknown>, headers: Headers, rawBody: string): Promise<PaymentNotification> {
    const secret = Deno.env.get("WAYAME_WEBHOOK_SECRET") || "";
    const signature = (headers.get("x-wayame-signature") || "").replace(/^sha256=/i, "").toLowerCase();
    if (!secret || !signature) throw new Error("WayaMe notification signature is missing");
    const expected = await hmacHex(secret, rawBody);
    if (!constantTimeEqual(signature, expected)) throw new Error("WayaMe notification signature is invalid");
    return {
      requestId: asString(payload.request_id || payload.payment_request_id),
      networkReference: asString(payload.network_reference || payload.provider_reference) || null,
      paysmeReference: asString(payload.merchant_reference),
      amount: Number(payload.amount),
      currency: asString(payload.currency || "NAD").toUpperCase(),
      status: normalizeStatus(payload.status),
      providerStatus: asString(payload.status || "PENDING"),
      raw: payload,
    };
  }
}

function getProvider(): WayaMeProvider {
  return (Deno.env.get("WAYAME_MODE") || "simulation").toLowerCase() === "production"
    ? new SponsorWayaMeProvider()
    : new MockWayaMeProvider();
}

async function requireMerchantUser(req: Request, merchantId: string) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token || !anonKey) return false;
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  return !error && data.user?.id === merchantId;
}

async function validateCheckoutCaller(merchantId: string, apiKey: string, hostedPayment: boolean) {
  let query = supabase.from("merchants").select("merchant_id, business_name, api_key, webhook_url, webhook_secret").eq("merchant_id", merchantId);
  if (!hostedPayment) query = query.eq("api_key", apiKey);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function assertOtherPaymentsAllowed(merchantId: string) {
  const { data: billing, error: billingError } = await supabase
    .from("merchant_billing_status")
    .select("outstanding_fee_amount, outstanding_due_date, billing_locked")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (billingError) throw billingError;
  const amount = Number(billing?.outstanding_fee_amount || 0);
  const due = billing?.outstanding_due_date ? new Date(`${billing.outstanding_due_date}T23:59:59Z`) : null;
  if (amount > 0 && (billing?.billing_locked === true || (due && due < new Date()))) {
    throw new Error("Payments are temporarily disabled for this merchant");
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("plan_type, end_date")
    .eq("user_id", merchantId)
    .eq("status", "active")
    .eq("paycode_status", "paid")
    .order("created_at", { ascending: false });
  if (subscriptionError) throw subscriptionError;
  const subscription = (subscriptions || []).find((row) => row.end_date && new Date(row.end_date) > new Date());
  if (!subscription) throw new Error("Active paid subscription required");

  const { data: rule, error: ruleError } = await supabase
    .from("subscription_plan_rules")
    .select("other_payment_types_enabled")
    .eq("plan_key", getPlanKey(subscription.plan_type))
    .eq("is_active", true)
    .maybeSingle();
  if (ruleError) throw ruleError;
  if (!rule?.other_payment_types_enabled) throw new Error("WayaMe is not available on this subscription plan");
}

async function verifiedWayaMeFacilitator(merchantId: string) {
  const { data, error } = await supabase
    .from("merchant_payment_facilitators")
    .select("merchant_payment_facilitator_id, facilitator_id, payment_provider_id, provider_merchant_code, enabled, status, metadata")
    .eq("merchant_id", merchantId)
    .eq("provider_key", "wayame")
    .maybeSingle();
  if (error) throw error;
  const metadata = (data?.metadata || {}) as Record<string, unknown>;
  if (!data || !data.enabled || data.status !== "active" || metadata.verification_status !== "verified" || !metadata.merchant_alias) {
    return null;
  }
  return { ...data, metadata };
}

async function verifyMerchant(req: Request, body: Record<string, unknown>, provider: WayaMeProvider) {
  const merchantId = asString(body.merchant_id);
  const alias = asString(body.merchant_alias).trim().toLowerCase();
  if (!merchantId || !alias) return jsonResponse({ error: "merchant_id and merchant_alias are required" }, 400);
  if (!(await requireMerchantUser(req, merchantId))) return jsonResponse({ error: "Merchant authentication required" }, 401);

  const verification = await provider.verifyMerchantAddress(alias);
  if (!verification.valid || verification.status.toUpperCase() !== "ACTIVE") {
    return jsonResponse({ ok: false, valid: false, error: "This WayaMe payment address could not be verified" }, 422);
  }

  const { data: facilitator, error: facilitatorError } = await supabase
    .from("facilitators")
    .select("facilitator_id")
    .eq("facilitator_key", "wayame")
    .eq("status", "active")
    .maybeSingle();
  if (facilitatorError) throw facilitatorError;
  if (!facilitator) return jsonResponse({ error: "WayaMe facilitator is not configured" }, 500);

  const verifiedAt = new Date().toISOString();
  const metadata = {
    merchant_alias: verification.merchantAlias,
    merchant_code: verification.merchantCode,
    institution_name: verification.institutionName,
    institution_code: verification.institutionCode || null,
    verification_status: "verified",
    verified_name: verification.merchantName,
    verified_at: verifiedAt,
    provider_mode: provider.mode,
    sponsor_name: provider.sponsorName,
  };
  const { error: saveError } = await supabase.from("merchant_payment_facilitators").upsert({
    merchant_id: merchantId,
    facilitator_id: facilitator.facilitator_id,
    provider_key: "wayame",
    provider_display_name: "WayaMe",
    provider_merchant_code: verification.merchantCode || verification.merchantAlias,
    status: "active",
    enabled: true,
    metadata,
  }, { onConflict: "merchant_id,provider_key" });
  if (saveError) throw saveError;

  return jsonResponse({ ok: true, valid: true, mode: provider.mode, ...metadata });
}

async function createPayment(body: Record<string, unknown>, provider: WayaMeProvider) {
  const merchantId = asString(body.merchant_id || body.vendor_uuid);
  const generatedCode = asString(body.generated_code);
  const apiKey = asString(body.api_key);
  const hostedPayment = body.hosted_payment === true;
  const amount = Number(body.amount);
  const invoiceId = asString(body.invoice_id);
  const retryFailed = body.retry_failed === true;
  if (!merchantId || !generatedCode || !invoiceId || !Number.isFinite(amount) || amount <= 0 || (!apiKey && !hostedPayment)) {
    return jsonResponse({ error: "merchant_id, generated_code, invoice_id, amount and SDK api_key are required" }, 400);
  }

  const merchant = await validateCheckoutCaller(merchantId, apiKey, hostedPayment);
  if (!merchant) return jsonResponse({ error: "Invalid merchant credentials" }, 401);
  await assertOtherPaymentsAllowed(merchantId);

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("transaction_id, merchant_id, generated_code, invoice_id, amount, status, finalized, business_name, user_mobile, sms_notifications_enabled, allowed_payment_methods")
    .eq("merchant_id", merchantId)
    .eq("generated_code", generatedCode)
    .maybeSingle();
  if (transactionError) throw transactionError;
  if (!transaction) return jsonResponse({ error: "PaySME transaction was not found" }, 404);
  const retryableFailure = retryFailed && transaction.status === "failed" && transaction.finalized !== true && !hostedPayment;
  if ((transaction.status !== "pending" && !retryableFailure) || transaction.finalized === true) {
    return jsonResponse({ error: "This PaySME transaction is no longer pending" }, 409);
  }
  if (!transaction.allowed_payment_methods?.includes("wayame")) return jsonResponse({ error: "WayaMe is not allowed for this transaction" }, 403);
  if (String(transaction.invoice_id || "") !== invoiceId || Math.abs(Number(transaction.amount) - amount) >= 0.005) {
    return jsonResponse({ error: "Transaction amount or invoice does not match" }, 409);
  }

  const facilitator = await verifiedWayaMeFacilitator(merchantId);
  if (!facilitator) return jsonResponse({ error: "The merchant's WayaMe payment address is not verified and enabled" }, 409);

  const { data: existingRows, error: existingError } = await supabase
    .from("wayame_payment_attempts")
    .select("*")
    .eq("transaction_id", transaction.transaction_id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;
  const existing = existingRows?.[0] || null;
  if (existing && ["pending", "paid"].includes(existing.status)) {
    return paymentResponse(existing, merchant.business_name || transaction.business_name, provider.mode);
  }

  if (retryableFailure) {
    const { data: resetTransaction, error: resetError } = await supabase.from("transactions").update({
      status: "pending",
      finalized: false,
      date_paid: null,
      amount_paid: null,
      payment_provider_signature: null,
      payment_provider_id: null,
      facilitator_id: null,
      facilitator_merchant_code: null,
      payment_method: "wayame",
      updated_at: new Date().toISOString(),
    }).eq("transaction_id", transaction.transaction_id).eq("status", "failed").select("transaction_id").maybeSingle();
    if (resetError) throw resetError;
    if (!resetTransaction) return jsonResponse({ error: "This payment was already retried or is no longer retryable" }, 409);
  }

  const previousKeyParts = existing ? asString(existing.idempotency_key).split(":") : [];
  const previousSequence = previousKeyParts.length > 1 ? Number(previousKeyParts[previousKeyParts.length - 1]) : 1;
  const attemptSequence = existing ? (Number.isFinite(previousSequence) ? previousSequence + 1 : 2) : 1;
  const idempotencyKey = attemptSequence === 1 ? transaction.transaction_id : `${transaction.transaction_id}:${attemptSequence}`;

  const result = await provider.createPaymentRequest({
    paysmeTransactionId: transaction.transaction_id,
    paysmeReference: transaction.generated_code,
    partnerId: assertWayameEnvironment().partnerId,
    merchant: {
      paysmeMerchantId: merchantId,
      providerMerchantCode: facilitator.provider_merchant_code,
      paymentAlias: asString(facilitator.metadata.merchant_alias),
    },
    payment: { amount: amount.toFixed(2), currency: "NAD" },
    notifyUrl: `${supabaseUrl}/functions/v1/wayame-payment?action=notify`,
    idempotencyKey,
  });
  if (!result.requestId) return jsonResponse({ error: "WayaMe provider did not return a payment request ID" }, 502);

  const { data: attempt, error: insertError } = await supabase.from("wayame_payment_attempts").insert({
    transaction_id: transaction.transaction_id,
    merchant_id: merchantId,
    merchant_payment_facilitator_id: facilitator.merchant_payment_facilitator_id,
    request_id: result.requestId,
    network_reference: result.networkReference,
    idempotency_key: idempotencyKey,
    status: result.status,
    provider_status: result.providerStatus,
    amount,
    currency: "NAD",
    merchant_alias: asString(facilitator.metadata.merchant_alias),
    merchant_code: facilitator.provider_merchant_code,
    qr_payload: result.qrPayload,
    app_intent: result.appIntent,
    origin_url: safeOrigin(body.origin_url),
    expires_at: result.expiresAt,
    provider_payload: { ...result.raw, paysme_reference: transaction.generated_code },
  }).select("*").single();
  if (insertError) throw insertError;

  return paymentResponse(attempt, merchant.business_name || transaction.business_name, provider.mode);
}

async function paymentResponse(attempt: Record<string, unknown>, merchantName: string | null, mode: string) {
  let qrImage: string | null = null;
  if (attempt.qr_payload) {
    try {
      qrImage = await QRCode.toDataURL(asString(attempt.qr_payload), { width: 280, margin: 2, errorCorrectionLevel: "M" });
    } catch (error) {
      console.error("WayaMe QR generation failed", error);
    }
  }
  return jsonResponse({
    ok: true,
    provider: "wayame",
    mode,
    simulation: mode === "simulation",
    request_id: attempt.request_id,
    network_reference: attempt.network_reference,
    status: attempt.status,
    provider_status: attempt.provider_status,
    merchant_name: merchantName || "PaySME Merchant",
    merchant_alias: attempt.merchant_alias,
    amount: Number(attempt.amount),
    currency: attempt.currency,
    qr_payload: attempt.qr_payload,
    qr_image: qrImage,
    app_intent: attempt.app_intent,
    expires_at: attempt.expires_at,
  });
}

async function validateAttemptCaller(body: Record<string, unknown>) {
  const merchantId = asString(body.merchant_id || body.vendor_uuid);
  const merchant = await validateCheckoutCaller(merchantId, asString(body.api_key), body.hosted_payment === true);
  if (!merchant) return { merchant: null, attempt: null };
  const { data: attempt, error } = await supabase
    .from("wayame_payment_attempts")
    .select("*")
    .eq("request_id", asString(body.request_id))
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw error;
  return { merchant, attempt };
}

async function processNotification(notification: PaymentNotification) {
  if (!notification.requestId || !Number.isFinite(notification.amount)) throw new Error("Invalid WayaMe notification payload");
  const { data: attempt, error: attemptError } = await supabase
    .from("wayame_payment_attempts")
    .select("*")
    .eq("request_id", notification.requestId)
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) throw new Error("WayaMe payment request was not found");
  if (attempt.status === "paid") return { ok: true, idempotent: true, status: "paid", attempt };
  if (notification.currency !== "NAD" || Math.abs(Number(attempt.amount) - notification.amount) >= 0.005) {
    throw new Error("WayaMe notification amount or currency does not match");
  }
  if (notification.paysmeReference && notification.paysmeReference !== attempt.provider_payload?.paysme_reference) {
    const { data: referenceTransaction } = await supabase.from("transactions").select("generated_code").eq("transaction_id", attempt.transaction_id).maybeSingle();
    if (referenceTransaction && notification.paysmeReference !== referenceTransaction.generated_code) throw new Error("WayaMe merchant reference does not match");
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("transaction_id, merchant_id, generated_code, invoice_id, amount, status, finalized, business_name, user_mobile, sms_notifications_enabled")
    .eq("transaction_id", attempt.transaction_id)
    .maybeSingle();
  if (transactionError) throw transactionError;
  if (!transaction) throw new Error("PaySME transaction was not found");

  if (notification.status !== "paid") {
    const completedAt = notification.status === "pending" ? null : new Date().toISOString();
    const { error: updateAttemptError } = await supabase.from("wayame_payment_attempts").update({
      status: notification.status,
      provider_status: notification.providerStatus,
      network_reference: notification.networkReference || attempt.network_reference,
      completed_at: completedAt,
      provider_payload: { ...(attempt.provider_payload || {}), last_notification: notification.raw },
    }).eq("attempt_id", attempt.attempt_id);
    if (updateAttemptError) throw updateAttemptError;
    if (notification.status !== "pending" && transaction.status === "pending") {
      await supabase.from("transactions").update({
        status: "failed",
        finalized: false,
        payment_method: "wayame",
        payment_provider_signature: notification.requestId,
        updated_at: new Date().toISOString(),
      }).eq("transaction_id", transaction.transaction_id).eq("status", "pending");
    }
    return { ok: true, idempotent: false, status: notification.status, attempt };
  }

  const { data: facilitator, error: facilitatorError } = await supabase
    .from("merchant_payment_facilitators")
    .select("facilitator_id, payment_provider_id, provider_merchant_code")
    .eq("merchant_payment_facilitator_id", attempt.merchant_payment_facilitator_id)
    .maybeSingle();
  if (facilitatorError) throw facilitatorError;

  const paidAt = new Date().toISOString();
  const { data: paidTransaction, error: paidError } = await supabase.from("transactions").update({
    status: "paid",
    date_paid: paidAt,
    amount_paid: Number(attempt.amount),
    finalized: true,
    facilitator_id: facilitator?.facilitator_id || null,
    facilitator_merchant_code: facilitator?.provider_merchant_code || attempt.merchant_code,
    payment_provider_id: facilitator?.payment_provider_id || null,
    payment_provider_signature: notification.requestId,
    payment_method: "wayame",
    updated_at: paidAt,
  }).eq("transaction_id", transaction.transaction_id).eq("status", "pending").select("transaction_id").maybeSingle();
  if (paidError) throw paidError;
  if (!paidTransaction && !(transaction.status === "paid" && transaction.finalized === true)) {
    throw new Error("PaySME transaction was not pending when WayaMe confirmed payment");
  }

  const { error: paidAttemptError } = await supabase.from("wayame_payment_attempts").update({
    status: "paid",
    provider_status: notification.providerStatus,
    network_reference: notification.networkReference || attempt.network_reference,
    completed_at: paidAt,
    provider_payload: { ...(attempt.provider_payload || {}), last_notification: notification.raw },
  }).eq("attempt_id", attempt.attempt_id);
  if (paidAttemptError) throw paidAttemptError;

  if (paidTransaction && transaction.user_mobile && transaction.sms_notifications_enabled !== false) {
    fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ action: "send_payment_confirmation", payload: {
        mobile: transaction.user_mobile,
        generated_code: transaction.generated_code,
        amount: transaction.amount,
        business_name: transaction.business_name || "PaySME",
      } }),
    }).catch((error) => console.error("WayaMe confirmation SMS failed", error));
  }

  if (paidTransaction) {
    const { data: merchant } = await supabase.from("merchants").select("webhook_url, webhook_secret").eq("merchant_id", transaction.merchant_id).maybeSingle();
    if (merchant?.webhook_url) {
      try {
        await fetch(merchant.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-webhook-secret": merchant.webhook_secret || "", "x-paysme-secret": merchant.webhook_secret || "" },
          body: JSON.stringify({
            paySMECode: transaction.generated_code,
            generated_code: transaction.generated_code,
            invoiceId: transaction.invoice_id,
            status: "paid",
            result: 0,
            amount: Number(transaction.amount),
            currency: "NAD",
            paymentMethod: "WAYAME",
            facilitatorTransactionNumber: notification.networkReference || notification.requestId,
            timestamp: Date.now().toString(),
          }),
        });
      } catch (error) {
        console.error("WayaMe merchant webhook failed", error);
      }
    }
  }

  return { ok: true, idempotent: !paidTransaction, status: "paid", attempt };
}

async function statusResponse(body: Record<string, unknown>, provider: WayaMeProvider) {
  const { merchant, attempt } = await validateAttemptCaller(body);
  if (!merchant) return jsonResponse({ error: "Invalid merchant credentials" }, 401);
  if (!attempt) return jsonResponse({ error: "WayaMe payment request was not found" }, 404);
  if (provider.mode === "production" && attempt.status === "pending") {
    const providerStatus = await provider.getPaymentStatus(attempt.request_id);
    if (providerStatus && providerStatus.status !== "pending") await processNotification(providerStatus);
  }
  const { data: refreshed } = await supabase.from("wayame_payment_attempts").select("status, provider_status, network_reference, expires_at").eq("attempt_id", attempt.attempt_id).single();
  return jsonResponse({ ok: true, request_id: attempt.request_id, ...(refreshed || attempt) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "WayaMe service is not configured" }, 500);

  const url = new URL(req.url);
  const provider = getProvider();
  try {
    if (req.method === "POST" && url.searchParams.get("action") === "notify") {
      if (provider.mode !== "production") {
        return jsonResponse({ error: "Provider notifications are disabled during simulation testing" }, 409);
      }
      const rawBody = await req.text();
      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      const notification = await provider.processNotification(payload, req.headers, rawBody);
      const result = await processNotification(notification);
      return jsonResponse(result);
    }
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = asString(body.action || url.searchParams.get("action")).replace(/-/g, "_").toLowerCase();
    if (action === "verify_merchant") return await verifyMerchant(req, body, provider);
    if (action === "create_payment") return await createPayment(body, provider);
    if (action === "status") return await statusResponse(body, provider);
    return jsonResponse({ error: "Unknown WayaMe action" }, 404);
  } catch (error) {
    console.error("WayaMe payment error", error);
    const message = error instanceof Error ? error.message : "WayaMe payment processing failed";
    const status = /environment credentials are incomplete|sponsor route|not configured/i.test(message) ? 503
      : /authentication|required|credentials|signature/i.test(message) ? 401
      : /not found/i.test(message) ? 404
      : /match|pending|already|disabled|available|verified/i.test(message) ? 409
      : 500;
    return jsonResponse({ ok: false, error: message, mode: provider.mode }, status);
  }
});
