import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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

const safeText = (value: unknown, max: number) =>
  String(value || "").trim().replace(/\s+/g, " ").slice(0, max);

const cleanSiteUrl = () =>
  String(Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://paysme.site")
    .replace(/\/+$/, "");

const hostedUrl = (slug: string) => `${cleanSiteUrl()}/b/${encodeURIComponent(slug)}`;

const validUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function authenticatedMerchant(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new RequestError(401, "Sign in to use QR Basket");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new RequestError(401, "Your session has expired");

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .select("merchant_id, business_name, email, tax_settings_completed_at")
    .eq("merchant_id", data.user.id)
    .maybeSingle();
  if (merchantError) throw merchantError;
  if (merchant) return { ...merchant, access_role: "merchant_admin" };

  const { data: teller, error: tellerError } = await admin
    .from("merchant_qr_basket_users")
    .select("basket_user_id, merchant_id, name, status, merchants!inner(business_name, email, tax_settings_completed_at)")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (tellerError) throw tellerError;
  if (!teller || teller.status !== "active") throw new RequestError(403, "This QR Basket teller login is inactive");
  const owner = Array.isArray(teller.merchants) ? teller.merchants[0] : teller.merchants;
  await admin.from("merchant_qr_basket_users").update({ last_sign_in_at: new Date().toISOString() }).eq("basket_user_id", teller.basket_user_id);
  return { merchant_id: teller.merchant_id, business_name: owner?.business_name, email: owner?.email, tax_settings_completed_at: owner?.tax_settings_completed_at, access_role: "basket_teller" };
}

async function refreshExpiredBasket(basketId: string) {
  const { error } = await admin.rpc("refresh_merchant_qr_basket", {
    p_basket_id: basketId,
  });
  if (error) throw error;
}

async function refreshMerchantExpiredBaskets(merchantId: string) {
  const { data, error } = await admin
    .from("merchant_qr_baskets")
    .select("basket_id")
    .eq("merchant_id", merchantId)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString())
    .limit(50);
  if (error) throw error;
  await Promise.all((data || []).map((basket) => refreshExpiredBasket(basket.basket_id)));
}

function serializeBasket(row: Record<string, unknown>) {
  const slug = String(row.slug || "");
  const items = Array.isArray(row.merchant_qr_basket_items)
    ? [...row.merchant_qr_basket_items].sort(
      (left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0),
    )
    : [];
  return {
    basket_id: row.basket_id,
    merchant_id: row.merchant_id,
    status: row.status,
    currency: row.currency,
    subtotal_amount: Number(row.subtotal_amount || 0),
    total_amount: Number(row.total_amount || 0),
    item_count: Number(row.item_count || 0),
    expires_at: row.expires_at,
    checkout_started_at: row.checkout_started_at,
    paid_at: row.paid_at,
    failed_at: row.failed_at,
    cancelled_at: row.cancelled_at,
    created_at: row.created_at,
    hosted_url: slug ? hostedUrl(slug) : null,
    items: items.map((item) => ({
      basket_item_id: item.basket_item_id,
      qr_payment_link_id: item.qr_payment_link_id,
      product_reference: item.product_reference_snapshot,
      description: item.description_snapshot,
      unit_price: Number(item.unit_price_snapshot),
      quantity: Number(item.quantity),
      line_total: Number(item.line_total_snapshot),
      currency: item.currency,
    })),
  };
}

