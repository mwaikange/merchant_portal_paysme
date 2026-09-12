import { createClient } from "npm:@supabase/supabase-js@2.39.3";

type ProviderKey = "mtc_maris" | "paypulse" | "paytoday" | "kazang";
const providerKeys: ProviderKey[] = ["mtc_maris", "paypulse", "paytoday", "kazang"];

type ProviderConfig = {
  key: ProviderKey;
  displayName: string;
  partnerCode: string;
  password: string;
  authUrl: string;
  initiateUrl: string;
  queryUrl: string;
};

type MobiWandAttempt = {
  attempt_id: string;
  transaction_id: string;
  merchant_id: string;
  facilitator_id: string;
  provider_key: ProviderKey;
  partner_code: string;
  merchant_code: string;
  merchant_transaction_number: string;
  tracking_id: string;
  amount: number;
  origin_url: string | null;
  payment_transaction_number?: string | null;
};

type PaySMETransaction = {
  transaction_id: string;
  merchant_id: string;
  generated_code: string;
  invoice_id?: string | null;
  amount: number;
  business_name?: string | null;
  user_mobile?: string | null;
  finalized?: boolean | null;
  status?: string | null;
  sms_notifications_enabled?: boolean | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readValue(input: unknown, ...candidateKeys: string[]): unknown {
  const wanted = new Set(candidateKeys.map(normalizeKey));
  const queue: unknown[] = [input];
  const visited = new Set<unknown>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);

    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (wanted.has(normalizeKey(key)) && value !== null && value !== undefined && value !== "") {
        return value;
      }
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return undefined;
}

function asString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function joinEndpoint(baseUrl: string, methodName: string) {
  return `${baseUrl.replace(/\/$/, "")}/${methodName}`;
}

function providerConfig(provider: ProviderKey): ProviderConfig {
  const prefix = provider === "mtc_maris"
    ? "MOBIWAND_MTC_MARIS"
    : provider === "paypulse"
      ? "MOBIWAND_PAYPULSE"
      : provider === "paytoday"
        ? "MOBIWAND_PAYTODAY"
        : "KAZANG";
  const displayName = provider === "mtc_maris" ? "MTC Maris" : provider === "paypulse" ? "PayPulse" : provider === "paytoday" ? "PayToday" : "Kazang";
  const defaultPartnerCode = provider === "mtc_maris" ? "MTC001" : provider === "paypulse" ? "PAYPULSE002" : provider === "paytoday" ? "PAYTODAY003" : "KAZANG004";
  const sharedBaseUrl = Deno.env.get("MOBIWAND_API_URL") || "";
  const baseUrl = Deno.env.get(`${prefix}_API_URL`) || sharedBaseUrl;

  return {
    key: provider,
    displayName,
    partnerCode: Deno.env.get(`${prefix}_PARTNER_CODE`) || defaultPartnerCode,
    password: Deno.env.get(`${prefix}_PASSWORD`) || "",
    authUrl: Deno.env.get(`${prefix}_AUTH_URL`) || (baseUrl ? joinEndpoint(baseUrl, "executeAuthenticatePartnerTransaction") : ""),
    initiateUrl: Deno.env.get(`${prefix}_INITIATE_URL`) || (baseUrl ? joinEndpoint(baseUrl, "executeInitiatePaymentTransaction") : ""),
    queryUrl: Deno.env.get(`${prefix}_QUERY_URL`) || (baseUrl ? joinEndpoint(baseUrl, "executePaymentQueryTransaction") : ""),
  };
}

function assertConfigured(config: ProviderConfig) {
  if (!config.password || !config.authUrl || !config.initiateUrl || !config.queryUrl) {
    throw new Error(`${config.displayName} MobiWand credentials are not configured yet`);
  }
}

async function postGateway(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const message = asString(readValue(data, "message", "responseMessage")) || `HTTP ${response.status}`;
    throw new Error(`MobiWand request failed: ${message}`);
  }
  return data;
}

async function authenticate(config: ProviderConfig) {
  const response = await postGateway(config.authUrl, {
    partnerCode: config.partnerCode,
    password: config.password,
  });
  const token = asString(readValue(response, "authToken", "token"));
  if (!token) {
    const message = asString(readValue(response, "message", "responseMessage")) || "Authentication did not return an auth token";
    throw new Error(`${config.displayName} authentication failed: ${message}`);
  }
  return token;
}

function normalizeMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^0(81|83|85)\d{7}$/.test(digits)) return `+264${digits.slice(1)}`;
  if (/^264(81|83|85)\d{7}$/.test(digits)) return `+${digits}`;
  throw new Error("Customer mobile must use 081, 083, 085 or +26481, +26483, +26485 followed by 7 digits");
}

function safeOriginUrl(value: unknown) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function callbackUrl(attemptId: string, channel: "return" | "notify") {
  const url = new URL(`${supabaseUrl}/functions/v1/mobiwand-payment`);
  url.searchParams.set("attempt_id", attemptId);
  url.searchParams.set("channel", channel);
  return url.toString();
}

async function initiatePayment(req: Request) {
  const body = await req.json().catch(() => ({}));
  const provider = body.provider as ProviderKey;
  if (!providerKeys.includes(provider)) {
    return jsonResponse({ error: "provider must be mtc_maris, paypulse, paytoday or kazang" }, 400);
  }

  const merchantId = asString(body.merchant_id || body.vendor_uuid);
  const apiKey = asString(body.api_key);
  const generatedCode = asString(body.generated_code).trim();
  const hostedPayment = body.hosted_payment === true;
  if (!merchantId || (!apiKey && !hostedPayment) || !generatedCode) {
    return jsonResponse({ error: "merchant_id, generated_code, and SDK api_key are required" }, 400);
  }

  const config = providerConfig(provider);
  assertConfigured(config);

  let merchantQuery = supabase
    .from("merchants")
    .select("merchant_id, business_name, api_key")
    .eq("merchant_id", merchantId);
  if (!hostedPayment) merchantQuery = merchantQuery.eq("api_key", apiKey);
  const { data: merchant, error: merchantError } = await merchantQuery.maybeSingle();

  if (merchantError) throw merchantError;
  if (!merchant) return jsonResponse({ error: "Invalid merchant credentials" }, 401);

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("transaction_id, merchant_id, generated_code, amount, invoice_id, business_name, user_mobile, user_email, status, finalized, sms_notifications_enabled, vendor_obligation_id, vendor_redeemable, allowed_payment_methods")
    .eq("merchant_id", merchantId)
    .eq("generated_code", generatedCode)
    .maybeSingle();

  if (transactionError) throw transactionError;
  if (!transaction) return jsonResponse({ error: "PaySME code was not found" }, 404);
  if (body.vendor_obligation_id &&
      (transaction.vendor_obligation_id !== body.vendor_obligation_id ||
       transaction.vendor_redeemable !== false ||
       !transaction.allowed_payment_methods?.includes(provider))) {
    return jsonResponse({ error: "Invalid restricted vendor checkout" }, 403);
  }
  if (transaction.status !== "pending" || transaction.finalized === true) {
    return jsonResponse({ error: "This PaySME code is no longer pending" }, 409);
  }
  if (!transaction.user_mobile) {
    return jsonResponse({ error: "A customer mobile number is required for this payment" }, 400);
  }

  const { data: facilitatorSetup, error: facilitatorError } = await supabase
    .from("merchant_payment_facilitators")
    .select("facilitator_id, provider_merchant_code, enabled, status")
    .eq("merchant_id", merchantId)
    .eq("provider_key", provider)
    .maybeSingle();

  if (facilitatorError) throw facilitatorError;
  if (!facilitatorSetup?.facilitator_id || !facilitatorSetup.provider_merchant_code || !facilitatorSetup.enabled || facilitatorSetup.status === "rejected") {
    return jsonResponse({ error: `${config.displayName} merchant code is not active for this merchant` }, 409);
  }

  const authToken = await authenticate(config);
  const merchantName = transaction.business_name || merchant.business_name || "PaySME Merchant";
  const mobileNumber = normalizeMobile(transaction.user_mobile);
  const amount = Number(transaction.amount);
  const initiateResponse = await postGateway(config.initiateUrl, {
    amount: amount.toFixed(2),
    authToken,
    currency: "NAD",
    merchantAdditionalData: [
      { key: "paysmeTransactionId", value: transaction.transaction_id },
      { key: "paysmeInvoiceId", value: transaction.invoice_id || "" },
    ],
    merchantCode: facilitatorSetup.provider_merchant_code,
    merchantDescription: `${merchantName} - PaySME Payment`.slice(0, 160),
    merchantTransactionNumber: transaction.generated_code,
    mobileNumber,
    partnerCode: config.partnerCode,
    transactionSubType: "ONLINE_MERCHANT_PAYMENT",
  });

  const trackingId = asString(readValue(initiateResponse, "trackingId"));
  const checksum = asString(readValue(initiateResponse, "checksum"));
  const redirectURL = asString(readValue(initiateResponse, "redirectURL", "redirectUrl"));
  const initiateTransactionNumber = asString(readValue(initiateResponse, "transactionNumber"));
  if (!trackingId || !checksum || !redirectURL || !initiateTransactionNumber) {
    const message = asString(readValue(initiateResponse, "message", "responseMessage")) || "Incomplete initiate-payment response";
    throw new Error(`${config.displayName} initiation failed: ${message}`);
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("mobiwand_payment_attempts")
    .insert({
      transaction_id: transaction.transaction_id,
      merchant_id: merchantId,
      facilitator_id: facilitatorSetup.facilitator_id,
      provider_key: provider,
      partner_code: config.partnerCode,
      merchant_code: facilitatorSetup.provider_merchant_code,
      merchant_transaction_number: transaction.generated_code,
      tracking_id: trackingId,
      initiate_transaction_number: initiateTransactionNumber,
      amount,
      currency: "NAD",
      mobile_number: mobileNumber,
      origin_url: safeOriginUrl(body.origin_url),
      status: "initiated",
      provider_response: initiateResponse,
    })
    .select("attempt_id")
    .single();

  if (attemptError) throw attemptError;

  return jsonResponse({
    ok: true,
    attempt_id: attempt.attempt_id,
    provider,
    provider_name: config.displayName,
    form_action: redirectURL,
    form_fields: {
      trackingId,
      checksum,
      partnerCode: config.partnerCode,
      returnURL: callbackUrl(attempt.attempt_id, "return"),
      transactionNumber: initiateTransactionNumber,
      merchantLogo: "https://www.paysme.site/images/paysme-logo-powered.png",
      merchantName,
      notifyURL: callbackUrl(attempt.attempt_id, "notify"),
    },
  });
}

async function confirmProviderCode(body: Record<string, unknown>) {
  const provider = body.provider as ProviderKey;
  const merchantId = asString(body.merchant_id || body.vendor_uuid);
  const apiKey = asString(body.api_key);
  const hostedPayment = body.hosted_payment === true;
  const generatedCode = asString(body.generated_code).trim();
  const confirmationCode = asString(body.confirmation_code).replace(/\D/g, "");

  if (!providerKeys.includes(provider)) {
    return jsonResponse({ error: "provider must be mtc_maris, paypulse, paytoday or kazang" }, 400);
  }
  if (!merchantId || (!apiKey && !hostedPayment) || !generatedCode) {
    return jsonResponse({ error: "merchant_id, generated_code, and SDK api_key are required" }, 400);
  }
  const isValidConfirmationCode = provider === "kazang"
    ? /^\d{16}$/.test(confirmationCode)
    : /^\d{4,12}$/.test(confirmationCode);
  if (!isValidConfirmationCode) {
    return jsonResponse({
      error: provider === "kazang"
        ? "Enter the 16-digit PIN printed on the EasyPay Voucher"
        : "Enter the numeric confirmation Paycode sent by the provider",
    }, 400);
  }

  let merchantQuery = supabase
    .from("merchants")
    .select("merchant_id")
    .eq("merchant_id", merchantId);
  if (!hostedPayment) merchantQuery = merchantQuery.eq("api_key", apiKey);
  const { data: merchant, error: merchantError } = await merchantQuery.maybeSingle();
  if (merchantError) throw merchantError;
  if (!merchant) return jsonResponse({ error: "Invalid merchant credentials" }, 401);

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("transaction_id, status, finalized")
    .eq("merchant_id", merchantId)
    .eq("generated_code", generatedCode)
    .maybeSingle();
  if (transactionError) throw transactionError;
  if (!transaction) return jsonResponse({ error: "PaySME code was not found" }, 404);
  if (transaction.status !== "pending" || transaction.finalized === true) {
    return jsonResponse({ error: "This PaySME code is no longer pending" }, 409);
  }

  // The UI and stable PaySME request contract are ready. When the providers
  // provide the direct confirmation API, implement the provider call here and
  // verify its transaction response before reusing forwardSuccess(). Never
  // expose the provider Paycode in logs or persist it in the database.
  return jsonResponse({
    error: `${providerConfig(provider).displayName} confirmation API is awaiting provider credentials`,
    code: "provider_confirmation_api_pending",
  }, 501);
}

function requestProviderCode(body: Record<string, unknown>) {
  const provider = body.provider as ProviderKey;
  const merchantId = asString(body.merchant_id || body.vendor_uuid);
  const apiKey = asString(body.api_key);
  const hostedPayment = body.hosted_payment === true;
  const generatedCode = asString(body.generated_code).trim();
  if (!providerKeys.includes(provider)) {
    return jsonResponse({ error: "provider must be mtc_maris, paypulse, paytoday or kazang" }, 400);
  }
  if (!merchantId || (!apiKey && !hostedPayment) || !generatedCode) {
    return jsonResponse({ error: "merchant_id, generated_code, and SDK api_key are required" }, 400);
  }

  // Complete this adapter when the provider supplies the white-label request-
  // Paycode endpoint. The SDK already invokes this action when Proceed is
  // selected, so no future merchant-site or SDK integration change is needed.
  return jsonResponse({
    error: `${providerConfig(provider).displayName} Paycode request API is awaiting provider credentials`,
    code: "provider_request_api_pending",
  }, 501);
}

function providerStatus(value: string) {
  if (value === "0000") return "paid";
  if (value === "2222") return "cancelled";
  if (value === "1111") return "timed_out";
  return "failed";
}

function numberMatches(left: unknown, right: unknown) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.005;
}

