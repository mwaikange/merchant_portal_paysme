import { useSearchParams } from "react-router-dom";
import { ArrowRight, Check, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const paysmeLogo = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";

const blockedReturnProtocols = new Set(["javascript:", "data:", "file:", "vbscript:"]);

const notifyPaymentHost = (type: "return" | "close", destination?: string) => {
  const message = JSON.stringify({ type: `paysme:payment-${type}`, status: "success", destination: destination || null });
  const hostWindow = window as Window & { ReactNativeWebView?: { postMessage: (value: string) => void } };
  hostWindow.ReactNativeWebView?.postMessage(message);
  if (window.parent !== window) window.parent.postMessage(message, "*");
  if (window.opener && !window.opener.closed) window.opener.postMessage(message, "*");
};

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const mref = searchParams.get("mref") || searchParams.get("ref") || searchParams.get("_MERCHANTREFERENCE") || "N/A";
  const status = searchParams.get("status") || searchParams.get("_STATUS") || "Approved";
  const result = searchParams.get("result") || searchParams.get("_RESULT") || "Success";
  const generatedCode = searchParams.get("generated_code") || "";
  const invoiceId = searchParams.get("invoice_id") || "";
  const origin = searchParams.get("origin") || "";

  const displayRef = generatedCode || (mref !== "N/A" ? mref : "N/A");

  // Build merchant return URL with payment params appended
  const merchantReturnUrl = (() => {
    if (!origin) return null;
    try {
      const url = new URL(origin);
      if (!url.protocol || blockedReturnProtocols.has(url.protocol.toLowerCase())) return null;
      url.searchParams.set("status", "success");
      if (mref !== "N/A") url.searchParams.set("mref", mref);
      if (generatedCode) url.searchParams.set("generated_code", generatedCode);
      if (invoiceId) url.searchParams.set("invoice_id", invoiceId);
      return url;
    } catch {
      return null;
    }
  })();

  const isAppReturn = Boolean(merchantReturnUrl && !["http:", "https:"].includes(merchantReturnUrl.protocol));

  const returnToMerchant = () => {
    if (merchantReturnUrl) {
      const destination = merchantReturnUrl.toString();
      notifyPaymentHost("return", destination);
      window.location.assign(destination);
      return;
    }
    notifyPaymentHost("return");
    if (window.history.length > 1) window.history.back();
    else window.location.assign("https://www.paysme.site");
  };

  const closePaymentScreen = () => {
    const destination = merchantReturnUrl?.toString();
    notifyPaymentHost("close", destination);
    window.close();

    // Android WebViews and normal browser tabs commonly block window.close().
    // Return to the merchant/app instead of leaving the customer stranded.
    window.setTimeout(() => {
      if (destination) window.location.assign(destination);
      else if (window.history.length > 1) window.history.back();
      else window.location.assign("https://www.paysme.site");
    }, 150);
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#111612] px-4 py-6 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 -top-28 h-72 w-72 rounded-full bg-[#f4c430]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
      </div>

      <main className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-[#222823]/95 shadow-[0_30px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="h-1.5 bg-gradient-to-r from-[#f4c430] via-[#ffd95a] to-[#2d9d78]" />
        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8">
          <div className="flex items-center justify-between">
            <img src={paysmeLogo} alt="PaySME" className="h-9 w-auto object-contain" />
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Secure
            </div>
          </div>

          <section className="py-7 text-center">
            <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/10">
              <div className="absolute inset-2 rounded-full bg-emerald-400/10" />
              <Check className="relative h-10 w-10 stroke-[3] text-emerald-400" />
            </div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-[#f4c430]">Payment confirmed</p>
            <h1 className="text-3xl font-black tracking-tight text-white">You&apos;re all paid up</h1>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/55">
              Your card payment was authorised and the merchant has been notified.
            </p>
          </section>

          <section className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Payment details</span>
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-emerald-300">{status}</span>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm">
              <div className="flex items-start justify-between gap-5">
                <span className="text-white/45">Reference</span>
                <span className="break-all text-right font-bold text-white">{displayRef}</span>
              </div>
              <div className="flex items-center justify-between gap-5">
                <span className="text-white/45">Result</span>
                <span className="font-semibold text-white/80">{result}</span>
              </div>
            </div>
          </section>

          <div className="space-y-3">
            <Button
              onClick={returnToMerchant}
              className="h-[52px] w-full rounded-xl border-0 bg-[#f4c430] py-3.5 font-black text-[#111612] shadow-[0_10px_30px_rgba(244,196,48,0.18)] hover:bg-[#ffda55]"
            >
              {merchantReturnUrl ? (isAppReturn ? "Return to App" : "Return to Merchant") : "Back to Previous Page"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              onClick={closePaymentScreen}
              className="h-[52px] w-full rounded-xl border border-white/10 bg-white/10 py-3.5 font-bold text-white shadow-md hover:bg-white/15"
            >
              <X className="mr-2 h-4 w-4" /> Close this window
            </Button>
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-white/35">
            Protected by PaySME secure payment processing
          </p>
        </div>
      </main>
    </div>
  );
};

export default PaymentSuccess;
