import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";

const paysmeLogoMain = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const finishCheck = (valid: boolean) => {
      if (cancelled) return;
      setIsValidSession(valid);
      setChecking(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setIsValidSession(true);
        setChecking(false);
      }
    });

    const initializeRecoverySession = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState(null, "", "/reset-password");
          finishCheck(true);
          return;
        }

        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          window.history.replaceState(null, "", "/reset-password");
          finishCheck(true);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        finishCheck(Boolean(session));
      } catch (error) {
        console.error("Password recovery session error:", error);
        finishCheck(false);
      }
    };

    initializeRecoverySession();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: "Password mismatch", description: "Passwords do not match.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setIsSuccess(true);
      toast({ title: "Password updated!", description: "Your password has been reset successfully." });

      await supabase.auth.signOut({ scope: "local" });

      setTimeout(() => navigate("/auth", { replace: true }), 3000);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reset password.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-professional flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-paysme-orange" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-professional relative">
      <header className="backdrop-blur-sm bg-white/10 border-b border-white/20 py-4">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <img
            src={paysmeLogoMain}
            alt="PaySME Logo"
            className="h-auto max-h-12 cursor-pointer"
            onClick={() => navigate("/")}
          />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <div className="backdrop-blur-xl bg-white/10 border-white/20 shadow-2xl rounded-xl border p-8 max-w-md w-full">
          {isSuccess ? (
            <div className="text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-paysme-green mx-auto" />
              <h2 className="text-2xl font-bold text-white">Password Reset!</h2>
              <p className="text-white/80">Your password has been updated successfully. Redirecting to sign in...</p>
            </div>
          ) : !isValidSession ? (
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold text-white">Invalid or Expired Link</h2>
              <p className="text-white/80">
                This password reset link is invalid, expired, or missing its secure recovery token. Please request a new reset email from the login page.
              </p>
              <Button onClick={() => navigate("/login")} className="bg-paysme-orange hover:bg-paysme-orange/90 text-white">
                Back to Login
              </Button>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2 mb-8">
                <h1 className="text-3xl font-bold text-white">Set New Password</h1>
                <p className="text-white/80">Enter your new password below.</p>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-white font-medium flex items-center space-x-2">
                    <Lock className="w-4 h-4" />
                    <span>New Password</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange pr-12 h-12"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 text-white/60 hover:text-white hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-white font-medium flex items-center space-x-2">
                    <Lock className="w-4 h-4" />
                    <span>Confirm Password</span>
                  </Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-12"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-paysme-orange hover:bg-paysme-orange/90 text-white font-bold py-4 rounded-lg shadow-xl text-lg"
                >
                  {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Updating...</> : "Update Password"}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
