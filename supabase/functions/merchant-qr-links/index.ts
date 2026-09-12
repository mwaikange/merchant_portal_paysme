import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import QRCode from "npm:qrcode@1.5.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey);

class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const cleanSiteUrl = () =>
  String(Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://paysme.site")
    .replace(/\/+$/, "");

const hostedUrl = (slug: string) => `${cleanSiteUrl()}/q/${encodeURIComponent(slug)}`;

const randomSlug = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
};

const safeText = (value: unknown, max: number) =>
  String(value || "").trim().replace(/\s+/g, " ").slice(0, max);

const escapeHtml = (value: unknown) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

async function qrSvg(url: string) {
  return await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 640,
    color: { dark: "#171d19", light: "#ffffff" },
  });
}

async function authenticatedMerchant(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new RequestError(401, "Sign in to manage QR payment links");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new RequestError(401, "Your session has expired");

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .select("merchant_id, email, business_name, tax_settings_completed_at")
    .eq("merchant_id", data.user.id)
    .maybeSingle();
  if (merchantError) throw merchantError;
  if (!merchant) throw new RequestError(403, "Merchant account was not found");
  return merchant;
}

async function requireActiveApiSubscription(merchantId: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("id, end_date, paycode_status")
    .eq("user_id", merchantId)
    .eq("status", "active")
    .eq("paycode_status", "paid");
  if (error) throw error;

  const now = Date.now();
  const active = (data || []).some((item) =>
    item.end_date && new Date(item.end_date).getTime() > now
  );
  if (!active) throw new RequestError(403, "An active API subscription is required");
}

