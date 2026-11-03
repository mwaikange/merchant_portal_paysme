import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { decryptLesakaCredentials } from "../_shared/lesaka-credential-storage.ts";
import { pinFingerprint } from "../_shared/lesaka-4all.ts";
import { parseUatInventory, scrubUat } from "../_shared/lesaka-uat.ts";
import { encryptUatPin, uatState, UatError, uuid, type Campaign } from "../_shared/lesaka-uat-store.ts";
import { runUat } from "../_shared/lesaka-uat-runner.ts";
const env = (key: string) => Deno.env.get(key) || "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const text = await req.text();
    if (text.length > 180000) throw new UatError("Request is too large.", 413);
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!uuid(body.merchant_id)) throw new UatError("A valid merchant ID is required.");
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const service = Boolean(token && token === env("SUPABASE_SERVICE_ROLE_KEY"));
    let userId: string | null = null;
    if (!service) {
      if (!token) throw new UatError("Sign in to use the Lesaka test recorder.", 401);
      const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${token}` } } });
      const identity = await caller.auth.getUser(token);
      if (identity.error || !identity.data.user) throw new UatError("Sign in to use the Lesaka test recorder.", 401);
      userId = identity.data.user.id;
      const access = await caller.rpc("merchant_portal_allowed", { p_merchant_id: body.merchant_id, p_permission: "api" });
      if (access.error || access.data !== true) throw new UatError("Merchant API access is required.", 403);
    }
    const allowed = env("LESAKA_UAT_ENABLED") === "true" && env("LESAKA_4ALL_ENVIRONMENT") === "staging" && body.merchant_id === env("LESAKA_UAT_MERCHANT_ID");
    if (!allowed) {
      if (body.action === "status") return json({ ok: true, enabled: false });
      throw new UatError("The private staging recorder is not enabled for this merchant.", 403);
    }
    const merchantId = body.merchant_id;
    const setup = await admin.from("lesaka_merchant_credentials").select("encrypted_credentials,credential_version,store_id").eq("merchant_id", merchantId).eq("environment", "staging").maybeSingle();
    if (setup.error) throw setup.error;
    if (!setup.data) throw new UatError("Save the PaySME staging credentials first.", 409);
    let query = admin.from("lesaka_uat_campaigns").select("*").eq("merchant_id", merchantId);
    if (body.campaign_id) {
      if (!uuid(body.campaign_id)) throw new UatError("Invalid campaign.");
      query = query.eq("id", body.campaign_id);
    }
    const found = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (found.error) throw found.error;
    let campaign = found.data as Campaign | null;
    if (body.action === "create") {
      if (campaign && campaign.credential_version === setup.data.credential_version) return json({ ok: true, enabled: true, credentials_current: true, ...(await uatState(admin, campaign)) });
      const result = await admin.from("lesaka_uat_campaigns").insert({ merchant_id: merchantId, credential_version: setup.data.credential_version, created_by: userId }).select("*").single();
      if (result.error?.code === "23505") throw new UatError("A campaign was created in another window. Refresh results to continue.", 409);
      if (result.error) throw result.error;
      campaign = result.data as Campaign;
    }
    if (body.action === "status" || body.action === "create") return json({ ok: true, enabled: true, credentials_current: !campaign || campaign.credential_version === setup.data.credential_version, ...(await uatState(admin, campaign)) });
    if (!campaign) throw new UatError("Create the three-cycle campaign first.", 409);
    if (campaign.credential_version !== setup.data.credential_version) throw new UatError("Credentials changed. Create a new campaign before continuing.", 409);
    if (body.action === "import") {
      if (campaign.inventory_sha256) throw new UatError("Voucher allocation already exists for this campaign.", 409);
      if (typeof body.file_base64 !== "string" || body.file_base64.length > 150000) throw new UatError("Choose the supplied voucher text file.");
      const bytes = Uint8Array.from(atob(body.file_base64), ch => ch.charCodeAt(0));
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!env("LESAKA_UAT_INVENTORY_SHA256") || hash !== env("LESAKA_UAT_INVENTORY_SHA256")) throw new UatError("Choose the original approved voucher file. Ordering and the reserved half must remain unchanged.", 409);
      const parsed = parseUatInventory(new TextDecoder().decode(bytes));
      const items = [];
      for (const fixture of parsed) {
        const { pin, ...safe } = fixture;
        items.push({ ...safe, pin_fingerprint: await pinFingerprint(pin, env("LESAKA_4ALL_FINGERPRINT_SECRET")), encrypted_pin: fixture.allocation === "automated" ? await encryptUatPin(pin, campaign, fixture.fixture_id, env) : null });
      }
      const result = await admin.rpc("import_lesaka_uat_inventory", { p_campaign: campaign.id, p_sha256: hash, p_items: items });
      if (result.error) throw new UatError("Allocation could not be imported. Reload to check whether it already exists.", 409);
      return json({ ok: true, enabled: true, ...(await uatState(admin, campaign)) });
    }
    if (body.action === "note") {
      if (!userId || !uuid(body.execution_id) || typeof body.note !== "string" || !body.note.trim() || body.note.length > 2000) throw new UatError("Enter a manual observation of up to 2,000 characters.");
      const target = await admin.from("lesaka_uat_executions").select("id").eq("id", body.execution_id).eq("campaign_id", campaign.id).maybeSingle();
      if (target.error || !target.data) throw new UatError("Execution not found.", 404);
      const credentials = await decryptLesakaCredentials(setup.data.encrypted_credentials, merchantId, "staging", env);
      const note = scrubUat(body.note.trim(), [credentials.api_username, credentials.api_password]);
      const result = await admin.from("lesaka_uat_notes").insert({ execution_id: body.execution_id, created_by: userId, note });
      if (result.error) throw result.error;
      return json({ ok: true, enabled: true, ...(await uatState(admin, campaign)) });
    }
    if (body.action !== "run") throw new UatError("Unknown action.");
    return json({ ok: true, execution: await runUat(body, { admin, campaign, setup: setup.data, userId, service, env }) });
  } catch (error) {
    if (error instanceof UatError) return json({ ok: false, error: error.message }, error.status);
    // DB and provider details can echo PINs or credentials. Never log raw errors.
    return json({ ok: false, error: "Test recorder request failed. Reload and retain the original execution ID before retrying." }, 500);
  }
});
