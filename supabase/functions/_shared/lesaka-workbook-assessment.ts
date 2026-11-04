import type { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { LESAKA_UAT_CASES, WORKBOOK_CASE_IDS, evaluateUat } from "./lesaka-uat.ts";
import type { Evidence, Execution, Fixture } from "./lesaka-uat-store.ts";
type Recorded = Execution & { origin?:string;customer_attempt_id?:string;source_execution_id?:string;assessment_history?:unknown[] };
function redemptionFor(run:Recorded,history:Recorded[],inventory:Fixture[]) {
 const expected=inventory.find(item=>item.id===run.fixture_id)?.value_minor;if(expected===undefined)return undefined;
 for(const source of history.filter(row=>row.fixture_id&&row.fixture_id===run.fixture_id))for(const call of source.evidence||[]){
  if(call.operation!=="redeem"||call.http_status!==200)continue;
  const test=LESAKA_UAT_CASES.find(item=>item.id==="TC-VR-001")!;
  if(evaluateUat({...test,amountMinor:undefined},200,call.response,call.client_reference,expected).verdict==="pass")return {time:call.finished_at||call.requested_at,reference:call.client_reference};
 }
 return undefined;
}
function assess(run:Recorded,history:Recorded[],inventory:Fixture[]) {
 const test=LESAKA_UAT_CASES.find(item=>item.id===run.case_id),call=run.evidence?.filter(item=>item.operation===test?.operation).at(-1);
 if(!test||!call||!call.finished_at||run.verdict==="running")return null;
 const fixture=inventory.find(item=>item.id===run.fixture_id);
 if(test.precondition){const preflight=run.evidence.find(item=>item.operation==="status"&&item.http_status===200);
  if(test.precondition!=="Unsupported"&&preflight?.response.status!==test.precondition)return null;
 }
 return evaluateUat(test,call.http_status,call.response,call.client_reference,test.amountMinor??fixture?.value_minor,redemptionFor(run,history,inventory));
}
async function projectionId(value:string){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))).slice(0,16);bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export async function reconcileWorkbookEvidence(admin:SupabaseClient,campaign:string,rows:Recorded[],inventory:Fixture[]) {
 const result=[...rows],known=new Set(rows.map(row=>row.id));
 // Reassess saved responses only. This function never contacts the provider.
 for(const run of rows){
  const assessed=assess(run,rows,inventory);if(!assessed||assessed.verdict===run.verdict&&assessed.reason===run.reason)continue;
  const history=[...(run.assessment_history||[]),{verdict:run.verdict,reason:run.reason,reassessed_at:new Date().toISOString(),basis:"Supplier Excel workbook v1.0"}].slice(-10);
  const update=await admin.from("lesaka_uat_executions").update({...assessed,assessment_history:history}).eq("id",run.id).eq("campaign_id",campaign).eq("verdict",run.verdict);
  if(update.error)throw update.error;
  if(run.verdict==="uncertain"&&assessed.verdict!=="uncertain"){const release=await admin.from("lesaka_uat_inventory").update({locked_by:null}).eq("campaign_id",campaign).eq("locked_by",run.id);if(release.error)throw release.error;}
  Object.assign(run,assessed,{assessment_history:history});
 }
 // Translate actual recorded calls into the supplier's case IDs, keeping their source.
 for(const source of rows.filter(row=>!row.source_execution_id&&row.verdict!=="running"))for(const call of source.evidence||[]){
  const request=call.request as Record<string,unknown>,data=call.response,amount=data.totalAmount as {minor?:number}|undefined;
  let id:string|undefined;
  if(call.operation==="status"&&call.http_status===200){
   if(data.status==="Active")id=request.serialNumber?"TC-VS-002":"TC-VS-001";
   else if(data.status==="Consumed")id="TC-VS-003";
   else if(data.status==="Reversed")id="TC-VS-004";
   else if(data.status==="Expired")id="TC-VS-005";
  }else if(call.operation==="redeem"&&call.http_status===200&&data.remainingAmount===0){id=amount?.minor===1000?"TC-VR-001":amount?.minor===100000?"TC-VR-002":undefined;}
  else if(call.operation==="redeem"){
   const pre=source.evidence.find(e=>e.operation==="status"&&e.http_status===200)?.response.status;
   id=pre==="Consumed"?"TC-VR-003":pre==="Expired"?"TC-VR-004":pre==="Reversed"?"TC-VR-005":undefined;
  }
  if(!id||!WORKBOOK_CASE_IDS.has(id)||id===source.case_id)continue;
  const key=await projectionId(`${source.id}:${id}:${call.client_reference}`);if(known.has(key))continue;
  const related=source.customer_attempt_id?rows.filter(row=>row.customer_attempt_id===source.customer_attempt_id&&!row.source_execution_id).flatMap(row=>row.evidence):source.evidence;
  const joined=Array.from(new Map(related.map(item=>[`${item.operation}:${item.client_reference}`,item])).values()).sort((a,b)=>a.requested_at.localeCompare(b.requested_at));
  const projection={...source,id:key,case_id:id,client_reference:call.client_reference,request_time:call.requested_at,started_at:call.requested_at,completed_at:call.finished_at,evidence:call.operation==="redeem"?joined:[call],source_execution_id:source.id,assessment_history:[]} as Recorded;
  const assessed=assess(projection,rows,inventory);if(!assessed||assessed.verdict!=="pass")continue;
  Object.assign(projection,assessed);
  const {lesaka_uat_notes:_,...stored}=projection as Recorded & {lesaka_uat_notes?:unknown};
  void _;
  const inserted=await admin.from("lesaka_uat_executions").upsert(stored,{onConflict:"id"});if(inserted.error)throw inserted.error;
  known.add(key);result.push(projection);
 }
 return result.sort((a,b)=>a.started_at.localeCompare(b.started_at)||a.id.localeCompare(b.id));
}
