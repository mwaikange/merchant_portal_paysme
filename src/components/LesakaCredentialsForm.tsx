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
  const [voucherPins,setVoucherPins]=useState(""),[voucherResults,setVoucherResults]=useState<Array<Record<string,unknown>>>([]);

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
      setMessage(enabled ? "Lesaka is visible to customers in the selected environment." : "Lesaka is hidden from customers.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update Lesaka."); }
    finally { setBusy(false); }
  };

  const blocked = disabled || loading || busy || !settings;
  const lookupLiveVoucherValues=async()=>{
    const pins=voucherPins.split(/\r?\n/).map(pin=>pin.trim()).filter(Boolean);
    if(!pins.length){setError("Enter at least one voucher PIN.");return;}
    setBusy(true);setError("");setMessage("");setVoucherResults([]);
    try{
      const {data,error:invokeError}=await supabase.functions.invoke("lesaka-credentials",{body:{action:"lookup_live_voucher_values",merchant_id:merchantId,pins}});
      if(invokeError){const detail=invokeError.context instanceof Response?await invokeError.context.json().catch(()=>null):null;throw new Error(detail?.error||"Could not check live voucher values.");}
      if(!data?.ok||!Array.isArray(data.results))throw new Error(data?.error||"Could not check live voucher values.");
      setVoucherResults(data.results);setVoucherPins("");
      setMessage("Live voucher status checked. No voucher was redeemed.");
    }catch(e){setError(e instanceof Error?e.message:"Could not check live voucher values.");}
    finally{setBusy(false);}
  };
  const saveLive=async()=>{setBusy(true);setError("");try{setSettings(await request("save_live",{username:liveUsername,password:livePassword,store_id:liveStoreId}));setLiveUsername("");setLivePassword("");setMessage("Live credentials saved separately. Staging remains active until you switch to Live.");}catch(e){setError(e instanceof Error?e.message:"Live credentials could not be saved.");}finally{setBusy(false);}};
  const switchEnvironment=async(live:boolean)=>{if(!live&&!window.confirm("Switch this business to staging? Live Lesaka checkout will pause until you return to Live."))return;setBusy(true);setError("");try{await request("set_environment",{target_environment:live?"production":"staging",confirmed:live?approved:true,approval_reference:approval});const result=await request("status");setSettings(result);setStoreId(result.store_id||"");setUsername("");setPassword("");setApproved(false);setMessage(live?"Live Lesaka payments are active. Test checkouts are closed; their results remain available.":"Staging is active. Open Lesaka staging tests to begin a cycle.");}catch(e){setError(e instanceof Error?e.message:"The Lesaka environment could not be changed.");}finally{setBusy(false);}};
  const id = "lesaka";
  return (
    <div className="rounded-lg border bg-white p-3" aria-label="Lesaka credentials">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">Lesaka</p>
          <p className="text-xs text-gray-500">Enter the Lesaka username and password for this environment. The account name “PaySME” does not need to be entered.</p>
        </div>
        <Badge variant="outline">{loading ? "Loading..." : settings?.configured ? "Credentials saved" : "Not configured"}</Badge>
      </div>
      <div className="mb-3 flex items-center justify-between rounded-md border bg-gray-50 p-3">
        <div>
          <p className="text-xs font-semibold !text-white">Show this button to customers</p>
          <p className="text-xs !text-white/90">Applies to hosted pages and SDK modals when this business is set to Live.</p>
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
          <Label htmlFor={`${id}-store`}>Client ID / Store ID (optional)</Label>
          <Input id={`${id}-store`} maxLength={128} value={storeId} onChange={event => setStoreId(event.target.value)} disabled={blocked} placeholder="Client ID supplied by Lesaka" />
        </div>
          <p className="text-xs text-gray-500">Username and password are encrypted and saved for your merchant account. Client ID is sent as the optional Lesaka Store ID. Saved passwords are never displayed again.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm text-green-700">{message}</p>}
        <Button type="button" className="bg-paysme-green hover:bg-paysme-green/90" disabled={blocked || !username.trim() || !password} onClick={save}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Lesaka credentials
        </Button>
      </div>
      {settings?.environment === "staging" && settings.configured && <a href="/portal/api-integration/lesaka-tests" className="mt-4 inline-block text-sm font-semibold text-yellow-300 underline">Open Lesaka staging tests</a>}
      {settings && <div className="mt-4 space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Lesaka environment: {settings.environment==='production'?'Live':'Staging'}</p><p className="text-xs text-gray-500">The payment modal and hosted pages use this business's selected environment automatically.</p></div><Switch aria-label="Use live Lesaka payments" checked={settings.environment==='production'} disabled={blocked||(settings.environment==='staging'&&(!settings.live_ready||!approved))} onCheckedChange={switchEnvironment}/></div>
        {settings.environment==='staging' && <details><summary className="cursor-pointer text-sm font-semibold">Live credentials and activation</summary><div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">Save the live username and password from Lesaka. Live activation requires either the required UAT completion or recorded production approval, plus saved live credentials. Switching to Live closes test checkouts but keeps their results in the portal.</p>
          <Label htmlFor="lesaka-live-username">Live API username</Label><Input id="lesaka-live-username" autoComplete="off" value={liveUsername} onChange={e=>setLiveUsername(e.target.value)} disabled={blocked} placeholder={settings.live_configured?'Live username saved - enter to replace':'Live username from Lesaka'}/>
          <Label htmlFor="lesaka-live-password">Live API password</Label><Input id="lesaka-live-password" type="password" autoComplete="new-password" value={livePassword} onChange={e=>setLivePassword(e.target.value)} disabled={blocked} placeholder={settings.live_configured?'Live password saved - enter to replace':'Live password from Lesaka'}/>
          <Label htmlFor="lesaka-live-store">Live Client ID / Store ID (optional)</Label><Input id="lesaka-live-store" value={liveStoreId} onChange={e=>setLiveStoreId(e.target.value)} disabled={blocked} placeholder="Client ID supplied by Lesaka"/>
          <Button type="button" disabled={blocked||!liveUsername.trim()||!livePassword} onClick={saveLive}>Save live credentials</Button>
          <Label htmlFor="lesaka-approval">Lesaka production reference (optional)</Label><Input id="lesaka-approval" maxLength={200} value={approval} onChange={e=>setApproval(e.target.value)} disabled={blocked} placeholder="Email reference or note, if available"/>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} disabled={blocked}/><span>I confirm Lesaka issued these live credentials for this business, and I authorize real production voucher payments.</span></label>
          <p className="text-xs text-gray-500">{settings.live_ready?'Ready: confirm above, then use the Live switch.':'The Live switch becomes available after required UAT completion or recorded production approval, and saved live credentials.'}</p>
        </div></details>}
      </div>}
      {settings?.live_configured && <details className="mt-4 border-t pt-4">
        <summary className="cursor-pointer text-sm font-semibold">Check live voucher values (read-only)</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">Checks each PIN against Lesaka Live using the saved live credentials. This only reads status and value; it does not redeem vouchers or switch live checkout on. Enter one 16-digit PIN per line. PINs are not saved, and results show only the last four digits.</p>
          <Label htmlFor={`${id}-live-voucher-pins`}>Voucher PINs</Label>
          <textarea id={`${id}-live-voucher-pins`} rows={4} maxLength={2000} value={voucherPins} onChange={event=>setVoucherPins(event.target.value)} disabled={blocked} placeholder="One 16-digit voucher PIN per line" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" />
          <Button type="button" variant="outline" disabled={blocked||!voucherPins.trim()} onClick={lookupLiveVoucherValues}>Check values without redeeming</Button>
          {voucherResults.length>0&&<div className="space-y-2" aria-live="polite">{voucherResults.map((result,index)=>{
            const currency=typeof result.currency==="string"?result.currency:"NAD";
            const amount=(minor:unknown)=>Number.isSafeInteger(minor)?`${currency} ${(Number(minor)/100).toFixed(2)}`:"—";
            return <div key={`${String(result.pin_last4||index)}-${index}`} className="rounded-md border p-3 text-sm">
              <p className="font-semibold">PIN ending {String(result.pin_last4||"----")} · {String(result.status||"Not checked")}</p>
              {result.error?<p role="alert" className="mt-1 text-red-600">{String(result.error)}</p>:<p className="mt-1 text-gray-600">Original value: {amount(result.total_minor)} · Remaining: {amount(result.remaining_minor)}</p>}
              {typeof result.product_name==="string"&&<p className="text-xs text-gray-500">{result.product_name}</p>}
              {typeof result.expiry_date==="string"&&<p className="text-xs text-gray-500">Expires: {new Date(result.expiry_date).toLocaleDateString()}</p>}
            </div>;
          })}</div>}
        </div>
      </details>}
    </div>
  );
}
