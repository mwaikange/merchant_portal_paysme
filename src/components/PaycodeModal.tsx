import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import paysmeLogo from "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
import paysmeIconFavicon from "/lovable-uploads/dbccc228-0438-4dda-a3d7-0d7ab713aef3.png";

type CheckoutEligibility = {
  billing?: {
    locked?: boolean;
    reason?: string | null;
  };
  methods?: Record<string, {
    enabled?: boolean;
    reason?: string | null;
  }>;
};

type MobiWandProvider = "mtc_maris" | "paypulse" | "paytoday" | "kazang";

const mobiWandProviders: Record<MobiWandProvider, { name: string; accountName: string; logo: string }> = {
  mtc_maris: { name: "MTC Maris", accountName: "MTC Maris", logo: "/pay-home/facilitators/maris.jpg" },
  paypulse: { name: "PayPulse", accountName: "PayPulse", logo: "/pay-home/facilitators/paypulse.png" },
  paytoday: { name: "PayToday", accountName: "PayToday USSD", logo: "/pay-home/facilitators/paytoday-payment.png" },
  kazang: { name: "Kazang", accountName: "Kazang", logo: "/pay-home/facilitators/kazang.png" },
};

type AdumoInitResponse = {
  adumo_url: string;
  merchant_id: string;
  application_id: string;
  mref: string;
  token: string;
  redirect_success_url: string;
  redirect_failed_url: string;
  currency_code?: string;
  currency_override_enabled?: boolean;
  puid?: string;
};

type WayaMePaymentResponse = {
  request_id: string;
  status: string;
  simulation?: boolean;
  merchant_name?: string;
  merchant_alias?: string;
  amount?: number;
  currency?: string;
  qr_image?: string | null;
  app_intent?: string | null;
  expires_at?: string | null;
};

interface PaycodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  generatedCode: string;
  renderInPortal?: boolean;
  mobileBrandedPage?: boolean;
  paymentData: {
    town: string;
    mobile: string;
    email: string;
    subscribe: boolean;
    businessName?: string;
    amount?: string;
    invoiceId?: string;
    recurring?: boolean;
    recurringPeriod?: string;
    merchantId?: string;
    taxMode?: "not_registered" | "vat_inclusive" | "vat_exclusive";
    vatRate?: number;
    netAmount?: number | string;
    vatAmount?: number | string;
    grossAmount?: number | string;
    vendorRedeemable?: boolean | null;
    paymentPurpose?: string | null;
    allowedPaymentMethods?: string[];
  } | null;
}

