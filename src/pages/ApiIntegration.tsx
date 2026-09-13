import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Copy, ClipboardPaste, Eye, EyeOff, Loader2, FileText, Download, ExternalLink, Save, Mail, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatNad } from "@/lib/formatters";
import {
  createMerchantQrLink,
  downloadQrSvg,
  MerchantQrPaymentLink,
  qrSvgDataUri,
} from "@/lib/merchantQrLinks";
import { QrEmailDialog } from "@/components/QrEmailDialog";

// Form validation schema
const productFormSchema = z.object({
  amount: z.string().min(1, "Amount is required").refine(
    val => !isNaN(Number(val)) && Number(val) > 0 && Number(val) <= 1_000_000,
    "Amount must be between N$0.01 and N$1,000,000.00",
  ),
  invoice_id: z.string().min(1, "Invoice ID is required").max(100, "Invoice ID too long"),
  description: z.string().max(240, "Description is too long").optional(),
  recurring: z.boolean(),
  generate_qr: z.boolean(),
  allow_quantity: z.boolean(),
  max_quantity: z.string(),
  recurring_period: z.enum(["weekly", "monthly", "quarterly", "yearly"]).optional()
}).superRefine((data, context) => {
  if (!data.allow_quantity) return;
  const maximum = Number(data.max_quantity);
  if (!Number.isInteger(maximum) || maximum < 2 || maximum > 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["max_quantity"],
      message: "Maximum quantity must be a whole number between 2 and 100",
    });
  } else if (Math.round(Number(data.amount) * 100) * maximum / 100 > 1_000_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["max_quantity"],
      message: "Unit price multiplied by maximum quantity cannot exceed N$1,000,000.00",
    });
  }
  if (data.recurring) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["allow_quantity"],
      message: "Quantity selection is only available for non-recurring QR products",
    });
  }
});
type ProductFormData = z.infer<typeof productFormSchema>;

type ActiveSubscription = {
  id: string;
  plan_type: string;
  duration_months: number;
  amount: number;
  end_date: string | null;
  paycode_status: string | null;
};

type PlanRule = {
  plan_key: string;
  display_name: string;
  monthly_amount: number;
  paysme_transaction_fee_rate: number;
  card_payments_enabled: boolean;
  card_monthly_limit: number | null;
  other_payment_types_enabled: boolean;
  other_payment_monthly_limit: number | null;
  bulk_invoice_enabled: boolean;
  bulk_paycode_enabled: boolean;
  custom_branding_enabled: boolean;
};

type FacilitatorInfo = {
  facilitator_id: string;
  facilitator_key: string;
  display_name: string;
  payment_method: string;
  is_card: boolean;
  status: string;
};

type MerchantPaymentFacilitator = {
  merchant_payment_facilitator_id: string;
  merchant_id: string;
  payment_provider_id: string | null;
  facilitator_id: string | null;
  provider_key: string;
  provider_display_name: string;
  provider_merchant_code: string;
  provider_application_id?: string | null;
  provider_jwt_secret?: string | null;
  status: string;
  enabled: boolean;
  metadata?: Record<string, unknown> | null;
};

type FacilitatorDraft = {
  merchantCode: string;
  merchantAlias: string;
  applicationId: string;
  jwtSecret: string;
};

const emptyFacilitatorDraft: FacilitatorDraft = {
  merchantCode: "",
  merchantAlias: "",
  applicationId: "",
  jwtSecret: "",
};

const getFacilitatorDraftStorageKey = (merchantId?: string | null) =>
  merchantId ? `paysme_facilitator_drafts_${merchantId}` : "";

const facilitatorOptions = [
  { key: "adumo", label: "Adumo", requiresCardPlan: true, description: "Your Adumo Online merchant credentials.", placeholder: "Adumo Merchant ID" },
  { key: "mtc_maris", label: "MTC Maris", requiresCardPlan: false, description: "Enter the merchant code MTC Maris issued directly to your business.", placeholder: "MTC Maris merchant code" },
  { key: "wayame", label: "WayaMe", requiresCardPlan: false, description: "Verify the WayaMe/UPI payment address linked to your receiving account.", placeholder: "e.g. yourbusiness@wayame" },
  { key: "paypulse", label: "PayPulse", requiresCardPlan: false, description: "Enter the merchant code PayPulse issued directly to your business.", placeholder: "PayPulse merchant code" },
  { key: "paytoday", label: "PayToday", requiresCardPlan: false, description: "Your PayToday merchant code.", placeholder: "PayToday merchant code" },
  { key: "kazang", label: "Kazang", requiresCardPlan: false, description: "Enter the merchant code Kazang issued directly to your business.", placeholder: "Kazang merchant code" },
];

const getPlanKey = (planType?: string | null) => {
  if (!planType) return "";
  if (planType.startsWith("annual_partner")) return "annual_partner";
  if (planType.startsWith("starter")) return "starter";
  if (planType.startsWith("growth")) return "growth";
  if (planType.startsWith("scale")) return "scale";
  return planType.replace(/_(3|6|9|12)_months$/, "");
};

