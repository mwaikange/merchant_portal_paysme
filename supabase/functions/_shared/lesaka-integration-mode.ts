import type { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { LesakaError } from "./lesaka-4all.ts";
export type LesakaEnv = (key: string) => string | undefined;
export async function merchantLesakaEnv(admin: SupabaseClient, merchantId: string, env: LesakaEnv) {
 const {data,error}=await admin.from("lesaka_integration_modes").select("environment,production_approved_at,uat_completed_at,approval_reference,inventory_source_sha256").eq("merchant_id",merchantId).maybeSingle();
 if(error)throw new LesakaError("Lesaka settings could not be checked.",503);
 const environment=data?.environment || env("LESAKA_4ALL_ENVIRONMENT");
 if(environment==="production"&&data&&!data.production_approved_at)throw new LesakaError("Lesaka approval is required.",503);
 return {environment,uatCompleted:Boolean(data?.uat_completed_at||data?.production_approved_at),approvalReference:data?.approval_reference||"",inventoryHash:data?.inventory_source_sha256,env:(key:string)=>key==="LESAKA_4ALL_ENVIRONMENT"?environment:key==="LESAKA_4ALL_UAT_APPROVED"&&environment==="production"&&data?.production_approved_at?"true":env(key)};
}
export async function customerUatSession(admin:SupabaseClient,merchantId:string,version:string,env:LesakaEnv) {
 if(env("LESAKA_UAT_ENABLED")!=="true"||env("LESAKA_UAT_CUSTOMER_CHECKOUT_ENABLED")!=="true"||env("LESAKA_4ALL_ENVIRONMENT")!=="staging")return null;
 const {data,error}=await admin.from("lesaka_uat_campaigns").select("*").eq("merchant_id",merchantId).eq("credential_version",version).maybeSingle();
 if(error)throw new LesakaError("Checkout testing could not be checked.",503);
 return data&&data.inventory_sha256&&data.customer_cycle>=1&&data.customer_cycle<=3&&Date.parse(data.customer_until)>Date.now()?data:null;
}
