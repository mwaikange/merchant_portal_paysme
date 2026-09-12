import { validateJourneyToken } from "../_shared/user-journeys-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const pdf = await Deno.readFile(
  new URL("./PaySME-Vendor-Programme-PSP-Partnership.pdf", import.meta.url),
);

const pdfBase64 = (() => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < pdf.length; offset += chunkSize) {
    binary += String.fromCharCode(...pdf.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
})();

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
    },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const tokenSecret = Deno.env.get("USER_JOURNEYS_TOKEN_SECRET") || "";
  if (tokenSecret.length < 32) {
    console.error("PSP sponsor PDF token secret is incomplete");
    return json({ error: "Protected download is not configured" }, 503);
  }

  const body = await request.json().catch(() => ({})) as { token?: string };
  if (!body.token || !(await validateJourneyToken(body.token, tokenSecret))) {
    return json({ error: "Access session is invalid or expired" }, 401);
  }

  return json({
    ok: true,
    filename: "PaySME-Vendor-Programme-PSP-Partnership.pdf",
    content_type: "application/pdf",
    base64: pdfBase64,
  }, 200);
});
