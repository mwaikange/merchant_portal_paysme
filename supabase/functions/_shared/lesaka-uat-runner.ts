import type { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { decryptLesakaCredentials } from "./lesaka-credential-storage.ts";
import { pinFingerprint } from "./lesaka-4all.ts";
import { LESAKA_UAT_CASES, evaluateUat, needsFixture, scrubUat, uatRequest, type Verdict } from "./lesaka-uat.ts";
import { decryptUatPin, now, uuid, UatError, type Campaign, type Evidence, type Execution, type Fixture, type Env } from "./lesaka-uat-store.ts";
type Setup = { encrypted_credentials: Parameters<typeof decryptLesakaCredentials>[0]; store_id: string | null };
type Context = { admin: SupabaseClient; campaign: Campaign; setup: Setup; userId: string | null; service: boolean; env: Env; transport?: typeof fetch };
export async function runUat(body: Record<string, unknown>, context: Context) {
  const { admin, campaign, setup, userId, service, env } = context;
  if (env("LESAKA_4ALL_ENVIRONMENT") !== "staging") throw new UatError("UAT only runs in staging.", 403);
  const test = LESAKA_UAT_CASES.find(item => item.id === body.case_id), cycle = Number(body.cycle);
  if (!test || !Number.isInteger(cycle) || cycle < 1 || cycle > 3 || !uuid(body.execution_id)) throw new UatError("Select a valid case and cycle.");
  const mode = service || body.mode === "automated" ? "automated" : "manual";
  const unavailable = body.fixture_unavailable === true && needsFixture(test);
  let fixture: Fixture | null = null;
  if (needsFixture(test) && !test.blocked && !unavailable) {
    if (!uuid(body.fixture_id)) throw new UatError("Choose a voucher.");
    const result = await admin.from("lesaka_uat_inventory").select("*").eq("id", body.fixture_id).eq("campaign_id", campaign.id).maybeSingle();
    if (result.error) throw result.error;
    fixture = result.data as Fixture | null;
    if (!fixture) throw new UatError("Voucher is not in this campaign's allocation.", 404);
    if (mode === "automated" && fixture.allocation !== "automated") throw new UatError("That voucher is reserved for the user's manual tests.", 403);
    if (test.amountMinor && fixture.value_minor !== test.amountMinor) throw new UatError("Choose the voucher value required by this case.");
  }
  const previous = await admin.from("lesaka_uat_executions").select("*").eq("id", body.execution_id).maybeSingle();
  if (previous.error) throw previous.error;
  let execution = previous.data as Execution | null;
  if (execution && (execution.campaign_id !== campaign.id || execution.cycle !== cycle || execution.case_id !== test.id || execution.fixture_id !== (fixture?.id || null) || execution.actor_kind !== mode)) throw new UatError("Execution identity cannot be reassigned.", 409);
  if (execution && !["running", "uncertain", "error"].includes(execution.verdict)) return execution;
  if (execution?.verdict === "running" && Date.now() - Date.parse(execution.lease_time) < 120000) throw new UatError("This execution is still running. Wait before retrying.", 409);
  if (test.operation === "redeem" && !test.blocked && body.confirm_redemption !== true) throw new UatError("Confirm this intended staging redemption.");
  const credentials = await decryptLesakaCredentials(setup.encrypted_credentials, campaign.merchant_id, "staging", env);
  let pin = "";
  if (fixture) {
    pin = fixture.allocation === "automated" ? await decryptUatPin(fixture, campaign, env) : String(body.pin || "").replace(/[\s-]/g, "");
    if (test.input !== "serial" && (!/^\d{16}$/.test(pin) || await pinFingerprint(pin, env("LESAKA_4ALL_FINGERPRINT_SECRET")) !== fixture.pin_fingerprint)) throw new UatError("PIN does not match the selected voucher.");
  }
  let replay: Execution | null = null;
  if (test.input === "replay") {
    if (!uuid(body.replay_of)) throw new UatError("Choose a successful redemption from this cycle.");
    const result = await admin.from("lesaka_uat_executions").select("*").eq("id", body.replay_of).eq("campaign_id", campaign.id).eq("cycle", cycle).eq("fixture_id", fixture!.id).maybeSingle();
    replay = result.data as Execution | null;
    if (result.error || !replay || replay.case_id === "TC-EDGE-01" || !replay.evidence.some(call => call.operation === "redeem" && call.http_status === 200 && call.response.remainingAmount === 0)) throw new UatError("Choose a verified full redemption of this voucher in this cycle.");
    if (execution && execution.replay_of !== replay.id) throw new UatError("Replay source cannot change.", 409);
  }
  if (execution) {
    const claim = await admin.from("lesaka_uat_executions").update({ verdict: "running", lease_time: now(), completed_at: null }).eq("id", execution.id).eq("lease_time", execution.lease_time).select("*").maybeSingle();
    if (claim.error || !claim.data) throw new UatError("Another execution is active. Reload before continuing.", 409);
    execution = claim.data as Execution;
  } else {
    const inserted = await admin.from("lesaka_uat_executions").insert({ id: body.execution_id, campaign_id: campaign.id, cycle, case_id: test.id, fixture_id: fixture?.id || null, actor_kind: mode, actor_user_id: userId, client_reference: replay?.client_reference || crypto.randomUUID(), request_time: replay?.request_time || now(), verdict: "running", replay_of: replay?.id || null }).select("*").single();
    if (inserted.error) throw new UatError("Another execution is active or this request already exists. Reload before continuing.", 409);
    execution = inserted.data as Execution;
  }
  const run = execution!;
  const evidence: Evidence[] = [...(run.evidence || [])], secrets = [pin, credentials.api_username, credentials.api_password];
  let locked = false;
  const finish = async (verdict: Verdict, reason: string) => {
    const result = await admin.from("lesaka_uat_executions").update({ verdict, reason: scrubUat(reason, secrets), evidence, completed_at: now() }).eq("id", run.id).select("*").single();
    if (result.error) throw new UatError("Evidence could not be finalized. Keep the original execution ID.", 503);
    if (locked && verdict !== "uncertain") await admin.from("lesaka_uat_inventory").update({ locked_by: null }).eq("id", fixture!.id).eq("locked_by", run.id);
    console.log(JSON.stringify({ event: "lesaka_uat_execution", campaign: campaign.id, execution: run.id, case: test.id, cycle, verdict, reference: run.client_reference }));
    return result.data;
  };
  const persistEvidence = async () => {
    const saved = await admin.from("lesaka_uat_executions").update({ evidence }).eq("id", run.id);
    if (saved.error) throw new UatError("Evidence could not be saved. Keep this original execution ID.", 503);
  };
  const call = async (operation: "status" | "redeem", payload: Record<string, unknown>): Promise<Evidence> => {
    const record: Evidence = { operation, client_reference: String(payload.clientReference || "[OMITTED FOR TEST]"), requested_at: now(), finished_at: null, http_status: 0, request: { ...(scrubUat(payload, secrets) as Record<string, unknown>), ...(typeof payload.pin === "string" ? { pin_length: payload.pin.length } : {}) }, response: { pending: true } };
    evidence.push(record);
    await persistEvidence();
    let code = 0, response: Record<string, unknown> = {};
    try {
      const auth = new TextEncoder().encode(`${credentials.api_username}:${credentials.api_password}`);
      const result = await (context.transport || fetch)(`https://staging.bridge.lesaka.tech/virtual-products/api/v2/voucher/${operation}`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Basic ${btoa(String.fromCharCode(...auth))}` }, body: JSON.stringify(payload) });
      code = result.status;
      const parsed = await result.json().catch(() => null);
      response = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { error: "Provider returned an unexpected response format." };
    } catch { response = { error: "Connection timed out or response was unavailable." }; }
    Object.assign(record, { finished_at: now(), http_status: code, response: scrubUat(response, secrets) });
    await persistEvidence();
    return { ...record, response };
  };
  if (test.blocked) return await finish("blocked", test.blocked);
  if (unavailable) return await finish("blocked", "A matching voucher or original redemption is not available for this case. No provider request was made.");
  if (fixture && test.operation === "redeem") {
    if (fixture.locked_by && fixture.locked_by !== run.id) return await finish("blocked", "Voucher has an unresolved redemption. Resume its original execution first.");
    if (!fixture.locked_by) {
      const lease = await admin.from("lesaka_uat_inventory").update({ locked_by: run.id }).eq("id", fixture.id).is("locked_by", null).select("id").maybeSingle();
      if (lease.error || !lease.data) return await finish("blocked", "Another execution owns this voucher.");
    }
    locked = true;
  }
  if (fixture && test.operation === "redeem" && test.input !== "replay" && !run.redemption_started) {
    let preflight: Evidence;
    try { preflight = await call("status", { pin, clientReference: crypto.randomUUID(), requestTime: now(), ...(setup.store_id ? { storeId: setup.store_id } : {}) }); }
    catch { return await finish("error", "Preflight evidence could not be saved. No redemption was sent."); }
    if (test.precondition === "Unsupported") {
      if (Number(preflight.response.errorCode) !== 5006) return await finish("blocked", "A supplier-confirmed unsupported-product fixture is required. No redemption was sent.");
    } else {
      if (preflight.http_status !== 200) return await finish("blocked", "Could not verify the voucher's required state. No redemption was sent.");
      const actual = preflight.response.status;
      await admin.from("lesaka_uat_inventory").update({ observed_state: String(actual || "Unknown") }).eq("id", fixture.id);
      if (actual !== test.precondition) return await finish("blocked", `This case needs ${test.precondition}; the selected voucher is ${String(actual)}. No redemption was sent.`);
      const amount = preflight.response.totalAmount as { currency?: string; minor?: number } | undefined;
      if (amount?.currency !== "NAD" || amount.minor !== fixture.value_minor) return await finish("blocked", "Voucher does not match its allocated NAD value. No redemption was sent.");
      if (test.precondition === "Active" && (preflight.response.remainingAmount !== fixture.value_minor || !Number.isFinite(Date.parse(String(preflight.response.expiryDate))) || Date.parse(String(preflight.response.expiryDate)) <= Date.now())) return await finish("blocked", "Voucher balance or expiry is unsuitable for a full-value redemption. No redemption was sent.");
    }
  }
  const payload = uatRequest(test, fixture ? { pin, serial_number: fixture.serial_number } : null, run.client_reference, run.request_time, setup.store_id || undefined);
  if (test.operation === "redeem" && !run.redemption_started) {
    const marked = await admin.from("lesaka_uat_executions").update({ redemption_started: true }).eq("id", run.id);
    if (marked.error) return await finish("error", "Could not record the redemption intention. No redemption was sent.");
    run.redemption_started = true;
  }
  let outcome: Evidence;
  try { outcome = await call(test.operation, payload); }
  catch { return await finish(test.operation === "redeem" ? "uncertain" : "error", "Provider evidence could not be durably captured. Resume this original execution; do not create a replacement redemption."); }
  const checked = evaluateUat(test, outcome.http_status, outcome.response, run.client_reference, test.amountMinor ?? fixture?.value_minor);
  if (fixture && test.operation === "status" && outcome.http_status === 200) await admin.from("lesaka_uat_inventory").update({ observed_state: String(outcome.response.status || "Unknown") }).eq("id", fixture.id);
  if (fixture && test.operation === "redeem" && outcome.http_status === 200) {
    await admin.from("lesaka_uat_inventory").update({ observed_state: checked.verdict === "pass" ? "Consumed" : "Unknown" }).eq("id", fixture.id);
    if (checked.verdict !== "pass") return await finish("uncertain", checked.reason);
    if (replay) {
      const original = replay.evidence.find(item => item.operation === "redeem" && item.http_status === 200);
      if (outcome.response.id !== original?.response.id) return await finish("review", "Replay returned a different provider transaction ID. Do not use a new reference.");
    }
    let balance: Evidence;
    try { balance = await call("status", { pin, clientReference: crypto.randomUUID(), requestTime: now(), ...(setup.store_id ? { storeId: setup.store_id } : {}) }); }
    catch { return await finish("uncertain", "Redemption returned success but its follow-up evidence could not be captured. Keep the original reference."); }
    if (balance.http_status !== 200 || balance.response.remainingAmount !== 0 || balance.response.status !== "Consumed") return await finish("review", "Redemption receipt captured, but the follow-up zero/Consumed state needs supplier review.");
  }
  if (fixture && test.id === "TC-STAT-02" && checked.verdict === "pass") {
    const candidates = await admin.from("lesaka_uat_executions").select("evidence").eq("campaign_id", campaign.id).eq("cycle", cycle).eq("fixture_id", fixture.id).in("case_id", ["TC-VS-001", "TC-STAT-01"]);
    const prior = (candidates.data || []).flatMap(item => item.evidence as Evidence[]).find(item => item.operation === "status" && item.http_status === 200 && item.response.status === "Active");
    const amount = outcome.response.totalAmount as { minor: number; currency: string };
    const original = prior?.response.totalAmount as { minor?: number; currency?: string } | undefined;
    if (candidates.error || !prior || original?.minor !== amount.minor || original.currency !== amount.currency || prior.response.remainingAmount !== outcome.response.remainingAmount) return await finish("review", "Run the active PIN status case for this same voucher and cycle, then compare the serial result.");
  }
  return await finish(checked.verdict, checked.reason);
}
