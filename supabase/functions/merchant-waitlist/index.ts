import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const notificationRecipients = [
  "mwaikange@gmail.com",
  "llewellyn@mwaikange.com",
  "administrator@paysme.site",
];

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

const cleanText = (value: unknown, max: number) =>
  String(value || "").trim().replace(/\s+/g, " ").slice(0, max);

const escapeHtml = (value: unknown) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendNotification(
  signup: {
    key_person_name: string;
    company_name: string;
    industry: string;
    town: string;
    email: string;
    mobile: string | null;
    created_at: string;
  },
  waitlistCount: number,
) {
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const fromEmail = Deno.env.get("SMTP_FROM_EMAIL");
  if (!host || !user || !password || !fromEmail) {
    throw new Error("SMTP credentials are not configured");
  }

  const html = `<!doctype html>
    <html>
      <body style="margin:0;background:#f3f4ef;padding:28px;font-family:Arial,sans-serif;color:#172018;">
        <div style="max-width:640px;margin:0 auto;overflow:hidden;border-radius:18px;background:#ffffff;box-shadow:0 12px 35px rgba(23,32,24,.12);">
          <div style="background:#19231c;padding:26px 30px;color:#ffffff;">
            <p style="margin:0 0 8px;color:#f6c431;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">PaySME Launch Waitlist</p>
            <h1 style="margin:0;font-size:25px;">New merchant signup</h1>
          </div>
          <div style="padding:28px 30px;">
            <div style="margin-bottom:24px;border-radius:14px;background:#fff8dc;padding:18px;text-align:center;">
              <div style="font-size:13px;color:#6b5a11;">Current waitlist</div>
              <div style="font-size:38px;font-weight:800;color:#172018;">${waitlistCount}</div>
              <div style="font-size:13px;color:#6b5a11;">potential merchant${waitlistCount === 1 ? "" : "s"}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:10px 0;color:#6b7280;">Key person</td><td style="padding:10px 0;font-weight:700;">${escapeHtml(signup.key_person_name)}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Company</td><td style="padding:10px 0;font-weight:700;">${escapeHtml(signup.company_name)}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Industry</td><td style="padding:10px 0;">${escapeHtml(signup.industry)}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Town</td><td style="padding:10px 0;">${escapeHtml(signup.town)}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Email</td><td style="padding:10px 0;"><a href="mailto:${escapeHtml(signup.email)}" style="color:#177e70;">${escapeHtml(signup.email)}</a></td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Mobile</td><td style="padding:10px 0;">${escapeHtml(signup.mobile || "Not supplied")}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Joined</td><td style="padding:10px 0;">${escapeHtml(new Date(signup.created_at).toLocaleString("en-NA", { timeZone: "Africa/Windhoek" }))}</td></tr>
            </table>
          </div>
        </div>
      </body>
    </html>`;

  for (const recipient of notificationRecipients) {
    const client = new SMTPClient({
      connection: {
        hostname: host,
        port: Number(Deno.env.get("SMTP_PORT") || 587),
        tls: true,
        auth: { username: user, password },
      },
    });
    try {
      await client.send({
        from: `${Deno.env.get("SMTP_FROM_NAME") || "PaySME"} <${fromEmail}>`,
        to: recipient,
        subject: `PaySME waitlist #${waitlistCount}: ${signup.company_name}`,
        html,
      });
    } catch (sendError) {
      try {
        await client.close();
      } catch {
        // Preserve the SMTP send error instead of masking it with cleanup.
      }
      throw sendError;
    }
    try {
      await client.close();
    } catch (closeError) {
      console.warn("merchant-waitlist SMTP connection was already closed", closeError);
    }
  }
}

