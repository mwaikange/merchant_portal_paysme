import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const merchantOrigin = (Deno.env.get("MERCHANT_PORTAL_URL") || "https://merchant.paysme.site").replace(/\/+$/, "");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const allowedOrigins = new Set([
  merchantOrigin,
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

const cors = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : merchantOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
};

const sha256 = async (value: unknown) => {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const cleanText = (value: unknown, max: number) => String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
const trustedIp = (req: Request) => cleanText(req.headers.get("cf-connecting-ip"), 80) || null;
const jwtPayload = (token: string) => {
  const value = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(value.padEnd(Math.ceil(value.length / 4) * 4, "=")));
};

type Actor = { userId: string; email: string; merchantId: string; role: "owner" | "admin" | "staff"; token: string };

async function actorFor(req: Request, merchantSelector?: string, allowStaff = false): Promise<Actor> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new RequestError(401, "Sign in to continue");
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new RequestError(401, "Your session has expired");

  let ownerQuery = admin.from("merchants").select("merchant_id").eq("merchant_id", data.user.id);
  if (merchantSelector) ownerQuery = ownerQuery.eq("merchant_id", merchantSelector);
  const { data: owned } = await ownerQuery.maybeSingle();
  if (owned) return { userId: data.user.id, email: data.user.email || "", merchantId: owned.merchant_id, role: "owner", token };

  const { data: membership, error: membershipError } = await admin
    .from("merchant_memberships")
    .select("merchant_id,role,status")
    .eq("user_id", data.user.id)
    .eq("status", "active")
    .in("role", allowStaff ? ["owner", "admin", "staff"] : ["owner", "admin"])
    .eq(merchantSelector ? "merchant_id" : "status", merchantSelector || "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new RequestError(403, "Only the merchant owner or an administrator can manage security");
  return { userId: data.user.id, email: data.user.email || "", merchantId: membership.merchant_id, role: membership.role as Actor["role"], token };
}

async function audit(actor: Actor, req: Request, action: string, result: "success" | "denied" | "failed", summary: Record<string, unknown> = {}) {
  await admin.from("merchant_security_audit").insert({
    merchant_id: actor.merchantId,
    actor_user_id: actor.userId,
    action,
    result,
    source_ip: trustedIp(req),
    summary,
  });
}

async function networkAllowed(merchantId: string, ip: string | null) {
  if (!ip) return false;
  const { data, error } = await admin.rpc("merchant_network_entries_allow", { p_merchant_id: merchantId, p_ip: ip });
  if (error) throw error;
  return Boolean(data);
}

async function ensureCurrentAccess(actor: Actor, req: Request) {
  const { data: settings, error } = await admin
    .from("merchant_security_settings")
    .select("network_restrictions_enabled")
    .eq("merchant_id", actor.merchantId)
    .single();
  if (error) throw error;
  if (settings.network_restrictions_enabled && !(await networkAllowed(actor.merchantId, trustedIp(req)))) {
    await audit(actor, req, "portal_access", "denied", { reason: "network_not_allowed" });
    throw new RequestError(403, "This connection is not approved for the merchant portal");
  }
}

async function context(actor: Actor, req: Request) {
  await ensureCurrentAccess(actor, req);
  const [{ data: settings, error: settingsError }, { data: networks, error: networkError }, { data: staff, error: staffError }, { data: activity, error: activityError }] = await Promise.all([
    admin.from("merchant_security_settings").select("network_restrictions_enabled,updated_at").eq("merchant_id", actor.merchantId).single(),
    admin.from("merchant_approved_networks").select("id,label,network,created_by,created_at,updated_at").eq("merchant_id", actor.merchantId).order("created_at"),
    admin.from("merchant_memberships").select("id,user_id,email,full_name,role,status,invitation_expires_at,created_at,updated_at").eq("merchant_id", actor.merchantId).neq("role", "owner").order("created_at"),
    admin.from("merchant_security_audit").select("id,actor_user_id,action,result,source_ip,summary,created_at").eq("merchant_id", actor.merchantId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (settingsError) throw settingsError;
  if (networkError) throw networkError;
  if (staffError) throw staffError;
  if (activityError) throw activityError;

  const actorIds = Array.from(new Set([...(networks || []).map((row) => row.created_by), ...(activity || []).map((row) => row.actor_user_id)].filter(Boolean)));
  const { data: people } = actorIds.length
    ? await admin.from("merchant_memberships").select("user_id,full_name,email").eq("merchant_id", actor.merchantId).in("user_id", actorIds)
    : { data: [] as Array<{ user_id: string; full_name: string; email: string }> };
  const names = new Map((people || []).map((person) => [person.user_id, person.full_name || person.email]));
  names.set(actor.merchantId, "Merchant owner");

  return {
    role: actor.role,
    currentIp: trustedIp(req),
    settings,
    networks: (networks || []).map((row) => ({ ...row, creator_name: names.get(row.created_by) || "Merchant administrator" })),
    staff: staff || [],
    activity: (activity || []).map((row) => ({ ...row, actor_name: row.actor_user_id ? names.get(row.actor_user_id) || "Merchant administrator" : "PaySME support" })),
  };
}

async function verifyAndApprove(actor: Actor, req: Request, body: Record<string, unknown>) {
  await ensureCurrentAccess(actor, req);
  const factorId = cleanText(body.factorId, 100);
  const challengeId = cleanText(body.challengeId, 100);
  const code = cleanText(body.code, 12);
  const action = cleanText(body.approvedAction, 80);
  const payload = body.payload ?? {};
  if (!factorId || !challengeId || !/^\d{6,8}$/.test(code) || !action) throw new RequestError(400, "MFA verification details are incomplete");

  const response = await fetch(`${supabaseUrl}/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, {
    method: "POST",
    headers: { "apikey": anonKey, "authorization": `Bearer ${actor.token}`, "content-type": "application/json" },
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
  const verified = await response.json().catch(() => ({}));
  if (!response.ok || !verified?.access_token) {
    await audit(actor, req, action, "denied", { reason: "mfa_verification_failed" });
    throw new RequestError(401, "The MFA code is invalid or expired");
  }

  const elevatedClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: elevatedUser, error: elevatedError } = await elevatedClient.auth.getUser(verified.access_token);
  if (elevatedError || elevatedUser.user?.id !== actor.userId) throw new RequestError(401, "MFA verification did not match this user");

  const payloadHash = await sha256(payload);
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const { data: approval, error } = await admin.from("merchant_action_approvals").insert({
    merchant_id: actor.merchantId,
    user_id: actor.userId,
    action,
    payload_hash: payloadHash,
    source_ip: trustedIp(req),
    expires_at: expiresAt,
  }).select("id,expires_at").single();
  if (error) throw error;
  return { approvalId: approval.id, expiresAt: approval.expires_at, session: { access_token: verified.access_token, refresh_token: verified.refresh_token } };
}

async function consumeApproval(actor: Actor, req: Request, approvalId: string, action: string, payload: unknown) {
  const payloadHash = await sha256(payload);
  const { data, error } = await admin.from("merchant_action_approvals")
    .update({ used_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("merchant_id", actor.merchantId)
    .eq("user_id", actor.userId)
    .eq("action", action)
    .eq("payload_hash", payloadHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    await audit(actor, req, action, "denied", { reason: "approval_invalid_expired_or_used" });
    throw new RequestError(403, "This MFA approval is invalid, expired, already used, or does not match the proposed change");
  }
}

async function mutate(actor: Actor, req: Request, body: Record<string, unknown>) {
  await ensureCurrentAccess(actor, req);
  const action = cleanText(body.mutation, 80);
  const approvalId = cleanText(body.approvalId, 100);
  const payload = (body.payload && typeof body.payload === "object" ? body.payload : {}) as Record<string, unknown>;
  if (!action || !approvalId) throw new RequestError(400, "A fresh MFA approval is required");
  await consumeApproval(actor, req, approvalId, action, payload);
  const ip = trustedIp(req);

  if (action === "network.add") {
    const label = cleanText(payload.label, 80);
    const network = cleanText(payload.network, 80);
    if (!label || !network) throw new RequestError(400, "Network label and IP/CIDR are required");
    const { error } = await admin.from("merchant_approved_networks").insert({ merchant_id: actor.merchantId, label, network, created_by: actor.userId });
    if (error) throw new RequestError(400, error.message);
  } else if (action === "network.edit") {
    const id = cleanText(payload.id, 100), label = cleanText(payload.label, 80), network = cleanText(payload.network, 80);
    const { data: settings } = await admin.from("merchant_security_settings").select("network_restrictions_enabled").eq("merchant_id", actor.merchantId).single();
    if (settings?.network_restrictions_enabled) {
      const { data: safe, error: safeError } = await admin.rpc("merchant_network_change_keeps_access", { p_merchant_id: actor.merchantId, p_ip: ip, p_excluded_id: id, p_replacement: network });
      if (safeError) throw new RequestError(400, "Enter a valid IPv4, IPv6, or CIDR network");
      if (!safe) throw new RequestError(409, "This change would lock out the current administrator");
    }
    const { error } = await admin.from("merchant_approved_networks").update({ label, network }).eq("merchant_id", actor.merchantId).eq("id", id);
    if (error) throw new RequestError(400, error.message);
  } else if (action === "network.remove") {
    const id = cleanText(payload.id, 100);
    const { data: settings } = await admin.from("merchant_security_settings").select("network_restrictions_enabled").eq("merchant_id", actor.merchantId).single();
    if (settings?.network_restrictions_enabled) {
      const { data: safe } = await admin.rpc("merchant_network_change_keeps_access", { p_merchant_id: actor.merchantId, p_ip: ip, p_excluded_id: id, p_replacement: null });
      if (!safe) throw new RequestError(409, "Removing this network would lock out the current administrator. Add a matching network first");
    }
    const { error } = await admin.from("merchant_approved_networks").delete().eq("merchant_id", actor.merchantId).eq("id", id);
    if (error) throw error;
  } else if (action === "network.toggle") {
    const enabled = payload.enabled === true;
    if (enabled && !(await networkAllowed(actor.merchantId, ip))) throw new RequestError(409, "Add a network matching the current public IP before enabling restrictions");
    const { error } = await admin.from("merchant_security_settings").update({ network_restrictions_enabled: enabled, updated_by: actor.userId }).eq("merchant_id", actor.merchantId);
    if (error) throw error;
  } else if (action === "staff.invite") {
    const email = cleanText(payload.email, 254).toLowerCase(), fullName = cleanText(payload.fullName, 120), role = payload.role === "admin" ? "admin" : "staff";
    if (!/^\S+@\S+\.\S+$/.test(email) || !fullName) throw new RequestError(400, "A valid name and email are required");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    const existingUser = users.users.find((candidate) => candidate.email?.toLowerCase() === email);
    const { data: membership, error: reserveError } = await admin.from("merchant_memberships").insert({ merchant_id: actor.merchantId, user_id: existingUser?.id || null, email, full_name: fullName, role, status: "pending", invited_by: actor.userId, invitation_expires_at: expiresAt }).select("id").single();
    if (reserveError) throw new RequestError(409, reserveError.message);
    let invitedUserId = existingUser?.id || null;
    let inviteError: Error | null = null;
    if (existingUser) {
      const mailer = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
      const result = await mailer.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${merchantOrigin}/auth?invitation=true&existing=true&merchant=${encodeURIComponent(actor.merchantId)}` } });
      inviteError = result.error;
    } else {
      const result = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${merchantOrigin}/auth?invitation=true&merchant=${encodeURIComponent(actor.merchantId)}`,
        data: { merchant_membership_id: membership.id, merchant_id: actor.merchantId, full_name: fullName },
      });
      inviteError = result.error;
      invitedUserId = result.data.user?.id || null;
    }
    if (inviteError || !invitedUserId) {
      await admin.from("merchant_memberships").delete().eq("id", membership.id);
      throw new RequestError(400, inviteError?.message || "Invitation could not be sent");
    }
    await admin.from("merchant_memberships").update({ user_id: invitedUserId }).eq("id", membership.id);
  } else if (action === "staff.resend") {
    const id = cleanText(payload.id, 100);
    const { data: member } = await admin.from("merchant_memberships").select("email,full_name,status,user_id").eq("merchant_id", actor.merchantId).eq("id", id).neq("role", "owner").single();
    if (!member || member.status !== "pending") throw new RequestError(409, "Only a pending invitation can be resent");
    const error = member.user_id
      ? (await createClient(supabaseUrl, anonKey, { auth: { persistSession: false } }).auth.signInWithOtp({ email: member.email, options: { shouldCreateUser: false, emailRedirectTo: `${merchantOrigin}/auth?invitation=true&existing=true&merchant=${encodeURIComponent(actor.merchantId)}` } })).error
      : (await admin.auth.admin.inviteUserByEmail(member.email, { redirectTo: `${merchantOrigin}/auth?invitation=true&merchant=${encodeURIComponent(actor.merchantId)}`, data: { merchant_membership_id: id, merchant_id: actor.merchantId, full_name: member.full_name } })).error;
    if (error) throw new RequestError(400, error.message);
    await admin.from("merchant_memberships").update({ invitation_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), invited_by: actor.userId }).eq("id", id);
  } else if (["staff.suspend", "staff.reactivate", "staff.role"].includes(action)) {
    const id = cleanText(payload.id, 100);
    const changes = action === "staff.role" ? { role: payload.role === "admin" ? "admin" : "staff" } : { status: action === "staff.suspend" ? "suspended" : "active" };
    const { data, error } = await admin.from("merchant_memberships").update(changes).eq("merchant_id", actor.merchantId).eq("id", id).neq("role", "owner").neq("user_id", actor.userId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new RequestError(409, "This staff account cannot be changed");
  } else if (action === "staff.remove") {
    const id = cleanText(payload.id, 100);
    const { data, error } = await admin.from("merchant_memberships").delete().eq("merchant_id", actor.merchantId).eq("id", id).neq("role", "owner").neq("user_id", actor.userId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new RequestError(409, "This staff account cannot be removed");
  } else {
    throw new RequestError(400, "Unsupported security change");
  }

  await audit(actor, req, action, "success", { change: payload });
  return await context(actor, req);
}

async function recordMfaChange(actor: Actor, req: Request, body: Record<string, unknown>) {
  await ensureCurrentAccess(actor, req);
  const event = cleanText(body.event, 40);
  if (!["mfa.enrolled", "mfa.removed", "mfa.replaced"].includes(event)) throw new RequestError(400, "Unsupported MFA event");
  const payload = jwtPayload(actor.token);
  if (payload?.aal !== "aal2") throw new RequestError(403, "Verified MFA is required");
  await audit(actor, req, event, "success", { factor_type: body.factorType === "phone" ? "phone" : "totp" });
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  let actor: Actor | null = null;
  let requestedAction = "";
  try {
    if (req.method !== "POST") throw new RequestError(405, "Method not allowed");
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = cleanText(body.action, 40);
    requestedAction = action;
    actor = await actorFor(req, cleanText(body.merchantId, 100) || undefined, action === "mfa-audit");
    if (action === "context") return json(req, await context(actor, req));
    if (action === "verify-and-approve") return json(req, await verifyAndApprove(actor, req, body));
    if (action === "mutate") return json(req, await mutate(actor, req, body));
    if (action === "mfa-audit") return json(req, await recordMfaChange(actor, req, body));
    throw new RequestError(400, "Unknown action");
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    if (actor && requestedAction === "mutate") {
      await audit(actor, req, "security_change", "failed", {
        reason: error instanceof Error ? error.message.slice(0, 160) : "Security change failed",
      }).catch(() => undefined);
    }
    console.error("merchant-security", status, error instanceof Error ? error.message : "Unknown error");
    return json(req, { error: error instanceof Error ? error.message : "Security request failed" }, status);
  }
});
