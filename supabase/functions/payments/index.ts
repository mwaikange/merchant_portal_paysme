import { createClient } from "npm:@supabase/supabase-js@2.39.3";

// Ensure environment variables are available
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Helper: fire-and-forget SMS via send-sms edge function
async function sendSmsNotification(action: string, payload: Record<string, unknown>) {
  try {
    const smsUrl = `${supabaseUrl}/functions/v1/send-sms`;
    const res = await fetch(smsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({ action, payload }),
    });
    const result = await res.text();
    console.log(`SMS (${action}) status: ${res.status}, response: ${result}`);
  } catch (err) {
    console.error(`SMS (${action}) failed:`, err);
    // Don't throw — SMS failure should not block the transaction
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function calculateTax(enteredAmount: number, mode: string, rateValue: unknown) {
  const rate = Math.max(0, Number(rateValue || 0));
  const roundedEntered = Math.round(enteredAmount * 100) / 100;
  if (mode === "vat_exclusive" && rate > 0) {
    const vat = Math.round(roundedEntered * rate) / 100;
    return { taxMode: mode, vatRate: rate, net: roundedEntered, vat, gross: Math.round((roundedEntered + vat) * 100) / 100 };
  }
  if (mode === "vat_inclusive" && rate > 0) {
    const net = Math.round((roundedEntered / (1 + rate / 100)) * 100) / 100;
    return { taxMode: mode, vatRate: rate, net, vat: Math.round((roundedEntered - net) * 100) / 100, gross: roundedEntered };
  }
  return { taxMode: "not_registered", vatRate: 0, net: roundedEntered, vat: 0, gross: roundedEntered };
}

async function getPaysmeTaxSettings() {
  const PAYSME_MERCHANT_ID = "00000000-1986-0026-0000-000000000001";
  const { data, error } = await supabase
    .from("merchants")
    .select("tax_mode, vat_rate, tax_settings_completed_at")
    .eq("merchant_id", PAYSME_MERCHANT_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data?.tax_settings_completed_at) {
    throw new Error("PaySME Tax Settings must be saved before generating service paycodes");
  }
  return data;
}

function normalizeNamibianMobile(mobile?: string | null) {
  const cleanMobile = String(mobile || "").replace(/\D/g, "");
  if (/^0(81|83|85)\d{7}$/.test(cleanMobile)) {
    return `264${cleanMobile.slice(1)}`;
  }
  if (/^264(81|83|85)\d{7}$/.test(cleanMobile)) {
    return cleanMobile;
  }
  return null;
}

function subscriptionPlanKey(planType?: string | null): string {
  const value = String(planType || "").toLowerCase();
  if (value.startsWith("annual_partner")) return "annual_partner";
  if (value.startsWith("scale")) return "scale";
  if (value.startsWith("growth")) return "growth";
  if (value.startsWith("starter")) return "starter";
  return value.replace(/_(3|6|9|12)_months$/, "");
}

Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { action, payload } = await req.json();
    
    if (!action) {
      return new Response(JSON.stringify({
        error: "Missing action"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Helper: authenticate user from Authorization header
    async function authenticateUser(req: Request) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        throw new Error('Unauthorized: missing auth header');
      }
      const token = authHeader.replace('Bearer ', '');

      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const userClient = createClient(supabaseUrl!, anonKey!, {
        global: {
          headers: { Authorization: `Bearer ${token}` }
        }
      });

      // This function is pinned to supabase-js 2.39.3. getClaims() was added
      // later, so use getUser(token) to validate the JWT with Supabase Auth.
      const { data, error: authError } = await userClient.auth.getUser(token);
      if (authError || !data?.user) {
        throw new Error('Unauthorized: invalid token');
      }
      return { id: data.user.id, email: data.user.email || '' };
    }

    // helper: ensure merchant_client exists using DB function (prevents duplicate key errors)
    async function ensureMerchantClient(merchant_id: string, email: string | null, mobile: string | null) {
      if (!email && !mobile) return null;
      const normalizedMobile = normalizeNamibianMobile(mobile);
      
      const { data, error } = await supabase.rpc('get_or_create_merchant_client', {
        p_merchant_id: merchant_id,
        p_email: email || '',
        p_mobile: normalizedMobile || ''
      });
      
      if (error) throw error;
      return { merchant_client_id: data };
    }

    // Reopen an existing pending or failed PaySME subscription/SMS transaction
    // without issuing a second PaySME code. The authenticated merchant may only
    // load records that belong to their own account.
    if (action === "prepare_pending_checkout") {
      const user = await authenticateUser(req);
      const userId = String(payload?.user_id || "");
      const recordId = String(payload?.record_id || "");
      const recordType = String(payload?.record_type || "");
      const PAYSME_MERCHANT_ID = "00000000-1986-0026-0000-000000000001";

      if (user.id !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden: merchant mismatch" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!recordId || !["subscription", "sms"].includes(recordType)) {
        return new Response(JSON.stringify({ error: "Invalid pending payment record" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let record: Record<string, any> | null = null;
      if (recordType === "subscription") {
        const result = await supabase
          .from("subscriptions")
          .select("id, user_id, amount, duration_months, plan_type, recurring, generated_code, paycode_status, status")
          .eq("id", recordId)
          .eq("user_id", userId)
          .maybeSingle();
        if (result.error) throw result.error;
        record = result.data;
      } else {
        const result = await supabase
          .from("sms_transactions")
          .select("id, user_id, tokens_purchased, generated_code, paycode_status, transaction_id")
          .eq("id", recordId)
          .eq("user_id", userId)
          .maybeSingle();
        if (result.error) throw result.error;
        record = result.data;
      }

      const recordPaycodeStatus = String(record?.paycode_status || "").toLowerCase();
      const recordIsRecoverable = ["", "pending", "failed"].includes(recordPaycodeStatus);
      const recordIsCancelled = recordType === "subscription" && String(record?.status || "").toLowerCase() === "cancelled";
      if (
        !record
        || !record.generated_code
        || recordIsCancelled
        || !recordIsRecoverable
      ) {
        return new Response(JSON.stringify({ error: "This PaySME code is no longer available for payment" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: transaction, error: transactionError } = await supabase
        .from("transactions")
        .select("transaction_id, merchant_id, amount, type, invoice_id, generated_code, status, user_email, user_mobile, payer_town")
        .eq("merchant_id", PAYSME_MERCHANT_ID)
        .eq("generated_code", record.generated_code)
        .maybeSingle();
      if (transactionError) throw transactionError;

      const expectedAmount = recordType === "subscription"
        ? Number(record.amount)
        : Number(record.tokens_purchased);
      if (
        !transaction
        || transaction.type !== recordType
        || !["pending", "failed"].includes(String(transaction.status || "").toLowerCase())
        || Math.abs(Number(transaction.amount) - expectedAmount) >= 0.005
      ) {
        return new Response(JSON.stringify({ error: "This transaction cannot be paid again" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (String(transaction.status || "").toLowerCase() === "failed") {
        const { data: reopenedTransaction, error: reopenError } = await supabase
          .from("transactions")
          .update({
            status: "pending",
            date_paid: null,
            amount_paid: null,
            payment_provider_signature: null,
            payment_provider_id: null,
            facilitator_id: null,
            facilitator_merchant_code: null,
            payment_method: null,
            updated_at: new Date().toISOString(),
          })
          .eq("transaction_id", transaction.transaction_id)
          .eq("status", "failed")
          .select("transaction_id, status")
          .maybeSingle();

        if (reopenError) throw reopenError;
        if (!reopenedTransaction) {
          return new Response(JSON.stringify({ error: "This failed payment has already been reopened or completed" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        transaction.status = reopenedTransaction.status;
      }

      if (recordPaycodeStatus !== "pending") {
        const recordTable = recordType === "subscription" ? "subscriptions" : "sms_transactions";
        let reopenRecordQuery = supabase
          .from(recordTable)
          .update({ paycode_status: "pending" })
          .eq("id", recordId)
          .eq("user_id", userId);

        reopenRecordQuery = record.paycode_status == null
          ? reopenRecordQuery.is("paycode_status", null)
          : reopenRecordQuery.eq("paycode_status", record.paycode_status);

        const { data: reopenedRecord, error: recordUpdateError } = await reopenRecordQuery
          .select("id")
          .maybeSingle();

        if (recordUpdateError) throw recordUpdateError;
        if (!reopenedRecord) {
          return new Response(JSON.stringify({ error: "This payment record is no longer recoverable" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        record.paycode_status = "pending";
      }

      const [{ data: merchant, error: merchantError }, { data: kyc, error: kycError }] = await Promise.all([
        supabase
          .from("merchants")
          .select("business_name, email, mobile_number")
          .eq("merchant_id", userId)
          .maybeSingle(),
        supabase
          .from("kyc_submissions")
          .select("town, email, mobile_number")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (merchantError) throw merchantError;
      if (kycError) throw kycError;

      const productReference = recordType === "subscription"
        ? `PaySME ${String(record.plan_type || "subscription").replace(/_/g, " ")}`
        : `PaySME ${Number(record.tokens_purchased)} SMS credits`;

      return new Response(JSON.stringify({
        ok: true,
        checkout: {
          record_id: recordId,
          record_type: recordType,
          merchant_id: PAYSME_MERCHANT_ID,
          transaction_id: transaction.transaction_id,
          invoice_id: transaction.invoice_id,
          generated_code: transaction.generated_code,
          amount: Number(transaction.amount).toFixed(2),
          product_reference: productReference,
          recurring: recordType === "subscription" ? Boolean(record.recurring) : false,
          recurring_period: recordType === "subscription" ? `${Number(record.duration_months)} months` : null,
          contact: {
            town: kyc?.town || transaction.payer_town || "",
            email: kyc?.email || merchant?.email || transaction.user_email || "",
            mobile: kyc?.mobile_number || merchant?.mobile_number || transaction.user_mobile || "",
          },
          tax_mode: transaction.tax_mode || "not_registered",
          vat_rate: Number(transaction.vat_rate || 0),
          net_amount: Number(transaction.net_amount || transaction.amount),
          vat_amount: Number(transaction.vat_amount || 0),
          gross_amount: Number(transaction.gross_amount || transaction.amount),
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transaction-specific QR Basket checkout. Merchant, amount, item pricing,
    // and invoice reference are resolved atomically from the locked basket.
    if (action === "create_basket_transaction") {
      const {
        basket_slug,
        payer_name,
        town,
        email,
        mobile,
        idempotency_key,
      } = payload || {};
      const slug = String(basket_slug || "").trim();
      const name = String(payer_name || "").trim().replace(/\s+/g, " ").slice(0, 120);
      const normalizedTown = String(town || "").trim().replace(/\s+/g, " ").slice(0, 120);
      const normalizedEmail = String(email || "").trim().toLowerCase().slice(0, 254);
      const normalizedMobile = normalizeNamibianMobile(mobile);
      const idempotencyKey = String(idempotency_key || "").trim();

      if (!/^[a-f0-9]{48}$/.test(slug)) {
        return new Response(JSON.stringify({ error: "Basket was not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (name.length < 2) {
        return new Response(JSON.stringify({ error: "Enter the customer name" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!normalizedTown) {
        return new Response(JSON.stringify({ error: "Town is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return new Response(JSON.stringify({ error: "Enter a valid email address" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!normalizedMobile) {
        return new Response(JSON.stringify({
          error: "Enter a valid Namibian mobile number starting with 081, 083, or 085",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
        return new Response(JSON.stringify({ error: "A valid checkout request ID is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const basketLookup = await supabase
        .from("merchant_qr_baskets")
        .select("basket_id, merchant_id, total_amount, merchants!inner(tax_mode, vat_rate, tax_settings_completed_at)")
        .eq("slug", slug)
        .maybeSingle();
      if (basketLookup.error) throw basketLookup.error;
      if (!basketLookup.data) {
        return new Response(JSON.stringify({ error: "Basket was not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const basketMerchant = Array.isArray(basketLookup.data.merchants) ? basketLookup.data.merchants[0] : basketLookup.data.merchants;
      if (!basketMerchant?.tax_settings_completed_at) {
        return new Response(JSON.stringify({ error: "The merchant must save Tax Settings before generating paycodes" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const refresh = await supabase.rpc("refresh_merchant_qr_basket", {
        p_basket_id: basketLookup.data.basket_id,
      });
      if (refresh.error) throw refresh.error;

      const result = await supabase.rpc("create_qr_basket_transaction", {
        p_slug: slug,
        p_payer_name: name,
        p_town: normalizedTown,
        p_email: normalizedEmail,
        p_mobile: normalizedMobile,
        p_idempotency_key: idempotencyKey,
      });
      if (result.error) {
        const conflict = /already started|expired|paid|failed|cancelled/i.test(result.error.message);
        return new Response(JSON.stringify({ error: result.error.message }), {
          status: conflict ? 409 : 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const basketTax = calculateTax(Number(basketLookup.data.total_amount), basketMerchant?.tax_mode, basketMerchant?.vat_rate);
      const taxUpdate = await supabase.from("transactions").update({
        amount: basketTax.gross,
        tax_mode: basketTax.taxMode,
        vat_rate: basketTax.vatRate,
        net_amount: basketTax.net,
        vat_amount: basketTax.vat,
        gross_amount: basketTax.gross,
      }).eq("transaction_id", result.data);
      if (taxUpdate.error) throw taxUpdate.error;

      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .select("*")
        .eq("transaction_id", result.data)
        .single();
      if (txError) throw txError;

      if (normalizedMobile && tx.generated_code) {
        sendSmsNotification("send_paycode", {
          mobile: normalizedMobile,
          generated_code: tx.generated_code,
          amount: tx.amount,
          business_name: tx.business_name || "PaySME",
          invoice_id: tx.invoice_id,
          subscription_type: null,
        });
      }

      return new Response(JSON.stringify({ ok: true, transaction: tx }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🚀 1. CREATE TRANSACTION
    if (action === "create_transaction") {
      const {
        merchant_id: requestedMerchantId,
        amount: requestedAmount,
        type,
        invoice_id: requestedInvoiceId,
        town,
        email,
        mobile,
        subscription_type,
        qr_link_slug,
        qr_quantity,
      } = payload;
      const normalizedMobile = normalizeNamibianMobile(mobile);
      const normalizedTown = String(town || "").trim().replace(/\s+/g, " ").slice(0, 120);
      if (mobile && !normalizedMobile) {
        return new Response(JSON.stringify({
          error: "Invalid Namibian mobile number. Use 081, 083, 085 or +26481, +26483, +26485 followed by 7 digits."
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      let merchant_id = requestedMerchantId;
      let amount = Number(requestedAmount);
      let invoice_id = requestedInvoiceId;
      let qrPaymentLinkId: string | null = null;
      let qrUnitAmount: number | null = null;
      let qrQuantity: number | null = null;

      // QR-hosted payments are server-owned. Browser-supplied merchant,
      // amount and product values are ignored when a QR slug is present.
      if (qr_link_slug) {
        const slug = String(qr_link_slug).trim();
        if (!/^[a-f0-9]{36}$/.test(slug)) {
          return new Response(JSON.stringify({ error: "QR payment link was not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: qrLink, error: qrError } = await supabase
          .from("merchant_qr_payment_links")
          .select("qr_payment_link_id, merchant_id, product_reference, amount, status, allow_quantity, min_quantity, max_quantity")
          .eq("slug", slug)
          .maybeSingle();
        if (qrError) throw qrError;
        if (!qrLink) {
          return new Response(JSON.stringify({ error: "QR payment link was not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (qrLink.status !== "active") {
          return new Response(JSON.stringify({ error: "This QR payment link is no longer active" }), {
            status: 410,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        merchant_id = qrLink.merchant_id;
        qrUnitAmount = Number(qrLink.amount);
        const requestedQuantity = Number(qr_quantity ?? 1);
        const minQuantity = Number(qrLink.min_quantity || 1);
        const maxQuantity = qrLink.allow_quantity ? Number(qrLink.max_quantity || 1) : 1;
        if (
          !Number.isInteger(requestedQuantity)
          || requestedQuantity < minQuantity
          || requestedQuantity > maxQuantity
        ) {
          return new Response(JSON.stringify({
            error: qrLink.allow_quantity
              ? `Select a quantity between ${minQuantity} and ${maxQuantity}`
              : "This QR product has a fixed quantity of 1",
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        qrQuantity = requestedQuantity;
        amount = Math.round(qrUnitAmount * 100) * qrQuantity / 100;
        invoice_id = qrLink.product_reference;
        qrPaymentLinkId = qrLink.qr_payment_link_id;
      }

      if (!merchant_id || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || !invoice_id) {
        return new Response(JSON.stringify({ error: "Invalid payment details" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: merchantInfo, error: merchantError } = await supabase
        .from("merchants")
        .select("business_name, tax_mode, vat_rate, tax_settings_completed_at")
        .eq("merchant_id", merchant_id)
        .maybeSingle();
      if (merchantError) throw merchantError;
      if (!merchantInfo) {
        return new Response(JSON.stringify({ error: "Merchant account was not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!merchantInfo.tax_settings_completed_at) {
        return new Response(JSON.stringify({ error: "Save Tax Settings before generating a paycode" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const tax = calculateTax(amount, merchantInfo.tax_mode, merchantInfo.vat_rate);
      if (tax.gross > 1_000_000) {
        return new Response(JSON.stringify({ error: "The final amount including VAT cannot exceed N$1,000,000.00" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      const mc = await ensureMerchantClient(merchant_id, email, normalizedMobile);
      
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .insert({
          merchant_id,
          merchant_client_id: mc?.merchant_client_id || null,
          amount: tax.gross,
          tax_mode: tax.taxMode,
          vat_rate: tax.vatRate,
          net_amount: tax.net,
          vat_amount: tax.vat,
          gross_amount: tax.gross,
          type,
          payment_method: "paysme_code",
          invoice_id,
          payer_town: normalizedTown || null,
          user_email: email,
          user_mobile: normalizedMobile,
          business_name: merchantInfo.business_name || "PaySME",
          qr_payment_link_id: qrPaymentLinkId,
          qr_unit_amount: qrUnitAmount,
          qr_quantity: qrQuantity,
        })
        .select("*")
        .single();
      
      if (txError) throw txError;

      // Send SMS notification with paycode (fire-and-forget)
      if (normalizedMobile && tx.generated_code) {
        sendSmsNotification("send_paycode", {
          mobile: normalizedMobile,
          generated_code: tx.generated_code,
          amount: tx.amount,
          business_name: tx.business_name || "PaySME",
          invoice_id: tx.invoice_id,
          subscription_type: subscription_type || null,
        });
      }
      
      return new Response(JSON.stringify({
        ok: true,
        transaction: tx
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // 🚀 2. CREATE SUBSCRIPTION (requires authentication)
    if (action === "create_subscription") {
      const user = await authenticateUser(req);
      const { user_id, duration_months, plan_type, recurring } = payload;
      
      if (user.id !== user_id) {
        return new Response(JSON.stringify({ error: "Forbidden: merchant mismatch" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      const { data: merchant, error: merchantError } = await supabase
        .from("merchants")
        .select("merchant_id, email, mobile_number")
        .eq("merchant_id", user_id)
        .single();
      
      if (merchantError || !merchant) {
        throw new Error("Merchant not found");
      }

      const durationMonths = Number(duration_months);
      const allowedDurations = new Set([3, 6, 9, 12]);
      if (!allowedDurations.has(durationMonths)) {
        return new Response(JSON.stringify({ error: "Subscription term must be 3, 6, 9, or 12 months" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const requestedPlanKey = subscriptionPlanKey(plan_type);
      const { data: subscriptionPlanRule, error: subscriptionPlanRuleError } = await supabase
        .from("subscription_plan_rules")
        .select("monthly_amount")
        .eq("plan_key", requestedPlanKey)
        .eq("is_active", true)
        .maybeSingle();

      if (subscriptionPlanRuleError) throw subscriptionPlanRuleError;
      if (!subscriptionPlanRule) {
        return new Response(JSON.stringify({ error: "Invalid or inactive subscription plan" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const subscriptionAmount = Number(subscriptionPlanRule.monthly_amount) * durationMonths;
      const normalizedPlanType = `${requestedPlanKey}_${durationMonths}_months`;

      const PAYSME_MERCHANT_ID = "00000000-1986-0026-0000-000000000001";

      // PaySME owns the platform, so its own subscription is an internal
      // entitlement rather than a billable payment. Activate it immediately
      // without creating a transaction or PaySME code.
      if (user_id === PAYSME_MERCHANT_ID) {
        const activatedAt = new Date();
        const endDate = new Date(activatedAt);
        endDate.setMonth(endDate.getMonth() + durationMonths);

        const { data: platformSubscription, error: platformSubscriptionError } = await supabase
          .from("subscriptions")
          .insert({
            user_id: merchant.merchant_id,
            amount: 0,
            duration_months: durationMonths,
            plan_type: normalizedPlanType,
            recurring: false,
            status: "active",
            start_date: activatedAt.toISOString(),
            end_date: endDate.toISOString(),
            activated_date: activatedAt.toISOString(),
            generated_code: null,
            paycode_status: "paid",
          })
          .select("*")
          .single();

        if (platformSubscriptionError) throw platformSubscriptionError;

        return new Response(JSON.stringify({
          ok: true,
          platform_owner: true,
          transaction: null,
          subscription: platformSubscription,
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }
      const paysmeTaxSettings = await getPaysmeTaxSettings();
      const subscriptionTax = calculateTax(subscriptionAmount, paysmeTaxSettings.tax_mode, paysmeTaxSettings.vat_rate);
      
      const generateSubTransactionId = () => {
        const randomNumber = Math.floor(Math.random() * 10000000000);
        return `SUB_TX${randomNumber.toString().padStart(10, '0')}`;
      };
      
      const invoiceId = `SUB_${normalizedPlanType}_${Date.now()}`;
      const transactionId = generateSubTransactionId();
      
      // Use ensureMerchantClient to avoid duplicate key errors
      const paysmeClient = await ensureMerchantClient(PAYSME_MERCHANT_ID, merchant.email, merchant.mobile_number);
      
      if (!paysmeClient) {
        throw new Error("Failed to create/find merchant client");
      }
      
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .insert({
          transaction_id: transactionId,
          merchant_id: PAYSME_MERCHANT_ID,
          merchant_client_id: paysmeClient.merchant_client_id,
          amount: subscriptionTax.gross,
          tax_mode: subscriptionTax.taxMode,
          vat_rate: subscriptionTax.vatRate,
          net_amount: subscriptionTax.net,
          vat_amount: subscriptionTax.vat,
          gross_amount: subscriptionTax.gross,
          type: "subscription",
          invoice_id: invoiceId,
          user_email: merchant.email,
          user_mobile: merchant.mobile_number,
          business_name: "PaySME"
        })
        .select("*")
        .single();
      
      if (txError) throw txError;
      
      const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          user_id: merchant.merchant_id,
          amount: subscriptionTax.gross,
          duration_months: durationMonths,
          plan_type: normalizedPlanType,
          recurring,
          start_date: new Date(),
          end_date: new Date(new Date().setMonth(new Date().getMonth() + durationMonths)),
          generated_code: tx.generated_code,
          paycode_status: 'pending'
        })
        .select("*")
        .single();
      
      if (subError) throw subError;

      // Send subscription SMS (fire-and-forget)
      if (merchant.mobile_number && tx.generated_code) {
        sendSmsNotification("send_subscription", {
          mobile: merchant.mobile_number,
          generated_code: tx.generated_code,
          amount: subscriptionTax.gross,
          plan_type: normalizedPlanType,
        });
      }
      
      return new Response(JSON.stringify({
        ok: true,
        transaction: tx,
        subscription: sub
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // 🚀 3. SMS TOP-UP (requires authentication)
    if (action === "sms_topup") {
      const user = await authenticateUser(req);
      const { user_id, tokens_purchased } = payload;
      
      if (user.id !== user_id) {
        return new Response(JSON.stringify({ error: "Forbidden: merchant mismatch" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      const { data: merchant, error: merchantError } = await supabase
        .from("merchants")
        .select("merchant_id, email, mobile_number")
        .eq("merchant_id", user_id)
        .single();
      
      if (merchantError || !merchant) {
        throw new Error("Merchant not found");
      }

      const tokenCount = Number(tokens_purchased);
      if (!Number.isInteger(tokenCount) || tokenCount <= 0) {
        return new Response(JSON.stringify({ error: "SMS credit quantity must be a positive whole number" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: activeSubscription, error: activeSubscriptionError } = await supabase
        .from("subscriptions")
        .select("plan_type")
        .eq("user_id", user_id)
        .eq("status", "active")
        .eq("paycode_status", "paid")
        .gt("end_date", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSubscriptionError) throw activeSubscriptionError;
      if (!activeSubscription) {
        return new Response(JSON.stringify({ error: "An active Scale or Corporate plan is required for Bulk SMS purchases" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: smsPlanRule, error: smsPlanRuleError } = await supabase
        .from("subscription_plan_rules")
        .select("bulk_invoice_enabled, bulk_paycode_enabled, bulk_sms_discount_rate")
        .eq("plan_key", subscriptionPlanKey(activeSubscription.plan_type))
        .eq("is_active", true)
        .maybeSingle();

      if (smsPlanRuleError) throw smsPlanRuleError;
      if (!smsPlanRule || (!smsPlanRule.bulk_invoice_enabled && !smsPlanRule.bulk_paycode_enabled)) {
        return new Response(JSON.stringify({ error: "An active Scale or Corporate plan is required for Bulk SMS purchases" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const discountRate = Math.min(1, Math.max(0, Number(smsPlanRule.bulk_sms_discount_rate || 0)));
      const smsAmount = Number((tokenCount * (1 - discountRate)).toFixed(2));
      const paysmeTaxSettings = await getPaysmeTaxSettings();
      const smsTax = calculateTax(smsAmount, paysmeTaxSettings.tax_mode, paysmeTaxSettings.vat_rate);
      
      const generateSmsTransactionId = () => {
        const randomNumber = Math.floor(Math.random() * 10000000000);
        return `SMS_TX${randomNumber.toString().padStart(10, '0')}`;
      };
      
      const invoiceId = `SMS_${tokenCount}_${Date.now()}`;
      const transactionId = generateSmsTransactionId();
      const PAYSME_MERCHANT_ID = "00000000-1986-0026-0000-000000000001";
      
      // Use ensureMerchantClient to avoid duplicate key errors
      const paysmeClient = await ensureMerchantClient(PAYSME_MERCHANT_ID, merchant.email, merchant.mobile_number);
      
      if (!paysmeClient) {
        throw new Error("Failed to create/find merchant client");
      }
      
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .insert({
          transaction_id: transactionId,
          merchant_id: PAYSME_MERCHANT_ID,
          merchant_client_id: paysmeClient.merchant_client_id,
          amount: smsTax.gross,
          tax_mode: smsTax.taxMode,
          vat_rate: smsTax.vatRate,
          net_amount: smsTax.net,
          vat_amount: smsTax.vat,
          gross_amount: smsTax.gross,
          type: "sms",
          invoice_id: invoiceId,
          user_email: merchant.email,
          user_mobile: merchant.mobile_number,
          business_name: "PaySME"
        })
        .select("*")
        .single();
      
      if (txError) throw txError;
      
      const { data: sms, error: smsError } = await supabase
        .from("sms_transactions")
        .insert({
          merchant_id: PAYSME_MERCHANT_ID,
          user_id: merchant.merchant_id,
          tokens_purchased: tokenCount,
          tokens_available: tokenCount,
          transaction_id: tx.transaction_id,
          generated_code: tx.generated_code,
          paycode_status: 'pending',
          admin_load_status: 'not_paid'
        })
        .select("*")
        .single();
      
      if (smsError) throw smsError;

      // Send SMS topup code (fire-and-forget)
      if (merchant.mobile_number && tx.generated_code) {
        sendSmsNotification("send_sms_topup", {
          mobile: merchant.mobile_number,
          generated_code: tx.generated_code,
          amount: smsTax.gross,
          tokens_purchased: tokenCount,
        });
      }
      
      return new Response(JSON.stringify({
        ok: true,
        transaction: tx,
        sms_transaction: sms,
        pricing: {
          unit_price: Number((1 - discountRate).toFixed(2)),
          discount_rate: discountRate,
          amount: smsTax.gross,
          price_before_vat: smsTax.net,
          vat_rate: smsTax.vatRate,
          vat_amount: smsTax.vat,
        }
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    return new Response(JSON.stringify({
      error: "Unknown action"
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
    
  } catch (err) {
    console.error('payments request failed:', err);
    const errorMessage = err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'Payment request failed';
    return new Response(JSON.stringify({
      error: errorMessage
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
