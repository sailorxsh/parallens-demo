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

const cases=[];for(const country of['','US','UK','DE','Other'])for(const appPlatform of['','iOS','Android']) {
 const state=Object.fromEntries(Object.entries({country,appPlatform}).filter(([,v])=>v));project(state);
 cases.push({state,current:JSON.parse(evaluate('JSON.stringify(metric(7))')),history:JSON.parse(evaluate('JSON.stringify(accountStockHistory())'))});
}
const restore=()=>evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures))');
const faults=[
 ['missing-history','delete sourceData.diagnostics.A.accountHistory.months',false],
 ['missing-month','sourceData.diagnostics.A.accountHistory.months.pop()',false],
 ['wrong-date','sourceData.diagnostics.A.accountHistory.months[0].date="2025-09-29"',false],
 ['wrong-boundary','sourceData.diagnostics.A.accountHistory.months[0].endExclusive="2025-09-30T00:00:00Z"',false],
 ['negative-count','sourceData.diagnostics.A.accountHistory.months[0].records[0].registered=-1',false],
 ['over-bound','sourceData.diagnostics.A.accountHistory.months[0].records[0].boundOwners=999999',false],
 ['duplicate-grain','sourceData.diagnostics.A.accountHistory.months[0].records[0]=sourceData.diagnostics.A.accountHistory.months[0].records[1]',false],
 ['missing-grain','sourceData.diagnostics.A.accountHistory.months[0].records.pop()',false],
 ['month-closure','sourceData.diagnostics.A.accountHistory.months[11].records[0].registered++',false],
 ['bridge-week','sourceData.diagnostics.A.accountHistory.registrationBridge.days[0].registered++',false],
 ['bridge-tail','sourceData.diagnostics.A.accountHistory.registrationBridge.days.at(-1).registered++',false],
 ['bridge-date','sourceData.diagnostics.A.accountHistory.registrationBridge.days[0].date="2026-06-21"',false],
 ['bad-current','sourceData.diagnostics.A.accountHistory.current.records[0].registered=-1',true],
 ['bad-anchor','sourceData.metrics.m07.value.registered++',true],
 ['bad-snapshot','sourceData.snapshot.boundOwnerAccounts++',true],
 ['bad-country','sourceData.diagnostics.A.accountHistory.current.records[0].country="unknown"',true],
 ['cross-margin','sourceData.diagnostics.A.accountHistory.current.records[0].registered++;sourceData.diagnostics.A.accountHistory.current.records[2].registered--',true],
];
for(const [name,fault,currentBad]of faults){restore();evaluate(fault);project({});assert.ok(evaluate('accountStockHistory().reason'),name);assert.equal(evaluate('metricHistory(7)'),null,name);assert.equal(evaluate('metric(7).kind'),currentBad?'na':'group',name);if(currentBad)assert.equal(evaluate('metric(7).availability'),'pending');else assert.equal(evaluate('metric(7).value.registered'),128600,name);}
restore();project({});assert.equal(evaluate('actionBaselineValue(7)'),'累计注册用户：128,600人；当前绑定主账号：82,400人');assert.equal(evaluate('actionBaselineWindow(7)'),'快照 2026-09-24');
assert.equal(project({country:'US',appPlatform:'iOS'}).m07.value.registered,37615);
// Current known zero is valid stock; incompatible historical stock is withheld.
restore();evaluate(`for(const r of sourceData.diagnostics.A.accountHistory.current.records){r.registered=0;r.boundOwners=0;}sourceData.metrics.m07.value={registered:0,boundOwners:0};sourceData.snapshot.registeredCumulative=0;sourceData.snapshot.boundOwnerAccounts=0;`);project({});assert.equal(evaluate('metric(7).value.registered'),0);assert.ok(evaluate('accountStockHistory().reason'));
console.log(JSON.stringify({cases,sourceGuardChecks:faults.length,knownZero:true}));
