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
  subscriptionFlow:file('subscription-flow'),bindingDeviceFacts:file('binding-device-facts'),deviceActivityFacts:file('device-activity-facts'),
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
// Device counts, the enumerable list and all historical snapshots share event facts.
const deviceFacts=fixtures.bindingDeviceFacts;
const expectedDevices=(filters={},at=Date.parse(deviceFacts.asOf))=>deviceFacts.records.filter(row=>
  Date.parse(row.boundAt)<at-72*3600000&&(!row.firstImageAt||Date.parse(row.firstImageAt)>at)&&
  Object.entries(filters).every(([key,value])=>row[key]===value));
for(const country of ['', 'US','UK','DE','Other'])for(const productLine of ['', 'Bird','Hunting']) {
  const filters=Object.fromEntries(Object.entries({country,productLine}).filter(([,value])=>value));
  const values=project(filters);assert.equal(values.m15.value,expectedDevices(filters).length);
  const history=evaluate('metricHistory(15)');
  assert.deepEqual(JSON.parse(JSON.stringify(history.values)),deviceFacts.snapshots.map(point=>expectedDevices(filters,Date.parse(point.at)).length));
  const models=['K6','Bird Lite','Bird Pro','Hunt Pro'].filter(model=>!productLine||(model==='Hunt Pro')===(productLine==='Hunting'));
  assert.equal(models.reduce((sum,model)=>sum+project({...filters,deviceModel:model}).m15.value,0),values.m15.value);
}
assert.equal(project({productLine:'Hunting'}).m15.value,29);
assert.equal(project({productLine:'Bird'}).m15.value,99);
project({});assert.equal(evaluate('metric(15).value'),128);
assert.deepEqual(JSON.parse(evaluate('JSON.stringify(trendValues(15))')),fixtures.metricTrends.m15.points.map(p=>p.value));
for(const corrupt of [
 'sourceData.bindingDeviceFacts.records[0].id=sourceData.bindingDeviceFacts.records[1].id',
 'sourceData.bindingDeviceFacts.records.pop()',
 'sourceData.bindingDeviceFacts.records[0].productLine="Hunting"',
 'sourceData.bindingDeviceFacts.records[0].boundAt="2026-02-30T00:00:00Z"',
]){
 evaluate(`sourceData=JSON.parse(JSON.stringify(__fixtures));${corrupt}`);project({});
 assert.equal(evaluate('metric(15).availability'),'pending','Invalid device facts were replaced with aggregate counts');
}
evaluate('sourceData=__fixtures');project({});
// A device becomes eligible strictly after 72 hours; first image at the snapshot excludes it.
for(const [kind,expected] of [['exact72',127],['over72',128],['imageAtSnapshot',127]]) {
 evaluate(`sourceData=JSON.parse(JSON.stringify(__fixtures));
  {const source=sourceData.bindingDeviceFacts,row=source.records.at(-1),at=Date.parse(source.asOf);
   if(${JSON.stringify(kind)}==='imageAtSnapshot')row.firstImageAt=source.asOf;
   else row.boundAt=new Date(at-72*3600000-(${JSON.stringify(kind)}==='over72'?1000:0)).toISOString().replace('.000Z','Z');
   source.snapshots.forEach((point,index)=>{const time=Date.parse(point.at);point.count=source.records.filter(r=>Date.parse(r.boundAt)<time-72*3600000&&(!r.firstImageAt||Date.parse(r.firstImageAt)>time)).length;sourceData.metricTrends.m15.points[index].value=point.count;});sourceData.metrics.m15.value=source.snapshots.at(-1).count;}`);
 project({});assert.equal(evaluate('metric(15).value'),expected,`Incorrect device event boundary ${kind}`);
}
evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures));sourceData.bindingDeviceFacts.records=[];sourceData.bindingDeviceFacts.snapshots.forEach(p=>p.count=0);sourceData.metricTrends.m15.points.forEach(p=>p.value=0);sourceData.metrics.m15.value=0');
project({});assert.equal(evaluate('metric(15).value'),0,'Known empty complete facts are not missing data');
evaluate('sourceData=__fixtures');project({});
// Active windows and unused thresholds use the same disjoint device-age cells.
const activityFacts=fixtures.deviceActivityFacts;
const activityExpected=(filters,point=activityFacts.snapshots.at(-1))=>{
 const rows=point.records.filter(row=>Object.entries(filters).every(([k,v])=>['country','productLine','deviceModel','firmware','deviceStatus'].includes(k)?row[k]===v:true));
 const bands=Array.from({length:5},(_,i)=>rows.reduce((n,r)=>n+r.counts[i],0));
 return {bands,total:bands.reduce((a,b)=>a+b,0),active:bands.slice(0,4).reduce((a,b)=>a+b,0),unused21:bands[3]+bands[4],unused30:bands[4]};
};
for(const country of ['', 'US','UK','DE','Other'])for(const productLine of ['', 'Bird','Hunting'])
for(const deviceModel of ['', 'K6','Bird Lite','Bird Pro','Hunt Pro'])for(const firmware of ['', '2.8','Other']){
 const filters=Object.fromEntries(Object.entries({country,productLine,deviceModel,firmware}).filter(([,v])=>v));
 const expected=activityExpected(filters),result=project(filters);
 if(!expected.total){assert.equal(result.m41.kind,'na');assert.equal(result.m44.kind,'na');continue;}
 assert.equal(result.m41.numerator,expected.active);assert.equal(result.m41.denominator,expected.total);
 assert.equal(result.m44.numerator,expected.unused21);assert.equal(result.m44.denominator,expected.total);
 assert.equal(project({...filters,season:'Other'}).m44.numerator+project(filters).m41.numerator,expected.total);
 const windows=evaluate('deviceActivitySummary(41)');assert.ok(windows.active1<=windows.active7&&windows.active7<=windows.active30);
 const history=evaluate('metricHistory(41)');assert.deepEqual(JSON.parse(JSON.stringify(history.values)),activityFacts.snapshots.map(point=>{const e=activityExpected(filters,point);return e.active/e.total*100}));
 const unused=evaluate('metricHistory(44)');assert.deepEqual(JSON.parse(JSON.stringify(unused.values)),activityFacts.snapshots.map(point=>{const e=activityExpected(filters,point);return e.unused21/e.total*100}));
 for(const season of ['Migration','Other']){
  project({...filters,season});const cohort=activityFacts.returnCohorts.find(p=>p.thresholdDays===(season==='Other'?30:21));
  const rows=cohort.records.filter(row=>Object.entries(filters).every(([k,v])=>row[k]===v));
  const actual=evaluate('deviceReturnSummary()');assert.equal(actual.numerator,rows.reduce((n,r)=>n+r.returned,0));assert.equal(actual.denominator,rows.reduce((n,r)=>n+r.eligible,0));
 }
}
for(const corrupt of [
 'sourceData.deviceActivityFacts.snapshots.at(-1).records.pop()',
 'sourceData.deviceActivityFacts.snapshots[0].records[1]=sourceData.deviceActivityFacts.snapshots[0].records[0]',
 'sourceData.deviceActivityFacts.snapshots[0].records[0].counts[0]++',
 'sourceData.deviceActivityFacts.snapshots[0].records[0].productLine="Hunting"',
 'sourceData.deviceActivityFacts.snapshots[0].records[0]=null',
 'sourceData.deviceActivityFacts.ageBands[0][1]=2',
 'sourceData.deviceActivityFacts.snapshots[0].observedFrom="2026-02-30T00:00:00Z"',
 'sourceData.deviceActivityFacts.snapshots.at(-1).observedFrom="2026-09-01T00:00:00Z"',
 'sourceData.deviceActivityFacts.asOf="2026-09-25T00:00:00Z"',
]){
 evaluate(`sourceData=JSON.parse(JSON.stringify(__fixtures));${corrupt}`);const result=project({});
 assert.equal(result.m41.availability,'pending');assert.equal(result.m44.availability,'pending');assert.equal(evaluate('metricHistory(41)'),null);
}
for(const corrupt of [
 'sourceData.deviceActivityFacts.returnCohorts[0].records.pop()',
 'sourceData.deviceActivityFacts.returnCohorts[0].records[0].returned=99999',
 'sourceData.deviceActivityFacts.returnCohorts[0].observedThrough="2026-09-16T00:00:00Z"',
 'sourceData.deviceActivityFacts.returnCohorts[0].entryAt="2026-09-20T00:00:00Z";sourceData.deviceActivityFacts.returnCohorts[0].observedThrough="2026-09-27T00:00:00Z"',
]){
 evaluate(`sourceData=JSON.parse(JSON.stringify(__fixtures));${corrupt}`);assert.equal(project({}).m41.value,.61);
 assert.ok(evaluate('deviceReturnSummary().reason'),'Unmatured or incomplete history borrows a current denominator');
}
evaluate('sourceData=__fixtures');project({});
assert.equal(evaluate('metric(44).numerator'),60000);assert.equal(evaluate('metric(41).value'),.61);
assert.match(evaluate('actionBaselineWindow(41)'),/设备行为口径v1/);assert.equal(evaluate('baselineWindowEnd(actionBaselineWindow(41))'),'2026-09-24');
assert.match(evaluate('actionBaselineWindow(44)'),/21天未使用/);project({season:'Other'});assert.match(evaluate('actionBaselineWindow(44)'),/30天未使用/);
assert.equal(project({deviceStatus:'Inactive'}).m41.kind,'na');assert.equal(project({deviceStatus:'Inactive'}).m44.kind,'na');
project({});

