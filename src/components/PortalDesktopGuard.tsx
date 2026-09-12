import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalDeviceAccess } from "@/hooks/usePortalDeviceAccess";
import { MfaChallenge } from "@/components/MfaChallenge";

export function PortalDesktopGuard() {
  const { desktopAllowed } = usePortalDeviceAccess();
  const { user, loading, accountSessionAccess, merchantSecurity, refreshMerchantSecurity } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!desktopAllowed) {
    return <Navigate to="/desktop-required" replace />;
  }

  if (loading || (user && accountSessionAccess === "checking")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151815] text-white">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[#f6c431]" />
          <p className="text-lg font-semibold">Securing your portal session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (accountSessionAccess === "blocked" || accountSessionAccess === "error") {
    const blocked = accountSessionAccess === "blocked";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151815] px-6 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-yellow-400/35 bg-[#222922] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400/10 text-[#f6c431]">
            <ShieldAlert className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-bold">
            {blocked ? "Account already in use" : "Session check unavailable"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            {blocked
              ? "This PaySME account is already open in another tab, browser, or computer. Continue there, or close it and wait up to 90 seconds before trying again."
              : "PaySME could not verify your secure portal session. Check your internet connection and try again."}
          </p>
          <Button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 bg-[#f6c431] font-bold text-[#151815] hover:bg-[#ffd95c]"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!merchantSecurity || merchantSecurity.membership_status !== "active") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151815] px-6 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-red-400/35 bg-[#222922] p-8 text-center shadow-2xl">
          <ShieldAlert className="mx-auto mb-5 h-12 w-12 text-red-300" />
          <h1 className="text-2xl font-bold">Merchant access unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">This account has no active merchant access. Ask the merchant owner or PaySME support to review it.</p>
        </div>
      </div>
    );
  }

  const staffDeniedPaths = new Set(["/portal/tax-settings", "/portal/kyc", "/portal/security-access", "/portal/api-integration"]);
  if (merchantSecurity.actor_role === "staff" && staffDeniedPaths.has(location.pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151815] px-6 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-red-400/35 bg-[#222922] p-8 text-center shadow-2xl">
          <ShieldAlert className="mx-auto mb-5 h-12 w-12 text-red-300" />
          <h1 className="text-2xl font-bold">This section is restricted</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">Staff cannot access Tax Settings, KYC, Security & Access, or API & Integration.</p>
          <Button onClick={() => navigate("/portal/dashboard")} className="mt-6 bg-[#f6c431] font-bold text-[#151815] hover:bg-[#ffd95c]">Return to Overview</Button>
        </div>
      </div>
    );
  }

  if (!merchantSecurity.network_allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151815] px-6 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-yellow-400/35 bg-[#222922] p-8 text-center shadow-2xl">
          <ShieldAlert className="mx-auto mb-5 h-12 w-12 text-[#f6c431]" />
          <h1 className="text-2xl font-bold">Connection not approved</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">This organisation restricts portal access by public network. Connect through an approved office network or corporate VPN, or contact an authorised PaySME administrator for verified recovery.</p>
        </div>
      </div>
    );
  }

  if (merchantSecurity.actor_role === "staff" && !merchantSecurity.mfa_enrolled && location.pathname !== "/portal/profile") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151815] px-6 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-yellow-400/35 bg-[#222922] p-8 text-center shadow-2xl">
          <ShieldAlert className="mx-auto mb-5 h-12 w-12 text-[#f6c431]" />
          <h1 className="text-2xl font-bold">MFA enrollment required</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">Staff must enroll SMS or authenticator MFA before merchant data can be opened.</p>
          <Button onClick={() => navigate("/portal/profile")} className="mt-6 bg-[#f6c431] font-bold text-[#151815] hover:bg-[#ffd95c]">Open Profile settings</Button>
        </div>
      </div>
    );
  }

  if (merchantSecurity.mfa_enrolled && merchantSecurity.current_aal !== "aal2") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151815] px-6">
        <MfaChallenge onVerified={refreshMerchantSecurity} />
      </div>
    );
  }

  return <Outlet />;
}
