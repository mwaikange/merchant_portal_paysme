import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { encryptLesakaCredentials } from "../_shared/lesaka-credential-storage.ts";
import { LesakaError } from "../_shared/lesaka-4all.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const admin = createClient(supabaseUrl, serviceRoleKey);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const merchantId = typeof body.merchant_id === "string" ? body.merchant_id : "";
    const environment = Deno.env.get("LESAKA_4ALL_ENVIRONMENT") === "staging" ? "staging" : "production";
    if (!merchantId) return json({ error: "Merchant is required" }, 400);
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: identity, error: authError } = await caller.auth.getUser(token);
    if (authError || !identity.user) return json({ error: "Sign in to manage Lesaka credentials" }, 401);
    const { data: allowed, error: permissionError } = await caller.rpc("merchant_portal_allowed", { p_merchant_id: merchantId, p_permission: "api" });
    if (permissionError || allowed !== true) return json({ error: "You do not have permission to manage this merchant's API settings" }, 403);
    if (body.action !== "status" && body.environment !== environment) return json({ error: "Lesaka setup has changed. Reload this page before saving." }, 409);

    if (body.action === "save") {
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const storeId = typeof body.store_id === "string" ? body.store_id.trim() : "";
      if (!username || username.length > 512 || username.includes(":") || !password || password.length > 4096 || storeId.length > 128) {
        return json({ error: "Enter a valid Lesaka username and password. Store ID is optional." }, 400);
      }
      const encrypted = await encryptLesakaCredentials({ api_username: username, api_password: password }, merchantId, environment, key => Deno.env.get(key));
      const { error } = await admin.rpc("save_lesaka_merchant_credentials", {
        p_merchant_id: merchantId, p_environment: environment, p_credentials: encrypted, p_store_id: storeId || null,
      });
      if (error) {
        // Validation/DB diagnostics may include submitted values. Never log or
        // return them. SQL receives ciphertext only.
        const message = error.message?.includes("Resolve pending Lesaka")
          ? "Resolve pending Lesaka voucher payments before replacing credentials."
          : "Could not save Lesaka credentials. Please try again or contact support.";
        return json({ error: message }, 409);
      }
    } else if (body.action === "set_enabled") {
      if (typeof body.enabled !== "boolean") return json({ error: "enabled must be true or false" }, 400);
      const { data: saved, error: savedError } = await admin.from("lesaka_merchant_credentials")
        .select("credential_version").eq("merchant_id", merchantId).eq("environment", environment).maybeSingle();
      if (savedError) throw savedError;
      if (!saved) return json({ error: "Save the Lesaka username and password first" }, 409);
      const { error } = await admin.from("merchant_payment_facilitators").update({ enabled: body.enabled })
        .eq("merchant_id", merchantId).eq("provider_key", "kazang");
      if (error) throw error;
    } else if (body.action !== "status") return json({ error: "Unknown action" }, 400);

    // Readiness only: no endpoint ever returns the saved username or password.
    const { data: record, error: statusError } = await admin.from("lesaka_merchant_credentials")
      .select("credential_version, store_id, updated_at").eq("merchant_id", merchantId).eq("environment", environment).maybeSingle();
    const { data: facilitator, error: facilitatorError } = await admin.from("merchant_payment_facilitators")
      .select("enabled").eq("merchant_id", merchantId).eq("provider_key", "kazang").maybeSingle();
    if (statusError || facilitatorError) throw statusError || facilitatorError;
    return json({ ok: true, environment, configured: Boolean(record), store_id: record?.store_id || "", updated_at: record?.updated_at || null, enabled: facilitator?.enabled === true });
  } catch (error) {
    if (error instanceof LesakaError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Lesaka settings are unavailable. Please try again or contact support." }, 500);
  }
});