// Failure categories are exact W12 attempts, never estimates borrowed for another scope.
const binding=evaluate('bindingFailureEvidence()');
assert.deepEqual(JSON.parse(JSON.stringify(binding.spec.series[0].values)),[85,70,45]);
assert.equal(binding.table.rows.at(-1)[1],200);
assert.equal(binding.table.rows[0][3],'42.5%');
for(const filters of [{week:'12'},{country:'US'},{productLine:'Bird'},{country:'US',week:'12'}]) {
  project(filters);assert.ok(evaluate('bindingFailureEvidence().spec'),'Applicable W12 overall failure evidence was hidden');
}
for(const filters of [{week:'1'},{week:'11'},{appPlatform:'iOS'},{deviceModel:'K6'},{deviceStatus:'Effective'},{week:'12',appPlatform:'Android'}]) {
  project(filters);assert.ok(evaluate('bindingFailureEvidence().reason'),'Another scope borrowed overall failure causes');
  assert.equal(evaluate('bindingFailureEvidence().spec'),undefined);
}
evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures));sourceData.diagnostics.A.tables.find(t=>t.title==="首次绑定失败原因 · W12").rows[0][1]++');
project({});assert.ok(evaluate('bindingFailureEvidence().reason'),'Corrupt failure categories still draw a distribution');
evaluate('sourceData=__fixtures');project({});
// One user belongs to one activity cell; filtered union and all source margins agree.
const activitySource=fixtures.metrics.m30.value;
const activityMemberships={app:['appOnly','appContentOnly','appPushOnly','allThree'],
  content:['contentOnly','appContentOnly','contentPushOnly','allThree'],
  pushClicked:['pushOnly','appPushOnly','contentPushOnly','allThree']};
for(const country of ['', 'US','UK','DE','Other'])for(const appPlatform of ['', 'iOS','Android'])for(const productLine of ['', 'Bird','Hunting']) {
  const filters=Object.fromEntries(Object.entries({country,appPlatform,productLine}).filter(([,v])=>v));
  const result=project(filters),part=result.m30;
  assert.equal(part.kind,'group',`Activity projection unavailable: ${JSON.stringify(filters)}`);
  const values=part.value,cells=values.exclusiveCells;
  const scale=Object.entries(filters).reduce((s,[key,value])=>s*fixtures.slices[key][value].denominatorShare,1);
  assert.equal(values.composite,Math.round(activitySource.composite*scale));
  assert.equal(Object.values(cells).reduce((s,n)=>s+n,0),values.composite,'Exclusive cells inflate or lose the union');
  for(const [field,keys] of Object.entries(activityMemberships)) {
    assert.equal(keys.reduce((s,key)=>s+cells[key],0),values[field],`Activity source ${field} disagrees with its cells`);
    assert.equal(values[field],Math.round(activitySource[field]*scale),'Independent source margin changed');
  }
  for(const [key,value] of Object.entries(cells)) {
    assert.ok(Number.isInteger(value)&&value>=0&&Math.abs(value-activitySource.exclusiveCells[key]*scale)<1+1e-8);
  }
  assert.equal(values.composite,result.m04.value,'Composite activity disagrees across metrics');
  assert.equal(values.composite,result.m25.value.MAU);
  assert.equal(values.app,result.m25.value.appMAU,'App MAU disagrees across metrics');
}
project({});
assert.deepEqual(JSON.parse(evaluate('JSON.stringify(metric(30).value)')),activitySource,'Unfiltered source facts changed');
for(const corrupt of ['sourceData.metrics.m30.value.exclusiveCells.appOnly++','sourceData.metrics.m30.value.app--']) {
  evaluate(`sourceData=JSON.parse(JSON.stringify(__fixtures));${corrupt}`);project({});
  assert.equal(evaluate('metric(30).availability'),'pending','Inconsistent activity cells were silently rebalanced');
}
evaluate('sourceData=__fixtures');project({});
// A comparison archive contains exact aggregates, not the current single-point baseline.
for(const id of [13,18,35,42]) {
  const evidence=evaluate(`currentComparisonEvidence(${id})`);
  assert.equal(evaluate(`validComparisonEvidence(${JSON.stringify(evidence)},${id})`),true);
  assert.equal(evidence.metricId,id);
  assert.equal(evidence.periods.length,2);
  const reversed={...JSON.parse(JSON.stringify(evidence)),version:99};
  assert.equal(evaluate(`validComparisonEvidence(${JSON.stringify(reversed)},${id})`),false,'Unknown archive versions must not be rendered as verified evidence');
  const corrupt=JSON.parse(JSON.stringify(evidence));corrupt.periods[0].denominator=0;
  assert.equal(evaluate(`validComparisonEvidence(${JSON.stringify(corrupt)},${id})`),false);
  const badDate={...JSON.parse(JSON.stringify(evidence)),asOf:'2026-02-30'};
  assert.equal(evaluate(`validComparisonEvidence(${JSON.stringify(badDate)},${id})`),false);
  if(id===35) {
    const badCent=JSON.parse(JSON.stringify(evidence));badCent.contributions[1].value+=.01;
    assert.equal(evaluate(`validComparisonEvidence(${JSON.stringify(badCent)},35)`),false,'An incorrect income cent must not be trusted');
  }
}
const archivedDevice=JSON.parse(JSON.stringify(evaluate('currentComparisonEvidence(42)')));
assert.deepEqual(archivedDevice.periods.map(p=>[p.numerator,p.denominator]),[[33600,80000],[23200,40000]]);
assert.ok(Math.abs(archivedDevice.groups[0].contribution-16)<1e-9);
const corruptContribution=JSON.parse(JSON.stringify(archivedDevice));corruptContribution.groups[0].contribution=5;
assert.equal(evaluate(`validComparisonEvidence(${JSON.stringify(corruptContribution)},42)`),false,'Archive arithmetic corruption must be identified');
project({country:'US'});
assert.equal(evaluate('currentComparisonEvidence(42)'),null);
assert.equal(evaluate(`validComparisonEvidence(${JSON.stringify(archivedDevice)},42)`),false,'A different scope must not reuse an archive');
project({week:'1'});assert.equal(evaluate('currentComparisonEvidence(13)'),null);
assert.equal(evaluate('currentComparisonEvidence(18)'),null);
project({});
for(const [window,end] of [
 ['完整周 W12 · 2026-09-13','2026-09-13'],['完整周 W2 · 2026-07-05','2026-07-05'],
 ['快照 2026-09-24','2026-09-24'],['完整月 2026-08','2026-08-31'],
 ['完整月 2024-02','2024-02-29'],['完整月 2026-02','2026-02-28'],['完整月 2026-12','2026-12-31'],
 ['完整月 2000-02','2000-02-29'],['完整月 1900-02','1900-02-28'],
 ['完整周 W0 · 2026-09-13',null],['快照 2026-02-30',null],['完整月 2026-13',null],
 ['2026-09-24',null],['旧窗口 2026-09-24',null],['当前范围暂无可用基线周期',null],[null,null]
])assert.equal(evaluate(`baselineWindowEnd(${JSON.stringify(window)})`),end,`Unreliable baseline end: ${window}`);
// Pending outcomes never become false conversions or enter mature denominators.
const readiness=state=>JSON.parse(JSON.stringify(evaluate(`trialReadiness(${JSON.stringify(state)})`)));
let ready=readiness({});
assert.deepEqual(ready.batches.map(b=>[b.end,b.status,b.expected,b.received,b.missing,b.ready]),[
  ['2026-09-27','观察未结束',300,null,null,false],['2026-09-20','结果待齐',300,248,52,false]]);
