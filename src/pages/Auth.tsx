import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useDevice } from "@/hooks/use-device";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, Phone, Building, Building2, IdCard, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { BusinessIndustrySelect } from "@/components/BusinessIndustrySelect";
import { validateNamibianMobile, formatNamibianMobile } from "@/lib/validations";
import { usePortalDeviceAccess } from "@/hooks/usePortalDeviceAccess";
import { merchantOrigin, merchantUrl, publicUrl } from "@/lib/portalDomains";

const paysmeLogoMain = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
const merchantImages = [
  "/pay-home/merchants/merchant-store-ai.png",
  "/pay-home/merchants/merchant-cafe-ai.png",
  "/pay-home/merchants/merchant-plants-ai.png",
  "/pay-home/merchants/merchant-bakery-ai.png",
  "/pay-home/merchants/merchant-grill-ai.png",
];
const dedicatedMerchantImages = [...merchantImages, "/pay-home/merchants/merchant-hairdresser.png"];
const accountCreationEnabled = true;
const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, signUp, signOut, user, loading: authLoading } = useAuth();
  const device = useDevice();
  const { desktopAllowed } = usePortalDeviceAccess();
  const confirmationHandledRef = useRef(false);
  const isEmailConfirmationReturn =
    new URLSearchParams(window.location.search).get("confirmed") === "true";
  const isInvitationReturn = new URLSearchParams(window.location.search).get("invitation") === "true";
  const isExistingIdentityInvitation = new URLSearchParams(window.location.search).get("existing") === "true";
  const invitationMerchantId = new URLSearchParams(window.location.search).get("merchant");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [invitationPassword, setInvitationPassword] = useState("");
  const [invitationConfirm, setInvitationConfirm] = useState("");
  const [activeTab, setActiveTab] = useState(() =>
    new URLSearchParams(window.location.search).get("tab")?.toLowerCase() === "signup" || ["/sign-up", "/register"].includes(window.location.pathname) ? "signup" : "login"
  );
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signupMobileTouched, setSignupMobileTouched] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "", merchantId: "" });
  const [signupData, setSignupData] = useState({
    firstName: "",
    surname: "",
    email: "",
    mobile: "",
    businessName: "",
    businessType: "",
    businessIndustry: "",
    password: "",
    confirmPassword: ""
  });
  const signupMobileIsValid = signupData.mobile.length > 0 && validateNamibianMobile(signupData.mobile);
  const signupMobileShowError = signupMobileTouched && signupData.mobile.length > 0 && !signupMobileIsValid;
  const handleSignupMobileChange = (value: string) => {
    const formatted = formatNamibianMobile(value);
    setSignupData((current) => ({ ...current, mobile: formatted }));
    if (value.trim().length > 0) setSignupMobileTouched(true);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsSendingReset(true);
    try {
      // First, generate the Supabase reset link
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: merchantUrl("/reset-password"),
      });
      if (error) throw error;

      toast({
        title: "Reset email sent",
        description: "If an account exists with this email, you'll receive reset instructions shortly.",
      });
      setShowForgotPassword(false);
      setForgotEmail("");
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to send reset email"),
        variant: "destructive",
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  // A confirmation link establishes a short-lived browser session. End that
  // session and keep the merchant on sign-in, where their emailed USV ID is used.
  // Ordinary returning sessions still go directly to the portal.
  useEffect(() => {
    if (authLoading || confirmationHandledRef.current) return;

    if (isEmailConfirmationReturn) {
      confirmationHandledRef.current = true;
      void (async () => {
        if (user) await signOut();
        window.history.replaceState(null, "", "/auth");
        setActiveTab("login");
        toast({
          title: "Email confirmed",
          description: "Your PaySME account is ready. Sign in using the USV ID sent in your welcome email.",
        });
      })();
      return;
    }

    if (user && !isInvitationReturn) {
      navigate("/portal/dashboard");
    }
  }, [authLoading, isEmailConfirmationReturn, isInvitationReturn, navigate, signOut, toast, user]);

  const completeInvitation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!isExistingIdentityInvitation && (invitationPassword.length < 12 || invitationPassword !== invitationConfirm)) {
      toast({ title: "Choose a stronger password", description: "Use at least 12 characters and make sure both entries match.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    if (invitationMerchantId) window.sessionStorage.setItem("paysme-selected-merchant", invitationMerchantId);
    const { error } = isExistingIdentityInvitation ? { error: null } : await supabase.auth.updateUser({ password: invitationPassword });
    if (!error) await supabase.rpc("activate_my_staff_membership");
    setIsLoading(false);
    if (error) return toast({ title: "Invitation could not be completed", description: error.message, variant: "destructive" });
    window.location.assign("/portal/profile");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!desktopAllowed) {
      navigate("/desktop-required");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await signIn(loginData.email, loginData.password, loginData.merchantId);
      if (error) {
        toast({
          title: "Login failed",
          description: error.message || "Please check your credentials and Merchant ID",
          variant: "destructive"
        });
        return;
      }
      toast({
        title: "🎉 Welcome back!",
        description: "Successfully signed in to PaySME"
      });
      navigate("/portal/dashboard");
    } catch (error: unknown) {
      toast({
        title: "Login failed",
        description: getErrorMessage(error, "An unexpected error occurred"),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if account creation is disabled
    if (!accountCreationEnabled) {
      toast({
        title: "Registration Paused",
        description: "Registration is only open at Launch",
        variant: "default"
      });
      return;
    }

    // Validation checks
    if (signupData.password !== signupData.confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "Passwords do not match",
        variant: "destructive"
      });
      return;
    }

    if (!validateNamibianMobile(signupData.mobile)) {
      toast({
        title: "Invalid mobile number",
        description: "Please enter a valid Namibian mobile number starting with 081, 083, 085, 26481, 26483, or 26485.",
        variant: "destructive"
      });
      return;
    }

    if (!termsAccepted) {
      toast({
        title: "Terms required",
        description: "Please read and accept the Terms & Conditions before signing up.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Prepare metadata for the signup
      const metadata = {
        role: "merchant",
        user_type: "merchant",
        businessName: signupData.businessName,
        business_name: signupData.businessName,
        firstName: signupData.firstName,
        first_name: signupData.firstName,
        surname: signupData.surname,
        mobile: signupData.mobile,
        mobile_number: signupData.mobile,
        businessType: signupData.businessType,
        business_type: signupData.businessType,
        businessIndustry: signupData.businessIndustry,
        business_industry: signupData.businessIndustry
      };
      
      const { error } = await signUp(signupData.email, signupData.password, metadata);
      if (error) {
        toast({
          title: "Signup failed",
          description: error.message || "Please try again",
          variant: "destructive"
        });
        return;
      }
      toast({
        title: "🎉 Account created!",
        description: "Please check your email to verify your account, then sign in below."
      });
      // Reset signup form and switch to login tab
      setSignupData({
        firstName: "",
        surname: "",
        email: "",
        mobile: "",
        businessName: "",
        businessType: "",
        businessIndustry: "",
        password: "",
        confirmPassword: ""
      });
      setLoginData({ email: signupData.email, password: "", merchantId: "" });
      setTermsAccepted(false);
      setSignupMobileTouched(false);
      setActiveTab("login");
    } catch (error: unknown) {
      toast({
        title: "Signup failed", 
        description: getErrorMessage(error, "Please try again"),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const businessTypes = [
    { value: "close-corporation", label: "Close Corporation" },
    { value: "pty-ltd", label: "PTY LTD" },
    { value: "non-profit", label: "Non Profit" },
    { value: "ngo", label: "NGO" },
    { value: "sole-proprietor", label: "Sole Proprietor" }
  ];

  if (isInvitationReturn && user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151815] p-6 text-white">
        <form onSubmit={completeInvitation} className="w-full max-w-lg rounded-2xl border border-yellow-400/30 bg-[#222922] p-8 shadow-2xl">
          <img src={paysmeLogoMain} alt="PaySME" className="mb-7 h-12 w-auto" />
          <p className="text-xs uppercase tracking-[0.22em] text-[#f6c431]">Staff invitation</p>
          <h1 className="mt-2 text-2xl font-bold">Create your own credentials</h1>
          <p className="mt-2 text-sm leading-6 text-white/60">This expiring invitation links your identity to the correct merchant. {isExistingIdentityInvitation ? "Your existing credentials and other memberships remain unchanged." : "After setting a password, you must enroll MFA before merchant data is available."}</p>
          {!isExistingIdentityInvitation && <><Label htmlFor="invite-password" className="mt-6 block">Password</Label><Input id="invite-password" type="password" autoComplete="new-password" minLength={12} value={invitationPassword} onChange={(event) => setInvitationPassword(event.target.value)} className="mt-2 bg-white text-black" /><Label htmlFor="invite-confirm" className="mt-4 block">Confirm password</Label><Input id="invite-confirm" type="password" autoComplete="new-password" minLength={12} value={invitationConfirm} onChange={(event) => setInvitationConfirm(event.target.value)} className="mt-2 bg-white text-black" /></>}
          <Button type="submit" disabled={isLoading} className="mt-6 w-full bg-[#f6c431] font-bold text-[#151815] hover:bg-[#ffd95c]">{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Accept invitation</Button>
        </form>
      </div>
    );
  }

  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const dedicatedMerchantLogin = activeTab !== "signup" && (window.location.hostname === new URL(merchantOrigin).hostname || isLocalHost);
  if (dedicatedMerchantLogin) {
    return (
      <div className="grid min-h-screen bg-[#1e2320] text-white lg:h-screen lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
        <section className="relative hidden min-h-screen overflow-hidden border-b-[20px] border-[#f0b429] bg-[#1e2320] lg:block lg:h-screen">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(246,196,49,0.05),transparent_55%)]" />
          {dedicatedMerchantImages.map((image, index) => {
            const positions = [
              "left-[-50px] top-[-30px] h-[280px] w-[280px]",
              "left-[22%] top-[10%] h-[345px] w-[345px]",
              "right-[25%] top-[12%] h-[270px] w-[270px]",
              "left-[22%] bottom-[8%] h-[260px] w-[260px]",
              "right-[27%] bottom-[6%] h-[305px] w-[305px]",
              "right-[2%] top-[37%] h-[250px] w-[250px]",
            ];
            return <img key={image} src={image} alt="" className={`absolute rounded-full border-[3px] border-white/[0.06] object-cover brightness-[0.88] saturate-[0.95] ${positions[index]}`} />;
          })}
          <div className="absolute bottom-6 left-8 z-10">
            <img src={paysmeLogoMain} alt="PaySME" className="h-[52px] w-auto" />
            <p className="mt-3 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-[#8a9188]">PaySME Merchant Management Portal</p>
            <p className="mt-1 text-[0.65rem] uppercase tracking-[0.18em] text-[#8a9188]/60">PaySME Solutions CC | All rights reserved</p>
          </div>
        </section>

        <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#2a2e2b] px-6 py-8 lg:h-screen lg:-translate-x-3 lg:px-8 lg:py-8">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center">
              <img src={paysmeLogoMain} alt="PaySME" className="mx-auto mb-3 h-[56px] w-auto" />
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-[#8a9188]">PaySME Merchant Management Portal</p>
            </div>

            {showForgotPassword ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <h1 className="text-2xl font-semibold">Reset your password</h1>
                <p className="text-sm leading-6 text-white/55">Enter your account email and we’ll send a secure, expiring reset link.</p>
                <Input type="email" autoComplete="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} placeholder="Email address" required className="h-14 rounded-xl border-0 bg-[#edf3ff] px-5 text-black" />
                <Button type="submit" disabled={isSendingReset} className="h-14 w-full rounded-xl bg-[#deded8] font-bold tracking-[0.18em] text-[#151815] hover:bg-white">{isSendingReset && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}SEND RESET LINK</Button>
                <Button type="button" variant="ghost" onClick={() => setShowForgotPassword(false)} className="w-full text-white/65">Back to login</Button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="flex w-full flex-col gap-4">
                <div className="relative"><Mail className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-500" /><Input type="email" autoComplete="email" value={loginData.email} onChange={(event) => setLoginData({ ...loginData, email: event.target.value })} placeholder="Email address" required className="!h-14 !w-full !rounded-xl !border !border-black/10 !bg-[#f4f5f2] px-5 pl-12 !text-[14px] !text-[#1a1a1a] outline-none placeholder:!text-[13px] placeholder:!text-[#777] focus:!ring-2 focus:!ring-[#f0b429]" /></div>
                <div className="relative"><Lock className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-500" /><Input type={showPassword ? "text" : "password"} autoComplete="current-password" value={loginData.password} onChange={(event) => setLoginData({ ...loginData, password: event.target.value })} placeholder="Password" required className="!h-14 !w-full !rounded-xl !border !border-black/10 !bg-[#f4f5f2] px-5 pl-12 pr-16 !text-[14px] !text-[#1a1a1a] outline-none placeholder:!text-[13px] placeholder:!text-[#777] focus:!ring-2 focus:!ring-[#f0b429]" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} style={{ color: "#000000" }} className="absolute right-4 top-1/2 z-10 -translate-y-1/2">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div>
                <div className="relative"><IdCard className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-500" /><Input value={loginData.merchantId} onChange={(event) => setLoginData({ ...loginData, merchantId: event.target.value })} placeholder="Merchant ID or USV ID" required className="!h-14 !w-full !rounded-xl !border !border-black/10 !bg-[#f4f5f2] px-5 pl-12 !text-[14px] !text-[#1a1a1a] outline-none placeholder:!text-[13px] placeholder:!text-[#777] focus:!ring-2 focus:!ring-[#f0b429]" /></div>
                <Button type="submit" disabled={isLoading} className="mt-1 !h-12 !w-full !rounded-xl !border !border-black/10 !bg-[#d6d6d0] p-3 !font-bold uppercase tracking-[0.15em] !text-[#1a1a1a] shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition hover:!bg-[#f0b429] hover:!text-[#1e2320] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70">{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}LOGIN</Button>
                <button type="button" onClick={() => setShowForgotPassword(true)} className="w-full rounded-xl border border-white/20 py-3 text-sm font-medium text-white/75 transition hover:border-white/40 hover:bg-white/10 hover:text-white">Forgot your password?</button>
              </form>
            )}
          </div>
          <p className="absolute bottom-5 left-0 right-0 text-center text-sm text-white">Version 1.0.0</p>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-zoom-page h-screen overflow-hidden bg-gradient-professional relative">
      {/* Header */}
      <header className="backdrop-blur-sm bg-white/10 border-b border-white/20 py-4">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <img 
            src={paysmeLogoMain} 
            alt="PaySME Logo" 
            className={`h-auto ${device.isMobile ? 'max-h-8' : 'max-h-12'} cursor-pointer`}
            onClick={() => window.location.assign(publicUrl('/'))}
          />
          <Button 
            variant="ghost" 
            onClick={() => window.location.assign(publicUrl('/'))}
            className="text-white hover:bg-white/20 hover:text-paysme-orange"
          >
            ← Back to Home
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="auth-main container mx-auto px-4 py-4">
        <div className={`auth-layout grid ${device.isMobile ? 'grid-cols-1' : 'lg:grid-cols-2'} gap-10 items-center h-full min-h-0`}>
          
          {/* Left Column - Auth Form */}
          <div className="order-1">
            <div className={`auth-card backdrop-blur-xl bg-white/10 border-white/20 shadow-2xl rounded-xl border p-5 ${activeTab === "signup" ? "auth-card-scroll" : ""}`}>
              
              <div className="text-center space-y-2 mb-5">
                <h1 className={`font-handwritten text-white ${
                  device.isMobile ? 'text-3xl' : 'text-3xl xl:text-4xl'
                }`}>
                  Welcome to <span className="text-paysme-orange">PaySME</span>
                </h1>
                <p className="text-white/80 text-base">
                  Your gateway to digital payments without cards
                </p>
              </div>

              <Tabs
                value={activeTab}
                onValueChange={(value) => {
                  if (activeTab === "signup" && value === "login") {
                    window.location.assign(new URL("/auth", merchantOrigin).href);
                    return;
                  }
                  setActiveTab(value);
                }}
                className="space-y-4"
              >
                <TabsList className="grid w-full grid-cols-2 bg-white/10 backdrop-blur-sm border border-white/20 h-11">
                  <TabsTrigger 
                    value="login" 
                    className="data-[state=active]:bg-paysme-orange data-[state=active]:text-white font-medium"
                  >
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger 
                    value="signup"
                    className="data-[state=active]:bg-paysme-orange data-[state=active]:text-white font-medium"
                  >
                    Create Account
                  </TabsTrigger>
                </TabsList>

                {/* Login Tab */}
                <TabsContent value="login" className="space-y-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email" className="text-white font-medium flex items-center space-x-2">
                        <Mail className="w-4 h-4" />
                        <span>Email</span>
                      </Label>
                      <Input
                        id="login-email"
                        type="email"
                        required
                        value={loginData.email}
                        onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                        placeholder="Enter your email"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-11"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="login-password" className="text-white font-medium flex items-center space-x-2">
                        <Lock className="w-4 h-4" />
                        <span>Password</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          required
                          value={loginData.password}
                          onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                          placeholder="Enter your password"
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange pr-12 h-11"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-0 top-0 h-full px-3 text-white hover:text-marketing-yellow hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="login-merchant" className="text-white font-medium flex items-center space-x-2">
                        <IdCard className="w-4 h-4" />
                        <span>Merchant ID or USV ID</span>
                      </Label>
                      <Input
                        id="login-merchant"
                        type="text"
                        required
                        value={loginData.merchantId}
                        onChange={(e) => setLoginData({...loginData, merchantId: e.target.value.toUpperCase()})}
                        placeholder="Enter your Merchant ID or USV ID"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-11"
                      />
                    </div>

                    <Button 
                      type="submit" 
                      disabled={isLoading}
                      className={`relative w-full overflow-hidden bg-paysme-green hover:bg-paysme-green/90 text-white font-bold py-3 rounded-lg shadow-xl transform hover:scale-105 transition-all duration-300 disabled:hover:scale-100 text-base ${isLoading ? "paysme-signin-loading" : ""}`}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 w-5 h-5 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          Sign In <ArrowRight className="ml-2 w-5 h-5" />
                        </>
                      )}
                    </Button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="public-text-link text-sm text-white/70 underline transition-colors hover:text-marketing-yellow"
                      >
                        Forgot your password?
                      </button>
                    </div>
                  </form>

                  {/* Forgot Password Modal */}
                  {showForgotPassword && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                      <div className="rounded-xl border border-white/20 bg-[#3d3d3d] p-8 max-w-md w-full shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-2">Reset Password</h3>
                        <p className="text-white/80 text-sm leading-relaxed mb-6">
                          Enter your registered email address. We'll send you a secure reset link to create a new password.
                        </p>
                        <form onSubmit={handleForgotPassword} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="forgot-email" className="text-white">Email Address</Label>
                            <Input
                              id="forgot-email"
                              type="email"
                              required
                              value={forgotEmail}
                              onChange={(e) => setForgotEmail(e.target.value)}
                              placeholder="Enter your registered email"
                              className="h-12 bg-black/25 border-white/20 text-white placeholder:text-white/50"
                            />
                          </div>
                          <div className="flex gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1"
                              onClick={() => { setShowForgotPassword(false); setForgotEmail(""); }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              disabled={isSendingReset}
                              className="flex-1 bg-paysme-orange hover:bg-paysme-orange/90"
                            >
                              {isSendingReset ? (
                                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending...</>
                              ) : "Send Reset Link"}
                            </Button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Signup Tab */}
                <TabsContent value="signup" className="space-y-4">
                  <form onSubmit={handleSignup} className="space-y-4">
                    {/* Name Fields */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="signup-firstname" className="text-white font-medium flex items-center space-x-2">
                          <User className="w-4 h-4" />
                          <span>Name</span>
                        </Label>
                        <Input
                          id="signup-firstname"
                          type="text"
                          required
                          value={signupData.firstName}
                          onChange={(e) => setSignupData({...signupData, firstName: e.target.value})}
                          placeholder="First name"
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signup-surname" className="text-white font-medium flex items-center space-x-2">
                          <User className="w-4 h-4 opacity-0" />
                          <span>Surname</span>
                        </Label>
                        <Input
                          id="signup-surname"
                          type="text"
                          required
                          value={signupData.surname}
                          onChange={(e) => setSignupData({...signupData, surname: e.target.value})}
                          placeholder="Surname"
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-12"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email" className="text-white font-medium flex items-center space-x-2">
                        <Mail className="w-4 h-4" />
                        <span>Email</span>
                      </Label>
                      <Input
                        id="signup-email"
                        type="email"
                        required
                        value={signupData.email}
                        onChange={(e) => setSignupData({...signupData, email: e.target.value})}
                        placeholder="Enter your email"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-12"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-mobile" className="text-white font-medium flex items-center space-x-2">
                        <Phone className="w-4 h-4" />
                        <span>Mobile Number</span>
                      </Label>
                      <Input
                        id="signup-mobile"
                        type="tel"
                        required
                        value={signupData.mobile}
                        onChange={(e) => handleSignupMobileChange(e.target.value)}
                        onBlur={() => setSignupMobileTouched(true)}
                        placeholder="+264 81 234 5678"
                        aria-invalid={signupMobileShowError}
                        className={`bg-white/10 text-white placeholder:text-white/60 focus:ring-paysme-orange h-12 ${
                          signupMobileShowError
                            ? "border-red-400 focus:border-red-400"
                            : signupMobileIsValid
                              ? "border-emerald-400 focus:border-emerald-400"
                              : "border-white/20 focus:border-paysme-orange"
                        }`}
                      />
                      {signupMobileShowError && (
                        <p className="text-xs font-medium text-red-200">
                          Enter a valid Namibian mobile number starting with 081, 083, 085, 26481, 26483, or 26485.
                        </p>
                      )}
                      {signupMobileTouched && signupMobileIsValid && (
                        <p className="text-xs font-medium text-emerald-200">
                          Mobile number confirmed.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-business" className="text-white font-medium flex items-center space-x-2">
                        <Building className="w-4 h-4" />
                        <span>Business/Creator Name</span>
                      </Label>
                      <Input
                        id="signup-business"
                        type="text"
                        required
                        value={signupData.businessName}
                        onChange={(e) => setSignupData({...signupData, businessName: e.target.value})}
                        placeholder="Your business or creator name"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-12"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white font-medium flex items-center space-x-2">
                        <Building2 className="w-4 h-4" />
                        <span>Business Type</span>
                      </Label>
                      <Select
                        value={signupData.businessType}
                        onValueChange={(value) => setSignupData({...signupData, businessType: value})}
                      >
                        <SelectTrigger className="bg-white/10 border-white/20 text-white focus:border-paysme-orange focus:ring-paysme-orange h-12">
                          <SelectValue placeholder="Select business type" />
                        </SelectTrigger>
                        <SelectContent className="bg-white/95 backdrop-blur-sm border-white/20">
                          {businessTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value} className="text-gray-800">
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <BusinessIndustrySelect
                      value={signupData.businessIndustry}
                      onChange={(value) => setSignupData({...signupData, businessIndustry: value})}
                    />


                    <div className="space-y-2">
                      <Label htmlFor="signup-password" className="text-white font-medium flex items-center space-x-2">
                        <Lock className="w-4 h-4" />
                        <span>Password</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="signup-password"
                          type={showSignupPassword ? "text" : "password"}
                          required
                          value={signupData.password}
                          onChange={(e) => setSignupData({...signupData, password: e.target.value})}
                          placeholder="Create a password"
                          className="bg-white/10 border-white/20 pr-12 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-12"
                        />
                        <button
                          type="button"
                          aria-label={showSignupPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowSignupPassword(!showSignupPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/85 hover:bg-white/10 hover:text-white"
                        >
                          {showSignupPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm" className="text-white font-medium flex items-center space-x-2">
                        <Lock className="w-4 h-4" />
                        <span>Confirm Password</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="signup-confirm"
                          type={showSignupConfirmPassword ? "text" : "password"}
                          required
                          value={signupData.confirmPassword}
                          onChange={(e) => setSignupData({...signupData, confirmPassword: e.target.value})}
                          placeholder="Confirm your password"
                          className="bg-white/10 border-white/20 pr-12 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-12"
                        />
                        <button
                          type="button"
                          aria-label={showSignupConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
                          onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/85 hover:bg-white/10 hover:text-white"
                        >
                          {showSignupConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-lg border border-white/20 bg-white/10 p-3">
                      <Checkbox
                        id="auth-terms"
                        checked={termsAccepted}
                        onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                        className="mt-1 border-white/50 data-[state=checked]:bg-marketing-yellow data-[state=checked]:text-marketing-bg-deep"
                      />
                      <Label htmlFor="auth-terms" className="text-sm leading-relaxed text-white/85">
                        I have read and agree to the{" "}
                        <a href="/terms" className="font-semibold text-marketing-yellow underline underline-offset-4">
                          Terms & Conditions
                        </a>
                        .
                      </Label>
                    </div>

                    <Button 
                      type="submit" 
                      disabled={isLoading || !accountCreationEnabled}
                      className="w-full bg-paysme-orange hover:bg-paysme-orange/90 text-white font-bold py-4 rounded-lg shadow-xl transform hover:scale-105 transition-all duration-300 disabled:hover:scale-100 text-lg"
                    >
                      {accountCreationEnabled ? (isLoading ? "Creating Account..." : "Create Account") : "Account Creation Paused"} <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Right Column - Brand Imagery */}
          <div className="auth-merchant-collage order-2">
            {merchantImages.map((src, index) => (
              <div key={src} className={`auth-merchant-circle auth-merchant-circle-${index + 1}`}>
                <img src={src} alt="" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Auth;
