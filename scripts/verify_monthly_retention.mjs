// Export real runtime calculations for independent Python reconciliation.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\nstart\(\);\s*$/,'\n');
const names=/const dataParts=\[(.*?)\];/.exec(code)[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1));
const aliases={'metric-catalog':'catalog','metric-values':'metrics','filter-contract':'contract','filter-slices':'slices'};
const fixtures=Object.fromEntries(names.map(n=>[aliases[n]??n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`,import.meta.url)))]));
const c=vm.createContext({__fixtures:fixtures,document:{documentElement:{},querySelector:()=>null},getComputedStyle:()=>({fontSize:'16px'}),window:{addEventListener:()=>{},removeEventListener:()=>{}},localStorage:{getItem:()=>null},URLSearchParams,location:{hash:''},console});
vm.runInContext(code,c);const run=s=>vm.runInContext(s,c);run('sourceData=__fixtures');
const filters=[{}, {appPlatform:'iOS'}, {appPlatform:'Android'},...['US','UK','DE','Other'].flatMap(country=>[{country},{country,appPlatform:'iOS'},{country,appPlatform:'Android'}])],cases=[];
for(const month of fixtures.metricTrends.m24.labels)for(const state of filters){
 run(`retentionMonthRequest=[${JSON.stringify(month)}];filterState=${JSON.stringify(state)};projectDataset()`);
 cases.push(run(`({month:${JSON.stringify(month)},filters:filterState,current:metric(24),baseline:actionBaselineValue(24),window:actionBaselineWindow(24),scope:recordScope('B',24),
   history:metricHistory(24).details.map(r=>({month:r.observedMonth,n:r.numerator,d:r.denominator,value:r.value})),other:JSON.stringify([metric(4),metric(25),metric(28),metric(29),metric(30)])})`));
}
const corruptions=["delete sourceData.metricTrends.m24","sourceData.metricTrends.m24.status='PROPOSAL_ONLY'","sourceData.metricTrends.m24.points.pop()",
 "sourceData.metricTrends.m24.points[0].observedThrough='2025-09-29'","sourceData.metricTrends.m24.points[0].value=NaN","sourceData.metrics.m24.value=undefined",
 "sourceData.metricTrends.m24.points[0].records[0].retained=-1","sourceData.metricTrends.m24.points[0].records[1]=sourceData.metricTrends.m24.points[0].records[0]",
 "sourceData.metricTrends.m24.points[0].records[0].observedActive++;sourceData.metricTrends.m24.points[0].records[1].observedActive--",
 "sourceData.metricTrends.m24.labels[0]='2025-10'","sourceData.metrics.m24.numerator++","sourceData.metricTrends.m24.points[0].records[0].country='XX'"];
for(const change of corruptions){
 run(`sourceData=JSON.parse(JSON.stringify(__fixtures));retentionMonthRequest=[];filterState={};${change};projectDataset()`);
 assert.equal(run('metric(24).availability'),'pending',change);assert.equal(run('metricHistory(24)'),null,change);
 assert.equal(run('metric(4).value'),68000,change);
}
for(const requested of [[''],['2026-09'],['2026-07','2026-08'],['2026-7'],['2099-01']]){
 run(`sourceData=__fixtures;retentionMonthRequest=${JSON.stringify(requested)};filterState={};projectDataset()`);
 assert.equal(run('metric(24).availability'),'pending');assert.equal(run('metric(25).value.DAU'),12600);
}
const samples=[];
for(const d of [0,29]){
 run(`sourceData=JSON.parse(JSON.stringify(__fixtures));retentionMonthRequest=[];filterState={country:'Other',appPlatform:'iOS'};
 for(const row of sourceData.metricTrends.m24.points){const part=row.records.find(r=>r.country==='Other'&&r.appPlatform==='iOS'),other=row.records.find(r=>r.country==='US'&&r.appPlatform==='iOS');
 for(const [key,value] of [['baseActive',${d}],['observedActive',${d}],['retained',${d?20:0}]]){other[key]+=part[key]-value;part[key]=value;}}projectDataset()`);
 assert.ok(run('retentionIndex().rows'));assert.equal(run('metric(24).kind'),'na');assert.equal(run('retentionProjection().rows.at(-1).denominator'),d);
 samples.push(run('metric(24)'));
}
console.log(JSON.stringify({status:'PASS',cases,corruptions:corruptions.length,invalidMonths:5,samples}));