assert.deepEqual(readiness({week:'1'}),ready,'Mature week selection must not suppress separate readiness dates');
for(const filters of [{country:'US'},{appPlatform:'Android'},{productLine:'Hunting'},
  {country:'DE',productLine:'Hunting',plan:'Starter',billingCycle:'monthly',subscriptionPlatform:'Google Play'}]) {
  const expected=fixtures.trialFacts.readiness.records.filter(r=>r.batch_end==='2026-09-20'&&
    Object.entries(filters).every(([key,value])=>r[({appPlatform:'app_platform',productLine:'product_line',billingCycle:'billing_cycle',subscriptionPlatform:'subscription_platform'})[key]??key]===value));
  const batch=readiness(filters).batches[1];
  assert.equal(batch.expected,expected.reduce((sum,r)=>sum+r.expected_outcomes,0));
  assert.equal(batch.received,expected.reduce((sum,r)=>sum+r.received_outcomes,0));
}
assert.equal(readiness({country:'Other'}).batches.length,0);
assert.match(readiness({country:'Other'}).reason,/暂无.*不能据此/);
assert.deepEqual(readiness({deviceModel:'K6'}),ready,'Device model is outside trial batch scope');
assert.equal(project({week:'12'}).m18.value,.434);
assert.equal(evaluate('trialAggregate(trialRows({}).rows).denominator'),12000);
evaluate('sourceData={...__fixtures,trialFacts:{...__fixtures.trialFacts,readiness:{...__fixtures.trialFacts.readiness,as_of:"2026-09-25"}}}');
assert.equal(readiness({}).batches.length,0,'Do not display readiness from another snapshot');
evaluate('sourceData=__fixtures');
evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures));sourceData.trialFacts.readiness.records[0].received_outcomes=null');
const unknownCount=readiness({}).batches[1];
assert.equal(unknownCount.status,'结果待齐');
assert.equal(unknownCount.observed,true);
assert.equal(unknownCount.received,null);
assert.equal(unknownCount.missing,null,'Unknown received outcomes must not become zero');
evaluate('sourceData=__fixtures');
for(const week of fixtures.weekly) {
  const rows=week.deviceEventsBird.records;
  assert.equal(rows.reduce((sum,row)=>sum+row.triggers,0),week.deviceEventsBird.triggers);
  assert.equal(rows.reduce((sum,row)=>sum+row.empty,0),week.deviceEventsBird.empty);
  assert.equal(new Set(rows.map(row=>`${row.model}:${row.firmware}`)).size,rows.length);
  const k6=rows.find(row=>row.model==='K6'&&row.firmware==='2.8');
  assert.equal(k6.empty,week.deviceEventsBird.k6Firmware28.empty);
  assert.equal(k6.triggers,week.deviceEventsBird.k6Firmware28.triggers);
  for(const row of rows)assert.ok(Number.isInteger(row.empty)&&row.empty>=0&&row.empty<=row.triggers);
  for(const model of ['K6','Bird Lite','Bird Pro'])for(const firmware of ['2.8','Other']) {
    const raw=rows.filter(row=>row.model===model&&row.firmware===firmware);
    const value=project({deviceModel:model,firmware,week:String(week.week)}).m42;
    assert.equal(value.numerator,raw.reduce((sum,row)=>sum+row.empty,0));
    assert.equal(value.denominator,raw.reduce((sum,row)=>sum+row.triggers,0));
    const history=evaluate('metricHistory(42)');
    assert.equal(history.values[week.week-1],value.value*100);
    assert.equal(history.details[week.week-1].numerator,value.numerator);
  }
}
assert.equal(project({deviceModel:'K6',firmware:'2.8'}).m42.value,.82);
assert.equal(evaluate('weeklyRateComparison(42).delta'),40);
for(const dimension of [{country:'US'},{season:'Migration'},{deviceModel:'K6',firmware:'2.8',country:'US'}]) {
  assert.equal(project(dimension).m42.availability,'pending');
  assert.equal(evaluate('metricHistory(42)'),null);
  assert.equal(evaluate('weeklyRateComparison(42)'),null);
}
assert.equal(project({deviceModel:'Hunt Pro'}).m42.kind,'na');
assert.equal(project({deviceStatus:'Inactive'}).m42.kind,'na');
evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures));sourceData.weekly.at(-1).deviceEventsBird.records=[{model:"K6",firmware:"2.8",triggers:10,empty:8}]');
assert.equal(project({deviceModel:'K6',firmware:'2.8'}).m42.kind,'na','Small event samples must not draw a reliable percentage');
evaluate('sourceData=__fixtures');
project({deviceModel:'K6',firmware:'2.8'});
evaluate('activeIssueMetrics.set(issueScopeKey("C"),42)');
assert.match(evaluate('routeHref("C",46)'),/issue=42/,'Auxiliary evidence must retain explicitly registered issue');
evaluate('location.hash="#/C?deviceModel=K6&firmware=2.8&metric=46&issue=46";readRoute()');
assert.equal(evaluate('activeIssueMetrics.get(issueScopeKey("C"))'),46);
evaluate('location.hash="#/C?deviceModel=K6&firmware=2.8&metric=46&issue=52";readRoute()');
assert.equal(evaluate('activeIssueMetrics.get(issueScopeKey("C"))'),undefined,'Cross-page issue is invalid');
for(const [page,info] of Object.entries(fixtures.diagnostics)) {
  for(const id of info.heroIds) {
    evaluate(`location.hash="#/${page}?metric=${id}&issue=${id}";readRoute()`);
    assert.equal(evaluate(`activeIssueMetrics.get(issueScopeKey("${page}"))`),id,`Shared metric #${id} cannot be registered on ${page}`);
  }
}
evaluate('activeIssueMetrics.clear()');
project({});
const searchIds=query=>Array.from(evaluate(`metricSearchMatches(${JSON.stringify(query)}).map(result=>result.item.id)`));
assert.equal(searchIds('').length,53,'Search must retain the full metric catalog');
for(const [query,id] of [['DAU',25],['dau',25],['日活',25],['WAU',25],['周活',25],['月活',25],
  ['多设备主账号占比',48],['当前绑定设备',8],['上传成功率',46],['直播成功率',46],['推送成功率',46],
  ['ID映射覆盖率',54],['事件丢失率',54],['DAU 活跃',25],['＃２５',25]])
  assert.ok(searchIds(query).includes(id),`Visible metric or subitem cannot be found: ${query}`);
