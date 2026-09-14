import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import FAQ from "./pages/FAQ";
import Pricing from "./pages/Pricing";
import Terms from "./pages/Terms";
import Contact from "./pages/Contact";
import Dashboard from "./pages/Dashboard";
import TrackTransactions from "./pages/TrackTransactions";
import BulkSubscribers from "./pages/BulkSubscribers";
import Subscriptions from "./pages/Subscriptions";
import KYC from "./pages/KYC";
import ApiIntegration from "./pages/ApiIntegration";
import QrPaymentLinks from "./pages/QrPaymentLinks";
import HostedPayment from "./pages/HostedPayment";
import HostedBasketPayment from "./pages/HostedBasketPayment";
import CodePayment from "./pages/CodePayment";
import Profile from "./pages/Profile";
import TaxSettings from "./pages/TaxSettings";
import SecurityAccess from "./pages/SecurityAccess";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentFailed from "./pages/PaymentFailed";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import VendorSignup from "./pages/VendorSignup";
import VendorConfirmation from "./pages/VendorConfirmation";
import VendorTerms from "./pages/VendorTerms";
import VendorKyc from "./pages/VendorKyc";
import TokenAdvances from "./pages/TokenAdvances";
import Waitlist from "./pages/Waitlist";
import UserJourneys from "./pages/UserJourneys";
import PspSponsor from "./pages/PspSponsor";
import { PortalFrame } from "./components/PortalFrame";
import { PortalDesktopGuard } from "./components/PortalDesktopGuard";
import { TrackingConsentBanner } from "./components/TrackingConsent";
import DesktopAccessRequired from "./pages/DesktopAccessRequired";
import { merchantOrigin } from "./lib/portalDomains";
import { usePortalDeviceAccess } from "./hooks/usePortalDeviceAccess";

const queryClient = new QueryClient();

const PublicBrand = ({ children }: { children: ReactNode }) => (
  <div className="public-brand-page">{children}</div>
);

const PortalBrand = ({ children }: { children: ReactNode }) => (
  <PortalFrame>{children}</PortalFrame>
);

const MerchantAuthRoute = () => {
  const location = useLocation();
  const { desktopAllowed } = usePortalDeviceAccess();
  const isMerchantHost = window.location.hostname === new URL(merchantOrigin).hostname || ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const isSignup = new URLSearchParams(location.search).get("tab")?.toLowerCase() === "signup";

  useEffect(() => {
    if (isMerchantHost) return;
    const query = new URLSearchParams(location.search);
    query.set("tab", "signup");
    window.location.replace(isSignup ? `/sign-up?${query.toString()}` : `${merchantOrigin}/auth`);
  }, [isMerchantHost, isSignup, location.search]);

  if (!isMerchantHost) return null;
  if (!desktopAllowed) return <DesktopAccessRequired />;
  return <PublicBrand><Auth /></PublicBrand>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TrackingConsentBanner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/desktop-required" element={<DesktopAccessRequired />} />
            <Route path="/auth" element={<MerchantAuthRoute />} />
            <Route path="/login" element={<MerchantAuthRoute />} />
            <Route path="/signup" element={<Navigate to="/sign-up?tab=signup" replace />} />
            <Route path="/sign-up" element={<PublicBrand><Auth /></PublicBrand>} />
            <Route path="/register" element={<Navigate to="/sign-up?tab=signup" replace />} />
            <Route path="/waitlist" element={<Waitlist />} />
            <Route path="/user_journeys" element={<UserJourneys />} />
            <Route path="/psp-sponsor" element={<PublicBrand><PspSponsor /></PublicBrand>} />
            <Route path="/vendor-signup" element={<PublicBrand><VendorSignup /></PublicBrand>} />
            <Route path="/vendor-registration" element={<PublicBrand><VendorSignup /></PublicBrand>} />
            <Route path="/vendor-kyc" element={<PublicBrand><VendorKyc /></PublicBrand>} />
            <Route path="/token-advances" element={<PublicBrand><TokenAdvances /></PublicBrand>} />
            <Route path="/vendor-confirmation" element={<PublicBrand><VendorConfirmation /></PublicBrand>} />
            <Route path="/vendor-terms" element={<PublicBrand><VendorTerms /></PublicBrand>} />
            <Route path="/faq" element={<PublicBrand><FAQ /></PublicBrand>} />
            <Route path="/pricing" element={<PublicBrand><Pricing /></PublicBrand>} />
            <Route path="/terms" element={<PublicBrand><Terms /></PublicBrand>} />
            <Route path="/contact" element={<PublicBrand><Contact /></PublicBrand>} />
            <Route element={<PortalDesktopGuard />}>
              <Route path="/portal" element={<Navigate to="/portal/dashboard" replace />} />
              <Route path="/portal/dashboard" element={<Dashboard />} />
              <Route path="/portal/track-transactions" element={<PortalBrand><TrackTransactions /></PortalBrand>} />
              <Route path="/portal/bulk-subscribers" element={<PortalBrand><BulkSubscribers /></PortalBrand>} />
              <Route path="/portal/referrals" element={<Navigate to="/portal/dashboard" replace />} />
              <Route path="/portal/subscriptions" element={<PortalBrand><Subscriptions /></PortalBrand>} />
              <Route path="/portal/kyc" element={<PortalBrand><KYC /></PortalBrand>} />
              <Route path="/portal/api-integration" element={<PortalBrand><ApiIntegration /></PortalBrand>} />
              <Route path="/portal/qr-payment-links" element={<PortalBrand><QrPaymentLinks /></PortalBrand>} />
              <Route path="/portal/profile" element={<PortalBrand><Profile /></PortalBrand>} />
              <Route path="/portal/tax-settings" element={<PortalBrand><TaxSettings /></PortalBrand>} />
              <Route path="/portal/security-access" element={<PortalBrand><SecurityAccess /></PortalBrand>} />
            </Route>
            <Route path="/dashboard" element={<Navigate to="/portal/dashboard" replace />} />
            <Route path="/track-transactions" element={<Navigate to="/portal/track-transactions" replace />} />
            <Route path="/bulk-subscribers" element={<Navigate to="/portal/bulk-subscribers" replace />} />
            <Route path="/referrals" element={<Navigate to="/portal/dashboard" replace />} />
            <Route path="/subscriptions" element={<Navigate to="/portal/subscriptions" replace />} />
            <Route path="/kyc" element={<Navigate to="/portal/kyc" replace />} />
            <Route path="/api-integration" element={<Navigate to="/portal/api-integration" replace />} />
            <Route path="/qr-payment-links" element={<Navigate to="/portal/qr-payment-links" replace />} />
            <Route path="/profile" element={<Navigate to="/portal/profile" replace />} />
            <Route path="/tax-settings" element={<Navigate to="/portal/tax-settings" replace />} />
            <Route path="/security-access" element={<Navigate to="/portal/security-access" replace />} />
            <Route path="/c/:generatedCode" element={<CodePayment />} />
            <Route path="/pay/:merchantId" element={<HostedPayment />} />
            <Route path="/q/:qrSlug" element={<HostedPayment />} />
            <Route path="/b/:basketSlug" element={<HostedBasketPayment />} />
            <Route path="/payment/success" element={<PublicBrand><PaymentSuccess /></PublicBrand>} />
            <Route path="/payment/failed" element={<PublicBrand><PaymentFailed /></PublicBrand>} />
            <Route path="/reset-password" element={<PublicBrand><ResetPassword /></PublicBrand>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<PublicBrand><NotFound /></PublicBrand>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
