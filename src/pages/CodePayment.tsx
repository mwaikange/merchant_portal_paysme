import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaycodeModal } from "@/components/PaycodeModal";
import { supabase } from "@/integrations/supabase/client";

type ResolvedPayment = {
  merchant_id: string;
  generated_code: string;
  amount: number | string;
  user_email?: string | null;
  user_mobile?: string | null;
  payer_town?: string | null;
  status?: string | null;
  invoice_id?: string | null;
  business_name?: string | null;
  tax_mode?: "not_registered" | "vat_inclusive" | "vat_exclusive";
  vat_rate?: number;
  net_amount?: number;
  vat_amount?: number;
  gross_amount?: number;
  recurring?: boolean | null;
  recurring_period?: string | null;
};

type PaymentPageError = {
  title: string;
  message: string;
};

const readFunctionError = async (error: unknown): Promise<PaymentPageError> => {
  const fallback: PaymentPageError = {
    title: "Payment Link Unavailable",
    message: "We could not load this payment link. Please try again.",
  };

  if (!error || typeof error !== "object") return fallback;

  const context = "context" in error ? (error as { context?: unknown }).context : undefined;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (context.status === 404 || payload?.reason === "not_found") {
        return {
          title: "Payment Code Not Found",
          message: payload?.error || "This payment link is invalid or no longer available.",
        };
      }
      if (typeof payload?.error === "string" && payload.error.trim()) {
        return { ...fallback, message: payload.error };
      }
    } catch {
      // Use the friendly fallback when the function did not return JSON.
    }
  }

  return fallback;
};