assert.deepEqual(searchIds('MRR'),[3],'Existing acronym lookup changed');
assert.deepEqual(searchIds('DAU MRR'),[],'Multiple search terms must refer to the same metric');
assert.deepEqual(searchIds('没有这个指标xyz'),[],'An unknown query must have no matches');
for(const item of fixtures.catalog.filter(item=>/^[A-G]$/.test(item.page)))
  assert.ok(searchIds(item.name).includes(item.id),`Original catalog name lost: ${item.name}`);
const searchBeforeFilters=searchIds('直播成功率');project({country:'US',functionType:'Upload'});
assert.deepEqual(searchIds('直播成功率'),searchBeforeFilters,'Metric search depends on the current data availability');
project({});
assert.equal(evaluate('metric(54).value.status'),'演示正常');
for(const filters of [{country:'US'},{productLine:'Bird'},{appPlatform:'iOS'}]) {
  project(filters);
  assert.equal(evaluate('dataQualityState(metric(54)).label'),'待补数据',JSON.stringify(filters));
}
for(const key of evaluate('policyFor(54).businessDimensions'))
  assert.ok(fixtures.filterPolicy.controls[key].pages.includes('G'),`Quality evidence has no filter control for its business dimension ${key}`);
project({});
const qualityFixture=(loss,mapping)=>({kind:'group',value:{
  eventLoss:{kind:'rate',numerator:loss,denominator:10000,value:loss/10000},
  idMapping:{kind:'rate',numerator:mapping,denominator:10000,value:mapping/10000},status:'正常'}});
for(const [loss,mapping,label] of [[300,9500,'演示正常'],[301,9500,'演示预警'],[220,9499,'演示预警']])
  assert.equal(evaluate(`dataQualityState(${JSON.stringify(qualityFixture(loss,mapping))}).label`),label);
const invalidQuality=qualityFixture(220,9650);invalidQuality.value.eventLoss.denominator=0;
assert.equal(evaluate(`dataQualityState(${JSON.stringify(invalidQuality)}).label`),'待核验');
invalidQuality.value.eventLoss.denominator=10000;invalidQuality.value.eventLoss.value=.01;
assert.equal(evaluate(`dataQualityState(${JSON.stringify(invalidQuality)}).label`),'待核验','Inconsistent quality facts must not be called normal');
evaluate('sourceData={...__fixtures,snapshot:{...__fixtures.snapshot,quality:{...__fixtures.snapshot.quality,thresholds:{}}}}');
assert.equal(evaluate(`dataQualityState(${JSON.stringify(qualityFixture(220,9650))}).label`),'待核验','Missing thresholds must not default to a normal classification');
evaluate('sourceData=__fixtures');
assert.equal(evaluate('chartValue(0,"人")'),'0人');
assert.equal(evaluate('chartValue(5.2,"美元/人")'),'$5.20/人');
assert.equal(evaluate('chartValue(null,"%")'),'无值');

// Check indexed selection against the original rows, including week/period intersections.
const trialFields={country:'country',appPlatform:'app_platform',productLine:'product_line',
  subscriptionPlatform:'subscription_platform',plan:'plan',billingCycle:'billing_cycle'};
