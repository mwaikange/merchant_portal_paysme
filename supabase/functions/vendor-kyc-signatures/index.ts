import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const OTP_MINUTES = 10;
const REQUEST_COOLDOWN_SECONDS = 60;
type AdminClient = ReturnType<typeof createClient>;

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const normalizeMobile = (value: unknown) => {
  const clean = String(value || "").replace(/[^\d]/g, "");
  if (/^0(81|83|85)\d{7}$/.test(clean)) return `264${clean.slice(1)}`;
  if (/^(81|83|85)\d{7}$/.test(clean)) return `264${clean}`;
  return clean;
};

const assertMobile = (value: string) => {
  if (!/^264(81|83|85)\d{7}$/.test(value)) {
    throw new Error("Use a Namibian mobile number beginning with +26481, +26483, or +26485.");
  }
};

const randomDigits = (length: number) => Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) => String(byte % 10)).join("");

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

async function sendSms(mobile: string, content: string) {
  const clientId = Deno.env.get("SMSPORTAL_CLIENT_ID");
  const apiSecret = Deno.env.get("SMSPORTAL_API_SECRET");
  if (!clientId || !apiSecret) throw new Error("SMS service is not configured");
  const credentials = btoa(`${clientId}:${apiSecret}`);
  const response = await fetch("https://rest.smsportal.com/v1/bulkmessages", {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ content, destination: mobile }] }),
  });
  if (!response.ok) throw new Error("Failed to send Digital Signature SMS");
}

async function latestOtp(admin: AdminClient, vendorId: string, purpose: string) {
  const { data, error } = await admin
    .from("vendor_security_otps")
    .select("id, otp_hash, expires_at, attempts")
    .eq("vendor_id", vendorId)
    .eq("purpose", purpose)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Digital Signature lookup failed: ${error.message}`);
  return data?.[0] || null;
}

async function validateSignature(admin: AdminClient, vendorId: string, code: string, purpose: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Digital Signature must be a 6-digit code");
  const otp = await latestOtp(admin, vendorId, purpose);
  if (!otp) throw new Error("Digital Signature not found or expired. Request new codes.");
  if (new Date(otp.expires_at).getTime() < Date.now() || Number(otp.attempts || 0) >= 5) {
    await admin.from("vendor_security_otps").update({ used_at: new Date().toISOString() }).eq("id", otp.id);
    throw new Error("Digital Signature expired or has too many attempts. Request new codes.");
  }
  if (await sha256(code) !== otp.otp_hash) {
    await admin.from("vendor_security_otps").update({ attempts: Number(otp.attempts || 0) + 1 }).eq("id", otp.id);
    throw new Error(purpose === "kyc_guarantor_signature" ? "Guarantor Digital Signature is incorrect" : "Key Person Digital Signature is incorrect");
  }
  return otp;
}

const requiredText = (value: unknown, label: string) => {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
};

const validEmail = (value: unknown, label: string) => {
  const email = requiredText(value, label).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${label} is invalid`);
  return email;
};

const ownedDocumentPath = (paths: Record<string, unknown>, key: string, vendorId: string, label: string) => {
  const path = requiredText(paths[key], label);
  if (!path.startsWith(`${vendorId}/kyc/`) || path.includes("..")) throw new Error(`${label} path is invalid`);
  return path;
};

