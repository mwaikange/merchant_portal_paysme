import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SMSPORTAL_API_URL = "https://rest.smsportal.com/v3/BulkMessages";
const SMSPORTAL_BALANCE_URL = "https://rest.smsportal.com/v3/Balance";
const PUBLIC_SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://www.paysme.site").replace(/\/$/, "");
const SMS_CHARS_PER_CREDIT = 60;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Send SMS via SMSPortal API v3
 * Supports single and bulk SMS sending
 * 
 * Actions:
 *  - send_single: Send one SMS to a single recipient
 *  - send_bulk: Send SMS to multiple recipients (up to 500)
 *  - send_paycode: Send paycode notification SMS
 */

async function getSmsPortalAuthHeader(clientId?: string | null, apiSecret?: string | null): Promise<string> {
  const resolvedClientId = clientId || Deno.env.get("SMSPORTAL_CLIENT_ID");
  const resolvedApiSecret = apiSecret || Deno.env.get("SMSPORTAL_API_SECRET");

  if (!resolvedClientId || !resolvedApiSecret) {
    throw new Error("SMSPortal credentials not configured");
  }

  // SMSPortal uses Basic Auth with base64(ClientID:APISecret)
  const credentials = btoa(`${resolvedClientId}:${resolvedApiSecret}`);
  return `Basic ${credentials}`;
}

interface SmsMessage {
  content: string;
  destination: string;
  scheduled_at?: string | null;
}

function smsCreditCost(content?: string | null): number {
  return Math.max(1, Math.ceil(String(content || "").length / SMS_CHARS_PER_CREDIT));
}

function smsCreditCostForMessages(messages: SmsMessage[]): number {
  return messages.reduce((total, message) => total + smsCreditCost(message.content), 0);
}

function isFutureScheduledMessage(message: SmsMessage): boolean {
  if (!message.scheduled_at) return false;
  const scheduledTime = new Date(message.scheduled_at).getTime();
  if (Number.isNaN(scheduledTime)) return false;
  return scheduledTime > Date.now() + 60_000;
}

function normalizeNamibianMobile(mobile?: string | null): string {
  const cleanMobile = String(mobile || "").replace(/[^\d]/g, "");
  if (/^0(81|83|85)\d{7}$/.test(cleanMobile)) {
    return `264${cleanMobile.slice(1)}`;
  }
  if (/^264(81|83|85)\d{7}$/.test(cleanMobile)) {
    return cleanMobile;
  }
  return cleanMobile;
}