for(const filters of [{},{country:'US'},{country:'UK',productLine:'Bird'},
  {appPlatform:'Android',productLine:'Hunting'},
  {country:'US',appPlatform:'Android',productLine:'Bird',subscriptionPlatform:'Web',plan:'Plus',billingCycle:'monthly'},
  {productLine:'Bird',plan:'Starter'}]) {
  for(const week of [undefined,'1','9','10','12','99'])for(const period of [undefined,'previous','current','missing']) {
    const state={...filters,...(week?{week}:{})};
    const weekEnd=fixtures.weekly.find(item=>String(item.week)===week)?.weekEnd;
    const expected=fixtures.trialFacts.records.filter(row=>(!period||row.period===period)&&
      (!week||row.maturity_week_end===weekEnd)&&Object.entries(filters).every(([key,value])=>row[trialFields[key]]===value));
    const actual=JSON.parse(evaluate(`JSON.stringify(trialRows(${JSON.stringify(state)},${JSON.stringify(period)??'undefined'}).rows)`));
    assert.deepEqual(actual.map(row=>row.trial_id),expected.map(row=>row.trial_id),`Trial selection changed for ${JSON.stringify({state,period})}`);
    const aggregate=evaluate(`trialAggregate(trialRows(${JSON.stringify(state)},${JSON.stringify(period)??'undefined'}).rows)`);
    assert.equal(aggregate.numerator,expected.filter(row=>row.converted).length);
    assert.equal(aggregate.denominator,expected.length);
    assert.equal(aggregate.attempts,expected.filter(row=>row.payment_attempted).length);
    assert.equal(aggregate.failed,expected.filter(row=>row.payment_status==='failed').length);
  }
}
evaluate('sourceData={...sourceData,trialFacts:{...sourceData.trialFacts,records:[...sourceData.trialFacts.records,{...sourceData.trialFacts.records.at(-1),trial_id:"RELOADED-SAMPLE"}]}}');
assert.equal(evaluate('trialRows({week:"12"},"current").rows.at(-1).trial_id'),'RELOADED-SAMPLE','Reloaded facts were hidden by a stale index');
evaluate('sourceData=__fixtures');
assert.equal(evaluate('trialRows({week:"12"},"current").rows.length'),1000,'An old index survived source replacement');

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
// Model percentages and complete values must retain the same source counts at every scope.
for(const filters of [{},{country:'US'},{country:'UK'},{country:'DE'},{country:'Other'},
  {productLine:'Bird'},{productLine:'Hunting'},{country:'US',productLine:'Bird',deviceModel:'Bird Pro'}]) {
  const model=project(filters).m39;
  const records=fixtures.modelMarket.records.filter(row=>(!filters.country||row.country===filters.country)&&
    (!filters.productLine||row.productLine===filters.productLine)&&(!filters.deviceModel||row.model===filters.deviceModel));
  for(const [name,part] of Object.entries(model.value)) {
    const source=records.filter(row=>row.model===name);
    for(const key of ['owners','activeOwners','subscribedOwners'])assert.equal(part[key],source.reduce((sum,row)=>sum+row[key],0));
    assert.equal(part.activeRate,part.activeOwners/part.owners);
    assert.equal(part.subscriptionRate,part.subscribedOwners/part.owners);
  }
}
assert.equal(evaluate("groupText(0,'subscriptionRate')"),'0.0%');
assert.equal(evaluate("groupText(1,'activeRate')"),'100.0%');
assert.equal(evaluate("groupText(0.25,'ARPPU')"),'$0.25/人');
assert.equal(evaluate("groupText(0.25,'subscriptionNetIncome')"),'$0.25');
assert.equal(evaluate("flattenMeasure({countryShare:{US:1,UK:0}})[0][3]"),'100.0%');
assert.equal(evaluate("flattenMeasure({countryShare:{US:1,UK:0}})[1][3]"),'0.0%');
assert.equal(evaluate("flattenMeasure({activeRate:.62})[0][1]"),'—');
assert.equal(evaluate("flattenMeasure({activeRate:.62})[0][3]"),'62.0%');
assert.match(evaluate("flattenMeasure({kind:'na',availability:'pending',reason:'缺少明细'})[0][3]"),/^待补数据：/);
const originalModelCounts={activeOwners:usK6.activeOwners,subscribedOwners:usK6.subscribedOwners};
evaluate('sourceData.modelMarket.records[0].activeOwners=undefined');
assert.equal(project({}).m39.availability,'pending');
evaluate(`sourceData.modelMarket.records[0].activeOwners=${originalModelCounts.activeOwners}`);
evaluate('sourceData.modelMarket.records[0].subscribedOwners=sourceData.modelMarket.records[0].owners+1');
assert.equal(project({country:'US'}).m39.availability,'pending');
evaluate(`sourceData.modelMarket.records[0].subscribedOwners=${originalModelCounts.subscribedOwners}`);
assert.equal(project({}).m39.kind,'group');

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

project({});
for(const filters of [{},{country:'US'},{country:'UK',productLine:'Bird'}]) {
  project(filters);
  const revenueHistory=evaluate('metricHistory(35)');
  for(const [index,detail] of revenueHistory.details.entries())
    assert.ok(Math.abs(revenueHistory.values[index]-detail.numerator/detail.denominator)<.005,`ARPPU point evidence contradicts the displayed value: ${JSON.stringify(filters)}`);
}
project({});
const comparisons=evaluate('homeComparisons()');
assert.equal(evaluate('homeStartingPoint(homeComparisons()).id'),18,
  'Verifiable segmented decline must take precedence over the larger activation delta');
assert.equal(evaluate('homeStartingPoint(homeComparisons()).kind'),'supported');
assert.equal(evaluate('homeStartingPoint(homeComparisons().map(item=>({...item,before:{...item.before,denominator:item.before.denominator*2}}))).kind'),'unsegmented',
  'Matching deltas alone cannot prove that group contributions use the same denominators');
for(const filters of [{productLine:'Hunting'},{appPlatform:'iOS'},{week:'12'}]) {
  project(filters);
  assert.notEqual(evaluate('homeStartingPoint(homeComparisons()).kind'),'supported',
    'A single residual group or a selected week cannot claim matched segmented evidence');
}
project({});
assert.equal(evaluate('homeStartingPoint(homeComparisons().map(item=>({...item,delta:0}))).kind'),'no-decline');
assert.equal(evaluate('homeStartingPoint(homeComparisons().map(item=>({...item,delta:1}))).kind'),'no-decline');
assert.equal(evaluate('homeStartingPoint([]).kind'),'unavailable');
assert.equal(evaluate('homeStartingPoint([{id:13,delta:-.1},{id:18,delta:-20}]).id'),13,
  'Unsupported declines follow mainline order, never cross-metric magnitude');
const income=evaluate('subscriptionIncomeChange()');
assert.equal(income.before.numerator,49980);
assert.equal(income.after.numerator,52000);
assert.equal(income.before.denominator,9800);
assert.equal(income.after.denominator,10000);
assert.equal(income.delta,2020);
assert.equal(income.payersContribution,1030);
assert.equal(income.arppuContribution,990);
const incomeAxis=evaluate('subscriptionIncomeSpec(subscriptionIncomeChange())');
assert.deepEqual([incomeAxis.minY,incomeAxis.maxY,incomeAxis.intervalY],[0,1250,250],
  'Income contribution ticks must be evenly spaced, including the endpoints');
