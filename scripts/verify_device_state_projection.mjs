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

const cases=[];let neutralChecks=0;
for(const country of['','US','UK','DE','Other'])for(const appPlatform of['','iOS','Android'])for(const productLine of['','Bird','Hunting'])for(const deviceModel of['','K6','Bird Lite','Bird Pro','Hunt Pro'])for(const deviceStatus of['','Effective','Inactive']){
 const state=Object.fromEntries(Object.entries({country,appPlatform,productLine,deviceModel,deviceStatus}).filter(([,v])=>v)),v=project(state);
 if(v.m50.kind!=='group')continue;const x=v.m50.value,part=JSON.parse(evaluate('JSON.stringify(deviceStateProjection())'));
 assert.equal(x.boundActivated+x.boundNotActivated,part.boundCurrent);assert.equal(x.boundActivated+x.activatedUnbound,part.activatedCumulative);
 assert.equal(x.sharedBoundActivated+x.sharedBoundNotActivated,part.shared);assert.ok(x.sharedBoundActivated<=x.boundActivated&&x.sharedBoundNotActivated<=x.boundNotActivated);
 if(v.m49.kind==='rate'){assert.equal(part.shared,v.m49.numerator);assert.equal(part.boundCurrent,v.m49.denominator);}
 if(!appPlatform&&v.m08.kind==='group'){assert.equal(part.boundCurrent,v.m08.value.boundCurrent);assert.equal(part.activatedCumulative,v.m08.value.activatedCumulative);}
 cases.push({state,part,sharing:v.m49,inventory:v.m08});
 if(!deviceStatus){const old=JSON.parse(JSON.stringify(v)),next=project({...state,deviceStatus:'Effective'});for(const item of fixtures.filterPolicy.metrics.filter(p=>p.demonstrableDimensions.includes('deviceStatus'))){assert.deepEqual(JSON.parse(JSON.stringify(next['m'+String(item.id).padStart(2,'0')])),old['m'+String(item.id).padStart(2,'0')],`Default status changes #${item.id} ${JSON.stringify(state)}`);neutralChecks++;}}
}
const restore=()=>evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures))');
const faults=[['missing-states','delete sourceData.metrics.m50',false,false],['negative-subset','sourceData.metrics.m50.value.sharedBoundActivated=-1',false,false],['over-shared','sourceData.metrics.m50.value.sharedBoundNotActivated=4001',false,false],['bad-state-total','sourceData.metrics.m50.value.boundActivated++',false,false],['bad-activated-total','sourceData.metrics.m50.value.activatedUnbound++',false,false],['bad-parent','sourceData.metrics.m08.value.boundCurrent++',true,false],['bad-snapshot','sourceData.snapshot.boundDevicesCurrent++',true,true],['bad-share-total','sourceData.metrics.m49.numerator++',false,true],['over-share','sourceData.metrics.m49.numerator=143801',false,true],['wrong-share-denominator','sourceData.metrics.m49.denominator++',false,true],['wrong-rate','sourceData.metrics.m49.value=.5',false,true],['missing-share','delete sourceData.metrics.m49',false,true]];
for(const[name,mutation,bad8,bad49]of faults){restore();evaluate(mutation);project({});assert.equal(evaluate('metric(50).availability'),'pending',name);assert.equal(evaluate('metric(8).kind'),bad8?'na':'group',name);assert.equal(evaluate('metric(49).kind'),bad49?'na':'rate',name);assert.equal(evaluate('metric(35).kind'),'group',name);}
restore();project({});assert.deepEqual(JSON.parse(evaluate('JSON.stringify(metric(50).value)')),fixtures.metrics.m50.value);assert.match(evaluate('actionBaselineValue(50)'),/^设备状态计数：/);
project({deviceModel:'K6'});assert.equal(evaluate('metric(49).numerator'),2572);assert.equal(evaluate('metric(50).value.sharedBoundActivated+metric(50).value.sharedBoundNotActivated'),2572);
restore();evaluate('for(const k of Object.keys(sourceData.metrics.m50.value))sourceData.metrics.m50.value[k]=0;sourceData.metrics.m08.value={activatedCumulative:0,boundCurrent:0};sourceData.snapshot.activatedDevicesCumulative=0;sourceData.snapshot.boundDevicesCurrent=0;sourceData.metrics.m49={kind:"rate",numerator:0,denominator:0,value:0};');project({});assert.equal(evaluate('metric(50).kind'),'group');assert.equal(evaluate('metric(49).kind'),'na');assert.equal(evaluate('deviceStateProjection().shared'),0);
console.log(JSON.stringify({cases,neutralChecks,sourceGuardChecks:faults.length,knownZero:true}));
