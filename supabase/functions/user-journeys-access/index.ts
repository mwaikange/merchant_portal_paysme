const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const encoder = new TextEncoder();
const journeyHtml = await Deno.readTextFile(new URL("./journey.html", import.meta.url));
const visualJourneyHtml = await Deno.readTextFile(
  new URL("./visual-payment-journey.html", import.meta.url),
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
    },
  });

function encodeBase64Url(value: string) {
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
}

async function hmac(value: string, secret: string) {
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

async function digest(value: string) {
  const result = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function issueToken(secret: string, expiresAt: number) {
  const payload = encodeBase64Url(JSON.stringify({
    scope: "user_journeys",
    exp: expiresAt,
    nonce: crypto.randomUUID(),
  }));
  return `${payload}.${await hmac(payload, secret)}`;
}

async function validateToken(token: string, secret: string) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = await hmac(payload, secret);
  if (!constantTimeEqual(signature, expected)) return false;

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { scope?: string; exp?: number };
    return parsed.scope === "user_journeys" &&
      typeof parsed.exp === "number" &&
      Date.now() < parsed.exp;
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const password = Deno.env.get("USER_JOURNEYS_PASSWORD") || "";
  const masterPassword = Deno.env.get("USER_JOURNEYS_MASTER_PASSWORD") || "";
  const tokenSecret = Deno.env.get("USER_JOURNEYS_TOKEN_SECRET") || "";
  const expiryValue = Deno.env.get("USER_JOURNEYS_PASSWORD_EXPIRES_AT") || "";
  const passwordExpiresAt = Date.parse(expiryValue);

  if (!password || !masterPassword || tokenSecret.length < 32 || !Number.isFinite(passwordExpiresAt)) {
    console.error("User journeys access secrets are incomplete");
    return json({ error: "Protected page is not configured" }, 503);
  }

  const body = await request.json().catch(() => ({})) as {
    action?: string;
    password?: string;
    token?: string;
  };

  if (body.action === "unlock") {
    const suppliedDigest = await digest(String(body.password || ""));
    const expectedDigest = await digest(password);
    const masterDigest = await digest(masterPassword);
    const temporaryMatch = constantTimeEqual(suppliedDigest, expectedDigest);
    const masterMatch = constantTimeEqual(suppliedDigest, masterDigest);

    if (!temporaryMatch && !masterMatch) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return json({ error: "Incorrect password" }, 401);
    }

    if (temporaryMatch && Date.now() >= passwordExpiresAt) {
      return json({ error: "This temporary access password has expired" }, 410);
    }

    const sessionExpiresAt = Date.now() + 72 * 60 * 60 * 1000;
    const expiresAt = masterMatch ? sessionExpiresAt : Math.min(sessionExpiresAt, passwordExpiresAt);
    const token = await issueToken(tokenSecret, expiresAt);
    return json({
      ok: true,
      token,
      expires_at: new Date(expiresAt).toISOString(),
      html: journeyHtml,
      visual_html: visualJourneyHtml,
    });
  }

  if (body.action === "content") {
    if (!body.token || !(await validateToken(body.token, tokenSecret))) {
      return json({ error: "Access session is invalid or expired" }, 401);
    }
    return json({
      ok: true,
      expires_at: expiryValue,
      html: journeyHtml,
      visual_html: visualJourneyHtml,
    });
  }

  return json({ error: "Unsupported action" }, 400);
});
