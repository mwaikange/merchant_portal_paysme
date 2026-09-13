import { ReactNode, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  ClipboardList,
  FileText,
  Home,
  IdCard,
  Lock,
  LogOut,
  Loader2,
  Plug,
  QrCode,
  Settings,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useBulkSmsAccess } from "@/hooks/useBulkSmsAccess";
import { merchantUrl } from "@/lib/portalDomains";

const paysmeLogoSmall = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";

const brand = {
  page: "#151815",
  panel: "#222922",
  sidebar: "#1d231f",
  yellow: "#f6c431",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.1)",
};

const navItems = [
  { label: "Overview", icon: Home, path: "/portal/dashboard" },
  { label: "Track transactions", icon: BarChart3, path: "/portal/track-transactions" },
  { label: "Request-to-Pay", icon: ClipboardList, path: "/portal/bulk-subscribers" },
  { label: "QR Payments", icon: QrCode, path: "/portal/qr-payment-links" },
  { label: "Subscriptions", icon: FileText, path: "/portal/subscriptions" },
  { label: "API & integration", icon: Plug, path: "/portal/api-integration" },
  { label: "KYC", icon: IdCard, path: "/portal/kyc" },
  { label: "Tax settings", icon: ReceiptText, path: "/portal/tax-settings" },
  { label: "Security & Access", icon: ShieldCheck, path: "/portal/security-access" },
  { label: "Profile settings", icon: Settings, path: "/portal/profile" },
];

const alwaysAvailablePaths = new Set(["/portal/dashboard", "/portal/tax-settings"]);
const taxDirectiveRequiredPaths = new Set([
  "/portal/bulk-subscribers",
  "/portal/api-integration",
  "/portal/qr-payment-links",
]);

type BillingStatus = {
  outstanding_fee_amount: number | string | null;
  outstanding_generated_code: string | null;
  outstanding_due_date: string | null;
  billing_locked: boolean | null;
};

const isBillingPastDue = (billingStatus: BillingStatus | null) => {
  const outstanding = Number(billingStatus?.outstanding_fee_amount || 0);
  if (outstanding <= 0) return false;
  if (billingStatus?.billing_locked) return true;
  if (!billingStatus?.outstanding_due_date) return false;

  const dueDate = new Date(`${billingStatus.outstanding_due_date}T23:59:59`);
  return Number.isFinite(dueDate.getTime()) && dueDate < new Date();
};