const CodePayment = () => {
  const { generatedCode } = useParams();
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<ResolvedPayment | null>(null);
  const [error, setError] = useState<PaymentPageError | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const resolveCode = async () => {
      setLoading(true);
      setError(null);

      try {
        let code = String(generatedCode || "").replace(/\u00a0/g, " ").trim();
        try {
          code = decodeURIComponent(code);
        } catch {
          // React Router normally decodes it; retain an undecodable value as entered.
        }
        if (!code) throw new Error("Missing payment code");

        const { data, error: functionError } = await supabase.functions.invoke("resolve-payment-code", {
          body: { generated_code: code },
        });

        if (functionError) {
          setError(await readFunctionError(functionError));
          return;
        }
        if (!data?.ok || !data?.payment) {
          setError({
            title: "Payment Code Not Found",
            message: data?.error || "This payment link is invalid or no longer available.",
          });
          return;
        }

        setPayment(data.payment);
        setModalOpen(true);
      } catch (err) {
        setError({
          title: "Payment Link Unavailable",
          message: err instanceof Error && err.message !== "Missing payment code"
            ? err.message
            : "We could not load this payment link. Please try again.",
        });
      } finally {
        setLoading(false);
      }
    };

    resolveCode();
  }, [generatedCode, retryKey]);

  const amount = Number(payment?.amount || 0).toFixed(2);
  const paymentStatus = String(payment?.status || "").toLowerCase();
  const isCompleted = ["paid", "success", "successful", "completed", "finalized"].includes(paymentStatus);
  const isClosed = ["cancelled", "canceled", "expired"].includes(paymentStatus);

  return (
    <div
      className="min-h-screen bg-[#151b18] bg-cover bg-right bg-no-repeat text-white md:bg-center"
      style={{ backgroundImage: "url('/payments/paysme-secure-card-background-v3.png')" }}
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        {loading && (
          <Card className="w-full max-w-md border-white/10 bg-[#202820] text-white">
            <CardContent className="flex flex-col items-center justify-center p-8">
              <Loader2 className="mb-4 h-8 w-8 animate-spin text-[#f6c431]" />
              <p className="text-gray-300">Loading payment code...</p>
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card className="w-full max-w-md border-red-500/40 bg-[#202820] text-white">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <AlertCircle className="mb-4 h-9 w-9 text-red-400" />
              <h1 className="mb-2 text-xl font-bold">{error.title}</h1>
              <p className="text-sm text-gray-300">{error.message}</p>
              {error.title === "Payment Link Unavailable" && (
                <Button
                  className="mt-5 bg-[#f6c431] text-black hover:bg-[#e2b729]"
                  onClick={() => setRetryKey((value) => value + 1)}
                >
                  Try Again
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {!loading && payment && isCompleted && (
          <Card className="w-full max-w-md border-emerald-500/40 bg-[#202820] text-white">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <CheckCircle2 className="mb-4 h-10 w-10 text-emerald-400" />
              <p className="text-xs uppercase tracking-[0.2em] text-[#f6c431]">PaySME code</p>
              <h1 className="mt-2 text-3xl font-bold">{payment.generated_code}</h1>
              <h2 className="mt-5 text-2xl font-bold">Payment already completed!</h2>
              <p className="mt-3 text-sm text-gray-300">
                This payment for {payment.business_name || "PaySME Store"} has already been completed.
              </p>
              <p className="mt-2 text-sm font-semibold text-white">N$ {amount}</p>
              {payment.tax_mode && payment.tax_mode !== "not_registered" && <p className="mt-1 text-xs text-white/70">VAT ({payment.vat_rate || 0}%) {payment.tax_mode === "vat_inclusive" ? "included" : `N$ ${Number(payment.vat_amount || 0).toFixed(2)} added`}</p>}
            </CardContent>
          </Card>
        )}

        {!loading && payment && isClosed && (
          <Card className="w-full max-w-md border-[#f6c431]/40 bg-[#202820] text-white">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <AlertCircle className="mb-4 h-10 w-10 text-[#f6c431]" />
              <p className="text-xs uppercase tracking-[0.2em] text-[#f6c431]">PaySME code</p>
              <h1 className="mt-2 text-3xl font-bold">{payment.generated_code}</h1>
              <h2 className="mt-5 text-2xl font-bold">Payment link no longer active</h2>
              <p className="mt-3 text-sm text-gray-300">
                This payment is {paymentStatus}. Please request a new payment link from the merchant.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && payment && !isCompleted && !isClosed && !modalOpen && (
          <Card className="w-full max-w-md border-[#f6c431]/40 bg-[#202820] text-white">
            <CardContent className="space-y-4 p-6 text-center">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#f6c431]">PaySME code</p>
                <h1 className="mt-2 text-3xl font-bold">{payment.generated_code}</h1>
              </div>
              <p className="text-sm text-gray-300">
                {payment.business_name || "PaySME Store"} - N$ {amount}
              </p>
              {payment.tax_mode && payment.tax_mode !== "not_registered" && <div className="mt-3 rounded-lg bg-white/10 p-3 text-sm text-white"><div className="flex justify-between"><span>VAT ({payment.vat_rate || 0}%) {payment.tax_mode === "vat_inclusive" ? "included" : ""}</span><strong>N$ {Number(payment.vat_amount || 0).toFixed(2)}</strong></div></div>}
              <Button className="w-full bg-[#f6c431] text-black hover:bg-[#e2b729]" onClick={() => setModalOpen(true)}>
                Open Payment Options
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {payment && !isCompleted && !isClosed && (
        <PaycodeModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          generatedCode={payment.generated_code}
          mobileBrandedPage
          paymentData={{
            mobile: payment.user_mobile || "",
            town: payment.payer_town || "",
            email: payment.user_email || "",
            subscribe: Boolean(payment.recurring),
            businessName: payment.business_name || "PaySME Store",
            amount,
            invoiceId: payment.invoice_id || payment.generated_code,
            recurring: Boolean(payment.recurring),
            recurringPeriod: payment.recurring_period || "monthly",
            merchantId: payment.merchant_id,
            taxMode: payment.tax_mode,
            vatRate: payment.vat_rate,
            netAmount: payment.net_amount,
            vatAmount: payment.vat_amount,
            grossAmount: payment.gross_amount || payment.amount,
          }}
        />
      )}
    </div>
  );
};

export default CodePayment;
