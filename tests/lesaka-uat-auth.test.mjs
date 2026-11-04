import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const merchant='00000000-1986-0026-0000-000000000001',campaign=crypto.randomUUID();
const environment={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SUPABASE_ANON_KEY:'anon',LESAKA_UAT_ENABLED:'true',LESAKA_4ALL_ENVIRONMENT:'staging',LESAKA_UAT_MERCHANT_ID:merchant,LESAKA_CREDENTIALS_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),LESAKA_4ALL_FINGERPRINT_SECRET:'test-fingerprint-secret-with-32-characters'};
let handler,allowed=true,imported=null,writes=0;
const admin={from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},range(){return q},async maybeSingle(){return{data:table==='lesaka_merchant_credentials'?{credential_version:'version',encrypted_credentials:{ciphertext:'secret-cipher'},store_id:null}:table==='lesaka_uat_campaigns'?{id:campaign,merchant_id:merchant,credential_version:'version',inventory_sha256:null}:null,error:null}},then(a,b){return Promise.resolve({data:[],error:null}).then(a,b)}};return q},async rpc(name,args){writes++;imported={name,args};return{error:null}}};
globalThis.__uatAdmin=admin;globalThis.__uatCaller={auth:{async getUser(token){return{data:{user:token==='owner-token'?{id:crypto.randomUUID()}:null},error:null}}},async rpc(){return{data:allowed,error:null}}};
globalThis.Deno={env:{get:k=>environment[k]},serve:fn=>handler=fn};
let source=readFileSync(new URL('../supabase/functions/lesaka-uat/index.ts',import.meta.url),'utf8').replace('import { createClient } from "npm:@supabase/supabase-js@2.39.3";','const createClient=(_url,key)=>key==="server-secret"?globalThis.__uatAdmin:globalThis.__uatCaller;');
for(const file of ['lesaka-credential-storage','lesaka-4all','lesaka-uat','lesaka-uat-store','lesaka-uat-runner','lesaka-uat-inspect','lesaka-integration-mode'])source=source.replace('"../_shared/'+file+'.ts"',JSON.stringify(new URL('../supabase/functions/_shared/'+file+'.ts',import.meta.url).href));
await import('data:text/javascript;base64,'+Buffer.from(transformSync(source,{loader:'ts',format:'esm'}).code).toString('base64'));
async function invoke(body={},token='owner-token'){
 const result=await handler(new Request('https://example.test/lesaka-uat',{method:'POST',headers:{Authorization:token?'Bearer '+token:'','Content-Type':'application/json'},body:JSON.stringify({action:'status',merchant_id:merchant,...body})}));return{http:result.status,body:await result.json()};
}
test('recorder requires a real user and API permission, not merely a publishable key',async()=>{
 assert.equal((await invoke({},'')).http,401);assert.equal((await invoke({},'anon')).http,401);allowed=false;assert.equal((await invoke()).http,403);allowed=true;
 const result=await invoke();assert.equal(result.http,200);assert.equal(result.body.enabled,true);assert(!JSON.stringify(result.body).includes('secret-cipher'));assert.equal(writes,0);
});
test('staging and the configured merchant allow-list gate all mutation actions',async()=>{
 environment.LESAKA_4ALL_ENVIRONMENT='production';assert.equal((await invoke({action:'run'},'server-secret')).http,403);assert.equal((await invoke({},'server-secret')).body.enabled,false);environment.LESAKA_4ALL_ENVIRONMENT='staging';
 assert.equal((await invoke({action:'run',merchant_id:crypto.randomUUID()},'anon')).http,401);assert.equal(writes,0);
});
test('inventory source hash is mandatory, and manual PINs never enter database import arguments',async()=>{
 const raw='4ALL Voucher N$10\nSerial Number, PIN\n012345678901, 0123456789012345\n012345678902, 0123456789012346\n';
 const file_base64=Buffer.from(raw).toString('base64');
 assert.equal((await invoke({action:'import',file_base64},'server-secret')).http,409);assert.equal(writes,0);
 const digest=await crypto.subtle.digest('SHA-256',Buffer.from(raw));environment.LESAKA_UAT_INVENTORY_SHA256=Buffer.from(digest).toString('hex');
 assert.equal((await invoke({action:'import',file_base64},'server-secret')).http,200);assert.equal(imported.name,'import_lesaka_uat_inventory');
 const items=imported.args.p_items;assert.equal(items[0].allocation,'automated');assert(items[0].encrypted_pin.ciphertext);assert.equal(items[1].allocation,'manual');assert.equal(items[1].encrypted_pin,null);
 const json=JSON.stringify(items);assert(!json.includes('0123456789012345'));assert(!json.includes('0123456789012346'));
});

test('technical endpoint refuses real voucher-redemption case IDs',async()=>{
 const result=await invoke({action:'technical_step',case_id:'TC-VR-001',cycle:2,execution_id:crypto.randomUUID()},'server-secret');
 assert.equal(result.http,400);assert.match(result.body.error,/serial enquiry or controlled invalid-input/);
});
