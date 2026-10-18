// Export actual runtime intersections for independent reconciliation; no browser DOM needed.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\nstart\(\);\s*$/,'\n');
const names=/const dataParts=\[(.*?)\];/.exec(code)[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1));
const aliases={'metric-catalog':'catalog','metric-values':'metrics','filter-contract':'contract','filter-slices':'slices'};
const fixture=Object.fromEntries(names.map(n=>[aliases[n]??n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`,import.meta.url)))]));
const c=vm.createContext({__fixture:fixture,document:{documentElement:{},querySelector:()=>null},getComputedStyle:()=>({fontSize:'16px'}),window:{addEventListener:()=>{},removeEventListener:()=>{}},localStorage:{getItem:()=>null},URLSearchParams,location:{hash:''},console});
vm.runInContext(code,c);const run=s=>vm.runInContext(s,c);run('sourceData=__fixture');const cases=[];
for(const cohort of fixture.deviceRetentionFacts.cohorts)for(const country of [null,'US','UK','DE','Other'])for(const model of [null,'K6','Bird Lite','Bird Pro','Hunt Pro'])for(const channel of [null,'Amazon','Shopify'])for(const line of [null,'Bird','Hunting'])for(const status of [null,'Effective','Inactive']){
 const filters=Object.fromEntries(Object.entries({country,deviceModel:model,salesChannel:channel,productLine:line,deviceStatus:status}).filter(([,v])=>v));
 c.__state=filters;c.__id=cohort.id;
 cases.push(run(`deviceRetentionCohortRequest=[__id];filterState=__state;(()=>{const v=projectMetric(43),c=deviceRetentionCurrent();return {id:__id,filters:__state,d:c.denominator,D7:{n:v.value.D7.numerator,kind:v.value.D7.kind,value:v.value.D7.value??null},D30:{n:v.value.D30.numerator,kind:v.value.D30.kind,value:v.value.D30.value??null}};})()`));
}
const devices=[];
for(const cohort of fixture.deviceRetentionFacts.cohorts){c.__id=cohort.id;devices.push(run(`deviceRetentionCohortRequest=[__id];filterState={};(()=>{const c=deviceRetentionCurrent(),rows=deviceRetentionDevices(c);return {id:c.id,count:rows.length,ids:rows.map(r=>r.id),D7:rows.filter(r=>r.D7===true).length,D30:rows.filter(r=>r.D30===true).length,unknown7:rows.filter(r=>r.D7===null).length,unknown30:rows.filter(r=>r.D30===null).length};})()`));}
const faults=["delete sourceData.deviceRetentionFacts","sourceData.deviceRetentionFacts.status='PROPOSAL_ONLY'","sourceData.deviceRetentionFacts.timezone='Local'","sourceData.deviceRetentionFacts.cohorts.pop()",
 "sourceData.deviceRetentionFacts.cohorts[0].end='2026-07-04'","sourceData.deviceRetentionFacts.cohorts[11].mature.D30=true","sourceData.deviceRetentionFacts.defaultCohort='2026-09-14'",
 "sourceData.deviceRetentionFacts.cohorts[0].records[0].outcomeCounts[0].count=-1","sourceData.deviceRetentionFacts.cohorts[0].records[0].outcomeCounts[0].D30=null",
 "sourceData.deviceRetentionFacts.cohorts[11].records[0].outcomeCounts[0].D7=false","sourceData.deviceRetentionFacts.cohorts[0].records[0].country='XX'",
 "sourceData.deviceRetentionFacts.cohorts[0].records[0].activated++","sourceData.metrics.m43.value.D30.numerator++","sourceData.deviceRetentionFacts.cohorts[0].records[1]=sourceData.deviceRetentionFacts.cohorts[0].records[0]",
 "sourceData.deviceRetentionFacts.cohorts[0].records[0].entryDeviceStatus='Inactive'"];
for(const fault of faults){run(`sourceData=JSON.parse(JSON.stringify(__fixture));filterState={};deviceRetentionCohortRequest=[];${fault}`);assert.equal(run('projectMetric(43).availability'),'pending',fault);}
for(const request of [[''],['2026-09-21'],['2026-08-18'],['2026-08-17','2026-08-24']]){run(`sourceData=__fixture;filterState={};deviceRetentionCohortRequest=${JSON.stringify(request)}`);assert.equal(run('projectMetric(43).availability'),'pending');}
// Exact-day D30 may exceed D7. Valid zero is not an unknown or a missing sample.
run(`sourceData=JSON.parse(JSON.stringify(__fixture));filterState={};deviceRetentionCohortRequest=['2026-06-29'];sourceData.deviceRetentionFacts.cohorts[0].records.forEach(r=>r.outcomeCounts=[{D7:false,D30:true,count:r.activated}]);`);
assert.ok(run('deviceRetentionIndex().rows'));assert.equal(run('projectMetric(43).value.D7.value'),0);assert.equal(run('projectMetric(43).value.D30.value'),1);
// The local cohort never changes another C metric or another metric's issue scope.
run('sourceData=__fixture;filterState={};deviceRetentionCohortRequest=[];projectDataset()');
const others=run('JSON.stringify([metric(8),metric(41),metric(42),metric(45),metric(46)])');
for(const cohort of fixture.deviceRetentionFacts.cohorts){run(`deviceRetentionCohortRequest=['${cohort.id}'];projectDataset()`);assert.equal(run('JSON.stringify([metric(8),metric(41),metric(42),metric(45),metric(46)])'),others);assert.equal(run("recordScope('C',42)"),'默认演示范围');}
run("deviceRetentionCohortRequest=['2026-08-17'];projectDataset()");assert.equal(run("recordKey('C',43)"),'record:C:默认演示范围:43');assert.equal(run('baselineWindowEnd(actionBaselineWindow(43))'),'2026-09-22');
run("deviceRetentionCohortRequest=['2026-09-07'];projectDataset()");assert.equal(run('baselineWindowEnd(actionBaselineWindow(43))'),'2026-09-20');
run("deviceRetentionCohortRequest=['2026-09-14'];projectDataset()");assert.equal(run('hasRegistrationBaseline(43)'),false);
assert.equal(run("baselineWindowEnd('设备留存D30观察期末 2026-09-21 · 激活批次 2026-08-17—2026-08-23')"),null);
console.log(JSON.stringify({status:'PASS',cases,devices,faults:faults.length,invalidCohorts:4}));