async function sendMerchantAccountNotification(signup: {
  merchant_id: string;
  vendor_id: string;
  email: string;
  business_name: string;
  mobile_number: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  business_type: string | null;
  industry: string | null;
}) {
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const fromEmail = Deno.env.get("SMTP_FROM_EMAIL");
  if (!host || !user || !password || !fromEmail) {
    throw new Error("SMTP credentials are not configured");
  }

  const keyPerson = [signup.first_name, signup.last_name].filter(Boolean).join(" ") || "Not supplied";
  const html = `<!doctype html>
    <html>
      <body style="margin:0;background:#f3f4ef;padding:28px;font-family:Arial,sans-serif;color:#172018;">
        <div style="max-width:640px;margin:0 auto;overflow:hidden;border-radius:18px;background:#ffffff;box-shadow:0 12px 35px rgba(23,32,24,.12);">
          <div style="background:#19231c;padding:26px 30px;color:#ffffff;">
            <p style="margin:0 0 8px;color:#f6c431;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">PaySME Merchant Portal</p>
            <h1 style="margin:0;font-size:25px;">New merchant account signup</h1>
          </div>
          <div style="padding:28px 30px;">
            <div style="margin-bottom:24px;border-radius:14px;background:#fff8dc;padding:18px;text-align:center;">
              <div style="font-size:13px;color:#6b5a11;">Merchant ID</div>
              <div style="margin-top:5px;font-size:22px;font-weight:800;color:#172018;">${escapeHtml(signup.vendor_id)}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:10px 0;color:#6b7280;">Key person</td><td style="padding:10px 0;font-weight:700;">${escapeHtml(keyPerson)}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Business</td><td style="padding:10px 0;font-weight:700;">${escapeHtml(signup.business_name)}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Business type</td><td style="padding:10px 0;">${escapeHtml(signup.business_type || "Not supplied")}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Industry</td><td style="padding:10px 0;">${escapeHtml(signup.industry || "Not supplied")}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Email</td><td style="padding:10px 0;"><a href="mailto:${escapeHtml(signup.email)}" style="color:#177e70;">${escapeHtml(signup.email)}</a></td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Mobile</td><td style="padding:10px 0;">${escapeHtml(signup.mobile_number || "Not supplied")}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Account UUID</td><td style="padding:10px 0;font-family:monospace;font-size:12px;">${escapeHtml(signup.merchant_id)}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Signed up</td><td style="padding:10px 0;">${escapeHtml(new Date(signup.created_at).toLocaleString("en-NA", { timeZone: "Africa/Windhoek" }))}</td></tr>
            </table>
          </div>
        </div>
      </body>
    </html>`;

  for (const recipient of notificationRecipients) {
    const client = new SMTPClient({
      connection: {
        hostname: host,
        port: Number(Deno.env.get("SMTP_PORT") || 587),
        tls: true,
        auth: { username: user, password },
      },
    });
    try {
      await client.send({
        from: `${Deno.env.get("SMTP_FROM_NAME") || "PaySME"} <${fromEmail}>`,
        to: recipient,
        subject: `New PaySME merchant account: ${signup.business_name}`,
        html,
      });
    } finally {
      try {
        await client.close();
      } catch (closeError) {
        console.warn("merchant signup SMTP connection was already closed", closeError);
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();

    if (cleanText(body.action, 60) === "merchant_account_signup") {
      const merchantId = cleanText(body.merchant_id, 36);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(merchantId)) {
        throw new RequestError(400, "Enter a valid merchant ID");
      }

      const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(merchantId);
      if (authUserError) throw authUserError;
      const appMetadata = authUserData.user.app_metadata || {};
      const notificationStatus = appMetadata.merchant_signup_notification_status;
      if (notificationStatus === "sent") {
        return json({ ok: true, already_notified: true });
      }
      if (notificationStatus === "pending") {
        const pendingSince = new Date(appMetadata.merchant_signup_notification_updated_at || "").getTime();
        if (Number.isFinite(pendingSince) && pendingSince > Date.now() - 5 * 60 * 1000) {
          return json({ ok: true, notification_pending: true });
        }
      }

      const notificationNow = new Date().toISOString();
      const { error: claimError } = await admin.auth.admin.updateUserById(merchantId, {
        app_metadata: {
          ...appMetadata,
          merchant_signup_notification_status: "pending",
          merchant_signup_notification_error: null,
          merchant_signup_notification_updated_at: notificationNow,
        },
      });
      if (claimError) throw claimError;

      const { data: merchant, error: merchantError } = await admin
        .from("merchants")
        .select("merchant_id, vendor_id, email, business_name, mobile_number, created_at")
        .eq("merchant_id", merchantId)
        .single();
      if (merchantError) throw merchantError;

      const { data: kyc, error: kycError } = await admin
        .from("kyc_submissions")
        .select("first_name, last_name, business_type, industry")
        .eq("user_id", merchantId)
        .maybeSingle();
      if (kycError) throw kycError;

      try {
        await sendMerchantAccountNotification({
          ...merchant,
          first_name: kyc?.first_name || null,
          last_name: kyc?.last_name || null,
          business_type: kyc?.business_type || null,
          industry: kyc?.industry || null,
        });
        const sentAt = new Date().toISOString();
        await admin.auth.admin.updateUserById(merchantId, {
          app_metadata: {
            ...appMetadata,
            merchant_signup_notification_status: "sent",
            merchant_signup_notification_sent_at: sentAt,
            merchant_signup_notification_error: null,
            merchant_signup_notification_updated_at: sentAt,
          },
        });
        return json({ ok: true, already_notified: false });
      } catch (notificationError) {
        await admin.auth.admin.updateUserById(merchantId, {
          app_metadata: {
            ...appMetadata,
            merchant_signup_notification_status: "failed",
            merchant_signup_notification_error: notificationError instanceof Error
              ? notificationError.message.slice(0, 1000)
              : "Unknown notification error",
            merchant_signup_notification_updated_at: new Date().toISOString(),
          },
        });
        throw notificationError;
      }
    }

    if (cleanText(body.website, 200)) return json({ ok: true });

    const keyPersonName = cleanText(body.key_person_name, 160);
    const companyName = cleanText(body.company_name, 180);
    const industry = cleanText(body.industry, 140);
    const town = cleanText(body.town, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const mobile = cleanText(body.mobile, 32) || null;

    if (keyPersonName.length < 2) throw new RequestError(400, "Enter the key person's name");
    if (companyName.length < 2) throw new RequestError(400, "Enter the company name");
    if (industry.length < 2) throw new RequestError(400, "Enter the industry");
    if (town.length < 2) throw new RequestError(400, "Enter the town");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError(400, "Enter a valid email address");
    if (mobile && !/^[+()\d\s-]{6,32}$/.test(mobile)) throw new RequestError(400, "Enter a valid mobile number");

    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";
    const sourceIpHash = await sha256(`${forwardedFor}:${Deno.env.get("SUPABASE_URL")}`);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: rateError } = await admin
      .from("merchant_waitlist")
      .select("waitlist_id", { count: "exact", head: true })
      .eq("source_ip_hash", sourceIpHash)
      .gte("created_at", oneHourAgo);
    if (rateError) throw rateError;
    if ((recentCount || 0) >= 5) {
      throw new RequestError(429, "Too many signups from this connection. Please try again later");
    }

    const { data: signup, error: insertError } = await admin
      .from("merchant_waitlist")
      .insert({
        key_person_name: keyPersonName,
        company_name: companyName,
        industry,
        town,
        email,
        mobile,
        source_ip_hash: sourceIpHash,
      })
      .select("waitlist_id, key_person_name, company_name, industry, town, email, mobile, created_at")
      .single();

    if (insertError?.code === "23505") {
      const { data: existing, error: existingError } = await admin
        .from("merchant_waitlist")
        .select("waitlist_id, key_person_name, company_name, industry, town, email, mobile, created_at, notification_status")
        .ilike("email", email)
        .single();
      if (existingError) throw existingError;
      const { count, error: countError } = await admin
        .from("merchant_waitlist")
        .select("waitlist_id", { count: "exact", head: true });
      if (countError) throw countError;

      if (existing.notification_status !== "sent") {
        try {
          await sendNotification(existing, count || 1);
          await admin
            .from("merchant_waitlist")
            .update({
              notification_status: "sent",
              notification_sent_at: new Date().toISOString(),
              notification_error: null,
            })
            .eq("waitlist_id", existing.waitlist_id);
        } catch (notificationError) {
          console.error("merchant-waitlist retry notification failed", notificationError);
          await admin
            .from("merchant_waitlist")
            .update({
              notification_status: "failed",
              notification_error: notificationError instanceof Error
                ? notificationError.message.slice(0, 1000)
                : "Unknown notification error",
            })
            .eq("waitlist_id", existing.waitlist_id);
        }
      }
      return json({ ok: true, already_joined: true, waitlist_count: count || 0 });
    }
    if (insertError) throw insertError;

    const { count, error: countError } = await admin
      .from("merchant_waitlist")
      .select("waitlist_id", { count: "exact", head: true });
    if (countError) throw countError;
    const waitlistCount = count || 1;

    try {
      await sendNotification(signup, waitlistCount);
      await admin
        .from("merchant_waitlist")
        .update({
          notification_status: "sent",
          notification_sent_at: new Date().toISOString(),
          notification_error: null,
        })
        .eq("waitlist_id", signup.waitlist_id);
    } catch (notificationError) {
      console.error("merchant-waitlist notification failed", notificationError);
      await admin
        .from("merchant_waitlist")
        .update({
          notification_status: "failed",
          notification_error: notificationError instanceof Error
            ? notificationError.message.slice(0, 1000)
            : "Unknown notification error",
        })
        .eq("waitlist_id", signup.waitlist_id);
    }

    return json({ ok: true, already_joined: false, waitlist_count: waitlistCount }, 201);
  } catch (error) {
    console.error("merchant-waitlist error", error);
    const status = error instanceof RequestError ? error.status : 500;
    const message = error instanceof RequestError ? error.message : "Could not join the waitlist";
    return json({ error: message }, status);
  }
});
