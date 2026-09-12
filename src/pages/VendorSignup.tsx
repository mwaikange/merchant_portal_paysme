import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Check, CheckCircle2, Download, Loader2, RefreshCcw, ShieldCheck, Smartphone, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TownAutocomplete } from "@/components/TownAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { formatNamibianMobile, normalizeNamibianMobile, validateNamibianMobile } from "@/lib/validations";
import { canonicalNamibianTown } from "@/lib/namibianTowns";
import { useToast } from "@/hooks/use-toast";

const paysmeLogoMain = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
const APK_URL = "/PaySME-Vendor.apk";
const APK_QR_URL = "/images/paysme-vendor-apk-qr.png";
const MAX_REGISTRATION_FILE_SIZE = 4 * 1024 * 1024;
const REGISTRATION_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

const readFunctionError = async (error: unknown, fallback: string) => {
  const functionError = error as { context?: Response; message?: string };
  let message = functionError?.message || fallback;

  if (functionError?.context instanceof Response) {
    try {
      const payload = await functionError.context.clone().json() as { error?: string; message?: string };
      message = payload.error || payload.message || message;
    } catch {
      // Keep the supplied error message when the Edge Function body is not JSON.
    }
  }

  return message;
};

const classifyRegistrationError = (message: string) => {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("idx_pending_vendor_active_mobile_unique") ||
    (normalized.includes("pending_vendor_registrations") && normalized.includes("duplicate key"))
  ) {
    return {
      title: "Registration already pending",
      description: "This mobile number already has a pending vendor registration. Please use the confirmation SMS already sent, or contact PaySME support if the code has expired.",
    };
  }

  if (
    normalized.includes("idx_vendors_mobile_number_unique") ||
    normalized.includes("already registered") ||
    normalized.includes("active vendor account")
  ) {
    return {
      title: "Vendor account already exists",
      description: "An active vendor account already exists for this mobile number. Please download or open the PaySME Vendor App and sign in.",
    };
  }

  return {
    title: "Vendor registration failed",
    description: message || "Please try again.",
  };
};

type FormState = {
  firstName: string;
  surname: string;
  idNumber: string;
  email: string;
  mobile: string;
  town: string;
  referrerCode: string;
  termsAccepted: boolean;
  idFront: File | null;
  idBack: File | null;
  selfieWithId: {
    base64: string;
    contentType: string;
    fileName: string;
  } | null;
};

type RegisterResponse = {
  registration_id: string;
  vendor_id: string;
  masked_mobile: string;
  sms_expires_at?: string;
  message: string;
};

type ResendResponse = {
  registration_id: string;
  masked_mobile: string;
  sms_expires_at: string;
  message: string;
};

type VerifyResponse = {
  vendor_code: string;
  email_sent: boolean;
  message: string;
};

type SelfieCapture = NonNullable<FormState["selfieWithId"]>;