async function forwardSuccess(attempt: MobiWandAttempt, transaction: PaySMETransaction) {
  if (transaction.finalized === true && transaction.status === "paid") return;

  const paidAt = new Date().toISOString();
  const { data: updatedTransaction, error: updateError } = await supabase
    .from("transactions")
    .update({
      status: "paid",
      date_paid: paidAt,
      amount_paid: attempt.amount,
      finalized: true,
      facilitator_id: attempt.facilitator_id,
      facilitator_merchant_code: attempt.merchant_code,
      payment_method: attempt.provider_key,
      updated_at: paidAt,
    })
    .eq("transaction_id", transaction.transaction_id)
    .eq("status", "pending")
    .select("transaction_id")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updatedTransaction) return;

  if (transaction.user_mobile && transaction.sms_notifications_enabled !== false) {
    fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        action: "send_payment_confirmation",
        payload: {
          mobile: transaction.user_mobile,
          generated_code: transaction.generated_code,
          amount: transaction.amount,
          business_name: transaction.business_name || "PaySME",
        },
      }),
    }).catch((error) => console.error("MobiWand confirmation SMS failed", error));
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("webhook_url, webhook_secret")
    .eq("merchant_id", transaction.merchant_id)
    .maybeSingle();

  if (merchant?.webhook_url) {
    const payload = {
      paySMECode: transaction.generated_code,
      generated_code: transaction.generated_code,
      invoiceId: transaction.invoice_id,
      status: "paid",
      result: 0,
      amount: Number(transaction.amount),
      currency: "NAD",
      paymentMethod: attempt.provider_key === "mtc_maris"
        ? "MTC_MARIS"
        : attempt.provider_key === "paypulse"
          ? "PAYPULSE"
          : attempt.provider_key === "paytoday"
            ? "PAYTODAY"
            : "KAZANG",
      facilitatorTransactionNumber: attempt.payment_transaction_number,
      timestamp: Date.now().toString(),
    };
    fetch(merchant.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": merchant.webhook_secret || "",
        "x-paysme-secret": merchant.webhook_secret || "",
      },
      body: JSON.stringify(payload),
    }).catch((error) => console.error("MobiWand merchant webhook failed", error));
  }
}

