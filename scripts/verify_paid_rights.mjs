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

const read=code=>JSON.parse(evaluate(`JSON.stringify(${code})`));
const restore=()=>evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures))');
for(const country of ['', 'US','UK','DE','Other'])for(const appPlatform of ['', 'iOS','Android'])for(const subscriptionPlatform of ['', 'App Store','Google Play','Web']) {
 const state=Object.fromEntries(Object.entries({country,appPlatform,subscriptionPlatform}).filter(([,v])=>v));
 const m=project(state),rights=read('paidRightsFacts()'),pack=read('packPenetrationFacts()');
 assert.equal(m.m34.kind,'count',JSON.stringify(state));assert.equal(m.m36.kind,'group',JSON.stringify(state));
 assert.equal(m.m34.value,pack.anyPack.denominator);assert.ok(rights.packOnly>=0&&rights.packOnly<=150);
 assert.equal(m.m36.value.anyPack.value,pack.anyPack.numerator/rights.total);
 assert.ok(pack.products.every(r=>r.numerator<=pack.anyPack.numerator&&r.denominator===rights.total));
}
for(const state of [{plan:'Plus'},{plan:'Free'},{productLine:'Bird'},{productLine:'Hunting'},{country:'US',productLine:'Bird',plan:'Pro'}]) {
 const m=project(state);assert.equal(m.m34.availability,'pending');assert.equal(m.m36.availability,'pending');
 for(const id of [34,36])assert.equal(evaluate(`metricHistory(${id})`),null);
}
project({billingCycle:'monthly'});assert.equal(evaluate('metric(34).availability'),'pending');assert.equal(evaluate('metric(36).value.anyPack.denominator'),12550);
project({});assert.equal(evaluate('paidRightsFacts().subscriptions'),12400);assert.equal(evaluate('packPenetrationFacts().membershipSum'),4050);assert.equal(evaluate('packPenetrationFacts().duplicateMemberships'),900);
const faults=[
 'sourceData.metrics.m34.value++',
 'sourceData.snapshot.paidUsersIncludingPackOnly++',
 'sourceData.snapshot.packOnlyUsers=-1',
 'sourceData.metrics.m05.value.bird.paidCurrent++',
 'sourceData.metrics.m36=null',
 'delete sourceData.metrics.m36.value.anyPack',
 'sourceData.metrics.m36.value.anyPack.numerator=null',
 'sourceData.metrics.m36.value.anyPack.denominator++',
 'sourceData.metrics.m36.value.anyPack.numerator=100',
 'sourceData.metrics.m36.value.anyPack.numerator=5000',
 'sourceData.metrics.m36.value.byPack["HD Pack"].numerator=-1',
 'sourceData.metrics.m36.value.byPack["HD Pack"].numerator=3151',
 'sourceData.metrics.m36.value.byPack["HD Pack"].numerator=1.5',
 'sourceData.metrics.m36.value.byPack["HD Pack"].denominator--',
 'delete sourceData.metrics.m36.value.byPack["Device Pack"]',
 'sourceData.metrics.m36.value.byPack.extra={kind:"rate",numerator:1,denominator:12550}',
 'sourceData.metrics.m36.value.byPack=null',
];
for(const fault of faults){restore();evaluate(fault);project({});assert.equal(evaluate('metric(36).availability'),'pending',fault);
 assert.ok(evaluate('paidRightsComposition().reason'),fault);assert.equal(evaluate('metric(35).value.ARPPU'),5.2);
 for(const title of ['收入与权益口径','权益与Pack持有结构']){const t=read(`paidContextTable(sourceData.diagnostics.E.tables.find(t=>t.title===${JSON.stringify(title)}))`);assert.ok(JSON.stringify(t).includes(evaluate('packPenetrationFacts().reason')),fault);}
}
restore();evaluate('sourceData.metrics.m36.value.byPack["Extra Memory Pack"].numerator=1250');project({});assert.equal(evaluate('metric(36).value.byPack["Extra Memory Pack"].numerator'),1250);assert.equal(evaluate('packPenetrationFacts().membershipSum'),4100);assert.equal(evaluate('packPenetrationFacts().duplicateMemberships'),950);
restore();evaluate('sourceData.metrics.m36.value.byPack["狩猎 AI Agent Pack"].numerator=0');project({});assert.equal(evaluate('metric(36).value.byPack["狩猎 AI Agent Pack"].value'),0);
// Count-only boundary fixtures. Unrelated financial/monthly sources are not reconciled.
for(const total of [0,20]) {
 restore();evaluate(`sourceData.metrics.m02.value=${total};sourceData.metrics.m34.value=${total};Object.assign(sourceData.snapshot,{effectiveSubscribers:${total},paidUsersIncludingPackOnly:${total},packOnlyUsers:0});
 for(const p of Object.values(sourceData.metrics.m05.value)){p.paidCurrent=0;p.cancelledButEntitled=0;}sourceData.metrics.m05.value.bird.paidCurrent=${total};
 for(const p of [sourceData.metrics.m36.value.anyPack,...Object.values(sourceData.metrics.m36.value.byPack)]){p.numerator=0;p.denominator=${total};}`);
 project({});assert.equal(evaluate('metric(34).value'),total);assert.equal(evaluate('metric(36).kind'),'na');assert.equal(evaluate('metric(36).availability'),undefined);assert.equal(evaluate('packPenetrationFacts().anyPack.denominator'),total);assert.equal(evaluate('metricHistory(34)'),null);
 const table=read('packPenetrationTable()');assert.ok(table.rows.every(r=>r[2]===total&&!r[3].includes('%')));
}
restore();project({});assert.equal(evaluate('metric(34).value'),12550);assert.equal(evaluate('metric(36).value.anyPack.numerator'),3150);
console.log('PASS 60 valid scopes; unavailable plan/product preserve applicability; 17 source faults; common denominators; changed counts and known zeros; zero/low population count-only boundaries; no stale supplemental rights');
