import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Play, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { uatWorkbook } from "@/lib/uatWorkbook";
import { LESAKA_UAT_CASES, needsFixture } from "../../supabase/functions/_shared/lesaka-uat";

type Fixture = { id: string; fixture_id: string; value_minor: number; serial_number: string; allocation: "automated" | "manual"; source_line: number; observed_state: string | null; locked_by: string | null };
type Evidence = { operation: string; client_reference: string; requested_at: string; finished_at: string | null; http_status: number; request: unknown; response: Record<string, unknown> };
type Execution = { id: string; cycle: number; case_id: string; fixture_id: string | null; actor_kind: "automated" | "manual"; verdict: string; reason: string; client_reference: string; request_time: string; started_at: string; completed_at: string | null; replay_of: string | null; evidence: Evidence[]; lesaka_uat_notes?: { id: string; note: string; created_at: string }[] };
type CustomerAttempt = { id:string; cycle:number; transaction_id:string; generated_code:string; channel:string; outcome:string; message:string; created_at:string; evidence:Evidence[] };
type State = { customer_attempts:CustomerAttempt[]; enabled: boolean; credentials_current?: boolean; campaign: { id: string; title: string; created_at: string; inventory_sha256: string | null; customer_cycle?:number; customer_until?:string | null } | null; inventory: Fixture[]; executions: Execution[] };
const empty: State = { enabled: false, campaign: null, customer_attempts: [], inventory: [], executions: [] };
const label = (value: string) => ({ pass: "Passed", fail: "Failed", review: "Needs review", blocked: "Blocked", uncertain: "Uncertain", error: "Error", running: "Running", pending: "Not run" }[value] || value);
const guideCases = LESAKA_UAT_CASES.filter(item => /^TC-(STAT|RED|EDGE)-/.test(item.id));
const providerIds = (run: Execution, key: "traceId" | "id") => [...new Set(run.evidence.filter(call => key === "traceId" || call.operation === "redeem" && call.http_status === 200).map(call => call.response[key]).filter((value): value is string => typeof value === "string" && Boolean(value)))];
const colour = (value: string) => value === "pass" ? "text-emerald-300" : ["fail", "error"].includes(value) ? "text-red-300" : "text-yellow-200";
const csvCell = (value: unknown) => { let s = typeof value === "string" ? value : JSON.stringify(value ?? ""); if (/^[=+@-]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LesakaUatPanel({ merchantId, apiKey }: { merchantId: string; apiKey?: string }) {
  const [state, setState] = useState<State>(empty), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [cycle, setCycle] = useState(2), [caseId, setCaseId] = useState("TC-STAT-01");
  const [mode, setMode] = useState<"manual" | "automated">("manual"), [fixtureId, setFixtureId] = useState("");
  const [pin, setPin] = useState(""), [confirmed, setConfirmed] = useState(false), [replayOf, setReplayOf] = useState("");
  const [note, setNote] = useState("");
  const [view,setView]=useState<"customer"|"manual"|"auto">("customer"),[exported,setExported]=useState(false),[autoConfirmed,setAutoConfirmed]=useState(false),[checkoutAmount,setCheckoutAmount]=useState("10");
  const invoke = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const result = await supabase.functions.invoke("lesaka-uat", { body: { action, merchant_id: merchantId, ...extra } });
    if (result.error) {
      const details = result.error.context instanceof Response ? await result.error.context.json().catch(() => null) : null;
      throw new Error(details?.error || "The test recorder could not complete this request.");
    }
    if (!result.data?.ok) throw new Error(result.data?.error || "Test recorder is unavailable.");
    return result.data;
  }, [merchantId]);
  const refresh = useCallback(async () => { setState({ ...empty, ...(await invoke("status")) }); }, [invoke]);
  useEffect(() => {
    let active = true;
    setState(empty); setPin(""); setError("");
    invoke("status").then(result => { if (active) setState({ ...empty, ...result }); }).catch(() => { /* Private recorder is optional outside PaySME UAT. */ });
    return () => { active = false; };
  }, [invoke]);
  const latest = useMemo(() => {
    const map = new Map<string, Execution>();
    for (const run of state.executions) map.set(`${run.cycle}:${run.case_id}`, run);
    return map;
  }, [state.executions]);
  const test = LESAKA_UAT_CASES.find(item => item.id === caseId)!;
  const selected = latest.get(`${cycle}:${caseId}`);
  useEffect(() => { setFixtureId(""); setPin(""); setConfirmed(false); setReplayOf(""); setNote(""); }, [cycle, caseId]);
  useEffect(() => {
    if (selected && ["uncertain", "error", "running"].includes(selected.verdict)) {
      setFixtureId(selected.fixture_id || ""); setMode(selected.actor_kind); setReplayOf(selected.replay_of || "");
    }
  }, [selected]);
  const fixture = state.inventory.find(item => item.id === fixtureId);
  const choices = state.inventory.filter(item => item.allocation === mode && (!test.amountMinor || item.value_minor === test.amountMinor));
  const replays = state.executions.filter(item => item.cycle === cycle && item.fixture_id === fixtureId && item.case_id !== "TC-EDGE-01" && item.evidence.some(call => call.operation === "redeem" && call.http_status === 200 && call.response.remainingAmount === 0));
  const summary = [1, 2, 3].map(number => ({ cycle: number, guide_passed: guideCases.filter(item => latest.get(`${number}:${item.id}`)?.verdict === "pass").length, guide_recorded: guideCases.filter(item => latest.has(`${number}:${item.id}`)).length, passed: LESAKA_UAT_CASES.filter(item => latest.get(`${number}:${item.id}`)?.verdict === "pass").length, recorded: LESAKA_UAT_CASES.filter(item => latest.has(`${number}:${item.id}`)).length }));
  const work = async (operation: () => Promise<void>) => { setBusy(true); setError(""); try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : "The test request failed."); } finally { setBusy(false); } };
  useEffect(()=>{const focused=()=>{void refresh().catch(()=>{});};window.addEventListener("focus",focused);return()=>window.removeEventListener("focus",focused);},[refresh]);
  useEffect(()=>setExported(false),[state.campaign?.id,state.executions.length,state.customer_attempts.length]);
  const activeCheckout=Boolean(state.campaign?.customer_until&&Date.parse(state.campaign.customer_until)>Date.now());
  const hostedUrl=`https://www.paysme.site/pay/${merchantId}?amount=${encodeURIComponent(checkoutAmount)}&invoice_id=LES-UAT-C${state.campaign?.customer_cycle||cycle}-${Date.now()}`;
  const openModal=()=>work(async()=>{
    if(!apiKey)throw new Error("Use your website's PaySME payment button or the hosted checkout.");
    const sdkWindow=window as unknown as {PaySME?:{init:(config:Record<string,unknown>)=>void}};
    if(!sdkWindow.PaySME)await new Promise<void>((resolve,reject)=>{const script=document.createElement("script");script.src="https://www.paysme.site/sdk/v1/paysme.js?v=1.13.0";script.onload=()=>resolve();script.onerror=()=>reject(new Error("The payment modal could not load."));document.head.appendChild(script);});
    sdkWindow.PaySME?.init({vendor_uuid:merchantId,api_key:apiKey,amount_nad:Number(checkoutAmount),invoice_id:`LES-UAT-C${state.campaign?.customer_cycle||cycle}-${Date.now()}`});
  });
  const autoRun=()=>work(async()=>{
    for(const item of guideCases){const result=await invoke("auto_step",{campaign_id:state.campaign?.id,cycle,case_id:item.id,execution_id:crypto.randomUUID(),confirm_redemption:true});await refresh();if(["uncertain","running","error"].includes(result.execution?.verdict))break;}
    setAutoConfirmed(false);
  });
  const run = (resume?: Execution) => work(async () => {
    const id = resume?.id || crypto.randomUUID();
    try {
      await invoke("run", { campaign_id: state.campaign?.id, execution_id: id, case_id: resume?.case_id || caseId, cycle: resume?.cycle || cycle, fixture_id: resume?.fixture_id || fixtureId || null, mode: resume?.actor_kind || mode, pin, confirm_redemption: confirmed, replay_of: resume?.replay_of || replayOf || null });
    } finally { setPin(""); setConfirmed(false); await refresh(); }
  });
  const exportReport = (format: "json" | "csv" | "xlsx") => {
    const checks = [1, 2, 3].flatMap(number => LESAKA_UAT_CASES.map(item => ({ cycle: number, case_id: item.id, title: item.title, expected: item.expected, latest_verdict: latest.get(`${number}:${item.id}`)?.verdict || "pending" })));
    const report = { environment: "staging", exported_at: new Date().toISOString(), campaign: state.campaign, cycles: summary, all_three_guide_cycles_passed: summary.every(s => s.guide_passed === guideCases.length), all_three_cycles_passed: summary.every(s => s.passed === LESAKA_UAT_CASES.length), cases: LESAKA_UAT_CASES, checklist: checks, inventory: state.inventory, executions: state.executions, customer_attempts:state.customer_attempts };
    const filename = `Lesaka-UAT-${state.campaign?.id || "checklist"}`;
    setExported(true);
    if (format === "json") return download(filename + ".json", JSON.stringify(report, null, 2), "application/json");
    const header = ["Cycle", "Case", "Title", "Expected", "Verdict", "Execution ID", "Started UTC", "Finished UTC", "Client reference", "Lesaka receipt IDs", "Trace IDs", "Actor", "Voucher", "Reason", "Request/response evidence", "Manual observations"];
    const rows = checks.flatMap(check => {
      const runs = state.executions.filter(item => item.cycle === check.cycle && item.case_id === check.case_id);
      if (!runs.length) return [[check.cycle, check.case_id, check.title, check.expected, "Not run", "", "", "", "", "", "", "", "", "", "", ""]];
      return runs.map(item => [item.cycle, item.case_id, check.title, check.expected, label(item.verdict), item.id, item.started_at, item.completed_at, item.client_reference, providerIds(item, "id").join("; "), providerIds(item, "traceId").join("; "), item.actor_kind, state.inventory.find(f => f.id === item.fixture_id)?.fixture_id || "Synthetic input", item.reason, item.evidence, item.lesaka_uat_notes || []]);
    });
    if(format==="xlsx") {
      const sheets=[1,2,3].map(number=>({name:`Cycle ${number}`,rows:[header,...rows.filter(row=>row[0]===number)]}));
      sheets.push({name:"Customer checkouts",rows:[["Cycle","Checkout","Channel","Outcome","Recorded UTC","Message","Technical evidence"],...state.customer_attempts.map(item=>[item.cycle,item.generated_code,item.channel,item.outcome,item.created_at,item.message,JSON.stringify(item.evidence)])]});
      const calls:unknown[][]=[["Cycle","Source","Operation","clientReference","traceId","HTTP","Request UTC","Redacted request","Redacted response"]];const seen=new Set<string>();
      for(const item of [...state.executions.map(e=>({cycle:e.cycle,source:e.case_id,evidence:e.evidence})),...state.customer_attempts.map(e=>({cycle:e.cycle,source:e.generated_code,evidence:e.evidence}))])for(const call of item.evidence){const key=call.operation+call.client_reference+call.requested_at;if(seen.has(key))continue;seen.add(key);calls.push([item.cycle,item.source,call.operation,call.client_reference,call.response.traceId||"Not returned",call.http_status,call.requested_at,JSON.stringify(call.request),JSON.stringify(call.response)]);}
      sheets.push({name:"Technical evidence",rows:calls});
      const bytes=uatWorkbook(sheets);const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));const a=document.createElement("a");a.href=url;a.download=filename+".xlsx";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    download(filename + ".csv", "\uFEFF" + [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  };
  if (!state.enabled) return null;
  return <section id="lesaka-test-recorder" className="mt-8 min-w-0 space-y-4 rounded-lg border border-yellow-400/40 bg-[#1b211c] p-4 text-white [&_table]:text-white/80" aria-label="Lesaka three-cycle test recorder">
    <div><h3 className="text-lg font-semibold">Lesaka test recorder</h3><p className="mt-1 text-sm text-white/70">Three complete cycles. Each case records its own reference, timestamps and provider evidence. These staging tests do not mark real PaySME payments paid.</p></div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => work(refresh)}><RefreshCw className="mr-2 h-4 w-4" />Refresh results</Button>
      <Button type="button" disabled={!state.campaign || busy} onClick={() => exportReport("xlsx")}><Download className="mr-2 h-4 w-4" />Download Excel</Button>
      <Button type="button" variant="outline" disabled={!state.campaign || busy} onClick={() => exportReport("csv")}><Download className="mr-2 h-4 w-4" />Download results CSV</Button>
      <Button type="button" variant="outline" disabled={!state.campaign || busy} onClick={() => exportReport("json")}>Download full evidence JSON</Button>
    </div>
    {error && <p role="alert" className="rounded-md border border-red-400/40 p-3 text-sm text-red-200">{error}</p>}
    {(!state.campaign || state.credentials_current === false) ? <Button type="button" disabled={busy} onClick={() => work(async () => { await invoke("create"); await refresh(); })}>Create three-cycle campaign</Button> : <>
      <p className="break-all text-xs text-white/60">This business's campaign: {state.campaign.id}</p>
      {state.campaign.inventory_sha256&&<p className="text-sm text-white/75">Voucher file loaded for this business: {state.inventory.length} vouchers · {state.inventory.filter(v=>v.allocation==='automated').length} allocated to automatic checks · {state.inventory.filter(v=>v.allocation==='manual').length} reserved for manual/customer tests.</p>}
      {!state.campaign.inventory_sha256 && <div className="space-y-2 rounded-md border border-white/15 p-3">
        <Label htmlFor="lesaka-voucher-file"><Upload className="mr-2 inline h-4 w-4" />Upload this business's Lesaka voucher text file</Label>
        <Input id="lesaka-voucher-file" type="file" accept=".txt,text/plain" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
          void work(async () => { const bytes = new Uint8Array(await file.arrayBuffer()); if (bytes.length > 110000) throw new Error("Voucher file is too large."); const file_base64 = btoa(String.fromCharCode(...bytes)); await invoke("import", { campaign_id: state.campaign?.id, file_base64 }); await refresh(); });
        }} />
        <p className="text-xs text-white/70">The first half of each value is allocated to automation. The remaining half is reserved for your manual tests; its PINs are not stored.</p>
      </div>}
      <div className="grid grid-cols-3 gap-2" aria-label="Test cycles">{summary.map(s => <button key={s.cycle} type="button" aria-pressed={cycle === s.cycle} data-state={cycle === s.cycle ? "active" : "inactive"} disabled={busy} onClick={() => { setCycle(s.cycle); setPin(""); setConfirmed(false); }} className={`rounded-md border p-3 text-left ${cycle === s.cycle ? "border-yellow-400 bg-yellow-400/10" : "border-white/15"}`}><strong>Cycle {s.cycle}</strong><span className="mt-1 block text-xs">Guide: {s.guide_passed}/{guideCases.length} passed · {s.guide_recorded} recorded</span></button>)}</div>
      <p className="text-xs text-white/65">Each guide cycle contains 12 mandatory cases. The 18 supplied workbook checks remain in the checklist and exports too. Failed, uncertain, blocked and review results do not count as passes; supplier sign-off is still required.</p>
      <div className="flex flex-wrap gap-2" aria-label="Testing method">{([['customer','Payment modal / hosted page'],['manual','Manual portal tests'],['auto','Automatic tests']] as const).map(([value,title])=><Button key={value} type="button" aria-pressed={view===value} disabled={busy} onClick={()=>setView(value)} variant={view===value?'default':'outline'}>{title}</Button>)}</div>
      {view === "customer" && <div className="space-y-4 rounded-md border border-yellow-400/30 p-4">
        <h4 className="text-base font-semibold">Test as a customer</h4>
        <p className="text-sm text-white/75">Start a cycle, open the checkout, and enter only the voucher PIN as a customer would. PaySME matches its serial number and records the results here automatically.</p>
        <p className="text-sm">{activeCheckout?`Recording customer checkouts for Cycle ${state.campaign.customer_cycle}. Testing ends ${new Date(state.campaign.customer_until!).toLocaleString('en-GB',{timeZone:'Africa/Windhoek'})}.`:'Customer checkout recording is stopped.'}</p>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy||!state.campaign.inventory_sha256} onClick={()=>work(async()=>{await invoke('customer_session',{campaign_id:state.campaign?.id,cycle,enabled:true});await refresh();})}>Start customer testing · Cycle {cycle}</Button><Button type="button" variant="outline" disabled={busy||!activeCheckout} onClick={()=>work(async()=>{await invoke('customer_session',{campaign_id:state.campaign?.id,cycle:state.campaign?.customer_cycle||cycle,enabled:false});await refresh();})}>Stop customer testing</Button></div>
        <div className="max-w-xs"><Label htmlFor="lesaka-checkout-amount">Checkout amount (N$)</Label><Input id="lesaka-checkout-amount" type="number" min="0.01" step="0.01" value={checkoutAmount} onChange={e=>setCheckoutAmount(e.target.value)}/><p className="mt-1 text-xs text-white/65">Use a voucher whose balance equals the final checkout total.</p></div>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={!activeCheckout||busy||Number(checkoutAmount)<=0} onClick={openModal}>Open payment modal</Button><Button type="button" asChild disabled={!activeCheckout||Number(checkoutAmount)<=0} variant="outline"><a href={activeCheckout?hostedUrl:undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!activeCheckout}>Open hosted checkout</a></Button></div>
        <p className="text-xs text-white/65">You can also use your existing website's PaySME button for this business. Test redemptions show a test confirmation and cannot settle a live payment.</p>
        <h4 className="font-semibold">Recorded customer checkouts · Cycle {cycle}</h4>
        {!state.customer_attempts.some(a=>a.cycle===cycle)&&<p className="text-sm text-white/65">No customer checkout has been recorded in this cycle yet.</p>}
        {state.customer_attempts.filter(a=>a.cycle===cycle).map(a=><details key={a.id} className="rounded border border-white/15 p-3"><summary className="cursor-pointer text-sm">{a.generated_code} · {a.channel==='sdk'?'Payment modal':'Hosted checkout'} · {a.outcome==='tested'?'Test completed':a.outcome}</summary><p className="mt-2 text-sm">{a.message}</p><p className="mt-2 text-xs text-white/65">{new Date(a.created_at).toLocaleString('en-GB',{timeZone:'Africa/Windhoek'})}</p><pre className="mt-2 whitespace-pre-wrap break-all text-xs">{JSON.stringify(a.evidence,null,2)}</pre></details>)}
      </div>}
      {view === "auto" && <div className="space-y-3 rounded-md border border-white/15 p-4"><h4 className="font-semibold">Automatic API checks · Cycle {cycle}</h4><p className="text-sm text-white/75">Run guide cases that have not yet been recorded. Automation uses only the first half of each voucher value, leaves your manual vouchers reserved, and stops if a redemption outcome is uncertain.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={autoConfirmed} onChange={e=>setAutoConfirmed(e.target.checked)} disabled={busy}/><span>I confirm automation may redeem a staging voucher from its allocated stock.</span></label><Button type="button" disabled={busy||!autoConfirmed||!state.campaign.inventory_sha256} onClick={autoRun}>Run automatic checks</Button></div>}
      {view === "manual" && (      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-md border border-white/15 p-3">
          <div><Label htmlFor="lesaka-uat-case">Test case</Label><select id="lesaka-uat-case" className="mt-1 h-10 w-full rounded-md border px-2 text-sm" value={caseId} disabled={busy} onChange={e => { setCaseId(e.target.value); setPin(""); setConfirmed(false); setReplayOf(""); }}>{LESAKA_UAT_CASES.map(item => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></div>
          <p className="text-sm text-white/75">Expected: {test.expected}</p>
          {test.blocked ? <p className="rounded-md border border-yellow-400/30 p-2 text-sm text-yellow-200">{test.blocked}</p> : <>
            <div><Label htmlFor="lesaka-uat-mode">Voucher allocation</Label><select id="lesaka-uat-mode" className="mt-1 h-10 w-full rounded-md border px-2 text-sm" value={mode} disabled={busy} onChange={e => { setMode(e.target.value as typeof mode); setFixtureId(""); setPin(""); setConfirmed(false); }}><option value="manual">My reserved manual vouchers</option><option value="automated">Automated-test allocation</option></select></div>
            {needsFixture(test) ? <>
              <div><Label htmlFor="lesaka-uat-voucher">Voucher</Label><select id="lesaka-uat-voucher" className="mt-1 h-10 w-full rounded-md border px-2 text-sm" value={fixtureId} disabled={busy} onChange={e => { setFixtureId(e.target.value); setPin(""); setConfirmed(false); setReplayOf(""); }}><option value="">Choose a voucher</option>{choices.map(item => <option key={item.id} value={item.id}>{item.fixture_id} · line {item.source_line} · {item.observed_state || "State not checked"}{item.locked_by ? " · unresolved" : ""}</option>)}</select></div>
              {fixture?.allocation === "manual" && test.input !== "serial" && <div><Label htmlFor="lesaka-uat-pin">Reserved voucher PIN</Label><Input id="lesaka-uat-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={19} value={pin} disabled={busy} onChange={e => setPin(e.target.value)} placeholder="Enter the PIN from your voucher file" /></div>}
            </> : <p className="text-xs text-white/65">This case uses deliberately invalid input. It does not need a stock voucher.</p>}
            {test.input === "replay" && <div><Label htmlFor="lesaka-uat-replay">Original successful redemption</Label><select id="lesaka-uat-replay" className="mt-1 h-10 w-full rounded-md border px-2 text-sm" value={replayOf} disabled={busy} onChange={e => setReplayOf(e.target.value)}><option value="">Choose an execution in this cycle</option>{replays.map(item => <option key={item.id} value={item.id}>{item.case_id} · {item.client_reference}</option>)}</select></div>}
            {test.operation === "redeem" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-1" /><span>I confirm this staging test may redeem the selected voucher. An idempotency replay reuses its original reference.</span></label>}
          </>}
          {test.review && <p className="text-xs text-yellow-200">Review note: {test.review}</p>}
          <Button type="button" disabled={busy || (!test.blocked && ((needsFixture(test) && !fixture) || (test.operation === "redeem" && !confirmed)))} onClick={() => run()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}{test.blocked ? "Record blocked case" : "Run and record test"}</Button>
          {selected && ["uncertain", "error", "running"].includes(selected.verdict) && <Button type="button" variant="outline" disabled={busy || (test.operation === "redeem" && !confirmed)} onClick={() => run(selected)}>Retry original execution</Button>}
        </div>
        <div className="space-y-3 rounded-md border border-white/15 p-3">
          <h4 className="font-semibold">Latest result for Cycle {cycle}</h4>
          {selected ? <><p className={colour(selected.verdict)}>{label(selected.verdict)}</p><p className="text-sm">{selected.reason}</p><p className="break-all text-xs text-white/60">Reference: {selected.client_reference}<br />Lesaka receipt IDs: {providerIds(selected, "id").join("; ") || "Not returned"}<br />Trace IDs: {providerIds(selected, "traceId").join("; ") || "Not returned"}<br />Execution: {selected.id}<br />Started: {new Date(selected.started_at).toLocaleString("en-GB", { timeZone: "Africa/Windhoek", timeZoneName: "short" })}</p>
            <Label htmlFor="lesaka-uat-note">Your manual observation</Label><Textarea id="lesaka-uat-note" value={note} maxLength={2000} disabled={busy} onChange={e => setNote(e.target.value)} placeholder="What you saw, and any supplier clarification. Do not include PINs or passwords." />
            <Button type="button" variant="outline" disabled={busy || !note.trim()} onClick={() => work(async () => { await invoke("note", { campaign_id: state.campaign?.id, execution_id: selected.id, note }); setNote(""); await refresh(); })}>Save observation</Button>
            {(selected.lesaka_uat_notes || []).map(item => <p key={item.id} className="rounded border border-white/10 p-2 text-xs">{item.note}</p>)}
            <details><summary className="cursor-pointer text-sm">View captured request/response evidence</summary><pre className="mt-2 whitespace-pre-wrap break-all text-xs">{JSON.stringify(selected.evidence, null, 2)}</pre></details>
          </> : <p className="text-sm text-white/65">This case has not run in this cycle.</p>}
        </div>
      </div>
)}
      <details open={view !== "customer"}><summary className="cursor-pointer font-semibold">Cycle {cycle} checklist — all workbook and website cases</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Case</th><th className="p-2">Scenario</th><th className="p-2">Result</th><th className="p-2">Action</th></tr></thead><tbody>{LESAKA_UAT_CASES.map(item => { const result = latest.get(`${cycle}:${item.id}`); return <tr key={item.id} className="border-t border-white/10"><td className="whitespace-nowrap p-2">{item.id}</td><td className="p-2">{item.title}</td><td className={`p-2 ${colour(result?.verdict || "pending")}`}>{label(result?.verdict || "pending")}</td><td className="p-2"><button type="button" className="underline" disabled={busy} onClick={() => { setView("manual"); setCaseId(item.id); setPin(""); setConfirmed(false); }}>Select</button></td></tr>; })}</tbody></table></div></details>
      <details><summary className="cursor-pointer text-sm">All executions and earlier attempts ({state.executions.length})</summary><ul className="mt-2 space-y-2 text-xs">{state.executions.filter(item => item.cycle === cycle).map(item => <li key={item.id} className="break-all rounded border border-white/10 p-2">{item.case_id} · {label(item.verdict)} · {item.client_reference} · {item.reason}</li>)}</ul></details>
      <details className="rounded border border-white/15 p-3"><summary className="cursor-pointer text-sm">After testing: export and remove this business's test results</summary><p className="my-3 text-sm text-white/70">Download Excel and full evidence first. Stop customer testing before cleanup. Cleanup removes this campaign's test results and voucher inventory, and closes its test checkouts. They stay excluded from live payments. Running or uncertain outcomes must be resolved first.</p><Button type="button" variant="outline" disabled={busy||activeCheckout||!exported} onClick={()=>{if(window.confirm('Delete this business’s current Lesaka test campaign? Confirm that you have downloaded the evidence.'))void work(async()=>{await invoke('purge',{campaign_id:state.campaign?.id,confirm:state.campaign?.id,exported:true});await refresh();});}}>Delete exported test results</Button></details>
    </>}
  </section>;
}