for(const filters of [{},{country:'US'},{country:'UK',productLine:'Bird'},{productLine:'Hunting',plan:'Starter'}]) {
  project(filters);
  const part=evaluate('subscriptionIncomeChange()');
  if(!part)continue;
  assert.equal(Math.round((part.payersContribution+part.arppuContribution)*100),part.delta*100);
  const n0=part.before.denominator,n1=part.after.denominator,a0=part.before.numerator/n0,a1=part.after.numerator/n1;
  const sequentialPayers=(n1-n0)*a0,sequentialARPPU=n1*(a1-a0);
  assert.ok(Math.abs(sequentialPayers+sequentialARPPU-part.delta)<1e-6,'Independent product identity must reconcile');
  assert.ok(Math.abs(part.payersContribution-(n1-n0)*(a0+a1)/2)<=.0051,'Symmetric allocation deviates from the exact midpoint');
}
project({});
const incomeScenario=(n0,r0,n1,r1)=>evaluate(`subscriptionIncomeChange({labels:['7月','8月'],details:[{denominator:${n0},numerator:${r0}},{denominator:${n1},numerator:${r1}}]})`);
for(const [n0,r0,n1,r1] of [[100,1000,100,800],[100,1000,200,1000],[31,101,32,97],[100,0,100,0],[100,1,100,1.01],[100,1,100,.98]]) {
  const part=incomeScenario(n0,r0,n1,r1);
  assert.equal(Math.round((part.payersContribution+part.arppuContribution)*100),Math.round((r1-r0)*100));
  const spec=evaluate(`subscriptionIncomeSpec(${JSON.stringify(part)})`);
  assert.ok(spec.minY<=Math.min(0,part.payersContribution,part.arppuContribution),'Negative effects must not be clipped');
  const high=Math.max(0,part.payersContribution,part.arppuContribution);
  assert.ok(spec.maxY>=high,'Positive effects and the zero baseline must remain visible');
  if(high>0)assert.ok(spec.maxY>high,'Positive data labels need space above their bars');
  assert.ok(spec.intervalY>=.01,'Dollar axis ticks must not invent fractions of a cent');
  assert.ok(Math.abs(spec.minY/spec.intervalY-Math.round(spec.minY/spec.intervalY))<1e-8);
  assert.ok(Math.abs(spec.maxY/spec.intervalY-Math.round(spec.maxY/spec.intervalY))<1e-8);
}
assert.equal(incomeScenario(29,100,30,105),null,'Low-sample prior month cannot generate an income driver claim');
assert.equal(evaluate('subscriptionIncomeChange(null)'),null);
const activationComparison=comparisons.find(item=>item.id===13);
for(const [key,weeks] of [['before',fixtures.weekly.slice(0,8)],['after',fixtures.weekly.slice(8)]]) {
  const numerator=weeks.reduce((sum,week)=>sum+week.registrationCohort.valueActivated7dBird,0);
  const denominator=weeks.reduce((sum,week)=>sum+week.registrationCohort.birdEligible,0);
  assert.equal(activationComparison[key].numerator,numerator);
  assert.equal(activationComparison[key].denominator,denominator);
  assert.equal(activationComparison[`${key}Rate`],numerator/denominator*100);
}
project({week:'2'});
assert.equal(evaluate('homeComparisons().find(item=>item.id===13).delta'),activationComparison.delta);
project({productLine:'Hunting'});
assert.equal(evaluate('homeComparisons().some(item=>item.id===13)'),false);
project({productLine:'Bird',country:'US',subscriptionPlatform:'App Store'});
const trialComparison=evaluate('homeComparisons().find(item=>item.id===18)');
for(const [key,period] of [['before','previous'],['after','current']]) {
  const rows=fixtures.trialFacts.records.filter(row=>row.product_line==='Bird'&&row.country==='US'&&row.subscription_platform==='App Store'&&row.period===period);
  assert.equal(trialComparison[key].denominator,rows.length);
  assert.equal(trialComparison[key].numerator,rows.filter(row=>row.converted).length);
  assert.equal(trialComparison[`${key}Rate`],rows.filter(row=>row.converted).length/rows.length*100);
}
project({productLine:'Bird',plan:'Starter'});
assert.equal(evaluate('homeComparisons().some(item=>item.id===18)'),false);
project({country:'UK',productLine:'Bird',subscriptionPlatform:'Web',plan:'Plus',billingCycle:'monthly'});
assert.equal(evaluate('trialRows({...trialState(),week:undefined},"current").rows.length'),60);
assert.equal(evaluate('trendValues(18)'),null);
assert.equal(evaluate('homeComparisons().some(item=>item.id===18)'),false,'A pooled sample must not imply a weekly trend when every week is suppressed');
project({});
for(const [id,page,split,numerator,denominator] of [
  [13,'A',8,week=>week.registrationCohort.valueActivated7dBird,week=>week.registrationCohort.birdEligible],
  [42,'C',8,week=>week.deviceEventsBird.empty,week=>week.deviceEventsBird.triggers],
  [18,'D',9,week=>week.trialMaturity.converted,week=>week.trialMaturity.completed],
]) {
  const comparison=evaluate(`filteredFinding("${page}").comparison`);
  for(const [period,rows] of [['before',fixtures.weekly.slice(0,split)],['after',fixtures.weekly.slice(split)]]) {
    const n=rows.reduce((sum,week)=>sum+numerator(week),0),d=rows.reduce((sum,week)=>sum+denominator(week),0);
    assert.equal(comparison[period].numerator,n);
    assert.equal(comparison[period].denominator,d);
    assert.equal(comparison[`${period}Rate`],n/d*100);
  }
  project({week:'2'});
  const selected=evaluate(`filteredFinding("${page}").comparison`);
  assert.equal(selected.selectedWeek,2);
  assert.equal(selected.before.numerator,numerator(fixtures.weekly[0]));
  assert.equal(selected.after.denominator,denominator(fixtures.weekly[1]));
  assert.match(selected.beforeWindow,/W1/);
  assert.match(selected.afterWindow,/W2/);
  project({week:'1'});
  assert.equal(evaluate(`filteredFinding("${page}").comparison`),null,`${page} fabricated a predecessor for the first mature week`);
  project({});
}
evaluate(`sourceData=JSON.parse(JSON.stringify(__fixtures));
sourceData.weekly.forEach((week,index)=>{
  week.registrationCohort.birdEligible=index===0||index===8?1000:100;
  week.registrationCohort.valueActivated7dBird=index===0?900:index===8?500:index<8?10:30;
});`);
project({});
const weightedStress=evaluate('filteredFinding("A").comparison');
assert.equal(weightedStress.before.numerator,970);
assert.equal(weightedStress.before.denominator,1700);
assert.equal(weightedStress.after.numerator,590);
assert.equal(weightedStress.after.denominator,1300);
assert.ok(weightedStress.delta<0,'Unequal cohort sizes reversed the change: averaging percentages would incorrectly show an increase');
evaluate('sourceData=__fixtures');
project({country:'UK',productLine:'Bird',subscriptionPlatform:'Web',plan:'Plus',billingCycle:'monthly'});
assert.equal(evaluate('weeklyRateComparison(18)'),null,'All suppressed weekly samples must not produce a strong comparison');
project({});
assert.equal(evaluate('actionBaselineWindow(18)'),`完整周 W12 · ${fixtures.weekly.at(-1).weekEnd}`);
assert.equal(evaluate('actionBaselineWindow(35)'),'完整月 2026-08');
assert.equal(evaluate('actionBaselineValue(35)'),
  '订阅ARPPU：$5.20/人；月内订阅付款主账号：10,000人；订阅净收入：$52,000');
assert.match(evaluate('actionBaselineValue(25)'),/DAU.*12,600人.*WAU：29,800人.*MAU：68,000人/);
assert.match(evaluate('actionBaselineValue(8)'),/累计首图激活设备.*台.*当前绑定设备：.*台/);
assert.match(evaluate('actionBaselineValue(46)'),/关键功能最低成功率.*成功率：/);
assert.match(evaluate('actionBaselineValue(54)'),/事件丢失率.*ID映射覆盖率：/);
project({country:'US'});
const payerBaseline=evaluate('metric(35).value');
assert.ok(evaluate('actionBaselineValue(35)').includes(`${payerBaseline.monthlySubscriptionPayers.toLocaleString('zh-CN')}人`));
assert.ok(evaluate('actionBaselineValue(35)').includes(`订阅净收入：$${payerBaseline.subscriptionNetIncome.toLocaleString('zh-CN')}`));
assert.notEqual(evaluate('actionBaselineValue(35)'),
  '订阅ARPPU：$5.20/人；月内订阅付款主账号：10,000人；订阅净收入：$52,000');
