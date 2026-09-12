import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { normalizeNamibianMobile, validateNamibianMobile } from "@/lib/validations";
import {
  clearVendorKycDraft,
  loadVendorKycDraft,
  loadVendorKycFiles,
  saveVendorKycDraft,
  saveVendorKycFiles,
} from "@/lib/vendorKycDraft";

const paysmeLogo = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
const KYC_BUCKET = "vendor-kyc-documents";
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const INACTIVITY_LIMIT = 15 * 60 * 1000;

const vendorClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

type Address = { erf: string; street: string; location: string; town: string };
type KycForm = {
  businessName: string;
  businessType: string;
  bipaRegistrationNumber: string;
  businessOwnerIdNumber: string;
  businessMobile: string;
  businessEmail: string;
  businessAddress: Address;
  keyPersonFullName: string;
  keyPersonTitle: string;
  keyPersonMobile: string;
  keyPersonEmail: string;
  keyPersonIdNumber: string;
  keyPersonAddress: Address;
  keyPersonIsGuarantor: boolean;
  guarantorFullName: string;
  guarantorEmail: string;
  guarantorMobile: string;
  guarantorIdNumber: string;
  guarantorAddress: Address;
};

type VendorRecord = {
  vendor_id: string;
  auth_user_id: string;
  business_name: string | null;
  email: string;
  mobile_number: string | null;
  is_active: boolean;
  registration_status: string;
  registration_confirmed: boolean;
  mobile_verified: boolean;
  password_changed: boolean | null;
  temp_password_changed: boolean;
  pin_set: boolean;
  kyc_status: string | null;
  credit_application_status: string | null;
};

type KycStatusNotice = {
  kind: "approved" | "pending";
  status: string;
  date: string | null;
};

type VendorTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  vendor_id: string;
  user_type: "vendor";
};

type DocumentKey =
  | "businessRegistration"
  | "businessBankStatement"
  | "businessAddressProof"
  | "keyPersonId"
  | "keyPersonPayslip"
  | "keyPersonBankStatement"
  | "keyPersonAddressProof"
  | "guarantorId"
  | "guarantorAddressProof"
  | "guarantorPayslip"
  | "guarantorBankStatement"
  | "guarantorAgreement";

type DocumentSpec = {
  key: DocumentKey;
  label: string;
  group: string;
  documentType: string;
  databaseField: string;
};

type SignatureRequestResponse = {
  ok: boolean;
  key_person_mobile: string;
  guarantor_mobile: string | null;
  key_person_email: string;
  guarantor_email: string | null;
  retry_after_seconds: number;
};

type DraftResponse = {
  ok: boolean;
  application: {
    id: string;
    application_reference: string | null;
  };
};

type FinalizeResponse = {
  ok: boolean;
  application_id: string;
  verified_at: string;
};

const emptyAddress = (): Address => ({ erf: "", street: "", location: "", town: "" });
const initialForm = (): KycForm => ({
  businessName: "",
  businessType: "",
  bipaRegistrationNumber: "",
  businessOwnerIdNumber: "",
  businessMobile: "",
  businessEmail: "",
  businessAddress: emptyAddress(),
  keyPersonFullName: "",
  keyPersonTitle: "",
  keyPersonMobile: "",
  keyPersonEmail: "",
  keyPersonIdNumber: "",
  keyPersonAddress: emptyAddress(),
  keyPersonIsGuarantor: false,
  guarantorFullName: "",
  guarantorEmail: "",
  guarantorMobile: "",
  guarantorIdNumber: "",
  guarantorAddress: emptyAddress(),
});

const steps = ["Verification", "Business", "Key Person", "Guarantor", "Documents", "Review", "Signatures", "Complete"];

const formatAddress = (address: Address) =>
  `Erf: ${address.erf} | Street: ${address.street} | Location: ${address.location} | Town: ${address.town}`;

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const isId = (value: string) => /^[A-Za-z0-9]{5,30}$/.test(value.replace(/\s+/g, ""));
const addressComplete = (address: Address) => Object.values(address).every((value) => value.trim().length > 0);
const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

const documentsFor = (keyPersonIsGuarantor: boolean): DocumentSpec[] => [
  { key: "businessRegistration", label: "Business Registration Documents", group: "Business Documents", documentType: "business_registration_document", databaseField: "business_registration_document_url" },
  { key: "businessBankStatement", label: "Business Bank Statement", group: "Business Documents", documentType: "business_bank_statement", databaseField: "business_bank_statement_url" },
  { key: "businessAddressProof", label: "Business Proof of Address", group: "Business Documents", documentType: "business_address_proof", databaseField: "business_address_proof_url" },
  { key: "keyPersonId", label: "Key Person ID Document or Passport", group: "Key Person Documents", documentType: "key_person_id", databaseField: "id_document_url" },
  ...(keyPersonIsGuarantor ? [
    { key: "keyPersonPayslip", label: "Key Person Payslip", group: "Key Person Documents", documentType: "key_person_payslip", databaseField: "key_person_payslip_url" },
    { key: "keyPersonBankStatement", label: "Key Person Bank Statement", group: "Key Person Documents", documentType: "key_person_bank_statement", databaseField: "key_person_bank_statement_url" },
    { key: "keyPersonAddressProof", label: "Key Person Proof of Address", group: "Key Person Documents", documentType: "key_person_address_proof", databaseField: "key_person_address_proof_url" },
  ] as DocumentSpec[] : [
    { key: "guarantorId", label: "Guarantor ID Document or Passport", group: "Guarantor Documents", documentType: "guarantor_id", databaseField: "guarantor_id_document_url" },
    { key: "guarantorAddressProof", label: "Guarantor Proof of Address", group: "Guarantor Documents", documentType: "guarantor_address_proof", databaseField: "guarantor_address_proof_url" },
    { key: "guarantorPayslip", label: "Guarantor Payslip", group: "Guarantor Documents", documentType: "guarantor_payslip", databaseField: "guarantor_payslip_url" },
    { key: "guarantorBankStatement", label: "Guarantor Bank Statement", group: "Guarantor Documents", documentType: "guarantor_bank_statement", databaseField: "guarantor_bank_statement_url" },
  ]),
  { key: "guarantorAgreement", label: "Signed and Stamped Guarantor Agreement", group: "Agreement", documentType: "guarantor_agreement", databaseField: "guarantor_agreement_url" },
];

