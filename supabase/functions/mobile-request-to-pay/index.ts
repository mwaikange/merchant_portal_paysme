import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class RequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeNamibianMobile(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^0(81|83|85)\d{7}$/.test(digits)) return `264${digits.slice(1)}`;
  if (/^264(81|83|85)\d{7}$/.test(digits)) return digits;
  return null;
}

function normalizeEmail(value?: string | null) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeTown(value?: string | null) {
  const town = String(value || "").trim().replace(/\s+/g, " ");
  return town && town.length <= 120 ? town : null;
}

function normalizeInvoiceId(value?: string | null) {
  const invoiceId = String(value || "").trim();
  return invoiceId && invoiceId.length <= 160 ? invoiceId : null;
}

function normalizeIdempotencyKey(value?: string | null) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(key) ? key : null;
}

function calculateTax(enteredAmount: number, mode: string, rateValue: unknown) {
  const rate = Math.max(0, Number(rateValue || 0));
  const entered = Math.round(enteredAmount * 100) / 100;
  if (mode === "vat_exclusive" && rate > 0) {
    const vat = Math.round(entered * rate) / 100;
    return { taxMode: mode, vatRate: rate, net: entered, vat, gross: Math.round((entered + vat) * 100) / 100 };
  }
  if (mode === "vat_inclusive" && rate > 0) {
    const net = Math.round((entered / (1 + rate / 100)) * 100) / 100;
    return { taxMode: mode, vatRate: rate, net, vat: Math.round((entered - net) * 100) / 100, gross: entered };
  }
  return { taxMode: "not_registered", vatRate: 0, net: entered, vat: 0, gross: entered };
}

function maskMobile(mobile: string) {
  return `+${mobile.slice(0, 5)}••••${mobile.slice(-4)}`;
}

function successfulResponse(
  request: Record<string, any>,
  mobile: string,
  options: { smsSent?: boolean; reused?: boolean; transactionStatus?: string; message?: string } = {},
) {
  return {
    ok: true,
    success: true,
    request_id: request.request_id,
    transaction_id: request.transaction_id,
    status: options.transactionStatus === "paid" ? "already_paid" : "payment_request_sent",
    transaction_status: options.transactionStatus || "pending",
    sms_sent: options.smsSent !== false,
    reused: options.reused === true,
    masked_mobile: maskMobile(mobile),
    message: options.message || "Request to Pay Sent. Check your SMS.",
  };
}

async function ensureMerchantClient(merchantId: string, email: string, mobile: string) {
  const { data, error } = await supabase.rpc("get_or_create_merchant_client", {
    p_merchant_id: merchantId,
    p_email: email,
    p_mobile: mobile,
  });
  if (error) throw error;
  return data as string | null;
}

