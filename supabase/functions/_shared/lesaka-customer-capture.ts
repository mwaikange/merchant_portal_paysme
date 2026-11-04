import type { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { LesakaError, pinFingerprint, verifyVoucher } from "./lesaka-4all.ts";
import { scrubUat } from "./lesaka-uat.ts";
import { uuid, type Evidence } from "./lesaka-uat-store.ts";
export async function beginCustomerCapture(admin:SupabaseClient, session:{id:string;customer_cycle:number}, transaction:{transaction_id:string;merchant_id:string;generated_code:string;amount:string|number}, pin:string, credentials:{api_username:string;api_password:string}, fingerprintSecret:string, hosted:boolean) {
 const fingerprint=await pinFingerprint(pin,fingerprintSecret);
 const found=await admin.from("lesaka_uat_inventory").select("id,fixture_id,serial_number,value_minor,observed_state").eq("campaign_id",session.id).eq("pin_fingerprint",fingerprint).maybeSingle();
 if(found.error)throw new LesakaError("Test voucher matching is unavailable. Try again.",503);
 const earlier=await admin.from("lesaka_uat_customer_attempts").select("cycle,campaign_id").eq("transaction_id",transaction.transaction_id).order("created_at",{ascending:true}).limit(1).maybeSingle();
 if(earlier.error)throw new LesakaError("Test recording is unavailable. Try again.",503);
 if(earlier.data&&earlier.data.campaign_id!==session.id)throw new LesakaError("Create a new checkout for the current test campaign.",409);
 const inserted=await admin.from("lesaka_uat_customer_attempts").insert({campaign_id:session.id,merchant_id:transaction.merchant_id,cycle:earlier.data?.cycle||session.customer_cycle,transaction_id:transaction.transaction_id,generated_code:transaction.generated_code,channel:hosted?"hosted":"sdk",fixture_id:found.data?.id||null}).select("*").single();
 if(inserted.error)throw new LesakaError("Test recording could not start. Try again.",503);
 const row=inserted.data, evidence:Evidence[]=[], secrets=[pin,credentials.api_username,credentials.api_password];
 const save=async(extra:Record<string,unknown>={})=>{const r=await admin.from("lesaka_uat_customer_attempts").update({evidence,...extra}).eq("id",row.id);if(r.error)throw new LesakaError("Test recording needs verification. Retry the same voucher for this checkout.",503,"lesaka_outcome_unknown");};
 const transport:typeof fetch=async(input,init)=>{
  const url=String(input);if(!/^https:\/\/staging\.bridge\.lesaka\.tech\/virtual-products\/api\/v2\/voucher\/(status|redeem)$/.test(url)||init?.method!=="POST")throw new LesakaError("Test endpoint is unavailable.",503);
  const payload=JSON.parse(String(init.body));
  const call:Evidence={operation:url.endsWith("/redeem")?"redeem":"status",client_reference:payload.clientReference,requested_at:new Date().toISOString(),finished_at:null,http_status:0,request:scrubUat({...payload,pin_length:typeof payload.pin==="string"?payload.pin.length:undefined},secrets),response:{pending:true}};
  evidence.push(call);await save();
  try{const response=await fetch(input,init);call.http_status=response.status;const data=await response.clone().json().catch(()=>({error:"Unexpected provider response format."}));call.response=scrubUat(data,secrets) as Record<string,unknown>;call.finished_at=new Date().toISOString();await save();return response;}
  catch(error){call.response={error:"Provider response or evidence could not be confirmed. Retry the same voucher."};call.finished_at=new Date().toISOString();await save();throw error;}
 };
 const finish=async(outcome:string,message:string)=>{
  await save({outcome,message:scrubUat(message,secrets),completed_at:new Date().toISOString()});
  if(outcome==="tested") {
    const resolved=await admin.from("lesaka_uat_customer_attempts").update({outcome:"resolved",message:`Resolved by successful checkout retry ${row.id}. Original evidence retained.`,completed_at:new Date().toISOString()}).eq("transaction_id",transaction.transaction_id).neq("id",row.id).in("outcome",["uncertain","running"]);
    if(resolved.error)throw new LesakaError("The test completed but retry history needs review.",503,"lesaka_outcome_unknown");
  }
  // These are projections of actual calls, never fabricated API scenarios.
  for(const call of evidence){
   let caseId:string|null=null;
   if(call.http_status===200&&call.response.clientReference===call.client_reference){
    if(call.operation==="redeem"&&outcome==="tested") {try{verifyVoucher(call.response,call.client_reference,Math.round(Number(transaction.amount)*100),true);caseId="TC-RED-01";}catch{/* Unverified receipt cannot pass. */}}
    if(call.operation==="status"&&call.response.totalAmount&&found.data){
     const amount=call.response.totalAmount as {currency:string;minor:number};
     if(amount.currency==="NAD"&&amount.minor===found.data.value_minor&&uuid(call.response.id)&&Number.isSafeInteger(call.response.remainingAmount)&&Number(call.response.remainingAmount)>=0&&Number(call.response.remainingAmount)<=found.data.value_minor){
      if(call.response.status==="Active"){try{verifyVoucher(call.response,call.client_reference,found.data.value_minor);caseId=(call.request as Record<string,unknown>).serialNumber?"TC-STAT-02":"TC-STAT-01";}catch{/* Invalid state or expiry. */}}
      if(call.response.status==="Expired")caseId="TC-STAT-03";
      if(call.response.status==="Cancelled")caseId="TC-STAT-04";
     }
    }
   }
   if(caseId){const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(row.id+caseId))).slice(0,16);digest[6]=(digest[6]&15)|128;digest[8]=(digest[8]&63)|128;const hex=Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    const r=await admin.from("lesaka_uat_executions").upsert({id,campaign_id:session.id,cycle:row.cycle,case_id:caseId,fixture_id:found.data?.id||null,actor_kind:"manual",origin:"checkout",customer_attempt_id:row.id,client_reference:call.client_reference,request_time:call.requested_at,started_at:call.requested_at,completed_at:call.finished_at,verdict:"pass",reason:"Verified during the customer checkout flow.",evidence:[call]},{onConflict:"id"});if(r.error)throw new LesakaError("Test outcome was recorded; its checklist needs review.",503,"lesaka_outcome_unknown");
   }
  }
 };
 return {fixture:found.data,transport,finish,hasRedemption:()=>evidence.some(e=>e.operation==="redeem"),requireFixture:()=>{if(!found.data)throw new LesakaError("Use a voucher supplied for this PaySME test.",409,"lesaka_test_voucher_required");}};
}
export type CustomerCapture=Awaited<ReturnType<typeof beginCustomerCapture>>;
export async function recordCustomerResponse(capture:CustomerCapture|null,operation:()=>Promise<Response>){
 if(!capture)return await operation();
 try{const response=await operation();const data=await response.clone().json().catch(()=>({}));await capture.finish(data.status==="tested"?"tested":response.status>=500?(capture.hasRedemption()?"uncertain":"error"):"rejected",data.error||"Test voucher payment verified. No live payment was settled.");return response;}
 catch(error){const known=error instanceof LesakaError?error:null;await capture.finish(!known||known.status>=500?(capture.hasRedemption()?"uncertain":"error"):"rejected",known?.message||"Test payment needs verification. Retry the same voucher.");throw error;}
}
