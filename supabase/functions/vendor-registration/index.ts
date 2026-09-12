import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://www.paysme.site").replace(/\/$/, "");
const TEMP_PASSWORD_TTL_HOURS = 48;
const SMS_CODE_TTL_MINUTES = 15;
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
type AdminClient = ReturnType<typeof createClient>;

type RegistrationDocument = {
  file_name: string;
  content_type: string;
  base64: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeMobile(mobile?: string | null): string {
  const clean = String(mobile || "").replace(/[^\d]/g, "");
  if (/^0(81|83|85)\d{7}$/.test(clean)) return `264${clean.slice(1)}`;
  return clean;
}

function assertValidMobile(mobile: string) {
  if (!/^264(81|83|85)\d{7}$/.test(normalizeMobile(mobile))) {
    throw new Error("invalid mobile number");
  }
}

function randomDigits(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}

function randomCode(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function extensionFor(document: RegistrationDocument) {
  const fromName = document.file_name?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (document.content_type === "application/pdf") return "pdf";
  if (document.content_type === "image/png") return "png";
  return "jpg";
}

function assertDocument(document: RegistrationDocument | undefined, label: string) {
  if (!document?.base64) throw new Error(`${label} is required`);
  if (!ALLOWED_DOCUMENT_TYPES.has(document.content_type)) throw new Error(`${label} must be a PDF, JPG, PNG, or WEBP file`);
  const estimatedBytes = Math.floor(document.base64.length * 0.75);
  if (estimatedBytes > MAX_DOCUMENT_BYTES) throw new Error(`${label} must be no larger than 4 MB`);
}

async function sendSms(mobile: string, content: string) {
  const clientId = Deno.env.get("SMSPORTAL_CLIENT_ID");
  const apiSecret = Deno.env.get("SMSPORTAL_API_SECRET");
  if (!clientId || !apiSecret) throw new Error("failed SMS: SMSPortal credentials not configured");

  const response = await fetch("https://rest.smsportal.com/v3/BulkMessages", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${apiSecret}`)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ messages: [{ content, destination: normalizeMobile(mobile) }] }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`failed SMS: ${text || response.statusText}`);
}

async function sendEmail(to: string, subject: string, html: string) {
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const fromEmail = Deno.env.get("SMTP_FROM_EMAIL");
  if (!host || !user || !password || !fromEmail) throw new Error("failed email: SMTP credentials not configured");

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port: parseInt(Deno.env.get("SMTP_PORT") || "587", 10),
      tls: true,
      auth: { username: user, password },
    },
  });

  await client.send({
    from: `${Deno.env.get("SMTP_FROM_NAME") || "PaySME"} <${fromEmail}>`,
    to,
    subject,
    html,
  });
  await client.close();
}

function vendorEmailHtml(vendorCode: string, tempPassword: string, confirmationLink: string) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:24px;">
    <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;color:#1f2937;">
      <h1 style="margin:0 0 12px;color:#1f2937;">PaySME Vendor account created</h1>
      <p>Your PaySME Vendor account was created. SMS verification is the main confirmation method for this account.</p>
      <p><strong>Vendor ID:</strong> ${vendorCode}</p>
      <p><strong>Temporary login code:</strong> ${tempPassword}</p>
      <p>Please use the PaySME Android Vendor App to sign in, change your password, and set your 5-digit authorization PIN.</p>
      <p><a href="${confirmationLink}" style="display:inline-block;background:#f0b429;color:#1e2320;padding:12px 16px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirm email address</a></p>
    </div>
  </body></html>`;
}

async function uniqueVendorCode(supabase: AdminClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `V${randomDigits(7)}`;
    const { data, error } = await supabase.from("vendors").select("vendor_id").eq("vendor_code", code).maybeSingle();
    if (error) throw new Error(`failed vendor row creation: ${error.message}`);
    if (!data) return code;
  }
  throw new Error("failed vendor row creation: could not generate a unique Vendor ID");
}

async function register(payload: Record<string, unknown>, sourceIp: string) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const vendor = payload.vendor && typeof payload.vendor === "object" ? payload.vendor as Record<string, unknown> : {};
  const documents = payload.documents && typeof payload.documents === "object"
    ? payload.documents as Record<string, RegistrationDocument | undefined>
    : {};

  const firstName = String(vendor.first_name || "").trim();
  const surname = String(vendor.surname || "").trim();
  const idNumber = String(vendor.id_number || "").trim();
  const email = String(vendor.email || "").trim().toLowerCase();
  const mobile = normalizeMobile(vendor.mobile_number);
  const townInput = String(vendor.town || "").trim();
  const referrerCode = String(vendor.referrer_code || "").replace(/\D/g, "");

  const rateSubject = await sha256(`${sourceIp}:${email || mobile || "anonymous"}`);
  const rateWindow = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentAttempts } = await supabase
    .from("vendor_public_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("scope", "vendor_registration")
    .eq("subject_hash", rateSubject)
    .gte("attempted_at", rateWindow);
  if (Number(recentAttempts || 0) >= 5) throw new Error("Too many registration attempts. Please wait and try again.");
  await supabase.from("vendor_public_rate_limits").insert({ scope: "vendor_registration", subject_hash: rateSubject });

  if (!firstName) throw new Error("First name is required");
  if (!surname) throw new Error("Surname is required");
  if (!/^[A-Za-z0-9]{5,30}$/.test(idNumber.replace(/\s+/g, ""))) throw new Error("invalid ID number");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid email");
  assertValidMobile(mobile);
  if (!townInput) throw new Error("Town is required");
  if (referrerCode && !/^\d{6}$/.test(referrerCode)) {
    throw new Error("Referrer code must contain exactly 6 digits");
  }
  const selfieDocument = documents.selfie_with_id || documents.selfie;
  assertDocument(documents.id_front, "ID front");
  assertDocument(documents.id_back, "ID back");
  assertDocument(selfieDocument, "Selfie with ID");
  if (vendor.terms_accepted !== true) throw new Error("missing Terms & Conditions acceptance");

  const idNumberHash = await sha256(idNumber.replace(/\s+/g, "").toUpperCase());
  const { data: townRows, error: townError } = await supabase
    .from("namibian_towns")
    .select("name")
    .eq("is_active", true);
  if (townError) throw new Error(`failed town validation: ${townError.message}`);
  const townRow = (townRows || []).find((row) =>
    String(row.name).toLocaleLowerCase("en") === townInput.toLocaleLowerCase("en")
  );
  if (!townRow) throw new Error("Select a valid Namibian town");

  let referrer: { vendor_id: string; town: string | null } | null = null;
  if (referrerCode) {
    const { data: referrerRow, error: referrerError } = await supabase
      .from("vendors")
      .select("vendor_id, town")
      .eq("referral_code", referrerCode)
      .eq("is_active", true)
      .maybeSingle();
    if (referrerError) throw new Error(`failed referrer validation: ${referrerError.message}`);
    if (!referrerRow) throw new Error("Referrer code was not found");
    if (!referrerRow.town) throw new Error("The referring vendor must register their town before this code can be used");
    referrer = referrerRow;
  }

  const [{ data: existingEmail }, { data: existingMobile }, { data: existingId }] = await Promise.all([
    supabase.from("vendors").select("vendor_id").eq("email", email).maybeSingle(),
    supabase.from("vendors").select("vendor_id").eq("mobile_number", mobile).maybeSingle(),
    supabase.from("vendors").select("vendor_id").eq("id_number_hash", idNumberHash).maybeSingle(),
  ]);

  if (existingId) throw new Error("ID number already registered");
  if (existingEmail) throw new Error("email already registered");
  if (existingMobile) throw new Error("mobile number already registered");

  const { data: authUsers, error: authLookupError } = await supabase.auth.admin.listUsers();
  if (authLookupError) throw new Error(`failed auth creation: ${authLookupError.message}`);
  if (authUsers.users.some((user) => user.email?.toLowerCase() === email)) {
    throw new Error("email already registered");
  }

  const vendorCode = await uniqueVendorCode(supabase);
  const tempPassword = randomCode(6);
  const smsCode = randomDigits(6);
  const emailToken = crypto.randomUUID() + randomCode(12);
  const fullName = `${firstName} ${surname}`.trim();
  let vendorIdForCleanup: string | null = null;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      role: "vendor",
      user_type: "vendor",
      vendor_code: vendorCode,
      first_name: firstName,
      surname,
      mobile_number: mobile,
      town: townRow.name,
    },
  });
  if (authError || !authData.user) throw new Error(`failed auth creation: ${authError?.message || "unknown error"}`);

  try {
    const { data: vendorRow, error: vendorError } = await supabase
      .from("vendors")
      .insert({
        auth_user_id: authData.user.id,
        vendor_code: vendorCode,
        full_name: fullName,
        first_name: firstName,
        surname,
        business_name: null,
        town: townRow.name,
        referred_by_vendor_id: referrer?.vendor_id || null,
        email,
        mobile_number: mobile,
        id_number: idNumber,
        id_number_hash: idNumberHash,
        vendor_type: "prepaid",
        credit_application_status: "none",
        kyc_status: "not_started",
        pin_hash: "PIN_SETUP_REQUIRED",
        is_active: false,
        mobile_verified: false,
        registration_confirmed: false,
        temp_password_expires_at: new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 60 * 60 * 1000).toISOString(),
      })
      .select("vendor_id")
      .single();

    if (vendorError || !vendorRow) throw new Error(`failed vendor row creation: ${vendorError?.message || "unknown error"}`);
    vendorIdForCleanup = vendorRow.vendor_id;

    const frontPath = `vendors/${vendorRow.vendor_id}/registration/id-front.${extensionFor(documents.id_front)}`;
    const backPath = `vendors/${vendorRow.vendor_id}/registration/id-back.${extensionFor(documents.id_back)}`;
    const selfiePath = `vendors/${vendorRow.vendor_id}/registration/selfie-with-id.${extensionFor(selfieDocument)}`;
    const uploadFront = await supabase.storage
      .from("vendor-documents")
      .upload(frontPath, decodeBase64(documents.id_front.base64), { contentType: documents.id_front.content_type, upsert: true });
    if (uploadFront.error) throw new Error(`failed document upload: ${uploadFront.error.message}`);
    const uploadBack = await supabase.storage
      .from("vendor-documents")
      .upload(backPath, decodeBase64(documents.id_back.base64), { contentType: documents.id_back.content_type, upsert: true });
    if (uploadBack.error) throw new Error(`failed document upload: ${uploadBack.error.message}`);
    const uploadSelfie = await supabase.storage
      .from("vendor-documents")
      .upload(selfiePath, decodeBase64(selfieDocument.base64), { contentType: selfieDocument.content_type, upsert: true });
    if (uploadSelfie.error) throw new Error(`failed document upload: ${uploadSelfie.error.message}`);

    await supabase
      .from("vendors")
      .update({ id_front_path: frontPath, id_back_path: backPath, selfie_path: selfiePath })
      .eq("vendor_id", vendorRow.vendor_id);

    const { data: confirmation, error: confirmationError } = await supabase
      .from("vendor_registration_confirmations")
      .insert({
        vendor_id: vendorRow.vendor_id,
        sms_code_hash: await sha256(smsCode),
        sms_expires_at: new Date(Date.now() + SMS_CODE_TTL_MINUTES * 60 * 1000).toISOString(),
        email_token_hash: await sha256(emailToken),
      })
      .select("id")
      .single();

    if (confirmationError || !confirmation) throw new Error(`failed vendor row creation: ${confirmationError?.message || "confirmation not created"}`);

    await sendSms(mobile, `PaySME Vendor confirmation code: ${smsCode}. It expires in ${SMS_CODE_TTL_MINUTES} minutes.`);

    return {
      registration_id: confirmation.id,
      vendor_id: vendorRow.vendor_id,
      masked_mobile: `${mobile.slice(0, 5)}***${mobile.slice(-3)}`,
      message: "Vendor registration submitted. We have sent a confirmation code to your mobile number. Please enter the code to activate your PaySME Vendor account.",
    };
  } catch (error) {
    if (vendorIdForCleanup) {
      await supabase.from("vendors").delete().eq("vendor_id", vendorIdForCleanup);
    }
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw error;
  }
}

