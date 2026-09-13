import { Webhook } from "npm:standardwebhooks@1.0.0";

const SMSPORTAL_API_URL = "https://rest.smsportal.com/v3/BulkMessages";

type AuthSmsPayload = {
  user?: { phone?: string | null };
  sms?: { otp?: string | null };
};

const normalizePhone = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  if (/^0(81|83|85)\d{7}$/.test(digits)) return `264${digits.slice(1)}`;
  return digits;
};

const fail = (status: number, message: string) => new Response(JSON.stringify({ error: message }), {
  status,
  headers: { "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return fail(405, "Method not allowed");

  const hookSecret = Deno.env.get("AUTH_SEND_SMS_HOOK_SECRET")?.replace(/^v1,whsec_/, "");
  const clientId = Deno.env.get("SMSPORTAL_CLIENT_ID");
  const apiSecret = Deno.env.get("SMSPORTAL_API_SECRET");
  if (!hookSecret || !clientId || !apiSecret) return fail(500, "Authentication SMS is not configured");

  let payload: AuthSmsPayload;
  try {
    const verifier = new Webhook(hookSecret);
    payload = verifier.verify(await request.text(), Object.fromEntries(request.headers)) as AuthSmsPayload;
  } catch {
    return fail(401, "Invalid authentication hook signature");
  }

  const destination = normalizePhone(payload.user?.phone || "");
  const otp = payload.sms?.otp || "";
  if (!/^264(81|83|85)\d{7}$/.test(destination) || !/^\d{6,10}$/.test(otp)) {
    return fail(400, "Invalid authentication SMS payload");
  }

  const response = await fetch(SMSPORTAL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${apiSecret}`)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messages: [{
        destination,
        content: `Your PaySME verification code is ${otp}. It expires shortly. Never share this code.`,
      }],
    }),
  });

  if (!response.ok) {
    console.error("Authentication SMS provider rejected the request", response.status);
    return fail(502, "Authentication SMS could not be sent");
  }

  console.log("Authentication SMS accepted by provider");
  return new Response(null, { status: 200 });
});