export function PaycodeModal({
  isOpen,
  onClose,
  generatedCode,
  renderInPortal = false,
  mobileBrandedPage = false,
  paymentData
}: PaycodeModalProps) {
  const { toast } = useToast();
  const [cardLoading, setCardLoading] = useState(false);
  const [eligibility, setEligibility] = useState<CheckoutEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [mobiWandProvider, setMobiWandProvider] = useState<MobiWandProvider | null>(null);
  const [mobiWandLoading, setMobiWandLoading] = useState(false);
  const [mobiWandError, setMobiWandError] = useState<string | null>(null);
  const [mobiWandStep, setMobiWandStep] = useState<"warning" | "code" | "waiting" | "passed">("warning");
  const [mobiWandCode, setMobiWandCode] = useState("");
  const [mobiWandSeconds, setMobiWandSeconds] = useState(180);
  const [mobiWandApprovalSeconds, setMobiWandApprovalSeconds] = useState(7);
  const [wayameOpen, setWayameOpen] = useState(false);
  const [wayameLoading, setWayameLoading] = useState(false);
  const [wayameError, setWayameError] = useState<string | null>(null);
  const [wayamePayment, setWayamePayment] = useState<WayaMePaymentResponse | null>(null);
  const [wayameSimulationStep, setWayameSimulationStep] = useState<"idle" | "waiting" | "passed">("idle");
  const [wayameSimulationSeconds, setWayameSimulationSeconds] = useState(7);

  useEffect(() => {
    const fetchEligibility = async () => {
      if (!isOpen || !paymentData?.merchantId) return;
      setEligibilityLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("checkout-eligibility", {
          body: {
            merchant_id: paymentData.merchantId,
            amount_nad: Number(paymentData.amount || "0"),
            hosted_payment: true,
          },
        });
        if (error) throw new Error(error.message);
        setEligibility(data || null);
      } catch (err) {
        console.error("Checkout eligibility failed:", err);
        setEligibility(null);
      } finally {
        setEligibilityLoading(false);
      }
    };

    fetchEligibility();
  }, [isOpen, paymentData?.merchantId, paymentData?.amount]);

  useEffect(() => {
    if (!mobiWandProvider || mobiWandStep !== "code" || mobiWandSeconds <= 0) return;
    const timer = window.setInterval(() => setMobiWandSeconds(seconds => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [mobiWandProvider, mobiWandStep, mobiWandSeconds]);

  useEffect(() => {
    if (!mobiWandProvider || mobiWandStep !== "waiting") return;
    const timer = window.setInterval(() => {
      setMobiWandApprovalSeconds(seconds => {
        if (seconds <= 1) {
          setMobiWandStep("passed");
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mobiWandProvider, mobiWandStep]);

  useEffect(() => {
    if (!wayameOpen || !wayamePayment?.request_id || wayamePayment.status !== "pending" || wayamePayment.simulation) return;
    let cancelled = false;
    const poll = async () => {
      const { data, error } = await supabase.functions.invoke("wayame-payment", {
        body: {
          action: "status",
          merchant_id: paymentData?.merchantId,
          hosted_payment: true,
          request_id: wayamePayment.request_id,
        },
      });
      if (cancelled) return;
      if (!error && data?.status) {
        setWayamePayment(previous => previous ? { ...previous, ...data } : previous);
        if (data.status === "paid") {
          window.dispatchEvent(new CustomEvent("paysme:payment-success", { detail: { ...data, provider: "wayame" } }));
          toast({ title: "Payment confirmed", description: "WayaMe confirmed this payment." });
          window.setTimeout(onClose, 1400);
          return;
        }
        if (["failed", "declined", "expired", "cancelled"].includes(data.status)) return;
      }
      window.setTimeout(poll, error ? 4000 : 2500);
    };
    const timer = window.setTimeout(poll, 1800);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [wayameOpen, wayamePayment?.request_id, wayamePayment?.status, wayamePayment?.simulation, paymentData?.merchantId, onClose, toast]);

  useEffect(() => {
    if (!wayameOpen || wayameSimulationStep !== "waiting") return;
    const timer = window.setInterval(() => {
      setWayameSimulationSeconds(seconds => {
        if (seconds <= 1) {
          setWayameSimulationStep("passed");
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [wayameOpen, wayameSimulationStep]);

  useEffect(() => {
    if (!isOpen || renderInPortal) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isOpen, renderInPortal]);

  if (!isOpen) return null;

  const methodEnabled = (methodKey: string) =>
    Boolean(eligibility?.methods?.[methodKey]?.enabled);
  const billingLocked = Boolean(eligibility?.billing?.locked);
  const disabledPaymentMessage = "Payments are temporarily disabled for this merchant.";
  const taxMode = paymentData?.taxMode || "not_registered";
  const showsVat = taxMode !== "not_registered";
  const vatRate = Number(paymentData?.vatRate || 0);
  const grossAmount = Number(paymentData?.grossAmount ?? paymentData?.amount ?? 0);
  const isVendorAppPayment = paymentData?.vendorRedeemable === false ||
    ["vendor_token_topup", "vendor_advance_installment"].includes(paymentData?.paymentPurpose || "");
  const vatAmount = Number(paymentData?.vatAmount || 0);
  const netAmount = Number(paymentData?.netAmount ?? (showsVat ? grossAmount - vatAmount : grossAmount));
  const wayameSimulationTime = `${Math.floor(wayameSimulationSeconds / 60)}:${String(wayameSimulationSeconds % 60).padStart(2, "0")}`;
  const mobiWandApprovalTime = `${Math.floor(mobiWandApprovalSeconds / 60)}:${String(mobiWandApprovalSeconds % 60).padStart(2, "0")}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Code Copied!",
      description: "PaySME code copied to clipboard!"
    });
  };


  const friendlyCardError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err || "");
    if (/not available|not configured|limit|hidden|Adumo|merchant code|credential|forbidden|non-2xx|Edge Function/i.test(message)) {
      return "Card payments are not available for this checkout right now. Please use the PaySME code or another available payment method.";
    }
    return "We could not start the card payment. Please try again or use another available payment method.";
  };

  const submitAdumoForm = (data: AdumoInitResponse, targetWindowName?: string) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = data.adumo_url;
    if (targetWindowName) form.target = targetWindowName;
    form.style.display = "none";

    const amount = Number(paymentData?.amount || "10.00").toFixed(2);
    const fields: Record<string, string | undefined> = {
      MerchantID: data.merchant_id,
      ApplicationID: data.application_id,
      MerchantReference: data.mref,
      Amount: amount,
      Token: data.token,
      RedirectSuccessfulURL: data.redirect_success_url,
      RedirectFailedURL: data.redirect_failed_url,
      puid: data.puid,
    };

    // Adumo only accepts AuthoriseCurrencyCode when MCP/FX is enabled for the
    // Application UID. Normal card checkout uses the application's configured
    // ZAR currency and must not force a currency override.
    if (data.currency_override_enabled === true && data.currency_code) {
      fields.AuthoriseCurrencyCode = data.currency_code;
    }

    Object.entries(fields).forEach(([key, value]) => {
      if (!value) return;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const startCardPayment = async () => {
    let cardWindow: Window | null = null;
    let cardWindowName: string | undefined;

    if (renderInPortal) {
      cardWindowName = `paysme_card_${Date.now()}`;
      cardWindow = window.open("", cardWindowName);

      if (!cardWindow) {
        toast({
          title: "Allow the card payment tab",
          description: "Please allow pop-ups for PaySME, then select Pay via Card again.",
          variant: "destructive",
        });
        return;
      }

      cardWindow.opener = null;
      cardWindow.document.title = "Opening secure card payment";
      cardWindow.document.body.style.cssText = "margin:0;min-height:100vh;display:grid;place-items:center;background:#151b18;color:#fff;font-family:Arial,sans-serif";
      const loadingMessage = cardWindow.document.createElement("p");
      loadingMessage.textContent = "Opening secure card payment...";
      loadingMessage.style.cssText = "font-size:16px;font-weight:600";
      cardWindow.document.body.appendChild(loadingMessage);
    }

    setCardLoading(true);
    try {
      const payload = {
        merchant_id: paymentData?.merchantId || "00000000-1986-0026-0000-000000000001",
        amount: paymentData?.amount || "10.00",
        invoice_id: paymentData?.invoiceId || `INV_${Date.now()}`,
        generated_code: generatedCode,
        origin_url: window.location.href,
        town: paymentData?.town || null,
        email: paymentData?.email || null,
        mobile: paymentData?.mobile || null,
        business_name: paymentData?.businessName || "PaySME Store",
      };

      const { data, error } = await supabase.functions.invoke("adumo-card", {
        body: payload,
      });
      if (error) throw new Error(error.message);
      if (!data?.ok || !data?.token) throw new Error(data?.error || "Card payment initiation failed");

      submitAdumoForm(data, cardWindowName);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      cardWindow?.close();
      setCardLoading(false);
      console.error("PaySME Card Error:", err);
      toast({
        title: "Card payment unavailable",
        description: friendlyCardError(err),
        variant: "destructive",
      });
    }
  };

  const confirmMobiWandPayment = () => {
    if (!mobiWandProvider) return;
    setMobiWandError(null);
    setMobiWandApprovalSeconds(7);
    setMobiWandStep("waiting");
  };

  const continueToMobiWandCode = () => {
    if (!mobiWandProvider) return;
    setMobiWandStep("code");
    setMobiWandCode("");
    setMobiWandSeconds(180);
    setMobiWandApprovalSeconds(7);
    setMobiWandError(null);
  };

  const openMobiWand = (provider: MobiWandProvider) => {
    setMobiWandProvider(provider);
    setMobiWandStep("warning");
    setMobiWandCode("");
    setMobiWandSeconds(180);
    setMobiWandApprovalSeconds(7);
    setMobiWandError(null);
    setMobiWandLoading(false);
  };

  const closeMobiWand = () => {
    if (mobiWandLoading) return;
    setMobiWandProvider(null);
    setMobiWandStep("warning");
    setMobiWandCode("");
    setMobiWandApprovalSeconds(7);
    setMobiWandError(null);
  };

  const openWayame = () => {
    setWayameOpen(true);
    setWayameLoading(true);
    setWayameError(null);
    setWayamePayment(null);
    setWayameSimulationStep("idle");
    setWayameSimulationSeconds(7);
    window.setTimeout(() => {
      setWayamePayment({
        ok: true,
        request_id: `WAYAME-SIM-${Date.now()}`,
        status: "pending",
        simulation: true,
        amount: Number(paymentData?.amount || 0),
        merchant_name: paymentData?.businessName || "PaySME Merchant",
        qr_image: "/pay-home/facilitators/wayame-simulation-qr.png",
      });
      setWayameLoading(false);
    }, 300);
  };

  const startWayameSimulationTest = () => {
    setWayameError(null);
    setWayameSimulationSeconds(7);
    setWayameSimulationStep("waiting");
  };

  const closeWayame = () => {
    if (wayameLoading) return;
    setWayameOpen(false);
    setWayamePayment(null);
    setWayameError(null);
    setWayameSimulationStep("idle");
    setWayameSimulationSeconds(7);
  };

  const providerMobile = (() => {
    const digits = String(paymentData?.mobile || "").replace(/\D/g, "");
    if (/^0(81|83|85)\d{7}$/.test(digits)) return `+264${digits.slice(1)}`;
    if (/^264(81|83|85)\d{7}$/.test(digits)) return `+${digits}`;
    return paymentData?.mobile || "your mobile number";
  })();

  const overlayClassName = renderInPortal
    ? "fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/50 p-3"
    : mobileBrandedPage
      ? "fixed inset-0 z-[100] flex items-start justify-center overflow-hidden bg-black/35 px-4 pb-4 pt-[7.75rem] md:items-center md:bg-black/60 md:p-4"
      : "fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/60 p-4";
  const modalClassName = renderInPortal
    ? "relative w-80 max-w-[calc(100%-1.5rem)] scale-75 overflow-visible rounded-lg bg-gray-700 p-4 shadow-2xl"
    : mobileBrandedPage
      ? "relative max-h-[calc(100dvh-8.75rem)] w-full max-w-sm overflow-x-hidden overflow-y-auto rounded-lg bg-gray-700 p-4 shadow-2xl [scrollbar-width:none] md:mx-4 md:max-h-[calc(100dvh-2rem)] md:w-80 [&::-webkit-scrollbar]:hidden"
      : "relative mx-4 max-h-[calc(100dvh-2rem)] w-80 max-w-sm overflow-x-hidden overflow-y-auto rounded-lg bg-gray-700 p-4 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const showHostedProviderStep = mobileBrandedPage && Boolean(mobiWandProvider || wayameOpen);

  const modal = (
    <div className={overlayClassName} role="dialog" aria-modal="true" aria-label="Pay with PaySME">
      {mobileBrandedPage && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[7.75rem] items-center justify-center px-5 md:hidden">
          <div className="rounded-xl border border-[#f6c431]/30 bg-[#151b18]/80 px-5 py-3 text-center shadow-xl backdrop-blur-sm">
            <img
              src={paysmeLogo}
              alt="PaySME - Bridging Wallets, Apps & Websites"
              className="mx-auto h-auto w-44"
            />
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#f6c431]">
              Secure online checkout
            </p>
          </div>
        </div>
      )}
      <div className={modalClassName}>
        <div className={showHostedProviderStep ? "hidden md:contents" : "contents"}>
        <div className="mb-4 text-center">
          <button onClick={onClose} className="absolute right-2 top-2 text-white hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
          <h3 className="mb-1 text-xl font-bold text-white">
            {isVendorAppPayment ? "PaySME Vendor App" : (paymentData?.businessName || "PaySME")}
          </h3>
          <p className="text-sm text-gray-300">Complete your payment securely with PaySME</p>
        </div>

        {paymentData && (
          <div className="mb-4 rounded bg-gray-600 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-300">Invoice ID:</span>
              <span className="text-sm font-semibold text-white">{paymentData.invoiceId}</span>
            </div>
            {showsVat ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-300">Price before VAT:</span>
                  <span className="font-bold text-white">N$ {netAmount.toFixed(2)}</span>
                </div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-300">VAT ({vatRate}%) {taxMode === "vat_inclusive" ? "included" : "added"}</span>
                  <span className="font-bold text-white">N$ {vatAmount.toFixed(2)}</span>
                </div>
                <div className="mb-2 flex items-center justify-between border-t border-white/15 pt-2">
                  <span className="text-sm text-gray-300">Customer pays:</span>
                  <span className="font-bold text-white">N$ {grossAmount.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-gray-300">Price:</span>
                <span className="font-bold text-white">N$ {grossAmount.toFixed(2)}</span>
              </div>
            )}
            {paymentData.recurring && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Billing</span>
                <span className="text-sm text-blue-300">{paymentData.recurringPeriod} recurring</span>
              </div>
            )}
          </div>
        )}

        <div className="mb-4 rounded bg-gray-600 p-3">
          <div className="text-center">
            <div className="mb-3 flex items-center justify-center gap-2">
              <img src={paysmeIconFavicon} alt="PaySME Icon" className="h-6 w-6" />
              <span className="text-lg font-bold tracking-wider text-white">{generatedCode}</span>
            </div>

            <div className="mb-3 space-y-1">
              <p className="text-xs text-gray-300">This code has been sent via SMS.</p>
              {isVendorAppPayment ? (
                <p className="text-xs text-gray-300">
                  This is a payment reference only. It cannot be processed through the PaySME Vendor App; choose an available payment method below.
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-300">
                    Provide it at the teller/kiosk of our participating Payment Vendors to finalize purchase.
                  </p>
                  <p className="text-xs text-gray-300">
                    The Merchant will immediately get notified of successful payment in order to ship product or initialize service.
                  </p>
                  <p className="text-xs text-gray-300">
                    See list of Payment Vendors Here: <span className="cursor-pointer text-yellow-400 underline">Vendor List</span>
                  </p>
                </>
              )}
            </div>

            {!billingLocked && (
              <Button
                onClick={() => copyToClipboard(generatedCode)}
                className="bg-[#fbbf24] px-4 py-2 text-sm font-semibold text-black hover:bg-[#f59e0b]"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy PaySME Code
              </Button>
            )}

            {eligibilityLoading && (
              <div className="mt-2 rounded-md border border-gray-500 bg-gray-700 p-2 text-center text-xs text-gray-300">
                Checking available payment methods...
              </div>
            )}

            {billingLocked && (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  disabled
                  className="w-full rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-gray-200 opacity-80"
                >
                  Pay via Card
                </button>
                <button
                  type="button"
                  disabled
                  className="w-full rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-gray-200 opacity-80"
                >
                  Pay via WayaMe
                </button>
                <button type="button" disabled className="w-full rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-gray-200 opacity-80">
                  Pay via MTC Maris
                </button>
                <button type="button" disabled className="w-full rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-gray-200 opacity-80">
                  Pay via PayPulse
                </button>
                <button type="button" disabled className="w-full rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-gray-200 opacity-80">
                  Pay via PayToday
                </button>
                <button type="button" disabled className="w-full rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-gray-200 opacity-80">
                  Pay via Kazang
                </button>
                <div className="rounded-md border border-gray-500 bg-gray-800 p-3 text-center text-sm font-semibold text-gray-100">
                  {disabledPaymentMessage}
                </div>
              </div>
            )}

            {!billingLocked && methodEnabled("wayame") && (
              <Button
                onClick={openWayame}
                className="mt-2 w-full rounded bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700"
              >
                Pay via WayaMe
              </Button>
            )}

            {!billingLocked && methodEnabled("mtc_maris") && (
              <Button
                onClick={() => openMobiWand("mtc_maris")}
                className="mt-2 w-full rounded bg-cyan-600 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-cyan-700"
              >
                Pay via MTC Maris
              </Button>
            )}

            {!billingLocked && methodEnabled("paypulse") && (
              <Button
                onClick={() => openMobiWand("paypulse")}
                className="mt-2 w-full rounded bg-[#2563eb] px-4 py-2 text-sm font-semibold text-[#fbbf24] hover:bg-[#1d4ed8]"
              >
                Pay via PayPulse
              </Button>
            )}

            {!billingLocked && methodEnabled("paytoday") && (
              <Button
                onClick={() => openMobiWand("paytoday")}
                className="mt-2 w-full rounded bg-gradient-to-r from-[#2928f3] to-[#20deda] px-4 py-2 text-sm font-semibold text-white hover:from-[#211fd0] hover:to-[#18c4c1]"
              >
                Pay via PayToday
              </Button>
            )}

            {!billingLocked && methodEnabled("kazang") && (
              <Button
                onClick={() => openMobiWand("kazang")}
                className="mt-2 w-full rounded bg-[#B3D31B] px-4 py-2 text-sm font-semibold text-black hover:bg-[#A1BE18]"
              >
                Pay via Kazang
              </Button>
            )}

            {!billingLocked && methodEnabled("card") && (
              <Button
                onClick={startCardPayment}
                disabled={cardLoading}
                className="mt-2 w-full rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"
              >
                {cardLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Pay via Card"
                )}
              </Button>
            )}
          </div>
        </div>

        {!mobiWandProvider && !wayameOpen && (
          <div className="text-center">
            <p className="mb-1 text-sm text-gray-300">Powered by</p>
            <img src={paysmeLogo} alt="PaySME - Bridging Wallets, Apps & Websites" className="mx-auto h-auto w-24" />
          </div>
        )}
        </div>

        {mobiWandProvider && (
          <div className={mobileBrandedPage
            ? "relative z-10 flex min-h-full w-full flex-col justify-center overflow-y-auto rounded-lg bg-gray-700 p-2 text-center sm:p-4 md:absolute md:inset-0 md:min-h-0 md:w-auto md:p-6"
            : "absolute inset-0 z-10 flex flex-col justify-center overflow-y-auto rounded-lg bg-gray-700 p-6 text-center"}>
            <button
              type="button"
              onClick={closeMobiWand}
              className="absolute right-3 top-3 text-white hover:text-gray-300"
              aria-label="Close provider payment"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={mobiWandProviders[mobiWandProvider].logo}
              alt={mobiWandProviders[mobiWandProvider].name}
              className={mobiWandProvider === "kazang"
                ? "mx-auto mb-5 w-44 max-w-full rounded-xl object-contain"
                : "mx-auto mb-5 max-h-16 max-w-40 rounded-lg bg-white p-2 object-contain"}
            />
            {mobiWandStep === "passed" ? (
              <div className="flex flex-col items-center justify-center py-3 text-center">
                <CheckCircle2 className={`mx-auto mb-3 h-12 w-12 ${mobiWandProvider === "kazang" ? "text-[#B3D31B]" : "text-green-400"}`} />
                <h4 className="text-lg font-bold text-white">PASSED: Simulation Testing Event.</h4>
                <p className="mt-2 text-sm text-gray-200">
                  {mobiWandProvider === "kazang"
                    ? "EasyPay Voucher verification is awaiting Kazang API access."
                    : `${mobiWandProviders[mobiWandProvider].name} confirmation API is awaiting provider credentials.`}
                </p>
                <p className="mt-2 text-xs text-gray-300">No payment was processed or marked paid.</p>
                <Button variant="outline" onClick={closeMobiWand} className="mt-5 w-full bg-white text-black hover:bg-gray-100 hover:text-black">Back</Button>
              </div>
            ) : mobiWandStep === "warning" ? (
              <>
                <h4 className="mb-3 text-lg font-bold text-white">
                  {mobiWandProvider === "kazang" ? "Purchase an EasyPay Voucher" : `Pay with ${mobiWandProviders[mobiWandProvider].name}`}
                </h4>
                <p className="mb-5 text-sm leading-6 text-gray-200">
                  {mobiWandProvider === "kazang" ? (
                    <>Visit a participating Kazang retailer and purchase an EasyPay Voucher for exactly{" "}
                      <strong className="text-white">N$ {Number(paymentData?.amount || 0).toFixed(2)}</strong>.
                      Keep the receipt safe. It contains a unique 16-digit PIN. Continue when you have your voucher.</>
                  ) : (
                    <>You need an active {mobiWandProviders[mobiWandProvider].accountName} account with a balance greater than{" "}
                      <strong className="text-white">N$ {Number(paymentData?.amount || 0).toFixed(2)}</strong> to proceed.
                      Select Proceed to continue to confirmation-code entry.</>
                  )}
                </p>
                <Button
                  onClick={continueToMobiWandCode}
                  className={mobiWandProvider === "kazang"
                    ? "w-full bg-[#B3D31B] text-black hover:bg-[#A1BE18]"
                    : "w-full bg-pink-600 text-white hover:bg-pink-700"}
                >
                  {mobiWandProvider === "kazang" ? "I have Voucher" : "Proceed"}
                </Button>
                <Button variant="outline" onClick={closeMobiWand} className="mt-2 w-full bg-white text-black hover:bg-gray-100 hover:text-black">Back</Button>
              </>
            ) : (
              <>
                <h4 className="mb-2 text-lg font-bold text-white">
                  {mobiWandProvider === "kazang" ? "Enter your EasyPay Voucher PIN" : `Enter your ${mobiWandProviders[mobiWandProvider].name} Paycode`}
                </h4>
                <p className="mb-2 text-sm leading-6 text-gray-200">
                  {mobiWandProvider === "kazang" ? (
                    <>Enter the 16-digit PIN printed on your EasyPay Voucher. Confirm that its value is{" "}
                      <strong className="text-white">N$ {Number(paymentData?.amount || 0).toFixed(2)}</strong>.</>
                  ) : (
                    <>Enter the confirmation Paycode sent to <strong className="text-white">{providerMobile}</strong>.</>
                  )}
                </p>
                {mobiWandProvider !== "kazang" && (
                  <p className="mb-3 text-sm font-semibold text-[#fbbf24]">
                    Expires in {Math.floor(mobiWandSeconds / 60)}:{String(mobiWandSeconds % 60).padStart(2, "0")}
                  </p>
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={mobiWandProvider === "kazang" ? 16 : 12}
                  value={mobiWandCode}
                  onChange={(event) => { setMobiWandCode(event.target.value.replace(/\D/g, "")); setMobiWandError(null); }}
                  disabled={mobiWandStep === "waiting"}
                  placeholder={mobiWandProvider === "kazang" ? "16-digit PIN" : "Code"}
                  aria-label={mobiWandProvider === "kazang" ? "EasyPay Voucher 16-digit PIN" : `${mobiWandProviders[mobiWandProvider].name} confirmation Paycode`}
                  className={`mb-3 w-full rounded-md border border-gray-400 bg-white px-3 py-3 text-center text-xl font-bold tracking-[0.25em] text-gray-900 outline-none ${mobiWandProvider === "kazang" ? "focus:border-[#B3D31B] focus:ring-2 focus:ring-[#B3D31B]/30" : "focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/30"}`}
                  autoFocus
                />
                {(mobiWandError || (mobiWandProvider !== "kazang" && mobiWandSeconds <= 0)) && (
                  <div className="mb-3 rounded-md border border-red-500 bg-red-950 p-3 text-xs text-red-100" role="alert">
                    {mobiWandError || `This confirmation Paycode has expired. Request a new code from ${mobiWandProviders[mobiWandProvider].name}.`}
                  </div>
                )}
                <Button
                  onClick={confirmMobiWandPayment}
                  disabled={mobiWandStep === "waiting" || mobiWandLoading || (mobiWandProvider === "kazang" ? !/^\d{16}$/.test(mobiWandCode) : mobiWandSeconds <= 0 || !/^\d{4,12}$/.test(mobiWandCode))}
                  className={mobiWandProvider === "kazang"
                    ? "w-full bg-[#B3D31B] text-black hover:bg-[#A1BE18]"
                    : "w-full bg-pink-600 text-white hover:bg-pink-700"}
                >
                  {mobiWandStep === "waiting" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Awaiting approval...</> : mobiWandLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming...</> : "Confirm payment"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setMobiWandStep("warning"); setMobiWandApprovalSeconds(7); setMobiWandError(null); }}
                  disabled={mobiWandLoading}
                  className="mt-2 w-full bg-white text-black hover:bg-gray-100 hover:text-black"
                >
                  Back
                </Button>
                {mobiWandStep === "waiting" && (
                  <div className={`mt-3 rounded-md p-3 text-xs ${mobiWandProvider === "kazang" ? "border border-[#B3D31B] bg-[#394000]/60 text-[#F5FF9A]" : "border border-pink-500 bg-pink-950/60 text-pink-100"}`}>
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    <strong>Waiting for approval...</strong><br />Approval check completes in {mobiWandApprovalTime}.
                  </div>
                )}
              </>
            )}
            <div className="mt-3 shrink-0 text-center">
              <p className="mb-1 text-[10px] leading-none text-gray-300">Powered by</p>
              <img src={paysmeLogo} alt="PaySME - Bridging Wallets, Apps & Websites" className="mx-auto h-auto w-20" />
            </div>
          </div>
        )}

        {wayameOpen && (
          <div className={`${mobileBrandedPage ? "relative z-10 flex min-h-full w-full flex-col overflow-y-auto rounded-lg bg-gray-700 p-2 text-center sm:p-4 md:absolute md:inset-0 md:min-h-0 md:w-auto md:p-5" : "absolute inset-0 z-10 flex flex-col overflow-y-auto rounded-lg bg-gray-700 p-5 text-center"} ${wayameSimulationStep === "passed" ? "justify-center" : "justify-start"}`}>
            <button type="button" onClick={closeWayame} className="absolute right-3 top-3 text-white hover:text-gray-300" aria-label="Close WayaMe payment">
              <X className="h-4 w-4" />
            </button>
            <img src="/pay-home/facilitators/wayame.jpg" alt="WayaMe" className="mx-auto mb-4 max-h-16 max-w-40 rounded-lg bg-white p-2 object-contain" />
            {wayameLoading && !wayamePayment ? (
              <div className="py-8">
                <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-pink-400" />
                <h4 className="text-lg font-bold text-white">Preparing WayaMe payment</h4>
                <p className="mt-2 text-sm text-gray-200">Preparing the payment interface...</p>
              </div>
            ) : wayameSimulationStep === "passed" ? (
              <div className="flex flex-col items-center justify-center py-3 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-400" />
                <h4 className="text-lg font-bold text-white">PASSED: Simulation Testing Event.</h4>
                <p className="mt-2 text-sm text-gray-200">WayaMe confirmation API is awaiting provider credentials.</p>
                <p className="mt-2 text-xs text-gray-300">No payment was processed or marked paid.</p>
                <Button variant="outline" onClick={closeWayame} className="mt-5 w-full bg-white text-black hover:bg-gray-100 hover:text-black">Back</Button>
              </div>
            ) : wayamePayment?.status === "paid" ? (
              <div className="py-8">
                <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-400" />
                <h4 className="text-lg font-bold text-white">Payment successful</h4>
                <p className="mt-2 text-sm text-gray-200">WayaMe confirmed the payment. The merchant has been notified.</p>
              </div>
            ) : wayamePayment ? (
              <>
                <h4 className="mb-3 text-lg font-bold text-white">Pay with WayaMe</h4>
                <div className="mb-3 rounded-lg bg-gray-600 p-3 text-sm text-gray-200">
                  <strong className="block text-base text-white">{wayamePayment.merchant_name || paymentData?.businessName}</strong>
                  N$ {Number(wayamePayment.amount || paymentData?.amount || 0).toFixed(2)}
                  {wayamePayment.merchant_alias && <span className="mt-1 block text-xs">{wayamePayment.merchant_alias}</span>}
                </div>
                {wayamePayment.app_intent && (
                  <Button onClick={() => { window.location.href = wayamePayment.app_intent || ""; }} className="mb-2 w-full bg-pink-600 text-white hover:bg-pink-700">
                    Approve in Bank App
                  </Button>
                )}
                {wayamePayment.simulation && wayameSimulationStep === "idle" && (
                  <Button onClick={startWayameSimulationTest} className="mb-2 w-full bg-pink-600 text-white hover:bg-pink-700">
                    Approve in Bank App
                  </Button>
                )}
                {wayamePayment.qr_image && (
                  <>
                    <div className="my-2 flex items-center gap-2 text-xs text-gray-300"><span className="h-px flex-1 bg-gray-500" />OR SCAN QR<span className="h-px flex-1 bg-gray-500" /></div>
                    <button
                      type="button"
                      onClick={wayamePayment.simulation ? startWayameSimulationTest : undefined}
                      disabled={wayameSimulationStep !== "idle"}
                      className="mx-auto block rounded-lg disabled:cursor-default"
                      aria-label="Scan or select the WayaMe QR code to continue"
                    >
                      <img src={wayamePayment.qr_image} alt="WayaMe payment QR" className="h-48 w-48 rounded-lg bg-white p-2 object-contain" />
                    </button>
                    <p className="mb-2 mt-2 text-xs text-gray-200">Scan with your banking or payment application. You can also tap the QR to continue.</p>
                  </>
                )}
                {wayameSimulationStep === "waiting" && (
                  <div className="my-3 rounded-md border border-pink-500 bg-pink-950/60 p-3 text-xs text-pink-100">
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    <strong>Waiting for approval...</strong><br />Approval check completes in {wayameSimulationTime}.
                  </div>
                )}
                {!wayamePayment.simulation && (
                  <div className="my-3 rounded-md border border-pink-500 bg-pink-950/60 p-3 text-xs text-pink-100">
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    <strong>Waiting for payment approval...</strong><br />Complete the payment using your banking/payment app.
                  </div>
                )}
                {wayameError && <div className="mb-3 rounded-md border border-red-500 bg-red-950 p-3 text-xs text-red-100">{wayameError}</div>}
                <Button variant="outline" onClick={closeWayame} disabled={wayameLoading} className="w-full bg-white text-black hover:bg-gray-100 hover:text-black">Back</Button>
              </>
            ) : (
              <>
                <h4 className="mb-2 text-lg font-bold text-white">WayaMe payment unavailable</h4>
                <p className="mb-4 text-sm text-red-200">{wayameError || "The payment request could not be created."}</p>
                <Button variant="outline" onClick={closeWayame} className="w-full bg-white text-black hover:bg-gray-100 hover:text-black">Back</Button>
              </>
            )}
            <div className="mt-3 shrink-0 text-center">
              <p className="mb-1 text-[10px] leading-none text-gray-300">Powered by</p>
              <img src={paysmeLogo} alt="PaySME - Bridging Wallets, Apps & Websites" className="mx-auto h-auto w-20" />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return renderInPortal ? createPortal(modal, document.body) : modal;
}
