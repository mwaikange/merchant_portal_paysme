import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
let handler,transaction,attempt,queries;
const admin={from(table){const q={select(){queries.push({table});return q},eq(key,value){queries.push({table,key,value});return q},in(){return q},order(){return q},limit(){return q},async maybeSingle(){return {data:table==='transactions'?transaction:table==='lesaka_voucher_attempts'?attempt:null,error:null}}};return q;}};
globalThis.__resolveTestAdmin=admin;globalThis.Deno={env:{get:()=> 'configured'},serve:fn=>handler=fn};
const source=readFileSync(new URL('../supabase/functions/resolve-payment-code/index.ts',import.meta.url),'utf8').replace('import { createClient } from "npm:@supabase/supabase-js@2.39.3";','const createClient=()=>globalThis.__resolveTestAdmin;');
await import('data:text/javascript;base64,'+Buffer.from(transformSync(source,{loader:'ts',format:'esm'}).code).toString('base64'));
const run=async(extra={})=>{queries=[];const r=await handler(new Request('https://example.test/resolve-payment-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({generated_code:'1234-5678-9012',...extra})}));return {http:r.status,body:await r.json()};};
const setup=()=>{transaction={transaction_id:'tx',merchant_id:'merchant',generated_code:'1234-5678-9012',amount:10,status:'pending',is_test:false,test_provider:null};attempt=null;};
test('live pending and paid links keep their existing status and do not query test attempts',async()=>{
 for(const status of ['pending','paid']){setup();transaction.status=status;const result=await run({test_completed:true});assert.equal(result.http,200);assert.equal(result.body.payment.status,status);assert(!('test_completed' in result.body.payment));assert(!queries.some(q=>q.table==='lesaka_voucher_attempts'));}
});
test('only a marked Lesaka staging test with a verified tested attempt gets a completed flag',async()=>{
 setup();transaction.is_test=true;transaction.test_provider='lesaka';attempt={status:'tested'};const result=await run();assert.equal(result.http,200);assert.equal(result.body.payment.test_completed,true);assert.equal(result.body.payment.status,'pending');assert.equal(transaction.status,'pending');assert(queries.some(q=>q.table==='lesaka_voucher_attempts'&&q.key==='merchant_id'&&q.value==='merchant'));assert(queries.some(q=>q.key==='environment'&&q.value==='staging'));
});
test('incomplete and cancelled test links do not gain a completion flag',async()=>{
 for(const status of ['redeeming','uncertain',null]){setup();transaction.is_test=true;transaction.test_provider='lesaka';attempt=status?{status}:null;assert(!('test_completed' in (await run()).body.payment));}
 setup();transaction.is_test=true;transaction.test_provider='lesaka';transaction.status='cancelled';attempt={status:'tested'};const result=await run();assert.equal(result.body.payment.status,'cancelled');assert(!('test_completed' in result.body.payment));
});