async function processCallback(url: URL) {
  const attemptId = url.searchParams.get("attempt_id") || "";
  const channel = url.searchParams.get("channel") === "notify" ? "notify" : "return";
  const statusCode = url.searchParams.get("status") || "";
  const trackingId = url.searchParams.get("trackingId") || "";
  const paymentTransactionNumber = url.searchParams.get("transactionNumber") || "";

  const { data: attempt, error: attemptError } = await supabase
    .from("mobiwand_payment_attempts")
    .select("*")
    .eq("attempt_id", attemptId)
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) return callbackResponse(channel, null, "failed", "Payment attempt was not found", 404);
  if (!statusCode || !trackingId || trackingId !== attempt.tracking_id) {
    return callbackResponse(channel, attempt, "failed", "Invalid MobiWand callback", 400);
  }

  const nextStatus = providerStatus(statusCode);
  if (nextStatus !== "paid") {
    await supabase.from("mobiwand_payment_attempts").update({
      status: nextStatus,
      provider_status: statusCode,
      payment_transaction_number: paymentTransactionNumber || null,
      completed_at: new Date().toISOString(),
    }).eq("attempt_id", attemptId);
    return callbackResponse(channel, attempt, nextStatus, `Payment ${nextStatus.replace('_', ' ')}`);
  }

  if (!paymentTransactionNumber) {
    return callbackResponse(channel, attempt, "failed", "Successful callback did not include a transaction number", 400);
  }

  const config = providerConfig(attempt.provider_key as ProviderKey);
  assertConfigured(config);
  const authToken = await authenticate(config);
  const queryResponse = await postGateway(config.queryUrl, {
    authToken,
    partnerCode: attempt.partner_code,
    transactionNumber: paymentTransactionNumber,
  });

  const responseCode = asString(readValue(queryResponse, "responseCode", "response code"));
  const queriedPaycode = asString(readValue(queryResponse, "merchantTransactionNumber"));
  const queriedMerchantCode = asString(readValue(queryResponse, "merchantCode"));
  const queriedAmount = readValue(queryResponse, "amount");
  const queriedCurrency = asString(readValue(queryResponse, "currency"));
  if ((responseCode && !["0", "0000"].includes(responseCode)) ||
      queriedPaycode !== attempt.merchant_transaction_number ||
      queriedMerchantCode !== attempt.merchant_code ||
      !numberMatches(queriedAmount, attempt.amount) ||
      (queriedCurrency && queriedCurrency !== "NAD")) {
    console.error("MobiWand query verification mismatch", { attemptId, queryResponse });
    return callbackResponse(channel, attempt, "failed", "Provider verification did not match the PaySME transaction", 502);
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("*")
    .eq("transaction_id", attempt.transaction_id)
    .single();
  if (transactionError) throw transactionError;

  const completedAttempt = {
    ...attempt,
    payment_transaction_number: paymentTransactionNumber,
  };
  await forwardSuccess(completedAttempt, transaction);
  await supabase.from("mobiwand_payment_attempts").update({
    status: "paid",
    provider_status: statusCode,
    payment_transaction_number: paymentTransactionNumber,
    provider_response: queryResponse,
    completed_at: new Date().toISOString(),
  }).eq("attempt_id", attemptId);

  return callbackResponse(channel, completedAttempt, "paid", "Payment confirmed");
}

