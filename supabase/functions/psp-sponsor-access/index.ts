import { createClient } from "npm:@supabase/supabase-js@2.56.0";
import {
  constantTimeEqual,
  hashAccessCode,
  hashRequestAddress,
  issueJourneyToken,
  sha256Hex,
  validateJourneyToken,
} from "../_shared/user-journeys-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const pspSponsorHtml = await Deno.readTextFile(new URL("./psp-sponsor.html", import.meta.url));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, private" },
});
const delayInvalidAttempt = () => new Promise((resolve) => setTimeout(resolve, 500));

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const password = Deno.env.get("USER_JOURNEYS_PASSWORD") || "";
  const masterPassword = Deno.env.get("USER_JOURNEYS_MASTER_PASSWORD") || "";
  const tokenSecret = Deno.env.get("USER_JOURNEYS_TOKEN_SECRET") || "";
  const expiryValue = Deno.env.get("USER_JOURNEYS_PASSWORD_EXPIRES_AT") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const passwordExpiresAt = Date.parse(expiryValue);

  if (!password || !masterPassword || tokenSecret.length < 32 || !Number.isFinite(passwordExpiresAt)) {
    console.error("User journeys access secrets are incomplete");
    return json({ error: "Protected page is not configured" }, 503);
  }

  const service = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await hashRequestAddress(address, tokenSecret);
  const body = await request.json().catch(() => ({})) as {
    action?: string;
    password?: string;
    token?: string;
  };

  if (body.action === "unlock") {
    const rawPassword = String(body.password || "");
    if (service) {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { count } = await service.from("user_journey_access_audit_log")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .in("action", ["unlock_failed", "unlock_rate_limited"])
        .gte("created_at", since);
      if ((count ?? 0) >= 15) {
        await delayInvalidAttempt();
        await service.from("user_journey_access_audit_log").insert({
          action: "unlock_rate_limited",
          success: false,
          ip_hash: ipHash,
          metadata: { protected_page: "psp_sponsor" },
        });
        return json({ error: "Too many attempts. Try again later." }, 429);
      }
    }

    const suppliedDigest = await sha256Hex(rawPassword);
    const temporaryMatch = constantTimeEqual(suppliedDigest, await sha256Hex(password));
    const masterMatch = constantTimeEqual(suppliedDigest, await sha256Hex(masterPassword));
    let databaseCode: { id: string; expires_at: string } | null = null;

    if (!temporaryMatch && !masterMatch && service) {
      const suppliedCodeHash = await hashAccessCode(rawPassword, tokenSecret);
      const nowIso = new Date().toISOString();
      const { data: activeCodes, error: lookupError } = await service.from("user_journey_access_codes")
        .select("id,code_hash,expires_at")
        .is("revoked_at", null)
        .gt("expires_at", nowIso)
        .limit(1000);
      if (lookupError) console.error("User journeys code lookup failed", lookupError.code);
      let matchedId: string | null = null;
      for (const candidate of activeCodes ?? []) {
        const matches = constantTimeEqual(suppliedCodeHash, candidate.code_hash);
        if (matches) matchedId = candidate.id;
      }
      if (matchedId) {
        const { data: consumed, error: consumeError } = await service.rpc(
          "consume_user_journey_access_code",
          { p_code_id: matchedId },
        );
        if (consumeError) console.error("User journeys code consumption failed", consumeError.code);
        const row = Array.isArray(consumed) ? consumed[0] : null;
        if (row) databaseCode = { id: row.id, expires_at: row.expires_at };
      }
    }

    if (!temporaryMatch && !masterMatch && !databaseCode) {
      await delayInvalidAttempt();
      if (service) {
        await service.from("user_journey_access_audit_log").insert({
          action: "unlock_failed",
          success: false,
          ip_hash: ipHash,
          metadata: { reason: "invalid_or_inactive_code", protected_page: "psp_sponsor" },
        });
      }
      return json({ error: "Incorrect password" }, 401);
    }
    if (temporaryMatch && Date.now() >= passwordExpiresAt) {
      if (service) {
        await service.from("user_journey_access_audit_log").insert({
          action: "unlock_failed",
          success: false,
          ip_hash: ipHash,
          metadata: { reason: "environment_temporary_expired", protected_page: "psp_sponsor" },
        });
      }
      return json({ error: "This temporary access password has expired" }, 410);
    }

    const sessionExpiresAt = Date.now() + 72 * 60 * 60 * 1000;
    const expiresAt = temporaryMatch
      ? Math.min(sessionExpiresAt, passwordExpiresAt)
      : databaseCode
      ? Math.min(sessionExpiresAt, Date.parse(databaseCode.expires_at))
      : sessionExpiresAt;
    const token = await issueJourneyToken(tokenSecret, expiresAt);
    if (service) {
      const accessLevel = databaseCode
        ? "database_code"
        : masterMatch
        ? "environment_master"
        : "environment_temporary";
      const { error: auditError } = await service.from("user_journey_access_audit_log").insert({
        action: "unlock_success",
        success: true,
        code_id: databaseCode?.id ?? null,
        ip_hash: ipHash,
        metadata: { access_level: accessLevel, protected_page: "psp_sponsor" },
      });
      if (auditError) return json({ error: "Access audit could not be recorded" }, 503);
    }
    return json({
      ok: true,
      token,
      expires_at: new Date(expiresAt).toISOString(),
      html: pspSponsorHtml,
    });
  }

  if (body.action === "content") {
    if (!body.token || !(await validateJourneyToken(body.token, tokenSecret))) {
      return json({ error: "Access session is invalid or expired" }, 401);
    }
    return json({ ok: true, html: pspSponsorHtml });
  }

  return json({ error: "Unsupported action" }, 400);
});