export function PortalFrame({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { merchant, merchantSecurity, signOut } = useAuth();
  const { packageEligible: bulkPackageEligible } = useBulkSmsAccess();
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [lockNoticeReason, setLockNoticeReason] = useState<"billing" | "tax" | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const staffDeniedPaths = new Set(["/portal/tax-settings", "/portal/kyc", "/portal/security-access", "/portal/api-integration"]);
  const visibleNavItems = navItems.filter((item) =>
    (item.path !== "/portal/bulk-subscribers" || bulkPackageEligible)
    && (merchantSecurity?.actor_role !== "staff" || !staffDeniedPaths.has(item.path))
  );
  const current = visibleNavItems.find((item) => item.path === location.pathname) || visibleNavItems[0];
  const billingLocked = isBillingPastDue(billingStatus);
  const billingAccessPending = false;
  const portalRestricted = billingLocked;
  const taxDirectiveSaved = Boolean(merchant?.tax_settings_completed_at);
  const taxSectionLocked = !taxDirectiveSaved && taxDirectiveRequiredPaths.has(location.pathname);
  const billingSectionLocked = portalRestricted && !alwaysAvailablePaths.has(location.pathname);
  const lockedSection = taxSectionLocked || billingSectionLocked;

  const fetchBillingStatus = useCallback(async (showLoading = true) => {
    if (!merchant?.merchant_id) {
      setBillingStatus(null);
      setBillingLoading(false);
      return;
    }

    if (showLoading) {
      setBillingLoading(true);
      setBillingStatus(null);
    }

    const { data, error } = await supabase
      .from("merchant_billing_status")
      .select("outstanding_fee_amount, outstanding_generated_code, outstanding_due_date, billing_locked")
      .eq("merchant_id", merchant.merchant_id)
      .maybeSingle();

    if (error) {
      console.error("Unable to load merchant billing status:", error);
      if (showLoading) {
        setBillingStatus(null);
        setBillingLoading(false);
      }
      return;
    }

    setBillingStatus(data || null);
    setBillingLoading(false);
  }, [merchant?.merchant_id]);

  useEffect(() => {
    fetchBillingStatus(true);

    const interval = window.setInterval(() => {
      fetchBillingStatus(false);
    }, 60 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [fetchBillingStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      window.location.reload();
    }, 20 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  const handleSignOut = () => {
    if (signingOut) return;

    setSigningOut(true);
    window.setTimeout(async () => {
      await signOut();
      window.location.replace(merchantUrl("/auth"));
    }, 3000);
  };

  const showLockNotice = (reason: "billing" | "tax") => {
    setLockNoticeReason(reason);
    window.setTimeout(() => setLockNoticeReason(null), 4200);
  };

  const lockTitle = billingAccessPending ? "Checking portal standing" : "Portal temporarily limited";
  const lockBody = billingAccessPending
    ? "Please wait while PaySME confirms this merchant account is in good standing."
    : "Payments and portal sections are disabled because PaySME fees are overdue. Use the Pay Now button on Overview to settle the outstanding balance and restore access.";

  return (
    <div className="portal-frame portal-frame-scale-90 h-full overflow-hidden" style={{ background: brand.page, color: brand.text }}>
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
        className="relative z-30 h-[61px] shrink-0 px-4 py-2.5 backdrop-blur"
        style={{ background: "rgba(34,41,34,0.97)", borderBottom: `1px solid rgba(246,196,49,0.25)` }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={paysmeLogoSmall} alt="PaySME" className="h-9 w-auto" />
            <div>
              <p className="text-xs uppercase tracking-[0.25em]" style={{ color: brand.yellow }}>
                PaySME Merchant Management Portal
              </p>
              <p className="text-sm" style={{ color: brand.muted }}>
                Welcome back, <span className="font-semibold" style={{ color: brand.text }}>{merchant?.business_name || merchant?.email}</span>
              </p>
            </div>
          </div>
          <div aria-hidden="true" />
        </div>
      </header>

      <div style={{ display: "flex", alignItems: "stretch", height: "calc(100% - 61px)", minHeight: 0, overflow: "hidden", background: brand.page }}>
        <aside
          className="flex flex-col p-3"
          style={{
            width: 238,
            minWidth: 238,
            minHeight: 0,
            height: "100%",
            overflowY: "hidden",
            background: brand.sidebar,
            borderRight: `1px solid ${brand.faint}`,
            position: "relative",
            top: 0,
            alignSelf: "flex-start",
          }}
        >
          <div className="mb-3 rounded-md p-3" style={{ border: `1px solid rgba(246,196,49,0.2)`, background: "rgba(0,0,0,0.2)" }}>
            <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: brand.yellow }}>PaySME Merchant Management Portal</p>
            <p className="mt-1 truncate text-sm font-semibold" style={{ color: brand.text }}>{merchant?.business_name || "PaySME"}</p>
            <p className="mt-1 truncate text-xs" style={{ color: brand.muted }}>{merchant?.vendor_id || merchant?.email}</p>
          </div>

          <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.45)" }}>
            Navigation
          </div>

          <div className="space-y-0.5">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.path === location.pathname;
              const taxDisabled = !taxDirectiveSaved && taxDirectiveRequiredPaths.has(item.path);
              const billingDisabled = portalRestricted && !alwaysAvailablePaths.has(item.path);
              const disabled = taxDisabled || billingDisabled;
              return (
                <button
                  key={item.label}
                  type="button"
                  aria-disabled={disabled}
                  title={taxDisabled ? "Save Tax Settings to unlock paycode generation." : billingDisabled ? "Payments are disabled until outstanding PaySME fees are paid." : undefined}
                  onClick={() => {
                    if (disabled) {
                      showLockNotice(taxDisabled ? "tax" : "billing");
                      return;
                    }
                    navigate(item.path);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium transition"
                  style={disabled
                    ? { background: "rgba(107,114,128,0.24)", color: "rgba(255,255,255,0.38)", cursor: "not-allowed", opacity: 0.78 }
                    : active
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
                  ? "Portal sections stay locked until the billing check completes."
                  : "Pay the outstanding PaySME fee from Overview to unlock the rest of the portal."}
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
          <div className="mt-auto pt-6">
            <Button type="button" className="w-full" style={{ background: brand.yellow, color: brand.page }} onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              {signingOut ? "Signing Out" : "Sign Out"}
            </Button>
          </div>
        </aside>

        <main className="portal-frame-content h-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5 lg:p-8" style={{ background: brand.page }}>
          <div className="content-scale-75-shell">
            <div className="content-scale-75">
              <section
                className="mb-6 rounded-md p-5"
                style={{ background: brand.panel, border: `1px solid ${brand.faint}`, color: brand.text }}
              >
                <p className="text-xs uppercase tracking-[0.24em]" style={{ color: brand.yellow }}>Portal</p>
                <h1 className="mt-2 text-2xl font-bold md:text-3xl" style={{ color: brand.text }}>{current.label}</h1>
              </section>
              {portalRestricted && (
                <section
                  className="mb-6 rounded-md p-4"
                  style={{
                    background: "rgba(246,196,49,0.12)",
                    border: "1px solid rgba(246,196,49,0.45)",
                    color: brand.text,
                  }}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: brand.yellow }}>
                    {lockTitle}
                  </p>
                  <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.78)" }}>
                    {lockBody}
                  </p>
                </section>
              )}
              {!taxDirectiveSaved && location.pathname !== "/portal/tax-settings" && (
                <section
                  className="mb-6 rounded-md p-4"
                  style={{ background: "rgba(246,196,49,0.12)", border: "1px solid rgba(246,196,49,0.45)", color: brand.text }}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: brand.yellow }}>
                    Tax directive required
                  </p>
                  <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.78)" }}>
                    Choose and save your VAT treatment once to unlock every paycode channel.
                  </p>
                  <Button className="mt-4" style={{ background: brand.yellow, color: brand.page }} onClick={() => navigate("/portal/tax-settings")}>
                    Open Tax Settings
                  </Button>
                </section>
              )}
              {lockedSection ? (
                <section
                  className="rounded-md p-8 text-center"
                  style={{
                    background: "rgba(107,114,128,0.14)",
                    border: "1px solid rgba(156,163,175,0.35)",
                    color: brand.text,
                  }}
                >
                  <div
                    className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: "rgba(107,114,128,0.28)", color: "rgba(255,255,255,0.72)" }}
                  >
                    <Lock className="h-6 w-6" />
                  </div>
                  <h2 className="text-2xl font-bold">{taxSectionLocked ? "Tax settings required" : "Portal section disabled"}</h2>
                  <p className="mx-auto mt-3 max-w-xl text-sm" style={{ color: "rgba(255,255,255,0.72)" }}>
                    {taxSectionLocked
                      ? "Paycode generation stays locked until you choose and save your VAT treatment. This includes selecting ‘I do not charge VAT’."
                      : billingAccessPending
                      ? "This section will unlock automatically if the merchant account is in good standing."
                      : "Payments are temporarily disabled. This section is unavailable while PaySME fees are overdue."}
                  </p>
                  <Button
                    className="mt-6"
                    style={{ background: brand.yellow, color: brand.page }}
                    onClick={() => navigate(taxSectionLocked ? "/portal/tax-settings" : "/portal/dashboard")}
                  >
                    {taxSectionLocked ? "Open Tax Settings" : "Go to Overview"}
                  </Button>
                </section>
              ) : children}
            </div>
          </div>
        </main>
      </div>
      {lockNoticeReason && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-md p-4 text-sm shadow-2xl"
          style={{
            background: "#2f332f",
            border: "1px solid rgba(246,196,49,0.6)",
            color: brand.text,
          }}
        >
          <p className="font-semibold" style={{ color: brand.yellow }}>
            {lockNoticeReason === "tax" ? "Tax settings required" : "Portal section locked"}
          </p>
          <p className="mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>
            {lockNoticeReason === "tax"
              ? "Choose and save your VAT treatment in Tax Settings before generating paycodes."
              : "Payments are disabled. Please pay outstanding PaySME fees or notify the merchant urgently."}
          </p>
        </div>
      )}
    </div>
  );
}