const initialForm: FormState = {
  firstName: "",
  surname: "",
  idNumber: "",
  email: "",
  mobile: "",
  town: "",
  referrerCode: "",
  termsAccepted: false,
  idFront: null,
  idBack: null,
  selfieWithId: null,
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

const FileField = ({
  id,
  label,
  file,
  onChange,
}: {
  id: string;
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) => (
    <div className="space-y-1.5">
    <Label htmlFor={id} className="text-white">{label}</Label>
    <label
      htmlFor={id}
      className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md border border-white/20 bg-black/20 px-3 text-sm text-white transition hover:border-[#f0b429]"
    >
      <span className="truncate">{file ? file.name : "Choose file"}</span>
      <Upload className="h-4 w-4 shrink-0 text-paysme-orange" />
    </label>
    <Input
      id={id}
      type="file"
      accept="image/*,.pdf"
      className="sr-only"
      onChange={(event) => onChange(event.target.files?.[0] || null)}
    />
  </div>
);

const VendorSignup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initialForm);
  const [smsCode, setSmsCode] = useState("");
  const [step, setStep] = useState<"form" | "sms" | "confirmed">("form");
  const [registration, setRegistration] = useState<RegisterResponse | null>(null);
  const [confirmed, setConfirmed] = useState<VerifyResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "starting" | "ready" | "unavailable">("idle");
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraOverlayOpen, setCameraOverlayOpen] = useState(false);
  const [pendingSelfie, setPendingSelfie] = useState<SelfieCapture | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const mobileValid = useMemo(() => validateNamibianMobile(form.mobile), [form.mobile]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (cameraStatus === "ready" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play();
    }
  }, [cameraStatus]);

  useEffect(() => {
    if (step !== "sms" || !resendAvailableAt) return;

    const updateCountdown = () => {
      setResendSeconds(Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)));
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendAvailableAt]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateRegistrationFile = (key: "idFront" | "idBack", file: File | null) => {
    if (file && (!REGISTRATION_FILE_TYPES.has(file.type) || file.size > MAX_REGISTRATION_FILE_SIZE)) {
      toast({ title: "Document not accepted", description: "Use a PDF, JPG, PNG or WEBP file no larger than 4 MB.", variant: "destructive" });
      return;
    }
    update(key, file);
  };

  const validateForm = () => {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
    const idValid = /^[A-Za-z0-9]{5,30}$/.test(form.idNumber.trim().replace(/\s+/g, ""));

    if (!form.firstName.trim()) return "First name is required.";
    if (!form.surname.trim()) return "Surname is required.";
    if (!idValid) return "Please enter a valid ID number.";
    if (!emailValid) return "Please enter a valid email address.";
    if (!mobileValid) return "Please enter a valid Namibian mobile number.";
    if (!canonicalNamibianTown(form.town)) return "Please select a valid Namibian town.";
    if (form.referrerCode && !/^\d{6}$/.test(form.referrerCode)) return "Referrer code must contain exactly 6 digits.";
    if (!form.idFront) return "Please upload the front of the ID.";
    if (!form.idBack) return "Please upload the back of the ID.";
    if (!form.selfieWithId) return "Please take a live selfie while holding your ID.";
    if (!form.termsAccepted) return "Please accept the Terms & Conditions.";
    return null;
  };

  const startCamera = async () => {
    setCameraOverlayOpen(true);
    setPendingSelfie(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      setCameraMessage("This device or browser does not have camera access. Please download the PaySME Vendor App and register from your phone.");
      return;
    }

    setCameraStatus("starting");
    setCameraMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setCameraStatus("ready");
    } catch {
      setCameraStatus("unavailable");
      setCameraMessage("Camera access was not available. Please download the PaySME Vendor App and register from your phone.");
    }
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      toast({
        title: "Camera not ready",
        description: "Please open the camera and wait for the preview before taking the selfie.",
        variant: "destructive",
      });
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    const captured = {
      base64: dataUrl.split(",")[1] || "",
      contentType: "image/jpeg",
      fileName: "selfie-with-id.jpg",
    };
    setPendingSelfie(captured);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStatus("idle");
  };

  const closeCameraOverlay = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStatus("idle");
    setCameraOverlayOpen(false);
    setPendingSelfie(null);
  };

  const acceptSelfie = () => {
    if (!pendingSelfie) return;
    update("selfieWithId", pendingSelfie);
    setCameraOverlayOpen(false);
    setPendingSelfie(null);
    toast({
      title: "Selfie accepted",
      description: "Your live selfie holding your ID has been added to the registration.",
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      toast({ title: "Check the form", description: validationError, variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const [idFrontBase64, idBackBase64] = await Promise.all([
        fileToBase64(form.idFront!),
        fileToBase64(form.idBack!),
      ]);

      const { data, error } = await supabase.functions.invoke<RegisterResponse>("vendor-registration", {
        body: {
          action: "register",
          vendor: {
            first_name: form.firstName.trim(),
            surname: form.surname.trim(),
            id_number: form.idNumber.trim(),
            email: form.email.trim().toLowerCase(),
            mobile_number: normalizeNamibianMobile(form.mobile),
            town: canonicalNamibianTown(form.town),
            referrer_code: form.referrerCode || null,
            terms_accepted: form.termsAccepted,
          },
          documents: {
            id_front: {
              file_name: form.idFront!.name,
              content_type: form.idFront!.type || "application/octet-stream",
              base64: idFrontBase64,
            },
            id_back: {
              file_name: form.idBack!.name,
              content_type: form.idBack!.type || "application/octet-stream",
              base64: idBackBase64,
            },
            selfie_with_id: {
              file_name: form.selfieWithId!.fileName,
              content_type: form.selfieWithId!.contentType,
              base64: form.selfieWithId!.base64,
            },
          },
        },
      });

      if (error) throw error;
      if (!data?.registration_id) throw new Error("Registration did not return a confirmation reference.");

      const expiresAt = data.sms_expires_at ? new Date(data.sms_expires_at).getTime() : Date.now() + 15 * 60 * 1000;
      setRegistration(data);
      setResendAvailableAt(expiresAt);
      setResendSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
      setStep("sms");
      toast({
        title: "Confirmation code sent",
        description: "Enter the 6-digit code sent to the vendor mobile number.",
      });
    } catch (error: unknown) {
      const registrationError = classifyRegistrationError(await readFunctionError(error, "Please try again."));
      toast({
        title: registrationError.title,
        description: registrationError.description,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifySms = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!registration?.registration_id || !/^\d{6}$/.test(smsCode.trim())) {
      toast({ title: "Invalid code", description: "Enter the 6-digit SMS confirmation code.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke<VerifyResponse>("vendor-registration", {
        body: {
          action: "verify_sms",
          registration_id: registration.registration_id,
          code: smsCode.trim(),
        },
      });

      if (error) throw error;
      if (!data?.vendor_code) throw new Error("Confirmation did not return a Vendor ID.");
      setConfirmed(data);
      setStep("confirmed");
    } catch (error: unknown) {
      toast({
        title: "SMS confirmation failed",
        description: await readFunctionError(error, "Please check the code and try again."),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendSms = async () => {
    if (!registration?.registration_id || resendSeconds > 0 || resendAvailableAt > Date.now() || isResending) return;

    setIsResending(true);
    try {
      const { data, error } = await supabase.functions.invoke<ResendResponse>("vendor-registration", {
        body: {
          action: "resend_sms",
          registration_id: registration.registration_id,
        },
      });

      if (error) throw error;
      if (!data?.sms_expires_at) throw new Error("The resend request did not return a new expiry time.");

      const expiresAt = new Date(data.sms_expires_at).getTime();
      setRegistration((current) => current ? { ...current, masked_mobile: data.masked_mobile || current.masked_mobile } : current);
      setResendAvailableAt(expiresAt);
      setResendSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
      setSmsCode("");
      toast({
        title: "New confirmation code sent",
        description: "Enter the new 6-digit code sent to the vendor mobile number.",
      });
    } catch (error: unknown) {
      toast({
        title: "Could not resend code",
        description: await readFunctionError(error, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  const resendCountdown = `${Math.floor(resendSeconds / 60)}:${String(resendSeconds % 60).padStart(2, "0")}`;

  const selfiePreview = form.selfieWithId
    ? `data:${form.selfieWithId.contentType};base64,${form.selfieWithId.base64}`
    : "";
  const pendingSelfiePreview = pendingSelfie
    ? `data:${pendingSelfie.contentType};base64,${pendingSelfie.base64}`
    : "";

  return <>
    <div className="vendor-signup-page h-screen overflow-hidden bg-gradient-professional text-white">
      <header className="vendor-signup-header h-[64px] border-b border-white/15 bg-[#353533] py-2">
        <div className="container mx-auto flex items-center justify-between px-4">
          <img src={paysmeLogoMain} alt="PaySME Logo" className="vendor-header-logo h-auto cursor-pointer" onClick={() => navigate("/")} />
          <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-[#f0b429]" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Back to PaySME Website</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </div>
      </header>

      <main className="vendor-signup-main container mx-auto grid h-[calc(100vh-64px)] min-h-0 gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="vendor-signup-card min-h-0 rounded-lg border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur-md">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#f0b429]">Vendor registration</p>
          <h1 className="mb-1 text-xl font-bold leading-tight">Create a PaySME Prepaid Vendor account</h1>
          <p className="mb-2 max-w-3xl text-xs leading-relaxed text-white/75">
            This is basic registration only. Business Vendor services and Token Advances are available later after the required approval process.
          </p>

          {step === "form" && (
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="grid gap-x-3 gap-y-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="first-name" className="text-white">First name</Label>
                  <Input id="first-name" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} className="h-9 bg-black/20" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="surname" className="text-white">Surname</Label>
                  <Input id="surname" value={form.surname} onChange={(event) => update("surname", event.target.value)} className="h-9 bg-black/20" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="id-number" className="text-white">ID number</Label>
                  <Input id="id-number" value={form.idNumber} onChange={(event) => update("idNumber", event.target.value)} className="h-9 bg-black/20" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="town" className="text-white">Town</Label>
                  <TownAutocomplete
                    id="town"
                    value={form.town}
                    onValueChange={(value) => update("town", value)}
                    placeholder="Type at least 3 letters"
                    autoComplete="off"
                    className="h-9 bg-black/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="referrer-code" className="text-white">Referrer code <span className="text-white/50">(optional)</span></Label>
                  <Input
                    id="referrer-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={form.referrerCode}
                    onChange={(event) => update("referrerCode", event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6 digits"
                    className="h-9 bg-black/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-white">Email address</Label>
                  <Input id="email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className="h-9 bg-black/20" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mobile" className="text-white">Mobile number</Label>
                  <Input
                    id="mobile"
                    value={form.mobile}
                    onChange={(event) => update("mobile", formatNamibianMobile(event.target.value))}
                    placeholder="+264 81 000 0000"
                    className="h-9 bg-black/20"
                  />
                </div>
                <FileField id="id-front" label="Upload ID front" file={form.idFront} onChange={(file) => updateRegistrationFile("idFront", file)} />
                <FileField id="id-back" label="Upload ID back" file={form.idBack} onChange={(file) => updateRegistrationFile("idBack", file)} />
                <div className="space-y-1.5">
                  <Label className="text-white">Live selfie holding ID</Label>
                  <div className="rounded-md border border-white/20 bg-black/20 p-2">
                    {form.selfieWithId ? (
                      <img src={selfiePreview} alt="Accepted selfie holding ID" className="h-20 w-full rounded object-cover" />
                    ) : (
                      <div className="flex h-20 items-center justify-center rounded border border-dashed border-white/25 text-xs text-white/65">
                        Open the camera to take your live selfie
                      </div>
                    )}
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={startCamera}
                        disabled={cameraStatus === "starting"}
                        className="vendor-mini-action w-full"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {cameraStatus === "starting" ? "Opening..." : form.selfieWithId ? "Retake selfie" : "Open camera"}
                      </button>
                    </div>
                    {cameraStatus === "unavailable" && (
                      <a className="mt-2 block text-center text-xs font-semibold text-[#f0b429] underline" href={APK_URL}>
                        Download app and register from phone
                      </a>
                    )}
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              </div>

              <label className="flex items-start gap-2 rounded-md border border-white/15 bg-black/15 p-1.5 text-xs text-white/85">
                <Checkbox checked={form.termsAccepted} onCheckedChange={(checked) => update("termsAccepted", checked === true)} className="mt-1" />
                <span>
                  I accept the PaySME <Link to="/vendor-terms" className="text-[#f0b429] underline">Vendor Terms & Conditions</Link>. I understand this creates a Prepaid Vendor account only.
                </span>
              </label>

              <Button type="submit" disabled={isSubmitting} className="vendor-yellow-button h-9 w-full py-1.5 text-sm font-bold">
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                Submit vendor registration
              </Button>
            </form>
          )}

          {step === "sms" && registration && (
            <form onSubmit={handleVerifySms} className="max-w-xl space-y-6">
              <div className="rounded-lg border border-paysme-orange/40 bg-paysme-orange/10 p-5">
                <h2 className="mb-2 text-2xl font-semibold">Vendor registration submitted.</h2>
                <p className="text-white/80">
                  We have sent a confirmation code to your mobile number {registration.masked_mobile}. Please enter the code to activate your PaySME Vendor account.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="sms-code" className="text-white">SMS confirmation code</Label>
                  <button
                    type="button"
                    onClick={handleResendSms}
                    disabled={resendSeconds > 0 || resendAvailableAt > Date.now() || isResending}
                    className="vendor-resend-button"
                  >
                    {isResending ? "Sending…" : resendSeconds > 0 ? `Resend in ${resendCountdown}` : "Resend code"}
                  </button>
                </div>
                <Input
                  id="sms-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={smsCode}
                  onChange={(event) => setSmsCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="bg-white/95 text-center text-2xl tracking-[0.45em]"
                  placeholder="000000"
                />
              </div>
              <Button type="submit" disabled={isSubmitting} className="vendor-yellow-button w-full py-6 text-base font-bold">
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                Confirm account
              </Button>
            </form>
          )}

          {step === "confirmed" && confirmed && (
            <div className="max-w-2xl rounded-lg border border-green-400/40 bg-green-500/10 p-6">
              <CheckCircle2 className="mb-4 h-12 w-12 text-green-300" />
              <h2 className="mb-3 text-2xl font-bold">Account confirmed successfully.</h2>
              <p className="mb-5 text-white/80">
                Your PaySME Vendor ID and temporary password have been sent by SMS. Please install/open the PaySME Android Vendor App, sign in, change your password, and set your 5-digit authorization PIN to start processing payments.
              </p>
              {!confirmed.email_sent && (
                <p className="mb-5 rounded-md border border-paysme-orange/30 bg-paysme-orange/10 p-3 text-sm text-white/80">
                  SMS confirmation succeeded, but the email could not be sent. The vendor can still use the Android Vendor App with the SMS details.
                </p>
              )}
              <p className="mb-6 rounded-md bg-black/20 p-3 text-sm text-white/70">Vendor ID: <span className="font-semibold text-white">{confirmed.vendor_code}</span></p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild className="vendor-yellow-button">
                  <a href={APK_URL} download>Download Android APK</a>
                </Button>
              </div>
              <p className="mt-3 text-xs font-semibold text-[#f0b429]">Android devices only.</p>
              <p className="mt-4 text-sm text-white/70">Registration is complete. Continue in the PaySME Vendor App using the Vendor ID and temporary password sent by SMS.</p>
            </div>
          )}
        </section>

        <aside className="vendor-signup-aside grid gap-3">
          <div className={`rounded-lg border p-3 backdrop-blur-md ${step === "confirmed" ? "border-[#f0b429] bg-[#f0b429]/15 shadow-[0_0_0_3px_rgba(240,180,41,0.16)]" : "border-white/15 bg-white/10"}`}>
            <Smartphone className="mb-1 h-6 w-6 text-[#f0b429]" />
            <h2 className="mb-1 text-lg font-semibold">{step === "confirmed" ? "Download the Vendor App" : "Already registered?"}</h2>
            <p className="mb-2 text-xs leading-snug text-white/70">{step === "confirmed" ? "Your account is ready. Download the app and sign in with the Vendor ID and temporary password sent by SMS." : "Vendor login happens in the PaySME Android Vendor App, not on the website."}</p>
            <div className="mb-2 hidden items-center gap-3 lg:flex">
              <div className="shrink-0 rounded-md bg-white p-1.5">
                <img src={APK_QR_URL} alt="QR code to download the PaySME Vendor Android APK" className="h-20 w-20" />
              </div>
              <p className="text-xs leading-snug text-white/75">Scan with an Android phone camera to download the app.</p>
            </div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#f0b429]">Android devices only</p>
            <a className="vendor-side-action gap-2" href={APK_URL} download>
              <Download className="h-4 w-4" />
              {step === "confirmed" ? "Download PaySME Vendor APK" : "Download Android APK"}
            </a>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur-md">
            <ShieldCheck className="mb-1 h-6 w-6 text-[#f0b429]" />
            <h2 className="mb-1 text-lg font-semibold">Already have a Vendor ID?</h2>
            <p className="mb-3 text-xs leading-snug text-white/70">Complete Vendor KYC and prepare a Token Advance application from this browser.</p>
            <Link className="vendor-side-action" to="/vendor-kyc">Complete Vendor KYC</Link>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur-md">
            <h2 className="mb-1 text-lg font-semibold">Merchant?</h2>
            <p className="mb-3 text-xs leading-snug text-white/70">Use the merchant portal for website checkout, subscriptions, and payment links.</p>
            <Link className="vendor-side-action" to="/auth">
              Go to Merchant Portal
            </Link>
          </div>
        </aside>
      </main>
    </div>
    {cameraOverlayOpen && createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Take live selfie holding ID">
        <div className="w-full max-w-3xl rounded-2xl border border-[#f0b429]/70 bg-[#252a26] p-4 text-white shadow-2xl sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f0b429]">Live identity photo</p>
              <h2 className="mt-1 text-2xl font-bold">Take a selfie while holding your ID</h2>
              <p className="mt-1 text-sm text-white/65">Make sure your face and the details on your ID are clearly visible.</p>
            </div>
            <button type="button" onClick={closeCameraOverlay} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white" aria-label="Close camera"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black sm:min-h-[430px]">
            {pendingSelfie ? (
              <img src={pendingSelfiePreview} alt="Selfie preview awaiting confirmation" className="max-h-[62vh] w-full object-contain" />
            ) : cameraStatus === "ready" ? (
              <video ref={videoRef} className="max-h-[62vh] w-full object-contain" muted playsInline />
            ) : cameraStatus === "starting" ? (
              <div className="flex flex-col items-center gap-3 text-white/75"><Loader2 className="h-8 w-8 animate-spin text-[#f0b429]" /><span>Opening camera…</span></div>
            ) : (
              <div className="max-w-md px-6 text-center text-white/75"><Camera className="mx-auto mb-3 h-10 w-10 text-[#f0b429]" /><p>{cameraMessage || "The camera is not available. Close this window and try again."}</p></div>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {pendingSelfie ? <>
              <button type="button" onClick={startCamera} className="vendor-camera-secondary"><RefreshCcw className="h-4 w-4" />Retake selfie</button>
              <button type="button" onClick={acceptSelfie} className="vendor-camera-primary"><Check className="h-4 w-4" />Accept selfie</button>
            </> : <>
              <button type="button" onClick={closeCameraOverlay} className="vendor-camera-secondary">Cancel</button>
              <button type="button" onClick={captureSelfie} disabled={cameraStatus !== "ready"} className="vendor-camera-primary"><Camera className="h-4 w-4" />Take photo</button>
            </>}
          </div>
        </div>
      </div>,
      document.body,
    )}
  </>;
};

export default VendorSignup;