function callbackResponse(
  channel: "return" | "notify",
  attempt: MobiWandAttempt | null,
  status: string,
  message: string,
  httpStatus = 200,
) {
  const payload = {
    source: "paysme-mobiwand",
    attempt_id: attempt?.attempt_id || null,
    provider: attempt?.provider_key || null,
    generated_code: attempt?.merchant_transaction_number || null,
    status,
    message,
  };
  if (channel === "notify") return jsonResponse({ ok: httpStatus < 400, ...payload }, httpStatus);

  const targetOrigin = attempt?.origin_url ? new URL(attempt.origin_url).origin : "*";
  const safePayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  const safeTarget = JSON.stringify(targetOrigin);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>PaySME Payment</title></head>
<body style="margin:0;background:#111827;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh">
<main style="max-width:420px;text-align:center;padding:32px"><h1 style="font-size:22px">${status === "paid" ? "Payment confirmed" : "Payment not completed"}</h1><p>${message}</p><p style="color:#9ca3af;font-size:14px">You may close this window.</p></main>
<script>if(window.opener){window.opener.postMessage(${safePayload},${safeTarget});setTimeout(function(){window.close()},800)}</script></body></html>`;
  return new Response(html, {
    status: httpStatus,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (req.method === "GET") return await processCallback(new URL(req.url));
    if (req.method === "POST") {
      const body = await req.clone().json().catch(() => ({}));
      if (body.vendor_obligation_id && req.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
        return jsonResponse({ error: "Restricted vendor checkout requires server authorization" }, 401);
      }
      if (body.action === "request_provider_code") return requestProviderCode(body);
      if (body.action === "confirm_provider_code") return await confirmProviderCode(body);
      return await initiatePayment(req);
    }
    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("mobiwand-payment error", error);
    if (req.method === "GET") {
      const url = new URL(req.url);
      const attemptId = url.searchParams.get("attempt_id") || "";
      const channel = url.searchParams.get("channel") === "notify" ? "notify" : "return";
      const { data: attempt } = await supabase
        .from("mobiwand_payment_attempts")
        .select("*")
        .eq("attempt_id", attemptId)
        .maybeSingle();
      return callbackResponse(
        channel,
        attempt as MobiWandAttempt | null,
        "failed",
        error instanceof Error ? error.message : "Payment verification failed",
        500,
      );
    }
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unexpected MobiWand payment error",
    }, 500);
  }
});