const assertEligibleVendor = (vendor: Record<string, unknown>) => {
  if (vendor.is_active === false || vendor.registration_status === "inactive") throw new Error("Vendor account is not active");
  if (vendor.registration_confirmed !== true || vendor.mobile_verified !== true) throw new Error("Vendor registration must be confirmed first");
  if (vendor.password_changed !== true && vendor.temp_password_changed !== true) throw new Error("Change the temporary password before applying");
  if (vendor.pin_set !== true) throw new Error("Complete Vendor PIN setup before applying");
  const kycStatus = String(vendor.kyc_status || "").toLowerCase();
  if (["pending", "processing", "under_review", "approved"].includes(kycStatus)) throw new Error("A KYC application is already pending or approved");
  const creditStatus = String(vendor.credit_application_status || "").toLowerCase();
  if (["blocked", "suspended", "rejected"].includes(creditStatus)) throw new Error("Vendor account is not currently eligible for a Token Advance");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const vendorId = String(body.vendor_id || "").trim();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Vendor session is invalid or expired" }, 401);
    const { data: vendor } = await admin.from("vendors").select("vendor_id, auth_user_id, is_active, registration_status, registration_confirmed, mobile_verified, password_changed, temp_password_changed, pin_set, kyc_status, credit_application_status").eq("vendor_id", vendorId).maybeSingle();
    if (!vendor || vendor.auth_user_id !== authData.user.id) return json({ error: "Vendor session does not match this account" }, 403);
    assertEligibleVendor(vendor);

    const hasSeparateGuarantor = body.has_separate_guarantor === true;
    if (body.action === "request") {
      const businessName = String(body.business_name || "").trim();
      const keyPersonName = String(body.key_person_name || "").trim();
      const keyPersonMobile = normalizeMobile(body.key_person_mobile);
      const guarantorName = String(body.guarantor_name || "").trim();
      const guarantorMobile = normalizeMobile(body.guarantor_mobile);
      if (!businessName || !keyPersonName) throw new Error("Business and Key Person details are required");
      assertMobile(keyPersonMobile);
      if (hasSeparateGuarantor) {
        if (!guarantorName) throw new Error("Guarantor name is required");
        assertMobile(guarantorMobile);
      }

      const { data: recentRequests } = await admin
        .from("vendor_security_otps")
        .select("created_at")
        .eq("vendor_id", vendorId)
        .eq("purpose", "kyc_key_person_signature")
        .order("created_at", { ascending: false })
        .limit(1);
      const lastRequestAt = recentRequests?.[0]?.created_at ? new Date(recentRequests[0].created_at).getTime() : 0;
      if (lastRequestAt && Date.now() - lastRequestAt < REQUEST_COOLDOWN_SECONDS * 1000) {
        return json({ error: "Please wait before requesting another Digital Signature." }, 429);
      }

      const purposes = ["kyc_key_person_signature", ...(hasSeparateGuarantor ? ["kyc_guarantor_signature"] : [])];
      await admin.from("vendor_security_otps").update({ used_at: new Date().toISOString() }).eq("vendor_id", vendorId).in("purpose", purposes).is("used_at", null);
      const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000).toISOString();
      const keyCode = randomDigits(6);
      const records: Array<Record<string, unknown>> = [{ vendor_id: vendorId, purpose: "kyc_key_person_signature", otp_hash: await sha256(keyCode), expires_at: expiresAt, attempts: 0 }];
      let guarantorCode = "";
      if (hasSeparateGuarantor) {
        guarantorCode = randomDigits(6);
        records.push({ vendor_id: vendorId, purpose: "kyc_guarantor_signature", otp_hash: await sha256(guarantorCode), expires_at: expiresAt, attempts: 0 });
      }
      const { error: insertError } = await admin.from("vendor_security_otps").insert(records);
      if (insertError) throw new Error(`Digital Signature creation failed: ${insertError.message}`);

      const keyRole = hasSeparateGuarantor ? "Key Person" : "Key Person and Guarantor";
      await sendSms(keyPersonMobile, `Hi ${keyPersonName}, you are applying as the ${keyRole} for a PaySME Token Advance for ${businessName}. Enter ${keyCode} as your Digital Signature. This code expires in ${OTP_MINUTES} minutes.`);
      if (hasSeparateGuarantor) {
        await sendSms(guarantorMobile, `Hi ${guarantorName}, you are applying as the Guarantor for a PaySME Token Advance for ${businessName}. Enter ${guarantorCode} as your Digital Signature. This code expires in ${OTP_MINUTES} minutes.`);
      }
      return json({
        ok: true,
        key_person_mobile: `${keyPersonMobile.slice(0, 5)}***${keyPersonMobile.slice(-3)}`,
        guarantor_mobile: hasSeparateGuarantor ? `${guarantorMobile.slice(0, 5)}***${guarantorMobile.slice(-3)}` : null,
      });
    }

    if (body.action === "verify") {
      const keyOtp = await validateSignature(admin, vendorId, String(body.key_person_code || "").trim(), "kyc_key_person_signature");
      const verified = [keyOtp];
      if (hasSeparateGuarantor) {
        verified.push(await validateSignature(admin, vendorId, String(body.guarantor_code || "").trim(), "kyc_guarantor_signature"));
      }
      const verifiedAt = new Date().toISOString();
      const { error: consumeError } = await admin.from("vendor_security_otps").update({ used_at: verifiedAt }).in("id", verified.map((otp) => otp.id));
      if (consumeError) throw new Error(`Digital Signature verification failed: ${consumeError.message}`);
      return json({ ok: true, verified_at: verifiedAt, has_separate_guarantor: hasSeparateGuarantor });
    }

    if (body.action === "submit") {
      const application = body.application && typeof body.application === "object" ? body.application : {};
      const documentPaths = application.document_paths && typeof application.document_paths === "object" ? application.document_paths : {};
      const applicationReference = requiredText(body.application_reference, "Application reference").slice(0, 100);

      const { data: existingByReference } = await admin
        .from("vendor_kyc_applications")
        .select("id, application_reference, status")
        .eq("vendor_id", vendorId)
        .eq("application_reference", applicationReference)
        .maybeSingle();
      if (existingByReference) {
        return json({ ok: true, application_id: existingByReference.id, application_reference: existingByReference.application_reference, status: existingByReference.status });
      }

      const { data: existingActive } = await admin
        .from("vendor_kyc_applications")
        .select("id, application_reference, status")
        .eq("vendor_id", vendorId)
        .eq("application_type", "kyc")
        .in("status", ["pending", "processing", "approved"])
        .limit(1);
      if (existingActive?.length) throw new Error("A KYC application is already pending or approved");

      const businessName = requiredText(application.business_name, "Business name");
      const businessPhone = normalizeMobile(application.business_phone);
      const keyPersonMobile = normalizeMobile(application.key_person_mobile);
      assertMobile(businessPhone);
      assertMobile(keyPersonMobile);
      const keyPersonName = requiredText(application.key_person_full_name, "Key Person name");
      const keyOtp = await validateSignature(admin, vendorId, String(body.key_person_code || "").trim(), "kyc_key_person_signature");
      const verifiedOtps = [keyOtp];

      let guarantorMobile: string | null = null;
      if (hasSeparateGuarantor) {
        guarantorMobile = normalizeMobile(application.guarantor_mobile);
        assertMobile(guarantorMobile);
        verifiedOtps.push(await validateSignature(admin, vendorId, String(body.guarantor_code || "").trim(), "kyc_guarantor_signature"));
      }

      const verifiedAt = new Date().toISOString();
      const insertPayload = {
        vendor_id: vendorId,
        application_reference: applicationReference,
        application_type: "kyc",
        business_name: businessName,
        business_type: requiredText(application.business_type, "Business type"),
        bipa_registration_number: requiredText(application.bipa_registration_number, "BIPA registration number"),
        business_owner_id_number: requiredText(application.business_owner_id_number, "Business Owner ID number"),
        business_registration_address: requiredText(application.business_registration_address, "Business registration address"),
        business_phone: businessPhone,
        business_email: validEmail(application.business_email, "Business email"),
        key_person_full_name: keyPersonName,
        key_person_title: requiredText(application.key_person_title, "Key Person title"),
        key_person_mobile: keyPersonMobile,
        key_person_email: validEmail(application.key_person_email, "Key Person email"),
        key_person_id_number: requiredText(application.key_person_id_number, "Key Person ID number"),
        key_person_address: requiredText(application.key_person_address, "Key Person address"),
        key_person_is_guarantor: !hasSeparateGuarantor,
        guarantor_full_name: hasSeparateGuarantor ? requiredText(application.guarantor_full_name, "Guarantor name") : null,
        guarantor_email: hasSeparateGuarantor ? validEmail(application.guarantor_email, "Guarantor email") : null,
        guarantor_mobile: guarantorMobile,
        guarantor_id_number: hasSeparateGuarantor ? requiredText(application.guarantor_id_number, "Guarantor ID number") : null,
        guarantor_address: hasSeparateGuarantor ? requiredText(application.guarantor_address, "Guarantor address") : null,
        business_registration_document_url: ownedDocumentPath(documentPaths, "businessRegistration", vendorId, "Business Registration Documents"),
        business_bank_statement_url: ownedDocumentPath(documentPaths, "businessBankStatement", vendorId, "Business Bank Statement"),
        business_address_proof_url: ownedDocumentPath(documentPaths, "businessAddressProof", vendorId, "Business Proof of Address"),
        id_document_url: ownedDocumentPath(documentPaths, "keyPersonId", vendorId, "Key Person ID Document"),
        key_person_payslip_url: !hasSeparateGuarantor ? ownedDocumentPath(documentPaths, "keyPersonPayslip", vendorId, "Key Person Payslip") : null,
        key_person_bank_statement_url: !hasSeparateGuarantor ? ownedDocumentPath(documentPaths, "keyPersonBankStatement", vendorId, "Key Person Bank Statement") : null,
        key_person_address_proof_url: !hasSeparateGuarantor ? ownedDocumentPath(documentPaths, "keyPersonAddressProof", vendorId, "Key Person Proof of Address") : null,
        guarantor_id_document_url: hasSeparateGuarantor ? ownedDocumentPath(documentPaths, "guarantorId", vendorId, "Guarantor ID Document") : null,
        guarantor_address_proof_url: hasSeparateGuarantor ? ownedDocumentPath(documentPaths, "guarantorAddressProof", vendorId, "Guarantor Proof of Address") : null,
        guarantor_payslip_url: hasSeparateGuarantor ? ownedDocumentPath(documentPaths, "guarantorPayslip", vendorId, "Guarantor Payslip") : null,
        guarantor_bank_statement_url: hasSeparateGuarantor ? ownedDocumentPath(documentPaths, "guarantorBankStatement", vendorId, "Guarantor Bank Statement") : null,
        guarantor_agreement_url: ownedDocumentPath(documentPaths, "guarantorAgreement", vendorId, "Guarantor Agreement"),
        key_person_signature_verified_at: verifiedAt,
        guarantor_signature_verified_at: hasSeparateGuarantor ? verifiedAt : null,
        token_advance_notice_acknowledged: true,
        token_advance_notice_acknowledged_at: verifiedAt,
        status: "pending",
        submitted_at: verifiedAt,
      };

      const { data: inserted, error: insertError } = await admin
        .from("vendor_kyc_applications")
        .insert(insertPayload)
        .select("id, application_reference, status")
        .single();
      if (insertError || !inserted) {
        const { data: retryRecord } = await admin
          .from("vendor_kyc_applications")
          .select("id, application_reference, status")
          .eq("vendor_id", vendorId)
          .eq("application_reference", applicationReference)
          .maybeSingle();
        if (retryRecord) return json({ ok: true, application_id: retryRecord.id, application_reference: retryRecord.application_reference, status: retryRecord.status });
        throw new Error("KYC application could not be submitted. Your draft is safe; please try again.");
      }

      await admin.from("vendor_security_otps").update({ used_at: verifiedAt }).in("id", verifiedOtps.map((otp) => otp.id));
      await admin.from("vendors").update({ kyc_status: "pending", credit_application_status: "pending" }).eq("vendor_id", vendorId);
      return json({ ok: true, application_id: inserted.id, application_reference: inserted.application_reference, status: inserted.status });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("vendor-kyc-signatures error", error);
    return json({ error: error instanceof Error ? error.message : "Digital Signature request failed" }, 400);
  }
});
