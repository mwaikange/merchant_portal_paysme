import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function paymentCodeCandidates(value: unknown) {
  const original = String(value || "").trim();
  const digits = original.replace(/\D/g, "").slice(0, 14);
  const candidates = new Set<string>([original]);

  if (digits.length === 12) {
    candidates.add(`${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`);
    candidates.add(digits);
  } else if (digits.length === 14) {
    candidates.add(`${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 14)}`);
    candidates.add(`${digits.slice(0, 4)}-${digits.slice(4, 12)}-${digits.slice(12, 14)}`);
    candidates.add(digits);
  }

  return Array.from(candidates).filter(Boolean);
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function providerPaymentMethod(providerName: string) {
  const normalized = String(providerName || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (normalized.includes("paypulse") || normalized.includes("pay_pulse")) return "paypulse";
  if (normalized.includes("maris") || normalized.includes("mtc")) return "mtc_maris";
  if (normalized.includes("adumo") || normalized.includes("card")) return "card";
  if (normalized.includes("wayame")) return "wayame";
  if (normalized.includes("paytoday")) return "paytoday";
  if (normalized.includes("kazang")) return "kazang";
  return null;
}

// Verify HMAC-SHA256 signature.
// Mirrors exactly what providers do when signing (per API docs Section 7.1):
// 1. Remove the signature field from payload
// 2. Sort all remaining keys alphabetically
// 3. JSON.stringify the sorted object — this is the canonical string
// 4. Verify HMAC-SHA256 against that canonical string
async function verifySignature(
  payload: Record<string, unknown>,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // Remove signature field
    const { signature: _sig, ...unsigned } = payload;

    // Sort keys alphabetically and stringify — canonical string
    const sorted = Object.fromEntries(
      Object.keys(unsigned).sort().map(k => [k, unsigned[k]])
    );
    const canonical = JSON.stringify(sorted);
    console.log("Canonical string for verification:", canonical);

    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Decode Base64URL signature (replace - → + and _ → /, restore padding)
    const standardBase64 = signature.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standardBase64.padEnd(Math.ceil(standardBase64.length / 4) * 4, '=');
    const signatureBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

    return await crypto.subtle.verify("HMAC", cryptoKey, signatureBytes, encoder.encode(canonical));
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let logId: string | null = null;

  try {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => { headers[key] = value; });

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    const providerName = payload.payment_provider || headers["x-provider-name"] || payload.provider || "Unknown";
    console.log(`Processing webhook from provider: ${providerName}`);

    // ── kiosk_lookup ── no signature required, handle immediately
    if (payload.action === "kiosk_lookup") {
      const { paymentCode } = payload;
      if (!paymentCode) {
        return new Response(JSON.stringify({ error: "Missing paymentCode" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .select("transaction_id, generated_code, amount, merchant_id, user_email, user_mobile, type, date_generated, status, business_name, finalized, vendor_redeemable, payment_purpose")
        .in("generated_code", paymentCodeCandidates(paymentCode))
        .eq("status", "pending")
        .maybeSingle();

      if (txError || !tx) {
        return new Response(JSON.stringify({ error: "Payment code not found" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (tx.finalized === true) {
        return new Response(JSON.stringify({ error: "This payment code has already been finalized" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (tx.vendor_redeemable === false) {
        return new Response(JSON.stringify({
          error: "This payment is restricted to approved external payment methods"
        }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        transaction: { ...tx, merchant_name: tx.business_name }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── vendor_process_payment ── PaySME Vendor mobile app processes a token
    if (payload.action === "vendor_process_payment") {
      const { generated_code, vendor_id, pin_hash } = payload;

      if (!generated_code || !vendor_id || !pin_hash) {
        return new Response(JSON.stringify({ error: "Missing generated_code, vendor_id or pin_hash" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 1. Verify the signed-in vendor owns the account and the submitted PIN
      // matches the one-way hash written by vendor-registration.
      const authHeader = req.headers.get("Authorization") || "";
      const accessToken = authHeader.replace(/^Bearer\s+/i, "");
      const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
      if (authError || !authData.user) {
        return new Response(JSON.stringify({ error: "Vendor session is invalid or expired" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: vendor, error: vendorErr } = await supabase
        .from("vendors")
        .select("vendor_id, auth_user_id, pin_hash, pin_set, token_balance, fee_balance, commission_rate, is_active, kyc_status")
        .eq("vendor_id", vendor_id)
        .maybeSingle();

      if (vendorErr || !vendor) {
        return new Response(JSON.stringify({ error: "Vendor not found" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (!vendor.is_active) {
        return new Response(JSON.stringify({ error: "Vendor account is not active" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (vendor.auth_user_id !== authData.user.id) {
        return new Response(JSON.stringify({ error: "This vendor session cannot authorize that account" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const submittedPin = String(pin_hash);
      const submittedPinHash = await sha256(submittedPin);
      const matchesHashedPin = vendor.pin_hash === submittedPinHash;
      const matchesLegacyPlainPin = /^\d{5}$/.test(String(vendor.pin_hash || "")) && vendor.pin_hash === submittedPin;
      if (!vendor.pin_set || (!matchesHashedPin && !matchesLegacyPlainPin)) {
        return new Response(JSON.stringify({ error: "Invalid PIN" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (matchesLegacyPlainPin) {
        // One-way upgrade for PINs created by the legacy implementation.
        await supabase.from("vendors").update({ pin_hash: submittedPinHash }).eq("vendor_id", vendor.vendor_id);
      }

      // 2. Look up pending transaction
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .select("*")
        .in("generated_code", paymentCodeCandidates(generated_code))
        .eq("status", "pending")
        .maybeSingle();

      if (txErr || !tx) {
        return new Response(JSON.stringify({ error: "Transaction not found or already processed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (tx.finalized === true) {
        return new Response(JSON.stringify({ error: "This payment code has already been finalized" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (tx.vendor_redeemable === false ||
          ["vendor_token_topup", "vendor_advance_installment"].includes(tx.payment_purpose || tx.type)) {
        return new Response(JSON.stringify({
          error: "This payment cannot be processed through the PaySME Vendor network. Use an approved external payment method."
        }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const txAmount = Number(tx.amount);

      // 3. Check vendor token balance
      if (Number(vendor.token_balance) < txAmount) {
        return new Response(JSON.stringify({ error: "Insufficient token balance" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 4. Mark transaction as paid
      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status: "paid",
          date_paid: new Date().toISOString(),
          amount_paid: txAmount,
          finalized: true,
          payment_method: "paysme_vendor",
          updated_at: new Date().toISOString(),
        })
        .eq("transaction_id", tx.transaction_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: "Failed to update transaction" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 5. Calculate fee
      const fee = Math.round(txAmount * Number(vendor.commission_rate) * 100) / 100;
      const newTokenBalance = Math.round((Number(vendor.token_balance) - txAmount) * 100) / 100;
      const newFeeBalance = Math.round((Number(vendor.fee_balance) + fee) * 100) / 100;

      // 6. Update vendor balances
      const { error: vendorUpdateError } = await supabase
        .from("vendors")
        .update({
          token_balance: newTokenBalance,
          fee_balance: newFeeBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("vendor_id", vendor_id);

      if (vendorUpdateError) {
        console.error("Failed to update vendor balances:", vendorUpdateError);
      }

      // 7. Insert vendor_transactions records
      await supabase.from("vendor_transactions").insert([
        {
          vendor_id,
          transaction_type: "Payment Processed",
          amount: txAmount,
          status: "completed",
          generated_code: tx.generated_code,
          merchant_name: tx.business_name,
          merchant_id: tx.merchant_id,
        },
        {
          vendor_id,
          transaction_type: "Fee Earned",
          amount: fee,
          status: "completed",
          generated_code: tx.generated_code,
          merchant_name: tx.business_name,
          merchant_id: tx.merchant_id,
        },
      ]);

      // 8a. Send confirmation SMS to customer (fire-and-forget)
      if (tx.user_mobile && tx.sms_notifications_enabled !== false) {
        try {
          const smsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms`;
          fetch(smsUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              action: "send_payment_confirmation",
              payload: {
                mobile: tx.user_mobile,
                generated_code: tx.generated_code,
                amount: txAmount,
                business_name: tx.business_name || "PaySME",
              },
            }),
          }).catch(e => console.error("SMS confirmation send failed:", e));
        } catch (e) {
          console.error("SMS confirmation error:", e);
        }
      }

      // 8b. Forward notification to merchant's webhook URL
      const { data: merchantData } = await supabase
        .from("merchants")
        .select("webhook_url, webhook_secret")
        .eq("merchant_id", tx.merchant_id)
        .single();

      if (merchantData?.webhook_url) {
        const merchantPayload = {
          paySMECode:     tx.generated_code,
          generated_code: tx.generated_code,
          invoiceId:      tx.invoice_id,
          status:         "paid",
          result:         0,
          amount:         txAmount,
          currency:       "NAD",
          paymentMethod:  "VENDOR",
          timestamp:      Date.now().toString(),
        };
        try {
          await fetch(merchantData.webhook_url, {
            method: "POST",
            headers: {
              "Content-Type":     "application/json",
              "x-webhook-secret": merchantData.webhook_secret || "",
              "x-paysme-secret":  merchantData.webhook_secret || "",
            },
            body: JSON.stringify(merchantPayload),
          });
        } catch (e) {
          console.error("Merchant forward failed:", e);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        fee_earned: fee,
        new_token_balance: newTokenBalance,
        new_fee_balance: newFeeBalance,
        transaction_id: tx.transaction_id,
        generated_code: tx.generated_code,
        amount: txAmount,
        merchant_name: tx.business_name,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Log all other webhooks ──
    const { data: logEntry, error: logError } = await supabase
      .from("webhook_logs")
      .insert({ provider_name: providerName, payload, headers, status: "pending" })
      .select()
      .single();

    if (logError) {
      console.error("Failed to log webhook:", logError);
      return new Response(
        JSON.stringify({ error: "Webhook logging failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    logId = logEntry.id;

    // ── notification_only payment confirmation ──
    if (payload.notification_only === true) {

      if (providerName === "Unknown") {
        await updateWebhookLog(logId, "failed", "Missing provider name");
        return new Response(JSON.stringify({ error: "Missing provider name" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get signature key from payment_providers table
      const { data: signatureKey, error: providerError } = await supabase
        .rpc("get_provider_signature_key", { provider_name: providerName });

      if (providerError || !signatureKey) {
        await updateWebhookLog(logId, "failed", `Provider not found: ${providerName}`);
        return new Response(JSON.stringify({ error: "Payment provider not found or inactive" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Validate timestamp within 5 minutes
      if (!payload.timestamp) {
        await updateWebhookLog(logId, "failed", "Missing timestamp");
        return new Response(JSON.stringify({ error: "Missing timestamp" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - payload.timestamp) > 300) {
        await updateWebhookLog(logId, "failed", "Webhook expired or replayed");
        return new Response(JSON.stringify({ error: "Webhook expired or replayed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Validate signature exists
      if (!payload.signature) {
        await updateWebhookLog(logId, "failed", "Missing signature");
        return new Response(JSON.stringify({ error: "Missing signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verify signature using canonical string (sorted keys, no signature field)
      const isValid = await verifySignature(payload, String(payload.signature), signatureKey);
      if (!isValid) {
        console.error("Invalid signature for provider:", providerName);
        await updateWebhookLog(logId, "failed", "Invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.log("Signature verified for:", providerName);

      // Find transaction
      const { generated_code, amount, status, transaction_id, merchant_id } = payload;

      if (!generated_code && !transaction_id) {
        await updateWebhookLog(logId, "failed", "Missing transaction identifier");
        return new Response(JSON.stringify({ error: "Missing transaction identifier (generated_code or transaction_id)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let transactionQuery = supabase.from("transactions").select("*");
      if (generated_code) {
        transactionQuery = transactionQuery.eq("generated_code", generated_code);
      } else {
        transactionQuery = transactionQuery.eq("transaction_id", transaction_id);
      }

      const { data: existingTransaction, error: findError } = await transactionQuery.single();

      if (findError || !existingTransaction) {
        await updateWebhookLog(logId, "failed", `Transaction not found: ${generated_code || transaction_id}`);
        return new Response(JSON.stringify({ error: "Transaction not found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Validate merchant_id
      if (merchant_id && existingTransaction.merchant_id !== merchant_id) {
        await updateWebhookLog(logId, "failed", "Merchant mismatch");
        return new Response(JSON.stringify({ error: "Merchant mismatch" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Validate amount
      if (amount && Number(amount) !== Number(existingTransaction.amount)) {
        await updateWebhookLog(logId, "failed", "Amount mismatch");
        return new Response(JSON.stringify({ error: "Amount mismatch" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Already finalized
      if (existingTransaction.finalized === true) {
        await updateWebhookLog(logId, "processed", null);
        return new Response(JSON.stringify({ ok: true, message: "Already finalized", log_id: logId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Must be pending
      if (existingTransaction.status !== "pending") {
        await updateWebhookLog(logId, "failed", `Transaction not in pending state`);
        return new Response(JSON.stringify({ error: "Transaction not in pending state" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get provider record for ID
      const { data: providerRecord } = await supabase
        .from("payment_providers")
        .select("payment_provider_id")
        .eq("name", providerName)
        .single();

      // Mark transaction as paid
      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status: "paid",
          date_paid: new Date().toISOString(),
          amount_paid: amount || existingTransaction.amount,
          payment_provider_id: providerRecord?.payment_provider_id || null,
          payment_method: providerPaymentMethod(providerName),
          finalized: true,
          updated_at: new Date().toISOString()
        })
        .eq("transaction_id", existingTransaction.transaction_id);

      if (updateError) {
        await updateWebhookLog(logId, "failed", `Failed to update transaction: ${updateError.message}`);
        return new Response(JSON.stringify({ error: "Failed to update transaction" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`Transaction ${existingTransaction.transaction_id} marked as paid by ${providerName}`);

      // If this is an SMS top-up transaction, queue it for manual admin loading.
      if (existingTransaction.type === 'sms') {
        const { error: smsUpdateError } = await supabase
          .from("sms_transactions")
          .update({
            paycode_status: 'paid',
            admin_load_status: 'pending_load',
            admin_load_requested_at: new Date().toISOString(),
          })
          .eq("transaction_id", existingTransaction.transaction_id);

        if (smsUpdateError) {
          console.error("Failed to queue SMS credits for admin load:", smsUpdateError);
        } else {
          console.log(`Queued SMS credits for manual admin load: ${existingTransaction.transaction_id}`);
        }
      }

      // Send payment confirmation SMS to customer (fire-and-forget)
      if (existingTransaction.user_mobile && existingTransaction.sms_notifications_enabled !== false) {
        try {
          const smsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms`;
          fetch(smsUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              action: "send_payment_confirmation",
              payload: {
                mobile: existingTransaction.user_mobile,
                generated_code: existingTransaction.generated_code,
                amount: existingTransaction.amount,
                business_name: existingTransaction.business_name || "PaySME",
              },
            }),
          }).catch(e => console.error("SMS confirmation send failed:", e));
        } catch (e) {
          console.error("SMS confirmation error:", e);
        }
      }

      // Forward notification to merchant's webhook URL
      const { data: merchantData } = await supabase
        .from("merchants")
        .select("webhook_url, webhook_secret")
        .eq("merchant_id", existingTransaction.merchant_id)
        .single();

      console.log("Merchant webhook_url:", merchantData?.webhook_url);

      if (merchantData?.webhook_url) {
        const merchantPayload = {
          paySMECode:     existingTransaction.generated_code,
          generated_code: existingTransaction.generated_code,
          invoiceId:      existingTransaction.invoice_id,
          status:         "paid",
          result:         0,
          amount:         Number(existingTransaction.amount),
          currency:       "NAD",
          paymentMethod:  "KIOSK",
          timestamp:      Date.now().toString(),
        };

        try {
          const forwardRes = await fetch(merchantData.webhook_url, {
            method: "POST",
            headers: {
              "Content-Type":     "application/json",
              "x-webhook-secret": merchantData.webhook_secret || "",
              "x-paysme-secret":  merchantData.webhook_secret || "",
            },
            body: JSON.stringify(merchantPayload),
          });
          console.log("Merchant forward status:", forwardRes.status);
        } catch (e) {
          console.error("Merchant forward failed:", e);
        }
      }

      await updateWebhookLog(logId, "processed", null);

      return new Response(JSON.stringify({ ok: true, log_id: logId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Unknown payload type
    await updateWebhookLog(logId, "failed", "Invalid payload type");
    return new Response(JSON.stringify({ error: "Invalid payload type" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Webhook handler error:", error);
    if (logId) await updateWebhookLog(logId, "failed", error.message);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message, log_id: logId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function updateWebhookLog(logId: string, status: string, errorMessage?: string | null) {
  try {
    await supabase
      .from("webhook_logs")
      .update({ status, error_message: errorMessage || null })
      .eq("id", logId);
  } catch (error) {
    console.error("Failed to update webhook log:", error);
  }
}
