import test from 'node:test';
import assert from 'node:assert/strict';
import {LESAKA_UAT_CASES,parseUatInventory,uatRequest,scrubUat,evaluateUat} from '../supabase/functions/_shared/lesaka-uat.ts';
import {encryptUatPin,decryptUatPin} from '../supabase/functions/_shared/lesaka-uat-store.ts';
import {encryptLesakaCredentials} from '../supabase/functions/_shared/lesaka-credential-storage.ts';
import {pinFingerprint} from '../supabase/functions/_shared/lesaka-4all.ts';
import {runUat} from '../supabase/functions/_shared/lesaka-uat-runner.ts';
const merchant='00000000-1986-0026-0000-000000000001', campaignId=crypto.randomUUID(), fixtureId=crypto.randomUUID();
const pin='0123456789012345', serial='012345678901';
const environment={LESAKA_4ALL_ENVIRONMENT:'staging',LESAKA_CREDENTIALS_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),LESAKA_4ALL_FINGERPRINT_SECRET:'stable-uat-test-fingerprint-secret-32-characters'};
const env=k=>environment[k]||'';
const campaign={id:campaignId,merchant_id:merchant,credential_version:crypto.randomUUID()};
const setup={encrypted_credentials:await encryptLesakaCredentials({api_username:'stage-user',api_password:'stage-password'},merchant,'staging',env),store_id:null};
const baseFixture={id:fixtureId,campaign_id:campaignId,fixture_id:'NAD10-A01',allocation:'automated',value_minor:1000,serial_number:serial,source_line:3,observed_state:null,locked_by:null,pin_fingerprint:await pinFingerprint(pin,env('LESAKA_4ALL_FINGERPRINT_SECRET'))};
baseFixture.encrypted_pin=await encryptUatPin(pin,campaign,baseFixture.fixture_id,env);
const receipt=(ref,redeemed=false,extra={})=>({id:'019adeae-2413-71fe-bd9a-31f5b5d334f7',clientReference:ref,totalAmount:{currency:'NAD',minor:1000},remainingAmount:redeemed?0:1000,status:redeemed?'Consumed':'Active',expiryDate:'2099-01-01T00:00:00Z',productName:'4All N$10',serialNumber:serial,...extra});
function db() {
 const tables={lesaka_uat_executions:[],lesaka_uat_inventory:[structuredClone(baseFixture)]};
 return {tables,from(table){
  assert(Object.hasOwn(tables,table),'UAT must not write transactions or notification tables');
  const filters=[];let update,insert,one=false;
  const query={select(){return query},eq(k,v){filters.push(r=>r[k]===v);return query},is(k,v){return query.eq(k,v)},in(k,v){filters.push(r=>v.includes(r[k]));return query},update(v){update=v;return query},insert(v){insert=v;return query},order(){return query},limit(){return query},range(){return query},maybeSingle(){one=true;return run()},single(){one=true;return run()},then(a,b){return run().then(a,b)}};
  async function run(){
   if(insert){
    if(table==='lesaka_uat_executions' && tables[table].some(r=>r.id===insert.id || (r.campaign_id===insert.campaign_id && r.verdict==='running')))return{data:null,error:{code:'23505'}};
    const item={started_at:new Date().toISOString(),lease_time:new Date().toISOString(),redemption_started:false,evidence:[],...structuredClone(insert)};tables[table].push(item);return{data:one?structuredClone(item):[structuredClone(item)],error:null};
   }
   const rows=tables[table].filter(r=>filters.every(fn=>fn(r)));
   if(update)for(const row of rows)Object.assign(row,structuredClone(update));
   return{data:one?structuredClone(rows[0]||null):structuredClone(rows),error:null};
  }
  return query;
 }};
}
function request(extra={}){return{execution_id:crypto.randomUUID(),case_id:'TC-VR-001',cycle:1,fixture_id:fixtureId,confirm_redemption:true,...extra};}
function gateway(admin,redeem){let consumed=false;const calls=[];return{calls,transport:async(url,init)=>{
 assert(url.startsWith('https://staging.bridge.lesaka.tech/virtual-products/'));
 assert.equal(init.redirect,'error');
 assert.equal(Buffer.from(init.headers.Authorization.slice(6),'base64').toString(),'stage-user:stage-password');
 const body=JSON.parse(init.body),operation=url.endsWith('/redeem')?'redeem':'status';
 calls.push({operation,body});
 const active=admin.tables.lesaka_uat_executions.find(r=>r.verdict==='running');
 assert(active && active.evidence.at(-1).response.pending,'Outgoing request must be persisted before network I/O');
 if(operation==='redeem'){
  assert.equal(active.redemption_started,true,'Intention must be durable before redemption');
  if(redeem)return redeem(body,()=>{consumed=true});consumed=true;
 }
 return Response.json(receipt(body.clientReference,consumed));
 }};}
