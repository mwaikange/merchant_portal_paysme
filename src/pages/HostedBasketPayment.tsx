import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, Loader2, ShoppingBasket } from "lucide-react";
import { PaycodeModal } from "@/components/PaycodeModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { normalizeNamibianMobile, validateNamibianMobile } from "@/lib/validations";
import paysmeLogoSmall from "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
import { TownAutocomplete } from "@/components/TownAutocomplete";

type BasketItem = {
  basket_item_id: string;
  product_reference: string;
  description: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  currency: string;
};

type HostedBasket = {
  basket_id: string;
  merchant_id: string;
  business_name: string;
  status: "pending" | "paid" | "expired" | "failed" | "cancelled";
  currency: string;
  total_amount: number;
  gross_amount: number;
  vat_amount: number;
  vat_rate: number;
  tax_mode: "not_registered" | "vat_inclusive" | "vat_exclusive";
  item_count: number;
  expires_at: string;
  checkout_started: boolean;
  items: BasketItem[];
};

const money = (value: number) => `N$ ${Number(value || 0).toFixed(2)}`;

function sessionKey(slug: string) {
  return `paysme-basket-checkout-${slug}`;
}

const HostedBasketPayment = () => {
  const { basketSlug = "" } = useParams();
  const [basket, setBasket] = useState<HostedBasket | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [town, setTown] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [showPaycodeModal, setShowPaycodeModal] = useState(false);
  const [confirmedAmount, setConfirmedAmount] = useState("");
  const [confirmedInvoice, setConfirmedInvoice] = useState("");
  const [confirmedMobile, setConfirmedMobile] = useState("");
  const [checkoutKey, setCheckoutKey] = useState<string | null>(() =>
    basketSlug ? window.sessionStorage.getItem(sessionKey(basketSlug)) : null
  );

  useEffect(() => {
    const resolve = async () => {
      setLoading(true);
      setError("");
      try {
        const { data, error: resolveError } = await supabase.functions.invoke("merchant-qr-baskets", {
          body: { action: "resolve", slug: basketSlug },
        });
        if (resolveError || !data?.ok || !data?.basket) {
          throw new Error(data?.error || resolveError?.message || "Basket could not be loaded");
        }
        setBasket(data.basket as HostedBasket);
      } catch (resolveError) {
        setError(resolveError instanceof Error ? resolveError.message : "Basket could not be loaded");
      } finally {
        setLoading(false);
      }
    };
    if (basketSlug) void resolve();
  }, [basketSlug]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!basket) return;
    const cleanName = name.trim().replace(/\s+/g, " ");
    const cleanTown = town.trim().replace(/\s+/g, " ");
    const cleanEmail = email.trim().toLowerCase();
    if (cleanName.length < 2) return setError("Enter your name");
    if (!cleanTown) return setError("Town is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Enter a valid email address");
    if (!validateNamibianMobile(mobile)) return setError("Enter a valid Namibian mobile number");

    const normalizedMobile = normalizeNamibianMobile(mobile);
    const idempotencyKey = checkoutKey || window.crypto.randomUUID();
    window.sessionStorage.setItem(sessionKey(basketSlug), idempotencyKey);
    setCheckoutKey(idempotencyKey);
    setSubmitting(true);
    setError("");
    try {
      const { data, error: checkoutError } = await supabase.functions.invoke("payments", {
        body: {
          action: "create_basket_transaction",
          payload: {
            basket_slug: basketSlug,
            payer_name: cleanName,
            town: cleanTown,
            email: cleanEmail,
            mobile: normalizedMobile,
            idempotency_key: idempotencyKey,
          },
        },
      });
      if (checkoutError || !data?.ok || !data?.transaction) {
        throw new Error(data?.error || checkoutError?.message || "Payment could not be started");
      }
      setGeneratedCode(data.transaction.generated_code);
      setConfirmedAmount(Number(data.transaction.amount).toFixed(2));
      setConfirmedInvoice(data.transaction.invoice_id || `BASKET-${basket.basket_id.slice(0, 8)}`);
      setConfirmedMobile(normalizedMobile);
      setShowPaycodeModal(true);
      setBasket((current) => current ? { ...current, checkout_started: true } : current);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Payment could not be started");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <Loader2 className="h-9 w-9 animate-spin text-[#202720]" />
      </div>
    );
  }

  if (error && !basket) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-8 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
            <h1 className="text-xl font-bold">Basket unavailable</h1>
            <p className="text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!basket) return null;

  const canResume = basket.checkout_started && Boolean(checkoutKey);
  const checkoutBlocked = basket.status !== "pending" || (basket.checkout_started && !canResume);
  const statusMessage = basket.status === "paid"
    ? "This basket has been paid."
    : basket.status === "expired"
      ? "This basket has expired. Please ask the merchant to create a new one."
      : basket.status === "cancelled"
        ? "This basket was cancelled."
        : basket.status === "failed"
          ? "This basket payment failed. Please ask the merchant to create a new basket."
          : basket.checkout_started && !canResume
            ? "Checkout has already started on another device."
            : "";

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="flex items-center justify-center gap-3">
          <img src={paysmeLogoSmall} alt="PaySME" className="h-11 w-11 rounded-lg" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Secure QR Basket</p>
            <h1 className="text-xl font-extrabold text-[#202720]">{basket.business_name}</h1>
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="bg-[#202720] text-white">
            <CardTitle className="flex items-center gap-2 text-white">
              <ShoppingBasket className="h-5 w-5 text-[#f6c431]" />
              Your basket
            </CardTitle>
            <CardDescription className="flex items-center gap-2 text-white/70">
              <Clock3 className="h-4 w-4" />
              Available until {new Date(basket.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {basket.items.map((item) => (
              <div key={item.basket_item_id} className="flex items-start justify-between gap-4 p-4">
                <div>
                  <p className="font-semibold text-gray-950">{item.product_reference}</p>
                  {item.description && <p className="mt-1 text-sm text-gray-500">{item.description}</p>}
                  <p className="mt-1 text-sm text-gray-600">{item.quantity} × {money(item.unit_price)}</p>
                </div>
                <p className="whitespace-nowrap font-bold">{money(item.line_total)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between bg-[#f6c431]/15 p-5 text-xl font-extrabold">
              <span>{basket.tax_mode === "vat_exclusive" ? "Subtotal" : "Total"}</span>
              <span>{money(basket.total_amount)}</span>
            </div>
            {basket.tax_mode !== "not_registered" && <div className="flex items-center justify-between bg-white px-5 py-3 font-semibold"><span>VAT ({basket.vat_rate}%) {basket.tax_mode === "vat_inclusive" ? "included" : ""}</span><span>{money(basket.vat_amount)}</span></div>}
            {basket.tax_mode === "vat_exclusive" && <div className="flex items-center justify-between bg-[#f6c431]/25 p-5 text-xl font-extrabold"><span>Customer pays</span><span>{money(basket.gross_amount)}</span></div>}
          </CardContent>
        </Card>

        {checkoutBlocked ? (
          <Card>
            <CardContent className="space-y-3 p-7 text-center">
              {basket.status === "paid"
                ? <CheckCircle2 className="mx-auto h-11 w-11 text-green-600" />
                : <AlertCircle className="mx-auto h-11 w-11 text-amber-600" />}
              <p className="font-semibold text-gray-800">{statusMessage}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{canResume ? "Resume your payment" : "Customer details"}</CardTitle>
              <CardDescription>Enter your details, then choose a payment method.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payer-name">Full name</Label>
                  <Input id="payer-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payer-town">Town</Label>
                  <TownAutocomplete
                    id="payer-town"
                    placeholder="Start typing your town"
                    value={town}
                    onValueChange={setTown}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payer-email">Email</Label>
                  <Input id="payer-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payer-mobile">Mobile number</Label>
                  <Input id="payer-mobile" type="tel" autoComplete="tel" placeholder="0812345678 or 264812345678" value={mobile} onChange={(event) => setMobile(event.target.value)} />
                </div>
                {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                <Button type="submit" disabled={submitting} className="w-full bg-[#f6c431] py-6 text-base font-bold text-[#171d19] hover:bg-[#eab72b]">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {canResume ? "Resume payment" : `Continue to pay ${money(basket.gross_amount || basket.total_amount)}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      <PaycodeModal
        isOpen={showPaycodeModal}
        onClose={() => setShowPaycodeModal(false)}
        generatedCode={generatedCode}
        paymentData={generatedCode ? {
          mobile: confirmedMobile,
          town: town.trim(),
          email: email.trim().toLowerCase(),
          subscribe: false,
          businessName: basket.business_name,
          amount: confirmedAmount,
          invoiceId: confirmedInvoice,
          recurring: false,
          merchantId: basket.merchant_id,
          taxMode: basket.tax_mode,
          vatRate: basket.vat_rate,
          netAmount: basket.tax_mode === "vat_inclusive" ? basket.total_amount - basket.vat_amount : basket.total_amount,
          vatAmount: basket.vat_amount,
          grossAmount: basket.gross_amount || basket.total_amount,
        } : null}
      />
    </div>
  );
};

export default HostedBasketPayment;
