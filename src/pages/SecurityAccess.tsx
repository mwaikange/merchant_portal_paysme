import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Edit3, Loader2, Network, Plus, RefreshCw, ShieldAlert, Trash2, UserPlus, Users, X } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { MfaFactorData, VerifiedMfaFactor } from "@/components/MfaChallenge";

type NetworkRow = { id: string; label: string; network: string; creator_name: string; created_at: string; updated_at: string };
type StaffRow = { id: string; user_id: string | null; email: string; full_name: string; role: "admin" | "staff"; status: "pending" | "active" | "suspended"; invitation_expires_at: string | null; created_at: string };
type ActivityRow = { id: number; actor_name: string; action: string; result: string; source_ip: string | null; summary: Record<string, unknown>; created_at: string };
type SecurityData = { role: "owner" | "admin"; currentIp: string | null; settings: { network_restrictions_enabled: boolean; updated_at: string }; networks: NetworkRow[]; staff: StaffRow[]; activity: ActivityRow[] };
type PendingChange = { action: string; payload: Record<string, unknown>; label: string };

const factorList = (data: MfaFactorData): VerifiedMfaFactor[] => {
  const all = data?.all || [...(data?.totp || []), ...(data?.phone || [])];
  return all.filter((factor: VerifiedMfaFactor) => !factor.status || factor.status === "verified");
};

