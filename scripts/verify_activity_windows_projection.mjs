import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const names={'metric-catalog':'catalog','metric-values':'metrics','filter-contract':'contract','filter-policy':'filterPolicy','filter-slices':'slices','activity-window-facts':'activityWindowFacts','metric-trends':'metricTrends','diagnostics':'diagnostics','snapshot':'snapshot'};
const fixtures=Object.fromEntries(Object.entries(names).map(([n,k])=>[k,JSON.parse(fs.readFileSync(`data/${n}.json`,'utf8'))]));
const ctx=vm.createContext({__fixtures:fixtures,document:{documentElement:{},querySelector:()=>null},window:{addEventListener:()=>{},removeEventListener:()=>{}},localStorage:{getItem:()=>null},getComputedStyle:()=>({fontSize:'16px'}),URLSearchParams,location:{hash:''},console});
vm.runInContext(fs.readFileSync('app.js','utf8').replace(/\nstart\(\);\s*$/,'\n'),ctx);const run=s=>vm.runInContext(s,ctx);run('sourceData=__fixtures');let checks=0;
const fields=['DAU','WAU','MAU','appDAU','appWAU','appMAU'];
for(const country of ['', 'US','UK','DE','Other'])for(const appPlatform of ['', 'iOS','Android']){
 const filters=Object.fromEntries(Object.entries({country,appPlatform}).filter(([,v])=>v));
 const actual=JSON.parse(run(`filterState=${JSON.stringify(filters)};JSON.stringify(activeWindowProjection())`));assert.ok(!actual.reason);
 for(const [i,row] of fixtures.activityWindowFacts.rows.entries()){
  const source=row.records.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)),counts={DAU:0,WAU:0,MAU:0,appDAU:0,appWAU:0,appMAU:0};
  for(const r of source)for(const o of r.outcomes)for(let j=0;j<3;j++){if(o.compositeAge<=j)counts[fields[j]]+=o.count;if(o.appAge!==null&&o.appAge<=j)counts[fields[j+3]]+=o.count;}
  assert.deepEqual(actual.rows[i].counts,counts);checks++;
 }
 for(const id of [4,25,30])assert.notEqual(run(`projectMetric(${id}).kind`),'na');
 assert.equal(run('projectMetric(4).value'),actual.current.counts.MAU);assert.equal(run('projectMetric(25).value.appMAU'),actual.composition.app);
}
for(const state of [{productLine:'Bird'},{deviceModel:'K6'}])for(const id of [4,25,30])assert.equal(run(`projectMetric(${id},${JSON.stringify(state)}).availability`),'pending');
const corrupt=["sourceData.activityWindowFacts.rows[0].at=sourceData.activityWindowFacts.rows[1].at","sourceData.activityWindowFacts.rows[0].records.pop()","sourceData.activityWindowFacts.rows[0].records[1]=sourceData.activityWindowFacts.rows[0].records[0]","sourceData.activityWindowFacts.rows[0].records[0].outcomes[0].count=-1","sourceData.activityWindowFacts.rows[0].records[0].outcomes.push(sourceData.activityWindowFacts.rows[0].records[0].outcomes[0])","sourceData.activityWindowFacts.currentComposition[0].exclusive.appOnly++","sourceData.metrics.m25.value.appDAU++","sourceData.snapshot.asOf='2026-09-25'","sourceData.activityWindowFacts.rows[0].at='2026-07-03T01:00:00Z'"];
for(const change of corrupt){run(`sourceData=JSON.parse(JSON.stringify(__fixtures));filterState={};${change}`);assert.equal(run('projectMetric(25).availability'),'pending',change);}
// A valid source may be reordered; temporal checks must join countries/platforms, not row positions.
run('sourceData=JSON.parse(JSON.stringify(__fixtures));sourceData.activityWindowFacts.rows[10].records.reverse()');assert.equal(run('projectMetric(25).kind'),'group');
for(const size of [0,12,29,30]){
 run(`sourceData=JSON.parse(JSON.stringify(__fixtures));{const s=sourceData.activityWindowFacts;s.rows.forEach(row=>row.records.forEach((r,i)=>r.outcomes=i===0&&${size}>0?[{count:${size},compositeAge:0,appAge:0}]:[]));s.currentComposition.forEach((r,i)=>{r.composite=r.app=i===0?${size}:0;Object.keys(r.exclusive).forEach(k=>r.exclusive[k]=i===0&&k==='appOnly'?${size}:0);});sourceData.metrics.m04.value=${size};Object.keys(sourceData.metrics.m25.value).forEach(k=>sourceData.metrics.m25.value[k]=${size});Object.assign(sourceData.metrics.m30.value,{composite:${size},app:${size},content:0,pushClicked:0,exclusiveCells:{appOnly:${size},contentOnly:0,pushOnly:0,appContentOnly:0,appPushOnly:0,contentPushOnly:0,allThree:0}});sourceData.diagnostics.B.chart.series.forEach(line=>line.values.fill(${size}));}filterState={}`);
 assert.equal(run('projectMetric(4).value'),size);assert.equal(run('projectMetric(25).value.DAU'),size);assert.equal(run('projectMetric(30).value.composite'),size);
}
run("sourceData=JSON.parse(JSON.stringify(__fixtures));{const row=sourceData.activityWindowFacts.rows.at(-1);row.records.forEach(r=>{const app=r.outcomes.filter(o=>o.appAge!==null).reduce((n,o)=>n+o.count,0),other=r.outcomes.filter(o=>o.appAge===null).reduce((n,o)=>n+o.count,0);r.outcomes=[{compositeAge:2,appAge:2,count:app},{compositeAge:2,appAge:null,count:other}].filter(o=>o.count);});Object.assign(sourceData.metrics.m25.value,{DAU:0,WAU:0,appDAU:0,appWAU:0});}");assert.equal(run('projectMetric(25).availability'),'pending','Impossible rolling history accepted despite previous daily activity');
run('sourceData=__fixtures;filterState={}');assert.equal(run("activeWindowPeriod(1)"),'2026-09-23 → 2026-09-24 UTC零时（左含右不含）');assert.equal(run("activeWindowPeriod(30)"),'2026-08-25 → 2026-09-24 UTC零时（左含右不含）');
console.log(`PASS ${checks} independently summed daily scopes, cross-metric composition, nine source contradictions, row reordering, zero/12/29/30 counts and impossible temporal history`);