project({deviceModel:'K6'});
assert.equal(evaluate('actionBaselineValue(35)'),'待补数据','Missing facts must not register overall income as a baseline');
project({});
assert.equal(evaluate('actionBaselineWindow(3)'),`快照 ${fixtures.snapshot.asOf}`);
project({week:'2'});
assert.equal(evaluate('actionBaselineWindow(18)'),`完整周 W2 · ${fixtures.weekly[1].weekEnd}`);
project({productLine:'Bird',plan:'Starter'});
assert.equal(evaluate('actionBaselineWindow(18)'),'当前范围暂无可用基线周期','Unavailable data must not imply a snapshot baseline');
project({});
evaluate('simulatedActionState={existing:{complete:false}};localStorage.setItem=()=>{throw new Error("Storage blocked")};');
assert.equal(evaluate('saveActionState("existing",{complete:true})'),false);
assert.equal(evaluate('simulatedActionState.existing.complete'),false,'A failed write must not mutate in-memory action status');
evaluate('localStorage.setItem=(key,value)=>{window.__savedActions={key,value}};');
assert.equal(evaluate('saveActionState("new",{complete:true})'),true);
assert.equal(evaluate('simulatedActionState.new.complete'),true);
assert.equal(evaluate('window.__savedActions.key'),'parallens-demo-actions-v1');
assert.deepEqual(JSON.parse(evaluate('window.__savedActions.value')),{existing:{complete:false},new:{complete:true}});
const timelineAxes=evaluate(`Object.values(sourceData.diagnostics).flatMap(page=>[page.chart,...(page.extraCharts??[])])
  .filter(spec=>spec&&!spec.kind&&isTimelineSpec(spec)).map(spec=>({
    title:spec.title,axis:trendAxisDomain(spec.series,spec.unit),
    values:spec.series.flatMap(line=>line.values).filter(Number.isFinite)}))`);