const formatStatusDate = (value: string | null) => {
  if (!value) return "Date not recorded";
  return new Intl.DateTimeFormat("en-NA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
};

const getFunctionError = async (error: unknown, fallback: string) => {
  const context = (error as { context?: Response })?.context;
  if (context) {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // Use the safe fallback below.
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

const Field = ({ label, value, onChange, type = "text", autoComplete }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) => {
  const inputName = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const placeholder = type === "email"
    ? "e.g. name@example.com"
    : type === "tel"
      ? "e.g. 0812345678 or +264812345678"
      : label.toLowerCase().includes("id number")
        ? "Enter ID or passport number"
        : `Enter ${label.toLowerCase().replace(" (optional)", "")}`;

  return (
    <label className="space-y-1.5 text-sm font-semibold text-[#242824]">
      <span>{label}</span>
      <input
        className="kyc-input"
        name={inputName}
        aria-label={label}
        placeholder={placeholder}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
};

const AddressFields = ({ title, value, onChange }: { title: string; value: Address; onChange: (value: Address) => void }) => (
  <fieldset className="kyc-fieldset md:col-span-2">
    <legend>{title}</legend>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {(["erf", "street", "location", "town"] as const).map((key) => (
        <Field key={key} label={key === "location" ? "Location / Suburb" : key.charAt(0).toUpperCase() + key.slice(1)} value={value[key]} onChange={(next) => onChange({ ...value, [key]: next })} />
      ))}
    </div>
  </fieldset>
);

const FileField = ({ spec, file, onChange }: { spec: DocumentSpec; file?: File; onChange: (file?: File) => void }) => (
  <div className="kyc-file-field">
    <div className="min-w-0">
      <p className="font-semibold text-[#252925]">{spec.label}</p>
      <p className="truncate text-xs text-gray-500">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF, JPG, PNG or WEBP · maximum 4 MB"}</p>
    </div>
    <div className="flex shrink-0 gap-2">
      <label className="kyc-file-button">
        <Upload className="h-4 w-4" /> {file ? "Replace" : "Choose"}
        <input name={spec.key} aria-label={spec.label} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => onChange(event.target.files?.[0])} />
      </label>
      {file && <button type="button" className="kyc-remove-button" aria-label={`Remove ${spec.label}`} onClick={() => onChange(undefined)}><X className="h-4 w-4" /></button>}
    </div>
  </div>
);

const VendorKyc = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [credentials, setCredentials] = useState({ vendorCode: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [eligibilityMessage, setEligibilityMessage] = useState("");
  const [statusNotice, setStatusNotice] = useState<KycStatusNotice | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [form, setForm] = useState<KycForm>(initialForm);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [applicationId, setApplicationId] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [signatureCodes, setSignatureCodes] = useState({ keyPerson: "", keyPersonEmail: "", guarantor: "", guarantorEmail: "" });
  const [showSignatures, setShowSignatures] = useState({ keyPerson: false, keyPersonEmail: false, guarantor: false, guarantorEmail: false });
  const [signatureDestinations, setSignatureDestinations] = useState({ keyPersonMobile: "", keyPersonEmail: "", guarantorMobile: "", guarantorEmail: "" });
  const [signaturesSent, setSignaturesSent] = useState(false);
  const [confirmationReference, setConfirmationReference] = useState("");
  const lastActivity = useRef(Date.now());

  const requiredDocuments = useMemo(() => documentsFor(form.keyPersonIsGuarantor), [form.keyPersonIsGuarantor]);
  const missingDocuments = requiredDocuments.filter((document) => !files[document.key]);

  const endTemporarySession = async () => {
    await vendorClient.auth.signOut({ scope: "local" });
    setVendor(null);
    setCredentials({ vendorCode: "", password: "" });
    setSignatureCodes({ keyPerson: "", keyPersonEmail: "", guarantor: "", guarantorEmail: "" });
    setSignatureDestinations({ keyPersonMobile: "", keyPersonEmail: "", guarantorMobile: "", guarantorEmail: "" });
    setSignaturesSent(false);
    setApplicationId("");
    setWizardStep(1);
  };

  useEffect(() => {
    if (!vendor) return;
    const activity = () => { lastActivity.current = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => document.addEventListener(event, activity, true));
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= INACTIVITY_LIMIT) {
        void endTemporarySession();
        toast({ title: "Session expired", description: "For your security, sign in again to continue your saved draft." });
      }
    }, 30_000);
    return () => {
      events.forEach((event) => document.removeEventListener(event, activity, true));
      window.clearInterval(timer);
    };
  }, [toast, vendor]);

  useEffect(() => {
    if (!vendor || !draftReady || wizardStep === 7) return;
    const timer = window.setTimeout(() => {
      saveVendorKycDraft({ version: 1, vendorId: vendor.vendor_id, draftId, step: wizardStep, savedAt: new Date().toISOString(), form });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftId, draftReady, form, vendor, wizardStep]);

  const eligibilityError = (record: VendorRecord) => {
    if (!record.is_active || record.registration_status === "inactive") return "Your Vendor account is not currently active.";
    if (!record.registration_confirmed || !record.mobile_verified) return "Your registration must be confirmed first.";
    if (!(record.password_changed || record.temp_password_changed)) return "Change your temporary password before applying.";
    if (!record.pin_set) return "Complete your Vendor account PIN setup before applying.";
    return "";
  };

  const loadKycStatusNotice = async (record: VendorRecord): Promise<KycStatusNotice | null> => {
    const { data, error } = await vendorClient
      .from("vendor_kyc_applications")
      .select("status,reviewed_at,submitted_at")
      .eq("vendor_id", record.vendor_id)
      .eq("application_type", "kyc")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const statusRecord = error ? null : data;
    const status = String(record.kyc_status || statusRecord?.status || "").toLowerCase();
    if (["approved", "verified"].includes(status) || String(statusRecord?.status || "").toLowerCase() === "approved") {
      return { kind: "approved", status: "Fully verified", date: statusRecord?.reviewed_at || statusRecord?.submitted_at || null };
    }
    if (["pending", "processing", "under_review"].includes(status) || ["pending", "processing", "under_review"].includes(String(statusRecord?.status || "").toLowerCase())) {
      return { kind: "pending", status: "Pending review", date: statusRecord?.submitted_at || null };
    }
    return null;
  };

  const verifyVendor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!credentials.vendorCode.trim() || !credentials.password) return;
    setIsAuthenticating(true);
    setEligibilityMessage("");
    setStatusNotice(null);
    try {
      const { data, error } = await vendorClient.functions.invoke<VendorTokenResponse>("vendor-token", {
        body: { vendor_code: credentials.vendorCode.trim().toUpperCase(), password: credentials.password },
      });
      if (error || !data?.access_token) throw error || new Error("Vendor ID or password is incorrect.");
      const { data: sessionData, error: sessionError } = await vendorClient.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      if (sessionError || !sessionData.user || data.user_type !== "vendor") throw new Error("This account is not registered as a PaySME Vendor.");
      const userType = sessionData.user.app_metadata?.user_type || sessionData.user.user_metadata?.user_type;
      if (userType !== "vendor") throw new Error("This account is not registered as a PaySME Vendor.");
      const { data: vendorData, error: vendorError } = await vendorClient.from("vendors").select("vendor_id,auth_user_id,business_name,email,mobile_number,is_active,registration_status,registration_confirmed,mobile_verified,password_changed,temp_password_changed,pin_set,kyc_status,credit_application_status").eq("vendor_id", data.vendor_id).maybeSingle();
      if (vendorError || !vendorData || vendorData.auth_user_id !== sessionData.user.id) throw new Error("Vendor ID or password is incorrect.");
      const record = vendorData as VendorRecord;
      const notice = await loadKycStatusNotice(record);
      if (notice) {
        setStatusNotice(notice);
        setCredentials((current) => ({ ...current, password: "" }));
        await vendorClient.auth.signOut({ scope: "local" });
        return;
      }
      const reason = eligibilityError(record);
      if (reason) {
        setEligibilityMessage(reason);
        await vendorClient.auth.signOut({ scope: "local" });
        return;
      }
      const saved = loadVendorKycDraft<KycForm>(record.vendor_id);
      const savedFiles = await loadVendorKycFiles(record.vendor_id);
      setVendor(record);
      setForm(saved?.form || { ...initialForm(), businessName: record.business_name || "", businessEmail: record.email || "", businessMobile: record.mobile_number || "" });
      setWizardStep(Math.min(6, Math.max(1, saved?.step || 1)));
      setDraftId(saved?.draftId || crypto.randomUUID());
      setFiles(savedFiles);
      setDraftReady(true);
      setCredentials((current) => ({ ...current, password: "" }));
      lastActivity.current = Date.now();
    } catch (error) {
      await vendorClient.auth.signOut({ scope: "local" });
      setEligibilityMessage(await getFunctionError(error, "Vendor ID or password is incorrect."));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const validateStep = (step: number) => {
    if (step === 1 && (!form.businessName.trim() || !form.businessType || !form.bipaRegistrationNumber.trim() || !isId(form.businessOwnerIdNumber) || !validateNamibianMobile(form.businessMobile) || !isEmail(form.businessEmail) || !addressComplete(form.businessAddress))) return "Complete all Business details with valid information.";
    if (step === 2 && (!form.keyPersonFullName.trim() || !validateNamibianMobile(form.keyPersonMobile) || !isEmail(form.keyPersonEmail) || !isId(form.keyPersonIdNumber) || !addressComplete(form.keyPersonAddress))) return "Complete all Key Person details with valid information.";
    if (step === 3 && !form.keyPersonIsGuarantor && (!form.guarantorFullName.trim() || !isEmail(form.guarantorEmail) || !validateNamibianMobile(form.guarantorMobile) || !isId(form.guarantorIdNumber) || !addressComplete(form.guarantorAddress))) return "Complete all Guarantor details with valid information.";
    if (step === 4 && missingDocuments.length) return `Add all required documents. ${missingDocuments.length} document${missingDocuments.length === 1 ? " is" : "s are"} missing.`;
    return "";
  };

  const goNext = () => {
    const error = validateStep(wizardStep);
    if (error) return toast({ title: "Check this step", description: error, variant: "destructive" });
    setWizardStep((step) => Math.min(6, step + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateFile = async (key: DocumentKey, file?: File) => {
    if (file && (!ALLOWED_FILE_TYPES.has(file.type) || file.size > MAX_FILE_SIZE)) {
      toast({ title: "Document not accepted", description: "Use a PDF, JPG, PNG or WEBP file no larger than 4 MB.", variant: "destructive" });
      return;
    }
    const next = { ...files };
    if (file) next[key] = file;
    else delete next[key];
    setFiles(next);
    if (vendor) {
      try { await saveVendorKycFiles(vendor.vendor_id, next); }
      catch { toast({ title: "Draft warning", description: "This browser could not save the selected document for refresh protection." }); }
    }
  };

  const draftPayload = () => ({
    business_name: form.businessName,
    business_type: form.businessType,
    bipa_registration_number: form.bipaRegistrationNumber,
    business_owner_id_number: form.businessOwnerIdNumber,
    business_phone: normalizeNamibianMobile(form.businessMobile),
    business_email: form.businessEmail.trim().toLowerCase(),
    business_address: form.businessAddress,
    key_person_full_name: form.keyPersonFullName,
    key_person_title: form.keyPersonTitle,
    key_person_mobile: normalizeNamibianMobile(form.keyPersonMobile),
    key_person_email: form.keyPersonEmail.trim().toLowerCase(),
    key_person_id_number: form.keyPersonIdNumber,
    key_person_address: form.keyPersonAddress,
    key_person_is_guarantor: form.keyPersonIsGuarantor,
    guarantor_full_name: form.guarantorFullName,
    guarantor_email: form.guarantorEmail.trim().toLowerCase(),
    guarantor_mobile: normalizeNamibianMobile(form.guarantorMobile),
    guarantor_id_number: form.guarantorIdNumber,
    guarantor_address: form.guarantorAddress,
  });

  const uploadDocuments = async (savedApplicationId: string) => {
    if (!vendor) throw new Error("Vendor session is missing.");
    for (const spec of requiredDocuments) {
      const file = files[spec.key];
      if (!file) throw new Error(`${spec.label} is missing.`);
      const extension = safeFileName(file.name.split(".").pop() || "bin");
      const path = `${vendor.vendor_id}/${savedApplicationId}/${spec.documentType}.${extension}`;
      const { error } = await vendorClient.storage.from(KYC_BUCKET).upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw new Error(`Unable to upload ${spec.label}.`);
      const { error: saveError } = await vendorClient.functions.invoke("vendor-kyc-signatures", { body: {
        action: "save_document",
        vendor_id: vendor.vendor_id,
        application_id: savedApplicationId,
        field: spec.databaseField,
        path,
      } });
      if (saveError) {
        await vendorClient.storage.from(KYC_BUCKET).remove([path]);
        throw saveError;
      }
    }
  };

  const sendSignatureRequest = async () => {
    if (!vendor) throw new Error("Vendor session is missing.");
    const { data, error } = await vendorClient.functions.invoke<SignatureRequestResponse>("vendor-kyc-signatures", { body: {
      action: "request",
      vendor_id: vendor.vendor_id,
      business_name: form.businessName,
      key_person_name: form.keyPersonFullName,
      key_person_mobile: normalizeNamibianMobile(form.keyPersonMobile),
      key_person_email: form.keyPersonEmail.trim().toLowerCase(),
      has_separate_guarantor: !form.keyPersonIsGuarantor,
      guarantor_name: form.guarantorFullName,
      guarantor_mobile: normalizeNamibianMobile(form.guarantorMobile),
      guarantor_email: form.guarantorEmail.trim().toLowerCase(),
    } });
    if (error || !data?.ok) throw error || new Error("Digital Signature codes could not be sent.");
    setSignatureCodes({ keyPerson: "", keyPersonEmail: "", guarantor: "", guarantorEmail: "" });
    setSignatureDestinations({
      keyPersonMobile: data.key_person_mobile || "",
      keyPersonEmail: data.key_person_email || "",
      guarantorMobile: data.guarantor_mobile || "",
      guarantorEmail: data.guarantor_email || "",
    });
    setSignaturesSent(true);
    setWizardStep(6);
  };

  const requestSignatures = async () => {
    const reviewError = validateStep(5);
    if (reviewError || !vendor) return toast({ title: "Review required", description: reviewError, variant: "destructive" });
    setIsBusy(true);
    try {
      const { data, error } = await vendorClient.functions.invoke<DraftResponse>("vendor-kyc-signatures", { body: {
        action: "save_draft",
        vendor_id: vendor.vendor_id,
        form_data: draftPayload(),
      } });
      if (error || !data?.application?.id) throw error || new Error("The KYC details could not be saved.");
      setApplicationId(data.application.id);
      await uploadDocuments(data.application.id);
      await sendSignatureRequest();
      toast({
        title: "Verification codes sent",
        description: form.keyPersonIsGuarantor
          ? "SMS and email codes were sent to the Key Person."
          : "SMS and email codes were sent separately to the Key Person and Guarantor.",
      });
    } catch (error) {
      toast({ title: "Unable to prepare KYC submission", description: await getFunctionError(error, "Your draft is safe. Please try again."), variant: "destructive" });
    } finally { setIsBusy(false); }
  };

  const resendSignatures = async () => {
    if (!applicationId) return toast({ title: "KYC draft missing", description: "Return to Review and prepare the submission again.", variant: "destructive" });
    setIsBusy(true);
    try {
      await sendSignatureRequest();
      toast({ title: "New verification codes sent", description: "Use the latest SMS and email codes." });
    } catch (error) {
      toast({ title: "Unable to resend verification codes", description: await getFunctionError(error, "Please try again when the current codes expire."), variant: "destructive" });
    } finally { setIsBusy(false); }
  };

  const submitApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    const separateGuarantorCodesMissing = !form.keyPersonIsGuarantor
      && (!/^\d{6}$/.test(signatureCodes.guarantor) || !/^\d{6}$/.test(signatureCodes.guarantorEmail));
    if (!vendor || !applicationId || !/^\d{6}$/.test(signatureCodes.keyPerson) || !/^\d{6}$/.test(signatureCodes.keyPersonEmail) || separateGuarantorCodesMissing) {
      return toast({ title: "Verification codes required", description: "Enter each required 6-digit SMS and email code.", variant: "destructive" });
    }
    setIsBusy(true);
    try {
      const { data, error } = await vendorClient.functions.invoke<FinalizeResponse>("vendor-kyc-signatures", { body: {
        action: "finalize",
        vendor_id: vendor.vendor_id,
        application_id: applicationId,
        key_person_code: signatureCodes.keyPerson,
        key_person_email_code: signatureCodes.keyPersonEmail,
        guarantor_code: signatureCodes.guarantor,
        guarantor_email_code: signatureCodes.guarantorEmail,
      } });
      if (error || !data?.ok) throw error || new Error("Application submission failed.");
      setConfirmationReference(data.application_id);
      setWizardStep(7);
      setSignatureCodes({ keyPerson: "", keyPersonEmail: "", guarantor: "", guarantorEmail: "" });
      await clearVendorKycDraft(vendor.vendor_id);
      await vendorClient.auth.signOut({ scope: "local" });
    } catch (error) {
      toast({ title: "Application not submitted", description: await getFunctionError(error, "Your draft is safe. Please correct the issue and try again."), variant: "destructive" });
    } finally { setIsBusy(false); }
  };

  const discardDraft = async () => {
    if (!vendor || !window.confirm("Discard all saved KYC details and selected documents on this device?")) return;
    await clearVendorKycDraft(vendor.vendor_id);
    setForm({ ...initialForm(), businessName: vendor.business_name || "", businessEmail: vendor.email || "", businessMobile: vendor.mobile_number || "" });
    setFiles({});
    setDraftId(crypto.randomUUID());
    setWizardStep(1);
  };

  const renderAddress = (kind: "businessAddress" | "keyPersonAddress" | "guarantorAddress", title: string) => (
    <AddressFields title={title} value={form[kind]} onChange={(value) => setForm((current) => ({ ...current, [kind]: value }))} />
  );

  return (
    <div className="vendor-kyc-page min-h-screen bg-[#252a26] text-white">
      <header className="vendor-kyc-header sticky top-0 z-30 border-b border-white/10 bg-[#202420]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <img src={paysmeLogo} alt="PaySME" className="h-10 w-auto sm:h-12" />
          <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-[#f0b429]" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
        </div>
      </header>

      <main className="vendor-kyc-main mx-auto max-w-6xl px-5 py-5">
        <div className="mx-auto mb-4 max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#f0b429]">Public Vendor Application Service</p>
          <h1 className="mt-2 text-3xl font-bold">Vendor KYC &amp; Token Advance application</h1>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-white/70 sm:text-base">Verify your existing Vendor account, complete KYC, upload the required private documents, and provide the required Digital Signatures. This service does not open a Vendor Portal or show account balances or transactions.</p>
        </div>

        {statusNotice ? (
          <section className={`mx-auto max-w-xl rounded-2xl border p-7 text-center shadow-2xl ${statusNotice.kind === "approved" ? "border-green-400/35 bg-[#343a35]" : "border-[#f0b429]/40 bg-[#343a35]"}`}>
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${statusNotice.kind === "approved" ? "bg-green-400/15 text-green-300" : "bg-[#f0b429]/15 text-[#f0b429]"}`}>
              {statusNotice.kind === "approved" ? <Check className="h-8 w-8" /> : <ShieldCheck className="h-8 w-8" />}
            </div>
            <h2 className="mt-5 text-3xl font-bold">{statusNotice.kind === "approved" ? "KYC verification passed" : "KYC already submitted"}</h2>
            <p className="mt-3 text-lg font-semibold text-white">{statusNotice.status}</p>
            <p className="mt-2 text-sm text-white/65">
              {statusNotice.kind === "approved" ? "Approved" : "Submitted"} on {formatStatusDate(statusNotice.date)}
            </p>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/65">
              {statusNotice.kind === "approved"
                ? "No further KYC documents are required."
                : "Your application is with the PaySME team for review. You will be notified when a decision is recorded."}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button variant="outline" className="border-white/25 bg-white/5 text-white" onClick={() => {
                setStatusNotice(null);
                setCredentials({ vendorCode: "", password: "" });
              }}>Check another Vendor ID</Button>
              <Button className="vendor-yellow-button" onClick={() => navigate("/")}>Return to PaySME</Button>
            </div>
          </section>
        ) : !vendor && wizardStep !== 7 ? (
          <section className="vendor-kyc-login mx-auto max-w-lg rounded-2xl border border-white/15 bg-[#343a35] p-5 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f0b429] text-[#1e2320]"><ShieldCheck className="h-5 w-5" /></div>
            <h2 className="text-2xl font-bold">Verify your Vendor account</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-white/65">Enter the Vendor ID sent after registration and your current Vendor password. We use Supabase Auth to verify ownership; passwords are never compared with or stored in the vendors table.</p>
            <form onSubmit={verifyVendor} className="mt-4 space-y-3">
              <label className="block space-y-1.5 text-sm font-semibold"><span>Vendor ID</span><input className="kyc-input" name="vendor_id" aria-label="Vendor ID" placeholder="e.g. VEN-0098" autoComplete="username" value={credentials.vendorCode} onChange={(event) => setCredentials((current) => ({ ...current, vendorCode: event.target.value.toUpperCase() }))} /></label>
              <label className="block space-y-1.5 text-sm font-semibold"><span>Vendor password</span><div className="relative"><input className="kyc-input pr-12" name="vendor_password" aria-label="Vendor password" placeholder="Enter your current Vendor password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} /><button type="button" className="kyc-eye-button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((show) => !show)}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></label>
              {eligibilityMessage && <div className="rounded-lg border border-[#f0b429]/45 bg-[#f0b429]/10 p-3 text-sm text-white">{eligibilityMessage}</div>}
              <Button type="submit" disabled={isAuthenticating} className="vendor-yellow-button min-h-10 w-full text-sm">{isAuthenticating && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}Verify &amp; continue</Button>
              <div className="grid gap-2 text-xs sm:grid-cols-2"><Link className="text-[#f0b429] underline" to="/vendor-registration">Need a Vendor ID? Register</Link><span className="text-white/50">Password recovery is available in the Vendor App.</span></div>
            </form>
          </section>
        ) : wizardStep === 7 ? (
          <section className="mx-auto max-w-2xl rounded-2xl border border-green-400/35 bg-[#343a35] p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-400/15 text-green-300"><Check className="h-8 w-8" /></div>
            <h2 className="mt-5 text-3xl font-bold">Application submitted</h2>
            <p className="mt-3 text-white/70">Your KYC application is now pending review. Your temporary website session and saved device draft have been cleared.</p>
            <p className="mt-5 rounded-lg bg-black/20 p-4 font-mono text-[#f0b429]">Reference: {confirmationReference}</p>
            <Button className="vendor-yellow-button mt-6" onClick={() => navigate("/")}>Return to PaySME</Button>
          </section>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-white/12 bg-[#303630] p-4 lg:sticky lg:top-24 lg:self-start">
              <div className="mb-4 overflow-x-auto lg:overflow-visible">
                <ol className="flex min-w-max gap-2 lg:min-w-0 lg:flex-col">
                  {steps.map((label, index) => {
                    const currentIndex = wizardStep;
                    const complete = index < currentIndex;
                    const active = index === currentIndex;
                    return <li key={label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${active ? "bg-[#f0b429] text-[#1e2320]" : complete ? "bg-white/10 text-white" : "text-white/45"}`}><span className="flex h-6 w-6 items-center justify-center rounded-full border border-current">{complete ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>{label}</li>;
                  })}
                </ol>
              </div>
              <div className="rounded-lg border border-[#f0b429]/25 bg-[#f0b429]/8 p-3 text-xs leading-relaxed text-white/70">Your progress and selected documents are saved automatically on this device.</div>
              <button type="button" className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-red-300/25 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/10" onClick={discardDraft}><Trash2 className="h-4 w-4" />Discard draft</button>
            </aside>

            <section className="kyc-card">
              {wizardStep === 1 && <>
                <h2>Business details</h2><p className="kyc-step-copy">Tell us about the business applying for KYC and a Token Advance.</p>
                <div className="kyc-form-grid">
                  <Field label="Business name" value={form.businessName} onChange={(value) => setForm((current) => ({ ...current, businessName: value }))} />
                  <label className="space-y-1.5 text-sm font-semibold text-[#242824]"><span>Business type</span><select className="kyc-input" name="business_type" aria-label="Business type" value={form.businessType} onChange={(event) => setForm((current) => ({ ...current, businessType: event.target.value }))}><option value="">Select business type</option><option>Sole Proprietor</option><option>Close Corporation</option><option>PTY LTD</option><option>Non Profit</option><option>NGO</option></select></label>
                  <Field label="BIPA registration number" value={form.bipaRegistrationNumber} onChange={(value) => setForm((current) => ({ ...current, bipaRegistrationNumber: value }))} />
                  <Field label="Business Owner ID number" value={form.businessOwnerIdNumber} onChange={(value) => setForm((current) => ({ ...current, businessOwnerIdNumber: value }))} />
                  <Field label="Business mobile number" value={form.businessMobile} onChange={(value) => setForm((current) => ({ ...current, businessMobile: value }))} type="tel" />
                  <Field label="Business email address" value={form.businessEmail} onChange={(value) => setForm((current) => ({ ...current, businessEmail: value }))} type="email" />
                  {renderAddress("businessAddress", "Business registration address")}
                </div>
              </>}

              {wizardStep === 2 && <>
                <h2>Key Person details</h2><p className="kyc-step-copy">A Key Person is always required and will provide a Digital Signature.</p>
                <div className="kyc-form-grid">
                  <Field label="Full name" value={form.keyPersonFullName} onChange={(value) => setForm((current) => ({ ...current, keyPersonFullName: value }))} />
                  <Field label="Title / Position (optional)" value={form.keyPersonTitle} onChange={(value) => setForm((current) => ({ ...current, keyPersonTitle: value }))} />
                  <Field label="Mobile number" value={form.keyPersonMobile} onChange={(value) => setForm((current) => ({ ...current, keyPersonMobile: value }))} type="tel" />
                  <Field label="Email address" value={form.keyPersonEmail} onChange={(value) => setForm((current) => ({ ...current, keyPersonEmail: value }))} type="email" />
                  <Field label="ID number" value={form.keyPersonIdNumber} onChange={(value) => setForm((current) => ({ ...current, keyPersonIdNumber: value }))} />
                  {renderAddress("keyPersonAddress", "Key Person address")}
                </div>
              </>}

              {wizardStep === 3 && <>
                <h2>Guarantor</h2><p className="kyc-step-copy">Choose whether the Key Person will also act as Guarantor.</p>
                <label className="mb-5 flex items-start gap-3 rounded-xl border border-[#f0b429]/35 bg-[#f0b429]/10 p-4 text-sm font-semibold text-[#252925]"><Checkbox name="key_person_is_guarantor" aria-label="Key Person is also the Guarantor" checked={form.keyPersonIsGuarantor} onCheckedChange={(checked) => setForm((current) => ({ ...current, keyPersonIsGuarantor: checked === true }))} /><span>Key Person is also the Guarantor</span></label>
                {!form.keyPersonIsGuarantor && <div className="kyc-form-grid">
                  <Field label="Guarantor full name" value={form.guarantorFullName} onChange={(value) => setForm((current) => ({ ...current, guarantorFullName: value }))} />
                  <Field label="Guarantor email address" value={form.guarantorEmail} onChange={(value) => setForm((current) => ({ ...current, guarantorEmail: value }))} type="email" />
                  <Field label="Guarantor mobile number" value={form.guarantorMobile} onChange={(value) => setForm((current) => ({ ...current, guarantorMobile: value }))} type="tel" />
                  <Field label="Guarantor ID number" value={form.guarantorIdNumber} onChange={(value) => setForm((current) => ({ ...current, guarantorIdNumber: value }))} />
                  {renderAddress("guarantorAddress", "Guarantor address")}
                </div>}
                <div className="mt-5 rounded-xl border border-[#f0b429]/40 bg-[#f0b429]/10 p-4 text-sm font-semibold text-[#252925]">The Key Person or nominated Guarantor is ultimately responsible for the monthly Token Advance payments.</div>
              </>}

              {wizardStep === 4 && <>
                <h2>Required documents</h2><p className="kyc-step-copy">Private documents are saved locally for refresh protection and uploaded only to the protected Vendor KYC bucket.</p>
                <div className="mb-5 rounded-xl border border-[#f0b429]/35 bg-[#f0b429]/10 p-4 text-sm text-[#252925]"><p className="font-bold">Guarantor Agreement</p><p className="mt-1">Download the Guarantor Agreement, complete it, sign and stamp it, then upload it below.</p><a href="https://www.paysme.site/token-advances" className="mt-2 inline-block font-bold underline" target="_blank" rel="noreferrer">Open Token Advance information</a></div>
                {Array.from(new Set(requiredDocuments.map((document) => document.group))).map((group) => <div key={group} className="mb-6"><h3 className="mb-3 text-lg font-bold text-[#b67800]">{group}</h3><div className="space-y-3">{requiredDocuments.filter((document) => document.group === group).map((document) => <FileField key={document.key} spec={document} file={files[document.key]} onChange={(file) => void updateFile(document.key, file)} />)}</div></div>)}
              </>}

              {wizardStep === 5 && <>
                <h2>Review application</h2><p className="kyc-step-copy">Review all details before requesting Digital Signatures.</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="kyc-review-block"><h3>Business</h3><p>{form.businessName}</p><p>{form.businessType}</p><p>BIPA: {form.bipaRegistrationNumber}</p><p>Owner ID: {form.businessOwnerIdNumber}</p><p>{form.businessMobile} · {form.businessEmail}</p><p>{formatAddress(form.businessAddress)}</p></div>
                  <div className="kyc-review-block"><h3>Key Person</h3><p>{form.keyPersonFullName} · {form.keyPersonTitle}</p><p>{form.keyPersonMobile} · {form.keyPersonEmail}</p><p>ID: {form.keyPersonIdNumber}</p><p>{formatAddress(form.keyPersonAddress)}</p><p className="font-semibold">{form.keyPersonIsGuarantor ? "Key Person is also the Guarantor" : "Separate Guarantor nominated"}</p></div>
                  {!form.keyPersonIsGuarantor && <div className="kyc-review-block"><h3>Guarantor</h3><p>{form.guarantorFullName}</p><p>{form.guarantorMobile} · {form.guarantorEmail}</p><p>ID: {form.guarantorIdNumber}</p><p>{formatAddress(form.guarantorAddress)}</p></div>}
                  <div className="kyc-review-block"><h3>Documents</h3>{requiredDocuments.map((document) => <p key={document.key} className="flex items-center gap-2"><Check className="h-4 w-4 text-green-700" />{document.label}</p>)}</div>
                </div>
                <div className="mt-5 rounded-xl border border-[#f0b429]/45 bg-[#f0b429]/10 p-4 text-sm font-semibold text-[#252925]">The Key Person or nominated Guarantor is ultimately responsible for monthly Token Advance payments. Review the <a className="underline" href="https://www.paysme.site/token-advances" target="_blank" rel="noreferrer">Token Advance information and Guarantor Agreement</a> before submission.</div>
              </>}

              {wizardStep === 6 && <>
                <h2>Digital Signatures</h2><p className="kyc-step-copy">Enter the six-digit codes sent separately by SMS and email. Codes expire after 15 minutes and are never saved in your browser draft.</p>
                {!signaturesSent ? <Button className="vendor-yellow-button" disabled={isBusy} onClick={requestSignatures}>{isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send Digital Signatures</Button> : <form onSubmit={submitApplication} className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-1.5 text-sm font-semibold text-[#252925]"><span>Key Person SMS Digital Signature {signatureDestinations.keyPersonMobile && `(${signatureDestinations.keyPersonMobile})`}</span><div className="relative"><input className="kyc-input pr-12 font-mono tracking-[0.35em]" name="key_person_sms_signature" aria-label="Key Person SMS Digital Signature" placeholder="Enter 6-digit SMS code" inputMode="numeric" maxLength={6} type={showSignatures.keyPerson ? "text" : "password"} value={signatureCodes.keyPerson} onChange={(event) => setSignatureCodes((current) => ({ ...current, keyPerson: event.target.value.replace(/\D/g, "").slice(0, 6) }))} /><button type="button" className="kyc-eye-button" aria-label="Show Key Person SMS code" onClick={() => setShowSignatures((current) => ({ ...current, keyPerson: !current.keyPerson }))}>{showSignatures.keyPerson ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></label>
                    <label className="block space-y-1.5 text-sm font-semibold text-[#252925]"><span>Key Person email code {signatureDestinations.keyPersonEmail && `(${signatureDestinations.keyPersonEmail})`}</span><div className="relative"><input className="kyc-input pr-12 font-mono tracking-[0.35em]" name="key_person_email_signature" aria-label="Key Person email Digital Signature" placeholder="Enter 6-digit email code" inputMode="numeric" maxLength={6} type={showSignatures.keyPersonEmail ? "text" : "password"} value={signatureCodes.keyPersonEmail} onChange={(event) => setSignatureCodes((current) => ({ ...current, keyPersonEmail: event.target.value.replace(/\D/g, "").slice(0, 6) }))} /><button type="button" className="kyc-eye-button" aria-label="Show Key Person email code" onClick={() => setShowSignatures((current) => ({ ...current, keyPersonEmail: !current.keyPersonEmail }))}>{showSignatures.keyPersonEmail ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></label>
                    {!form.keyPersonIsGuarantor && <>
                      <label className="block space-y-1.5 text-sm font-semibold text-[#252925]"><span>Guarantor SMS Digital Signature {signatureDestinations.guarantorMobile && `(${signatureDestinations.guarantorMobile})`}</span><div className="relative"><input className="kyc-input pr-12 font-mono tracking-[0.35em]" name="guarantor_sms_signature" aria-label="Guarantor SMS Digital Signature" placeholder="Enter 6-digit SMS code" inputMode="numeric" maxLength={6} type={showSignatures.guarantor ? "text" : "password"} value={signatureCodes.guarantor} onChange={(event) => setSignatureCodes((current) => ({ ...current, guarantor: event.target.value.replace(/\D/g, "").slice(0, 6) }))} /><button type="button" className="kyc-eye-button" aria-label="Show Guarantor SMS code" onClick={() => setShowSignatures((current) => ({ ...current, guarantor: !current.guarantor }))}>{showSignatures.guarantor ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></label>
                      <label className="block space-y-1.5 text-sm font-semibold text-[#252925]"><span>Guarantor email code {signatureDestinations.guarantorEmail && `(${signatureDestinations.guarantorEmail})`}</span><div className="relative"><input className="kyc-input pr-12 font-mono tracking-[0.35em]" name="guarantor_email_signature" aria-label="Guarantor email Digital Signature" placeholder="Enter 6-digit email code" inputMode="numeric" maxLength={6} type={showSignatures.guarantorEmail ? "text" : "password"} value={signatureCodes.guarantorEmail} onChange={(event) => setSignatureCodes((current) => ({ ...current, guarantorEmail: event.target.value.replace(/\D/g, "").slice(0, 6) }))} /><button type="button" className="kyc-eye-button" aria-label="Show Guarantor email code" onClick={() => setShowSignatures((current) => ({ ...current, guarantorEmail: !current.guarantorEmail }))}>{showSignatures.guarantorEmail ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></label>
                    </>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3"><Button type="button" variant="outline" onClick={() => void endTemporarySession()}>Cancel</Button><Button type="button" variant="outline" disabled={isBusy} onClick={resendSignatures}>Resend codes</Button><Button type="submit" disabled={isBusy} className="vendor-yellow-button">{isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Validate &amp; Submit</Button></div>
                </form>}
              </>}

              {wizardStep < 6 && <div className="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-gray-200 pt-5 sm:flex-row"><Button type="button" variant="outline" disabled={wizardStep === 1} onClick={() => setWizardStep((step) => Math.max(1, step - 1))}>Back</Button>{wizardStep === 5 ? <Button type="button" className="vendor-yellow-button" disabled={isBusy} onClick={requestSignatures}>{isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit &amp; send Digital Signatures</Button> : <Button type="button" className="vendor-yellow-button" onClick={goNext}>Next</Button>}</div>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default VendorKyc;
