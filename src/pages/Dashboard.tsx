import { CSSProperties, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  ClipboardList,
  FileText,
  Home,
  IdCard,
  Loader2,
  Lock,
  LogOut,
  Percent,
  Plug,
  QrCode,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatNad } from "@/lib/formatters";
import { normalizeNamibianMobile } from "@/lib/validations";
import { useBulkSmsAccess } from "@/hooks/useBulkSmsAccess";
import { PwaInstallControl } from "@/components/PwaInstallControl";

const paysmeLogoSmall = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";

const brand = {
  page: "#151815",
  panel: "#222922",
  panelSoft: "#2b302d",
  sidebar: "#1d231f",
  yellow: "#f6c431",
  yellowHover: "#ffd84a",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.1)",
};

interface DashboardStats {
  totalRevenue: number;
  totalInvoiced: number;
  pendingValue: number;
  uniqueUsers: number;
  currentMonthFeeDue: number;
  transactionFeeRate: number;
  pendingCount: number;
  recentTransactions: any[];
  paidPercentage: number;
}

interface SubscriptionData {
  plan_type: string;
  start_date: string;
  end_date: string;
  status: string;
  paycode_status: string | null;
}

interface PlanRuleData {
  plan_key: string;
  paysme_transaction_fee_rate: number;
}

interface BillingStatus {
  current_month_fee_due: number | string | null;
  outstanding_invoice_number: string | null;
  outstanding_fee_amount: number | string | null;
  outstanding_generated_code: string | null;
  outstanding_payment_link: string | null;
  outstanding_due_date: string | null;
  outstanding_status: string | null;
  billing_locked: boolean | null;
}

const getPlanKey = (planType?: string | null) => {
  if (!planType) return "";
  if (planType.startsWith("annual_partner")) return "annual_partner";
  if (planType.startsWith("starter")) return "starter";
  if (planType.startsWith("growth")) return "growth";
  if (planType.startsWith("scale")) return "scale";
  return planType.replace(/_(3|6|9|12)_months$/, "");
};

const getInvoiceMonthLabel = (invoiceNumber?: string | null, dueDate?: string | null) => {
  const invoiceMonthMatch = invoiceNumber?.match(/PMF-(\d{4})(\d{2})-/i);
  if (invoiceMonthMatch) {
    const year = Number(invoiceMonthMatch[1]);
    const monthIndex = Number(invoiceMonthMatch[2]) - 1;
    const invoiceDate = new Date(year, monthIndex, 1);
    if (Number.isFinite(invoiceDate.getTime())) {
      return invoiceDate.toLocaleDateString("en-GB", { month: "long" });
    }
  }

  if (dueDate) {
    const parsedDueDate = new Date(`${dueDate}T00:00:00`);
    if (Number.isFinite(parsedDueDate.getTime())) {
      const invoiceMonth = new Date(parsedDueDate);
      invoiceMonth.setMonth(invoiceMonth.getMonth() - 1);
      return invoiceMonth.toLocaleDateString("en-GB", { month: "long" });
    }
  }

  return "";
};