async function isSmsSuppressedTransaction(generatedCode?: string | null): Promise<boolean> {
  if (!generatedCode) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return false;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("transactions")
    .select("sms_notifications_enabled, payment_purpose, type")
    .eq("generated_code", generatedCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.sms_notifications_enabled === false ||
    ["vendor_token_topup", "vendor_advance_installment"].includes(data?.payment_purpose || data?.type || "");
}

async function getMerchantSmsCredentials(merchantId?: string | null): Promise<{ clientId: string | null; apiSecret: string | null }> {
  if (!merchantId) return { clientId: null, apiSecret: null };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role credentials not configured");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("merchants")
    .select("sms_client_id, sms_key")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load merchant SMS credentials: ${error.message}`);
  }

  if (!data?.sms_client_id || !data?.sms_key) {
    throw new Error("Merchant SMS credentials not configured");
  }

  return { clientId: data.sms_client_id, apiSecret: data.sms_key };
}

function planKey(planType?: string | null): string {
  const value = String(planType || "");
  if (value.startsWith("annual_partner")) return "annual_partner";
  if (value.startsWith("scale")) return "scale";
  if (value.startsWith("growth")) return "growth";
  if (value.startsWith("starter")) return "starter";
  return value.replace(/_(3|6|9|12)_months$/, "");
}

async function requireMerchantSmsAccess(
  req: Request,
  merchantId?: string | null,
): Promise<{ clientId: string | null; apiSecret: string | null }> {
  if (!merchantId) throw new Error("Merchant SMS account is required");

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const serviceCaller = Boolean(SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceCaller) {
    if (!token || !SUPABASE_ANON_KEY) throw new Error("Merchant authentication is required");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await authClient.auth.getUser(token);
    if (error || data.user?.id !== merchantId) throw new Error("Merchant authentication is required");
  }

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("plan_type, end_date")
    .eq("user_id", merchantId)
    .eq("status", "active")
    .eq("paycode_status", "paid")
    .order("created_at", { ascending: false });
  if (subscriptionError) throw subscriptionError;
  const activeSubscription = (subscriptions || []).find((row) => row.end_date && new Date(row.end_date) > new Date());
  if (!activeSubscription) throw new Error("An active Scale or higher package is required");

  const { data: rule, error: ruleError } = await admin
    .from("subscription_plan_rules")
    .select("bulk_invoice_enabled, bulk_paycode_enabled")
    .eq("plan_key", planKey(activeSubscription.plan_type))
    .eq("is_active", true)
    .maybeSingle();
  if (ruleError) throw ruleError;
  if (!rule || (!rule.bulk_invoice_enabled && !rule.bulk_paycode_enabled)) {
    throw new Error("A Scale or higher package is required for bulk SMS and Request-to-Pay");
  }

  return await getMerchantSmsCredentials(merchantId);
}

async function sendViaSmsPortal(
  messages: SmsMessage[],
  credentials?: { clientId?: string | null; apiSecret?: string | null }
): Promise<{ raw: any; acceptedCount: number; creditCount: number; eventId: string | null }> {
  const authHeader = await getSmsPortalAuthHeader(credentials?.clientId, credentials?.apiSecret);

  // SMSPortal expects { messages: [...] } at top level
  const payload = {
    messages: messages.map(msg => ({
      content: msg.content,
      destination: normalizeNamibianMobile(msg.destination),
    })),
  };

  console.log(`Sending ${messages.length} SMS via SMSPortal`);

  const response = await fetch(SMSPORTAL_API_URL, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  console.log(`SMSPortal response status: ${response.status}`);
  console.log(`SMSPortal response: ${responseText}`);

  if (!response.ok) {
    throw new Error(`SMSPortal API error (${response.status}): ${responseText}`);
  }

  let raw: any = responseText;
  try {
    raw = JSON.parse(responseText);
  } catch {
    // Keep raw text for diagnostics.
  }

  const acceptedCount = extractSmsPortalAcceptedCount(raw, messages.length);
  if (messages.length > 0 && acceptedCount <= 0) {
    throw new Error(`SMSPortal did not confirm message acceptance: ${responseText || "empty response"}`);
  }

  return {
    raw,
    acceptedCount,
    creditCount: extractSmsPortalCreditCount(raw, smsCreditCostForMessages(messages)),
    eventId: extractSmsPortalEventId(raw),
  };
}

function extractSmsPortalCreditCount(payload: any, fallback: number): number {
  if (payload == null) return fallback;
  if (typeof payload === "string") return fallback;
  if (Array.isArray(payload)) {
    const total = payload.reduce((sum, item) => sum + extractSmsPortalCreditCount(item, 0), 0);
    return total > 0 ? total : fallback;
  }
  if (typeof payload === "object") {
    if (payload.sendResponse) return extractSmsPortalCreditCount(payload.sendResponse, fallback);
    for (const key of ["parts", "creditCount", "credits", "cost", "totalCost"]) {
      const value = Number(payload[key]);
      if (Number.isFinite(value) && value > 0) return Math.ceil(value);
    }
    if (Array.isArray(payload.costBreakdown)) {
      const total = payload.costBreakdown.reduce((sum: number, item: any) => {
        const value = Number(item?.cost || item?.parts || item?.credits || 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      if (total > 0) return Math.ceil(total);
    }
  }
  return fallback;
}

function extractSmsPortalEventId(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  if (payload.sendResponse) {
    const value = extractSmsPortalEventId(payload.sendResponse);
    if (value) return value;
  }
  for (const key of ["eventId", "EventId", "eventID", "EventID", "id", "Id"]) {
    if (payload[key]) return String(payload[key]);
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = extractSmsPortalEventId(item);
      if (value) return value;
    }
  }
  return null;
}

function extractSmsPortalAcceptedCount(payload: any, requestedCount: number): number {
  if (payload == null) return 0;
  if (typeof payload === "string") {
    return payload.trim() ? requestedCount : 0;
  }
  if (Array.isArray(payload)) {
    return payload.reduce((sum, item) => sum + extractSmsPortalAcceptedCount(item, 1), 0);
  }
  if (typeof payload === "object") {
    if (payload.statusCode && Number(payload.statusCode) >= 400) return 0;
    if (payload.errors) return 0;
    if (payload.sendResponse) {
      return extractSmsPortalAcceptedCount(payload.sendResponse, requestedCount);
    }

    for (const key of ["sent", "sentCount", "messageCount", "messagesSent", "messages", "accepted", "acceptedCount"]) {
      if (payload[key] !== undefined && payload[key] !== null) {
        const value = Number(payload[key]);
        if (Number.isFinite(value) && value > 0) return value;
      }
    }

    if (payload.errorReport?.faults && Array.isArray(payload.errorReport.faults) && payload.errorReport.faults.length > 0) {
      return 0;
    }
    if (extractSmsPortalEventId(payload)) return requestedCount;
    if (payload.messages && Array.isArray(payload.messages)) {
      return payload.messages.length;
    }
  }
  return 0;
}

function extractBalanceValue(payload: any): number | null {
  if (payload == null) return null;
  if (typeof payload === "number") return payload;
  if (typeof payload === "string") {
    const parsed = Number(payload);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = extractBalanceValue(item);
      if (value !== null) return value;
    }
    return null;
  }
  if (typeof payload === "object") {
    for (const key of ["balance", "credits", "available", "availableCredits", "smsCredits", "remaining"]) {
      if (key in payload) {
        const value = extractBalanceValue(payload[key]);
        if (value !== null) return value;
      }
    }
  }
  return null;
}

async function getSmsPortalBalance(
  credentials?: { clientId?: string | null; apiSecret?: string | null }
): Promise<{ balance: number | null; raw: any }> {
  const authHeader = await getSmsPortalAuthHeader(credentials?.clientId, credentials?.apiSecret);

  const response = await fetch(SMSPORTAL_BALANCE_URL, {
    method: "GET",
    headers: {
      "Authorization": authHeader,
      "Accept": "application/json",
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`SMSPortal balance error (${response.status}): ${responseText}`);
  }

  let raw: any = responseText;
  try {
    raw = JSON.parse(responseText);
  } catch {
    // Keep raw text for diagnostics.
  }

  return { balance: extractBalanceValue(raw), raw };
}

async function getReservedSmsCount(merchantId?: string | null): Promise<number> {
  if (!merchantId) return 0;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return 0;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("bulk_subscribers")
    .select("sms_parts_reserved")
    .eq("merchant_id", merchantId)
    .eq("sms_status", "scheduled")
    .gt("scheduled_send_at", new Date().toISOString());

  if (error) {
    console.error("Unable to calculate reserved SMS parts, falling back to row count:", error);
    const { count, error: fallbackError } = await supabase
      .from("bulk_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("sms_status", "scheduled")
      .gt("scheduled_send_at", new Date().toISOString());
    if (fallbackError) return 0;
    return count || 0;
  }

  return (data || []).reduce((total: number, row: any) => total + Math.max(1, Number(row.sms_parts_reserved || 1)), 0);
}

async function getEffectiveSmsBalance(
  merchantId?: string | null,
  credentials?: { clientId?: string | null; apiSecret?: string | null }
): Promise<{ balance: number | null; reserved: number; available: number | null; raw: any }> {
  const [balanceResult, reserved] = await Promise.all([
    getSmsPortalBalance(credentials),
    getReservedSmsCount(merchantId),
  ]);

  const available = balanceResult.balance === null
    ? null
    : Math.max(0, Math.floor(balanceResult.balance) - reserved);

  return {
    balance: balanceResult.balance,
    reserved,
    available,
    raw: balanceResult.raw,
  };
}

function formatCodeLink(generatedCode: string): string {
  return `${PUBLIC_SITE_URL}/c/${encodeURIComponent(generatedCode)}`;
}

function formatPaycodeSms(
  generatedCode: string,
  amount: number,
  businessName: string,
  invoiceId?: string,
  subscriptionType?: string
): string {
  const parts = [
    `PaySME Code: ${generatedCode}`,
    `Amount: N$ ${Number(amount).toFixed(2)}`,
    `Merchant: ${businessName || 'PaySME'}`,
  ];
  if (invoiceId) {
    parts.push(`Ref: ${invoiceId}`);
  }
  parts.push(`Subscription: ${subscriptionType || 'Once-Off'}`);
  parts.push(`Payment link: ${formatCodeLink(generatedCode)}`);
  parts.push("");
  parts.push("Use the link or present this code at any PaySME vendor to complete payment.");
  return parts.join("\n");
}

function formatSubscriptionSms(
  generatedCode: string,
  amount: number,
  planType: string
): string {
  return [
    `PaySME Subscription Code: ${generatedCode}`,
    `Plan: ${planType}`,
    `Amount: N$ ${Number(amount).toFixed(2)}`,
    `Payment link: ${formatCodeLink(generatedCode)}`,
    "Present this code at any PaySME vendor to activate your subscription.",
  ].join("\n");
}

function formatSmsTopupSms(
  generatedCode: string,
  amount: number,
  tokensPurchased: number
): string {
  return [
    `PaySME SMS Top-up Code: ${generatedCode}`,
    `Tokens: ${tokensPurchased}`,
    `Amount: N$ ${Number(amount).toFixed(2)}`,
    `Payment link: ${formatCodeLink(generatedCode)}`,
    "Present this code at any PaySME vendor to add SMS credits.",
  ].join("\n");
}

function formatPaymentConfirmationSms(
  generatedCode: string,
  amount: number,
  businessName: string
): string {
  return [
    `Payment Confirmed!`,
    `Code: ${generatedCode}`,
    `Amount: N$ ${Number(amount).toFixed(2)}`,
    `Merchant: ${businessName || 'PaySME'}`,
    "Thank you for your payment via PaySME.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json();

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload?.generated_code && await isSmsSuppressedTransaction(payload.generated_code)) {
      console.log(`SMS suppressed by transaction policy for action ${action}`);
      return new Response(JSON.stringify({ ok: true, suppressed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_balance") {
      const { merchant_id } = payload || {};
      const credentials = await requireMerchantSmsAccess(req, merchant_id);
      const result = await getEffectiveSmsBalance(merchant_id, credentials);

      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── send_paycode: Send paycode SMS to customer ───
    if (action === "send_paycode") {
      const { mobile, generated_code, amount, business_name, invoice_id, subscription_type } = payload;

      if (!mobile || !generated_code) {
        return new Response(JSON.stringify({ error: "Missing mobile or generated_code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const content = formatPaycodeSms(generated_code, amount, business_name, invoice_id, subscription_type);
      const result = await sendViaSmsPortal([{ content, destination: mobile }]);

      return new Response(JSON.stringify({ ok: true, smsportal_response: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── send_subscription: Send subscription code SMS ───
    if (action === "send_subscription") {
      const { mobile, generated_code, amount, plan_type } = payload;

      if (!mobile || !generated_code) {
        return new Response(JSON.stringify({ error: "Missing mobile or generated_code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const content = formatSubscriptionSms(generated_code, amount, plan_type);
      const result = await sendViaSmsPortal([{ content, destination: mobile }]);

      return new Response(JSON.stringify({ ok: true, smsportal_response: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── send_sms_topup: Send SMS topup code ───
    if (action === "send_sms_topup") {
      const { mobile, generated_code, amount, tokens_purchased } = payload;

      if (!mobile || !generated_code) {
        return new Response(JSON.stringify({ error: "Missing mobile or generated_code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const content = formatSmsTopupSms(generated_code, amount, tokens_purchased);
      const result = await sendViaSmsPortal([{ content, destination: mobile }]);

      return new Response(JSON.stringify({ ok: true, smsportal_response: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── send_payment_confirmation: Notify customer of successful payment ───
    if (action === "send_payment_confirmation") {
      const { mobile, generated_code, amount, business_name } = payload;

      if (!mobile || !generated_code) {
        return new Response(JSON.stringify({ error: "Missing mobile or generated_code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const content = formatPaymentConfirmationSms(generated_code, amount, business_name);
      const result = await sendViaSmsPortal([{ content, destination: mobile }]);

      return new Response(JSON.stringify({ ok: true, smsportal_response: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── send_bulk: Send SMS to multiple recipients ───
    if (action === "send_bulk") {
      const { messages, merchant_id } = payload;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: "Missing or empty messages array" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (messages.length > 500) {
        return new Response(JSON.stringify({ error: "Maximum 500 messages per batch" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const credentials = await requireMerchantSmsAccess(req, merchant_id);

      const immediateMessages = messages.filter((message: SmsMessage) => !isFutureScheduledMessage(message));
      const scheduledMessages = messages.filter((message: SmsMessage) => isFutureScheduledMessage(message));
      const immediateSmsCredits = smsCreditCostForMessages(immediateMessages);

      const balance = await getEffectiveSmsBalance(merchant_id, credentials);
      if (balance.available !== null && immediateSmsCredits > balance.available) {
        return new Response(JSON.stringify({
          error: "Insufficient available SMS credits",
          balance: balance.balance,
          reserved: balance.reserved,
          available: balance.available,
          required: immediateSmsCredits,
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = immediateMessages.length > 0
        ? await sendViaSmsPortal(immediateMessages, credentials)
        : { scheduled_only: true, acceptedCount: 0, creditCount: 0 };

      return new Response(JSON.stringify({
        ok: true,
        smsportal_response: result,
        sent_count: immediateMessages.length > 0 ? result.acceptedCount : 0,
        sent_credits: immediateMessages.length > 0 ? result.creditCount : 0,
        scheduled_count: scheduledMessages.length,
        scheduled_reserved_credits: smsCreditCostForMessages(scheduledMessages),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── send_single: Send a single custom SMS ───
    if (action === "send_single") {
      const { mobile, content, merchant_id, use_merchant_credentials = false } = payload;

      if (!mobile || !content) {
        return new Response(JSON.stringify({ error: "Missing mobile or content" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const credentials = use_merchant_credentials
        ? await requireMerchantSmsAccess(req, merchant_id)
        : undefined;
      const result = await sendViaSmsPortal([{ content, destination: mobile }], credentials);

      return new Response(JSON.stringify({ ok: true, smsportal_response: result, sent_credits: result.creditCount || 1 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-sms error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
