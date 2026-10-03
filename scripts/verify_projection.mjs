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
  __fixtures:fixtures,document:{querySelector:()=>null},window:{addEventListener:()=>{},removeEventListener:()=>{}},
  localStorage:{getItem:()=>null},URLSearchParams,location:{hash:''},console,
});
const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/\nstart\(\);\s*$/,'\n');
vm.runInContext(source,context,{filename:'app.js'});
vm.runInContext('sourceData=__fixtures',context);
const project=filters=>vm.runInContext(`filterState=${JSON.stringify(filters)};projectDataset();dataset.metrics`,context);
const evaluate=expression=>vm.runInContext(expression,context);
project({});
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
evaluate('window.echarts={init:()=>({setOption:option=>window.__chartOptions=option})}');
evaluate('drawDetailChart({clientWidth:800},sourceData.diagnostics.G.extraCharts[0])');
assert.equal(evaluate('window.__chartOptions.yAxis.min'),lossAxis.min);
assert.equal(evaluate('window.__chartOptions.yAxis.max'),lossAxis.max);
evaluate('drawDetailChart({clientWidth:800},diagnosticChartFacts("E",sourceData.diagnostics.E.extraCharts[1]))');
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
evaluate('drawDetailChart({clientWidth:800},diagnosticChartFacts("C",sourceData.diagnostics.C.chart))');
const triggerTooltip=evaluate('window.__chartOptions.tooltip.formatter([{dataIndex:11,seriesIndex:1,seriesName:"K6 · 固件2.8",value:82,marker:""}])');
assert.match(triggerTooltip,/3,280次 \/ 4,000次/);
assert.match(evaluate('window.__chartOptions.series[1].endLabel.formatter({value:82})'),/K6 · 固件2.8 82.0%/);
assert.ok(evaluate('Number.isFinite(window.__chartOptions.grid.right)'));
evaluate('drawDetailChart({clientWidth:800},{kind:"heatmap",title:"Contrast fixture",unit:"%",labels:["fixture"],dimensions:Array.from({length:101},(_,index)=>String(index)),series:[{values:[Array.from({length:101},(_,index)=>index)]}]})');
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
evaluate('document.querySelector=()=>({});drawTrend()');
assert.ok(evaluate('window.__chartOptions.yAxis.min')>0);
assert.ok(evaluate('window.__chartOptions.yAxis.max')<100);
evaluate('chart=null;drawTrend(18)');
assert.equal(evaluate('window.__chartOptions.series.length'),1);
assert.equal(evaluate('window.__chartOptions.series[0].data.at(-1)'),43.4);
assert.equal(evaluate('window.__chartOptions.series[0].markLine.data[0].yAxis'),45);
assert.ok(evaluate('window.__chartOptions.yAxis.max-window.__chartOptions.yAxis.min')<5);
evaluate('chart=null;drawTrend(null)');
assert.equal(evaluate('window.__chartOptions.series.length'),2);
console.log(`PASS metric names and subitem search, indexed trial selections and reloads, business filters, weighted observation evidence and adjacent periods, action baseline periods and transactional saves, chart units and point evidence, linked facts and focused scales for ${timelineAxes.length} diagnostic timelines`);