const ApiIntegration = () => {
  const {
    toast
  } = useToast();
  const {
    merchant
  } = useAuth();
  const [loading, setLoading] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [generatedSnippet, setGeneratedSnippet] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [generatedQrLink, setGeneratedQrLink] = useState<MerchantQrPaymentLink | null>(null);
  const [emailQrLink, setEmailQrLink] = useState<MerchantQrPaymentLink | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [returnUrl, setReturnUrl] = useState("");
  const [savingUrls, setSavingUrls] = useState(false);
  const [activeSubscription, setActiveSubscription] = useState<ActiveSubscription | null>(null);
  const [planRule, setPlanRule] = useState<PlanRule | null>(null);
  const [facilitators, setFacilitators] = useState<FacilitatorInfo[]>([]);
  const [facilitatorCodes, setFacilitatorCodes] = useState<MerchantPaymentFacilitator[]>([]);
  const [facilitatorDrafts, setFacilitatorDrafts] = useState<Record<string, FacilitatorDraft>>({});
  const [showFacilitatorSecrets, setShowFacilitatorSecrets] = useState<Record<string, boolean>>({});
  const [loadingFacilitators, setLoadingFacilitators] = useState(false);
  const [savingFacilitator, setSavingFacilitator] = useState<string | null>(null);
  const [verifyingWayame, setVerifyingWayame] = useState(false);

  useEffect(() => {
    if (merchant) {
      setWebhookUrl(merchant.webhook_url || "");
      setReturnUrl((merchant as any).return_url || "");
      const storageKey = getFacilitatorDraftStorageKey(merchant.merchant_id);
      try {
        const savedDrafts = sessionStorage.getItem(storageKey);
        if (savedDrafts) {
          setFacilitatorDrafts(JSON.parse(savedDrafts));
        }
      } catch (err) {
        console.warn("Could not restore facilitator drafts", err);
      }
    }
  }, [merchant]);

  useEffect(() => {
    if (!merchant) return;
    const storageKey = getFacilitatorDraftStorageKey(merchant.merchant_id);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(facilitatorDrafts));
    } catch (err) {
      console.warn("Could not save facilitator drafts", err);
    }
  }, [merchant, facilitatorDrafts]);

  const saveUrls = async () => {
    if (!merchant) return;
    setSavingUrls(true);
    try {
      const { error } = await supabase
        .from("merchants")
        .update({ webhook_url: webhookUrl || null, return_url: returnUrl || null } as any)
        .eq("merchant_id", merchant.merchant_id);
      if (error) throw error;
      toast({ title: "URLs saved", description: "Webhook and Return URLs updated successfully." });
    } catch (err: any) {
      toast({ title: "Error saving URLs", description: err.message, variant: "destructive" });
    } finally {
      setSavingUrls(false);
    }
  };

  // Auto-fill merchant details from database
  const merchantData = {
    merchant_id: merchant?.merchant_id || "",
    vendor_id: merchant?.vendor_id || "",
    api_key: merchant?.api_key || "",
    webhook_url: merchant?.webhook_url || "",
    business_name: merchant?.business_name || ""
  };
  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      amount: "",
      invoice_id: "",
      description: "",
      recurring: false,
      generate_qr: false,
      allow_quantity: false,
      max_quantity: "10",
      recurring_period: "monthly"
    }
  });
  const generateIntegration = async (data: ProductFormData) => {
    setLoading(true);
    try {
      const standardHostedLink = `${window.location.origin}/pay/${merchantData.merchant_id}?amount=${encodeURIComponent(data.amount)}&invoice_id=${encodeURIComponent(data.invoice_id)}&recurring=${data.recurring}&recurring_period=${encodeURIComponent(data.recurring_period || '')}`;
      const qrLink = data.generate_qr
        ? await createMerchantQrLink({
          product_reference: data.invoice_id,
          description: data.description || null,
          amount: Number(data.amount),
          recurring: data.recurring,
          recurring_period: data.recurring ? data.recurring_period : null,
          allow_quantity: data.allow_quantity,
          max_quantity: data.allow_quantity ? Number(data.max_quantity) : 1,
        })
        : null;
      const hostedLink = qrLink?.hosted_url || standardHostedLink;
      const snippet = `<!-- PaySME Payment Integration -->
<script defer src="https://www.paysme.site/sdk/v1/paysme.js"></script>
<script>
  var paysmeReady = false;
  var paysmeIntentKey = 'paysme_intent_${data.invoice_id}';
  var hostedCheckoutUrl = ${JSON.stringify(hostedLink)};
  var payButton = document.getElementById('paysme-pay-btn');

  function setPayButtonReady() {
    paysmeReady = !!(window.PaySME && window.PaySME.init);
    if (payButton) {
      payButton.disabled = !paysmeReady;
      payButton.textContent = paysmeReady ? 'Pay with PaySME' : 'Loading checkout...';
    }
  }

  setPayButtonReady();
  var sdkCheck = setInterval(function() {
    setPayButtonReady();
    if (paysmeReady) clearInterval(sdkCheck);
  }, 250);
  setTimeout(function() {
    clearInterval(sdkCheck);
    if (!paysmeReady && payButton) {
      payButton.disabled = false;
      payButton.textContent = 'Open secure checkout';
    }
  }, 10000);

  payButton.addEventListener('click', function() {
    if (!paysmeReady) {
      window.location.href = hostedCheckoutUrl;
      return;
    }

    localStorage.setItem(paysmeIntentKey, JSON.stringify({
      invoice_id: "${data.invoice_id}",
      amount_nad: ${data.amount},
      redirect_url: window.location.href
    }));

    window.PaySME.init({
      vendor_uuid: "${merchantData.merchant_id}", // Merchant ID UUID; never use Vendor ID
      api_key: "${merchantData.api_key}",
      product_name: "${data.invoice_id}",
      amount_nad: ${data.amount},
      invoice_id: "${data.invoice_id}",
      recurring: ${data.recurring},
      recurring_period: "${data.recurring_period || 'monthly'}",
      redirect_url: window.location.href,
      on_success: function(result) {
        localStorage.removeItem(paysmeIntentKey);
        console.log("PaySME Code:", result.generated_code);
      },
      on_error: function(error) {
        console.error("Payment error:", error.message || error);
      },
      on_cancel: function() {
        console.log("Payment cancelled");
      }
    });
  });
</script>

<button id="paysme-pay-btn" class="paysme-btn" disabled>Loading checkout...</button>`;
      setGeneratedSnippet(snippet);
      setGeneratedLink(hostedLink);
      setGeneratedQrLink(qrLink);
      toast({
        title: "Integration Generated Successfully!",
        description: qrLink
          ? "Your payment snippet, secure hosted link and reusable QR code are ready."
          : "Your payment snippet and hosted link are ready to use."
      });
    } catch (error) {
      console.error("Generation error:", error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const copyToClipboard = async (text: string, type: 'snippet' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${type === 'snippet' ? 'Code snippet' : 'Payment link'} copied to clipboard`
      });
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Please copy manually",
        variant: "destructive"
      });
    }
  };

  const pasteFromClipboard = async (setter: (value: string) => void, label: string) => {
    try {
      const text = await navigator.clipboard.readText();
      setter(text);
      toast({
        title: "Pasted",
        description: `${label} pasted from clipboard.`
      });
    } catch (err) {
      toast({
        title: "Paste failed",
        description: "Your browser blocked clipboard access. Please paste manually.",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchIntegrationReadiness();
  }, [merchant]);

  const fetchIntegrationReadiness = async () => {
    if (!merchant) {
      setHasActiveSubscription(false);
      setActiveSubscription(null);
      setPlanRule(null);
      setFacilitators([]);
      setFacilitatorCodes([]);
      setFacilitatorDrafts({});
      setCheckingSubscription(false);
      return;
    }

    setCheckingSubscription(true);
    setLoadingFacilitators(true);
    try {
      const db = supabase as any;
      const { data: subscriptions, error } = await supabase
        .from('subscriptions')
        .select('id, plan_type, duration_months, amount, end_date, paycode_status')
        .eq('user_id', merchant.merchant_id)
        .eq('status', 'active');

      if (error) throw error;

      // Check if any active subscription exists and end_date hasn't passed
      const activeSubscription = subscriptions?.find(sub => {
        if (!sub.end_date) return false;
        return sub.paycode_status === 'paid' && new Date(sub.end_date) > new Date();
      });

      const subscription = activeSubscription as ActiveSubscription | undefined;
      setHasActiveSubscription(!!subscription);
      setActiveSubscription(subscription || null);

      if (subscription) {
        const { data: ruleData, error: ruleError } = await db
          .from('subscription_plan_rules')
          .select('*')
          .eq('plan_key', getPlanKey(subscription.plan_type))
          .eq('is_active', true)
          .maybeSingle();
        if (ruleError) throw ruleError;
        setPlanRule(ruleData || null);
      } else {
        setPlanRule(null);
      }

      const [{ data: facilitatorsData, error: facilitatorsError }, { data: facilitatorData, error: facilitatorError }] = await Promise.all([
        db
          .from('facilitators')
          .select('facilitator_id, facilitator_key, display_name, payment_method, is_card, status')
          .eq('status', 'active')
          .order('sort_order', { ascending: true }),
        db
          .from('merchant_payment_facilitators')
          .select('*')
          .eq('merchant_id', merchant.merchant_id)
          .order('provider_display_name', { ascending: true })
      ]);

      if (facilitatorsError) throw facilitatorsError;
      if (facilitatorError) throw facilitatorError;

      const activeFacilitators = (facilitatorsData || []) as FacilitatorInfo[];
      const codes = (facilitatorData || []) as MerchantPaymentFacilitator[];
      setFacilitators(activeFacilitators);
      setFacilitatorCodes(codes);
      setFacilitatorDrafts(prev => ({
        ...prev,
        ...codes.reduce<Record<string, FacilitatorDraft>>((acc, item) => {
          const current = prev[item.provider_key] || emptyFacilitatorDraft;
          acc[item.provider_key] = {
            merchantCode: current.merchantCode || item.provider_merchant_code || "",
            merchantAlias: current.merchantAlias || String(item.metadata?.merchant_alias || ""),
            applicationId: current.applicationId || item.provider_application_id || "",
            jwtSecret: current.jwtSecret || item.provider_jwt_secret || "",
          };
          return acc;
        }, {})
      }));
    } catch (error) {
      console.error('Error checking subscription:', error);
      setHasActiveSubscription(false);
      setActiveSubscription(null);
      setPlanRule(null);
      setFacilitators([]);
      setFacilitatorCodes([]);
      setFacilitatorDrafts({});
    } finally {
      setCheckingSubscription(false);
      setLoadingFacilitators(false);
    }
  };

  const getFacilitatorId = (providerKey: string) =>
    facilitators.find(facilitator => facilitator.facilitator_key === providerKey)?.facilitator_id || null;

  const getFacilitatorCode = (providerKey: string) =>
    facilitatorCodes.find(item => item.provider_key === providerKey);

  const verifyWayameAddress = async () => {
    if (!merchant) return;
    const alias = (facilitatorDrafts.wayame?.merchantAlias || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}@[a-z0-9][a-z0-9.-]{1,63}$/.test(alias)) {
      toast({
        title: "Valid WayaMe address required",
        description: "Enter an address such as yourbusiness@wayame.",
        variant: "destructive",
      });
      return;
    }

    setVerifyingWayame(true);
    setSavingFacilitator("wayame");
    try {
      const { data, error } = await supabase.functions.invoke("wayame-payment", {
        body: { action: "verify_merchant", merchant_id: merchant.merchant_id, merchant_alias: alias },
      });
      if (error) throw new Error(data?.error || error.message);
      if (!data?.ok || !data?.valid) throw new Error(data?.error || "WayaMe could not verify this payment address");
      toast({
        title: "WayaMe address verified",
        description: `${data.verified_name} · ${data.institution_name}`,
      });
      await fetchIntegrationReadiness();
    } catch (error) {
      toast({
        title: "WayaMe verification failed",
        description: error instanceof Error ? error.message : "Please check the address and try again.",
        variant: "destructive",
      });
    } finally {
      setVerifyingWayame(false);
      setSavingFacilitator(null);
    }
  };

  const saveFacilitatorCode = async (providerKey: string) => {
    if (!merchant) return;
    const option = facilitatorOptions.find(item => item.key === providerKey);
    if (!option) return;
    const draft = facilitatorDrafts[providerKey] || emptyFacilitatorDraft;
    const code = (draft.merchantCode || "").trim();
    const applicationId = (draft.applicationId || "").trim();
    const jwtSecret = (draft.jwtSecret || "").trim();
    if (!code) {
      toast({
        title: providerKey === "adumo" ? "Adumo Merchant ID required" : "Merchant code required",
        description: providerKey === "adumo"
          ? "Enter the Adumo Merchant ID before saving."
          : `Enter your ${option.label} merchant code before saving.`,
        variant: "destructive"
      });
      return;
    }
    if (providerKey === "adumo" && (!applicationId || !jwtSecret)) {
      toast({
        title: "Adumo credentials incomplete",
        description: "Enter your Adumo Application ID and JWT Secret before saving.",
        variant: "destructive"
      });
      return;
    }

    setSavingFacilitator(providerKey);
    try {
      const db = supabase as any;
      const existing = getFacilitatorCode(providerKey);
      const payload = {
        merchant_id: merchant.merchant_id,
        facilitator_id: getFacilitatorId(providerKey),
        provider_key: providerKey,
        provider_display_name: option.label,
        provider_merchant_code: code,
        provider_application_id: providerKey === "adumo" ? applicationId : null,
        provider_jwt_secret: providerKey === "adumo" ? jwtSecret : null,
        enabled: existing?.enabled ?? true,
        status: existing?.status || "pending"
      };

      const query = existing
        ? db
          .from('merchant_payment_facilitators')
          .update(payload)
          .eq('merchant_payment_facilitator_id', existing.merchant_payment_facilitator_id)
        : db
          .from('merchant_payment_facilitators')
          .insert(payload);

      const { error } = await query;
      if (error) throw error;

      toast({
        title: "Facilitator code saved",
        description: `${option.label} merchant code has been saved.`
      });
      await fetchIntegrationReadiness();
    } catch (err: any) {
      toast({
        title: "Could not save facilitator code",
        description: err.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setSavingFacilitator(null);
    }
  };

  const setFacilitatorEnabled = async (providerKey: string, enabled: boolean) => {
    const existing = getFacilitatorCode(providerKey);
    const option = facilitatorOptions.find(item => item.key === providerKey);
    if (!existing || !option) return;

    setSavingFacilitator(providerKey);
    try {
      const db = supabase as any;
      const { error } = await db
        .from('merchant_payment_facilitators')
        .update({ enabled })
        .eq('merchant_payment_facilitator_id', existing.merchant_payment_facilitator_id);
      if (error) throw error;

      setFacilitatorCodes(prev => prev.map(item =>
        item.merchant_payment_facilitator_id === existing.merchant_payment_facilitator_id
          ? { ...item, enabled }
          : item
      ));
      toast({
        title: enabled ? "Payment button enabled" : "Payment button hidden",
        description: `${option.label} will ${enabled ? "show" : "not show"} on hosted pages and SDK modals.`
      });
    } catch (err: any) {
      toast({
        title: "Could not update payment button",
        description: err.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setSavingFacilitator(null);
    }
  };

  const currentPlanLabel = planRule?.display_name || (activeSubscription ? getPlanKey(activeSubscription.plan_type) : "No active plan");
  const cardLimitLabel = planRule?.card_payments_enabled
    ? planRule.card_monthly_limit === null
      ? "Unlimited"
      : `${formatNad(planRule.card_monthly_limit)} pm`
    : "Not available";

  const productPaymentDetailsCard = (
    <Card>
      <CardHeader>
        <CardTitle>Product/Payment Details</CardTitle>
        <CardDescription>
          Configure the payment amount and details
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(generateIntegration)} className="space-y-4">
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Amount (NAD)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="10.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="invoice_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Invoice ID / Product Reference</FormLabel>
                <FormControl>
                  <Input placeholder="INV-123 or Product Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Product Description <span className="text-muted-foreground">(optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="Short description shown in your QR list" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="recurring" render={({ field }) => (
              <FormItem className="flex items-center space-x-2">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                      if (checked) form.setValue("allow_quantity", false);
                    }}
                  />
                </FormControl>
                <FormLabel>Recurring Payment</FormLabel>
              </FormItem>
            )} />

            {form.watch("recurring") && (
              <FormField control={form.control} name="recurring_period" render={({ field }) => (
                <FormItem>
                  <FormLabel>Recurring Period</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <FormField control={form.control} name="generate_qr" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border bg-gray-50 p-4">
                <div className="pr-4">
                  <FormLabel className="font-semibold">Generate a reusable QR payment link</FormLabel>
                  <p className="mt-1 text-xs text-gray-600">
                    Customers scan one QR; each customer receives their own PaySME transaction and paycode.
                  </p>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )} />

            {form.watch("generate_qr") && !form.watch("recurring") && (
              <div className="space-y-3 rounded-lg border border-[#f6c431]/50 bg-[#f6c431]/10 p-4">
                <FormField control={form.control} name="allow_quantity" render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <div>
                      <FormLabel className="font-semibold">Let customers choose quantity</FormLabel>
                      <p className="mt-1 text-xs text-gray-600">
                        The QR amount becomes the unit price. PaySME calculates the final total securely.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {form.watch("allow_quantity") && (
                  <FormField control={form.control} name="max_quantity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum units per checkout</FormLabel>
                      <FormControl>
                        <Input type="number" min="2" max="100" step="1" className="max-w-40" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-paysme-green hover:bg-paysme-green/90"
              disabled={loading || checkingSubscription || !hasActiveSubscription}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : checkingSubscription ? "Checking Subscription..." : !hasActiveSubscription ? "API Subscription Required" : "Generate Integration"}
            </Button>
            {!checkingSubscription && !hasActiveSubscription && (
              <p className="text-sm text-red-600 mt-2 text-center">
                You need an active API subscription to generate integration codes.
              </p>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  return <ProtectedRoute>
      <div className="bg-paysme-gradient-start">
        <div className="p-8 px-12 bg-gray-100">
          <div className="mb-8">
            <p className="text-gray-600 mt-2">Generate payment snippets and hosted links for your products</p>
          </div>

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <div><strong>VAT is controlled centrally.</strong><p className="mt-1">Your Tax Settings apply automatically to snippets, hosted links, API paycodes, Request to Pay and QR checkouts. Do not add a separate VAT flag to each integration.</p></div>
            <Button type="button" variant="outline" onClick={() => window.location.assign("/portal/tax-settings")}>Review Tax Settings</Button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
            {/* Left Column - Merchant Details & Product Form */}
            <div className="space-y-6">
              {/* Merchant Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Your Merchant Details</CardTitle>
                  <CardDescription>
                    These details will be automatically included in your integration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Merchant ID (UUID used for vendor_uuid)</Label>
                    <div className="flex items-center space-x-2">
                      <Input value={merchantData.merchant_id} readOnly className="bg-gray-50" />
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(merchantData.merchant_id, 'link')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-1 text-xs font-medium text-amber-700">Use this UUID as <code>vendor_uuid</code> in the SDK and API.</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Vendor ID (portal reference only)</Label>
                    <div className="flex items-center space-x-2">
                      <Input value={merchantData.vendor_id} readOnly className="bg-gray-50" />
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(merchantData.vendor_id, 'link')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">API Key</Label>
                    <div className="flex items-center space-x-2">
                      <Input type={showApiKey ? "text" : "password"} value={merchantData.api_key} readOnly className="bg-gray-50" />
                      <Button size="sm" variant="outline" onClick={() => setShowApiKey(!showApiKey)}>
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Business Name</Label>
                    <Input value={merchantData.business_name || "Not set"} readOnly className="bg-gray-50" />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-foreground">Webhook URL</Label>
                    <div className="flex items-center space-x-2">
                      <Input
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://yourdomain.com/api/payments/callback"
                        className="flex-1"
                      />
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(webhookUrl, 'link')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => pasteFromClipboard(setWebhookUrl, 'Webhook URL')}>
                        <ClipboardPaste className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Server-to-server endpoint. PaySME will POST payment confirmations here with <code>paySMECode</code> and <code>status</code>.
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-foreground">Return / Redirect URL</Label>
                    <div className="flex items-center space-x-2">
                      <Input
                        value={returnUrl}
                        onChange={(e) => setReturnUrl(e.target.value)}
                        placeholder="https://yourdomain.com/payment/callback"
                        className="flex-1"
                      />
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(returnUrl, 'link')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => pasteFromClipboard(setReturnUrl, 'Return URL')}>
                        <ClipboardPaste className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Where users land after payment. PaySME appends <code>?generated_code=XXXX&status=success</code> as query params.
                    </p>
                  </div>

                  <Button onClick={saveUrls} disabled={savingUrls} size="sm" className="w-fit">
                    {savingUrls ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {savingUrls ? "Saving..." : "Save URLs"}
                  </Button>

                  <div>
                    <Label className="text-sm font-medium text-foreground">Webhook Secret</Label>
                    <div className="flex items-center space-x-2">
                      <Input type={showWebhookSecret ? "text" : "password"} value={merchant?.webhook_secret || ""} readOnly className="bg-muted" />
                      <Button size="sm" variant="outline" onClick={() => setShowWebhookSecret(!showWebhookSecret)}>
                        {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(merchant?.webhook_secret || "", 'link')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Include this in your webhook handler to verify requests are from PaySME
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Plan Access & Facilitator Codes */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>Plan Access & Facilitator Codes</CardTitle>
                      <CardDescription>
                        Save the merchant codes issued directly to your business. PaySME handles provider connections securely in the backend.
                      </CardDescription>
                    </div>
                    <Badge className={`${hasActiveSubscription ? "bg-green-600 text-white" : "bg-gray-500 text-white"} shrink-0 whitespace-nowrap px-3 py-1 text-center`}>
                      {checkingSubscription ? "Checking..." : currentPlanLabel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Card Payments</p>
                      <div className="mt-2 flex items-center gap-2">
                        {planRule?.card_payments_enabled ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                        )}
                        <p className="text-sm font-semibold text-gray-900">
                          {planRule?.card_payments_enabled ? "Available" : "Not available"}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">Limit: {cardLimitLabel}</p>
                    </div>
                    <div className="rounded-lg border bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Other Payments</p>
                      <div className="mt-2 flex items-center gap-2">
                        {planRule?.other_payment_types_enabled ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                        )}
                        <p className="text-sm font-semibold text-gray-900">
                          {planRule?.other_payment_types_enabled ? "Available" : "Not available"}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">PaySME fee: {planRule ? `${(Number(planRule.paysme_transaction_fee_rate) * 100).toFixed(2)}%` : "N/A"}</p>
                    </div>
                    <div className="rounded-lg border bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bulk Tools</p>
                      <div className="mt-2 flex items-center gap-2">
                        {planRule?.bulk_paycode_enabled || planRule?.bulk_invoice_enabled ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                        )}
                        <p className="text-sm font-semibold text-gray-900">
                          {planRule?.bulk_paycode_enabled || planRule?.bulk_invoice_enabled ? "Included" : "Not included"}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">Based on active paid subscription.</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">Do not use this human-readable ID as <code>vendor_uuid</code>.</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold text-gray-800">Facilitator Merchant Codes</Label>
                      {loadingFacilitators && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                    </div>

                    {facilitatorOptions.map(option => {
                      const saved = getFacilitatorCode(option.key);
                      const cardBlocked = option.requiresCardPlan && !planRule?.card_payments_enabled;
                      const isSaving = savingFacilitator === option.key;
                      return (
                        <div key={option.key} className="rounded-lg border bg-white p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{option.label}</p>
                              <p className="text-xs text-gray-500">
                                {cardBlocked
                                  ? "Card payments are not available on this plan."
                                  : saved
                                    ? `Saved as ${saved.status}.`
                                    : option.description}
                              </p>
                            </div>
                            <Badge variant="outline" className={saved?.enabled ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-600"}>
                              {saved ? (saved.enabled ? "Button enabled" : "Button hidden") : "Not saved"}
                            </Badge>
                          </div>

                          <div className="mb-3 flex items-center justify-between rounded-md border bg-gray-50 p-3">
                            <div>
                              <p className="text-xs font-semibold !text-white">Show this button to customers</p>
                              <p className="text-xs !text-white/90">
                                Applies to hosted pages and SDK modals. Copy PaySME Code always stays available.
                              </p>
                            </div>
                            <Switch
                              checked={Boolean(saved?.enabled)}
                              disabled={!saved || cardBlocked || loadingFacilitators || isSaving || (option.key === "wayame" && saved.status !== "active")}
                              onCheckedChange={(checked) => setFacilitatorEnabled(option.key, checked)}
                            />
                          </div>

                          <div className={option.key === "adumo" || option.key === "wayame" ? "space-y-2" : "flex flex-col gap-2 sm:flex-row"}>
                            {option.key === "adumo" ? (
                              <>
                                <div>
                                  <Label className="text-xs font-semibold text-gray-700">Adumo Merchant ID</Label>
                                  <Input
                                    value={facilitatorDrafts[option.key]?.merchantCode || ""}
                                    onChange={(event) => setFacilitatorDrafts(prev => ({
                                      ...prev,
                                      [option.key]: { ...(prev[option.key] || emptyFacilitatorDraft), merchantCode: event.target.value }
                                    }))}
                                    placeholder="e.g. 9BA5008C-08EE-4286-A349-54AF91A621B0"
                                    disabled={cardBlocked || loadingFacilitators}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs font-semibold text-gray-700">Adumo Application ID</Label>
                                  <Input
                                    value={facilitatorDrafts[option.key]?.applicationId || ""}
                                    onChange={(event) => setFacilitatorDrafts(prev => ({
                                      ...prev,
                                      [option.key]: { ...(prev[option.key] || emptyFacilitatorDraft), applicationId: event.target.value }
                                    }))}
                                    placeholder="e.g. 23ADADC0-DA2D-4DAC-A128-4845A5D71293"
                                    disabled={cardBlocked || loadingFacilitators}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs font-semibold text-gray-700">Adumo JWT Secret</Label>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type={showFacilitatorSecrets[option.key] ? "text" : "password"}
                                      value={facilitatorDrafts[option.key]?.jwtSecret || ""}
                                      onChange={(event) => setFacilitatorDrafts(prev => ({
                                        ...prev,
                                        [option.key]: { ...(prev[option.key] || emptyFacilitatorDraft), jwtSecret: event.target.value }
                                      }))}
                                      placeholder="Provided by Adumo Online"
                                      disabled={cardBlocked || loadingFacilitators}
                                      className="flex-1"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowFacilitatorSecrets(prev => ({ ...prev, [option.key]: !prev[option.key] }))}
                                      disabled={cardBlocked || loadingFacilitators}
                                    >
                                      {showFacilitatorSecrets[option.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                  </div>
                                  <p className="mt-1 text-xs text-amber-700">Keep this secret confidential. Never share it publicly.</p>
                                </div>
                              </>
                            ) : option.key === "wayame" ? (
                              <>
                                <div>
                                  <Label className="text-xs font-semibold text-gray-700">WayaMe Payment Address / UPI ID</Label>
                                  <Input
                                    value={facilitatorDrafts.wayame?.merchantAlias || ""}
                                    onChange={(event) => setFacilitatorDrafts(prev => ({
                                      ...prev,
                                      wayame: { ...(prev.wayame || emptyFacilitatorDraft), merchantAlias: event.target.value }
                                    }))}
                                    placeholder="e.g. yourbusiness@wayame"
                                    disabled={loadingFacilitators || verifyingWayame}
                                  />
                                </div>
                                {saved?.metadata?.verification_status === "verified" && (
                                  <div className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800">
                                    <div className="flex items-center gap-2 font-semibold">
                                      <CheckCircle2 className="h-4 w-4" /> WayaMe Address Verified
                                    </div>
                                    <p className="mt-1">{String(saved.metadata.verified_name || "Verified merchant")}</p>
                                    <p>{String(saved.metadata.institution_name || "Participating institution")}</p>
                                    <p className="mt-1 font-mono">{String(saved.metadata.merchant_alias || "")}</p>
                                  </div>
                                )}
                              </>
                            ) : (
                              <Input
                                value={facilitatorDrafts[option.key]?.merchantCode || ""}
                                onChange={(event) => setFacilitatorDrafts(prev => ({
                                  ...prev,
                                  [option.key]: { ...(prev[option.key] || emptyFacilitatorDraft), merchantCode: event.target.value }
                                }))}
                                placeholder={option.placeholder}
                                disabled={cardBlocked || loadingFacilitators}
                                className="flex-1"
                              />
                            )}
                            <Button
                              type="button"
                              onClick={() => option.key === "wayame" ? verifyWayameAddress() : saveFacilitatorCode(option.key)}
                              disabled={cardBlocked || loadingFacilitators || isSaving}
                              className={option.key === "adumo" ? "bg-paysme-green hover:bg-paysme-green/90" : "bg-paysme-green hover:bg-paysme-green/90"}
                            >
                              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : option.key === "wayame" ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                              {option.key === "wayame" ? "Verify & Save" : "Save"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Generated Output */}
            <div className="space-y-6">
              {productPaymentDetailsCard}

              {/* Code Snippet */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Integration Snippet</CardTitle>
                      <CardDescription>
                        Copy this code into your website
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(generatedSnippet, 'snippet')} disabled={!generatedSnippet}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea value={generatedSnippet || "Fill in the form to generate your snippet"} readOnly className="font-mono text-xs min-h-[200px] bg-gray-50" />
                </CardContent>
              </Card>

              {generatedQrLink?.qr_svg ? (
                <Card className="overflow-hidden border-[#f6c431]/60">
                  <CardHeader className="bg-[#202720] text-white">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-white">
                          <QrCode className="h-5 w-5 text-[#f6c431]" />
                          QR Payment Link Created
                        </CardTitle>
                        <CardDescription className="text-white/70">
                          {generatedQrLink.product_reference} · {formatNad(Number(generatedQrLink.amount))}
                          {generatedQrLink.allow_quantity
                            ? ` per unit · customer quantity up to ${generatedQrLink.max_quantity}`
                            : ""}
                        </CardDescription>
                      </div>
                      <Badge className="bg-green-600 text-white">Active</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 p-5">
                    <img
                      src={qrSvgDataUri(generatedQrLink.qr_svg)}
                      alt={`QR code for ${generatedQrLink.product_reference}`}
                      className="mx-auto w-full max-w-64 rounded-xl border bg-white p-3"
                    />
                    <p className="break-all rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600">
                      {generatedQrLink.hosted_url}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Button type="button" onClick={() => downloadQrSvg(generatedQrLink)}>
                        <QrCode className="mr-2 h-4 w-4" /> View / Download
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEmailQrLink(generatedQrLink)}>
                        <Mail className="mr-2 h-4 w-4" />
                        Email QR
                      </Button>
                      <Button type="button" variant="outline" onClick={() => copyToClipboard(generatedQrLink.hosted_url, "link")}>
                        <Copy className="mr-2 h-4 w-4" /> Copy destination
                      </Button>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
                      <Button type="button" variant="ghost" asChild>
                        <a href="/portal/qr-payment-links">Manage all QR links</a>
                      </Button>
                      <Button type="button" variant="ghost" asChild>
                        <a href={generatedQrLink.hosted_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" /> Open payment page
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              <QrEmailDialog
                link={emailQrLink}
                defaultEmail={merchant?.email || ""}
                onClose={() => setEmailQrLink(null)}
              />

              {/* Hosted Link */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Hosted Payment Link</CardTitle>
                      <CardDescription>
                        Share this link directly with customers
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(generatedLink, 'link')} disabled={!generatedLink}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea value={generatedLink || "Fill in the form to generate your link"} readOnly className="font-mono text-xs min-h-[100px] bg-gray-50" />
                  <p className="text-xs text-gray-500 mt-2">
                    Share this link on social media, WhatsApp, or embed it anywhere
                  </p>
                </CardContent>
              </Card>

              {/* Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle>Usage Instructions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <h4 className="font-medium">For the Snippet:</h4>
                    <p className="text-sm text-gray-600">
                      Copy and paste the generated code into your website's HTML where you want the payment button to appear.
                    </p>
                    <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm font-semibold text-amber-900">
                      Use Merchant ID for <code>vendor_uuid</code>; do not use Vendor ID.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium">For the Hosted Link:</h4>
                    <p className="text-sm text-gray-600">
                      Share this link directly with customers or use it in emails, social media, or messaging apps.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* API Documentation */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle>API Documentation</CardTitle>
                  </div>
                  <CardDescription>
                    Full PaySME Payment Modal API integration guide — SDK, REST endpoints, webhooks, error codes & test cards.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button asChild className="w-full" variant="default">
                    <a href="/docs/PaySME_Payment_Modal_API_Integration.md" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Documentation
                    </a>
                  </Button>
                  <Button asChild className="w-full" variant="outline">
                    <a href="/docs/PaySME_Payment_Modal_API_Integration.pdf" download>
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </a>
                  </Button>
                  <p className="text-xs text-gray-500 break-all pt-1">
                    URL: {typeof window !== 'undefined' ? window.location.origin : ''}/docs/PaySME_Payment_Modal_API_Integration.md
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>;
};
export default ApiIntegration;