const isBillingPastDue = (billingStatus: BillingStatus | null) => {
  const outstanding = Number(billingStatus?.outstanding_fee_amount || 0);
  if (outstanding <= 0) return false;
  if (billingStatus?.billing_locked) return true;
  if (!billingStatus?.outstanding_due_date) return false;

  const dueDate = new Date(`${billingStatus.outstanding_due_date}T23:59:59`);
  return Number.isFinite(dueDate.getTime()) && dueDate < new Date();
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { merchant, merchantSecurity, signOut } = useAuth();
  const { packageEligible: bulkPackageEligible } = useBulkSmsAccess();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchDashboardStats = async () => {
      if (!merchant?.merchant_id) {
        setStats(null);
        setSubscription(null);
        setBillingStatus(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setStats(null);
      setSubscription(null);
      setBillingStatus(null);

      try {
        const { data: transactions, error: transError } = await supabase
          .from("transactions")
          .select("*")
          .eq("merchant_id", merchant.merchant_id)
          .order("created_at", { ascending: false });

        if (transError) throw transError;

        const totalRevenue =
          transactions?.filter((t) => t.status === "paid").reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        const totalInvoiced = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        const pendingTransactions = transactions?.filter((t) => t.status === "pending") || [];
        const pendingValue = pendingTransactions.reduce((sum, t) => sum + Number(t.amount), 0);

        const { data: clients, error: clientError } = await supabase
          .from("merchant_clients")
          .select("merchant_client_id, mobile_number")
          .eq("merchant_id", merchant.merchant_id);

        if (clientError) throw clientError;

        const uniqueClientMobiles = new Set(
          (clients || [])
            .map((client) => client.mobile_number ? normalizeNamibianMobile(client.mobile_number) : "")
            .filter(Boolean)
        );

        const { data: subscriptionData, error: subError } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", merchant.merchant_id)
          .eq("status", "active")
          .eq("paycode_status", "paid")
          .order("end_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        let activePlanRule: PlanRuleData | null = null;

        if (subError && subError.code !== "PGRST116") {
          console.error("Subscription fetch error:", subError);
        } else {
          if (!cancelled) {
            setSubscription((subscriptionData as SubscriptionData | null) || null);
          }

          const planKey = getPlanKey(subscriptionData?.plan_type);
          if (planKey) {
            const { data: planRuleData, error: planRuleError } = await supabase
              .from("subscription_plan_rules")
              .select("plan_key, paysme_transaction_fee_rate")
              .eq("plan_key", planKey)
              .maybeSingle();

            if (planRuleError && planRuleError.code !== "PGRST116") {
              console.error("Plan rule fetch error:", planRuleError);
            } else {
              activePlanRule = planRuleData;
            }
          }
        }

        const { data: billingData, error: billingError } = await (supabase as any)
          .from("merchant_billing_status")
          .select("*")
          .eq("merchant_id", merchant.merchant_id)
          .maybeSingle();

        if (billingError && billingError.code !== "PGRST116") {
          console.error("Billing status fetch error:", billingError);
        } else if (!cancelled) {
          setBillingStatus((billingData as BillingStatus | null) || null);
        }

        const paidPercentage = totalInvoiced > 0 ? Math.round((totalRevenue / totalInvoiced) * 100) : 0;
        if (!cancelled) {
          setStats({
            totalRevenue,
            totalInvoiced,
            pendingValue,
            uniqueUsers: uniqueClientMobiles.size,
            currentMonthFeeDue: Number((billingData as BillingStatus | null)?.current_month_fee_due || 0),
            transactionFeeRate: Number(activePlanRule?.paysme_transaction_fee_rate || 0),
            pendingCount: pendingTransactions.length,
            recentTransactions: transactions?.slice(0, 4) || [],
            paidPercentage,
          });
        }
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Failed to load dashboard data",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDashboardStats();

    return () => {
      cancelled = true;
    };
  }, [merchant?.merchant_id, toast]);

  const handleSignOut = () => {
    if (signingOut) return;

    setSigningOut(true);
    window.setTimeout(async () => {
      await signOut();
      navigate("/");
    }, 3000);
  };

  const handlePayOutstandingFee = () => {
    if (!billingStatus?.outstanding_payment_link || outstandingAmount <= 0) {
      toast({
        title: "Invoice not ready",
        description: "The monthly fee invoice is missing payment details. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    const paymentWindow = window.open(billingStatus.outstanding_payment_link, "_blank", "noopener,noreferrer");
    if (!paymentWindow) {
      toast({
        title: "Popup blocked",
        description: "Please allow popups for PaySME or open the payment link again.",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = formatNad;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "text-emerald-300";
      case "pending":
        return "text-[#f6c431]";
      case "expired":
        return "text-red-300";
      default:
        return "text-slate-300";
    }
  };

  const navItems = [
    { label: "Overview", icon: Home, active: true },
    { label: "Track transactions", icon: BarChart3, path: "/portal/track-transactions" },
    { label: "Request-to-Pay", icon: ClipboardList, path: "/portal/bulk-subscribers" },
    { label: "QR Payments", icon: QrCode, path: "/portal/qr-payment-links" },
    { label: "Subscriptions", icon: FileText, path: "/portal/subscriptions" },
    { label: "API & integration", icon: Plug, path: "/portal/api-integration" },
    { label: "KYC", icon: IdCard, path: "/portal/kyc" },
    { label: "Tax settings", icon: ReceiptText, path: "/portal/tax-settings" },
    { label: "Security & Access", icon: ShieldCheck, path: "/portal/security-access" },
    { label: "Profile settings", icon: Settings, path: "/portal/profile" },
  ].filter((item) =>
    (item.path !== "/portal/bulk-subscribers" || bulkPackageEligible)
    && (merchantSecurity?.actor_role !== "staff" || !new Set(["/portal/tax-settings", "/portal/kyc", "/portal/security-access", "/portal/api-integration"]).has(item.path || ""))
  );

  const statCards = [
    {
      title: "Revenue Generated to Date",
      value: formatCurrency(stats?.totalRevenue || 0),
      icon: WalletCards,
      style: { borderColor: "rgba(52,211,153,0.45)", background: "rgba(52,211,153,0.11)", color: "#a7f3d0" },
    },
    {
      title: "Total Amount Invoiced",
      subtitle: "Codes generated",
      value: formatCurrency(stats?.totalInvoiced || 0),
      icon: FileText,
      style: { borderColor: "rgba(246,196,49,0.55)", background: "rgba(246,196,49,0.13)", color: brand.yellow },
    },
    {
      title: "Value of Pending Invoices",
      subtitle: "Codes generated",
      value: formatCurrency(stats?.pendingValue || 0),
      icon: Bell,
      style: { borderColor: "rgba(253,186,116,0.45)", background: "rgba(253,186,116,0.1)", color: "#fed7aa" },
    },
    {
      title: "Total Clients",
      value: String(stats?.uniqueUsers || 0),
      icon: Users,
      style: { borderColor: "rgba(125,211,252,0.35)", background: "rgba(125,211,252,0.1)", color: "#bae6fd" },
    },
    {
      title: "Current Month Fees Due",
      subtitle: stats?.transactionFeeRate ? `${(stats.transactionFeeRate * 100).toFixed(2).replace(/\.00$/, "")}% active transaction fee` : "Accruing from this month",
      value: formatCurrency(stats?.currentMonthFeeDue || 0),
      icon: Percent,
      style: { borderColor: "rgba(196,181,253,0.35)", background: "rgba(196,181,253,0.1)", color: "#ddd6fe" },
    },
    {
      title: "Pending Invoices",
      value: String(stats?.pendingCount || 0),
      icon: ClipboardList,
      style: { borderColor: "rgba(203,213,225,0.28)", background: "rgba(255,255,255,0.08)", color: "#ffffff" },
    },
  ];

  const outstandingAmount = Number(billingStatus?.outstanding_fee_amount || 0);
  const hasOutstandingFee = outstandingAmount > 0 && Boolean(billingStatus?.outstanding_invoice_number);
  const billingLocked = isBillingPastDue(billingStatus);
  const billingAccessPending = Boolean(merchant?.merchant_id) && loading;
  const portalRestricted = billingAccessPending || billingLocked;
  const taxDirectiveSaved = Boolean(merchant?.tax_settings_completed_at);
  const taxDirectiveRequiredPaths = new Set([
    "/portal/bulk-subscribers",
    "/portal/api-integration",
    "/portal/qr-payment-links",
  ]);
  const outstandingDueDate = billingStatus?.outstanding_due_date
    ? new Date(billingStatus.outstanding_due_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Not set";
  const outstandingInvoiceMonth = getInvoiceMonthLabel(
    billingStatus?.outstanding_invoice_number,
    billingStatus?.outstanding_due_date
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen text-white" style={{ background: brand.page, color: brand.text }}>
        {signingOut && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm">
            <div className="rounded-xl border border-yellow-400/40 bg-[#222922] px-8 py-7 text-center shadow-2xl">
              <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[#f6c431]" />
              <p className="text-lg font-bold text-white">Signing out...</p>
              <p className="mt-1 text-sm text-white/60">Closing your merchant session.</p>
            </div>
          </div>
        )}
        <header
          className="sticky top-0 z-30 px-4 py-2.5 backdrop-blur"
          style={{ background: "rgba(34,41,34,0.97)", borderBottom: `1px solid rgba(246,196,49,0.25)` }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={paysmeLogoSmall} alt="PaySME" className="h-9 w-auto" />
              {merchant && (
                <div>
                  <p className="text-xs uppercase tracking-[0.25em]" style={{ color: brand.yellow }}>Merchant Portal</p>
                  <p className="text-sm" style={{ color: brand.muted }}>
                    Welcome back, <span className="font-semibold" style={{ color: brand.text }}>{merchant.business_name || merchant.email}</span>
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <PwaInstallControl />
              <Button style={{ background: brand.yellow, color: brand.page }} onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                {signingOut ? "Signing Out" : "Sign Out"}
              </Button>
            </div>
          </div>
        </header>

        <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 61px)", background: brand.page }}>
          <aside
            className="p-3"
            style={{
              width: 238,
              minWidth: 238,
              minHeight: "calc(100vh - 61px)",
              background: brand.sidebar,
              borderRight: `1px solid ${brand.faint}`,
              position: "sticky",
              top: 61,
              alignSelf: "flex-start",
            }}
          >
            <div className="mb-3 rounded-md p-3" style={{ border: `1px solid rgba(246,196,49,0.2)`, background: "rgba(0,0,0,0.2)" }}>
              <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: brand.yellow }}>Merchant Portal</p>
              <p className="mt-1 truncate text-sm font-semibold" style={{ color: brand.text }}>{merchant?.business_name || "PaySME"}</p>
              <p className="mt-1 truncate text-xs" style={{ color: brand.muted }}>{merchant?.vendor_id || merchant?.email}</p>
            </div>

            <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.45)" }}>
              Navigation
            </div>

            <div className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const taxDisabled = Boolean(item.path) && !taxDirectiveSaved && taxDirectiveRequiredPaths.has(item.path!);
                const billingDisabled = portalRestricted && Boolean(item.path) && item.path !== "/portal/tax-settings";
                const disabled = taxDisabled || billingDisabled;
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-disabled={disabled}
                    title={taxDisabled ? "Save Tax Settings to unlock paycode generation." : billingDisabled ? "Portal sections are disabled until outstanding PaySME fees are paid." : undefined}
                    onClick={() => {
                      if (disabled) {
                        toast({
                          title: taxDisabled ? "Tax settings required" : "Portal section disabled",
                          description: taxDisabled
                            ? "Choose and save your VAT treatment in Tax Settings before generating paycodes."
                            : "Payments are temporarily disabled. Settle the outstanding PaySME fee from Overview to restore access.",
                        });
                        return;
                      }
                      item.path && navigate(item.path);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium transition"
                    style={disabled
                      ? { background: "rgba(107,114,128,0.24)", color: "rgba(255,255,255,0.38)", cursor: "not-allowed", opacity: 0.78 }
                      : item.active
                        ? { background: brand.yellow, color: brand.page, boxShadow: "0 10px 24px rgba(246,196,49,0.18)" }
                        : { color: "rgba(255,255,255,0.72)" }}
                  >
                    {disabled ? <Lock className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            {portalRestricted && (
              <div
                className="mt-5 rounded-md p-3 text-xs"
                style={{ border: `1px solid rgba(246,196,49,0.35)`, background: "rgba(246,196,49,0.1)", color: brand.text }}
              >
                <p className="font-semibold uppercase tracking-[0.16em]" style={{ color: brand.yellow }}>
                  {billingAccessPending ? "Checking standing" : "Fees outstanding"}
                </p>
                <p className="mt-2" style={{ color: brand.muted }}>
                  {billingAccessPending
                    ? "Portal sections stay locked while PaySME confirms this merchant account."
                    : "Payments are temporarily disabled. Pay the outstanding PaySME fee to unlock the rest of the portal."}
                </p>
              </div>
            )}
            {!taxDirectiveSaved && (
              <div
                className="mt-5 rounded-md p-3 text-xs"
                style={{ border: `1px solid rgba(246,196,49,0.5)`, background: "rgba(246,196,49,0.12)", color: brand.text }}
              >
                <p className="font-semibold uppercase tracking-[0.16em]" style={{ color: brand.yellow }}>Tax directive required</p>
                <p className="mt-2" style={{ color: brand.muted }}>
                  Save Tax Settings before creating bulk, API, payment-link or QR paycodes.
                </p>
              </div>
            )}
          </aside>

          <main className="flex-1 p-5 lg:p-8" style={{ background: brand.page, minWidth: 0 }}>
            <div className="content-scale-75-shell">
              <div className="content-scale-75">
                {loading ? (
                  <div className="flex h-64 items-center justify-center rounded-md" style={{ border: `1px solid ${brand.faint}`, background: "rgba(255,255,255,0.05)", color: brand.text }}>
                    <Loader2 className="h-8 w-8 animate-spin" style={{ color: brand.yellow }} />
                    <span className="ml-2">Loading dashboard...</span>
                  </div>
                ) : (
                  <>
                <section
                  className="mb-6 flex flex-col gap-5 rounded-md p-5 shadow-2xl shadow-black/20 xl:flex-row xl:items-stretch xl:justify-between"
                  style={{ background: brand.panel, border: `1px solid ${brand.faint}`, color: brand.text }}
                >
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <p className="text-xs uppercase tracking-[0.24em]" style={{ color: brand.yellow }}>Overview</p>
                    <h1 className="mt-2 text-2xl font-bold md:text-3xl" style={{ color: brand.text }}>Merchant performance</h1>
                    <p className="mt-1 text-sm" style={{ color: brand.muted }}>Live payment activity, customer growth, and subscription status.</p>
                  </div>
                  {hasOutstandingFee ? (
                    <div
                      className="grid gap-3 rounded-md p-4 sm:grid-cols-[1fr_auto] sm:items-center xl:min-w-[470px]"
                      style={{
                        background: billingStatus?.outstanding_status === "overdue" ? "rgba(239,68,68,0.14)" : "rgba(246,196,49,0.12)",
                        border: `1px solid ${billingStatus?.outstanding_status === "overdue" ? "rgba(248,113,113,0.55)" : "rgba(246,196,49,0.42)"}`,
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ReceiptText className="h-4 w-4" style={{ color: brand.yellow }} />
                          <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: brand.yellow }}>
                            Fees Outstanding{outstandingInvoiceMonth ? ` - ${outstandingInvoiceMonth}` : ""}
                          </p>
                        </div>
                        <p className="mt-2 text-2xl font-extrabold leading-none md:text-3xl" style={{ color: brand.text }}>
                          {formatCurrency(outstandingAmount)}
                        </p>
                        <p className="mt-2 text-sm" style={{ color: brand.muted }}>
                          Code: <span className="font-semibold" style={{ color: brand.text }}>{billingStatus?.outstanding_generated_code || "Pending"}</span>
                          {" "}• Due: {outstandingDueDate}
                        </p>
                      </div>
                      <Button
                        onClick={handlePayOutstandingFee}
                        className="w-full sm:w-auto"
                        style={{ background: brand.yellow, color: brand.page }}
                      >
                        Pay Now
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={() => navigate("/portal/api-integration")} className="w-fit" style={{ background: brand.yellow, color: brand.page }}>
                      <Plug className="mr-2 h-4 w-4" />
                      API & integration
                    </Button>
                  )}
                </section>

                {billingLocked && (
                  <section
                    className="mb-6 rounded-md p-4"
                    style={{
                      background: "rgba(246,196,49,0.12)",
                      border: "1px solid rgba(246,196,49,0.45)",
                      color: brand.text,
                    }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: brand.yellow }}>
                      Portal temporarily limited
                    </p>
                    <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.78)" }}>
                      Payments are temporarily disabled because PaySME fees are overdue. Use Pay Now above to settle the outstanding balance and restore access.
                    </p>
                  </section>
                )}

                <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.title} className="rounded-md border p-5" style={card.style as CSSProperties}>
                        <div className="mb-5 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold" style={{ color: brand.text }}>{card.title}</h3>
                            {card.subtitle && <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.52)" }}>{card.subtitle}</p>}
                          </div>
                          <div className="rounded-md p-2" style={{ border: `1px solid ${brand.faint}`, background: "rgba(0,0,0,0.2)" }}>
                            <Icon className="h-4 w-4" />
                          </div>
                        </div>
                        <p className="text-3xl font-bold tracking-tight" style={{ color: brand.text }}>{card.value}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mb-8">
                  {(() => {
                    const now = new Date();
                    let startDate: Date;
                    let endDate: Date;
                    let planType: string;
                    let isExpired = false;
                    let progressPercentage = 0;

                    if (subscription && subscription.status === "active" && subscription.paycode_status === "paid") {
                      startDate = new Date(subscription.start_date);
                      endDate = new Date(subscription.end_date);
                      planType = subscription.plan_type;
                      isExpired = now > endDate;
                      const totalDuration = endDate.getTime() - startDate.getTime();
                      const elapsed = now.getTime() - startDate.getTime();
                      progressPercentage = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                    } else {
                      startDate = new Date(merchant?.created_at || Date.now());
                      endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
                      planType = "Trial";
                      isExpired = now > endDate;
                      const totalDuration = 3 * 24 * 60 * 60 * 1000;
                      const elapsed = now.getTime() - startDate.getTime();
                      progressPercentage = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                    }

                    return (
                      <>
                        <div className="relative rounded-md p-6" style={{ background: brand.panelSoft, border: `1px solid ${brand.faint}`, color: brand.text }}>
                          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-xs uppercase tracking-[0.2em]" style={{ color: brand.yellow }}>Subscription</p>
                              <h3 className="mt-1 text-lg font-semibold">API Subscription - {planType} Plan</h3>
                            </div>
                            <p className="text-sm" style={{ color: brand.muted }}>
                              End Date:{" "}
                              {endDate.toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <div className="h-3 w-full rounded-full" style={{ background: "rgba(0,0,0,0.35)" }}>
                            <div
                              className="h-3 rounded-full transition-all duration-500"
                              style={{ width: `${progressPercentage}%`, background: progressPercentage >= 90 ? "#ef4444" : brand.yellow }}
                            />
                          </div>
                        </div>

                        {isExpired && (
                          <button
                            onClick={() => navigate("/portal/subscriptions")}
                            className="mt-4 w-full cursor-pointer rounded-md p-4 text-left transition-colors"
                            style={{ border: "1px solid rgba(248,113,113,0.6)", background: "rgba(239,68,68,0.15)", color: brand.text }}
                          >
                            <p className="font-medium">Subscription expired. Click here to activate payment API.</p>
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="rounded-md p-6" style={{ background: brand.panel, border: `1px solid ${brand.faint}`, color: brand.text }}>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Latest Transactions</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-transparent"
                        style={{ borderColor: "rgba(246,196,49,0.4)", color: brand.yellow }}
                        onClick={() => navigate("/portal/track-transactions")}
                      >
                        View all
                      </Button>
                    </div>
                    <div className="space-y-3 text-sm">
                      {stats?.recentTransactions.length === 0 ? (
                        <p style={{ color: "rgba(255,255,255,0.45)" }}>No transactions yet</p>
                      ) : (
                        stats?.recentTransactions.map((transaction) => (
                          <div key={transaction.transaction_id} className="flex justify-between rounded-md p-3" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.15)" }}>
                            <div>
                              <p className="font-medium">{transaction.generated_code}</p>
                              <p style={{ color: "rgba(255,255,255,0.45)" }}>
                                {transaction.user_email} | {transaction.user_mobile}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">{formatCurrency(Number(transaction.amount))}</p>
                              <p className={getStatusColor(transaction.status)}>{String(transaction.status).toUpperCase()}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-[325px] flex-col rounded-md p-6" style={{ background: brand.panel, border: "1px solid rgba(246,196,49,0.25)", color: brand.text }}>
                    <div>
                      <h3 className="text-lg font-semibold">Percentage of Total Generated Invoices - Paid</h3>
                      <p className="mt-1 text-xs" style={{ color: brand.subtle }}>
                        Paid value against all generated invoice value.
                      </p>
                    </div>
                    <div className="flex flex-1 items-center justify-center py-6">
                      <p className="leading-none font-extrabold tracking-tight" style={{ color: brand.yellow, fontSize: "clamp(7rem, 13vw, 13.5rem)" }}>
                        {stats?.paidPercentage || 0}
                        <span className="align-[0.08em] font-bold" style={{ fontSize: "0.48em" }}>%</span>
                      </p>
                    </div>
                  </div>
                </div>
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default Dashboard;
