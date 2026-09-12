import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduled-sms-secret",
};

const PUBLIC_SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://www.paysme.site").replace(/\/$/, "");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatCodeLink(generatedCode: string): string {
  return `${PUBLIC_SITE_URL}/c/${encodeURIComponent(generatedCode)}`;
}

function formatBulkSmsContent(row: any): string {
  const subscriptionLabel = row.recurring
    ? `${String(row.recurring_period || "monthly").charAt(0).toUpperCase()}${String(row.recurring_period || "monthly").slice(1)}`
    : "Once-Off";

  return [
    `PaySME payment request`,
    `Ref: ${row.reference || row.generated_code}`,
    `Amount: N$ ${Number(row.amount || 0).toFixed(2)}`,
    `Code: ${row.generated_code}`,
    `Payment link: ${formatCodeLink(row.generated_code)}`,
    `Subscription: ${subscriptionLabel}`,
    "",
    "Use the link or present this code at any PaySME vendor to complete payment.",
  ].join("\n");
}

function windhoekParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function isAfterSmsCutoff(date = new Date()): boolean {
  const parts = windhoekParts(date);
  return parts.hour > 18 || (parts.hour === 18 && parts.minute > 0);
}

function sameDayCutoffIso(date: Date): string {
  const parts = windhoekParts(date);
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return new Date(`${yyyy}-${mm}-${dd}T18:00:00+02:00`).toISOString();
}

function sameDayStartIso(date: Date): string {
  const parts = windhoekParts(date);
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00+02:00`).toISOString();
}

function sameDayEndIso(date: Date): string {
  const parts = windhoekParts(date);
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return new Date(`${yyyy}-${mm}-${dd}T23:59:59+02:00`).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase service credentials not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const suppliedCronSecret = req.headers.get("x-scheduled-sms-secret")?.trim();
    if (!suppliedCronSecret) {
      return jsonResponse({ error: "Scheduled SMS authorization required" }, 401);
    }

    const { data: cronAuthorized, error: cronAuthError } = await supabase.rpc(
      "verify_scheduled_sms_cron_secret",
      { p_secret: suppliedCronSecret },
    );

    if (cronAuthError) {
      console.error("Scheduled SMS cron authentication is not configured", cronAuthError);
      return jsonResponse({ error: "Scheduled SMS authentication is not configured" }, 500);
    }
    if (!cronAuthorized) {
      return jsonResponse({ error: "Invalid scheduled SMS authorization" }, 401);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(Number(body?.limit || 500), 500);
    const now = new Date();
    const todayStart = sameDayStartIso(now);
    const todayEnd = sameDayEndIso(now);
    const todayCutoff = sameDayCutoffIso(now);

    if (isAfterSmsCutoff(now)) {
      const { data: lateRows } = await supabase
        .from("bulk_subscribers")
        .select("id, scheduled_send_at")
        .eq("sms_status", "scheduled")
        .gt("scheduled_send_at", todayCutoff)
        .lte("scheduled_send_at", todayEnd);

      if (lateRows && lateRows.length > 0) {
        await supabase
          .from("bulk_subscribers")
          .update({ sms_status: "failed" })
          .in("id", lateRows.map((row: any) => row.id));
      }

      return jsonResponse({ ok: true, processed: 0, sent: 0, failed: 0, skipped: "after_sms_cutoff" });
    }

    await supabase
      .from("bulk_subscribers")
      .update({ sms_status: "failed" })
      .eq("sms_status", "scheduled")
      .lt("scheduled_send_at", todayStart);

    const { data: dueRows, error } = await supabase
      .from("bulk_subscribers")
      .select("id, merchant_id, user_mobile, generated_code, amount, reference, recurring, recurring_period, scheduled_send_at")
      .eq("sms_status", "scheduled")
      .gte("scheduled_send_at", todayStart)
      .lte("scheduled_send_at", new Date().toISOString())
      .order("scheduled_send_at", { ascending: true })
      .limit(limit);

    if (error) throw error;
    if (!dueRows || dueRows.length === 0) {
      return jsonResponse({ ok: true, processed: 0, sent: 0, failed: 0 });
    }

    const byMerchant = new Map<string, any[]>();
    for (const row of dueRows) {
      if (!row.merchant_id) continue;
      const key = String(row.merchant_id);
      byMerchant.set(key, [...(byMerchant.get(key) || []), row]);
    }

    let sent = 0;
    let failed = 0;

    for (const [merchantId, rows] of byMerchant.entries()) {
      const messages = rows
        .filter(row => row.user_mobile && row.generated_code)
        .map(row => ({
          content: formatBulkSmsContent(row),
          destination: row.user_mobile,
        }));

      if (messages.length === 0) continue;

      const { data: smsResponse, error: smsError } = await supabase.functions.invoke("send-sms", {
        body: {
          action: "send_bulk",
          payload: {
            merchant_id: merchantId,
            use_merchant_credentials: true,
            messages,
          },
        },
      });

      const rowIds = rows.map(row => row.id);
      if (smsError || !smsResponse?.ok || Number(smsResponse?.sent_count || 0) < messages.length) {
        failed += rowIds.length;
        await supabase
          .from("bulk_subscribers")
          .update({ sms_status: "failed" })
          .in("id", rowIds);
        console.error("Scheduled SMS batch failed", { merchantId, smsError, smsResponse });
        continue;
      }

      sent += rowIds.length;
      await supabase
        .from("bulk_subscribers")
        .update({ sms_status: "sent", sms_scheduled_at: new Date().toISOString() })
        .in("id", rowIds);
    }

    return jsonResponse({ ok: true, processed: dueRows.length, sent, failed });
  } catch (error) {
    console.error("process-scheduled-sms error:", error);
    return jsonResponse({ error: error.message || "Scheduled SMS processing failed" }, 500);
  }
});
