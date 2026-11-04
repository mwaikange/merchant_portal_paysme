import test from 'node:test';
import assert from 'node:assert/strict';
import {LESAKA_UAT_CASES,LESAKA_REQUIRED_CASES,LESAKA_TECHNICAL_CASES,isTechnicalUatCase,needsFixture,uatRequest,evaluateUat,scrubUat} from '../supabase/functions/_shared/lesaka-uat.ts';
import {reconcileWorkbookEvidence} from '../supabase/functions/_shared/lesaka-workbook-assessment.ts';
const byId=id=>LESAKA_UAT_CASES.find(row=>row.id===id),ref=crypto.randomUUID();
const active={id:crypto.randomUUID(),clientReference:ref,totalAmount:{currency:'NAD',minor:100000},remainingAmount:100000,status:'Active',productName:'4ALL test voucher',expiryDate:'2099-01-01'};
test('technical checks can only query a serial or submit synthetic invalid inputs',()=>{
 assert.equal(LESAKA_TECHNICAL_CASES.length,8);
 for(const item of [...LESAKA_TECHNICAL_CASES,byId('TC-EDGE-02')]){
  assert(isTechnicalUatCase(item.id));
  if(needsFixture(item)){assert.equal(item.operation,'status');assert.equal(item.input,'serial');}
  else {const request=uatRequest(item,{pin:'1234567890123456',serial_number:'123456789012'},ref,new Date().toISOString());assert.notEqual(request.pin,'1234567890123456');}
 }
 for(const id of ['TC-VR-001','TC-VR-002','TC-RED-01'])assert.equal(isTechnicalUatCase(id),false);
});
test('only the 18 supplier Excel case IDs are required; state aliases do not force review',()=>{
 assert.equal(LESAKA_REQUIRED_CASES.length,18);assert(LESAKA_REQUIRED_CASES.every(row=>/^TC-V[SR]-/.test(row.id)&&!row.review));
 assert.equal(evaluateUat(byId('TC-VS-001'),200,active,ref,100000).verdict,'pass');
 assert.equal(evaluateUat(byId('TC-VS-004'),200,{...active,status:'Reversed'},ref,100000).verdict,'pass');
 assert.equal(evaluateUat(byId('TC-VS-001'),200,{...active,productName:undefined},ref,100000).verdict,'review');
});
test('workbook field validation passes without an undocumented 5005 requirement',()=>{
 for(const id of ['TC-VS-008','TC-VS-010','TC-VR-007','TC-EDGE-02'])assert.equal(evaluateUat(byId(id),400,{status:400,errors:{Pin:['PIN must be 16 digits']}},ref).verdict,'pass');
 assert.equal(evaluateUat(byId('TC-VS-009'),400,{errors:{SerialNumber:['12 to 15 digits']}},ref).verdict,'pass');
 assert.equal(evaluateUat(byId('TC-VS-008'),400,{errors:{ClientReference:['Required']}},ref).verdict,'fail');
 const clean=scrubUat({status:400,errors:{Pin:['PIN must be 16 digits','0000111122223333']}});assert.equal(clean.errors.Pin[0],'PIN must be 16 digits');assert(!JSON.stringify(clean).includes('0000111122223333'));
});
test('explicit non-redeemable business outcomes pass negative workbook cases; network errors do not',()=>{
 const rejected={status:5008,detail:'Voucher is not in a redeemable state'};
 assert.equal(evaluateUat(byId('TC-VR-003'),502,rejected,ref).verdict,'pass');
 assert.equal(evaluateUat(byId('TC-VR-001'),502,rejected,ref).verdict,'fail');
 assert.equal(evaluateUat(byId('TC-RED-02'),502,rejected,ref).verdict,'review');
 assert.equal(evaluateUat(byId('TC-VR-003'),502,{},ref).verdict,'uncertain');
});
test('redeemed status needs real redemption time and reference evidence',()=>{
 const consumed={...active,status:'Consumed',remainingAmount:0};
 assert.equal(evaluateUat(byId('TC-VS-003'),200,consumed,ref,100000).verdict,'review');
 assert.equal(evaluateUat(byId('TC-VS-003'),200,consumed,ref,100000,{time:'2026-11-04T10:00:00Z',reference:ref}).verdict,'pass');
});
test('existing evidence is reassessed and mapped once without repeating voucher requests',async()=>{
 const fixture={id:crypto.randomUUID(),campaign_id:'campaign',value_minor:100000};
 const stamp='2026-11-04T10:00:00Z';
 const calls=[{operation:'status',client_reference:ref,requested_at:stamp,finished_at:stamp,http_status:200,request:{pin:'[REDACTED]',pin_length:16},response:active},{operation:'redeem',client_reference:ref,requested_at:stamp,finished_at:stamp,http_status:200,request:{pin:'[REDACTED]',pin_length:16},response:{...active,remainingAmount:0}}];
 const source={id:crypto.randomUUID(),campaign_id:'campaign',case_id:'TC-RED-01',fixture_id:fixture.id,cycle:2,started_at:stamp,completed_at:stamp,client_reference:ref,request_time:stamp,evidence:calls,verdict:'pass',reason:'Original verified redemption',actor_kind:'manual'};
 const customer=crypto.randomUUID();source.customer_attempt_id=customer;source.evidence=[calls[1]];
 const preflight={...source,id:crypto.randomUUID(),case_id:'TC-STAT-01',evidence:[calls[0]]};
 const rows=[source,preflight],unchanged=JSON.stringify(source.evidence);let inserts=0;
 const admin={from(table){let patch,filters=[],insert;const q={update(value){patch=value;return q},eq(k,v){filters.push([k,v]);return q},upsert(value){insert=value;return q},then(ok,bad){if(table==='lesaka_uat_executions'){if(insert){inserts++;rows.push(structuredClone(insert));}else for(const row of rows)if(filters.every(([k,v])=>row[k]===v))Object.assign(row,patch);}return Promise.resolve({error:null}).then(ok,bad)}};return q}};
 const first=await reconcileWorkbookEvidence(admin,'campaign',rows,[fixture]);assert(first.some(row=>row.case_id==='TC-VR-002'&&row.verdict==='pass'));assert(first.some(row=>row.case_id==='TC-VS-001'&&row.verdict==='pass'));
 assert.equal(JSON.stringify(source.evidence),unchanged);assert.equal(preflight.assessment_history[0].reason,'Original verified redemption');const count=inserts;
 await reconcileWorkbookEvidence(admin,'campaign',rows,[fixture]);assert.equal(inserts,count);
});
