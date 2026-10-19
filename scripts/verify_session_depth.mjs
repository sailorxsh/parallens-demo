import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const file=name=>JSON.parse(fs.readFileSync(path.join(root,'data',`${name}.json`),'utf8'));
const fixtures={
  catalog:file('metric-catalog'),metrics:file('metric-values'),weekly:file('weekly'),snapshot:file('snapshot'),
  stories:file('stories'),diagnostics:file('diagnostics'),contract:file('filter-contract'),filterPolicy:file('filter-policy'),slices:file('filter-slices'),
  trialFacts:file('trial-facts'),modelMarket:file('model-market'),metricTrends:file('metric-trends'),entitySamples:file('entity-samples'),
  functionUsage:file('function-usage'),inactivityCohorts:file('inactivity-cohorts'),technicalFacts:file('technical-facts'),
  subscriptionFlow:file('subscription-flow'),bindingDeviceFacts:file('binding-device-facts'),deviceActivityFacts:file('device-activity-facts'),onboardingDurationFacts:file('onboarding-duration-facts'),deviceRetentionFacts:file('device-retention-facts'),monthlyRenewalFacts:file('monthly-renewal-facts'),activityWindowFacts:file('activity-window-facts'),
};
const context=vm.createContext({
  __fixtures:fixtures,document:{documentElement:{},querySelector:()=>null},getComputedStyle:()=>({fontSize:'16px'}),window:{addEventListener:()=>{},removeEventListener:()=>{}},
  localStorage:{getItem:()=>null},URLSearchParams,location:{hash:''},console,
});
const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/\nstart\(\);\s*$/,'\n');
vm.runInContext(source,context,{filename:'app.js'});
vm.runInContext('sourceData=__fixtures',context);
const project=filters=>vm.runInContext(`filterState=${JSON.stringify(filters)};projectDataset();dataset.metrics`,context);
const evaluate=expression=>vm.runInContext(expression,context);
project({});

