import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatNad } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, MessageSquare, Check, Copy, Loader2, X } from "lucide-react";
import { useBulkSmsAccess } from "@/hooks/useBulkSmsAccess";
import { PaycodeModal } from "@/components/PaycodeModal";
import { TownAutocomplete } from "@/components/TownAutocomplete";
import { normalizeNamibianMobile, validateNamibianMobile } from "@/lib/validations";

const paysmeLogoSmall = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
interface Subscription {
  id: string;
  plan_type: string;
  amount: number;
  duration_months: number;
  status: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  generated_code: string | null;
  paycode_status: string | null;
}
interface SubscriptionPlan {
  id: string;
  name: string;
  monthly: number;
  transactionFee: string;
  cardLimit: string;
  cardPayments: string;
  features: string[];
  unavailable?: string[];
  terms: Array<{ duration: number; price: number }>;
  popular?: boolean;
  bestValue?: boolean;
}

type SubscriptionHistoryRow = {
  key: string;
  id: string;
  type: 'subscription' | 'sms';
  amount: number;
  generated_code: string | null;
  date_generated: string;
  end_date: string | null;
  transaction_status: string | null;
  paycode_status: string | null;
  status: string | null;
};

type PendingCheckout = {
  record_id: string;
  record_type: 'subscription' | 'sms';
  merchant_id: string;
  transaction_id: string;
  invoice_id: string;
  generated_code: string;
  amount: string;
  product_reference: string;
  recurring: boolean;
  recurring_period: string | null;
  tax_mode: "not_registered" | "vat_inclusive" | "vat_exclusive";
  vat_rate: number;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  contact: {
    town: string;
    email: string;
    mobile: string;
  };
};

type PendingContact = PendingCheckout['contact'];

const emailIsValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const isRecoverablePaymentStatus = (status: string | null | undefined) =>
  ['pending', 'failed'].includes(String(status || '').toLowerCase());
const isPendingPaymentStatus = (status: string | null | undefined) =>
  String(status || '').toLowerCase() === 'pending';

const isNonBlockingTerminalStatus = (status: string | null | undefined) =>
  ['cancelled', 'failed', 'expired'].includes(String(status || '').toLowerCase());

const getEffectivePaymentStatus = (row: SubscriptionHistoryRow) => {
  // The subscription/SMS record is authoritative. A linked transaction can
  // remain pending when a cancellation update is blocked by transaction RLS.
  if (isNonBlockingTerminalStatus(row.paycode_status)) return row.paycode_status;
  if (isNonBlockingTerminalStatus(row.status)) return row.status;
  return row.transaction_status || row.paycode_status || row.status;
};

const formatSubscriptionPlanLabel = (subscription: Subscription) => {
  const planKey = subscription.plan_type.replace(/_\d+_months?$/i, "");
  const planName = (planKey === "annual_partner" ? "Corporate" : planKey)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return `${planName || "API Subscription"} / ${subscription.duration_months} months`;
};

