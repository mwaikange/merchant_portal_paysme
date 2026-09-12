import { useState } from "react";
import { KeyRound, Loader2, Mail, Shield } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MfaManager } from "@/components/MfaManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { merchantUrl } from "@/lib/portalDomains";
import { PwaInstallControl } from "@/components/PwaInstallControl";

const Profile = () => {
  const { user, merchant, merchantSecurity } = useAuth();
  const { toast } = useToast();
  const [sendingReset, setSendingReset] = useState(false);

  const sendPasswordReset = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: merchantUrl("/reset-password") });
    setSendingReset(false);
    toast(error
      ? { title: "Reset email could not be sent", description: error.message, variant: "destructive" }
      : { title: "Password reset email sent", description: "Use the secure, expiring link in your email." });
  };

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[#151815] p-6 text-white lg:p-10">
        <div className="mb-7">
          <h1 className="text-2xl font-bold">Profile settings</h1>
          <p className="mt-1 text-sm text-white/60">Manage your identity, password and verified MFA methods.</p>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
          <div className="space-y-6">
            <Card className="border-white/10 bg-[#222922] text-white">
              <CardHeader className="border-b border-white/10 bg-[#303b33]"><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Account identity</CardTitle><CardDescription className="text-white/60">Your merchant organisation and access role.</CardDescription></CardHeader>
              <CardContent className="space-y-4 p-6 text-sm">
                <div><p className="text-white/45">Email</p><p className="font-medium">{user?.email}</p></div>
                <div><p className="text-white/45">Organisation</p><p className="font-medium">{merchant?.business_name || merchant?.email}</p></div>
                <div><p className="text-white/45">Role</p><p className="font-medium capitalize">{merchantSecurity?.actor_role || "merchant"}</p></div>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-[#222922] text-white">
              <CardHeader className="border-b border-white/10 bg-[#303b33]"><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Password</CardTitle><CardDescription className="text-white/60">Change your password through a secure email link.</CardDescription></CardHeader>
              <CardContent className="p-6"><Button onClick={sendPasswordReset} disabled={sendingReset} className="w-full bg-[#f6c431] font-semibold text-[#151815] hover:bg-[#ffd95c]">{sendingReset && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send password reset email</Button></CardContent>
            </Card>
            <Card className="border-white/10 bg-[#222922] text-white">
              <CardHeader><CardTitle>Cookie preferences</CardTitle></CardHeader>
              <CardContent><Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("paysme:open-cookie-preferences"))}>Open cookie preferences</Button></CardContent>
            </Card>
            <Card className="border-white/10 bg-[#222922] text-white">
              <CardHeader><CardTitle>Install PaySME Merchant</CardTitle><CardDescription className="text-white/60">Install this secure web app from the merchant portal URL.</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-sm text-white/60"><PwaInstallControl /><p>If the install button is unavailable, open your browser menu and choose “Install app” or “Create shortcut”. An internet connection, MFA, permissions and approved network are still required.</p></CardContent>
            </Card>
          </div>
          <Card className="h-fit border-white/10 bg-[#222922] text-white">
            <CardHeader className="border-b border-white/10 bg-[#303b33]"><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Multi-factor authentication</CardTitle><CardDescription className="text-white/60">Real SMS and authenticator enrollment managed by PaySME authentication.</CardDescription></CardHeader>
            <CardContent className="p-0"><MfaManager /></CardContent>
          </Card>
        </div>
      </main>
    </ProtectedRoute>
  );
};

export default Profile;
