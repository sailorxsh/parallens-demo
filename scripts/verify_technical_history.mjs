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

const cases=[],scopeFields=[['',''],['Bird',''],['Hunting',''],['','K6'],['','Bird Lite'],['','Bird Pro'],['','Hunt Pro'],['Bird','K6'],['Hunting','Hunt Pro']];
for(const [productLine,deviceModel]of scopeFields)for(const firmware of['','2.8','Other'])for(const deviceStatus of['','Effective'])for(const functionType of['','Upload','Live','Push']) {
 const state=Object.fromEntries(Object.entries({productLine,deviceModel,firmware,deviceStatus,functionType}).filter(([,v])=>v));project(state);
 cases.push({state,part:JSON.parse(evaluate('JSON.stringify(technicalHistoryProjection())')),headline:JSON.parse(evaluate('JSON.stringify(metricHistory(46))'))});
}
const restore=()=>evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures))'),faultResults=[];
const faults=[
 ['missing-history','delete sourceData.technicalFacts.dailyHistory',false],
 ['missing-day','sourceData.technicalFacts.dailyHistory.rows.pop()',false],
 ['duplicate-day','sourceData.technicalFacts.dailyHistory.rows[1].date=sourceData.technicalFacts.dailyHistory.rows[0].date',false],
 ['future-window','sourceData.technicalFacts.dailyHistory.endExclusive="2026-09-25T00:00:00Z"',false],
 ['wrong-version','sourceData.technicalFacts.dailyHistory.version="unknown"',false],
 ['unknown-source','sourceData.technicalFacts.dailyHistory.provenance="production"',false],
 ['null-history-row','sourceData.technicalFacts.dailyHistory.rows[0]=null',false],
 ['missing-cell','sourceData.technicalFacts.dailyHistory.rows[1].records.pop()',false],
 ['repeated-cell','sourceData.technicalFacts.dailyHistory.rows[1].records[0]=sourceData.technicalFacts.dailyHistory.rows[1].records[1]',false],
 ['invalid-model','sourceData.technicalFacts.dailyHistory.rows[1].records[0].model="bad"',false],
 ['negative-count','sourceData.technicalFacts.dailyHistory.rows[1].records[0].liveFailures=-1',false],
 ['fractional-count','sourceData.technicalFacts.dailyHistory.rows[1].records[0].attempts=1.5',false],
 ['over-count','sourceData.technicalFacts.dailyHistory.rows[1].records[0].liveFailures=10000',false],
 ['current-mismatch','sourceData.technicalFacts.dailyHistory.rows.at(-1).records[0].liveFailures++',false],
 ['bad-current','sourceData.technicalFacts.records[0].liveFailures=-1',true],
 ['current-anchor','sourceData.metrics.m46.value.live.numerator--',true],
 ['missing-current','sourceData.technicalFacts.records.pop()',true],
];
for(const [name,fault,currentBad]of faults){restore();evaluate(fault);project({});assert.ok(evaluate('technicalHistoryProjection().reason'),name);assert.equal(evaluate('metricHistory(46)'),null,name);
 assert.equal(evaluate('metric(46).kind'),currentBad?'na':'group',name);if(currentBad)assert.equal(evaluate('metric(46).availability'),'pending');else assert.equal(evaluate('metric(46).value.live.numerator'),9700);
 assert.equal(evaluate('metric(41).kind'),'rate');faultResults.push({name,currentBad});}
for(const total of[0,20]) {
 restore();evaluate(`for(const [i,row]of sourceData.technicalFacts.records.entries()){row.attempts=i===0?${total}:0;for(const f of Object.values(technicalChains))row[f]=0;}
 for(const [name,r]of Object.entries(sourceData.metrics.m46.value)){r.numerator=${total};r.denominator=${total};}
 sourceData.technicalFacts.dailyHistory.rows.at(-1).records=JSON.parse(JSON.stringify(sourceData.technicalFacts.records));`);project({});
 assert.equal(evaluate('metric(46).kind'),'na');assert.equal(evaluate('technicalHistoryProjection().day.live.denominator'),total);assert.equal(evaluate('technicalHistoryProjection().rows.at(-1).counts.live.numerator'),total);assert.equal(evaluate('technicalHistoryHeadline().values.at(-1)'),null);
}
restore();project({});assert.equal(evaluate('actionBaselineWindow(46)'),'快照 2026-09-24');
assert.equal(evaluate('technicalHistoryHeadline().values.at(-1)'),97);
console.log(JSON.stringify({cases,sourceGuardChecks:faultResults,smallPopulationBoundaries:[0,20]}));