const Subscriptions = () => {
  const {
    merchant
  } = useAuth();
  const { packageEligible: bulkPackageEligible, hasSmsCredentials, canUseBulkSms } = useBulkSmsAccess();
  const {
    toast
  } = useToast();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [smsTransactions, setSmsTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [smsTopUp, setSmsTopUp] = useState(500);
  const [isRecurring, setIsRecurring] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const [pendingContact, setPendingContact] = useState<PendingContact>({ town: "", email: "", mobile: "" });
  const [pendingContactOpen, setPendingContactOpen] = useState(false);
  const [pendingPaycodeOpen, setPendingPaycodeOpen] = useState(false);
  const [pendingPaymentLoadingKey, setPendingPaymentLoadingKey] = useState<string | null>(null);
  const [purchasePreview, setPurchasePreview] = useState<{ plan: SubscriptionPlan; term: { duration: number; price: number } } | null>(null);

  const subscriptionPlans: SubscriptionPlan[] = [{
    id: "starter",
    name: "Starter",
    monthly: 200,
    transactionFee: "2%",
    cardPayments: "No Card Payments",
    cardLimit: "Not available",
    terms: [
      { duration: 3, price: 600 },
      { duration: 6, price: 1200 },
      { duration: 9, price: 1800 },
      { duration: 12, price: 2400 }
    ],
    features: ["API activation", "Vendor ID", "All Basic Services", "Setup Support", "Basic Dashboard and Analytics", "Email Support", "Payment Widget Integration", "Payment Request Links by Email, SMS, and WhatsApp", "Real-time Payment Notifications", "24-48 Hour Settlement Guidance"],
    unavailable: ["Free Card Payment Integration", "Bulk invoice / PayCode generation"],
  }, {
    id: "growth",
    name: "Growth",
    monthly: 500,
    transactionFee: "1.85%",
    cardPayments: "Card payments available. Card Payments: Fee Free",
    cardLimit: "N$10,000 pm",
    terms: [
      { duration: 3, price: 1500 },
      { duration: 6, price: 3000 },
      { duration: 9, price: 4500 },
      { duration: 12, price: 6000 }
    ],
    features: ["Everything in Starter", "Free Card Payment Integration", "Priority Support", "API Integration Assistance", "Advanced Dashboard and Analytics"],
    unavailable: ["Bulk invoice / PayCode generation"],
    popular: true
  }, {
    id: "scale",
    name: "Scale",
    monthly: 1000,
    transactionFee: "1.5%",
    cardPayments: "Card payments available. Card Payments: Fee Free",
    cardLimit: "N$50,000 pm",
    terms: [
      { duration: 3, price: 3000 },
      { duration: 6, price: 6000 },
      { duration: 9, price: 9000 },
      { duration: 12, price: 12000 }
    ],
    features: ["Everything in Growth", "Free Card Payment Integration", "Bulk invoice / PayCode generation", "Request-to-Pay", "Product Performance Tracking", "Paycode Payment Tracking", "Priority Processing Support"]
  }, {
    id: "annual_partner",
    name: "Corporate",
    monthly: 3000,
    transactionFee: "1%",
    cardPayments: "Card payments available. Card Payments: Fee Free",
    cardLimit: "Unlimited",
    terms: [
      { duration: 3, price: 9000 },
      { duration: 6, price: 18000 },
      { duration: 9, price: 27000 },
      { duration: 12, price: 36000 }
    ],
    features: ["Everything in Scale", "Free Card Payment Integration", "Bulk invoice / PayCode generation", "Request-to-Pay", "Dedicated Onboarding Assistance", "Custom Reporting Support", "Annual Account Review", "25% discount on Bulk SMS", "Personalized Bulk SMS Sender ID"],
    bestValue: true
  }];
  const smsTopUpOptions = [10, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000];
  useEffect(() => {
    fetchSubscriptions();
    fetchTransactions();
    fetchSmsTransactions();
  }, [merchant]);
  const fetchSubscriptions = async () => {
    if (!merchant) return;
    try {
      const {
        data,
        error
      } = await supabase.from('subscriptions').select('*').eq('user_id', merchant.merchant_id).order('created_at', {
        ascending: false
      });
      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast({
        title: "Error",
        description: "Failed to load subscriptions",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    // Transactions for sub/sms use PaySME's merchant_id and can't be read via RLS by the user.
    // We rely on subscriptions + sms_transactions tables instead (which have user_id-based RLS).
    // This fetch is kept for backward compat but will likely return empty for sub/sms types.
    if (!merchant) return;
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_email', merchant.email)
        .or('type.eq.subscription,type.eq.sms')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchSmsTransactions = async () => {
    if (!merchant) return;
    try {
      const { data, error } = await supabase
        .from('sms_transactions')
        .select('*')
        .eq('user_id', merchant.merchant_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSmsTransactions(data || []);
    } catch (error) {
      console.error('Error fetching SMS transactions:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "PaySME code copied to clipboard",
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy code to clipboard",
        variant: "destructive"
      });
    }
  };

  const contactIsComplete = (contact: PendingContact) =>
    Boolean(contact.town.trim())
    && emailIsValid(contact.email)
    && validateNamibianMobile(contact.mobile);

  const openPreparedPaycode = (checkout: PendingCheckout, contact: PendingContact) => {
    setPendingCheckout(checkout);
    setPendingContact({
      town: contact.town.trim(),
      email: contact.email.trim().toLowerCase(),
      mobile: normalizeNamibianMobile(contact.mobile),
    });
    setPendingContactOpen(false);
    setPendingPaycodeOpen(true);
  };

  const handlePendingPayment = async (row: SubscriptionHistoryRow) => {
    const effectiveStatus = getEffectivePaymentStatus(row);
    if (
      !merchant
      || row.key.startsWith('tx-')
      || !isRecoverablePaymentStatus(effectiveStatus)
      || !row.generated_code
    ) return;
    setPendingPaymentLoadingKey(row.key);

    try {
      const { data, error } = await supabase.functions.invoke('payments', {
        body: {
          action: 'prepare_pending_checkout',
          payload: {
            user_id: merchant.merchant_id,
            record_id: row.id,
            record_type: row.type,
          },
        },
      });
      if (error || !data?.ok || !data?.checkout) {
        let functionMessage = data?.error as string | undefined;
        const errorContext = (error as { context?: Response } | null)?.context;
        if (!functionMessage && errorContext && typeof errorContext.json === 'function') {
          try {
            const errorBody = await errorContext.json() as { error?: string };
            functionMessage = errorBody?.error;
          } catch {
            // Keep the SDK's fallback message when the response is not JSON.
          }
        }
        throw new Error(functionMessage || error?.message || 'Unable to prepare this payment');
      }

      const checkout = data.checkout as PendingCheckout;
      const contact: PendingContact = {
        town: checkout.contact?.town || '',
        email: checkout.contact?.email || merchant.email || '',
        mobile: checkout.contact?.mobile || merchant.mobile_number || '',
      };
      setPendingCheckout(checkout);
      setPendingContact(contact);
      void Promise.all([fetchSubscriptions(), fetchTransactions(), fetchSmsTransactions()]);

      if (contactIsComplete(contact)) {
        openPreparedPaycode(checkout, contact);
      } else {
        setPendingContactOpen(true);
      }
    } catch (error: unknown) {
      toast({
        title: 'Payment unavailable',
        description: error instanceof Error ? error.message : 'This PaySME code could not be opened.',
        variant: 'destructive',
      });
      await Promise.all([fetchSubscriptions(), fetchSmsTransactions()]);
    } finally {
      setPendingPaymentLoadingKey(null);
    }
  };

  const continuePendingPayment = () => {
    if (!pendingCheckout) return;
    const town = pendingContact.town.trim();
    const email = pendingContact.email.trim().toLowerCase();
    const mobile = pendingContact.mobile.trim();

    if (!town) {
      return toast({ title: 'Town required', description: 'Enter the payer town to continue.', variant: 'destructive' });
    }
    if (!emailIsValid(email)) {
      return toast({ title: 'Valid email required', description: 'Enter a valid email address to continue.', variant: 'destructive' });
    }
    if (!validateNamibianMobile(mobile)) {
      return toast({
        title: 'Valid mobile number required',
        description: 'Use a Namibian mobile number beginning with 081, 083 or 085.',
        variant: 'destructive',
      });
    }

    openPreparedPaycode(pendingCheckout, { town, email, mobile });
  };

  const closePendingPaycode = () => {
    setPendingPaycodeOpen(false);
    setPendingCheckout(null);
    setPendingContact({ town: '', email: '', mobile: '' });
    void Promise.all([fetchSubscriptions(), fetchSmsTransactions()]);
  };
const handleSubscriptionPurchase = async (plan: SubscriptionPlan, term: { duration: number; price: number }, confirmed = false) => {
  if (!merchant) return;
  const isPlatformOwner = merchant.merchant_id === "00000000-1986-0026-0000-000000000001";
  if (!confirmed && !isPlatformOwner) {
    setPurchasePreview({ plan, term });
    return;
  }
  setPurchasePreview(null);
  setProcessingPayment(true);
  const selectedKey = `${plan.id}-${term.duration}`;
  setSelectedPlan(selectedKey);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated. Please log in again.');
    }

    const response = await fetch('https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        action: 'create_subscription',
        payload: {
          user_id: merchant.merchant_id,
          duration_months: term.duration,
          amount: term.price,
          plan_type: `${plan.id}_${term.duration}_months`,
          recurring: isRecurring
        }
      })
    });

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.error || responseData.message || 'Failed to generate PaySME code');
    }

    const { subscription, platform_owner: isPlatformOwner } = responseData;
    if (!subscription) {
      throw new Error('No subscription data returned. Please try again.');
    }

    toast({
      title: isPlatformOwner ? "✅ Subscription Activated!" : "✅ PaySME Code Generated!",
      description: isPlatformOwner
        ? "PaySME's platform-owner subscription has been activated without a charge."
        : "Your subscription code has been generated. Check the 'Subscription History' section below.",
      variant: "default"
    });

    await fetchSubscriptions();
    await fetchTransactions();
  } catch (error: any) {
    console.error('Subscription error:', error);
    toast({
      title: "❌ Transaction Failed",
      description: error?.message || "Failed to generate PaySME code. Please try again.",
      variant: "destructive"
    });
  } finally {
    setProcessingPayment(false);
    setSelectedPlan(null);
  }
};
const handleSMSTopUp = async () => {
  if (!merchant) return;
  setProcessingPayment(true);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated. Please log in again.');
    }

    const response = await fetch('https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        action: 'sms_topup',
        payload: {
          user_id: merchant.merchant_id,
          tokens_purchased: smsTopUp
        }
      })
    });

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.error || responseData.message || 'Failed to generate PaySME code');
    }

    const { sms_transaction } = responseData;
    if (!sms_transaction) {
      throw new Error('No transaction data returned. Please try again.');
    }

    toast({
      title: "✅ SMS Top-Up Code Generated!",
      description: `Your SMS credit code has been generated. Check the 'Subscription History' section below.`,
      variant: "default"
    });

    await fetchTransactions();
    await fetchSmsTransactions();
  } catch (error: any) {
    console.error('SMS top-up error:', error);
    toast({
      title: "❌ Transaction Failed",
      description: error?.message || "Failed to generate PaySME code. Please try again.",
      variant: "destructive"
    });
  } finally {
    setProcessingPayment(false);
  }
};
  const formatCurrency = formatNad;
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500 text-white';
      case 'pending':
        return 'bg-orange-500 text-white';
      case 'expired':
        return 'bg-red-500 text-white';
      case 'cancelled':
        return 'bg-red-700 text-white';
      case 'paid':
        return 'bg-green-500 text-white';
      default:
        return 'bg-blue-500 text-white';
    }
  };

  const handleCancelSubscription = async (subId: string) => {
    try {
      // First get the generated_code to find the transaction
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('generated_code')
        .eq('id', subId)
        .single();

      // Update transactions table FIRST to maintain data sanity
      if (sub?.generated_code) {
        await supabase
          .from('transactions')
          .update({ status: 'cancelled' })
          .eq('generated_code', sub.generated_code);
      }

      // Then update the subscriptions table
      const { error } = await supabase
        .from('subscriptions')
        .update({ paycode_status: 'cancelled', status: 'cancelled' })
        .eq('id', subId)
        .eq('user_id', merchant?.merchant_id);
      
      if (error) throw error;
      
      toast({
        title: "Subscription Cancelled",
        description: "Your pending subscription has been cancelled.",
      });
      
      await fetchSubscriptions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    }
  };

  const handleCancelSms = async (smsId: string) => {
    try {
      // First get the generated_code to find the transaction
      const { data: sms } = await supabase
        .from('sms_transactions')
        .select('generated_code')
        .eq('id', smsId)
        .single();

      // Update transactions table FIRST to maintain data sanity
      if (sms?.generated_code) {
        await supabase
          .from('transactions')
          .update({ status: 'cancelled' })
          .eq('generated_code', sms.generated_code);
      }

      // Then update the sms_transactions table
      const { error } = await supabase
        .from('sms_transactions')
        .update({ paycode_status: 'cancelled' })
        .eq('id', smsId)
        .eq('user_id', merchant?.merchant_id);
      
      if (error) throw error;
      
      toast({
        title: "SMS Transaction Cancelled",
        description: "Your pending SMS transaction has been cancelled.",
      });
      
      await fetchSmsTransactions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to cancel SMS transaction",
        variant: "destructive",
      });
    }
  };
  const now = new Date();
  // Subscription is only truly active if status is 'active' AND end_date hasn't passed
  // Subscription is only truly active if status='active', paycode_status='paid', and end_date hasn't passed
  const activeSubscription = subscriptions.find(s => 
    s.status === 'active' && s.paycode_status === 'paid' && s.end_date && new Date(s.end_date) > now
  );
  const latestSubscription = subscriptions[0];
  const subscriptionStatus = activeSubscription ?? latestSubscription;
  const subscriptionIsActive = Boolean(activeSubscription);
  const corporateSmsDiscountActive = Boolean(activeSubscription?.plan_type.startsWith('annual_partner'));
  const smsUnitPrice = corporateSmsDiscountActive ? 0.75 : 1;
  const smsTopUpPrice = smsTopUp * smsUnitPrice;
  const smsVatAmount = Math.round(smsTopUpPrice * 15) / 100;
  const smsCustomerTotal = Math.round((smsTopUpPrice + smsVatAmount) * 100) / 100;
  const hasRecoverableTransaction = (generatedCode?: string | null, transactionId?: string | null) =>
    transactions.some(transaction =>
      (generatedCode ? transaction.generated_code === generatedCode : transaction.transaction_id === transactionId)
      && isRecoverablePaymentStatus(transaction.status)
    );
  // A cancelled/failed subscription may still have a stale pending transaction.
  // Its own terminal status takes precedence so it cannot block a new plan.
  // Failed codes remain retryable from history, matching the SMS flow.
  const hasBlockingSubscription = subscriptions.some(subscription => {
    if (
      isNonBlockingTerminalStatus(subscription.paycode_status)
      || isNonBlockingTerminalStatus(subscription.status)
    ) return false;

    if (
      subscription.status === 'active'
      && subscription.paycode_status === 'paid'
      && subscription.end_date
      && new Date(subscription.end_date) > now
    ) return true;

    if (isPendingPaymentStatus(subscription.paycode_status)) return true;

    // Legacy rows without a paycode status can still use their transaction.
    return !subscription.paycode_status
      && hasRecoverableTransaction(subscription.generated_code);
  });
  const hasBlockingSms = smsTransactions.some(sms =>
    isPendingPaymentStatus(sms.paycode_status)
    || transactions.some(transaction =>
      (sms.generated_code ? transaction.generated_code === sms.generated_code : transaction.transaction_id === sms.transaction_id)
      && isPendingPaymentStatus(transaction.status)
    )
  );
  return <ProtectedRoute>
      <div className="min-h-screen min-w-0 overflow-x-hidden bg-paysme-gradient-start">
        <div className="min-w-0 bg-[#111812] p-8 px-12 text-white">
          {/* Current Subscription Status */}
          {subscriptionStatus && <Card className={`relative mb-12 overflow-hidden border-2 bg-[#222922] text-white shadow-[0_0_34px_rgba(246,196,49,0.16)] ${subscriptionIsActive ? 'border-yellow-400/80' : 'border-red-500/70'}`}>
              <CardHeader className="pr-28">
                <CardTitle className={`flex items-center space-x-2 ${subscriptionIsActive ? 'text-yellow-300' : 'text-red-300'}`}>
                  <span>{subscriptionIsActive ? 'Active Subscription' : 'Inactive Subscription'}</span>
                </CardTitle>
              </CardHeader>
              <div className={`absolute right-8 top-1/2 flex h-20 w-20 -translate-y-1/2 items-center justify-center rounded-full border-4 bg-white shadow-lg ${subscriptionIsActive ? 'border-emerald-500 text-emerald-500' : 'border-red-500 text-red-500'}`}>
                {subscriptionIsActive ? <Check className="h-12 w-12" strokeWidth={3.5} /> : <X className="h-12 w-12" strokeWidth={3.5} />}
              </div>
              <CardContent className="pr-28">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm font-medium text-white/75">Plan Type / Term</p>
                    <p className="font-semibold text-white">{formatSubscriptionPlanLabel(subscriptionStatus)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/75">Amount Paid</p>
                    <p className="font-semibold text-white">{formatCurrency(Number(subscriptionStatus.amount))}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/75">Valid Until</p>
                    <p className="font-semibold text-white">
                      {subscriptionStatus.end_date ? new Date(subscriptionStatus.end_date).toLocaleDateString() : 'Lifetime'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>}

          {/* Subscription Plans */}
          <div className="mb-12">
            <div className="mb-12 rounded-md border border-yellow-400/25 bg-black/35 px-6 py-10 text-center shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
              <h2 className="text-3xl font-bold text-white">Choose Your Subscription Plan</h2>
              <p className="mt-4 text-base font-medium text-white/75">Select the plan that best fits your business needs</p>
              <p className="mt-2 text-xs font-semibold text-yellow-300">**Prices exclude VAT</p>
              
              
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
              {subscriptionPlans.map(plan => <Card key={plan.id} className={`relative ${plan.popular ? 'border-yellow-400 shadow-lg scale-105' : plan.bestValue ? 'border-emerald-400 shadow-lg' : 'border-gray-200'}`}>
                  {plan.popular && <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-gray-900">
                      Most Popular
                    </Badge>}
                  {plan.bestValue && <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-white">
                      Best Value
                    </Badge>}
                  
                  <CardHeader className="text-center bg-gray-700">
                    <CardTitle className="text-xl text-gray-100">
                      {plan.name}
                    </CardTitle>
                    <CardDescription className="text-sm text-gray-100">
                      <span className="text-2xl font-bold">N${plan.monthly}</span> pm
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="space-y-4 pt-5">
                    <div className="rounded-lg border bg-gray-50 p-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-600">PaySME transaction fee</span>
                        <span className="font-bold text-gray-900">{plan.transactionFee}</span>
                      </div>
                      <div className="mt-2 flex justify-between gap-3">
                        <span className="text-gray-600">Card limit</span>
                        <span className="font-bold text-gray-900">{plan.cardLimit}</span>
                      </div>
                      <p className="mt-2 text-xs font-medium text-gray-700">{plan.cardPayments}</p>
                      <p className="mt-1 whitespace-nowrap text-[11px] text-gray-600">Other payments: unlimited value</p>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-600">Payment Terms</p>
                      <div className="grid grid-cols-2 gap-2">
                        {plan.terms.map(term => {
                          const selectedKey = `${plan.id}-${term.duration}`;
                          return (
                            <Button
                              key={term.duration}
                              onClick={() => handleSubscriptionPurchase(plan, term)}
                              disabled={processingPayment || hasBlockingSubscription}
                              className={`h-auto flex-col py-3 ${selectedPlan === selectedKey ? 'bg-gray-400' : hasBlockingSubscription ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                            >
                              <span>{term.duration} Months</span>
                              <span className="font-bold">{formatCurrency(term.price)}</span>
                            </Button>
                          );
                        })}
                      </div>
                      {hasBlockingSubscription && <p className="mt-2 text-center text-xs text-gray-500">Subscription Pending/Active</p>}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Includes</p>
                      {plan.features.map((feature, index) => <div key={index} className="flex items-start space-x-2 text-sm">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                          <span>{feature}</span>
                        </div>)}
                      {plan.unavailable?.map((feature, index) => <div key={`unavailable-${index}`} className="flex items-start space-x-2 text-sm text-gray-500">
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                          <span>{feature} not available</span>
                        </div>)}
                    </div>

                    <div className="text-center border-t pt-4">
                      <p className="text-2xl font-bold mb-2">
                        Select a term above
                      </p>
                      
                      <div className="mb-4 p-2 bg-gray-100 rounded">
                        <p className="text-sm font-medium">Vendor ID</p>
                        <p className="text-lg font-mono">{merchant?.vendor_id || 'N/A'}</p>
                      </div>

                      <div className="mb-4 text-sm">
                        <p><strong>Email:</strong> {merchant?.email || 'N/A'}</p>
                        <p><strong>Mobile Number:</strong> {merchant?.mobile_number || 'N/A'}</p>
                      </div>

                      <div className="flex items-center justify-center my-4">
                        <img src={paysmeLogoSmall} alt="PaySME Logo" className="w-[80px] h-auto" />
                      </div>

                      <Button 
                        hidden
                        onClick={() => handleSubscriptionPurchase(plan, plan.terms[0])} 
                        disabled={processingPayment || hasBlockingSubscription} 
                        className={`w-full ${selectedPlan?.startsWith(plan.id) ? 'bg-gray-400' : hasBlockingSubscription ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                        {processingPayment && selectedPlan?.startsWith(plan.id) ? "Processing..." : 
                         hasBlockingSubscription ? "Subscription Pending/Active" : 
                         "Generate PaySME Code"}
                      </Button>

                      {plan.bestValue && <p className="text-xs text-gray-500 mt-2">
                          Best value for established merchants
                        </p>}
                    </div>
                  </CardContent>
                </Card>)}
            </div>
          </div>

          {/* SMS Top-up Section */}
          {canUseBulkSms ? <Card>
            <CardHeader className="text-center bg-gray-700">
              <CardTitle className="flex items-center justify-center space-x-2 text-xl">
                <MessageSquare className="w-6 h-6" />
                <span className="text-gray-100">SMS Top Up</span>
              </CardTitle>
              <CardDescription className="text-gray-100">
                Add SMS credits for bulk messaging campaigns
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column - SMS Options */}
                <div className="lg:col-span-2">
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-2">Select SMS Credits</h3>
                    <p className="text-sm text-gray-600">
                      INCLUDES: • 500 SMS Units for Bulk Subscriptions
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    {smsTopUpOptions.map(amount => 
                      <Button 
                        key={amount} 
                        variant={smsTopUp === amount ? "default" : "outline"} 
                        onClick={() => setSmsTopUp(amount)} 
                        className="h-20 flex flex-col justify-center text-base"
                      >
                        <span className="font-semibold">{amount} SMS</span>
                        <span className="text-sm opacity-80">{formatCurrency(amount * smsUnitPrice)}</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Right Column - Summary & Payment */}
                <div className="lg:col-span-1">
                  <div className="bg-gray-50 rounded-lg p-6 space-y-6">
                    {/* Total */}
                    <div className="text-center">
                      <div className="space-y-2 text-sm text-gray-700">
                        <div className="flex justify-between"><span>Price before VAT</span><strong>{formatCurrency(smsTopUpPrice)}</strong></div>
                        <div className="flex justify-between"><span>VAT (15%)</span><strong>{formatCurrency(smsVatAmount)}</strong></div>
                      </div>
                      <div className="mt-4 border-y border-gray-300 py-4">
                        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Customer pays</h4>
                        <p className="mt-1 text-3xl font-extrabold text-gray-900">{formatCurrency(smsCustomerTotal)}</p>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-gray-500">Price includes 15% VAT</p>
                      {corporateSmsDiscountActive && (
                        <p className="mt-2 text-sm font-semibold text-emerald-700">
                          Corporate 25% Bulk SMS discount applied
                        </p>
                      )}
                    </div>

                    {/* Vendor Information */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-gray-700">Account Details</h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-600">Vendor ID:</span>
                          <p className="font-mono text-gray-900">{merchant?.vendor_id || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Email:</span>
                          <p className="text-gray-900">{merchant?.email || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Mobile:</span>
                          <p className="text-gray-900">{merchant?.mobile_number || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-center my-4">
                      <img src={paysmeLogoSmall} alt="PaySME Logo" className="w-[80px] h-auto" />
                    </div>

                    {/* Payment Button */}
                    <Button 
                      onClick={handleSMSTopUp} 
                      disabled={processingPayment || hasBlockingSms} 
                      className={`w-full py-3 ${hasBlockingSms ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white`}
                    >
                      {processingPayment ? "Processing..." : hasBlockingSms ? "SMS Purchase Pending" : "Generate PaySME Code"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card> : bulkPackageEligible && !hasSmsCredentials ? (
            <Card className="border-yellow-500/40 bg-[#222922] text-white">
              <CardHeader>
                <CardTitle>SMSPortal account setup required</CardTitle>
                <CardDescription className="text-gray-200">
                  Your package includes SMS tools, but SMS purchases remain unavailable until this merchant has its own SMS client ID and key.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {/* Subscription History - merged from subscriptions, sms_transactions, and transactions */}
          {(() => {
            // Build merged history rows, deduplicated by generated_code
            const seenCodes = new Set<string>();
            const historyRows: SubscriptionHistoryRow[] = [];

            // Helper: find matching transaction for a subscription/sms record
            const findMatchingTx = (code: string | null, txId?: string) => {
              if (code) return transactions.find(t => t.generated_code === code);
              if (txId) return transactions.find(t => t.transaction_id === txId);
              return null;
            };

            // 1. Subscriptions (include ALL, even with null generated_code)
            subscriptions.forEach(sub => {
              // Try to get generated_code from sub or matched transaction
              const matchedTx = findMatchingTx(sub.generated_code);
              const code = sub.generated_code || matchedTx?.generated_code || null;
              const dedupeKey = code || `sub-${sub.id}`;
              if (seenCodes.has(dedupeKey)) return;
              seenCodes.add(dedupeKey);
              historyRows.push({
                key: `sub-${sub.id}`,
                id: sub.id,
                type: 'subscription',
                amount: Number(sub.amount),
                generated_code: code,
                date_generated: sub.created_at,
                end_date: sub.end_date,
                transaction_status: matchedTx?.status || null,
                paycode_status: sub.paycode_status,
                status: sub.status,
              });
            });

            // 2. SMS transactions (include ALL, even with null generated_code)
            smsTransactions.forEach(sms => {
              const matchedTx = findMatchingTx(sms.generated_code, sms.transaction_id);
              const code = sms.generated_code || matchedTx?.generated_code || null;
              const dedupeKey = code || `sms-${sms.id}`;
              if (seenCodes.has(dedupeKey)) return;
              seenCodes.add(dedupeKey);
              historyRows.push({
                key: `sms-${sms.id}`,
                id: sms.id,
                type: 'sms',
                amount: Number(sms.tokens_purchased),
                generated_code: code,
                date_generated: sms.date_purchased,
                end_date: null,
                transaction_status: matchedTx?.status || null,
                paycode_status: sms.paycode_status,
                status: null,
              });
            });

            // 3. Remaining transactions not yet seen
            transactions.forEach(tx => {
              if (tx.generated_code && !seenCodes.has(tx.generated_code)) {
                seenCodes.add(tx.generated_code);
                historyRows.push({
                  key: `tx-${tx.transaction_id}`,
                  id: tx.transaction_id,
                  type: tx.type === 'sms' ? 'sms' : 'subscription',
                  amount: Number(tx.amount),
                  generated_code: tx.generated_code,
                  date_generated: tx.date_generated || tx.created_at,
                  end_date: null,
                  transaction_status: tx.status,
                  paycode_status: null,
                  status: null,
                });
              }
            });

            // Sort by date descending
            historyRows.sort((a, b) => new Date(b.date_generated).getTime() - new Date(a.date_generated).getTime());

            return (
              <Card className="mt-8">
                <CardHeader className="bg-gray-700">
                  <CardTitle className="text-gray-100">Subscription History</CardTitle>
                  <CardDescription className="text-gray-100">Your subscription and SMS transaction codes</CardDescription>
                </CardHeader>
                <CardContent>
                  {historyRows.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No history yet</p>
                  ) : (
                    <div className="space-y-4 mt-4">
                      {historyRows.map(row => {
                        const effectivePaymentStatus = getEffectivePaymentStatus(row);
                        const hasRecoverableRecord = !row.key.startsWith('tx-');
                        const isRecoverablePayment = hasRecoverableRecord && isRecoverablePaymentStatus(effectivePaymentStatus);
                        const isCopyDisabled = !isRecoverablePayment;
                        const canCancel = String(effectivePaymentStatus || '').toLowerCase() === 'pending';
                        const canPay = isRecoverablePayment && Boolean(row.generated_code);
                        const isPreparingPayment = pendingPaymentLoadingKey === row.key;
                        const noPaymentRequired = row.type === 'subscription'
                          && row.paycode_status === 'paid'
                          && row.amount === 0
                          && !row.generated_code;
                        // Only show expiry when paycode is paid (active subscription)
                        const showExpiry = row.end_date && row.paycode_status === 'paid';

                        return (
                          <div key={row.key} className="flex min-w-0 flex-col gap-4 rounded-lg border bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2 mb-2 flex-wrap gap-1">
                                <p className="font-semibold">
                                  {row.type === 'subscription' ? '📋 Subscription' : '📱 SMS Credits'}
                                </p>
                                {row.transaction_status && (
                                  <Badge className={getStatusColor(row.transaction_status)}>
                                    {row.transaction_status.toUpperCase()}
                                  </Badge>
                                )}
                                {row.paycode_status && (
                                  <Badge className={getStatusColor(row.paycode_status)}>
                                    {row.paycode_status.toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">
                                Amount: {formatCurrency(row.amount)} | 
                                Generated: {new Date(row.date_generated).toLocaleDateString()}
                                {showExpiry && ` | Expires: ${new Date(row.end_date!).toLocaleDateString()}`}
                              </p>
                            </div>
                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                              {canPay && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handlePendingPayment(row)}
                                  disabled={isPreparingPayment}
                                  className="min-h-10 bg-[#f0b429] px-4 font-bold text-[#1e2320] hover:bg-[#d99c12]"
                                >
                                  {isPreparingPayment ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <CreditCard className="mr-2 h-4 w-4" />
                                  )}
                                  {isPreparingPayment ? 'Opening...' : 'Pay with PaySME'}
                                </Button>
                              )}
                              {canCancel && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    if (row.type === 'subscription') {
                                      handleCancelSubscription(row.id);
                                    } else {
                                      handleCancelSms(row.id);
                                    }
                                  }}
                                  className="flex items-center space-x-1 bg-red-600 hover:bg-red-700 rounded-full px-3"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Cancel</span>
                                </Button>
                              )}
                              <div className="text-left sm:text-right">
                                <p className="text-sm text-gray-500">{noPaymentRequired ? 'Payment' : 'PaySME Code'}</p>
                                <p className="break-all font-mono text-lg font-bold">
                                  {noPaymentRequired ? 'No payment required' : row.generated_code || 'Pending...'}
                                </p>
                              </div>
                              {row.generated_code && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(row.generated_code!)}
                                  disabled={isCopyDisabled}
                                  className={`flex items-center space-x-1 ${isCopyDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                  <Copy className="w-4 h-4" />
                                  <span>Copy</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

        </div>

        {purchasePreview && createPortal(
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="subscription-vat-title">
            <div className="relative w-full max-w-sm rounded-2xl border border-[#f0b429]/45 bg-[#222922] p-6 text-white shadow-2xl">
              <button type="button" onClick={() => setPurchasePreview(null)} className="absolute right-4 top-4 rounded-full p-2 text-white/70 hover:bg-white/10" aria-label="Close subscription total"><X className="h-5 w-5" /></button>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f0b429]">Subscription total</p>
              <h2 id="subscription-vat-title" className="mt-2 pr-10 text-2xl font-bold">{purchasePreview.plan.name} · {purchasePreview.term.duration} months</h2>
              <p className="mt-2 text-xs font-semibold text-white/60">**Prices exclude VAT</p>
              <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex justify-between"><span className="text-white/65">Price before VAT</span><strong>{formatCurrency(purchasePreview.term.price)}</strong></div>
                <div className="flex justify-between"><span className="text-white/65">VAT (15%)</span><strong>{formatCurrency(purchasePreview.term.price * 0.15)}</strong></div>
                <div className="flex justify-between border-t border-white/15 pt-3 text-lg"><span>Customer pays</span><strong className="text-[#f0b429]">{formatCurrency(purchasePreview.term.price * 1.15)}</strong></div>
              </div>
              <Button type="button" onClick={() => handleSubscriptionPurchase(purchasePreview.plan, purchasePreview.term, true)} disabled={processingPayment} className="mt-6 min-h-12 w-full bg-[#f0b429] text-base font-bold text-[#1e2320] hover:bg-[#d99c12]">
                {processingPayment ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : "Pay now"}
              </Button>
            </div>
          </div>,
          document.body
        )}

        {pendingContactOpen && pendingCheckout && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/50 p-3" role="dialog" aria-modal="true" aria-labelledby="pending-payment-title">
            <div className="relative w-full max-w-sm scale-75 rounded-2xl border border-[#f0b429]/35 bg-[#222922] p-5 text-white shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  setPendingContactOpen(false);
                  setPendingCheckout(null);
                }}
                className="absolute right-4 top-4 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close pending payment"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="pr-10">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f0b429]">Pay with PaySME</p>
                <h2 id="pending-payment-title" className="mt-2 text-2xl font-bold">Complete payer details</h2>
                <p className="mt-2 text-sm text-white/70">
                  We found your existing PaySME code. No new code will be generated.
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                <div className="flex justify-between gap-4"><span className="text-white/60">Product</span><span className="text-right font-semibold">{pendingCheckout.product_reference}</span></div>
                <div className="mt-2 flex justify-between gap-4"><span className="text-white/60">Amount</span><span className="font-bold text-[#f0b429]">{formatCurrency(Number(pendingCheckout.amount))}</span></div>
                <div className="mt-2 flex justify-between gap-4"><span className="text-white/60">PaySME Code</span><span className="font-mono font-bold">{pendingCheckout.generated_code}</span></div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pending-payer-town" className="text-white">Town</Label>
                  <TownAutocomplete
                    id="pending-payer-town"
                    value={pendingContact.town}
                    onValueChange={(town) => setPendingContact(current => ({ ...current, town }))}
                    placeholder="Start typing your town"
                    className="h-11 border-white/20 bg-white text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pending-payer-email" className="text-white">Email address</Label>
                  <Input
                    id="pending-payer-email"
                    type="email"
                    autoComplete="email"
                    value={pendingContact.email}
                    onChange={(event) => setPendingContact(current => ({ ...current, email: event.target.value }))}
                    placeholder="you@example.com"
                    className="h-11 border-white/20 bg-white text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pending-payer-mobile" className="text-white">Mobile number</Label>
                  <Input
                    id="pending-payer-mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={pendingContact.mobile}
                    onChange={(event) => setPendingContact(current => ({ ...current, mobile: event.target.value }))}
                    placeholder="0812345678"
                    className="h-11 border-white/20 bg-white text-gray-900"
                  />
                </div>
              </div>

              <Button
                type="button"
                onClick={continuePendingPayment}
                className="mt-6 min-h-12 w-full bg-[#f0b429] text-base font-bold text-[#1e2320] hover:bg-[#d99c12]"
              >
                Continue to payment options
              </Button>
            </div>
          </div>,
          document.body
        )}

        <PaycodeModal
          isOpen={pendingPaycodeOpen && Boolean(pendingCheckout)}
          onClose={closePendingPaycode}
          generatedCode={pendingCheckout?.generated_code || ''}
          renderInPortal
          paymentData={pendingCheckout ? {
            town: pendingContact.town,
            email: pendingContact.email,
            mobile: pendingContact.mobile,
            subscribe: pendingCheckout.record_type === 'subscription',
            businessName: pendingCheckout.product_reference,
            amount: pendingCheckout.amount,
            invoiceId: pendingCheckout.invoice_id,
            recurring: pendingCheckout.recurring,
            recurringPeriod: pendingCheckout.recurring_period || undefined,
            merchantId: pendingCheckout.merchant_id,
            taxMode: pendingCheckout.tax_mode,
            vatRate: pendingCheckout.vat_rate,
            netAmount: pendingCheckout.net_amount,
            vatAmount: pendingCheckout.vat_amount,
            grossAmount: pendingCheckout.gross_amount,
          } : null}
        />
      </div>
    </ProtectedRoute>;
};
export default Subscriptions;

