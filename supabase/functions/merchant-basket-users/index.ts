import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }

const normalizeMobile = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `264${digits.slice(1)}` : digits;
  if (!/^264(81|83|85)\d{7}$/.test(normalized)) throw new RequestError(400, "Enter a valid Namibian mobile number");
  return `+${normalized}`;
};

async function merchantAdmin(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await client.auth.getUser(token);
  if (!data.user) throw new RequestError(401, "Your session has expired");
  const { data: merchant } = await admin.from("merchants").select("merchant_id").eq("merchant_id", data.user.id).maybeSingle();
  if (!merchant) throw new RequestError(403, "Only the merchant administrator can manage tellers");
  return merchant.merchant_id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const merchantId = await merchantAdmin(req);
    const body = await req.json().catch(() => ({}));
    if (body.action === "list") {
      const { data, error } = await admin.from("merchant_qr_basket_users").select("basket_user_id, name, mobile_number, status, must_change_password, last_sign_in_at, created_at").eq("merchant_id", merchantId).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ ok: true, users: data || [] });
    }
    if (body.action === "create") {
      const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 100);
      const mobile = normalizeMobile(body.mobile_number);
      const password = String(body.temporary_password || "");
      if (name.length < 2) throw new RequestError(400, "Teller name is required");
      if (password.length < 8) throw new RequestError(400, "Temporary password must be at least 8 characters");
      const created = await admin.auth.admin.createUser({ phone: mobile, password, phone_confirm: true, user_metadata: { account_type: "qr_basket_teller", merchant_id: merchantId, name } });
      if (created.error || !created.data.user) throw new RequestError(400, created.error?.message || "Teller login could not be created");
      const { data, error } = await admin.from("merchant_qr_basket_users").insert({ merchant_id: merchantId, auth_user_id: created.data.user.id, name, mobile_number: mobile }).select("basket_user_id, name, mobile_number, status, must_change_password, created_at").single();
      if (error) { await admin.auth.admin.deleteUser(created.data.user.id); throw error; }
      return json({ ok: true, user: data }, 201);
    }
    const userId = String(body.basket_user_id || "");
    const { data: teller } = await admin.from("merchant_qr_basket_users").select("basket_user_id, auth_user_id").eq("basket_user_id", userId).eq("merchant_id", merchantId).maybeSingle();
    if (!teller) throw new RequestError(404, "Teller was not found");
    if (body.action === "set_status") {
      const status = body.status === "active" ? "active" : "inactive";
      const { error } = await admin.from("merchant_qr_basket_users").update({ status, updated_at: new Date().toISOString() }).eq("basket_user_id", userId);
      if (error) throw error;
      return json({ ok: true, basket_user_id: userId, status });
    }
    if (body.action === "reset_password") {
      const password = String(body.temporary_password || "");
      if (password.length < 8) throw new RequestError(400, "Temporary password must be at least 8 characters");
      const { error } = await admin.auth.admin.updateUserById(teller.auth_user_id, { password });
      if (error) throw error;
      await admin.from("merchant_qr_basket_users").update({ must_change_password: true, updated_at: new Date().toISOString() }).eq("basket_user_id", userId);
      return json({ ok: true, basket_user_id: userId });
    }
    throw new RequestError(400, "Unsupported teller action");
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected teller error" }, error instanceof RequestError ? error.status : 500);
  }
});