async function ownedBasket(merchantId: string, basketId: string) {
  const { data, error } = await admin
    .from("merchant_qr_baskets")
    .select("*, merchant_qr_basket_items(*)")
    .eq("basket_id", basketId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new RequestError(404, "Basket was not found");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = safeText(body.action, 40);

    if (action === "resolve") {
      const slug = safeText(body.slug, 64);
      if (!/^[a-f0-9]{48}$/.test(slug)) throw new RequestError(404, "Basket was not found");

      const first = await admin
        .from("merchant_qr_baskets")
        .select("basket_id")
        .eq("slug", slug)
        .maybeSingle();
      if (first.error) throw first.error;
      if (!first.data) throw new RequestError(404, "Basket was not found");
      await refreshExpiredBasket(first.data.basket_id);

      const { data, error } = await admin
        .from("merchant_qr_baskets")
        .select("*, merchants!inner(business_name, tax_mode, vat_rate), merchant_qr_basket_items(*)")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new RequestError(404, "Basket was not found");

      const merchant = Array.isArray(data.merchants) ? data.merchants[0] : data.merchants;
      const basket = serializeBasket(data);
      const baseTotal = Number(basket.total_amount || 0);
      const rate = Number(merchant?.vat_rate || 0);
      const taxMode = String(merchant?.tax_mode || "not_registered");
      const vatAmount = taxMode === "vat_exclusive" ? Math.round(baseTotal * rate) / 100 : taxMode === "vat_inclusive" ? Math.round((baseTotal - baseTotal / (1 + rate / 100)) * 100) / 100 : 0;
      const grossAmount = taxMode === "vat_exclusive" ? Math.round((baseTotal + vatAmount) * 100) / 100 : baseTotal;
      return json({
        ok: true,
        basket: {
          ...basket,
          business_name: merchant?.business_name || "PaySME Store",
          checkout_started: Boolean(data.checkout_started_at),
          tax_mode: taxMode,
          vat_rate: rate,
          vat_amount: vatAmount,
          gross_amount: grossAmount,
        },
      });
    }

    const merchant = await authenticatedMerchant(req);

    if (action === "products") {
      const { data, error } = await admin
        .from("merchant_qr_payment_links")
        .select(
          "qr_payment_link_id, product_reference, description, amount, currency, allow_quantity, min_quantity, max_quantity, updated_at",
        )
        .eq("merchant_id", merchant.merchant_id)
        .eq("status", "active")
        .eq("recurring", false)
        .order("product_reference", { ascending: true });
      if (error) throw error;
      return json({
        ok: true,
        products: (data || []).map((product) => ({
          ...product,
          amount: Number(product.amount),
          min_quantity: Number(product.min_quantity || 1),
          max_quantity: product.allow_quantity ? Number(product.max_quantity || 1) : 1,
        })),
      });
    }

    if (action === "create") {
      if (!merchant.tax_settings_completed_at) throw new RequestError(409, "Save Tax Settings before generating a QR Basket paycode");
      const requestId = safeText(body.client_request_id, 64);
      if (!validUuid(requestId)) throw new RequestError(400, "A valid basket request ID is required");
      if (!Array.isArray(body.items)) throw new RequestError(400, "Select at least one product");

      const configuredTtl = Number(Deno.env.get("QR_BASKET_TTL_MINUTES") || 15);
      const ttlMinutes = Number.isInteger(configuredTtl)
        ? Math.min(60, Math.max(1, configuredTtl))
        : 15;
      const { data: basketId, error } = await admin.rpc("create_merchant_qr_basket", {
        p_merchant_id: merchant.merchant_id,
        p_client_request_id: requestId,
        p_items: body.items,
        p_ttl_minutes: ttlMinutes,
      });
      if (error) throw new RequestError(400, error.message);
      const basket = await ownedBasket(merchant.merchant_id, basketId);
      return json({ ok: true, basket: serializeBasket(basket) }, 201);
    }

    if (action === "list") {
      await refreshMerchantExpiredBaskets(merchant.merchant_id);
      const limit = Math.min(100, Math.max(1, Number(body.limit || 30)));
      const { data, error } = await admin
        .from("merchant_qr_baskets")
        .select("*, merchant_qr_basket_items(*)")
        .eq("merchant_id", merchant.merchant_id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({ ok: true, baskets: (data || []).map(serializeBasket) });
    }

    const basketId = safeText(body.basket_id, 64);
    if (!validUuid(basketId)) throw new RequestError(400, "A valid basket ID is required");

    if (action === "get" || action === "status") {
      await refreshExpiredBasket(basketId);
      const basket = await ownedBasket(merchant.merchant_id, basketId);
      return json({ ok: true, basket: serializeBasket(basket) });
    }

    if (action === "cancel") {
      const { error } = await admin.rpc("cancel_merchant_qr_basket", {
        p_basket_id: basketId,
        p_merchant_id: merchant.merchant_id,
      });
      if (error) throw new RequestError(409, error.message);
      const basket = await ownedBasket(merchant.merchant_id, basketId);
      return json({ ok: true, basket: serializeBasket(basket) });
    }

    throw new RequestError(400, "Unsupported QR Basket action");
  } catch (error) {
    console.error("merchant-qr-baskets error", error);
    const status = error instanceof RequestError ? error.status : 500;
    return json({
      error: error instanceof Error ? error.message : "Unexpected QR Basket error",
    }, status);
  }
});
