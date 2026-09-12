import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useParams, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, AlertCircle, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import paysmeLogoSmall from "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
import paysmeLogoPoweredBy from "/lovable-uploads/d5c691bd-bbf1-4791-be4d-d265756313e4.png";
import { PaycodeModal } from "@/components/PaycodeModal";
import { normalizeNamibianMobile, validateNamibianMobile } from "@/lib/validations";
import { TownAutocomplete } from "@/components/TownAutocomplete";

// Form validation schema
const paymentFormSchema = z.object({
  town: z.string().trim().min(1, "Town is required").max(120, "Town is too long"),
  email: z.string().min(1, "Email is required").email("Please enter a valid email"),
  mobile: z.string().min(1, "Mobile number is required").refine(validateNamibianMobile, "Enter a valid Namibian mobile number starting with 081, 083, 085, 26481, 26483, or 26485"),
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;

type QrHostedPaymentDetails = {
  qr_payment_link_id: string;
  merchant_id: string;
  business_name: string;
  product_reference: string;
  description: string | null;
  amount: number;
  currency: string;
  recurring: boolean;
  recurring_period: string | null;
  allow_quantity: boolean;
  min_quantity: number;
  max_quantity: number;
  tax_mode: "not_registered" | "vat_inclusive" | "vat_exclusive";
  vat_rate: number;
};

type HostedMerchantData = {
  business_name: string;
  logo: string;
  merchant_id: string | undefined;
  vendor_id: string;
  tax_mode: "not_registered" | "vat_inclusive" | "vat_exclusive";
  vat_rate: number;
};

const HostedPayment = () => {
  const { merchantId, qrSlug } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [merchantData, setMerchantData] = useState<HostedMerchantData | null>(null);
  const [isLoadingMerchant, setIsLoadingMerchant] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(true);
  const [showPaycodeModal, setShowPaycodeModal] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [formData, setFormData] = useState<PaymentFormData | null>(null);
  const [qrDetails, setQrDetails] = useState<QrHostedPaymentDetails | null>(null);
  const [linkError, setLinkError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [confirmedAmount, setConfirmedAmount] = useState("");
  
  // Extract payment details from URL params
  const qrTotal = qrDetails
    ? Math.round(Number(qrDetails.amount) * 100) * quantity / 100
    : null;
  const baseAmount = qrTotal !== null ? qrTotal : Number(searchParams.get("amount") || 0);
  const taxMode = qrDetails?.tax_mode || merchantData?.tax_mode || "not_registered";
  const vatRate = Number(qrDetails?.vat_rate ?? merchantData?.vat_rate ?? 0);
  const vatAmount = taxMode === "vat_exclusive" ? Math.round(baseAmount * vatRate) / 100 : taxMode === "vat_inclusive" && vatRate > 0 ? Math.round((baseAmount - baseAmount / (1 + vatRate / 100)) * 100) / 100 : 0;
  const calculatedTotal = taxMode === "vat_exclusive" ? Math.round((baseAmount + vatAmount) * 100) / 100 : baseAmount;
  const amount = confirmedAmount || calculatedTotal.toFixed(2);
  const invoiceId = qrDetails?.product_reference || searchParams.get("invoice_id") || "";
  const recurring = qrDetails?.recurring ?? searchParams.get("recurring") === "true";
  const recurringPeriod = qrDetails?.recurring_period || searchParams.get("recurring_period");
  const effectiveMerchantId = qrDetails?.merchant_id || merchantId;
  
  // Form setup
  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      town: "",
      email: "",
      mobile: "",
    },
  });

  useEffect(() => {
    if (!showPaymentForm) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [showPaymentForm]);

  // Fetch merchant data on component mount
  useEffect(() => {
    const fetchMerchantData = async () => {
      setIsLoadingMerchant(true);
      setLinkError("");
      
      try {
        if (qrSlug) {
          const { data, error } = await supabase.functions.invoke("merchant-qr-links", {
            body: { action: "resolve", slug: qrSlug },
          });
          if (error || !data?.ok || !data?.link) {
            throw new Error(data?.error || error?.message || "This QR payment link is invalid");
          }
          const link = data.link as QrHostedPaymentDetails;
          setQrDetails(link);
          setQuantity(Number(link.min_quantity || 1));
          setConfirmedAmount("");
          setMerchantData({
            business_name: link.business_name || "PaySME Store",
            logo: paysmeLogoSmall,
            merchant_id: link.merchant_id,
            vendor_id: "PUBLIC",
            tax_mode: link.tax_mode || "not_registered",
            vat_rate: Number(link.vat_rate || 0),
          });
          return;
        }

        // Fetch merchant data from Supabase
        const { data, error } = await supabase
          .rpc('get_merchant_public_info', { p_merchant_id: merchantId });
        
        if (error) {
          throw error;
        }
        
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setMerchantData({
            business_name: row.business_name || 'PaySME Store',
            logo: paysmeLogoSmall,
            merchant_id: row.merchant_id || merchantId,
            vendor_id: 'PUBLIC'
            ,tax_mode: row.tax_mode || "not_registered",
            vat_rate: Number(row.vat_rate || 0)
          });
        } else {
          // Merchant not found - set a safe default
          console.log('No merchant found for ID:', merchantId);
          setMerchantData({
            business_name: 'PaySME Store',
            logo: paysmeLogoSmall,
            merchant_id: merchantId,
            vendor_id: 'PUBLIC'
            ,tax_mode: "not_registered",
            vat_rate: 0
          });
        }
      } catch (error) {
        console.error('Error fetching merchant:', error);
        if (qrSlug) {
          setMerchantData(null);
          setQrDetails(null);
          setLinkError(error instanceof Error ? error.message : "This QR payment link is invalid");
          return;
        }
        toast({
          title: "Error",
          description: "Failed to load merchant information",
          variant: "destructive"
        });
        // Set default data for testing even on error
        setMerchantData({
          business_name: "PaySME Store",
          logo: paysmeLogoSmall,
          merchant_id: merchantId,
          vendor_id: "TEST_VENDOR"
          ,tax_mode: "not_registered",
          vat_rate: 0
        });
      } finally {
        setIsLoadingMerchant(false);
      }
    };

    if (merchantId || qrSlug) {
      void fetchMerchantData();
    }
  }, [merchantId, qrSlug, toast]);

  const onSubmit = async (data: PaymentFormData) => {
    setLoading(true);
    const normalizedMobile = normalizeNamibianMobile(data.mobile);
    
    try {
      console.log("Creating transaction for merchant:", effectiveMerchantId);
      console.log("Transaction payload:", {
        merchant_id: effectiveMerchantId,
        amount: baseAmount,
        type: 'api',
        invoice_id: invoiceId,
        town: data.town.trim(),
        email: data.email,
        mobile: normalizedMobile
      });

      // Create transaction using PaySME edge function
      const { data: response, error } = await supabase.functions.invoke('payments', {
        body: {
          action: 'create_transaction',
          payload: {
            merchant_id: qrSlug ? undefined : effectiveMerchantId,
            amount: baseAmount,
            type: 'api',
            invoice_id: invoiceId,
            town: data.town.trim(),
            email: data.email,
            mobile: normalizedMobile,
            qr_link_slug: qrSlug || undefined,
            qr_quantity: qrSlug ? quantity : undefined,
          }
        }
      });
      
      console.log("Edge function response:", response);
      console.log("Edge function error:", error);
      
      if (error) {
        console.error("Edge function error:", error);
        throw error;
      }
      
      if (!response?.ok) {
        console.error("Response not ok:", response);
        throw new Error(response?.error || 'Failed to generate code');
      }
      
      // Store form data and generated code
      setFormData({ ...data, mobile: normalizedMobile });
      setGeneratedCode(response.transaction.generated_code);
      setConfirmedAmount(Number(response.transaction.amount).toFixed(2));
      
      // Show success toast
      toast({
        title: "PaySME sent via SMS and Email to provided details for payment!",
        description: "Code generated successfully",
      });
      
      // Hide payment form modal and show paycode modal
      setShowPaymentForm(false);
      setShowPaycodeModal(true);
      
      console.log("Transaction created:", response.transaction);
      
    } catch (error) {
      console.error("Code generation error:", error);
      toast({
        title: "Code Generation Failed",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Loading state for merchant data
  if (isLoadingMerchant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-green-600 mb-4" />
            <p className="text-gray-600">Loading payment details...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state if merchant not found
  if (!merchantData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <AlertCircle className="h-8 w-8 text-red-600 mb-4" />
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Payment Link Invalid</h2>
            <p className="text-gray-600 text-center">{linkError || "This payment link is invalid or has expired."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        {/* Top Left - Powered By PaySME */}
        <div className="fixed left-4 top-4 z-10 text-center sm:left-6 sm:top-6">
          <p className="mb-1 text-xs text-gray-600 sm:mb-2 sm:text-sm">Powered By</p>
          <img
            src={paysmeLogoPoweredBy}
            alt="PaySME - Bridging Wallets, Apps & Websites"
            className="h-auto w-20 sm:w-24 md:w-35"
          />
        </div>
      </div>

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-5 sm:px-4">
          <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-[390px] overflow-y-auto rounded-lg bg-gray-700 p-4 shadow-2xl sm:p-5">
            {/* Header */}
            <div className="text-center mb-4">
              <h3 className="mb-1 text-xl font-bold text-white sm:text-2xl">{merchantData.business_name}</h3>
              <p className="text-gray-300 text-sm">Complete your payment securely with PaySME</p>
            </div>

            {/* Payment Info */}
            <div className="bg-gray-600 rounded p-3 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300 text-sm">{qrDetails ? "Product:" : "Invoice ID:"}</span>
                  <span className="text-white font-semibold">{invoiceId}</span>
                </div>
                {qrDetails?.description && (
                  <p className="mb-3 text-sm text-gray-300">{qrDetails.description}</p>
                )}
                {qrDetails?.allow_quantity && (
                  <div className="mb-3 flex items-center justify-between border-y border-white/10 py-3">
                    <div>
                      <span className="block text-sm text-gray-300">Quantity</span>
                      <span className="text-xs text-gray-400">
                        N$ {Number(qrDetails.amount).toFixed(2)} per unit
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label="Decrease quantity"
                        disabled={loading || quantity <= qrDetails.min_quantity}
                        onClick={() => setQuantity((current) => Math.max(qrDetails.min_quantity, current - 1))}
                        className="h-9 w-9 border-gray-400 bg-gray-600 text-white hover:bg-gray-500"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={qrDetails.min_quantity}
                        max={qrDetails.max_quantity}
                        step="1"
                        aria-label="Product quantity"
                        value={quantity}
                        disabled={loading}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (!Number.isFinite(next)) return;
                          setQuantity(Math.min(qrDetails.max_quantity, Math.max(qrDetails.min_quantity, Math.floor(next))));
                        }}
                        className="h-9 w-16 border-gray-400 bg-gray-700 px-2 text-center text-base font-bold text-white"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label="Increase quantity"
                        disabled={loading || quantity >= qrDetails.max_quantity}
                        onClick={() => setQuantity((current) => Math.min(qrDetails.max_quantity, current + 1))}
                        className="h-9 w-9 border-gray-400 bg-gray-600 text-white hover:bg-gray-500"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300 text-sm">{taxMode === "vat_exclusive" ? "Price before VAT:" : taxMode === "not_registered" ? "Price:" : qrDetails?.allow_quantity ? "Total:" : "Amount:"}</span>
                  <span className="text-white font-bold">N$ {baseAmount.toFixed(2)}</span>
                </div>
                {taxMode !== "not_registered" && <div className="flex justify-between items-center mb-2"><span className="text-gray-300 text-sm">VAT ({vatRate}%) {taxMode === "vat_inclusive" ? "included" : ""}</span><span className="text-white font-semibold">N$ {vatAmount.toFixed(2)}</span></div>}
                <div className="flex justify-between items-center mb-2 border-t border-white/10 pt-2">
                  <span className="text-gray-300 text-sm">Customer pays:</span>
                  <span className="text-white font-bold">N$ {amount}</span>
                </div>
                {recurring && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 text-sm">Billing</span>
                    <span className="text-blue-300 text-sm">{recurringPeriod} recurring</span>
                  </div>
                )}
            </div>

            {/* Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                <FormField
                  control={form.control}
                  name="town"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-white">Town</FormLabel>
                      <FormControl>
                        <TownAutocomplete
                          placeholder="Start typing your town"
                          className="h-11 text-base sm:h-10 sm:text-sm"
                          name={field.name}
                          value={field.value}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          onValueChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white text-sm">Email Address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="your@email.com"
                          className="h-11 text-base sm:h-10 sm:text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white text-sm">Mobile Number</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="0812345678 or 264812345678"
                          className="h-11 text-base sm:h-10 sm:text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="mb-4 h-11 w-full rounded bg-blue-600 py-2 text-base font-semibold text-white hover:bg-blue-700 sm:h-10 sm:text-sm"
                  disabled={loading || form.formState.isSubmitting}
                >
                  {loading || form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Generating PaySME Code...
                    </>
                  ) : (
                    "Generate PaySME Code"
                  )}
                </Button>
              </form>
            </Form>

            {/* Powered by footer */}
            <div className="text-center">
              <p className="text-gray-300 text-sm mb-1">Powered by</p>
              <img
                src={paysmeLogoSmall}
                alt="PaySME - Bridging Wallets, Apps & Websites"
                className="w-24 h-auto mx-auto"
              />
            </div>
          </div>
        </div>
      )}

      {/* Payment Code Modal */}
      <PaycodeModal
        isOpen={showPaycodeModal}
        onClose={() => setShowPaycodeModal(false)}
        generatedCode={generatedCode}
        paymentData={formData ? { 
          mobile: formData.mobile, 
          town: formData.town,
          email: formData.email, 
          subscribe: false,
          businessName: merchantData?.business_name,
          amount: amount,
          invoiceId: invoiceId,
          recurring: recurring,
          recurringPeriod: recurringPeriod,
          merchantId: effectiveMerchantId || undefined,
          taxMode,
          vatRate,
          netAmount: taxMode === "vat_inclusive" ? baseAmount - vatAmount : baseAmount,
          vatAmount,
          grossAmount: Number(amount),
        } : null}
      />
    </>
  );
};

export default HostedPayment;
