import { useCallback, useEffect, useState } from "react";
import { CheckCircle, KeyRound, Loader2, MessageSquare, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MfaChallenge, type MfaFactorData, type VerifiedMfaFactor } from "@/components/MfaChallenge";

type Enrollment = {
  id: string;
  type: "totp" | "phone";
  challengeId: string;
  qrCode?: string;
  secret?: string;
};

const getFactors = (data: MfaFactorData): VerifiedMfaFactor[] => {
  const all = data?.all || [...(data?.totp || []), ...(data?.phone || [])];
  return all.filter((factor: VerifiedMfaFactor) => !factor.status || factor.status === "verified");
};

export function MfaManager() {
  const { merchantSecurity, refreshMerchantSecurity } = useAuth();
  const { toast } = useToast();
  const [factors, setFactors] = useState<VerifiedMfaFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) toast({ title: "MFA status unavailable", description: error.message, variant: "destructive" });
    setFactors(getFactors(data));
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const enroll = async (type: "totp" | "phone") => {
    setBusy(true);
    try {
      const options = type === "totp"
        ? { factorType: "totp" as const, friendlyName: "PaySME Authenticator", issuer: "PaySME Merchant" }
        : { factorType: "phone" as const, friendlyName: "PaySME SMS", phone: phone.trim() };
      if (type === "phone" && !/^\+[1-9]\d{7,14}$/.test(phone.trim())) throw new Error("Enter the verified mobile number in international format, for example +264811234567.");
      const { data, error } = await supabase.auth.mfa.enroll(options);
      if (error) throw error;
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (challengeError) throw challengeError;
      setEnrollment({ id: data.id, type, challengeId: challenge.id, qrCode: data.type === "totp" ? data.totp.qr_code : undefined, secret: data.type === "totp" ? data.totp.secret : undefined });
      setCode("");
    } catch (error: unknown) {
      toast({ title: "MFA enrollment could not start", description: error instanceof Error ? error.message : "MFA enrollment failed", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const verifyEnrollment = async () => {
    if (!enrollment || !/^\d{6,8}$/.test(code)) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.verify({ factorId: enrollment.id, challengeId: enrollment.challengeId, code });
    if (error) {
      toast({ title: "Code not accepted", description: "The code is invalid, expired, or already used.", variant: "destructive" });
      setBusy(false);
      return;
    }
    await supabase.functions.invoke("merchant-security", { body: { action: "mfa-audit", merchantId: merchantSecurity?.merchant_id, event: "mfa.enrolled", factorType: enrollment.type } });
    setEnrollment(null);
    setCode("");
    await Promise.all([load(), refreshMerchantSecurity()]);
    toast({ title: "MFA is active", description: enrollment.type === "phone" ? "Your phone number was verified." : "Your authenticator app was verified." });
    setBusy(false);
  };

  const remove = async (factor: VerifiedMfaFactor) => {
    if (factors.length <= 1) {
      toast({ title: "Keep one MFA method", description: "Merchant accounts must keep at least one verified method. Enroll a replacement first.", variant: "destructive" });
      return;
    }
    if (merchantSecurity?.current_aal !== "aal2") {
      toast({ title: "Fresh MFA required", description: "Verify an existing factor before removing another one.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) toast({ title: "MFA method was not removed", description: error.message, variant: "destructive" });
    else {
      await supabase.functions.invoke("merchant-security", { body: { action: "mfa-audit", merchantId: merchantSecurity?.merchant_id, event: "mfa.removed", factorType: factor.factor_type } });
      await load();
      toast({ title: "MFA method removed" });
    }
    setBusy(false);
  };

  if (loading) return <div className="flex items-center p-8 text-white"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading MFA status…</div>;

  if (factors.length > 0 && merchantSecurity?.current_aal !== "aal2") {
    return <MfaChallenge title="Verify before managing MFA" description="Changing or replacing MFA requires verification with an existing enrolled method." onVerified={async () => { await refreshMerchantSecurity(); await load(); }} />;
  }

  return (
    <div className="space-y-6 p-6 text-white">
      <div className="rounded-xl border border-green-400/25 bg-green-400/10 p-4">
        <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-green-300" /><div><p className="font-semibold">{factors.length ? "MFA is active" : "MFA enrollment required for protected changes"}</p><p className="text-sm text-white/65">Status is read directly from PaySME authentication.</p></div></div>
      </div>

      {!!factors.length && <div className="space-y-3">{factors.map((factor) => (
        <div key={factor.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#1b211d] p-4">
          <div className="flex items-center gap-3">{factor.factor_type === "phone" ? <MessageSquare className="h-5 w-5 text-[#f6c431]" /> : <KeyRound className="h-5 w-5 text-[#f6c431]" />}<div><p className="font-medium">{factor.factor_type === "phone" ? "SMS verification" : "Authenticator app"}</p><p className="text-xs text-white/55">{factor.phone || factor.friendly_name || "Verified"}</p></div></div>
          <Button type="button" variant="outline" disabled={busy || factors.length <= 1} onClick={() => remove(factor)} className="border-red-400/35 text-red-200"><Trash2 className="mr-2 h-4 w-4" />Remove</Button>
        </div>
      ))}</div>}

      {enrollment ? (
        <div className="rounded-xl border border-yellow-400/30 bg-[#1b211d] p-5">
          <h3 className="text-lg font-semibold">Verify {enrollment.type === "phone" ? "your phone" : "your authenticator app"}</h3>
          {enrollment.qrCode && <div className="mt-4 rounded-lg bg-white p-4 text-center"><img src={enrollment.qrCode} alt="Authenticator setup QR code" className="mx-auto h-48 w-48" /><p className="mt-3 break-all text-xs text-black">Manual key: {enrollment.secret}</p></div>}
          <Label htmlFor="enrollment-code" className="mt-4 block">Verification code</Label>
          <Input id="enrollment-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} className="mt-2 bg-white text-black" />
          <div className="mt-4 flex gap-2"><Button onClick={verifyEnrollment} disabled={busy || !/^\d{6,8}$/.test(code)} className="bg-[#f6c431] text-black"><CheckCircle className="mr-2 h-4 w-4" />Verify and activate</Button><Button variant="outline" onClick={() => setEnrollment(null)}>Cancel</Button></div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#1b211d] p-5"><KeyRound className="mb-3 h-7 w-7 text-[#f6c431]" /><h3 className="font-semibold">Authenticator app</h3><p className="mt-2 text-sm text-white/60">Works with Google Authenticator, Microsoft Authenticator and other TOTP apps.</p><Button className="mt-4 bg-[#f6c431] text-black" disabled={busy} onClick={() => enroll("totp")}>Enroll authenticator</Button></div>
          <div className="rounded-xl border border-white/10 bg-[#1b211d] p-5"><MessageSquare className="mb-3 h-7 w-7 text-[#f6c431]" /><h3 className="font-semibold">SMS verification</h3><p className="mt-2 text-sm text-white/60">Uses the SMS provider configured for PaySME authentication. The number is verified before activation.</p><Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+264811234567" className="mt-4 bg-white text-black" /><Button className="mt-3 bg-[#f6c431] text-black" disabled={busy} onClick={() => enroll("phone")}>Enroll SMS</Button></div>
        </div>
      )}
      <p className="text-xs leading-5 text-white/45">Codes expire and cannot be replayed. SMS resend and attempt limits are enforced by the configured authentication provider. PaySME never stores or logs your OTP or authenticator secret.</p>
    </div>
  );
}