const formatAction = (action: string) => action.replace(/\./g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function SecurityAccess() {
  const { merchantSecurity, refreshMerchantSecurity } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkLabel, setNetworkLabel] = useState("");
  const [networkValue, setNetworkValue] = useState("");
  const [editingNetwork, setEditingNetwork] = useState<string | null>(null);
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<"admin" | "staff">("staff");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [factors, setFactors] = useState<VerifiedMfaFactor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: response, error } = await supabase.functions.invoke("merchant-security", { body: { action: "context", merchantId: merchantSecurity?.merchant_id } });
    if (error || response?.error) toast({ title: "Security settings unavailable", description: response?.error || error?.message, variant: "destructive" });
    else setData(response as SecurityData);
    setLoading(false);
  }, [merchantSecurity?.merchant_id, toast]);

  useEffect(() => { if (merchantSecurity?.actor_role !== "staff") void load(); }, [load, merchantSecurity?.actor_role]);
  useEffect(() => { if (data?.currentIp && !networkValue) setNetworkValue(data.currentIp); }, [data?.currentIp, networkValue]);

  const startApproval = async (change: PendingChange) => {
    if (!merchantSecurity?.mfa_enrolled) {
      toast({ title: "Enroll MFA first", description: "Security changes require a verified SMS or authenticator factor. Use Profile settings to enroll.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: factorData, error } = await supabase.auth.mfa.listFactors();
    const next = factorList(factorData);
    if (error || !next.length) {
      setSaving(false);
      toast({ title: "Verified MFA method required", description: error?.message || "No verified factor is available.", variant: "destructive" });
      return;
    }
    setFactors(next);
    setFactorId(next[0].id);
    setPending(change);
    setChallengeId("");
    setCode("");
    setSaving(false);
  };

  const requestChallenge = async () => {
    if (!factorId) return;
    setSaving(true);
    const { data: challenge, error } = await supabase.auth.mfa.challenge({ factorId });
    setSaving(false);
    if (error) toast({ title: "MFA code could not be requested", description: error.message, variant: "destructive" });
    else setChallengeId(challenge.id);
  };

  const approveAndSave = async () => {
    if (!pending || !challengeId || !/^\d{6,8}$/.test(code)) return;
    setSaving(true);
    const { data: approval, error: approvalError } = await supabase.functions.invoke("merchant-security", { body: { action: "verify-and-approve", merchantId: merchantSecurity?.merchant_id, factorId, challengeId, code, approvedAction: pending.action, payload: pending.payload } });
    if (approvalError || approval?.error) {
      setSaving(false);
      setCode("");
      toast({ title: "MFA verification failed", description: approval?.error || approvalError?.message, variant: "destructive" });
      return;
    }
    if (approval.session?.access_token) {
      const current = await supabase.auth.getSession();
      await supabase.auth.setSession({ access_token: approval.session.access_token, refresh_token: approval.session.refresh_token || current.data.session?.refresh_token || "" });
    }
    const { data: updated, error: mutationError } = await supabase.functions.invoke("merchant-security", { body: { action: "mutate", merchantId: merchantSecurity?.merchant_id, mutation: pending.action, approvalId: approval.approvalId, payload: pending.payload } });
    setSaving(false);
    if (mutationError || updated?.error) {
      toast({ title: "Security change was not saved", description: updated?.error || mutationError?.message, variant: "destructive" });
      return;
    }
    setData(updated as SecurityData);
    setPending(null);
    setCode("");
    setNetworkLabel("");
    setEditingNetwork(null);
    setStaffName("");
    setStaffEmail("");
    await refreshMerchantSecurity();
    toast({ title: "Security change saved", description: "The single-use MFA approval has been consumed." });
  };

  const selectedFactor = useMemo(() => factors.find((factor) => factor.id === factorId), [factorId, factors]);

  if (merchantSecurity?.actor_role === "staff") return <ProtectedRoute><div className="rounded-xl border border-red-400/30 bg-[#222922] p-10 text-center text-white"><ShieldAlert className="mx-auto mb-4 h-12 w-12 text-red-300" /><h1 className="text-2xl font-bold">Access denied</h1><p className="mt-2 text-white/60">Staff cannot open Security & Access.</p></div></ProtectedRoute>;
  if (loading || !data) return <ProtectedRoute><div className="flex min-h-[50vh] items-center justify-center text-white"><Loader2 className="mr-2 h-6 w-6 animate-spin" />Loading Security & Access…</div></ProtectedRoute>;

  const networkChange = () => startApproval({ action: editingNetwork ? "network.edit" : "network.add", payload: editingNetwork ? { id: editingNetwork, label: networkLabel, network: networkValue } : { label: networkLabel, network: networkValue }, label: `${editingNetwork ? "Edit" : "Add"} network “${networkLabel}” (${networkValue})` });

  return (
    <ProtectedRoute>
      <div className="space-y-6 text-white">
        <Card className="border-white/10 bg-[#222922] text-white">
          <CardHeader className="border-b border-white/10"><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><Network className="h-5 w-5 text-[#f6c431]" />Approved Networks</CardTitle><CardDescription className="mt-1 text-white/55">Restrict every merchant user to approved public IPv4/IPv6 addresses or CIDR ranges.</CardDescription></div><Button onClick={() => startApproval({ action: "network.toggle", payload: { enabled: !data.settings.network_restrictions_enabled }, label: `${data.settings.network_restrictions_enabled ? "Disable" : "Enable"} network restrictions for all organisation users` })} className={data.settings.network_restrictions_enabled ? "bg-red-500 text-white" : "bg-[#f6c431] text-black"}>{data.settings.network_restrictions_enabled ? "Disable restrictions" : "Enable restrictions"}</Button></div></CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="grid gap-3 rounded-lg border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm md:grid-cols-2"><div><p className="text-white/50">Current detected public IP</p><p className="mt-1 font-mono font-semibold text-[#f6c431]">{data.currentIp || "Unavailable in this environment"}</p></div><div className="text-white/65">Private addresses such as 192.168.x.x are not your office’s public IP. Dynamic IPs may change; use a static office IP or corporate VPN with a fixed exit IP.</div></div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]"><Input value={networkLabel} onChange={(event) => setNetworkLabel(event.target.value)} placeholder="Office or VPN label" className="bg-white text-black" /><Input value={networkValue} onChange={(event) => setNetworkValue(event.target.value)} placeholder="203.0.113.10 or 2001:db8::/48" className="bg-white text-black" /><Button onClick={networkChange} disabled={!networkLabel.trim() || !networkValue.trim()} className="bg-[#f6c431] text-black"><Plus className="mr-2 h-4 w-4" />{editingNetwork ? "Save edit" : "Add network"}</Button>{data.currentIp && <Button variant="outline" onClick={() => { setNetworkValue(data.currentIp || ""); if (!networkLabel) setNetworkLabel("Current network"); }}>Add current</Button>}</div>
            <div className="space-y-2">{data.networks.length ? data.networks.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#1b211d] p-4"><div><p className="font-semibold">{row.label}</p><p className="font-mono text-sm text-[#f6c431]">{row.network}</p><p className="mt-1 text-xs text-white/45">Added {new Date(row.created_at).toLocaleString()} by {row.creator_name}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingNetwork(row.id); setNetworkLabel(row.label); setNetworkValue(row.network); }}><Edit3 className="mr-2 h-4 w-4" />Edit</Button><Button size="sm" variant="outline" className="border-red-400/30 text-red-200" onClick={() => startApproval({ action: "network.remove", payload: { id: row.id }, label: `Remove network “${row.label}” (${row.network})` })}><Trash2 className="mr-2 h-4 w-4" />Remove</Button></div></div>) : <p className="rounded-lg border border-dashed border-white/15 p-6 text-center text-white/45">No approved networks yet. Restrictions cannot be enabled until the current connection matches an entry.</p>}</div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#222922] text-white">
          <CardHeader className="border-b border-white/10"><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-[#f6c431]" />Staff Access</CardTitle><CardDescription className="text-white/55">Up to four additional accounts. Pending, active and suspended memberships count until removed or expired.</CardDescription></CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_160px_auto]"><Input value={staffName} onChange={(event) => setStaffName(event.target.value)} placeholder="Full name" className="bg-white text-black" /><Input type="email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} placeholder="staff@example.com" className="bg-white text-black" /><select value={staffRole} onChange={(event) => setStaffRole(event.target.value as "admin" | "staff")} className="rounded-md border bg-white px-3 text-sm text-black"><option value="staff">Staff</option><option value="admin">Administrator</option></select><Button disabled={!staffName.trim() || !staffEmail.trim() || data.staff.length >= 4} onClick={() => startApproval({ action: "staff.invite", payload: { fullName: staffName, email: staffEmail, role: staffRole }, label: `Invite ${staffName} (${staffEmail}) as ${staffRole}` })} className="bg-[#f6c431] text-black"><UserPlus className="mr-2 h-4 w-4" />Invite</Button></div>
            <p className="text-xs text-white/50">Staff can use operational sections and their own Profile/MFA. Staff are blocked from Tax Settings, KYC, Security & Access, and API & Integration. Invitations expire after 48 hours.</p>
            <div className="space-y-2">{data.staff.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#1b211d] p-4"><div><p className="font-semibold">{member.full_name} <span className="ml-2 rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase">{member.role}</span></p><p className="text-sm text-white/60">{member.email}</p><p className="text-xs capitalize text-[#f6c431]">{member.status}{member.invitation_expires_at && member.status === "pending" ? ` · expires ${new Date(member.invitation_expires_at).toLocaleString()}` : ""}</p></div><div className="flex flex-wrap gap-2">{member.status === "pending" && <Button size="sm" variant="outline" onClick={() => startApproval({ action: "staff.resend", payload: { id: member.id }, label: `Resend invitation to ${member.email}` })}><RefreshCw className="mr-2 h-4 w-4" />Resend</Button>}{member.status === "active" && <Button size="sm" variant="outline" onClick={() => startApproval({ action: "staff.suspend", payload: { id: member.id }, label: `Suspend ${member.email}` })}>Suspend</Button>}{member.status === "suspended" && <Button size="sm" variant="outline" onClick={() => startApproval({ action: "staff.reactivate", payload: { id: member.id }, label: `Restore ${member.email}` })}>Reactivate</Button>}<Button size="sm" variant="outline" onClick={() => startApproval({ action: "staff.role", payload: { id: member.id, role: member.role === "admin" ? "staff" : "admin" }, label: `Change ${member.email} to ${member.role === "admin" ? "staff" : "administrator"}` })}>Make {member.role === "admin" ? "staff" : "admin"}</Button><Button size="sm" variant="outline" className="border-red-400/30 text-red-200" onClick={() => startApproval({ action: "staff.remove", payload: { id: member.id }, label: `Remove ${member.email} from this merchant` })}><Trash2 className="mr-2 h-4 w-4" />Remove</Button></div></div>)}{!data.staff.length && <p className="rounded-lg border border-dashed border-white/15 p-6 text-center text-white/45">No additional staff accounts.</p>}</div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#222922] text-white">
          <CardHeader className="border-b border-white/10"><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-[#f6c431]" />Security Activity</CardTitle><CardDescription className="text-white/55">Protected, read-only activity records. OTPs, secrets and recovery codes are never recorded.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-black/20 text-white/50"><tr><th className="p-4">Time</th><th className="p-4">Actor</th><th className="p-4">Action</th><th className="p-4">Result</th><th className="p-4">Source IP</th></tr></thead><tbody>{data.activity.map((row) => <tr key={row.id} className="border-t border-white/10"><td className="p-4">{new Date(row.created_at).toLocaleString()}</td><td className="p-4">{row.actor_name}</td><td className="p-4">{formatAction(row.action)}</td><td className="p-4 capitalize">{row.result}</td><td className="p-4 font-mono text-xs">{row.source_ip || "Not recorded"}</td></tr>)}</tbody></table>{!data.activity.length && <p className="p-8 text-center text-white/45">No security activity recorded yet.</p>}</CardContent>
        </Card>

        {pending && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl border border-yellow-400/30 bg-[#222922] p-6 shadow-2xl"><div className="flex justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-[#f6c431]">Fresh MFA required</p><h2 className="mt-2 text-xl font-bold">Confirm proposed change</h2></div><Button variant="ghost" size="icon" onClick={() => setPending(null)}><X className="h-5 w-5" /></Button></div><div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/75">{pending.label}</div><div className="mt-4"><Label>Verification method</Label><select value={factorId} onChange={(event) => { setFactorId(event.target.value); setChallengeId(""); setCode(""); }} className="mt-2 h-10 w-full rounded-md bg-white px-3 text-black">{factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.factor_type === "phone" ? `SMS ${factor.phone || ""}` : factor.friendly_name || "Authenticator app"}</option>)}</select></div>{!challengeId ? <Button onClick={requestChallenge} disabled={saving} className="mt-5 w-full bg-[#f6c431] text-black">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{selectedFactor?.factor_type === "phone" ? "Send SMS code" : "Enter authenticator code"}</Button> : <><Label className="mt-4 block">Verification code</Label><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} className="mt-2 bg-white text-black" /><Button onClick={approveAndSave} disabled={saving || !/^\d{6,8}$/.test(code)} className="mt-4 w-full bg-[#f6c431] text-black">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify and save this change</Button></>}</div></div>}
      </div>
    </ProtectedRoute>
  );
}