async function verifySms(payload: Record<string, unknown>) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const registrationId = String(payload.registration_id || "");
  const code = String(payload.code || "");
  if (!/^\d{6}$/.test(code)) throw new Error("invalid SMS confirmation code");

  const { data: confirmation, error } = await supabase
    .from("vendor_registration_confirmations")
    .select("id, vendor_id, sms_code_hash, sms_expires_at, attempts")
    .eq("id", registrationId)
    .maybeSingle();

  if (error || !confirmation) throw new Error("invalid SMS confirmation code");
  if (new Date(confirmation.sms_expires_at).getTime() < Date.now()) throw new Error("SMS confirmation code expired");
  if (confirmation.attempts >= 5) throw new Error("Too many SMS confirmation attempts");

  const codeHash = await sha256(code);
  if (codeHash !== confirmation.sms_code_hash) {
    await supabase.from("vendor_registration_confirmations").update({ attempts: confirmation.attempts + 1 }).eq("id", registrationId);
    throw new Error("invalid SMS confirmation code");
  }

  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("vendor_id, vendor_code, email, mobile_number, temp_password_expires_at, auth_user_id")
    .eq("vendor_id", confirmation.vendor_id)
    .single();
  if (vendorError || !vendor) throw new Error("failed vendor row creation: vendor not found");

  const tempPassword = randomCode(6);
  const emailToken = crypto.randomUUID() + randomCode(12);
  const tempExpiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const { error: authError } = await supabase.auth.admin.updateUserById(vendor.auth_user_id, { password: tempPassword });
  if (authError) throw new Error(`failed auth creation: ${authError.message}`);

  await supabase
    .from("vendors")
    .update({
      is_active: true,
      mobile_verified: true,
      registration_confirmed: true,
      temp_password_expires_at: tempExpiresAt,
    })
    .eq("vendor_id", vendor.vendor_id);

  await supabase
    .from("vendor_registration_confirmations")
    .update({
      sms_verified_at: new Date().toISOString(),
      email_token_hash: await sha256(emailToken),
    })
    .eq("id", registrationId);

  await sendSms(
    vendor.mobile_number,
    `PaySME Vendor account confirmed. Vendor ID: ${vendor.vendor_code}. Temporary login code: ${tempPassword}. Use the Android Vendor App to sign in and set your 5-digit PIN.`
  );

  let emailSent = false;
  try {
    const link = `${SITE_URL}/vendor-confirmation?token=${encodeURIComponent(emailToken)}`;
    await sendEmail(vendor.email, "PaySME Vendor account confirmed", vendorEmailHtml(vendor.vendor_code, tempPassword, link));
    emailSent = true;
  } catch (error) {
    console.error("Vendor confirmation email failed", error);
  }

  return {
    vendor_code: vendor.vendor_code,
    email_sent: emailSent,
    message: "Account confirmed successfully. Your PaySME Vendor ID and temporary login code have been sent by SMS.",
  };
}

async function confirmEmail(payload: Record<string, unknown>) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = String(payload.token || "");
  if (!token) throw new Error("Confirmation token is missing");

  const { data: confirmation, error } = await supabase
    .from("vendor_registration_confirmations")
    .select("id, vendor_id")
    .eq("email_token_hash", await sha256(token))
    .maybeSingle();
  if (error || !confirmation) throw new Error("Invalid or expired confirmation token");

  await supabase.from("vendor_registration_confirmations").update({ email_confirmed_at: new Date().toISOString() }).eq("id", confirmation.id);
  await supabase.from("vendors").update({ email_verified: true }).eq("vendor_id", confirmation.vendor_id);
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.action === "register") {
      const sourceIp = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
      return jsonResponse(await register(body, sourceIp));
    }
    if (body.action === "verify_sms") return jsonResponse(await verifySms(body));
    if (body.action === "confirm_email") return jsonResponse(await confirmEmail(body));
    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("vendor-registration error", error);
    return jsonResponse({ error: error.message || "Vendor registration failed" }, 400);
  }
});
