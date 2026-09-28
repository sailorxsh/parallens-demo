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
  subscriptionFlow:file('subscription-flow'),
};
const context=vm.createContext({
  __fixtures:fixtures,document:{querySelector:()=>null},window:{addEventListener:()=>{}},
  localStorage:{getItem:()=>null},URLSearchParams,location:{hash:''},console,
});
const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/\nstart\(\);\s*$/,'\n');
vm.runInContext(source,context,{filename:'app.js'});
vm.runInContext('sourceData=__fixtures',context);
const project=filters=>vm.runInContext(`filterState=${JSON.stringify(filters)};projectDataset();dataset.metrics`,context);
const evaluate=expression=>vm.runInContext(expression,context);

let result=project({productLine:'Bird'});
assert.equal(result.m02.value,8000);
assert.equal(result.m06.numerator,8000);
assert.equal(result.m06.denominator,57680);
assert.equal(result.m21.value.opening,7750);
assert.equal(result.m21.value.closing,8000);
assert.equal(evaluate('trendValues(2).at(-1)'),8000);
assert.ok(evaluate('trendValues(2).at(-1)-trendValues(2).at(-2)')>0);

for(const filters of [
  {productLine:'Bird'},{productLine:'Hunting'},
  {productLine:'Bird',country:'US'},{productLine:'Hunting',country:'UK'},
  {productLine:'Bird',appPlatform:'iOS'},
]) {
  result=project(filters);
  const flow=result.m21.value;
  assert.equal(flow.opening+flow.trialPaid+flow.directPaid+flow.recovered-flow.lost,flow.closing,JSON.stringify(filters));
  assert.equal(flow.closing,result.m02.value,JSON.stringify(filters));
  assert.ok(Object.values(flow).every(value=>value>=0),JSON.stringify(filters));
}

for(const filters of [{country:'US'},{country:'US',productLine:'Bird'},{appPlatform:'iOS'}]) {
  result=project(filters);
  assert.equal(result.m02.value,result.m06.numerator,JSON.stringify(filters));
  const eligible=Object.values(result.m05.value).reduce((sum,line)=>sum+Object.values(line).reduce((a,b)=>a+b,0),0);
  assert.equal(result.m06.denominator,eligible,JSON.stringify(filters));
}

result=project({week:'12'});
assert.equal(result.m02.value,12400);
assert.equal(result.m18.numerator,434);
assert.equal(result.m18.denominator,1000);
assert.equal(evaluate('metricHistory(2).values.at(-1)'),12400);
assert.equal(project({}).m34.value,12550);
assert.equal(evaluate('metricHistory(34).labels.at(-1)'),'9/24');

assert.equal(project({season:'Migration'}).m29.numerator,4200);
assert.equal(project({season:'Other'}).m29.numerator,1800);
result=project({functionType:'Recognition'});
assert.equal(result.m27.numerator,14000);
assert.equal(result.m27.denominator,68000);
assert.equal(project({functionType:'Live'}).m27.numerator,26000);

const firmware28=project({firmware:'2.8'});
const firmwareOther=project({firmware:'Other'});
assert.ok(firmware28.m45.value.networkSuccess.value<firmwareOther.m45.value.networkSuccess.value);
assert.ok(firmware28.m46.value.live.value<firmwareOther.m46.value.live.value);
result=project({deviceModel:'K6',firmware:'2.8',functionType:'Live'});
assert.equal(result.m46.value.live.denominator,400);
assert.equal(result.m46.value.live.numerator,365);

result=project({country:'US',deviceModel:'K6'});
assert.equal(result.m39.kind,'group');
assert.ok(result.m39.value.K6.owners>0);
assert.ok(result.m39.value.K6.subscriptionRate>0);
const usK6=fixtures.modelMarket.records.find(row=>row.country==='US'&&row.model==='K6');
assert.equal(result.m39.value.K6.owners,usK6.owners);
assert.equal(Math.round(result.m39.value.K6.subscriptionRate*usK6.owners),usK6.subscribedOwners);

result=project({subscriptionPlatform:'App Store'});
const appStore=fixtures.trialFacts.records.filter(row=>row.week===12&&row.subscription_platform==='App Store');
assert.equal(result.m18.denominator,appStore.length);
assert.equal(result.m18.numerator,appStore.filter(row=>row.converted).length);
result=project({productLine:'Hunting',plan:'Starter'});
assert.equal(result.m18.kind,'rate');
assert.equal(result.m18.denominator,84);
assert.equal(result.m18.numerator,30);
assert.equal(project({productLine:'Bird',plan:'Starter'}).m18.kind,'na');

result=project({functionType:'Recognition'});
assert.equal(result.m27.numerator,14000);
assert.equal(result.m04.value,project({}).m04.value);
assert.equal(result.m24.value,project({}).m24.value);
assert.equal(result.m25.kind,'group');
assert.equal(result.m29.kind,'rate');
assert.equal(evaluate('primaryHeroIds.B.length'),4);
assert.ok(evaluate('relevantFilters("B").includes("functionType")'));
assert.equal(evaluate('availableOptions("C","functionType").includes("Recognition")'),false);
assert.equal(evaluate('routeHref("C").includes("functionType")'),false);
console.log('PASS business filters, linked model/trial facts, stable hero metrics and existing projections');