async function ownedLink(merchantId: string, linkId: string) {
  const { data, error } = await admin
    .from("merchant_qr_payment_links")
    .select("*")
    .eq("qr_payment_link_id", linkId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new RequestError(404, "QR payment link was not found");
  return data;
}

async function sendQrEmail(
  to: string,
  businessName: string,
  productReference: string,
  amount: number,
  url: string,
  svg: string,
  allowQuantity: boolean,
  maxQuantity: number,
) {
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const fromEmail = Deno.env.get("SMTP_FROM_EMAIL");
  if (!host || !user || !password || !fromEmail) {
    throw new RequestError(503, "Email service is not configured");
  }

  const html = `<!doctype html>
  <html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#171d19;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;background:#f3f4f6;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;">
          <tr><td style="padding:24px 32px;background:#202720;color:#fff;">
            <div style="font-size:26px;font-weight:800;">PaySME</div>
            <div style="margin-top:4px;color:#f6c431;font-size:12px;font-weight:700;letter-spacing:1px;">QR PAYMENT LINK</div>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 12px;font-size:24px;">${escapeHtml(productReference)}</h1>
            <p style="margin:0 0 20px;color:#6b7280;">Created for ${escapeHtml(businessName || "your business")}.</p>
            <div style="padding:18px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
              <strong>${allowQuantity ? "Unit price" : "Amount"}: N$${Number(amount).toFixed(2)}</strong>
              ${allowQuantity ? `<div style="margin-top:6px;color:#6b7280;">Customers can select between 1 and ${maxQuantity} units.</div>` : ""}
            </div>
            <p style="margin:24px 0 12px;">The QR code is attached. Customers can scan it or use the secure button below.</p>
            <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 20px;border-radius:9px;background:#f6c431;color:#171d19;text-decoration:none;font-weight:800;">Open payment page</a>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#f9fafb;color:#6b7280;font-size:12px;">PaySME merchant payment link</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port: Number(Deno.env.get("SMTP_PORT") || 587),
      tls: true,
      auth: { username: user, password },
    },
  });
  try {
    await client.send({
      from: `${Deno.env.get("SMTP_FROM_NAME") || "PaySME"} <${fromEmail}>`,
      to,
      subject: `PaySME QR payment link - ${productReference}`,
      html,
      attachments: [{
        filename: `paysme-${productReference.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "payment"}-qr.svg`,
        content: bytesToBase64(new TextEncoder().encode(svg)),
        encoding: "base64",
        contentType: "image/svg+xml",
      }],
    });
  } finally {
    await client.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = safeText(body.action, 40);

    if (action === "resolve") {
      const slug = safeText(body.slug, 64);
      if (!/^[a-f0-9]{36}$/.test(slug)) throw new RequestError(404, "QR payment link was not found");
      const { data, error } = await admin
        .from("merchant_qr_payment_links")
        .select("qr_payment_link_id, merchant_id, product_reference, description, amount, currency, recurring, recurring_period, allow_quantity, min_quantity, max_quantity, status, merchants!inner(business_name, tax_mode, vat_rate)")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new RequestError(404, "QR payment link was not found");
      if (data.status !== "active") throw new RequestError(410, "This QR payment link is no longer active");
      const merchant = Array.isArray(data.merchants) ? data.merchants[0] : data.merchants;
      return json({
        ok: true,
        link: {
          qr_payment_link_id: data.qr_payment_link_id,
          merchant_id: data.merchant_id,
          business_name: merchant?.business_name || "PaySME Store",
          product_reference: data.product_reference,
          description: data.description,
          amount: Number(data.amount),
          currency: data.currency,
          recurring: data.recurring,
          recurring_period: data.recurring_period,
          allow_quantity: data.allow_quantity,
          min_quantity: data.min_quantity,
          max_quantity: data.max_quantity,
          tax_mode: merchant?.tax_mode || "not_registered",
          vat_rate: Number(merchant?.vat_rate || 0),
        },
      });
    }

    const merchant = await authenticatedMerchant(req);

    if (action === "bulk_create") {
      if (!merchant.tax_settings_completed_at) throw new RequestError(409, "Save Tax Settings before generating QR payment links");
      await requireActiveApiSubscription(merchant.merchant_id);
      if (!Array.isArray(body.products) || body.products.length < 1 || body.products.length > 500) {
        throw new RequestError(400, "Upload between 1 and 500 products at a time");
      }
      const rows = body.products.map((source: Record<string, unknown>, index: number) => {
        const productReference = safeText(source.product_reference || source.invoice_id, 100);
        const description = safeText(source.description || source.product_description, 240) || null;
        const amount = Number(source.amount);
        const allowQuantity = source.allow_quantity === true || String(source.allow_quantity || "").toLowerCase() === "true" || String(source.allow_quantity) === "1";
        const maxQuantity = allowQuantity ? Number(source.max_quantity || source.limit_per_qr_code) : 1;
        if (!productReference) throw new RequestError(400, `Row ${index + 2}: invoice_id is required`);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new RequestError(400, `Row ${index + 2}: amount must be between N$0.01 and N$1,000,000.00`);
        if (allowQuantity && (!Number.isInteger(maxQuantity) || maxQuantity < 2 || maxQuantity > 100)) throw new RequestError(400, `Row ${index + 2}: limit_per_qr_code must be between 2 and 100`);
        if (allowQuantity && Math.round(amount * 100) * maxQuantity / 100 > 1_000_000) throw new RequestError(400, `Row ${index + 2}: amount multiplied by the limit exceeds N$1,000,000.00`);
        return { merchant_id: merchant.merchant_id, slug: randomSlug(), product_reference: productReference, description, amount: Math.round(amount * 100) / 100, recurring: false, recurring_period: null, allow_quantity: allowQuantity, min_quantity: 1, max_quantity: maxQuantity };
      });
      const { data, error } = await admin.from("merchant_qr_payment_links").insert(rows).select("*");
      if (error) throw error;
      return json({ ok: true, links: (data || []).map((link) => ({ ...link, hosted_url: hostedUrl(link.slug) })) }, 201);
    }

    if (action === "create") {
      if (!merchant.tax_settings_completed_at) throw new RequestError(409, "Save Tax Settings before generating a QR payment link");
      await requireActiveApiSubscription(merchant.merchant_id);
      const productReference = safeText(body.product_reference, 100);
      const description = safeText(body.description, 240) || null;
      const amount = Number(body.amount);
      const recurring = body.recurring === true;
      const recurringPeriod = recurring ? safeText(body.recurring_period, 20) : null;
      const allowQuantity = body.allow_quantity === true;
      const maxQuantity = allowQuantity ? Number(body.max_quantity) : 1;
      if (!productReference) throw new RequestError(400, "Product reference is required");
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
        throw new RequestError(400, "Enter an amount between N$0.01 and N$1,000,000.00");
      }
      if (recurring && !["weekly", "monthly", "quarterly", "yearly"].includes(recurringPeriod || "")) {
        throw new RequestError(400, "Select a valid recurring period");
      }
      if (recurring && allowQuantity) {
        throw new RequestError(400, "Quantity selection is only available for non-recurring QR products");
      }
      if (allowQuantity && (!Number.isInteger(maxQuantity) || maxQuantity < 2 || maxQuantity > 100)) {
        throw new RequestError(400, "Maximum quantity must be between 2 and 100");
      }
      if (allowQuantity && Math.round(amount * 100) * maxQuantity / 100 > 1_000_000) {
        throw new RequestError(400, "Unit price multiplied by maximum quantity cannot exceed N$1,000,000.00");
      }

      let created: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        const slug = randomSlug();
        const { data, error } = await admin
          .from("merchant_qr_payment_links")
          .insert({
            merchant_id: merchant.merchant_id,
            slug,
            product_reference: productReference,
            description,
            amount: Math.round(amount * 100) / 100,
            recurring,
            recurring_period: recurringPeriod,
            allow_quantity: allowQuantity,
            min_quantity: 1,
            max_quantity: maxQuantity,
          })
          .select("*")
          .single();
        if (!error) created = data;
        else if (error.code !== "23505") throw error;
      }
      if (!created) throw new RequestError(503, "Could not create a unique QR payment link");
      const url = hostedUrl(String(created.slug));
      return json({ ok: true, link: { ...created, hosted_url: url, qr_svg: await qrSvg(url) } }, 201);
    }

    if (action === "list") {
      const { data: links, error } = await admin
        .from("merchant_qr_payment_links")
        .select("*")
        .eq("merchant_id", merchant.merchant_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (links || []).map((item) => item.qr_payment_link_id);
      let transactions: Array<Record<string, unknown>> = [];
      let basketItems: Array<Record<string, unknown>> = [];
      const basketTransactionByBasketId = new Map<string, Record<string, unknown>>();
      if (ids.length) {
        const result = await admin
          .from("transactions")
          .select("qr_payment_link_id, status, amount, amount_paid")
          .eq("merchant_id", merchant.merchant_id)
          .in("qr_payment_link_id", ids);
        if (result.error) throw result.error;
        transactions = result.data || [];

        const basketItemsResult = await admin
          .from("merchant_qr_basket_items")
          .select("basket_id, qr_payment_link_id, line_total_snapshot")
          .in("qr_payment_link_id", ids);
        if (basketItemsResult.error) throw basketItemsResult.error;
        basketItems = basketItemsResult.data || [];

        const basketIds = [...new Set(
          basketItems.map((item) => String(item.basket_id || "")).filter(Boolean),
        )];
        if (basketIds.length) {
          const basketTransactionsResult = await admin
            .from("transactions")
            .select("basket_id, status")
            .eq("merchant_id", merchant.merchant_id)
            .in("basket_id", basketIds);
          if (basketTransactionsResult.error) throw basketTransactionsResult.error;
          for (const transaction of basketTransactionsResult.data || []) {
            const basketId = String(transaction.basket_id || "");
            if (basketId) basketTransactionByBasketId.set(basketId, transaction);
          }
        }
      }
      return json({
        ok: true,
        links: (links || []).map((link) => {
          const related = transactions.filter((tx) => tx.qr_payment_link_id === link.qr_payment_link_id);
          const paid = related.filter((tx) => String(tx.status).toLowerCase() === "paid");
          const relatedBasketItems = basketItems.filter(
            (item) => item.qr_payment_link_id === link.qr_payment_link_id
              && basketTransactionByBasketId.has(String(item.basket_id || "")),
          );
          const paidBasketItems = relatedBasketItems.filter((item) =>
            String(basketTransactionByBasketId.get(String(item.basket_id || ""))?.status || "").toLowerCase() === "paid"
          );
          const hasPaymentHistory = related.length + relatedBasketItems.length > 0;
          const scheduledDeletionAt = !hasPaymentHistory && link.status === "inactive" && link.deactivated_at
            ? new Date(new Date(link.deactivated_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : null;
          return {
            ...link,
            hosted_url: hostedUrl(link.slug),
            has_payment_history: hasPaymentHistory,
            scheduled_deletion_at: scheduledDeletionAt,
            transaction_count: related.length + relatedBasketItems.length,
            paid_count: paid.length + paidBasketItems.length,
            total_received: paid.reduce((sum, tx) => {
              const paidAmount = Number(tx.amount_paid);
              return sum + (paidAmount > 0 ? paidAmount : Number(tx.amount || 0));
            }, 0) + paidBasketItems.reduce(
              (sum, item) => sum + Number(item.line_total_snapshot || 0),
              0,
            ),
          };
        }),
      });
    }

    const linkId = safeText(body.qr_payment_link_id, 64);
    if (!linkId) throw new RequestError(400, "QR payment link ID is required");
    const link = await ownedLink(merchant.merchant_id, linkId);
    const url = hostedUrl(link.slug);

    if (action === "get") {
      return json({ ok: true, link: { ...link, hosted_url: url, qr_svg: await qrSvg(url) } });
    }

    if (action === "set_status") {
      const status = body.status === "active" ? "active" : body.status === "inactive" ? "inactive" : "";
      if (!status) throw new RequestError(400, "Status must be active or inactive");
      if (status === "active") await requireActiveApiSubscription(merchant.merchant_id);
      const { data, error } = await admin
        .from("merchant_qr_payment_links")
        .update({
          status,
          deactivated_at: status === "inactive" ? new Date().toISOString() : null,
        })
        .eq("qr_payment_link_id", link.qr_payment_link_id)
        .eq("merchant_id", merchant.merchant_id)
        .select("*")
        .single();
      if (error) throw error;
      return json({ ok: true, link: { ...data, hosted_url: url } });
    }

    if (action === "delete") {
      const directTransactionsResult = await admin
        .from("transactions")
        .select("transaction_id", { count: "exact", head: true })
        .eq("merchant_id", merchant.merchant_id)
        .eq("qr_payment_link_id", link.qr_payment_link_id);
      if (directTransactionsResult.error) throw directTransactionsResult.error;

      const basketItemsResult = await admin
        .from("merchant_qr_basket_items")
        .select("basket_id")
        .eq("qr_payment_link_id", link.qr_payment_link_id);
      if (basketItemsResult.error) throw basketItemsResult.error;
      const basketIds = [...new Set(
        (basketItemsResult.data || []).map((item) => String(item.basket_id || "")).filter(Boolean),
      )];

      let hasBasketPaymentHistory = false;
      if (basketIds.length) {
        const basketTransactionsResult = await admin
          .from("transactions")
          .select("transaction_id")
          .eq("merchant_id", merchant.merchant_id)
          .in("basket_id", basketIds)
          .limit(1);
        if (basketTransactionsResult.error) throw basketTransactionsResult.error;
        hasBasketPaymentHistory = Boolean(basketTransactionsResult.data?.length);
      }

      if ((directTransactionsResult.count || 0) > 0 || hasBasketPaymentHistory) {
        throw new RequestError(
          409,
          "This QR product has payment history and must remain archived to protect transaction records",
        );
      }

      const { error } = await admin
        .from("merchant_qr_payment_links")
        .delete()
        .eq("qr_payment_link_id", link.qr_payment_link_id)
        .eq("merchant_id", merchant.merchant_id);
      if (error) throw error;
      return json({ ok: true, deleted_qr_payment_link_id: link.qr_payment_link_id });
    }

    if (action === "email") {
      const recipient = safeText(body.recipient_email, 254).toLowerCase() || merchant.email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        throw new RequestError(400, "Enter a valid recipient email address");
      }
      const svg = await qrSvg(url);
      await sendQrEmail(
        recipient,
        merchant.business_name,
        link.product_reference,
        Number(link.amount),
        url,
        svg,
        link.allow_quantity === true,
        Number(link.max_quantity || 1),
      );
      return json({ ok: true, recipient_email: recipient });
    }

    throw new RequestError(400, "Unsupported QR payment-link action");
  } catch (error) {
    console.error("merchant-qr-links error", error);
    const status = error instanceof RequestError ? error.status : 500;
    return json({ error: error instanceof Error ? error.message : "Unexpected QR payment-link error" }, status);
  }
});