const cases=[];
for(const country of['','US','UK','DE','Other'])for(const appPlatform of['','iOS','Android']){
 const state=Object.fromEntries(Object.entries({country,appPlatform}).filter(([,v])=>v));project(state);
 cases.push({state,metric:JSON.parse(evaluate('JSON.stringify(metric(26))')),projection:JSON.parse(evaluate('JSON.stringify(sessionDepthProjection())'))});
}
const restore=()=>evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures))');
const faults=[['missing-source','delete sourceData.diagnostics.B.sessionDepth',true],['bad-version','sourceData.diagnostics.B.sessionDepth.version="unknown"',true],['missing-old-day','sourceData.diagnostics.B.sessionDepth.rows.shift()',false],['bad-old-day','sourceData.diagnostics.B.sessionDepth.rows[0].startInclusive="2026-01-01T00:00:00Z"',false],['bad-old-count','sourceData.diagnostics.B.sessionDepth.rows[0].cells[0].activeAccounts++',false],['wrong-current-window','sourceData.diagnostics.B.sessionDepth.rows.at(-1).startInclusive="2026-09-22T00:00:00Z"',true],['missing-cell','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells.pop()',true],['duplicate-cell','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0]=sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[1]',true],['negative-count','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].durationSecondsFrequency[0][1]=-1',true],['wrong-denominator','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].activeAccounts++',true],['duplicate-frequency','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].accountSessionFrequency.push([1,0])',true],['too-many-durations','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].durationSecondsFrequency[0][1]+=99999',true],['unsafe-count','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].accountSessionFrequency[0][1]=Number.MAX_SAFE_INTEGER',true],['zero-seconds','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].durationSecondsFrequency[0][0]=0',true],['over-day-duration','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].durationSecondsFrequency[0][0]=86401',true],['duplicate-seconds','sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].durationSecondsFrequency.push([30,0])',true]];
for(const[name,mutation,currentBad]of faults){restore();evaluate(mutation);project({});assert.equal(evaluate('metric(26).kind'),currentBad?'na':'group',name);assert.equal(evaluate('metricHistory(26)'),null,name);assert.equal(evaluate('metric(25).value.appDAU'),8400,name);if(currentBad)assert.ok(evaluate(`retentionContextTable(sourceData.diagnostics.B.tables.find(t=>t.title==='使用深度与核心功能')).rows.filter(r=>r[0].startsWith('App人均')||r[0].startsWith('单次前台')).every(r=>r[1]==='待核验')`),name+' context');if(!currentBad)assert.ok(evaluate('sessionDepthProjection().historyReason'),name);}
restore();project({});const baseline=evaluate('actionBaselineValue(26)');assert.equal(evaluate('baselineWindowEnd(actionBaselineWindow(26))'),'2026-09-24');
assert.equal(evaluate('baselineWindowEnd("会话日口径v1 · 2026-09-22 → 2026-09-24 UTC零时（左含右不含）")'),null);
// Frequency order cannot create a spurious change. A changed duration shape with
// identical headline values must still be detected and retained as evidence.
evaluate('sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].durationSecondsFrequency.reverse()');project({});assert.equal(evaluate('actionBaselineValue(26)'),baseline);
restore();evaluate('sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].durationSecondsFrequency[0][1]++;sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells[0].durationSecondsFrequency[1][1]--');project({});assert.equal(evaluate('metric(26).value.durationP50Minutes'),4.5);assert.equal(evaluate('metric(26).value.durationP90Minutes'),26);assert.notEqual(evaluate('actionBaselineValue(26)'),baseline);
restore();evaluate('for(const c of sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells)c.durationSecondsFrequency=[]');project({});assert.equal(evaluate('metric(26).value.sessionsPerUser'),2.1);assert.equal(evaluate('metric(26).value.durationP50Minutes'),null);assert.equal(evaluate('sessionDepthProjection().current.timedSessions'),0);
restore();evaluate('for(const c of sourceData.diagnostics.B.sessionDepth.rows.at(-1).cells)c.durationSecondsFrequency=[[30,2]]');project({});assert.equal(evaluate('sessionDepthProjection().current.timedSessions'),16);assert.equal(evaluate('metric(26).value.durationP90Minutes'),null);
assert.equal(evaluate('frequencyQuantile([[30,29]],.5)'),null);assert.match(evaluate('sessionDepthChange(2.1,2.099,"次/人",2)'),/增加不足0.01/);
restore();project({});assert.ok(evaluate('trendAxisDomain([metricHistory(26).values],"次/人").max-trendAxisDomain([metricHistory(26).values],"次/人").min<1'));
for(const size of[0,12]){
 restore();evaluate(`for(const row of sourceData.activityWindowFacts.rows)row.records.forEach((r,i)=>r.outcomes=i===0&&${size}?[{count:${size},compositeAge:0,appAge:0}]:[]);for(const [i,r]of sourceData.activityWindowFacts.currentComposition.entries()){r.composite=r.app=i===0?${size}:0;for(const k of Object.keys(r.exclusive))r.exclusive[k]=i===0&&k==='appOnly'?${size}:0;}sourceData.metrics.m04.value=${size};for(const k of Object.keys(sourceData.metrics.m25.value))sourceData.metrics.m25.value[k]=${size};Object.assign(sourceData.metrics.m30.value,{composite:${size},app:${size},content:0,pushClicked:0});for(const k of Object.keys(sourceData.metrics.m30.value.exclusiveCells))sourceData.metrics.m30.value.exclusiveCells[k]=k==='appOnly'?${size}:0;for(const row of sourceData.diagnostics.B.chart.series)row.values=row.values.map(()=>${size});for(const row of sourceData.diagnostics.B.sessionDepth.rows)row.cells.forEach((c,i)=>{c.activeAccounts=i===0?${size}:0;c.accountSessionFrequency=[[1,c.activeAccounts]];c.durationSecondsFrequency=c.activeAccounts?[[30,c.activeAccounts]]:[];});`);
 project({});assert.equal(evaluate('metric(26).kind'),'group');assert.equal(evaluate('sessionDepthProjection().current.accounts'),size);assert.equal(evaluate('metric(26).value.sessionsPerUser'),null);assert.equal(evaluate('metric(26).value.durationP50Minutes'),null);assert.equal(evaluate('hasRegistrationBaseline(26)'),false);
}
console.log(JSON.stringify({cases,sourceGuardChecks:faults.length,partialDurationCounts:true,baselineShapeComparison:true}));
