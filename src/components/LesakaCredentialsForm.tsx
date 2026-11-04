import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

type Settings = { configured: boolean; enabled: boolean; store_id: string; environment: "staging" | "production";live_configured?:boolean;live_ready?:boolean;approval_reference?:string };

export function LesakaCredentialsForm({ merchantId, disabled = false }: { merchantId: string; disabled?: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [storeId, setStoreId] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [liveUsername,setLiveUsername]=useState(""),[livePassword,setLivePassword]=useState(""),[liveStoreId,setLiveStoreId]=useState(""),[approval,setApproval]=useState(""),[approved,setApproved]=useState(false);

  const request = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: invokeError } = await supabase.functions.invoke("lesaka-credentials", {
      body: { action, merchant_id: merchantId, environment: settings?.environment, ...extra },
    });
    if (invokeError) {
      const detail = invokeError.context instanceof Response ? await invokeError.context.json().catch(() => null) : null;
      throw new Error(detail?.error || "Lesaka settings are unavailable. Please try again.");
    }
    if (!data?.ok) throw new Error(data?.error || "Could not update Lesaka settings.");
    return data as Settings;
  };

  useEffect(() => {
    let active = true;
    setUsername(""); setPassword(""); setStoreId(""); setSettings(null); setError(""); setMessage(""); setLoading(true);
    setLiveUsername("");setLivePassword("");setLiveStoreId("");setApproval("");setApproved(false);
    // Saved credentials are deliberately never read back into the form.
    supabase.functions.invoke("lesaka-credentials", { body: { action: "status", merchant_id: merchantId } })
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.ok) { setError("Could not load Lesaka settings. Please try again."); return; }
        setSettings(data); setStoreId(data.store_id || "");setApproval(data.approval_reference||"");
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [merchantId]);

  const save = async () => {
    if (!username.trim() || !password || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request("save", { username, password, store_id: storeId });
      setSettings(result); setUsername(""); setPassword("");
      setMessage(result.environment === "staging" ? "PaySME integration test credentials saved." : "Your Lesaka live credentials have been saved.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save Lesaka credentials."); }
    finally { setBusy(false); }
  };

  const toggle = async (enabled: boolean) => {
    setBusy(true); setError(""); setMessage("");
    try {
      setSettings(await request("set_enabled", { enabled }));
      setMessage(enabled ? "Lesaka is enabled for checkout once live credentials and testing are approved." : "Lesaka is hidden from customers.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update Lesaka."); }
    finally { setBusy(false); }
  };

  const blocked = disabled || loading || busy || !settings;
  const saveLive=async()=>{setBusy(true);setError("");try{setSettings(await request("save_live",{username:liveUsername,password:livePassword,store_id:liveStoreId}));setLiveUsername("");setLivePassword("");setMessage("Live credentials saved separately. Staging remains active until you switch to Live.");}catch(e){setError(e instanceof Error?e.message:"Live credentials could not be saved.");}finally{setBusy(false);}};
  const switchEnvironment=async(live:boolean)=>{if(!live&&!window.confirm("Switch this business to staging? Live Lesaka checkout will pause until you return to Live."))return;setBusy(true);setError("");try{await request("set_environment",{target_environment:live?"production":"staging",confirmed:live?approved:true,approval_reference:approval});const result=await request("status");setSettings(result);setStoreId(result.store_id||"");setUsername("");setPassword("");setApproved(false);setMessage(live?"Live Lesaka payments are active. Test results were removed and test checkouts closed.":"Staging is active. Open Lesaka staging tests to begin a cycle.");}catch(e){setError(e instanceof Error?e.message:"The Lesaka environment could not be changed.");}finally{setBusy(false);}};
  const id = "lesaka";
  return (
    <div className="rounded-lg border bg-white p-3" aria-label="Lesaka credentials">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">Lesaka</p>
          <p className="text-xs text-gray-500">Enter the API username and password Lesaka issued to your business.</p>
        </div>
        <Badge variant="outline">{loading ? "Loading..." : settings?.configured ? "Credentials saved" : "Not configured"}</Badge>
      </div>
      <div className="mb-3 flex items-center justify-between rounded-md border bg-gray-50 p-3">
        <div>
          <p className="text-xs font-semibold !text-white">Show this button to customers</p>
          <p className="text-xs !text-white/90">Applies to hosted pages and SDK modals after live setup and testing.</p>
        </div>
        <Switch aria-label="Show Lesaka to customers" checked={settings?.enabled === true} disabled={blocked || !settings?.configured} onCheckedChange={toggle} />
      </div>
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-700">{settings?.environment === "staging" ? "PaySME integration testing — staging credentials" : "Your Lesaka live API credentials"}</p>
        <div>
          <Label htmlFor={`${id}-username`}>Lesaka API username <span aria-hidden="true">*</span></Label>
          <Input id={`${id}-username`} required autoComplete="off" maxLength={512} value={username} onChange={event => setUsername(event.target.value)} disabled={blocked} placeholder={settings?.configured ? "Username saved — enter to replace" : "Username provided by Lesaka"} />
        </div>
        <div>
          <Label htmlFor={`${id}-password`}>Lesaka API password <span aria-hidden="true">*</span></Label>
          <Input id={`${id}-password`} required type="password" autoComplete="new-password" maxLength={4096} value={password} onChange={event => setPassword(event.target.value)} disabled={blocked} placeholder={settings?.configured ? "Password saved — enter to replace" : "Password provided by Lesaka"} />
        </div>
        <div>
          <Label htmlFor={`${id}-store`}>Store ID (optional)</Label>
          <Input id={`${id}-store`} maxLength={128} value={storeId} onChange={event => setStoreId(event.target.value)} disabled={blocked} placeholder="Only if supplied by Lesaka" />
        </div>
        <p className="text-xs text-gray-500">Credentials are encrypted and saved for your merchant account. Saved values are never displayed again. Enter both fields to replace them.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm text-green-700">{message}</p>}
        <Button type="button" className="bg-paysme-green hover:bg-paysme-green/90" disabled={blocked || !username.trim() || !password} onClick={save}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Lesaka credentials
        </Button>
      </div>
      {settings?.environment === "staging" && settings.configured && <a href="/portal/api-integration/lesaka-tests" className="mt-4 inline-block text-sm font-semibold text-yellow-300 underline">Open Lesaka staging tests</a>}
      {settings && <div className="mt-4 space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Lesaka environment: {settings.environment==='production'?'Live':'Staging'}</p><p className="text-xs text-gray-500">The payment modal and hosted pages use this business's selected environment automatically.</p></div><Switch aria-label="Use live Lesaka payments" checked={settings.environment==='production'} disabled={blocked||(settings.environment==='staging'&&(!settings.live_ready||!approved||approval.trim().length<3))} onCheckedChange={switchEnvironment}/></div>
        {settings.environment==='staging' && <details><summary className="cursor-pointer text-sm font-semibold">Live credentials and approval</summary><div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">Save the live username and password from Lesaka. After all 12 guide cases pass in each of three cycles, download the evidence and confirm Lesaka's approval. Switching to Live removes the test campaign and closes its test checkouts.</p>
          <Label htmlFor="lesaka-live-username">Live API username</Label><Input id="lesaka-live-username" autoComplete="off" value={liveUsername} onChange={e=>setLiveUsername(e.target.value)} disabled={blocked} placeholder={settings.live_configured?'Live username saved - enter to replace':'Live username from Lesaka'}/>
          <Label htmlFor="lesaka-live-password">Live API password</Label><Input id="lesaka-live-password" type="password" autoComplete="new-password" value={livePassword} onChange={e=>setLivePassword(e.target.value)} disabled={blocked} placeholder={settings.live_configured?'Live password saved - enter to replace':'Live password from Lesaka'}/>
          <Label htmlFor="lesaka-live-store">Live Store ID (optional)</Label><Input id="lesaka-live-store" value={liveStoreId} onChange={e=>setLiveStoreId(e.target.value)} disabled={blocked} placeholder="Only if supplied by Lesaka"/>
          <Button type="button" disabled={blocked||!liveUsername.trim()||!livePassword} onClick={saveLive}>Save live credentials</Button>
          <Label htmlFor="lesaka-approval">Lesaka approval reference</Label><Input id="lesaka-approval" maxLength={200} value={approval} onChange={e=>setApproval(e.target.value)} disabled={blocked} placeholder="Approval email reference or case number"/>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} disabled={blocked}/><span>Lesaka approved this business's three test cycles, and I have downloaded the Excel results and full evidence.</span></label>
          <p className="text-xs text-gray-500">{settings.live_ready?'Ready: use the Live switch above after confirming approval.':'The Live switch becomes available after three successful cycles and saved live credentials.'}</p>
        </div></details>}
      </div>}
    </div>
  );
}
