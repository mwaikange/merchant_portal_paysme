import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type VerifiedMfaFactor = {
  id: string;
  factor_type: "totp" | "phone";
  friendly_name?: string;
  phone?: string;
  status?: string;
};
export type MfaFactorData = { all?: VerifiedMfaFactor[]; totp?: VerifiedMfaFactor[]; phone?: VerifiedMfaFactor[] } | null;

const verifiedFactors = (data: MfaFactorData): VerifiedMfaFactor[] => {
  const all = data?.all || [...(data?.totp || []), ...(data?.phone || [])];
  return all.filter((factor: VerifiedMfaFactor) => !factor.status || factor.status === "verified");
};

export function MfaChallenge({
  title = "Complete multi-factor verification",
  description = "Choose an enrolled method and enter a fresh code to continue.",
  onVerified,
}: {
  title?: string;
  description?: string;
  onVerified: () => void | Promise<void>;
}) {
  const [factors, setFactors] = useState<VerifiedMfaFactor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => factors.find((factor) => factor.id === factorId), [factorId, factors]);

  useEffect(() => {
    void (async () => {
      const { data, error: loadError } = await supabase.auth.mfa.listFactors();
      if (loadError) setError(loadError.message);
      const next = verifiedFactors(data);
      setFactors(next);
      setFactorId(next[0]?.id || "");
      setLoading(false);
    })();
  }, []);

  const requestCode = async () => {
    if (!factorId) return;
    setBusy(true);
    setError("");
    const { data, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    setBusy(false);
    if (challengeError) return setError(challengeError.message);
    setChallengeId(data.id);
  };

  const verify = async () => {
    if (!challengeId || !/^\d{6,8}$/.test(code)) return setError("Enter the code from your selected method.");
    setBusy(true);
    setError("");
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    if (verifyError) {
      setBusy(false);
      setCode("");
      return setError("That code is invalid, expired, or has already been used.");
    }
    await onVerified();
    setBusy(false);
  };

  if (loading) return <div className="flex items-center justify-center p-10 text-white"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading MFA…</div>;

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-yellow-400/30 bg-[#222922] p-7 text-white shadow-2xl">
      <ShieldCheck className="mb-4 h-10 w-10 text-[#f6c431]" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-white/65">{description}</p>
      {!factors.length ? (
        <div className="mt-6 rounded-lg border border-yellow-400/30 bg-yellow-400/10 p-4 text-sm text-yellow-100">
          No verified MFA method is enrolled. Open Profile settings and enroll SMS or an authenticator app first.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="mfa-factor">Verification method</Label>
            <select id="mfa-factor" value={factorId} onChange={(event) => { setFactorId(event.target.value); setChallengeId(""); setCode(""); }} className="mt-2 h-10 w-full rounded-md border border-white/20 bg-[#151815] px-3 text-sm">
              {factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.factor_type === "phone" ? `SMS ${factor.phone || ""}` : factor.friendly_name || "Authenticator app"}</option>)}
            </select>
          </div>
          {!challengeId ? (
            <Button type="button" onClick={requestCode} disabled={busy} className="w-full bg-[#f6c431] font-bold text-[#151815] hover:bg-[#ffd95c]">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{selected?.factor_type === "phone" ? "Send SMS code" : "Enter authenticator code"}
            </Button>
          ) : (
            <>
              <div><Label htmlFor="mfa-code">Verification code</Label><Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} className="mt-2 bg-white text-black" /></div>
              <Button type="button" onClick={verify} disabled={busy} className="w-full bg-[#f6c431] font-bold text-[#151815] hover:bg-[#ffd95c]">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify and continue</Button>
              {selected?.factor_type === "phone" && <Button type="button" variant="ghost" onClick={requestCode} disabled={busy} className="w-full text-white/70">Resend code</Button>}
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    </div>
  );
}