assert.ok(timelineAxes.length>=8);
for(const {title,axis,values} of timelineAxes) {
  assert.ok(axis&&axis.min<=Math.min(...values)&&axis.max>=Math.max(...values),title);
  assert.ok(axis.max>axis.min&&axis.step>0,title);
}
const lossAxis=evaluate('trendAxisDomain(sourceData.diagnostics.G.extraCharts[0].series,"%")');
assert.ok(lossAxis.min>0&&lossAxis.min<=1.8&&lossAxis.max>=2.2&&lossAxis.max<5);
assert.match(evaluate('chartScaleNote(sourceData.diagnostics.G.extraCharts[0])'),/非零起点/);
const activeAxes=evaluate('sourceData.diagnostics.B.chart.series.map(line=>trendAxisDomain([line],"人"))');
assert.ok(activeAxes[0].min>60000&&activeAxes[0].max>=68000&&activeAxes[0].max<75000);
assert.ok(activeAxes[1].min>40000&&activeAxes[1].max>=46800&&activeAxes[1].max<50000);
const revenueAxis=evaluate('trendAxisDomain(sourceData.diagnostics.E.extraCharts[0].series,"美元\/人")');
assert.ok(revenueAxis.min>0&&revenueAxis.max<10);
evaluate('window.echarts={format:{getTextRect:()=>({width:100,height:12})},init:box=>({getDom:()=>box,setOption:option=>window.__chartOptions=option})}');
// This calculation-only DOM fixture represents a fresh chart host, before any fallback class exists.
evaluate('window.__chartTestBox={clientWidth:800,classList:{contains:()=>false}}');
for(const amount of [.01,-.01]) {
  const spec=evaluate(`subscriptionIncomeSpec({payersContribution:0,arppuContribution:${amount},before:{numerator:1},after:{numerator:${1+amount}},delta:${amount},beforeLabel:'7月',afterLabel:'8月',source:'isolated formatter boundary'})`);
  evaluate(`drawDetailChart(window.__chartTestBox,${JSON.stringify(spec)})`);
  assert.equal(evaluate(`window.__chartOptions.yAxis.axisLabel.formatter(${amount})`),`$${amount}`,
    'The authored dollar formatter must preserve a signed cent rather than round it to $0');
}
evaluate('drawDetailChart(window.__chartTestBox,sourceData.diagnostics.G.extraCharts[0])');
assert.equal(evaluate('window.__chartOptions.yAxis.min'),lossAxis.min);
assert.equal(evaluate('window.__chartOptions.yAxis.max'),lossAxis.max);
evaluate('drawDetailChart(window.__chartTestBox,diagnosticChartFacts("E",sourceData.diagnostics.E.extraCharts[1]))');
assert.equal(evaluate('window.__chartOptions.xAxis.min'),0);
assert.equal(evaluate('window.__chartOptions.xAxis.max'),100);
assert.equal(evaluate('window.__chartOptions.legend.selectedMode'),false);
const entitlementTooltip=evaluate('window.__chartOptions.tooltip.formatter([{dataIndex:0,seriesIndex:1,seriesName:"仅Pack",value:1.2,marker:""}])');
assert.match(entitlementTooltip,/150人 \/ 12,550人/);
for(const page of ['A','C','D']) {
  const spec=evaluate(`diagnosticChartFacts("${page}",sourceData.diagnostics.${page}.chart)`);
  for(const line of spec.series)for(const [index,detail] of line.details.entries())
    assert.ok(Math.abs(line.values[index]-detail.numerator/detail.denominator*100)<.051,`${page} ${line.name} W${index+1}: displayed rate contradicts point facts`);
}
evaluate('drawDetailChart(window.__chartTestBox,diagnosticChartFacts("C",sourceData.diagnostics.C.chart))');
const triggerTooltip=evaluate('window.__chartOptions.tooltip.formatter([{dataIndex:11,seriesIndex:1,seriesName:"K6 · 固件2.8",value:82,marker:""}])');
assert.match(triggerTooltip,/3,280次 \/ 4,000次/);
assert.match(evaluate('window.__chartOptions.series[1].endLabel.formatter({value:82})'),/K6 · 固件2.8 82.0%/);
assert.ok(evaluate('Number.isFinite(window.__chartOptions.grid.right)'));
evaluate('drawDetailChart(window.__chartTestBox,{kind:"heatmap",title:"Contrast fixture",unit:"%",labels:["fixture"],dimensions:Array.from({length:101},(_,index)=>String(index)),series:[{values:[Array.from({length:101},(_,index)=>index)]}]})');
const heatmap=evaluate('window.__chartOptions');
const rgb=hex=>{const raw=hex.slice(1),full=raw.length===3?[...raw].map(char=>char+char).join(''):raw;return [0,2,4].map(index=>parseInt(full.slice(index,index+2),16));};
const luminance=channels=>channels.map(channel=>channel/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
const palette=heatmap.visualMap.inRange.color.map(rgb);
for(const cell of heatmap.series[0].data) {
  const fraction=cell.value[2]/50,slot=Math.min(1,Math.floor(fraction));
  const background=palette[slot].map((value,index)=>Math.round(value+(palette[slot+1][index]-value)*(fraction-slot)));
  const light=luminance(background),foreground=luminance(rgb(cell.label.color));
  const contrast=(Math.max(light,foreground)+.05)/(Math.min(light,foreground)+.05);
  assert.ok(contrast>=4.5,`Heatmap text contrast ${contrast.toFixed(2)} at ${cell.value[2]}%`);
}
// This configuration probe has no evidence-table DOM; pointer/table behavior is
// exercised in verify_home_chart_selection_flows.js with a real browser.
evaluate('document.querySelector=selector=>selector===".trend-table-wrap table"?null:selector==="#trendChart"?window.__chartTestBox:{};drawTrend()');
assert.ok(evaluate('window.__chartOptions.yAxis.min')>0);
assert.ok(evaluate('window.__chartOptions.yAxis.max')<100);
evaluate('chart=null;drawTrend(18)');
assert.equal(evaluate('window.__chartOptions.series.length'),1);
assert.equal(evaluate('window.__chartOptions.series[0].data.at(-1)'),43.4);
assert.equal(evaluate('window.__chartOptions.series[0].markLine.data[0].yAxis'),45);
assert.ok(evaluate('window.__chartOptions.yAxis.max-window.__chartOptions.yAxis.min')<5);
evaluate('chart=null;drawTrend(null)');
assert.equal(evaluate('window.__chartOptions.series.length'),2);
// Counterfactual test fixtures exercise composition shifts absent from the shipped demo.
const cohort=(size,converted,target)=>Array.from({length:size},(_,index)=>({
  product_line:target?'Bird':'Hunting',app_platform:target?'Android':'iOS',
  plan:target?'Plus':'Pro',billing_cycle:'monthly',converted:index<converted,
}));
const rateParts=(before,after)=>JSON.parse(JSON.stringify(evaluate(`trialGroupContributions(${JSON.stringify([before,after])})`)));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const decompositionCases=[
  {before:[...cohort(40,20,true),...cohort(60,15,false)],after:[...cohort(40,16,true),...cohort(60,15,false)],within:-4,mix:0,total:-4},
  {before:[...cohort(40,20,true),...cohort(60,15,false)],after:[...cohort(60,30,true),...cohort(40,10,false)],within:0,mix:5,total:5},
  // Both groups improve by 10pp while the population shifts toward the lower-rate group.
  {before:[...cohort(90,54,true),...cohort(30,6,false)],after:[...cohort(30,21,true),...cohort(90,27,false)],within:10,mix:-20,total:-10},
];
for(const fixture of decompositionCases) {
  const parts=rateParts(fixture.before,fixture.after),reverse=rateParts(fixture.after,fixture.before);
  near(parts.effects.reduce((sum,item)=>sum+item.within,0),fixture.within);
  near(parts.effects.reduce((sum,item)=>sum+item.composition,0),fixture.mix);
  near(parts.changes.reduce((sum,value)=>sum+value,0),fixture.total);
  parts.effects.forEach((item,index)=>{
    near(item.within+item.composition,parts.changes[index]);
    near(reverse.effects[index].within,-item.within);
    near(reverse.effects[index].composition,-item.composition);
  });
}
assert.equal(rateParts(cohort(29,10,true),cohort(40,20,true)),null);
assert.equal(rateParts([...cohort(40,20,true),...cohort(29,10,false)],cohort(60,30,true)),null);
assert.equal(rateParts([],[]),null);
const singleGroup=rateParts(cohort(40,20,true),cohort(60,24,true));
assert.equal(singleGroup.groups.length,1);near(singleGroup.effects[0].composition,0);near(singleGroup.changes[0],-10);
// Device contributions use matched windows and the selected raw event partition.
evaluate('sourceData=__fixtures');
for(const filters of [{},{deviceModel:'K6'},{firmware:'2.8'},{deviceModel:'K6',firmware:'2.8'},
  {firmware:'Other'},{deviceModel:'Bird Lite'},{week:'2'},{week:'9'},{week:'12'},{productLine:'Bird'}]) {
  project(filters);
  const parts=JSON.parse(JSON.stringify(evaluate('deviceEventGroupChanges()')));
  const index=filters.week?Number(filters.week)-1:null;
  const weeks=index===null?[fixtures.weekly.slice(0,8),fixtures.weekly.slice(8)]:
    [[fixtures.weekly[index-1]],[fixtures.weekly[index]]];
  const populations=weeks.map(period=>period.flatMap(w=>w.deviceEventsBird.records).filter(row=>
    (!filters.deviceModel||row.model===filters.deviceModel)&&(!filters.firmware||row.firmware===filters.firmware)));
  const counts=rows=>({n:rows.reduce((n,r)=>n+r.empty,0),d:rows.reduce((d,r)=>d+r.triggers,0)});
  const overall=populations.map(counts);
  parts.groups.forEach((group,g)=>{
    const target=group.name==='K6 · 固件2.8';
    const expected=populations.map(rows=>counts(rows.filter(r=>(r.model==='K6'&&r.firmware==='2.8')===target)));
    group.summaries.forEach((part,j)=>assert.deepEqual([part.numerator,part.denominator],[expected[j].n,expected[j].d]));
    near(parts.changes[g],(expected[1].n/overall[1].d-expected[0].n/overall[0].d)*100);
    near(parts.effects[g].within+parts.effects[g].composition,parts.changes[g]);
  });
  near(parts.changes.reduce((sum,v)=>sum+v,0),(overall[1].n/overall[1].d-overall[0].n/overall[0].d)*100);
  const spec=evaluate('deviceEventChangeSpec(deviceEventGroupChanges())');
  assert.ok(spec.minY<=Math.min(0,...parts.changes)&&spec.maxY>=Math.max(0,...parts.changes));
  assert.equal(spec.adverseWhenHigh,true,'Increasing empty-trigger rate is adverse');
}
project({});
near(evaluate('deviceEventGroupChanges().changes[0]'),16);
near(evaluate('deviceEventGroupChanges().changes[1]'),0);
project({week:'1'});assert.match(evaluate('deviceEventGroupChanges().reason'),/没有前一完整周/);
for(const filters of [{country:'US'},{productLine:'Hunting'},{deviceStatus:'Inactive'}]){
  project(filters);assert.equal(evaluate('deviceEventGroupChanges().groups'),undefined);
}
const eventFixture=(before,after)=>{
  evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures))');
  evaluate(`sourceData.weekly.forEach((w,i)=>w.deviceEventsBird.records=(i<8?${JSON.stringify(before)}:${JSON.stringify(after)}))`);
  project({});return JSON.parse(JSON.stringify(evaluate('deviceEventGroupChanges()')));
};
const events=(n,d,target)=>({model:target?'K6':'Bird Pro',firmware:target?'2.8':'Other',empty:n,triggers:d});
const mix=eventFixture([events(54,90,true),events(6,30,false)],[events(21,30,true),events(27,90,false)]);
near(mix.effects.reduce((sum,g)=>sum+g.within,0),10);
near(mix.effects.reduce((sum,g)=>sum+g.composition,0),-20);
near(mix.changes.reduce((sum,v)=>sum+v,0),-10);
assert.match(eventFixture([events(3,7,true),events(50,100,false)],[events(3,7,true),events(50,100,false)]).reason,/少于30次/);
assert.match(eventFixture([events(20,40,true),events(50,100,false)],[events(50,100,false)]).reason,/少于30次/);
const only=eventFixture([events(50,100,false)],[events(50,100,false)]);
assert.equal(only.groups.length,1);near(only.changes[0],0);
assert.match(evaluate('deviceEventGroupChanges({...weeklyRateComparison(42),before:{...weeklyRateComparison(42).before,numerator:1}}).reason'),/不闭合/);
evaluate('sourceData=__fixtures');project({});
console.log(`PASS metric names and subitem search, indexed trial selections and reloads, business filters, weighted observation evidence and adjacent periods, symmetric within/composition decomposition including Simpson reversal, matched-window device contributions, action baseline periods and transactional saves, chart units and point evidence, linked facts and focused scales for ${timelineAxes.length} diagnostic timelines`);
