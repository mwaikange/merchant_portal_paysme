import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectUatSerial} from '../supabase/functions/_shared/lesaka-uat-inspect.ts';
const fixture={id:crypto.randomUUID(),serial_number:'012345678901',value_minor:1000};
const credentials={api_username:'test-partner',api_password:'test-private'};
test('reserved voucher discovery uses serial only and can only call the fixed staging status endpoint',async()=>{
 for(const state of ['Active','Expired','Cancelled','Consumed']){
  const result=await inspectUatSerial(fixture,credentials,null,async(url,init)=>{
   assert.equal(url,'https://staging.bridge.lesaka.tech/virtual-products/api/v2/voucher/status');
   assert.equal(init.method,'POST');assert.equal(init.redirect,'error');const body=JSON.parse(init.body);assert.equal(body.serialNumber,fixture.serial_number);assert(!('pin'in body));assert(!('amount'in body));
   return Response.json({id:crypto.randomUUID(),clientReference:body.clientReference,totalAmount:{currency:'NAD',minor:1000},remainingAmount:state==='Consumed'?0:1000,status:state,serialNumber:fixture.serial_number,pin:'0123456789012345'});
  });assert.equal(result.valid,true);assert.equal(result.observed_state,state);assert(!JSON.stringify(result).includes('0123456789012345'));assert(!JSON.stringify(result).includes(credentials.api_password));
 }
});
test('inventory discovery refuses malformed serials and never trusts mismatched provider records',async()=>{
 let calls=0;await assert.rejects(inspectUatSerial({...fixture,serial_number:'bad'},credentials,null,async()=>{calls++;return Response.json({})}));assert.equal(calls,0);
 const wrong=await inspectUatSerial(fixture,credentials,null,async()=>Response.json({id:crypto.randomUUID(),clientReference:'wrong',status:'Expired',totalAmount:{currency:'NAD',minor:1000},remainingAmount:1000}));assert.equal(wrong.valid,false);assert.equal(wrong.observed_state,null);
 const unavailable=await inspectUatSerial(fixture,credentials,null,async()=>{throw Error(credentials.api_password)});assert.equal(unavailable.http_status,0);assert(!JSON.stringify(unavailable).includes(credentials.api_password));
});
