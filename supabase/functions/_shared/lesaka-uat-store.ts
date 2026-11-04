import type { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import type { Verdict } from "./lesaka-uat.ts";
export type Campaign = { id: string; merchant_id: string; credential_version: string; inventory_sha256: string | null; created_at: string; title: string };
export type Fixture = { id: string; campaign_id: string; fixture_id: string; allocation: "automated" | "manual"; value_minor: number; serial_number: string; pin_fingerprint: string; encrypted_pin: { iv: string; ciphertext: string } | null; source_line: number; observed_state: string | null; locked_by: string | null };
export type Evidence = { operation: string; client_reference: string; requested_at: string; finished_at: string | null; http_status: number; request: unknown; response: Record<string, unknown> };
export type Execution = { id: string; campaign_id: string; cycle: number; case_id: string; fixture_id: string | null; actor_kind: string; client_reference: string; request_time: string; started_at: string; lease_time: string; redemption_started: boolean; verdict: Verdict; reason: string; evidence: Evidence[]; replay_of: string | null };
export type Env = (key: string) => string;
export const now = () => new Date().toISOString();
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
export class UatError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
async function pinKey(env: Env) {
  try {
    const key = Uint8Array.from(atob(env("LESAKA_CREDENTIALS_ENCRYPTION_KEY")), ch => ch.charCodeAt(0));
    if (key.length !== 32) throw new Error();
    return await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch { throw new UatError("UAT encryption is unavailable.", 503); }
}
const aad = (campaign: Campaign, fixture: string) => new TextEncoder().encode(JSON.stringify(["lesaka-uat-pin-v1", campaign.merchant_id, campaign.id, fixture]));
export async function encryptUatPin(pin: string, campaign: Campaign, fixture: string, env: Env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(campaign, fixture) }, await pinKey(env), new TextEncoder().encode(pin));
  return { iv: btoa(String.fromCharCode(...iv)), ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))) };
}
export async function decryptUatPin(fixture: Fixture, campaign: Campaign, env: Env) {
  if (!fixture.encrypted_pin) throw new UatError("Enter this manual voucher's PIN.");
  const decode = (s: string) => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(fixture.encrypted_pin.iv), additionalData: aad(campaign, fixture.fixture_id) }, await pinKey(env), decode(fixture.encrypted_pin.ciphertext)));
  } catch { throw new UatError("This allocated voucher could not be loaded.", 503); }
}
export async function uatState(admin: SupabaseClient, campaign: Campaign | null) {
  if (!campaign) return { campaign: null, inventory: [], executions: [] };
  const result = await admin.from("lesaka_uat_inventory").select("id,fixture_id,value_minor,serial_number,allocation,source_line,observed_state,locked_by").eq("campaign_id", campaign.id).order("source_line");
  if (result.error) throw result.error;
  const customers: unknown[] = [];
  for (let offset=0;offset<10000;offset+=500) {
    const page=await admin.from("lesaka_uat_customer_attempts").select("*").eq("campaign_id",campaign.id).order("created_at",{ascending:true}).range(offset,offset+499);
    if(page.error)throw page.error;
    customers.push(...(page.data||[]));
    if((page.data||[]).length<500)break;
    if(offset===9500)throw new UatError("Customer test export exceeds its limit.",409);
  }
  const executions: unknown[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const page = await admin.from("lesaka_uat_executions").select("*,lesaka_uat_notes(*)").eq("campaign_id", campaign.id).order("started_at", { ascending: true }).order("id").range(offset, offset + 499);
    if (page.error) throw page.error;
    executions.push(...(page.data || []));
    if ((page.data || []).length < 500) return { campaign, inventory: result.data || [], executions, customer_attempts: customers };
  }
  throw new UatError("Campaign exceeds the evidence export limit. Contact PaySME support.", 409);
}
