import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const names={'metric-catalog':'catalog','metric-values':'metrics','filter-contract':'contract','filter-policy':'filterPolicy','filter-slices':'slices','monthly-renewal-facts':'monthlyRenewalFacts'};
const fixtures=Object.fromEntries(Object.entries(names).map(([name,key])=>[key,JSON.parse(fs.readFileSync(`data/${name}.json`,'utf8'))]));
fixtures.snapshot=JSON.parse(fs.readFileSync('data/snapshot.json','utf8'));
const ctx=vm.createContext({__fixtures:fixtures,document:{documentElement:{},querySelector:()=>null},window:{addEventListener:()=>{},removeEventListener:()=>{}},localStorage:{getItem:()=>null},getComputedStyle:()=>({fontSize:'16px'}),URLSearchParams,location:{hash:''},console});
vm.runInContext(fs.readFileSync('app.js','utf8').replace(/\nstart\(\);\s*$/,'\n'),ctx);const run=s=>vm.runInContext(s,ctx);
run('sourceData=__fixtures');
const fields=['country','appPlatform','productLine','plan','subscriptionPlatform','billingCycle'];
const filters=[{},...fields.flatMap(key=>[...new Set(fixtures.monthlyRenewalFacts.months[11].records.map(r=>r[key]))].map(value=>({[key]:value}))),...fixtures.monthlyRenewalFacts.months[11].records.map(r=>Object.fromEntries(fields.map(k=>[k,r[k]])))];
let checks=0;
for(const m of fixtures.monthlyRenewalFacts.months){for(const f of filters){
 const state={...f,...(f.billingCycle?{billingCycle:f.billingCycle.toLowerCase()}: {})};
 const actual=run(`filterState=${JSON.stringify(state)};renewalMonthRequest=[${JSON.stringify(m.month)}];JSON.stringify(renewalProjection().current)`),a=JSON.parse(actual);
 const rows=m.records.filter(r=>Object.entries(f).every(([k,v])=>r[k]===v));let b=0,d=0,n=0,l=0,c=0;
 for(const r of rows)for(const o of r.outcomeCounts){b+=o.count;if(o.due)d+=o.count;if(o.renewed)n+=o.count;if(o.lossReason!==null)l+=o.count;if(o.cancelled)c+=o.count;}
 assert.deepEqual([a.opening,a.due,a.renewed,a.lostDuring,a.cancelled],[b,d,n,l,c]);
 for(const [part,num,den] of [[a.renewal,n,d],[a.loss,l,b],[a.cancel,c,b]]){assert.equal(part.kind,den>=30?'rate':'na');if(den>=30)assert.equal(part.value,num/den);}
 checks++;
}}
run('filterState={};renewalMonthRequest=[]');assert.equal(run('renewalMetric().value'),.95);
for(const request of ["['2026-09']","['2026-7']","['']","['2026-07','2026-08']"]){run(`renewalMonthRequest=${request}`);assert.equal(run('renewalMetric().availability'),'pending');}
run('renewalMonthRequest=[]');assert.equal(run("projectMetric(23,{deviceModel:'K6'}).availability"),'pending');assert.equal(run("projectMetric(23,{plan:'Free'}).kind"),'na');assert.equal(run("projectMetric(23,{week:'1'}).value"),.95);
assert.equal(run("baselineWindowEnd('月度续订观察期末 2026-09-07 · 到期月 2026-08')"),'2026-09-07');assert.equal(run("baselineWindowEnd('月度续订观察期末 2026-09-06 · 到期月 2026-08')"),null);
const corrupt=["sourceData.monthlyRenewalFacts.months[11].records[0].opening++","sourceData.monthlyRenewalFacts.months[11].records[0].outcomeCounts[0].count=-1","sourceData.monthlyRenewalFacts.months[11].records.pop()","sourceData.monthlyRenewalFacts.months[11].records[1]=sourceData.monthlyRenewalFacts.months[11].records[0]","sourceData.monthlyRenewalFacts.months[11].renewalObservationEndExclusive='2026-09-07'","sourceData.monthlyRenewalFacts.months[11].renewed++","sourceData.monthlyRenewalFacts.defaultMonth='2026-07'","sourceData.monthlyRenewalFacts.months[11].records[0].outcomeCounts[0].lossReason='invented'"];
for(const change of corrupt){run(`sourceData=JSON.parse(JSON.stringify(__fixtures));${change}`);assert.equal(run('renewalMetric().availability'),'pending',change);}
// Coherent zero/29/30 and no-due populations exercise rate availability without weakening source validation.
for(const [size,due] of [[0,false],[29,true],[30,true],[30,false]]){
 run(`sourceData=JSON.parse(JSON.stringify(__fixtures));{sourceData.monthlyRenewalFacts.months.forEach(m=>{m.records.forEach(r=>{r.opening=0;r.outcomeCounts=[];});Object.assign(m,{opening:0,due:0,renewed:0,lostDuring:0,cancelled:0,restoredAfterLoss:0,noRightsAtEnd:0,otherInflow:0,monthlyPayers:0,closing:0});});const m=sourceData.monthlyRenewalFacts.months[11];m.records.forEach(r=>{r.opening=0;r.outcomeCounts=[];});const r=m.records[1];r.opening=${size};r.outcomeCounts=${size?`[{count:${size},due:${due},renewed:${due},cancelled:true,lossReason:'cancel-expired',restoredAfterLoss:false}]`:'[]'};Object.assign(m,{opening:${size},due:${due?size:0},renewed:${due?size:0},lostDuring:${size},cancelled:${size},restoredAfterLoss:0,noRightsAtEnd:${size},otherInflow:${due?0:size},monthlyPayers:${size},closing:${due?0:size}});Object.assign(sourceData.monthlyRenewalFacts.months[10],{closing:${size},otherInflow:${size},monthlyPayers:${size}});}filterState={};renewalMonthRequest=[]`);
 const a=JSON.parse(run('JSON.stringify(renewalProjection())'));assert.ok(!a.reason);assert.equal(a.current.renewal.kind,size>=30&&due?'rate':'na');assert.equal(a.current.loss.kind,size>=30?'rate':'na');if(size>=30)assert.equal(a.current.loss.value,1);
}
// Valid source with last month still awaiting observations is not silently filled from the old weekly series.
run("sourceData=JSON.parse(JSON.stringify(__fixtures));sourceData.snapshot.asOf='2026-09-01';sourceData.monthlyRenewalFacts.asOf='2026-09-01';sourceData.monthlyRenewalFacts.defaultMonth='2026-07';renewalMonthRequest=['2026-08']");assert.equal(run('renewalMetric().availability'),'pending');assert.equal(run('renewalProjection().current.loss.value'),.03);
console.log(`PASS ${checks} independently summed monthly joint scopes, eight corruptions, invalid months, 0/29/30, no-due loss evidence, complete-observation boundary and legacy date floor`);
