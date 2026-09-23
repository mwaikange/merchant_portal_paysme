import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function paymentCodeCandidates(value: unknown): string[] {
  let raw = String(value || "").replace(/\u00a0/g, " ").trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep the original value when it is not URI encoded.
  }

  const withoutQuery = raw.split(/[?#]/, 1)[0].trim();
  const finalPathPart = withoutQuery.split("/").filter(Boolean).at(-1) || withoutQuery;
  const compact = finalPathPart.replace(/\s+/g, "");
  const digits = compact.replace(/\D/g, "");
  const candidates = new Set<string>([raw, withoutQuery, finalPathPart, compact]);

  if (digits) candidates.add(digits);
  if (digits.length === 12) {
    candidates.add(`${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`);
  }

  return [...candidates].map((candidate) => candidate.trim()).filter(Boolean);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Service credentials not configured" }, 500);
    }

    const { generated_code } = await req.json();
    const codeCandidates = paymentCodeCandidates(generated_code);

    if (codeCandidates.length === 0) {
      return jsonResponse({ ok: false, error: "Missing generated_code" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .select("transaction_id, merchant_id, generated_code, amount, user_email, user_mobile, payer_town, status, type, invoice_id, business_name, created_at, vendor_obligation_id, vendor_redeemable, payment_purpose, allowed_payment_methods, tax_mode, vat_rate, net_amount, vat_amount, gross_amount")
      .in("generated_code", codeCandidates)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transactionError) throw transactionError;

    if (transaction) {

      return jsonResponse({
        ok: true,
        source: "transactions",
        payment: {
          merchant_id: transaction.merchant_id,
          generated_code: transaction.generated_code,
          amount: transaction.amount,
          user_email: transaction.user_email,
          user_mobile: transaction.user_mobile,
          payer_town: transaction.payer_town,
          status: transaction.status,
          invoice_id: transaction.invoice_id || transaction.generated_code,
          business_name: transaction.business_name || "PaySME",
          vendor_obligation_id: transaction.vendor_obligation_id || null,
          vendor_redeemable: transaction.vendor_redeemable,
          payment_purpose: transaction.payment_purpose || transaction.type || null,
          allowed_payment_methods: transaction.allowed_payment_methods || [],
          recurring: false,
          recurring_period: "monthly",
          tax_mode: transaction.tax_mode || "not_registered",
          vat_rate: Number(transaction.vat_rate || 0),
          net_amount: Number(transaction.net_amount || transaction.amount),
          vat_amount: Number(transaction.vat_amount || 0),
          gross_amount: Number(transaction.gross_amount || transaction.amount),
        },
      });
    }

    const { data: bulkSubscriber, error: bulkError } = await supabase
      .from("bulk_subscribers")
      .select("id, merchant_id, generated_code, amount, user_email, user_mobile, status, reference, recurring, recurring_period, date_generated, tax_mode, vat_rate, net_amount, vat_amount, gross_amount")
      .in("generated_code", codeCandidates)
      .order("date_generated", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bulkError) throw bulkError;

    if (!bulkSubscriber) {
      return jsonResponse({
        ok: false,
        error: "This payment link is invalid, has expired, or its payment record is no longer available.",
        reason: "not_found",
      }, 404);
    }

    const { data: merchant } = await supabase
      .from("merchants")
      .select("business_name, tax_mode, vat_rate")
      .eq("merchant_id", bulkSubscriber.merchant_id)
      .maybeSingle();
    const tax = bulkSubscriber.tax_mode && bulkSubscriber.gross_amount != null
      ? {
          taxMode: bulkSubscriber.tax_mode,
          vatRate: Number(bulkSubscriber.vat_rate || 0),
          net: Number(bulkSubscriber.net_amount ?? bulkSubscriber.amount),
          vat: Number(bulkSubscriber.vat_amount || 0),
          gross: Number(bulkSubscriber.gross_amount),
        }
      : calculateTax(Number(bulkSubscriber.amount), merchant?.tax_mode || "not_registered", merchant?.vat_rate);

    return jsonResponse({
      ok: true,
      source: "bulk_subscribers",
      payment: {
        merchant_id: bulkSubscriber.merchant_id,
        generated_code: bulkSubscriber.generated_code,
        amount: tax.gross,
        user_email: bulkSubscriber.user_email,
        user_mobile: bulkSubscriber.user_mobile,
        status: bulkSubscriber.status,
        invoice_id: bulkSubscriber.reference || bulkSubscriber.generated_code,
        business_name: merchant?.business_name || "PaySME Store",
        recurring: Boolean(bulkSubscriber.recurring),
        recurring_period: bulkSubscriber.recurring_period || "monthly",
        tax_mode: tax.taxMode,
        vat_rate: tax.vatRate,
        net_amount: tax.net,
        vat_amount: tax.vat,
        gross_amount: tax.gross,
      },
    });
  } catch (error) {
    console.error("resolve-payment-code error:", error);
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unable to resolve payment code" },
      500,
    );
  }
});