const context=(admin,transport,extra={})=>({admin,campaign,setup,service:true,userId:null,env,transport,...extra});
test('catalog covers all 18 workbook and 12 website cases without guessing an amount field',()=>{
 assert.equal(LESAKA_UAT_CASES.length,30);assert.equal(new Set(LESAKA_UAT_CASES.map(c=>c.id)).size,30);
 assert(LESAKA_UAT_CASES.find(c=>c.id==='TC-RED-05').blocked);
});
test('original ordering reserves at least half of every denomination, including odd counts',()=>{
 let i=0;const text=[10,25,100,1000].map(value=>'4ALL Voucher N$'+value+'\nSerial Number, PIN\n'+Array.from({length:value===25?21:20},()=>{i++;return String(i).padStart(12,'0')+', '+String(i).padStart(16,'0')}).join('\n')).join('\n\n');
 const stock=parseUatInventory(text);assert.equal(stock.length,81);assert.equal(stock.filter(x=>x.allocation==='automated').length,40);
 for(const value of [1000,2500,10000,100000]){const group=stock.filter(x=>x.value_minor===value);const n=Math.floor(group.length/2);assert(group.slice(0,n).every(x=>x.allocation==='automated'));assert(group.slice(n).every(x=>x.allocation==='manual'));}
 assert.throws(()=>parseUatInventory(text+'\n'+serial+', '+String(i).padStart(16,'0')),/Duplicate/);
 assert.throws(()=>parseUatInventory('N$10\n123, '+pin),/Invalid/);
});
test('request builders send serial only, deliberately omit references, and never invent redemption amounts',()=>{
 const ref=crypto.randomUUID(),fixture={pin,serial_number:serial};
 const bySerial=uatRequest(LESAKA_UAT_CASES.find(c=>c.id==='TC-STAT-02'),fixture,ref,new Date().toISOString());assert(!('pin'in bySerial));assert.equal(bySerial.serialNumber,serial);
 const missing=uatRequest(LESAKA_UAT_CASES.find(c=>c.id==='TC-STAT-05'),fixture,ref,new Date().toISOString());assert(!('clientReference'in missing));
 const redeem=uatRequest(LESAKA_UAT_CASES.find(c=>c.id==='TC-VR-001'),fixture,ref,new Date().toISOString());assert(!('amount'in redeem));
});
test('evidence removes credentials, PIN echoes, formatted PINs and authorization headers',()=>{
 const value=scrubUat({pin,password:'x',detail:`${pin} 0123 4567 8901 2345 stage-password Basic YWJjZA==`,nested:{authorization:'Basic secret'},errors:{Pin:[pin]}},['stage-password']);
 const text=JSON.stringify(value);for(const secret of [pin,'0123 4567 8901 2345','stage-password','YWJjZA=='])assert(!text.includes(secret));
 assert(value.errors.Pin==='[REDACTED]');
});
test('strict evaluation separates passes, supplier review, failures and unknown financial outcomes',()=>{
 const ref=crypto.randomUUID(),normal=LESAKA_UAT_CASES.find(c=>c.id==='TC-STAT-01');
 assert.equal(evaluateUat(normal,200,receipt(ref),ref,1000).verdict,'pass');
 assert.equal(evaluateUat(normal,200,receipt(ref,false,{totalAmount:{currency:'ZAR',minor:1000}}),ref,1000).verdict,'fail');
 assert.equal(evaluateUat(LESAKA_UAT_CASES[0],200,receipt(ref),ref,1000).verdict,'review');
 const validation=LESAKA_UAT_CASES.find(c=>c.id==='TC-VS-008');assert.equal(evaluateUat(validation,400,{errors:{pin:['Required']}},ref).verdict,'review');
 const redeem=LESAKA_UAT_CASES.find(c=>c.id==='TC-VR-001');for(const [http,body]of [[0,{}],[502,{errorCode:5008}],[409,{errorCode:5003}]])assert.equal(evaluateUat(redeem,http,body,ref).verdict,'uncertain');
});
test('encrypted automated PINs are bound to merchant, campaign and voucher identity',async()=>{
 assert.equal(await decryptUatPin(baseFixture,campaign,env),pin);assert(!JSON.stringify(baseFixture.encrypted_pin).includes(pin));
 await assert.rejects(()=>decryptUatPin({...baseFixture,fixture_id:'another'},campaign,env));
 await assert.rejects(()=>decryptUatPin(baseFixture,{...campaign,id:crypto.randomUUID()},env));
});
test('automated calls cannot touch the reserved manual allocation',async()=>{
 const admin=db();Object.assign(admin.tables.lesaka_uat_inventory[0],{allocation:'manual',encrypted_pin:null});let called=false;
 await assert.rejects(()=>runUat(request({mode:'manual',pin}),context(admin,async()=>{called=true})),e=>e.status===403);assert.equal(called,false);assert.equal(admin.tables.lesaka_uat_executions.length,0);
});
test('production environment never reaches a provider or writes evidence',async()=>{
 const admin=db();await assert.rejects(()=>runUat(request(),context(admin,async()=>{}, {env:k=>k==='LESAKA_4ALL_ENVIRONMENT'?'production':env(k)})),e=>e.status===403);assert.equal(admin.tables.lesaka_uat_executions.length,0);
});
test('wrong-state fixtures are blocked before redemption, including resumed preflight interruptions',async()=>{
 const admin=db(),g=gateway(admin);const req=request({case_id:'TC-VR-004'});const out=await runUat(req,context(admin,g.transport));assert.equal(out.verdict,'blocked');assert.equal(g.calls.filter(c=>c.operation==='redeem').length,0);
 const row=admin.tables.lesaka_uat_executions[0];row.verdict='error';row.redemption_started=false;
 const again=await runUat(req,context(admin,g.transport));assert.equal(again.verdict,'blocked');assert.equal(g.calls.filter(c=>c.operation==='redeem').length,0);
});
test('full redemption saves evidence before calls, confirms consumed balance, and never touches real payments',async()=>{
 const admin=db(),g=gateway(admin),req=request();const out=await runUat(req,context(admin,g.transport));assert.equal(out.verdict,'pass');assert.equal(out.evidence.length,3);assert.equal(admin.tables.lesaka_uat_inventory[0].observed_state,'Consumed');
 const text=JSON.stringify(admin.tables);assert(!text.includes(pin));assert(!text.includes('stage-password'));
 const before=g.calls.length;assert.equal((await runUat(req,context(admin,g.transport))).verdict,'pass');assert.equal(g.calls.length,before);
});
test('ambiguous redemption resumes the exact original reference/time and skips a new preflight',async()=>{
 const admin=db();let tries=0;const g=gateway(admin,(body,consume)=>{if(++tries===1)throw Error('timeout');consume();return Response.json(receipt(body.clientReference,true));});const req=request();
 assert.equal((await runUat(req,context(admin,g.transport))).verdict,'uncertain');assert.equal(admin.tables.lesaka_uat_inventory[0].locked_by,req.execution_id);
 assert.equal((await runUat(req,context(admin,g.transport))).verdict,'pass');
 const redeem=g.calls.filter(x=>x.operation==='redeem');assert.deepEqual(redeem[0].body,redeem[1].body);assert.equal(g.calls.filter(x=>x.operation==='status').length,2);
});
test('unsupported over-redemption case is recorded as blocked without a provider request',async()=>{
 const admin=db();let calls=0;const result=await runUat(request({case_id:'TC-RED-05',fixture_id:null}),context(admin,async()=>{calls++}));assert.equal(result.verdict,'blocked');assert.equal(calls,0);
});
test('simultaneous executions cannot issue competing redemptions',async()=>{
 const admin=db();let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
 const g=gateway(admin,async(body,consume)=>{enter();await gate;consume();return Response.json(receipt(body.clientReference,true));});
 const first=runUat(request(),context(admin,g.transport));await entered;
 await assert.rejects(()=>runUat(request(),context(admin,g.transport)),e=>e.status===409);release();assert.equal((await first).verdict,'pass');assert.equal(g.calls.filter(x=>x.operation==='redeem').length,1);
});
test('idempotency test uses the original receipt and reference rather than a new redemption identity',async()=>{
 const admin=db(),g=gateway(admin),first=request();assert.equal((await runUat(first,context(admin,g.transport))).verdict,'pass');
 const replay=await runUat(request({case_id:'TC-EDGE-01',replay_of:first.execution_id}),context(admin,g.transport));assert.equal(replay.verdict,'pass');
 const calls=g.calls.filter(x=>x.operation==='redeem');assert.deepEqual(calls[0].body,calls[1].body);
});