async function sendPaycodeSms(transaction: Record<string, any>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      action: "send_paycode",
      payload: {
        mobile: transaction.user_mobile,
        generated_code: transaction.generated_code,
        amount: transaction.amount,
        business_name: transaction.business_name || "PaySME",
        invoice_id: transaction.invoice_id,
        subscription_type: null,
      },
    }),
  });

  const text = await response.text();
  let result: Record<string, unknown> = {};
  try {
    result = JSON.parse(text);
  } catch {
    // The status and raw response below are enough for a safe failure message.
  }

  if (!response.ok || result.ok !== true || result.suppressed === true) {
    throw new Error(`SMS delivery was not accepted (${response.status})`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables");

    const body = await req.json().catch(() => ({}));
    const merchantId = String(body.vendor_uuid || body.merchant_id || "").trim();
    const apiKey = String(body.api_key || "").trim();
    const enteredAmount = Math.round(Number(body.amount_nad ?? body.amount) * 100) / 100;
    const invoiceId = normalizeInvoiceId(body.invoice_id);
    const mobile = normalizeNamibianMobile(body.mobile);
    const email = normalizeEmail(body.email);
    const town = normalizeTown(body.town);
    const idempotencyKey = normalizeIdempotencyKey(
      req.headers.get("x-idempotency-key") || body.idempotency_key,
    );

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(merchantId) || !apiKey) {
      throw new RequestError(401, "Invalid merchant credentials");
    }
    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0 || enteredAmount > 1_000_000 || !invoiceId) {
      throw new RequestError(400, "A valid invoice_id and amount_nad are required");
    }
    if (!mobile) {
      throw new RequestError(400, "Use a Namibian mobile number beginning with 081, 083, 085, +26481, +26483, or +26485");
    }
    if (!email) throw new RequestError(400, "A valid customer email address is required");
    if (!town) throw new RequestError(400, "Customer town is required");
    if (!idempotencyKey) {
      throw new RequestError(400, "An idempotency_key of 8 to 160 safe characters is required");
    }

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("merchant_id, business_name, api_key, tax_settings_completed_at, tax_mode, vat_rate")
      .eq("merchant_id", merchantId)
      .eq("api_key", apiKey)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant) throw new RequestError(401, "Invalid merchant credentials");
    if (!merchant.tax_settings_completed_at) {
      throw new RequestError(409, "Save Tax Settings before generating a Request-to-Pay paycode");
    }
    const tax = calculateTax(enteredAmount, merchant.tax_mode, merchant.vat_rate);
    if (tax.gross > 1_000_000) {
      throw new RequestError(400, "The final amount including VAT cannot exceed N$1,000,000.00");
    }
    const amount = tax.gross;

    const [invoiceLookup, keyLookup] = await Promise.all([
      supabase
        .from("mobile_request_to_pay")
        .select("*")
        .eq("merchant_id", merchantId)
        .eq("invoice_id", invoiceId)
        .maybeSingle(),
      supabase
        .from("mobile_request_to_pay")
        .select("*")
        .eq("merchant_id", merchantId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle(),
    ]);
    if (invoiceLookup.error) throw invoiceLookup.error;
    if (keyLookup.error) throw keyLookup.error;
    if (invoiceLookup.data && keyLookup.data && invoiceLookup.data.request_id !== keyLookup.data.request_id) {
      throw new RequestError(409, "This idempotency_key is already assigned to a different invoice");
    }
    const existing = invoiceLookup.data || keyLookup.data;

    if (existing && (
      existing.invoice_id !== invoiceId ||
      Number(existing.amount) !== amount ||
      existing.customer_mobile !== mobile ||
      existing.customer_email !== email ||
      existing.customer_town !== town
    )) {
      throw new RequestError(409, "This idempotency_key is already assigned to different payment details");
    }
    if (existing && !["sms_failed", "transaction_created", "sms_sent"].includes(existing.status)) {
      throw new RequestError(409, "This payment request is already being processed");
    }

    let requestRecord = existing;
    let transaction: Record<string, any> | null = null;

    if (existing?.status === "sms_sent") {
      const { data: existingTransaction, error: transactionError } = await supabase
        .from("transactions")
        .select("*")
        .eq("transaction_id", existing.transaction_id)
        .maybeSingle();
      if (transactionError) throw transactionError;
      if (!existingTransaction) throw new RequestError(409, "The original payment request could not be found");
      if (existingTransaction.status === "paid") {
        return jsonResponse(successfulResponse(existing, existing.customer_mobile, {
          smsSent: false,
          reused: true,
          transactionStatus: "paid",
          message: "This invoice is already paid",
        }));
      }
      if (existingTransaction.status !== "pending") {
        throw new RequestError(409, "This payment request can no longer be resent");
      }

      const lastSmsAt = existing.sms_sent_at ? new Date(existing.sms_sent_at).getTime() : 0;
      if (lastSmsAt && Date.now() - lastSmsAt < 60_000) {
        return jsonResponse(successfulResponse(existing, existing.customer_mobile, {
          smsSent: false,
          reused: true,
          message: "Request to Pay Sent. Check your SMS.",
        }));
      }
      transaction = existingTransaction;
    }

    if (!requestRecord) {
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
      const [{ count: merchantCount, error: merchantRateError }, { count: mobileCount, error: mobileRateError }] = await Promise.all([
        supabase
          .from("mobile_request_to_pay")
          .select("request_id", { count: "exact", head: true })
          .eq("merchant_id", merchantId)
          .gte("created_at", oneMinuteAgo),
        supabase
          .from("mobile_request_to_pay")
          .select("request_id", { count: "exact", head: true })
          .eq("merchant_id", merchantId)
          .eq("customer_mobile", mobile)
          .gte("created_at", tenMinutesAgo),
      ]);
      if (merchantRateError) throw merchantRateError;
      if (mobileRateError) throw mobileRateError;
      if ((merchantCount || 0) >= 120 || (mobileCount || 0) >= 5) {
        throw new RequestError(429, "Too many payment requests. Please wait before trying again");
      }

      const { data: createdRequest, error: requestError } = await supabase
        .from("mobile_request_to_pay")
        .insert({
          merchant_id: merchantId,
          idempotency_key: idempotencyKey,
          invoice_id: invoiceId,
          amount,
          customer_mobile: mobile,
          customer_email: email,
          customer_town: town,
        })
        .select("*")
        .single();

      if (requestError) {
        if (requestError.code === "23505") {
          throw new RequestError(409, "This payment request is already being processed");
        }
        throw requestError;
      }
      requestRecord = createdRequest;

      try {
        const merchantClientId = await ensureMerchantClient(merchantId, email, mobile);
        const { data: createdTransaction, error: transactionError } = await supabase
          .from("transactions")
          .insert({
            merchant_id: merchantId,
            merchant_client_id: merchantClientId,
            amount,
            tax_mode: tax.taxMode,
            vat_rate: tax.vatRate,
            net_amount: tax.net,
            vat_amount: tax.vat,
            gross_amount: tax.gross,
            type: "api",
            payment_method: "paysme_code",
            payment_purpose: "standard",
            invoice_id: invoiceId,
            payer_town: town,
            user_email: email,
            user_mobile: mobile,
            business_name: merchant.business_name || "PaySME",
          })
          .select("*")
          .single();
        if (transactionError) throw transactionError;
        transaction = createdTransaction;

        const { data: updatedRequest, error: updateError } = await supabase
          .from("mobile_request_to_pay")
          .update({
            transaction_id: transaction.transaction_id,
            status: "transaction_created",
            updated_at: new Date().toISOString(),
          })
          .eq("request_id", requestRecord.request_id)
          .select("*")
          .single();
        if (updateError) throw updateError;
        requestRecord = updatedRequest;
      } catch (error) {
        await supabase
          .from("mobile_request_to_pay")
          .update({
            status: "failed",
            last_error: String(error instanceof Error ? error.message : error).slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("request_id", requestRecord.request_id);
        throw error;
      }
    } else if (!transaction) {
      const { data: existingTransaction, error: transactionError } = await supabase
        .from("transactions")
        .select("*")
        .eq("transaction_id", requestRecord.transaction_id)
        .maybeSingle();
      if (transactionError) throw transactionError;
      if (!existingTransaction || existingTransaction.status !== "pending") {
        throw new RequestError(409, "This payment request can no longer be resent");
      }
      transaction = existingTransaction;
    }

    try {
      await sendPaycodeSms(transaction!);
      const { data: completedRequest, error: completionError } = await supabase
        .from("mobile_request_to_pay")
        .update({
          status: "sms_sent",
          sms_sent_at: new Date().toISOString(),
          last_error: null,
          attempt_count: requestRecord.attempt_count + (existing ? 1 : 0),
          updated_at: new Date().toISOString(),
        })
        .eq("request_id", requestRecord.request_id)
        .select("*")
        .single();
      if (completionError) throw completionError;
      return jsonResponse(successfulResponse(completedRequest, mobile, { reused: Boolean(existing) }));
    } catch (error) {
      await supabase
        .from("mobile_request_to_pay")
        .update({
          status: "sms_failed",
          last_error: String(error instanceof Error ? error.message : error).slice(0, 500),
          attempt_count: requestRecord.attempt_count + (existing ? 1 : 0),
          updated_at: new Date().toISOString(),
        })
        .eq("request_id", requestRecord.request_id);
      throw new RequestError(502, "The payment was created, but the SMS could not be sent. Retry with the same idempotency_key");
    }
  } catch (error) {
    console.error("mobile-request-to-pay error:", error);
    const status = error instanceof RequestError ? error.status : 500;
    const message = error instanceof RequestError ? error.message : "Unable to send the payment request";
    return jsonResponse({ ok: false, success: false, error: message }, status);
  }
});
