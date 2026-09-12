const encoder = new TextEncoder();

export function normalizeGeneratedCode(value: string) {
  return value.trim().toUpperCase();
}

export async function hmacHex(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hashAccessCode(code: string, secret: string) {
  return hmacHex(`user-journeys-code:${normalizeGeneratedCode(code)}`, secret);
}

export function hashRequestAddress(address: string, secret: string) {
  return hmacHex(`user-journeys-ip:${address || "unknown"}`, secret);
}

export async function sha256Hex(value: string) {
  const result = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string) {
  const maximum = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < maximum; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
}

async function hmacBase64Url(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return encodeBase64Url(String.fromCharCode(...new Uint8Array(signature)));
}

export async function issueJourneyToken(secret: string, expiresAt: number) {
  const payload = encodeBase64Url(JSON.stringify({
    scope: "user_journeys",
    exp: expiresAt,
    nonce: crypto.randomUUID(),
  }));
  return `${payload}.${await hmacBase64Url(payload, secret)}`;
}

export async function validateJourneyToken(token: string, secret: string, now = Date.now()) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = await hmacBase64Url(payload, secret);
  if (!constantTimeEqual(signature, expected)) return false;
  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { scope?: string; exp?: number };
    return parsed.scope === "user_journeys" && typeof parsed.exp === "number" && now < parsed.exp;
  } catch {
    return false;
  }
}
