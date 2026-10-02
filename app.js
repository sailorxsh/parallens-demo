const pages = {
  A:{title:'新客与激活',round:2,question:'新客在注册、绑定、首图和价值激活哪里受阻？'},
  B:{title:'活跃与留存',round:3,question:'活跃是由主动使用、设备内容还是推送触达驱动？'},
  C:{title:'设备健康',round:3,question:'设备行为和内容质量在哪个型号或固件版本异常？'},
  D:{title:'订阅转化',round:2,question:'试用、支付、续订和恢复分别影响了多少有效订阅？'},
  E:{title:'付费价值',round:4,question:'付费权益和增值包由哪些人群贡献？'},
  F:{title:'用户与设备结构',round:4,question:'设备绑定、共享、多设备和解绑关系如何变化？'},
  G:{title:'异常与数据质量',round:4,question:'今天的业务信号是否异常，当前数字是否可信？'},
};
const defaultFindingMetric={A:13,B:25,C:42,D:18,E:3,F:8,G:54};
const primaryTrendMetric={A:13,B:4,C:42,D:18,E:35,F:48,G:54};
const primaryHeroIds={A:[9,10,13,15],B:[4,24,25,29],C:[8,41,42,46],D:[2,18,21,23],E:[3,34,35,39],F:[7,8,48,49],G:[53,54,15,52]};
const findingRuleVersion='demo-2026-09-26-v2';
const findingSource=id=>({18:'合成试用明细交集重算',27:'合成功能人数',29:'合成活跃间隔分层',45:'型号×固件合成请求',46:'型号×固件合成请求',2:'互斥订阅状态',6:'互斥订阅状态'})[id]??'汇总值与模拟分片估算';
const main = document.querySelector('#main');
document.querySelector('.skip-link')?.addEventListener('click',event=>{
  event.preventDefault();
  main.focus({preventScroll:true});
  main.scrollIntoView({block:'start',behavior:'instant'});
});
let dataset;
let sourceData;
let filterState={};
const filterDisclosure=new Map();
let startupInProgress=false;
let appEventsBound=false;
const chartAnimationDuration=duration=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:duration;
let definitionReturnFocus;
let chart;
let homeTrendFocus=13;
let statusChart;
const sparklines=[];
const detailCharts=[];
const ACTION_STORAGE_KEY='parallens-demo-actions-v1';
let simulatedActionState={};
try { simulatedActionState=JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY)||'{}')||{}; } catch { simulatedActionState={}; }
window.addEventListener('resize',()=>{
  chart?.resize(); statusChart?.resize(); sparklines.forEach(item=>item.resize()); detailCharts.forEach(item=>item.resize());
},{passive:true});
const number = value => Number(value).toLocaleString('zh-CN');
const percent = value => `${(value * 100).toFixed(1)}%`;
function periodLabel(label) {
  const week=sourceData?.weekly?.find(item=>`W${item.week}`===label);
  if(!week)return label;
  const end=new Date(`${week.weekEnd}T00:00:00Z`),start=new Date(end);
  start.setUTCDate(start.getUTCDate()-6);
  const short=date=>`${date.getUTCMonth()+1}/${date.getUTCDate()}`;
  return `${label} · ${short(start)}–${short(end)}`;
}
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const filterLabels={
  week:'统计周',country:'国家/市场',appPlatform:'App平台',productLine:'产品线',deviceModel:'设备型号',
  deviceStatus:'设备状态',season:'未使用判定规则',salesChannel:'自报销售渠道',billingCycle:'计费周期',
  subscriptionPlatform:'订阅平台',plan:'套餐',firmware:'固件版本',functionType:'功能类型',anomalyType:'异常类型',
};
const optionLabels={
  US:'美国',UK:'英国',DE:'德国',Other:'其他',Bird:'观鸟',Hunting:'狩猎',Effective:'有效设备',Inactive:'非有效设备',
  Migration:'迁徙季',Amazon:'Amazon',Shopify:'Shopify',monthly:'月付',annual:'年付',Starter:'Starter',
  Upload:'上传',Live:'直播',Playback:'事件回看',Recognition:'AI识别查看',Push:'推送',Business:'业务异常',Device:'设备异常',Quality:'数据质量',
};
const optionLabel=(key,value)=>key==='season'&&value==='Other'?'淡季':optionLabels[value]??value;
const controlScopes={period:'时间',page:'页面范围',module:'模块细分',view:'分析视角',rule:'业务规则'};
const paidPlanMetricIds=new Set([2,3,6,17,18,19,21,23,32,33,34,35,52]);
const trialFactDimensions=new Set(['week','country','appPlatform','productLine','subscriptionPlatform','plan','billingCycle']);
function trialRows(state=filterState,period) {
  const unsupported=Object.entries(state).find(([key,value])=>value&&value!=='All'&&!trialFactDimensions.has(key));
  if(unsupported)return {rows:null,reason:`新增试用明细暂无${filterLabels[unsupported[0]]}字段`};
  let rows=sourceData.trialFacts.records.filter(row=>!period||row.period===period);
  if(state.week) {
    const week=sourceData.weekly.find(item=>String(item.week)===String(state.week));
    rows=rows.filter(row=>row.maturity_week_end===week?.weekEnd);
  }
  if(state.country)rows=rows.filter(row=>row.country===state.country);
  if(state.appPlatform)rows=rows.filter(row=>row.app_platform===state.appPlatform);
  if(state.productLine)rows=rows.filter(row=>row.product_line===state.productLine);
  if(state.subscriptionPlatform)rows=rows.filter(row=>row.subscription_platform===state.subscriptionPlatform);
  if(state.plan)rows=rows.filter(row=>row.plan===state.plan);
  if(state.billingCycle)rows=rows.filter(row=>row.billing_cycle===state.billingCycle);
  return {rows};
}
function trialAggregate(rows) {
  const denominator=rows.length,numerator=rows.filter(row=>row.converted).length;
  const attempts=rows.filter(row=>row.payment_attempted).length;
  const failed=rows.filter(row=>row.payment_status==='failed').length;
  return {denominator,numerator,value:denominator?numerator/denominator:null,attempts,failed};
}
function trialMetric(state=filterState) {
  const selectedWeek=state.week??String(sourceData.weekly.at(-1).week);
  const result=trialRows({...state,week:selectedWeek});
  if(!result.rows)return na(result.reason);
  const {denominator,numerator,value}=trialAggregate(result.rows);
  return denominator>=30?{kind:'rate',denominator,numerator,value,source:'trial-facts'}:
    na(denominator?`新增试用明细样本不足30（${denominator}人）`:'新增试用明细中没有该筛选组合');
}
const relevantFilters=page=>page?Object.entries(sourceData?.filterPolicy?.controls??{})
  .filter(([,config])=>config.pages.includes(page)).map(([key])=>key):['country','productLine','appPlatform'];
const selectedFilters=()=>Object.entries(filterState).filter(([,value])=>value&&value!=='All');
function availableOptions(page,key,state=filterState) {
  const config=sourceData.filterPolicy.controls[key];
  if(key==='week')return sourceData.weekly.map(w=>String(w.week));
  if(key==='deviceModel'&&state.productLine)return config.options.filter(value=>
    (value==='Hunt Pro')===(state.productLine==='Hunting'));
  return config.optionsByProduct?(config.optionsByProduct[state.productLine]??[...new Set(Object.values(config.optionsByProduct).flat())]):
    config.optionsByPage?.[page]??config.options;
}
const selectedFor=page=>selectedFilters().filter(([key,value])=>relevantFilters(page).includes(key)&&
  availableOptions(page,key).includes(value));
const hasDataFilters=page=>selectedFor(page).some(([key])=>
  ['page','module','period'].includes(sourceData.filterPolicy.controls[key].scope));
function routeHref(page='',metricId) {
  const params=new URLSearchParams();
  selectedFor(page).forEach(([key,value])=>params.set(key,value));
  if (metricId) params.set('metric',String(metricId));
  return `#/${page}${params.size?`?${params}`:''}`;
}
function readRoute() {
  const [path,query='']=location.hash.replace(/^#\/?/,'').split('?');
  const page=path.replace(/\/$/,'').toUpperCase();
  const params=new URLSearchParams(query);
  filterState={};
  for (const key of relevantFilters(pages[page]?page:'')) if(params.has(key)&&
    availableOptions(pages[page]?page:'',key,filterState).includes(params.get(key)))filterState[key]=params.get(key);
  return {page:pages[page]?page:'',metricId:Number(params.get('metric'))||null};
}
function activeFilterDescription() {
  return selectedFilters().map(([key,value])=>`${filterLabels[key]}：${key==='week'?`W${value}`:optionLabel(key,value)}`).join(' · ');
}
function filterBar(page='') {
  const bar=element('details','filter-bar');bar.setAttribute('aria-label','数据筛选');
  bar.open=filterDisclosure.get(page)??false;
  bar.addEventListener('toggle',()=>{if(bar.isConnected)filterDisclosure.set(page,bar.open);});
  bar.append(element('summary','filter-summary',selectedFilters().length?`当前条件 · ${activeFilterDescription()} · 点击调整`:`筛选与分析视角 · 点击展开`));
  const content=element('div','filter-content');
  const header=element('div','filter-bar-head');
  header.append(element('strong','','当前范围与作用对象'),element('span','',
    '正式账号排除测试账号，试用属于订阅状态；设备类默认有效设备。各指标按自身分母和周期计算。'));
  const reset=element('button','filter-reset','重置全部');reset.type='button';
  reset.addEventListener('click',()=>changeFilter(page,null,null));header.append(reset);content.append(header);
  for(const scope of ['period','page','module','view','rule']) {
    const keys=relevantFilters(page).filter(key=>sourceData.filterPolicy.controls[key].scope===scope);
    if(!keys.length)continue;
    const group=element('fieldset','filter-group');group.append(element('legend','',controlScopes[scope]));
    const fields=element('div','filter-fields');
    for (const key of keys) {
    const config=sourceData.filterPolicy.controls[key];
    const label=element('label','filter-field');label.append(element('span','',config.label));
    const select=element('select','');select.name=key;select.setAttribute('aria-label',filterLabels[key]);
    const all=element('option','',key==='deviceStatus'?'默认：有效设备':scope==='view'?'全部功能':scope==='rule'?'按当前规则':'全部');all.value='All';select.append(all);
    const values=key==='week'?[...availableOptions(page,key)].reverse():availableOptions(page,key);
    const options=Object.fromEntries(values.map(v=>[v,key==='week'?`W${v} · ${sourceData.weekly.find(w=>String(w.week)===v)?.weekEnd}`:optionLabel(key,v)]));
    for (const [value,text] of Object.entries(options)) {const option=element('option','',text);option.value=value;select.append(option);}
    select.value=filterState[key]??'All';select.addEventListener('change',()=>changeFilter(page,key,select.value));
    label.append(select);
    if(page) {
      const affected=sourceData.filterPolicy.metrics.filter(item=>item.page===page&&item.businessDimensions.includes(key));
      const ready=affected.filter(item=>item.demonstrableDimensions.includes(key));
      const note=element('small','filter-field-note',scope==='view'||scope==='rule'?
        `仅作用 #${affected.map(item=>String(item.id).padStart(2,'0')).join('、#')}`:
        `作用 ${affected.length} 项 · 可演示 ${ready.length} 项${affected.length>ready.length?` · 待补 ${affected.length-ready.length} 项`:''}`);
      label.append(note);
    }
    fields.append(label);
    }
    group.append(fields);content.append(group);
  }
  content.append(element('p','filter-active',selectedFilters().length?
    `已应用：${activeFilterDescription()}。分析视角只影响对应指标；业务适用但缺演示明细时显示“待补数据”。`:
    '所有关键指标按默认业务对象展示；切换筛选后，请核对每张卡的适用状态与周期。'));
  bar.append(content);
  return bar;
}
function changeFilter(page,key,value) {
  const previousBar=document.querySelector('.filter-bar');
  if(previousBar)filterDisclosure.set(page,previousBar.open);
  const currentMetric=Number(new URLSearchParams(location.hash.split('?')[1]??'').get('metric'))||null;
  if (!key) filterState={};
  else if (value==='All') delete filterState[key];
  else filterState[key]=value;
  if(key==='productLine') {
    for(const dependent of ['plan','deviceModel'])if(filterState[dependent]&&
      !availableOptions(page,dependent).includes(filterState[dependent]))delete filterState[dependent];
  }
  const next=routeHref(page,currentMetric);
  history.pushState(null,'',next);
  renderRoute({preserveScroll:true});
  const nextBar=document.querySelector('.filter-bar');
  const nextControl=nextBar?.querySelector(key?`select[name="${key}"]`:'.filter-reset');
  (nextControl??nextBar?.querySelector('summary'))?.focus({preventScroll:true});
  document.querySelector('#announcement').textContent=`筛选已更新：${activeFilterDescription()||'已重置'}`;
}
const na=reason=>({kind:'na',reason});
const pending=reason=>({kind:'na',availability:'pending',reason});
const contractFor=id=>sourceData.contract.find(item=>item.id===id);
const policyFor=id=>sourceData.filterPolicy.metrics.find(item=>item.id===id);
const effectiveFor=(id,state=filterState)=>Object.entries(state).filter(([key,value])=>
  value&&value!=='All'&&policyFor(id).businessDimensions.includes(key));
const trialState=(state=filterState)=>Object.fromEntries(effectiveFor(18,state));
function weeklyMetric(id,w) {
  const rateValue=(n,d)=>({kind:'rate',numerator:n,denominator:d,value:d?n/d:0});
  const countValue=n=>({kind:'count',value:n});
  if(id===9) return countValue(w.registrationCohort.registered);
  if(id===10) return rateValue(w.registrationCohort.bound72h,w.registrationCohort.registered);
  if(id===11) return rateValue(w.bindingAttempts.successful,w.bindingAttempts.total);
  if(id===12) return {kind:'group',value:{D7:rateValue(w.registrationCohort.firstImage7d,w.registrationCohort.registered)}};
  if(id===13) return rateValue(w.registrationCohort.valueActivated7dBird,w.registrationCohort.birdEligible);
  if(id===17) return rateValue(w.registrationCohort.trialStarted7d,w.registrationCohort.registered);
  if(id===18) return rateValue(w.trialMaturity.converted,w.trialMaturity.completed);
  if(id===23) return rateValue(w.renewal.successful,w.renewal.due);
  if(id===42) return rateValue(w.deviceEventsBird.empty,w.deviceEventsBird.triggers);
  return na('该指标没有完整的周度模拟事实');
}
function sharesFor(filters,metricId) {
  let denominator=1,numerator=1;
  const dimensions=filters.some(([key])=>key==='deviceModel')?
    filters.filter(([key])=>key!=='productLine'):filters;
  for(const [key,value] of dimensions) {
    if(key==='deviceStatus'&&value==='Effective')continue;
    let slice=sourceData.slices[key]?.[value];
    if(!slice) continue;
    if(key==='plan'&&paidPlanMetricIds.has(metricId)&&value!=='Free') {
      const paid=sourceData.slices.plan;
      slice={denominatorShare:slice.denominatorShare/(paid.Starter.denominatorShare+paid.Plus.denominatorShare+paid.Pro.denominatorShare),
        numeratorShare:slice.numeratorShare/(paid.Starter.numeratorShare+paid.Plus.numeratorShare+paid.Pro.numeratorShare)};
    }
    denominator*=slice.denominatorShare;numerator*=slice.numeratorShare;
  }
  return {denominator,numerator};
}
function allocatedCount(total,filters,metricId,kind,shares) {
  if(!Number.isInteger(total))return total*shares[kind];
  const dimensions=filters.some(([key])=>key==='deviceModel')?
    filters.filter(([key])=>key!=='productLine'):filters;
  if(dimensions.length===1&&dimensions[0][0]==='deviceStatus'&&dimensions[0][1]==='Effective')return total;
  if(dimensions.length!==1)return Math.round(total*shares[kind]);
  const [key,selected]=dimensions[0];
  const all=Object.entries(sourceData.slices[key]??{}).filter(([name])=>
    !(key==='plan'&&paidPlanMetricIds.has(metricId)&&name==='Free'));
  if(!all.length)return Math.round(total*shares[kind]);
  const property=kind==='numerator'?'numeratorShare':'denominatorShare';
  const weightTotal=all.reduce((sum,[,slice])=>sum+slice[property],0);
  const parts=all.map(([name,slice],index)=>{
    const exact=total*slice[property]/weightTotal;
    return {name,index,value:Math.floor(exact),fraction:exact-Math.floor(exact)};
  });
  const remaining=total-parts.reduce((sum,part)=>sum+part.value,0);
  [...parts].sort((a,b)=>b.fraction-a.fraction||a.index-b.index).slice(0,remaining).forEach(part=>part.value++);
  return parts.find(part=>part.name===selected)?.value??0;
}
function projectValue(raw,shares,filters=[],metricId) {
  if(raw?.kind==='rate') {
    const d=allocatedCount(raw.denominator,filters,metricId,'denominator',shares);
    const n=Math.min(d,allocatedCount(raw.numerator,filters,metricId,raw.value>.9?'denominator':'numerator',shares));
    return d>=30?{kind:'rate',numerator:n,denominator:d,value:n/d}:na('筛选后样本不足（分母少于30）');
  }
  if(raw?.kind==='count'||raw?.kind==='usd') return {...raw,value:allocatedCount(raw.value,filters,metricId,'denominator',shares)};
  if(raw?.kind==='group') return {kind:'group',value:projectGroup(raw.value,shares,filters,metricId)};
  return raw;
}
function projectGroup(value,shares,filters,metricId) {
  if(value?.kind==='rate') return projectValue(value,shares,filters,metricId);
  if(typeof value==='number') return value>0&&value<1?value:allocatedCount(value,filters,metricId,'denominator',shares);
  if(Array.isArray(value)) return value.map(item=>projectGroup(item,shares,filters,metricId));
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,projectGroup(item,shares,filters,metricId)]));
  return value;
}
function technicalMetric(id,state,filters) {
  const records=sourceData.technicalFacts.records.filter(row=>
    (!state.productLine||(row.model==='Hunt Pro'?'Hunting':'Bird')===state.productLine)&&
    (!state.deviceModel||row.model===state.deviceModel)&&(!state.firmware||row.firmware===state.firmware));
  if(!records.length)return na('该型号与固件组合没有合成请求样本');
  const other=filters.filter(([key])=>!['productLine','deviceModel','firmware','functionType','week'].includes(key));
  const shares=sharesFor(other,id);
  const total=records.reduce((sum,row)=>sum+row.attempts,0);
  const denominator=allocatedCount(total,other,id,'denominator',shares);
  if(denominator<30)return na('筛选后请求样本少于30');
  const rateFor=field=>{
    const failures=records.reduce((sum,row)=>sum+row[field],0);
    const projected=Math.min(denominator,allocatedCount(failures,other,id,'numerator',shares));
    return {kind:'rate',numerator:denominator-projected,denominator,value:(denominator-projected)/denominator};
  };
  if(id===45) {
    const heartbeats=sourceData.metrics.m45.value.reportedWithin24h;
    const all=filters.filter(([key])=>key!=='week');
    return {kind:'group',value:{networkSuccess:rateFor('networkFailures'),
      reportedWithin24h:allocatedCount(heartbeats,all,id,'denominator',sharesFor(all,id))}};
  }
  const field={Upload:'upload',Live:'live',Push:'push'}[state.functionType];
  const names=field?[field]:['upload','live','push'];
  const failures={upload:'uploadFailures',live:'liveFailures',push:'pushFailures'};
  return {kind:'group',value:Object.fromEntries(names.map(name=>[name,rateFor(failures[name])]))};
}
function projectMetric(id,state=filterState) {
  const contract=contractFor(id);
  const policy=policyFor(id);
  const filters=effectiveFor(id,state);
  for(const [key,value] of filters) {
    if(key==='week'&&!contract.dimensions.includes(key))continue;
    if(!policy.demonstrableDimensions.includes(key))return pending(`${filterLabels[key]}适用，但演示数据缺少同范围明细`);
    if(!['week','functionType'].includes(key)&&!sourceData.slices[key]?.[value]) return na('未定义的筛选值');
  }
  const scoped=Object.fromEntries(filters),product=scoped.productLine,model=scoped.deviceModel;
  if(scoped.deviceStatus==='Inactive'&&[8,11,15,16,27,41,42,43,44,45,46,47].includes(id))
    return na('该指标以有效设备为统计对象，非有效设备不属于分母');
  if(product&&model&&product!=='All'&&model!=='All'&&((product==='Hunting')!==(model==='Hunt Pro')))
    return na('产品线与设备型号组合无样本');
  if(product&&scoped.plan&&((product==='Bird'&&scoped.plan==='Starter')||(product==='Hunting'&&scoped.plan==='Free')))
    return na('该套餐不属于所选产品线');
  if(product==='Hunting'&&[13,22,42].includes(id))return na('本指标只定义观鸟线，狩猎线口径待定义');
  if(scoped.plan==='Free'&&paidPlanMetricIds.has(id))
    return na('Free不是付费试用、订阅或续费套餐，不构成该指标的分母');
  if(id===22&&scoped.plan&&scoped.plan!=='Free')return na('本项只统计观鸟Free权益');
  if(scoped.plan&&id===5) return pending('套餐适用，但底表缺少按套餐拆分的互斥订阅状态人数');
  if(id===27&&scoped.functionType) {
    const usage=sourceData.functionUsage.functions[scoped.functionType];
    if(!usage)return na('该功能不属于活跃用户的业务功能使用口径');
    const applicable=filters.filter(([key])=>key!=='functionType');
    const shares=sharesFor(applicable,id);
    const d=allocatedCount(sourceData.functionUsage.denominator,applicable,id,'denominator',shares);
    const n=Math.min(d,allocatedCount(usage.users,applicable,id,'numerator',shares));
    return d>=30?{kind:'rate',numerator:n,denominator:d,value:n/d}:na('筛选后活跃主账号少于30');
  }
  if(id===46&&scoped.functionType&&!['Upload','Live','Push'].includes(scoped.functionType))
    return na('该功能不属于技术链路成功率口径');
  if(id===45||id===46)return technicalMetric(id,scoped,filters);
  if(id===29) {
    const age=sourceData.inactivityCohorts;
    const threshold=scoped.season==='Other'?30:21;
    const applicable=filters.filter(([key])=>key!=='season');
    const shares=sharesFor(applicable,id);
    const d=allocatedCount(age.eligibleOwners,applicable,id,'denominator',shares);
    const eligible=threshold===21?age.lastActiveDays['21to29']+age.lastActiveDays['30plus']:age.lastActiveDays['30plus'];
    const n=Math.min(d,allocatedCount(eligible,applicable,id,'numerator',shares));
    return d>=30?{kind:'rate',numerator:n,denominator:d,value:n/d,thresholdDays:threshold}:na('可观察主账号少于30');
  }
  if(id===18)return trialMetric(scoped);
  let raw=sourceData.metrics[`m${String(id).padStart(2,'0')}`];
  if(scoped.week&&contract.dimensions.includes('week')) {
    const weekly=sourceData.weekly.find(w=>String(w.week)===scoped.week);
    if(!weekly) return na('指定周不存在');
    raw=weeklyMetric(id,weekly);
  }
  if(raw.kind==='na') return raw;
  const effectiveFilters=filters.filter(([key])=>key!=='week'||contract.dimensions.includes('week'));
  if(effectiveFilters.length&&[14,26,33,38].includes(id)) return na('本项只有汇总分布或分位数，缺少可重算的维度明细');
  if(effectiveFilters.length&&id===39) {
    if(effectiveFilters.some(([key])=>!['country','productLine','deviceModel'].includes(key))) return pending('型号表现缺少当前条件下的关联模拟样本');
    const records=sourceData.modelMarket.records.filter(row=>(!scoped.country||row.country===scoped.country)&&
      (!scoped.productLine||row.productLine===scoped.productLine)&&(!scoped.deviceModel||row.model===scoped.deviceModel));
    const grouped={};
    for(const row of records) {
      const item=grouped[row.model]??{owners:0,activeOwners:0,subscribedOwners:0};
      item.owners+=row.owners;item.activeOwners+=row.activeOwners;item.subscribedOwners+=row.subscribedOwners;
      grouped[row.model]=item;
    }
    return Object.keys(grouped).length?{kind:'group',value:Object.fromEntries(Object.entries(grouped).map(([name,item])=>[name,
      {owners:item.owners,activeRate:item.activeOwners/item.owners,subscriptionRate:item.subscribedOwners/item.owners}]))}:
      na('该市场、产品线与型号组合无样本');
  }
  if(effectiveFilters.length&&id===40) return {kind:'group',value:{[scoped.salesChannel]:raw.value[scoped.salesChannel]}};
  if(id===5&&scoped.productLine) {
    const key=scoped.productLine==='Bird'?'bird':'hunting';
    const applicable=filters.filter(([dimension])=>dimension!=='week'&&dimension!=='productLine');
    const shares=sharesFor(applicable,id);
    const value=projectGroup({[key]:raw.value[key]},shares,applicable,id);
    return Object.values(value[key]).reduce((a,b)=>a+b,0)>=30?{kind:'group',value}:na('筛选后订阅状态样本不足30');
  }
  if(id===21&&scoped.productLine) {
    const line=sourceData.subscriptionFlow.byProductLine[scoped.productLine];
    if(!line)return na('该产品线没有订阅状态流水');
    const applicable=filters.filter(([dimension])=>dimension!=='productLine'&&dimension!=='week');
    const shares=sharesFor(applicable,id);
    const value=projectGroup(line,shares,applicable,id);
    value.closing=value.opening+value.trialPaid+value.directPaid+value.recovered-value.lost;
    return {kind:'group',value};
  }
  const applicable=filters.filter(([key])=>key!=='week'&&!(id===22&&key==='plan')&&
    !(scoped.productLine==='Bird'&&[13,22,42].includes(id)&&key==='productLine'));
  const shares=sharesFor(applicable,id);
  const result=projectValue(raw,shares,applicable,id);
  if(result.kind==='group'&&JSON.stringify(result).includes('"kind":"na"'))return na('筛选后至少一个子项的分母不足30');
  if(id===5&&result.kind==='group'&&Object.values(result.value).flatMap(line=>Object.values(line)).reduce((a,b)=>a+b,0)<30)
    return na('筛选后订阅状态样本不足30');
  if(id===25&&result.kind==='group'&&result.value.MAU<30)return na('筛选后月活样本不足30');
  if(id===21&&result.kind==='group') {
    const v=result.value;v.closing=v.opening+v.trialPaid+v.directPaid+v.recovered-v.lost;
  }
  if(id===35&&result.kind==='group') {
    const v=result.value;
    if(v.monthlySubscriptionPayers<30)return na('筛选后月内付款用户少于30，ARPPU不适用');
    v.subscriptionNetIncome=allocatedCount(raw.value.subscriptionNetIncome,applicable,id,'numerator',shares);
    v.ARPPU=v.subscriptionNetIncome/v.monthlySubscriptionPayers;
  }
  return result;
}
function projectDataset() {
  dataset={...sourceData,metrics:Object.fromEntries(sourceData.contract.map(c=>[`m${String(c.id).padStart(2,'0')}`,projectMetric(c.id)]))};
  const statuses=dataset.metrics.m05,subscribers=dataset.metrics.m02,subscriptionRate=dataset.metrics.m06,flow=dataset.metrics.m21;
  if(statuses.kind==='group'&&subscribers.kind==='count') {
    const total=Object.values(statuses.value).reduce((sum,line)=>sum+line.paidCurrent+line.cancelledButEntitled,0);
    subscribers.value=total;
  }
  if(subscriptionRate.kind==='rate') {
    if(statuses.kind==='group'&&subscribers.kind==='count') {
      const eligible=Object.values(statuses.value).reduce((sum,line)=>sum+Object.values(line).reduce((a,b)=>a+b,0),0);
      Object.assign(subscriptionRate,{numerator:subscribers.value,denominator:eligible,value:subscribers.value/eligible});
    } else {
      dataset.metrics.m06=na('此筛选缺少同范围的互斥订阅状态人数，无法重算订阅率');
    }
  }
  if(flow.kind==='group'&&subscribers.kind==='count') {
    const v=flow.value;v.closing=subscribers.value;
    v.lost=v.opening+v.trialPaid+v.directPaid+v.recovered-v.closing;
  }
}
const catalogItem = id => dataset.catalog.find(metric => metric.id === id);
const definitionFor = id => catalogItem(id)?.definition ?? '';
const metric = id => dataset.metrics[`m${String(id).padStart(2,'0')}`];
const formatMetric = id => {
  const value = metric(id);
  if (value.kind === 'na') return value.availability==='pending'?'待补数据':'不适用';
  if (value.kind === 'rate') return percent(value.value);
  if (value.kind === 'usd') return `$${number(value.value)}`;
  return number(value.value);
};
function definition(id,label=catalogItem(id)?.name ?? '指标') {
  const button=element('button','definition-trigger','i');
  button.type='button';
  button.setAttribute('aria-label',`查看${label}口径`);
  button.setAttribute('aria-controls','metric-definition-popover');
  button.setAttribute('aria-haspopup','dialog');
  button.title=`查看${label}口径`;
  button.addEventListener('click',event=>{
    event.stopPropagation();
    definitionReturnFocus=button;
    const item=catalogItem(id);
    const popover=document.querySelector('#metric-definition-popover');
    popover.replaceChildren();
    const heading=element('div','definition-popover-head');
    heading.append(element('strong','',`${label} · 指标口径`));
    const close=element('button','definition-close','×');
    close.type='button';close.setAttribute('aria-label','关闭指标口径');
    close.addEventListener('click',()=>closeDefinitionPopover());
    heading.append(close);popover.append(heading);
    for (const [name,value] of [['定义',item?.definition],['计算方法',item?.formula],['数据粒度',item?.grain],['数据来源',item?.source]]) {
      if (!value) continue;
      const row=element('div','definition-popover-row');
      row.append(element('span','',name),element('p','',value));popover.append(row);
    }
    if (popover.showPopover) {
      if(popover.matches(':popover-open'))popover.hidePopover();
      popover.hidden=false;popover.showPopover();
    }
    else {popover.hidden=false;popover.classList.add('definition-fallback-open');}
    const rect=button.getBoundingClientRect();
    const width=Math.min(440,window.innerWidth-32);
    const left=Math.min(Math.max(16,rect.left),window.innerWidth-width-16);
    popover.style.width=`${width}px`;
    popover.style.left=`${left}px`;
    popover.style.top=`${Math.min(rect.bottom+10,window.innerHeight-100)}px`;
    if (popover.getBoundingClientRect().bottom>window.innerHeight-16)
      popover.style.top=`${Math.max(16,rect.top-popover.offsetHeight-10)}px`;
    close.focus();
  });
  return button;
}
function closeDefinitionPopover() {
  const popover=document.querySelector('#metric-definition-popover');
  if (popover?.showPopover && popover.matches(':popover-open')) popover.hidePopover();
  else if (popover) {popover.hidden=true;popover.classList.remove('definition-fallback-open');}
  if(definitionReturnFocus?.isConnected) definitionReturnFocus.focus({preventScroll:true});
}
function card({id,label,value,page,detail,status='',severity='neutral',star=false,kind='snapshot'}) {
  const article = element('article',kind==='journey' ? `journey-card${star?' star':''}` : 'snapshot-card');
  if (kind === 'journey') {
    const index = element('div','node-index');
    index.append(element('span','',`N${detail}`),element('span',star?'star-mark':'',star?'★ 关键节点':'经营节点'));
    article.append(index);
  }
  const heading=element('div','metric-heading');
  heading.append(element('div','metric-label',label),definition(id,label));
  article.append(heading);
  const link = element('a',kind==='journey'?'node-link':'card-link');
  link.href = routeHref(page,id);
  link.setAttribute('aria-label',`${label} ${value}，查看${pages[page]?.title??'诊断'}数据`);
  const trend=kind==='snapshot'?headlineTrend(id):null;
  link.append(metricValueRow(id,element('div','metric-value',value),trend));
  if (status) {
    const statusLine = element('div',kind==='journey'?'node-status':'card-foot');
    const dot = element('span',`status-dot ${severity}`);
    statusLine.append(dot,element('span','',status));
    link.append(statusLine);
  }
  article.append(link);
  if (kind === 'journey') article.append(nodeTrendDetails(id));
  if (trend) article.append(trend);
  if (kind==='snapshot'&&id===21) {
    const flow=netAddComparison();if(flow)article.append(flow);
  }
  return article;
}
function trendValues(id) {
  if(id===27&&filterState.functionType)return null;
  if(id===18) {
    const values=sourceData.weekly.map(w=>{
      const result=trialRows(Object.fromEntries(effectiveFor(18,{...filterState,week:String(w.week)})));
      if(!result.rows)return null;
      const summary=trialAggregate(result.rows);
      return summary.denominator>=30?summary.value*100:null;
    });
    return values.some(value=>value!==null)?values:null;
  }
  const history=sourceData.metricTrends?.[`m${String(id).padStart(2,'0')}`];
  if(history) {
    const invalid=effectiveFor(id).some(([key])=>key!=='week'&&!policyFor(id).demonstrableDimensions.includes(key));
    if(invalid)return null;
    const applicable=effectiveFor(id).filter(([key])=>key!=='week');
    const shares=sharesFor(applicable,id);
    const values=history.points.map(raw=>{
      if(id===2&&metric(2).kind==='count')
        return Math.round(raw.value*metric(2).value/sourceData.metrics.m02.value);
      const value=projectValue(raw,shares,applicable,id);
      return value.kind==='na'?null:value.kind==='rate'?value.value*100:value.value;
    });
    return values.some(value=>value!==null)?values:null;
  }
  if(filterState.productLine==='Hunting'&&[13,42].includes(id))return null;
  const invalid=effectiveFor(id).some(([key])=>key!=='week'&&!policyFor(id).demonstrableDimensions.includes(key));
  if(invalid) return null;
  const applicable=effectiveFor(id).filter(([key])=>key!=='week'&&
    !(filterState.productLine==='Bird'&&[13,42].includes(id)&&key==='productLine'));
  const shares=sharesFor(applicable,id);
  return sourceData.weekly.map(w=>{
    const raw=id===34?{kind:'count',value:w.paidUsersIncludingPackOnly}:weeklyMetric(id,w);
    const value=projectValue(raw,shares,applicable,id);
    return value.kind==='rate'?value.value*100:value.value;
  });
}
const headlineTrendIds=new Set([2,3,4,9,10,11,13,15,17,18,23,24,27,34,35,41,42,48,49,52,53,54]);
function metricHistory(id) {
  if(!headlineTrendIds.has(id)||metric(id)?.kind==='na')return null;
  if(id===35) {
    const counts=sourceData.diagnostics.E.chart.series[0].values;
    const arppus=sourceData.diagnostics.E.extraCharts[0].series[0].values;
    const filters=effectiveFor(id);
    if(filters.some(([key])=>!policyFor(id).demonstrableDimensions.includes(key)))return null;
    const shares=sharesFor(filters,id);
    const values=counts.map((count,index)=>{
      const payers=allocatedCount(count,filters,id,'denominator',shares);
      const revenue=allocatedCount(Math.round(count*arppus[index]),filters,id,'numerator',shares);
      return payers>=30?revenue/payers:null;
    });
    values[values.length-1]=metric(id).value.ARPPU;
    const details=counts.map((count,index)=>({numerator:allocatedCount(Math.round(count*arppus[index]),filters,id,'numerator',shares),
      denominator:allocatedCount(count,filters,id,'denominator',shares),basisLabel:'订阅净收入 / 付款主账号',numeratorUnit:'美元',denominatorUnit:'人'}));
    return {labels:['6月','7月','8月'],values,details,unit:'美元/人',title:'订阅ARPPU',
      note:`按同月订阅净收入÷月内付款主账号重算；月份为完整自然月。${filters.length?'筛后历史为模拟分片估算。':''}`};
  }
  const history=sourceData.metricTrends?.[`m${String(id).padStart(2,'0')}`];
  const labels=history?.labels??sourceData.weekly.map(w=>`W${w.week}`);
  const values=trendValues(id);
  if(!values||!values.some(value=>value!==null&&Number.isFinite(value)))return null;
  const details=history?.kind==='rate'?history.points.map(raw=>{
    const applicable=effectiveFor(id).filter(([key])=>key!=='week');
    const value=projectValue(raw,sharesFor(applicable,id),applicable,id);
    return value.kind==='rate'?value:null;
  }):[10,11,13,17,18,23,42].includes(id)?weeklyRateDetails(id):null;
  const estimated=effectiveFor(id).some(([key])=>key!=='week')&&id!==18?
    '当前筛选的整条历史序列采用同一模拟分片方法，不能用于真实经营判断。':'';
  return {labels,values,details,unit:history?.unit??([9,34].includes(id)?'人':'%'),
    title:id===54?'事件丢失率':catalogItem(id).name,
    note:`${history?.note??(id===18?'合成试用明细逐周聚合。':'原有12个完整周模拟汇总。')}${estimated}`};
}
function weeklyRateDetails(id) {
  if(id===18)return sourceData.weekly.map(week=>{
    const result=trialRows(Object.fromEntries(effectiveFor(id,{...filterState,week:String(week.week)})));
    return result.rows?{...trialAggregate(result.rows),numeratorUnit:'人',denominatorUnit:'人'}:null;
  });
  const filters=effectiveFor(id).filter(([key])=>key!=='week'&&!(key==='productLine'&&filterState.productLine==='Bird'&&[13,42].includes(id)));
  const shares=sharesFor(filters,id);
  return sourceData.weekly.map(week=>{
    const value=projectValue(weeklyMetric(id,week),shares,filters,id);
    return value.kind==='rate'?{...value,numeratorUnit:[11,42].includes(id)?'次':'人',denominatorUnit:[11,42].includes(id)?'次':'人'}:null;
  });
}
function paidPayersHistory() {
  const id=35,filters=effectiveFor(id),value=metric(id);
  if(value.kind!=='group'||filters.some(([key])=>!policyFor(id).demonstrableDimensions.includes(key)))return null;
  const shares=sharesFor(filters,id);
  const counts=sourceData.diagnostics.E.chart.series[0].values;
  const values=counts.map(count=>allocatedCount(count,filters,id,'denominator',shares));
  values[values.length-1]=value.value.monthlySubscriptionPayers;
  return {labels:['6月','7月','8月'],values,unit:'人',title:'月内订阅付款主账号',
    note:`完整自然月去重付款人数；与期末有效订阅人数不同。${filters.length?'筛后历史按模拟分片估算。':''}`};
}
function trialFailureHistory() {
  const details=sourceData.weekly.map(w=>{
    const result=trialRows(Object.fromEntries(effectiveFor(18,{...filterState,week:String(w.week)})));
    if(!result.rows)return null;
    const summary=trialAggregate(result.rows);
    return summary.attempts>=30?{numerator:summary.failed,denominator:summary.attempts,numeratorUnit:'人',denominatorUnit:'人'}:null;
  });
  const values=details.map(detail=>detail?detail.numerator/detail.denominator*100:null);
  return values.some(Number.isFinite)?{labels:sourceData.weekly.map(w=>`W${w.week}`),values,details,unit:'%',
    title:'支付失败率',note:'同一筛选下逐周按支付失败人数÷支付尝试人数计算；与成熟试用转正率分母不同。'}:null;
}
function filteredBreakdown(page) {
  const id=page==='B'&&filterState.functionType?27:primaryTrendMetric[page];
  const contract=contractFor(id);
  const selected=effectiveFor(id).find(([key])=>key!=='week'&&key!=='season'&&policyFor(id).demonstrableDimensions.includes(key));
  if(!selected)return null;
  const [dimension]=selected;
  const options=dimension==='functionType'?(page==='C'?['Upload','Live','Push']:['Live','Playback','Recognition']):
    Object.keys(sourceData.slices[dimension]??{});
  const rows=options.map(option=>{
    const state={...filterState,[dimension]:option};
    const value=projectMetric(id,state);
    return {label:optionLabels[option]??option,value};
  }).filter(row=>row.value.kind==='rate'||row.value.kind==='count'||row.value.kind==='usd');
  if(rows.length<2)return null;
  const unit=rows[0].value.kind==='rate'?'%':rows[0].value.kind==='usd'?'美元':'人';
  const values=rows.map(row=>row.value.kind==='rate'?row.value.value*100:row.value.value);
  const spec={title:`${filterLabels[dimension]} · ${catalogItem(id).name}分组对照`,unit,
    labels:rows.map(row=>row.label),details:unit==='%'?rows.map(row=>row.value):null,series:[{name:catalogItem(id).name,values}],
    note:`保留其余筛选条件，仅切换${filterLabels[dimension]}；当前模拟分组用于定位差异，不能证明原因。`};
  const table={title:`${filterLabels[dimension]} · 组规模与指标`,
    columns:['分组',unit==='%'?'分子':'当前值',unit==='%'?'分母':'统计对象', '指标值'],
    rows:rows.map(row=>row.value.kind==='rate'?[row.label,row.value.numerator,row.value.denominator,percent(row.value.value)]:
      [row.label,row.value.value,contract.entity,unit==='美元'?`$${number(row.value.value)}`:`${number(row.value.value)}${unit}`]),
    note:spec.note};
  return {spec,table};
}
function subscriptionBridgeSpec() {
  const flow=metric(21);
  if(flow.kind!=='group')return null;
  const v=flow.value;
  if(Object.values(v).some(x=>!Number.isFinite(x)||x<0))return null;
  const labels=['期初','试用转正','直接首付','恢复订阅','失去权益','期末'];
  const steps=[v.opening,v.trialPaid,v.directPaid,v.recovered,-v.lost,v.closing];
  return {kind:'waterfall',title:'有效订阅人数流转 · 9/1–9/24',unit:'人',labels,
    series:[{name:'人数变化',values:steps}],flow:v,
    note:`期初 + 试用转正 + 直接首付 + 恢复 − 失去权益 = 期末（${number(v.closing)}人）。纵轴局部放大；筛选后各项为模拟分片流转估算。`};
}
function trialContributionBreakdown() {
  if(filterState.week)return null;
  const state=Object.fromEntries(effectiveFor(18).filter(([key])=>key!=='week'));
  const previous=trialRows(state,'previous');
  const current=trialRows(state,'current');
  if(!previous.rows||!current.rows)return null;
  const beforeAll=trialAggregate(previous.rows),nowAll=trialAggregate(current.rows);
  if(beforeAll.denominator<30||nowAll.denominator<30)return null;
  const keys=[['app_platform','App平台'],['plan','套餐'],['country','国家/市场'],['product_line','产品线']];
  const [field,label]=keys.find(([name])=>!({app_platform:filterState.appPlatform,plan:filterState.plan,
    country:filterState.country,product_line:filterState.productLine})[name])??[];
  if(!field)return null;
  const options=[...new Set([...previous.rows,...current.rows].map(row=>row[field]))];
  const rows=options.map(option=>{
    const before=trialAggregate(previous.rows.filter(row=>row[field]===option));
    const now=trialAggregate(current.rows.filter(row=>row[field]===option));
    const contribution=(now.numerator/nowAll.denominator-before.numerator/beforeAll.denominator)*100;
    return {name:optionLabel(field==='product_line'?'productLine':field==='app_platform'?'appPlatform':field,option),before,now,contribution};
  }).filter(row=>row.before.denominator>=30&&row.now.denominator>=30)
    .sort((a,b)=>a.contribution-b.contribution);
  if(rows.length<2)return null;
  return {title:`${label} · 转正率变化贡献排序`,
    columns:['分组','前9周转正率','近3周转正率','近3周成熟试用','对总体变化的贡献'],
    rows:rows.map(row=>[row.name,percent(row.before.value),percent(row.now.value),row.now.denominator,
      `${row.contribution>=0?'+':''}${row.contribution.toFixed(2)} 个百分点`]),
    note:`各组按同周期总体成熟试用人数加权；${rows.length===options.length?`贡献相加约为总体 ${((nowAll.value-beforeAll.value)*100).toFixed(2)} 个百分点`:'仅展示两个周期样本均不少于30的分组，不能合计到总体'}。包含分组构成与组内转正变化，只定位差异，不证明原因。`};
}
function seasonComparisonSpec() {
  const values=['Migration','Other'].map(season=>projectMetric(29,{...filterState,season}));
  if(values.some(value=>value.kind!=='rate'))return null;
  return {title:'未使用人数对照 · 21天 / 30天',unit:'人',
    labels:['迁徙季 · 21天','淡季 · 30天'],details:values,
    series:[{name:'未使用主账号',values:values.map(value=>value.numerator)}],
    note:'同一可观察主账号范围，按最近一次复合活跃距今的天数分层重算；30天人群包含于21天人群。'};
}
function technicalBreakdown() {
  const dimension=filterState.deviceModel||filterState.productLine==='Hunting'?'firmware':'deviceModel';
  const options=dimension==='firmware'?['2.8','Other']:['K6','Bird Lite','Bird Pro','Hunt Pro'];
  const rows=options.map(option=>({label:optionLabels[option]??option,
    value:projectMetric(46,{...filterState,[dimension]:option})}))
    .filter(row=>row.value.kind==='group');
  if(rows.length<2)return null;
  const keys=filterState.functionType?[{Upload:'upload',Live:'live',Push:'push'}[filterState.functionType]]:['upload','live','push'];
  const labels={upload:'上传',live:'直播',push:'推送'};
  const series=keys.map(key=>({name:`${labels[key]}失败率`,values:rows.map(row=>(1-row.value.value[key].value)*100),
    details:rows.map(row=>({numerator:row.value.value[key].denominator-row.value.value[key].numerator,
      denominator:row.value.value[key].denominator,numeratorUnit:'次',denominatorUnit:'次'}))}));
  const highest=Math.max(...series.flatMap(line=>line.values));
  const maxY=Math.min(100,Math.max(5,Math.ceil(highest/5)*5));
  const spec={title:`${filterLabels[dimension]} · 技术链路失败请求率`,unit:'%',maxY,labels:rows.map(row=>row.label),series,
    note:`每条链路失败次数÷请求次数；纵轴从0至${maxY}%，按局部刻度观察，跨页不直接比较柱高。型号×固件使用同一组合成请求事实，仍需核对真实错误码与影响设备数。`};
  const table={title:`${filterLabels[dimension]} · 请求样本与失败次数`,
    columns:['分组','尝试次数',...keys.map(key=>`${labels[key]}失败`)],
    rows:rows.map(row=>{
      const rates=row.value.value;
      return [row.label,rates[keys[0]].denominator,...keys.map(key=>rates[key].denominator-rates[key].numerator)];
    }),note:spec.note};
  return {spec,table};
}
function modelSubscriptionRanking() {
  const value=metric(39);
  if(value.kind!=='group')return null;
  const rows=Object.entries(value.value).sort((a,b)=>b[1].subscriptionRate-a[1].subscriptionRate);
  if(rows.length<2)return null;
  const spec={title:'设备型号订阅率排序 · 合成主账号样本',unit:'%',labels:rows.map(([name])=>name),
    series:[{name:'订阅率',values:rows.map(([,part])=>part.subscriptionRate*100)}],
    note:'按订阅率排序；分母为各型号主账号。型号经营表现为相关性，不能直接解释订阅差异的原因。'};
  const table={title:'型号规模与订阅人数核对',columns:['型号','主账号','有效订阅估算','订阅率'],
    rows:rows.map(([name,part])=>[name,part.owners,Math.round(part.owners*part.subscriptionRate),percent(part.subscriptionRate)]),
    note:'订阅人数由合成主账号数×展示率回算，真实上线应使用去重主账号事实表。'};
  return {spec,table};
}
function modelSubscriptionHeatmap() {
  const value=metric(39);
  if(value.kind!=='group')return null;
  const entries=Object.entries(value.value);
  return {kind:'heatmap',title:'所选市场与型号 · 主账号活跃率和订阅率',unit:'%',
    labels:entries.map(([name])=>name),sampleSizes:entries.map(([,item])=>item.owners),
    dimensions:['30天活跃率','主账号订阅率'],
    series:[{name:'比例',values:entries.map(([,item])=>[item.activeRate*100,item.subscriptionRate*100])}],
    note:'同一0–100%色阶；每格以所选市场中归属该主型号的主账号为分母。该样本不等于全部主账号。'};
}
function headlineTrend(id) {
  const history=metricHistory(id);
  if(!history)return null;
  const index=filterState.week&&/^W\d+$/.test(history.labels[0])?Math.max(0,history.labels.indexOf(`W${filterState.week}`)):history.values.length-1;
  const current=history.values[index],before=history.values[index-1];
  const delta=current==null||before==null?null:current-before;
  const deltaText=delta==null?'暂无可比值':Math.abs(delta)<.05?'与上期持平':history.unit==='%'?
    `${delta>0?'+':''}${delta.toFixed(1)} 个百分点`:history.unit==='美元/人'?
    `${delta>0?'+':''}$${delta.toFixed(2)}（较上期）`:
    `${delta>0?'+':''}${number(Math.round(delta))}${history.unit}（较上期）`;
  const wrap=element('div','headline-trend');
  if(delta!==null)wrap.dataset.delta=String(delta);
  wrap.append(element('span','headline-trend-label',`${history.labels[index]} · ${deltaText}`));
  const box=element('div','node-sparkline headline-sparkline');box.dataset.metricId=String(id);
  box.setAttribute('role','img');box.setAttribute('aria-label',`${history.title}趋势，${history.labels[index]}${current==null?'无值':`${Number(current).toFixed(history.unit==='%'||history.unit==='美元/人'?1:0)}${history.unit}`}；${deltaText}。${history.note}`);
  wrap.append(box);
  return wrap;
}
function netAddComparison() {
  const value=metric(21);
  if(value.kind!=='group')return null;
  const {opening,closing}=value.value;
  if(!Number.isFinite(opening)||!Number.isFinite(closing))return null;
  const flow=element('div','net-add-flow');
  flow.setAttribute('aria-label',`本期有效订阅从${number(opening)}人变为${number(closing)}人，净增${number(closing-opening)}人`);
  flow.append(element('span','',`期初 ${number(opening)}`),element('span','net-add-arrow','→'),
    element('span','',`期末 ${number(closing)}`));
  return flow;
}
function metricValueRow(id,valueNode,trend) {
  const row=element('div','metric-value-row');row.append(valueNode);
  if(trend) {
    const label=trend.querySelector('.headline-trend-label');
    if(label){
      const delta=Number(trend.dataset.delta);
      const adverseWhenHigh=new Set([15,29,42,52,53,54]);
      const favorableWhenHigh=new Set([2,3,4,9,10,11,13,17,18,23,24,27,34,41,48,49]);
      const direction=adverseWhenHigh.has(id)?-1:favorableWhenHigh.has(id)?1:0;
      label.className=`metric-delta${direction&&Math.abs(delta)>.05?delta*direction>0?' improving':' adverse':''}`;
      row.append(label);
    }
  } else if(id===21&&metric(21).kind==='group') {
    const {opening,closing}=metric(21).value;
    if(opening>0&&Number.isFinite(closing))
      row.append(element('span','metric-delta',`存量较期初 ${closing-opening>=0?'+':''}${((closing-opening)/opening*100).toFixed(1)}%`));
  }
  return row;
}
function nodeTrendDetails(id) {
  const series=trendValues(id);
  if(!series) return element('p','node-change','当前维度无可用周趋势');
  const snapshotHistory=Boolean(sourceData.metricTrends?.[`m${String(id).padStart(2,'0')}`]);
  const position=filterState.week?Number(filterState.week)-1:series.length-1;
  const current=series[position], previous=series[position-1];
  const isRate=![9,34].includes(id);
  const delta=previous==null||current==null?null:isRate?current-previous:(current/previous-1)*100;
  const compare=snapshotHistory?'上期':'上周';
  const change=delta==null?'缺少可比期':Math.abs(delta)<.05?`与${compare}持平`:`${delta>0?'+':''}${delta.toFixed(1)}${isRate?'个百分点':'%'}（较${compare}）`;
  const details=element('div','node-extra');
  details.append(element('span','node-extra-label',snapshotHistory?'近12期模拟快照':filterState.week?`近12周趋势 · 当前选W${filterState.week}`:'近12周趋势'),element('p','node-change',change));
  const box=element('div','node-sparkline');
  box.dataset.metricId=String(id);
  box.setAttribute('role','img');
  box.setAttribute('aria-label',`${snapshotHistory?'最近12期模拟快照':'最近12周趋势'}；${snapshotHistory?'最新期':filterState.week?`所选W${filterState.week}`:'最新周'}值${current==null?'不适用':id===9||id===34?number(current):percent(current/100)}，${change}`);
  details.append(box);
  return details;
}
function drawSparkline(box,values,id,labels=dataset.weekly.map(w=>`W${w.week}`),unit=[9,34].includes(id)?'人':'%') {
  box.dataset.drawn='1';
  if (!window.echarts) {
    box.removeAttribute('role'); box.textContent='图表不可用；上方保留环比。'; return;
  }
  const instance=window.echarts.init(box,null,{renderer:'svg'});
  sparklines.push(instance);
  instance.setOption({
    animation:false,grid:{left:2,right:2,top:5,bottom:5},
    xAxis:{type:'category',show:false,data:labels},
    yAxis:{type:'value',show:false,scale:true},
    tooltip:{...chartTooltipStyle,trigger:'axis',formatter:params=>`${periodLabel(labels[params[0].dataIndex])}：${chartValue(params[0].value,unit)}`},
    series:[{type:'line',data:values,symbol:'circle',symbolSize:(_,params)=>filterState.week&&labels[params.dataIndex]===`W${filterState.week}`?6:0,
      smooth:.2,lineStyle:{width:2,color:'#bf762b'},areaStyle:{color:'rgba(232,150,60,.13)'}}]
  });
}
function subscriptionDetails() {
  const details=element('section','status-details');
  details.append(element('h3','','分产品线订阅状态结构'));
  const note=element('p','panel-sub','互斥状态合计为当前绑定主账号；“已取消未到期”仍计入有效付费权益。');
  details.append(note);
  if(metric(5).kind==='na') {details.append(element('p','na-note',metric(5).reason));return details;}
  const box=element('div','status-chart'); box.id='statusChart';
  box.setAttribute('role','img');box.setAttribute('aria-label','观鸟和狩猎两线的互斥订阅状态占比');
  details.append(box);
  const table=element('table','');table.append(element('caption','','分产品线状态人数'));
  const head=element('thead','');const row=element('tr','');
  ['产品线','Free或无权益','试用中','付费中','已取消未到期','支付失败','已过期','合计'].forEach(label=>row.append(element('th','',label)));
  head.append(row);table.append(head);
  const body=element('tbody','');
  for (const [key,label] of [['bird','观鸟'],['hunting','狩猎']]) {
    const item=metric(5).value[key];
    if(!item) continue;
    const values=[item.free??item.noEntitlement,item.trialEarly+item.trialNearExpiry,item.paidCurrent,item.cancelledButEntitled,item.paymentFailed,item.expired??0,Object.values(item).reduce((a,b)=>a+b,0)];
    const tr=element('tr','');tr.append(element('th','',label));values.forEach(value=>tr.append(element('td','',number(value))));body.append(tr);
  }
  table.append(body);details.append(table);
  return details;
}
function drawStatus(box) {
  box.dataset.drawn='1';
  if (!window.echarts) {box.removeAttribute('role');box.textContent='图表不可用；下方保留完整状态人数表。';return;}
  statusChart=window.echarts.init(box,null,{renderer:'svg'});
  const s=metric(5).value;
  const keys=Object.keys(s);
  const totals=Object.fromEntries(keys.map(key=>[key,Object.values(s[key]).reduce((a,b)=>a+b,0)]));
  const specs=[['Free或无权益','free','noEntitlement','#9eaa9a'],['试用中','trialEarly','trialNearExpiry','#e8b765'],['付费中','paidCurrent',null,'#356d51'],['已取消未到期','cancelledButEntitled',null,'#e8963c'],['支付失败','paymentFailed',null,'#e5484d'],['已过期','expired',null,'#718078']];
  statusChart.setOption({
    animationDuration:chartAnimationDuration(450),grid:{left:42,right:8,top:12,bottom:62},
    xAxis:{type:'value',max:100,axisLabel:{formatter:'{value}%'},splitLine:{lineStyle:{color:'#e4eae2'}}},
    yAxis:{type:'category',data:keys.map(key=>key==='bird'?'观鸟':'狩猎'),axisLine:{show:false},axisTick:{show:false}},
    legend:{bottom:0,itemWidth:12,selectedMode:false,textStyle:{fontSize:10,color:'#596b5e'}},
    tooltip:{...chartTooltipStyle,trigger:'axis',axisPointer:{type:'shadow'},formatter:params=>{
      const key=keys[params[0]?.dataIndex];
      if(!key)return '';
      return `${key==='bird'?'观鸟':'狩猎'} · 主账号 ${number(totals[key])}人<br>${params.map(item=>
        `${item.marker}${item.seriesName}：${Number(item.value).toFixed(1)}% · ${number(Math.round(item.value/100*totals[key]))}人`).join('<br>')}`;
    }},
    series:specs.map(([name,birdKey,huntingKey,color])=>({name,type:'bar',stack:'status',barWidth:25,itemStyle:{color},
      data:keys.map(key=>{const item=s[key];const value=key==='bird'?
        (item[birdKey]??0)+(birdKey==='trialEarly'?item.trialNearExpiry:0):
        (item[huntingKey??birdKey]??0)+(birdKey==='trialEarly'?item.trialEarly:0);
        return totals[key]?value/totals[key]*100:0;})})),
  });
}
function miniCard({id,label,page,value,note='',critical=false,alert=false}) {
  const article=element('article',`mini-card${alert?' alert-card':''}${critical?' critical':''}`);
  let body=article;
  if (alert) { article.append(element('span','alert-icon')); body=element('div',''); article.append(body); }
  const heading=element('div','metric-heading');heading.append(element('div','metric-label',label),definition(id,label));body.append(heading);
  const link=element('a','card-link'); link.href=routeHref(page,id);
  link.append(element('div','metric-value',value));
  if (note) link.append(element('p','',note));
  body.append(link);
  return article;
}
function sectionTitle(kicker,title,note='') {
  const top=element('div','section-top');
  const left=element('div','');
  left.append(element('p','section-kicker',kicker),element('h2','',title));
  top.append(left);
  if (note) top.append(element('p','section-note',note));
  return top;
}
function intro() {
  const s=dataset.snapshot;
  const header=element('div','page-heading');
  const text=element('div','');
  text.append(element('p','eyebrow','BUSINESS FIELD NOTES  /  01'),
              element('h1','','用户与设备经营总览'),
              element('p','heading-sub','从新客接入到付费留存，沿经营主线观察变化；异常进入对应诊断页。'));
  const tags=element('div','heading-meta');
  tags.append(element('span','meta-tag',`快照 ${s.asOf}`),element('span','meta-tag accent',s.season));
  const quality=element('a','meta-tag',`数据质量：${s.quality.status} ↗`);
  quality.href=routeHref('G'); tags.append(quality);
  header.append(text,tags);
  return header;
}
function homeComparisons() {
  const comparisons=[];
  const activationSeries=trendValues(13);
  if(activationSeries?.length===12&&activationSeries.every(Number.isFinite)) {
    const filters=effectiveFor(13).filter(([key])=>key!=='week'&&!(key==='productLine'&&filterState.productLine==='Bird'));
    const shares=sharesFor(filters,13);
    const rows=sourceData.weekly.map(week=>projectValue(weeklyMetric(13,week),shares,filters,13));
    const aggregate=items=>({numerator:items.reduce((sum,row)=>sum+row.numerator,0),denominator:items.reduce((sum,row)=>sum+row.denominator,0)});
    if(rows.every(row=>row.kind==='rate'))comparisons.push({id:13,page:'A',name:'7日价值激活',scope:'观鸟注册批次',
      before:aggregate(rows.slice(0,8)),after:aggregate(rows.slice(8)),split:8,
      beforeLabel:'前8周合并率',afterLabel:'近4周合并率',source:filters.length?'模拟分片估算':'合成周度注册批次',series:activationSeries});
  }
  const current=trialRows({...trialState(),week:undefined},'current');
  const previous=trialRows({...trialState(),week:undefined},'previous');
  if(current.rows&&previous.rows) {
    const now=trialAggregate(current.rows),before=trialAggregate(previous.rows);
    const series=trendValues(18);
    if(now.denominator>=30&&before.denominator>=30&&series)comparisons.push({id:18,page:'D',name:'试用转正',scope:'成熟试用批次',
      before,after:now,split:9,beforeLabel:'前9周合并率',afterLabel:'近3周合并率',source:'合成试用明细汇总',series});
  }
  return comparisons.map(item=>({...item,beforeRate:item.before.numerator/item.before.denominator*100,
    afterRate:item.after.numerator/item.after.denominator*100,
    delta:(item.after.numerator/item.after.denominator-item.before.numerator/item.before.denominator)*100}));
}
function homeComparisonChange(comparison) {
  return Math.abs(comparison.delta)<0.05?'基本持平':`${comparison.delta>0?'+':'−'}${Math.abs(comparison.delta).toFixed(1)} 个百分点`;
}
function renderHome() {
  disposeCharts();
  const s=dataset.snapshot;
  main.replaceChildren(intro(),filterBar());
  const dash=element('div','dashboard');
  dash.append(sectionTitle('01  /  RESULT','经营结果','有效订阅是规模结果；净增按状态流转核对'));
  const snap=element('div','snapshot-grid');
  [
    {id:2,label:'有效订阅用户',value:displayValue(2),page:'D',status:'当前有效付费权益'},
    {id:21,label:'9月截至24日净增',value:metric(21).kind==='na'?'不适用':`${metric(21).value.closing-metric(21).value.opening>=0?'+':''}${number(metric(21).value.closing-metric(21).value.opening)}`,page:'D',status:'9/1期初 → 9/24期末'},
    {id:3,label:'MRR',value:displayValue(3),page:'D',status:'基础订阅 + 增值Pack'},
    {id:4,label:'复合活跃主账号',value:displayValue(4),page:'B',status:'最近30天去重'},
  ].forEach(item=>snap.append(card(item)));
  dash.append(snap);

  const journeyTitle=sectionTitle('02  /  VALUE JOURNEY','六节点经营主线','连接线表示调查顺序；各节点的率按自身批次与分母计算');
  const rail=element('div','journey-rail');
  [
    {id:9,label:'周新增注册',value:formatMetric(9),page:'A',detail:1,status:'周增幅在演示区间',severity:'ok'},
    {id:11,label:'首次绑定成功率',value:formatMetric(11),page:'A',detail:2,status:'绑定尝试口径',severity:'ok'},
    {id:13,label:'7日价值激活率',value:formatMetric(13),page:'A',detail:3,status:'观鸟线 · 低于演示阈值',severity:'warn',star:true},
    {id:18,label:'试用→转正率',value:formatMetric(18),page:'D',detail:4,status:'连续3周低于前期',severity:'warn',star:true},
    {id:23,label:'续订率',value:formatMetric(23),page:'D',detail:5,status:'到期应续用户',severity:'ok',star:true},
    {id:34,label:'付费用户',value:formatMetric(34),page:'E',detail:6,status:'健康阈值待校准',severity:'neutral'},
  ].forEach(item=>rail.append(card({...item,kind:'journey',status:selectedFilters().length?'筛后模拟值':item.status})));

  const story=element('div','story-panel');
  const trend=element('section','trend-panel');
  const panelHeader=element('div','panel-header');
  const comparisons=homeComparisons();
  if(homeTrendFocus&&!comparisons.some(item=>item.id===homeTrendFocus))homeTrendFocus=comparisons[0]?.id??null;
  const heading=element('h3','');
  const period=element('p','panel-sub',`${periodLabel('W1').split(' · ')[1].split('–')[0]}–${periodLabel('W12').split('–')[1]} · 12个观察周${filterState.week?` · 已选W${filterState.week}，保留完整趋势`:''}`);
  const labels=element('div','trend-heading');labels.append(element('p','section-kicker','CHANGE / 变化线索'),heading,period);
  const overview=element('button','trend-overview','并列对照');overview.type='button';overview.setAttribute('aria-controls','trendChart');
  panelHeader.append(labels,overview);
  trend.append(panelHeader);
  const chartBox=element('div',''); chartBox.id='trendChart'; chartBox.setAttribute('role','img');
  trend.append(chartBox);
  const scaleNote=element('p','chart-scale-note');trend.append(scaleNote);
  trend.append(createTrendTable());
  const insight=element('aside','insight-panel');
  insight.append(element('h3','signal-heading','选择一条线索，查看变化'),element('p','panel-sub','各自比较前期；合并分子与分母后重算。'));
  const signals=element('div','home-signals');
  comparisons.forEach(item=>{
    const button=element('button',`home-signal signal-${item.id}`);button.type='button';button.dataset.metricId=item.id;
    button.setAttribute('aria-controls','trendChart home-comparison-context');
    const title=element('span','home-signal-title');title.append(element('strong','',item.name),element('span',`signal-delta ${item.delta<-.05?'adverse':item.delta>.05?'improving':'neutral'}`,homeComparisonChange(item)));
    const values=element('span','home-signal-values');values.append(element('span','',`${item.beforeRate.toFixed(1)}%`),element('span','signal-arrow','→'),element('strong','',`${item.afterRate.toFixed(1)}%`));
    button.append(title,values,element('span','home-signal-period',`${item.beforeLabel} → ${item.afterLabel}`));
    button.addEventListener('click',()=>selectSignal(item.id));signals.append(button);
  });
  insight.append(signals);
  const context=element('div','home-comparison-context');context.id='home-comparison-context';context.setAttribute('aria-live','polite');
  insight.append(context);
  if(!comparisons.length)signals.append(element('p','','当前范围缺少可用于前后期趋势比较的样本；可查看下方数据表中的可用趋势。'));
  function selectSignal(id,redraw=true) {
    homeTrendFocus=id;
    const selected=comparisons.find(item=>item.id===id);
    heading.textContent=selected?`${selected.name} · 周度变化`:'激活与转正 · 周度对照';
    overview.setAttribute('aria-pressed',String(!selected));
    signals.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.metricId)===id)));
    const axis=trendAxisDomain(selected?[selected.series,[selected.beforeRate,selected.afterRate]]:[trendValues(13),trendValues(18)],'%');
    scaleNote.hidden=!axis;scaleNote.textContent=axis?trendAxisNote(axis,'%'):'';
    chartBox.setAttribute('aria-label',`${heading.textContent}，12个观察周；${selected?`${selected.beforeLabel}${selected.beforeRate.toFixed(1)}%，${selected.afterLabel}${selected.afterRate.toFixed(1)}%，变化${homeComparisonChange(selected)}；`:''}${scaleNote.textContent}`);
    context.replaceChildren();
    if(selected) {
      const basis=element('details','home-comparison-basis');basis.append(element('summary','','查看比较依据'));
      basis.append(element('p','',`${selected.beforeLabel}：${number(selected.before.numerator)} / ${number(selected.before.denominator)}；${selected.afterLabel}：${number(selected.after.numerator)} / ${number(selected.after.denominator)}。分母为${selected.scope}中的主账号。来源：${selected.source}。`));
      if(selected.series.some(value=>!Number.isFinite(value)))basis.append(element('p','','样本少于30的周在折线上留空；合并率仍按全周期合格人数计算。'));
      const link=element('a','insight-link',`进入${pages[selected.page].title}，核对分组证据 ↗`);link.href=routeHref(selected.page,selected.id);
      context.append(element('p','signal-explanation',`图中虚线为${selected.beforeLabel}，色带为${selected.afterLabel.replace('合并率','')}。变化是排查线索，不代表原因。`),basis,link);
    } else context.append(element('p','signal-explanation','两条线使用各自批次和分母；不构成连续漏斗。选择线索可查看基准、近期区间与专题证据。'));
    if(redraw)drawTrend(homeTrendFocus,selected);
  }
  overview.addEventListener('click',()=>selectSignal(null));
  selectSignal(homeTrendFocus,false);
  story.append(trend,insight); dash.append(story,journeyTitle,rail);

  const lower=element('div','lower-grid');
  const foundation=element('section',''); foundation.append(sectionTitle('03  /  FOUNDATION','设备与用户结构'));
  const foundationCards=element('div','foundation-grid');
  [
    {id:41,label:'设备活跃率',page:'C',value:formatMetric(41),note:'有效设备行为；心跳不计活跃'},
    {id:42,label:'空触发率',page:'C',value:formatMetric(42),note:'观鸟线 · K6 固件2.8集中偏高'},
    {id:48,label:'多设备用户占比',page:'F',value:formatMetric(48),note:'已绑定主账号'},
    {id:49,label:'设备共享率',page:'F',value:formatMetric(49),note:'当前绑定设备'},
  ].forEach(item=>foundationCards.append(miniCard({...item,note:selectedFilters().length?'按当前筛选模拟分片':item.note})));
  foundation.append(foundationCards);
  lower.append(subscriptionDetails(),foundation);dash.append(lower);
  const alert=element('section','home-alerts'); alert.append(sectionTitle('04  /  ACTION QUEUE','预警与行动入口'));
  const alertCards=element('div','alert-grid');
  [
    {id:15,label:'绑定未激活设备',page:'A',value:displayValue(15),note:'已绑定超过3天，仍无首图',alert:true,critical:true},
    {id:52,label:'流失高危主账号',page:'D',value:displayValue(52),note:'去重风险信号命中',alert:true,critical:true},
    {id:29,label:'季节阈值未使用',page:'B',value:metric(29).kind==='rate'?number(metric(29).numerator):'不适用',note:`连续${metric(29).thresholdDays??21}天`,alert:true},
    {id:22,label:'Free权益用满',page:'D',value:metric(22).kind==='group'?number(metric(22).value.anyExhausted.numerator):'不适用',note:'观鸟线 · 升级机会',alert:true},
  ].forEach(item=>alertCards.append(miniCard({...item,note:selectedFilters().length?'按当前筛选模拟分片':item.note})));
  alert.append(alertCards);dash.append(alert);
  main.append(dash);
  document.querySelectorAll('.node-sparkline').forEach(box=>{
    const id=Number(box.dataset.metricId);
    const history=box.classList.contains('headline-sparkline')?metricHistory(id):null;
    drawSparkline(box,history?.values??trendValues(id),id,history?.labels,history?.unit);
  });
  const statusBox=document.querySelector('#statusChart');if(statusBox)drawStatus(statusBox);
  drawTrend(homeTrendFocus,comparisons.find(item=>item.id===homeTrendFocus));
}
function createTrendTable() {
  const wrap=element('details','trend-table-wrap');
  wrap.append(element('summary','','查看趋势数据表'));
  const table=element('table','');
  table.append(element('caption','','近12个完整周过程指标（各自独立分母）'));
  const head=element('thead',''); const row=element('tr','');
  ['周','观鸟线7日价值激活率','试用→转正率'].forEach(label=>row.append(element('th','',label)));
  head.append(row); table.append(head);
  const body=element('tbody','');
  const activation=trendValues(13),conversion=trendValues(18);
  dataset.weekly.forEach((w,index)=>{
    const r=element('tr','');
    r.append(element('td','',periodLabel(`W${w.week}`)),
             element('td','',Number.isFinite(activation?.[index])?`${activation[index].toFixed(1)}%`:'不适用'),
             element('td','',conversion?.[index]!=null?`${conversion[index].toFixed(1)}%`:'不适用'));
    body.append(r);
  });
  table.append(body); wrap.append(table); return wrap;
}
function isTimelineSpec(spec) {
  return spec.labels.every(label=>/^W\d+$/.test(label)||/^\d+月$/.test(label)||/^\d+\/\d+$/.test(label));
}
function trendAxisDomain(series,unit) {
  const values=series.flatMap(line=>Array.isArray(line)?line:line?.values??[]).filter(Number.isFinite);
  if(!values.length)return null;
  const low=Math.min(...values),high=Math.max(...values);
  const minimumSpan=(unit==='%'||unit==='美元/人') ? .5 : Math.max(1,Math.max(Math.abs(low),Math.abs(high))*.02);
  const span=Math.max((high-low)*1.5,minimumSpan);
  let lower=(low+high-span)/2,upper=lower+span;
  if(low>=0)lower=Math.max(0,lower);
  if(unit==='%')upper=Math.min(100,upper);
  const roughStep=(upper-lower)/4;
  const magnitude=10**Math.floor(Math.log10(roughStep));
  const relative=roughStep/magnitude;
  const nice=relative<=1?1:relative<=2?2:relative<=2.5?2.5:relative<=5?5:10;
  const step=unit==='%'||unit==='美元/人'?nice*magnitude:Math.max(1,nice*magnitude);
  const rounded=value=>Number(value.toPrecision(12));
  const min=rounded(Math.floor(lower/step)*step);
  const max=rounded(unit==='%'?Math.min(100,Math.ceil(upper/step)*step):Math.ceil(upper/step)*step);
  return {min,max,step};
}
function trendAxisNote(axis,unit) {
  const format=value=>unit==='%'?`${value.toFixed(axis.step<.1?2:1)}%`:
    unit==='美元/人'?`$${value.toFixed(2)}/人`:
      unit==='美元'?`$${number(value)}`:`${number(value)}${unit}`;
  return `纵轴 ${format(axis.min)}–${format(axis.max)}${axis.min>0?'，为观察趋势采用非零起点':''}；精确值见数据表。`;
}
function chartScaleNote(spec) {
  const axis=!spec.kind&&isTimelineSpec(spec)?trendAxisDomain(spec.series,spec.unit):null;
  return axis?trendAxisNote(axis,spec.unit):'';
}
function chartNote(spec) {
  return [spec.note,chartScaleNote(spec)].filter(Boolean).join(' ');
}
function drawTrend(focusId=homeTrendFocus,comparison) {
  const node=document.querySelector('#trendChart');
  const activation=trendValues(13),conversion=trendValues(18);
  if(!activation&&!conversion) {node.className='chart-fallback';node.removeAttribute('role');node.textContent='当前筛选与这两条周趋势均不适用；下方数据表说明可用性。';return;}
  if (!window.echarts) {
    node.className='chart-fallback';
    node.removeAttribute('role');
    node.textContent='趋势图暂未加载。下方“查看趋势数据表”保留完整数据。';
    return;
  }
  if (chart) chart.dispose();
  chart=window.echarts.init(node,null,{renderer:'svg'});
  const weeks=dataset.weekly;
  const selected=comparison??homeComparisons().find(item=>item.id===focusId);
  const lines=[{id:13,name:'7日价值激活率（观鸟）',values:activation,color:'#b87021',details:weeklyRateDetails(13)},
    {id:18,name:'试用→转正率',values:conversion,color:'#356d51',details:weeklyRateDetails(18)}].filter(item=>item.values&&(!selected||item.id===selected.id));
  const axis=trendAxisDomain([...lines.map(item=>item.values),...(selected?[[selected.beforeRate,selected.afterRate]]:[])],'%');
  chart.setOption({
    color:lines.map(item=>item.color),
    animationDuration:chartAnimationDuration(450),
    textStyle:{fontFamily:'DM Sans, PingFang SC, Microsoft YaHei, sans-serif'},
    tooltip:{...chartTooltipStyle,trigger:'axis',formatter:params=>{
      const index=params[0]?.dataIndex;if(index===undefined)return '';
      return `${periodLabel(`W${weeks[index].week}`)}<br>${params.map(item=>{
        const line=lines.find(line=>line.name===item.seriesName),basis=Number.isFinite(item.value)?chartBasis(line?.details[index]):'';
        return `${item.marker}${item.seriesName}：${chartValue(item.value,'%')}${basis?`<br><small>${basis}</small>`:''}`;
      }).join('<br>')}`;
    }},
    legend:{bottom:0,itemWidth:17,itemHeight:3,textStyle:{color:'#536758',fontSize:11}},
    grid:{left:48,right:52,top:28,bottom:48},
    xAxis:{type:'category',boundaryGap:false,data:weeks.map(w=>`W${w.week}`),axisLine:{lineStyle:{color:'#bed0bf'}},axisTick:{show:false},axisLabel:{color:'#58695b'}},
    yAxis:{type:'value',min:axis.min,max:axis.max,interval:axis.step,axisLabel:{formatter:value=>`${Number(value).toFixed(axis.step<.1?2:1)}%`,color:'#58695b'},splitLine:{lineStyle:{color:'#e7ede6'}},axisLine:{show:false}},
    series:lines.map(item=>({name:item.name,type:'line',smooth:false,symbolSize:5,lineStyle:{width:2.5},
      data:item.values.map(value=>Number.isFinite(value)?Number(value.toFixed(1)):null),
      endLabel:{show:true,formatter:params=>`${Number(params.value).toFixed(1)}%`,color:chartLabelColor(item.color),fontSize:11,fontWeight:600},
      ...(selected?{
        markLine:{silent:true,symbol:'none',lineStyle:{color:'#718777',type:'dashed',width:1.2},
          label:{formatter:`${selected.beforeLabel} ${selected.beforeRate.toFixed(1)}%`,position:'insideStartTop',color:'#4d6655',fontSize:10},
          data:[{yAxis:selected.beforeRate}]},
        markArea:{silent:true,itemStyle:{color:selected.id===13?'rgba(184,112,33,.07)':'rgba(53,109,81,.07)'},
          label:{show:true,position:'insideTopRight',color:'#58695b',fontSize:10},
          data:[[{name:selected.afterLabel.replace('合并率',''),xAxis:`W${weeks[selected.split].week}`},{xAxis:`W${weeks.at(-1).week}`}]]},
      }:{}),
    })),
  });
}
const groupLabels={
  bird:'观鸟',hunting:'狩猎',free:'Free',noEntitlement:'无权益',trialEarly:'试用前期',trialNearExpiry:'试用临期',paidCurrent:'付费中',cancelledButEntitled:'已取消未到期',paymentFailed:'支付失败',expired:'已过期',
  registered:'累计注册',boundOwners:'绑定主账号',activatedCumulative:'累计激活设备',boundCurrent:'当前绑定设备',p50Minutes:'P50分钟',p90Minutes:'P90分钟',opening:'期初',trialPaid:'试用转正',directPaid:'直接首付',recovered:'恢复',lost:'退出',closing:'期末',DAU:'DAU',WAU:'WAU',MAU:'MAU',appMAU:'App MAU',sessionsPerUser:'人均次数',durationP50Minutes:'时长P50分钟',durationP90Minutes:'时长P90分钟',D1:'D1',D7:'D7',D30:'D30',D30Cohort:'30日观察批次',composite:'复合',app:'App主动',content:'内容',pushClicked:'推送点击',exclusiveCells:'互斥交叉单元',appOnly:'仅App',contentOnly:'仅内容',pushOnly:'仅推送',appContentOnly:'App+内容',appPushOnly:'App+推送',contentPushOnly:'内容+推送',allThree:'三者皆有',overlapAllowed:'来源可重叠',delivery:'送达',click:'点击',monthlySubscriptionPayers:'月内订阅付款主账号',monthlyPayers:'月内付款主账号',subscriptionNetIncome:'订阅净收入',ARPPU:'ARPPU',firstPurchase:'首购',repeatOrRenewal:'复购/续购',countryShare:'国家构成',appPlatformShare:'App平台构成',deviceModelShare:'设备型号构成',US:'美国',UK:'英国',DE:'德国',Other:'其他',K6:'K6',owners:'主账号',activeRate:'活跃率',subscriptionRate:'订阅率',activation7dRate:'7日激活率',Amazon:'Amazon',Shopify:'Shopify',declarationOnly:'仅用户自报',networkSuccess:'联网成功',reportedWithin24h:'24小时有上报',upload:'上传',live:'直播',push:'推送',combined:'触点合计',subscriptionPage:'订阅页',popup:'运营弹窗',anyExhausted:'任一权益用满',aiExhausted:'AI识别用满',storageExhausted:'存储用满',transferExhausted:'传输用满',upgrade:'套餐升级',downgrade:'套餐降级',recovery:'恢复订阅',durationP50Months:'订阅时长P50月',durationP90Months:'订阅时长P90月',anyPack:'任一Pack',byPack:'按Pack',boundActivated:'绑定且已激活',boundNotActivated:'绑定未激活',activatedUnbound:'已激活未绑定',sharedBoundActivated:'已激活且共享',sharedBoundNotActivated:'未激活且共享',cohort:'批次',unboundEvents:'解绑事件',observedUnboundDevices:'可观察解绑设备',unboundDeviceRate:'解绑设备率',reboundWithin7d:'7日回绑',reboundWithin30d:'30日回绑',eventLoss:'事件丢失',idMapping:'ID映射',status:'状态'};
const groupSummary={
  5:v=>`${Object.keys(v).map(key=>key==='bird'?'观鸟':'狩猎').join(' / ')}状态`,
  7:v=>`${number(v.registered)} / ${number(v.boundOwners)}`,
  8:v=>`${number(v.activatedCumulative)} / ${number(v.boundCurrent)}`,
  12:v=>`7日 ${percent(v.D7.value)}`,
  14:v=>`P50 ${number(v.p50Minutes)}分钟`,
  20:v=>`页${percent(v.subscriptionPage.value)} / 弹窗${percent(v.popup.value)}`,
  21:v=>`净增 ${v.closing-v.opening>=0?'+':''}${number(v.closing-v.opening)}`,
  22:v=>`任一用满 ${percent(v.anyExhausted.value)}`,
  25:v=>`DAU ${number(v.DAU)}`,
  26:v=>`${number(v.sessionsPerUser)}次 / 人`,
  28:v=>`D7 ${percent(v.D7.value)}`,
  30:v=>`App ${number(v.app)} / 复合 ${number(v.composite)}`,
  31:v=>`送达 ${percent(v.delivery.value)}`,
  32:v=>`升级 ${percent(v.upgrade.value)}`,
  33:v=>`恢复 ${percent(v.recovery.value)}`,
  35:v=>`$${Number(v.ARPPU).toFixed(2)}`,
  36:v=>`任一Pack ${percent(v.anyPack.value)}`,
  37:v=>`${number(v.firstPurchase)} / ${number(v.repeatOrRenewal)}`,
  38:v=>`美国 ${percent(v.countryShare.US)}`,
  39:v=>{const [name,item]=Object.entries(v).sort((a,b)=>b[1].subscriptionRate-a[1].subscriptionRate)[0];return `${name} · ${percent(item.subscriptionRate)}`;},
  40:v=>{const names=Object.keys(v);return names.length===1?`${names[0]} ${number(v[names[0]].owners)}人`:`${names.length}个自报渠道样本`;},
  43:v=>`D7 ${percent(v.D7.value)}`,
  45:v=>`联网 ${percent(v.networkSuccess.value)}`,
  46:v=>{const [name,part]=Object.entries(v)[0];return `${groupLabels[name]??name} ${percent(part.value)}`;},
  50:v=>`绑定未激活 ${number(v.boundNotActivated)}台`,
  51:v=>`30日回绑 ${percent(v.reboundWithin30d.value)}`,
  54:v=>`${percent(v.eventLoss.value)} / ${percent(v.idMapping.value)}`,
};
function displayValue(id) {
  const value=metric(id);
  if(value.kind==='na') return value.availability==='pending'?'待补数据':'不适用';
  if(value.kind==='group'&&JSON.stringify(value).includes('"kind":"na"')) return '不适用';
  return value.kind==='group' ? (groupSummary[id]?.(value.value) ?? '查看分组值') : formatMetric(id);
}
function groupText(value,key='') {
  if (typeof value==='boolean') return value?'是':'否';
  if (typeof value==='number') {
    if (value>0 && value<1) return percent(value);
    if (key==='ARPPU') return `$${Number(value).toFixed(2)}`;
    if (key==='subscriptionNetIncome') return `$${number(value)}`;
    return number(value);
  }
  if (typeof value==='string') return value;
  if (value?.kind==='na') return `不适用（${value.reason}）`;
  if (value?.kind==='rate') return `${percent(value.value)}（${number(value.numerator)} / ${number(value.denominator)}）`;
  if (value && typeof value==='object') return Object.entries(value).map(([field,item])=>`${groupLabels[field]??field}：${groupText(item,field)}`).join('；');
  return '—';
}
function dataTable(spec, extraClass='') {
  const wrap=element('div',`data-table-scroll ${extraClass}`);
  const table=element('table','diagnostic-table');
  table.append(element('caption','',spec.title));
  const thead=element('thead',''); const heading=element('tr','');
  spec.columns.forEach(label=>heading.append(element('th','',label)));
  thead.append(heading); table.append(thead);
  const tbody=element('tbody','');
  spec.rows.forEach(row=>{
    const tr=element('tr','');
    row.forEach((cell,index)=>tr.append(element(index===0?'th':'td','',typeof cell==='number'?number(cell):String(cell))));
    tbody.append(tr);
  });
  table.append(tbody); wrap.append(table);
  if (spec.note) wrap.append(element('p','table-note',spec.note));
  return wrap;
}
function chartValue(value,unit) {
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return '无值';
  const numeric=Number(value);
  if(unit==='%')return `${numeric.toFixed(1)}%`;
  if(unit==='美元/人')return `$${numeric.toFixed(2)}/人`;
  if(unit==='美元')return `$${number(numeric)}`;
  return `${number(numeric)}${unit??''}`;
}
const chartLabelColor=color=>({'#bf762b':'#97541c','#b87021':'#97541c','#7593a0':'#496876','#e5484d':'#b82d37'})[color]??color;
const chartTooltipStyle={confine:true,backgroundColor:'#fffefa',borderColor:'#cddbc7',
  textStyle:{fontFamily:'DM Sans, PingFang SC, Microsoft YaHei, sans-serif',fontSize:12,lineHeight:20,color:'#263d2e'}};
function chartPointDetail(spec,line,index) {
  if(!['%','美元/人'].includes(spec.unit))return null;
  return line.details?.[index]??(spec.series.length===1?spec.details?.[index]:null);
}
function chartBasis(detail) {
  if(!detail||!Number.isFinite(detail.numerator)||!Number.isFinite(detail.denominator)||detail.denominator<=0)return '';
  return `${detail.basisLabel??'分子 / 分母'}：${detail.estimated?'约 ':''}${number(detail.numerator)}${detail.numeratorUnit??''} / ${number(detail.denominator)}${detail.denominatorUnit??''}`;
}
function diagnosticChartFacts(page,spec) {
  const info=sourceData.diagnostics[page];
  let details;
  if(spec.title===info.chart.title) {
    if(page==='A')details=[10,12,13].map(id=>sourceData.weekly.map(week=>{
      const raw=weeklyMetric(id,week),rate=id===12?raw.value.D7:raw;
      return {...rate,numeratorUnit:'人',denominatorUnit:'人'};
    }));
    if(page==='C')details=[null,'k6Firmware28','others'].map(key=>sourceData.weekly.map(week=>{
      const part=key?week.deviceEventsBird[key]:week.deviceEventsBird;
      return {numerator:part.empty,denominator:part.triggers,numeratorUnit:'次',denominatorUnit:'次'};
    }));
    if(page==='D')details=[weeklyRateDetails(18)];
  } else if(page==='E'&&spec.kind==='stacked100'&&spec.title===info.extraCharts?.[1]?.title) {
    const paid=metric(34),subscriptions=metric(2),packs=metric(36);
    if(paid.kind==='count'&&subscriptions.kind==='count'&&packs.kind==='group') {
      const onlyPack=paid.value-subscriptions.value,anyPack=packs.value.anyPack.numerator;
      details=[paid.value-anyPack,onlyPack,anyPack-onlyPack].map(numerator=>[{
        numerator,denominator:paid.value,numeratorUnit:'人',denominatorUnit:'人'}]);
    }
  } else if(page==='D'&&spec.title===info.extraCharts?.[0]?.title)details=[sourceData.weekly.map(week=>({
    numerator:week.trialMaturity.plusMonthlyAndroid.paymentFailed,denominator:week.trialMaturity.plusMonthlyAndroid.paymentAttempts,
    numeratorUnit:'人',denominatorUnit:'人'}))];
  if(!details)return spec;
  return {...spec,series:spec.series.map((line,index)=>({...line,details:details[index]}))};
}
function chartTable(spec) {
  const rows=spec.labels.map((label,index)=>[periodLabel(label),...spec.series.map(line=>{
    const value=line.values[index];
    if(value===null||value===undefined||!Number.isFinite(Number(value)))return '不适用';
    return chartValue(value,spec.unit);
  })]);
  let columns=['周期 / 分组',...spec.series.map(s=>s.name)];
  if (spec.kind==='boxplot') {
    columns=['场景','最小值','Q1','P50','Q3','P90','最大值'];
    rows.splice(0,rows.length,...spec.labels.map((label,index)=>{
      const [minimum,q1,median,q3,maximum]=spec.series[0].values[index];
      return [label,minimum,q1,median,q3,spec.p90,maximum].map((value,i)=>i?`${number(value)}分钟`:value);
    }));
  }
  if (spec.kind==='heatmap') {
    columns=spec.sampleSizes?['型号','主账号','活跃主账号','订阅主账号',...spec.dimensions]:['型号',...spec.dimensions];
    rows.splice(0,rows.length,...spec.labels.map((label,index)=>
      [label,...(spec.sampleSizes?[spec.sampleSizes[index],
        Math.round(spec.sampleSizes[index]*spec.series[0].values[index][0]/100),
        Math.round(spec.sampleSizes[index]*spec.series[0].values[index][1]/100)]:[]),
        ...spec.series[0].values[index].map(value=>`${Number(value).toFixed(1)}%`)]));
  }
  if(spec.kind==='waterfall') {
    columns=['流转环节','人数变化','累计有效订阅'];
    let running=0;
    rows.splice(0,rows.length,...spec.labels.map((label,index)=>{
      const step=spec.series[0].values[index];
      if(index===0||index===spec.labels.length-1)running=step;else running+=step;
      return [label,index===0||index===spec.labels.length-1?number(step):`${step>=0?'+':''}${number(step)}`,number(running)];
    }));
  }
  const details=element('details','chart-data');
  const table=dataTable({title:spec.title,columns,rows});
  if(!spec.kind||spec.kind==='stacked100')spec.labels.forEach((_,index)=>{
    const cells=table.querySelectorAll('tbody tr')[index].querySelectorAll('td');
    spec.series.forEach((line,seriesIndex)=>{
      if(!Number.isFinite(line.values[index]))return;
      const basis=chartBasis(chartPointDetail(spec,line,index));
      if(basis)cells[seriesIndex].append(element('span','chart-cell-basis',basis));
    });
  });
  details.append(element('summary','','查看图表完整数据表'),table);
  return details;
}
function drawEvidenceChart(box,spec) {
  const instance=drawDetailChart(box,spec);
  const panel=box.closest('.detail-chart-panel');
  const details=panel?.querySelector('.chart-data');
  if(!instance||!details)return;
  const feedback=element('p','chart-selection');feedback.setAttribute('aria-live','polite');
  panel.insertBefore(feedback,details);
  instance.on('click',params=>{
    const index=spec.kind==='heatmap'?params.value?.[1]:params.dataIndex;
    if(!Number.isInteger(index))return;
    const row=details.querySelectorAll('tbody tr')[index];
    if(!row)return;
    details.open=true;
    details.querySelectorAll('.chart-selected').forEach(item=>item.classList.remove('chart-selected'));
    row.classList.add('chart-selected');
    feedback.textContent=`图中临时选中：${spec.labels[index]}。已展开对应数据行；全局筛选保持不变。`;
    requestAnimationFrame(()=>row.scrollIntoView({block:'nearest'}));
  });
}
function structureExplorer(views) {
  const section=element('section','structure-explorer');
  section.append(element('h3','','用户与设备构成 · 切换统计对象'));
  const tabs=element('div','structure-tabs');tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','用户与设备构成维度');
  const panel=element('div','structure-panel');panel.id='structure-panel';panel.setAttribute('role','tabpanel');
  const buttons=views.map((view,index)=>{
    const button=element('button','structure-tab',view.label.split(' / ')[0]);
    button.type='button';button.id=`structure-tab-${index}`;
    button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);
    tabs.append(button);return button;
  });
  section.append(tabs,panel);
  let currentChart;
  function select(index) {
    buttons.forEach((button,i)=>{
      button.setAttribute('aria-selected',String(i===index));
      button.tabIndex=i===index?0:-1;
    });
    const view=views[index];panel.setAttribute('aria-labelledby',buttons[index].id);
    if (currentChart) {
      currentChart.dispose();
      const position=detailCharts.indexOf(currentChart);
      if (position>=0) detailCharts.splice(position,1);
    }
    const spec=seriesForStructure(view);
    const box=element('div','detail-chart');box.setAttribute('role','img');
    box.setAttribute('aria-label',`${view.label}；${view.note}；完整数值见下方表格`);
    const rows=view.rows.map(([label,value])=>[label,value,percent(value/view.denominator)]);
    panel.replaceChildren(element('p','table-note',`${view.label} · 分母 ${number(view.denominator)}${view.unit}。${view.note}`),
      box,dataTable({title:view.label,columns:['分组',`数量（${view.unit}）`,'占比'],rows}));
    currentChart=drawDetailChart(box,spec);
  }
  buttons.forEach((button,index)=>{
    button.addEventListener('click',()=>select(index));
    button.addEventListener('keydown',event=>{
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const target=(index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length;
      buttons[target].focus();select(target);
    });
  });
  return {node:section,init:()=>select(0)};
}
function seriesForStructure(view) {
  return {title:view.label,unit:view.unit,labels:view.rows.map(row=>row[0]),
    series:[{name:'数量',values:view.rows.map(row=>row[1])}],note:view.note};
}
function drawDetailChart(box,spec) {
  if (!window.echarts) {
    box.className='detail-chart chart-fallback'; box.removeAttribute('role');
    box.textContent='图表未加载；下方保留完整数据表。'; return undefined;
  }
  const instance=window.echarts.init(box,null,{renderer:'svg'});
  detailCharts.push(instance);
  const isTimeline=isTimelineSpec(spec);
  const colors=['#bf762b','#356d51','#7593a0'];
  if(spec.kind==='waterfall') {
    const v=spec.flow;
    const lower=Math.max(0,Math.floor((Math.min(v.opening,v.closing)-800)/250)*250);
    instance.setOption({animationDuration:chartAnimationDuration(350),
      tooltip:{...chartTooltipStyle,trigger:'axis',axisPointer:{type:'shadow'},formatter:params=>{
        const index=params[0]?.dataIndex;
        return index===undefined?'':`${spec.labels[index]}：${index===0||index===5?number(spec.series[0].values[index]):
          `${spec.series[0].values[index]>=0?'+':''}${number(spec.series[0].values[index])}`} 人`;
      }},
      grid:{left:65,right:22,top:24,bottom:44},
      xAxis:{type:'category',data:spec.labels,axisLabel:{color:'#506455',interval:0},axisTick:{show:false}},
      yAxis:{type:'value',min:lower,axisLabel:{color:'#58695b',formatter:value=>number(value)},splitLine:{lineStyle:{color:'#e7ede6'}}},
      series:[
        {type:'bar',stack:'flow',silent:true,itemStyle:{color:'transparent'},data:[0,v.opening,v.opening+v.trialPaid,v.opening+v.trialPaid+v.directPaid,v.closing,0]},
        {type:'bar',stack:'flow',barMaxWidth:50,itemStyle:{color:'#356d51'},data:[
          {value:v.opening,itemStyle:{color:'#234f37'}},v.trialPaid,v.directPaid,v.recovered,0,{value:v.closing,itemStyle:{color:'#234f37'}}]},
        {type:'bar',stack:'flow',barMaxWidth:50,itemStyle:{color:'#c16952'},data:[0,0,0,0,v.lost,0]},
      ],
    });
    return instance;
  }
  if (spec.kind==='boxplot') {
    instance.setOption({
      animationDuration:chartAnimationDuration(350),
      tooltip:{...chartTooltipStyle,trigger:'item',formatter:params=>{
        const [minimum,q1,median,q3,maximum]=params.data;
        return `${spec.title}<br>最小 ${number(minimum)} · Q1 ${number(q1)} · P50 ${number(median)} · Q3 ${number(q3)} · 最大 ${number(maximum)} 分钟`;
      }},
      grid:{left:58,right:35,top:24,bottom:48},
      xAxis:{type:'category',data:spec.labels,axisLabel:{color:'#506455'},axisTick:{show:false}},
      yAxis:{type:'value',min:0,max:2600,name:'分钟',nameTextStyle:{color:'#506455'},axisLabel:{color:'#58695b'},splitLine:{lineStyle:{color:'#e7ede6'}}},
      series:[{name:'时长分位',type:'boxplot',data:spec.series[0].values,
        itemStyle:{color:'#f1c38a',borderColor:'#a76222',borderWidth:2},
        markLine:{silent:true,symbol:'none',lineStyle:{type:'dashed',width:1.5,color:'#356d51'},
          label:{formatter:params=>params.name,position:'insideEndTop',color:'#315540'},
          data:[{name:'P50 170分钟',yAxis:170},{name:`P90 ${number(spec.p90)}分钟`,yAxis:spec.p90}]}}],
    });
    return instance;
  }
  if (spec.kind==='heatmap') {
    const cells=spec.series[0].values.flatMap((row,y)=>row.map((value,x)=>({
      value:[x,y,value],label:{color:value>=90?'#fffefa':'#000'},
    })));
    instance.setOption({
      animationDuration:chartAnimationDuration(350),
      tooltip:{...chartTooltipStyle,formatter:params=>{
        const index=params.value[1],owners=spec.sampleSizes?.[index];
        return `${spec.labels[index]} · ${spec.dimensions[params.value[0]]}：${Number(params.value[2]).toFixed(1)}%${owners?`<br>主账号 ${number(owners)} · 对应约 ${number(Math.round(owners*params.value[2]/100))} 人`:''}`;
      }},
      grid:{left:86,right:38,top:26,bottom:88},
      xAxis:{type:'category',data:spec.dimensions,axisLabel:{color:'#506455'},axisTick:{show:false}},
      yAxis:{type:'category',data:spec.labels,axisLabel:{color:'#506455'},axisTick:{show:false}},
      visualMap:{min:0,max:100,calculable:false,orient:'horizontal',left:'center',bottom:2,
        text:['100%','0%'],textStyle:{color:'#506455'},inRange:{color:['#eaf2e7','#a9caa9','#356d51']}},
      series:[{type:'heatmap',data:cells,label:{show:true,formatter:params=>`${Number(params.value[2]).toFixed(1)}%`,fontWeight:600},
        itemStyle:{borderColor:'#fffefa',borderWidth:4}}],
    });
    return instance;
  }
  if (spec.kind==='stacked100') {
    instance.setOption({
      animationDuration:chartAnimationDuration(350),color:colors,
      tooltip:{...chartTooltipStyle,trigger:'axis',axisPointer:{type:'shadow'},formatter:params=>{
        const index=params[0]?.dataIndex;if(index===undefined)return '';
        return `${spec.labels[index]}<br>${params.map(item=>{
          const basis=chartBasis(chartPointDetail(spec,spec.series[item.seriesIndex],index));
          return `${item.marker}${item.seriesName}：${chartValue(item.value,'%')}${basis?`<br><small>${basis}</small>`:''}`;
        }).join('<br>')}`;
      }},
      legend:{bottom:0,itemWidth:12,selectedMode:false,textStyle:{fontSize:11,color:'#506455'}},
      grid:{left:115,right:24,top:22,bottom:55},
      xAxis:{type:'value',min:0,max:100,axisLabel:{formatter:'{value}%',color:'#58695b'},splitLine:{lineStyle:{color:'#e7ede6'}}},
      yAxis:{type:'category',data:spec.labels,axisLabel:{color:'#506455'},axisTick:{show:false}},
    series:spec.series.map((line,index)=>({name:line.name,type:'bar',stack:'total',barWidth:38,
        data:line.values,itemStyle:{color:line.color??colors[index%colors.length]}})),
    });
    return instance;
  }
  const plotted=spec.series.flatMap(line=>line.values).filter(value=>Number.isFinite(value));
  const span=plotted.length?Math.max(...plotted)-Math.min(...plotted):0;
  const trendAxis=isTimeline?trendAxisDomain(spec.series,spec.unit):null;
  const nameInEndLabel=spec.series.length>1&&box.clientWidth>=480;
  const endText=(line,value)=>`${nameInEndLabel?`${line.name} `:''}${chartValue(value,spec.unit)}`;
  const endWidth=Math.max(0,...spec.series.map(line=>[...endText(line,line.values.at(-1))].reduce((sum,char)=>sum+(char.charCodeAt(0)>255?11:6.2),0)));
  const leftReserve=spec.unit==='人'||spec.unit==='台'?62:46;
  const rightReserve=isTimeline?Math.max(52,Math.min(Math.ceil(endWidth+14),box.clientWidth*.32)):18;
  const timelineLabelInterval=index=>{
    const spacing=Math.max(38,...spec.labels.map(label=>String(label).length*7+18));
    const slots=Math.min(spec.labels.length,Math.max(2,Math.floor((box.clientWidth-leftReserve-rightReserve)/spacing)+1));
    return Array.from({length:slots},(_,slot)=>Math.round(slot*(spec.labels.length-1)/Math.max(1,slots-1))).includes(index);
  };
  const axisValue=value=>{
    if(spec.unit==='%')return `${Number(value).toFixed(span<5?1:0)}%`;
    if(spec.unit==='美元/人')return `$${Number(value).toFixed(span<1?2:1)}`;
    if(spec.unit==='美元')return value>=1000?`$${(value/1000).toFixed(span<1000?2:1)}k`:`$${number(Math.round(value))}`;
    if(value>=1000)return `${(value/1000).toFixed(span<500?2:span<2000?1:0)}k`;
    return number(Math.round(value));
  };
  instance.setOption({
    animationDuration:chartAnimationDuration(350),
    color:colors,
    textStyle:{fontFamily:'DM Sans, PingFang SC, Microsoft YaHei, sans-serif'},
    tooltip:{...chartTooltipStyle,trigger:'axis',formatter:params=>{
      const index=params[0]?.dataIndex;
      if(index===undefined)return '';
      const lines=[periodLabel(spec.labels[index]),...params.map(item=>{
        const line=spec.series[item.seriesIndex],basis=Number.isFinite(item.value)?chartBasis(chartPointDetail(spec,line,index)):'';
        return `${item.marker}${item.seriesName}：${chartValue(item.value,spec.unit)}${basis?`<br><small>${basis}</small>`:''}`;
      })];
      return lines.join('<br>');
    }},
    legend:spec.series.length>1?{bottom:0,itemWidth:13,textStyle:{fontSize:11,color:'#506455'}}:{show:false},
    grid:{left:leftReserve,right:rightReserve,top:28,bottom:isTimeline?(spec.series.length>1?55:32):76},
    xAxis:{type:'category',data:spec.labels,axisLabel:{color:'#58695b',
      interval:isTimeline?timelineLabelInterval:0,
      showMinLabel:true,showMaxLabel:true,hideOverlap:true,rotate:isTimeline?0:18,fontSize:11},
      axisTick:{show:false},axisLine:{lineStyle:{color:'#bed0bf'}}},
    yAxis:{type:'value',min:trendAxis?.min??0,max:trendAxis?.max??spec.maxY??(spec.unit==='%'?100:undefined),
      ...(trendAxis?{interval:trendAxis.step}:['人','台','条','次'].includes(spec.unit)?{minInterval:1}:{}),
      axisLabel:{color:'#58695b',formatter:axisValue},splitLine:{lineStyle:{color:'#e7ede6'}}},
    series:spec.series.map((line,index)=>({name:line.name,type:isTimeline?'line':'bar',data:line.values,smooth:false,symbolSize:5,
      barMaxWidth:52,lineStyle:{width:2.5},itemStyle:{color:line.color??colors[index%colors.length]},
      endLabel:{show:isTimeline&&Number.isFinite(line.values.at(-1)),formatter:params=>endText(line,params.value),
        color:chartLabelColor(line.color??colors[index%colors.length]),fontSize:11,fontWeight:600,width:rightReserve-12,overflow:'truncate'},
      label:{show:!isTimeline&&spec.series.length===1&&spec.labels.length<=8,position:'top',formatter:params=>chartValue(params.value,spec.unit),
        fontSize:11,fontWeight:600,color:'#365a43'},
      labelLayout:{hideOverlap:true,moveOverlap:'shiftY'},
    })),
  });
  return instance;
}
function flattenMeasure(value,path='',rows=[],field='') {
  if(value?.kind==='na') {rows.push([path||'结果',value.reason,'—','不适用']);return rows;}
  if(value?.kind==='rate') {rows.push([path||'结果',number(value.numerator),number(value.denominator),percent(value.value)]);return rows;}
  if(value?.kind==='count'||value?.kind==='usd') {rows.push([path||'结果',value.kind==='usd'?`$${number(value.value)}`:number(value.value),'—','—']);return rows;}
  if(value&&typeof value==='object') {
    for(const [key,part] of Object.entries(value)) flattenMeasure(part,path?`${path} / ${groupLabels[key]??key}`:(groupLabels[key]??key),rows,key);
    return rows;
  }
  rows.push([path||'结果',groupText(value,field),'—','—']);return rows;
}
function metricEvidence(id,page) {
  const item=catalogItem(id),contract=contractFor(id),value=metric(id);
  const panel=element('section','detail-section metric-evidence');panel.id=`metric-evidence-${id}`;
  panel.append(sectionTitle('04  /  METRIC EVIDENCE',`#${String(id).padStart(2,'0')} ${item.name} · 数据核对`,
    id===18?'合成试用明细 · 逐条聚合':selectedFilters().length?'当前筛选的模拟分片':'当前底表模拟值'));
  const dimensions=id===18?[...trialFactDimensions]:contract.dimensions;
  const intro=element('p','evidence-meta',`统计对象：${contract.entity} · 窗口：${contract.window} · 当前数据可筛选维度：${dimensions.map(key=>filterLabels[key]).join('、')||'无'}。`);
  panel.append(intro);
  if(value.kind==='na') {panel.append(element('p','na-note',value.availability==='pending'?
    `待补数据：${value.reason}。该筛选有业务意义，当前原型不能可靠计算。`:
    `不适用：${value.reason}。${contract.unsupported}`));return {node:panel,specs:[]};}
  const specs=[];
  const history=metricHistory(id);
  const primaryId=page==='G'&&!metricHistory(54)?53:primaryTrendMetric[page];
  if(history&&id!==primaryId&&(id!==18||selectedFilters().length)) {
    const spec={title:`${history.title} · ${history.labels.length}期趋势`,unit:history.unit,labels:history.labels,details:history.details,
      series:[{name:history.title,values:history.values}],note:history.note};
    const box=element('div','detail-chart');box.setAttribute('role','img');
    box.setAttribute('aria-label',`${spec.title}；${chartNote(spec)}`);
    panel.append(box,element('p','chart-scale-note',chartScaleNote(spec)),element('p','table-note',spec.note));specs.push([box,spec]);
    panel.append(dataTable({title:`${history.title} · 趋势数据`,columns:['周期','值'],
      rows:history.labels.map((label,index)=>[label,history.values[index]==null?'不适用':
        history.unit==='%'?`${history.values[index].toFixed(1)}%`:history.unit==='美元/人'?`$${history.values[index].toFixed(2)}`:
          history.unit==='美元'?`$${number(history.values[index])}`:`${number(history.values[index])}${history.unit}`]),
      note:history.note}));
  }
  if(id===3&&!selectedFilters().length) {
    panel.append(dataTable({title:'MRR组成 · 当前演示快照',columns:['收入组成','MRR'],
      rows:[['基础订阅',`$${number(sourceData.snapshot.baseMRR)}`],['增值Pack',`$${number(sourceData.snapshot.packMRR)}`],
        ['合计',`$${number(sourceData.snapshot.totalMRR)}`]],
      note:'基础订阅与增值Pack按快照加总；月内实际付款人数使用另一个统计窗口。'}));
  }
  if(id===42&&!selectedFilters().length)panel.append(dataTable(sourceData.diagnostics.C.tables[0]));
  if(id===18&&value.kind==='rate') {
    const periods=filterState.week?[[`所选W${filterState.week}`,trialRows(filterState)]]:
      [['前9个成熟周 · W1–9',trialRows(filterState,'previous')],['近3个成熟周 · W10–12',trialRows(filterState,'current')]];
    const summaries=periods.map(([label,result])=>[label,result.rows?trialAggregate(result.rows):null]);
    const spec={title:'成熟试用转正率 · 可比批次',unit:'%',labels:summaries.map(([label])=>label),
      series:[{name:'转正率',values:summaries.map(([,item])=>item?.denominator>=30?item.value*100:null)}],
      note:'前9周与近3周分别汇总分子、分母后计算；小于30人的批次不绘制比例。'};
    const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',spec.title);
    panel.append(box,element('p','table-note',spec.note));specs.push([box,spec]);
    panel.append(dataTable({title:'试用明细聚合 · 转正与支付',
      columns:['批次','成熟试用','转正','转正率','支付尝试','支付失败'],
      rows:summaries.map(([label,item])=>[label,item?number(item.denominator):'—',item?number(item.numerator):'—',
        item?.denominator>=30?percent(item.value):'样本不足',item?number(item.attempts):'—',item?number(item.failed):'—']),
      note:'前后两段长短不同；人数为区间合计，比较规模变化需换算为周均。每条试用记录在样例中最多有一次支付尝试。'}));
    if(!filterState.week){
      const target=row=>row.app_platform==='Android'&&row.plan==='Plus';
      const rows=periods.map(([label,result])=>[label,result.rows?trialAggregate(result.rows.filter(target)):null]);
      const panelTable=dataTable({title:'Android Plus月付组 · 变化贡献',
        columns:['批次','成熟试用','转正','转正率','支付尝试','失败人数','失败率'],
        rows:rows.map(([label,item])=>[label,item?number(item.denominator):'—',item?number(item.numerator):'—',
          item?.denominator>=30?percent(item.value):'样本不足',item?number(item.attempts):'—',
          item?number(item.failed):'—',item?.attempts>=30?percent(item.failed/item.attempts):'样本不足']),
        note:'前9周与近3周分别聚合，人数不能直接比较；上方观察使用周均变化。同一筛选条件下重算，同步变化不构成因果证明。'});
      panelTable.id='trial-contribution';panel.append(panelTable);
    }
  } else if(id===29&&value.kind==='rate') {
    const age=sourceData.inactivityCohorts;
    const threshold=value.thresholdDays;
    const returns=threshold===21?age.returnsAfterThreshold['21days']:age.returnsAfterThreshold['30days'];
    const applicable=selectedFilters().filter(([key])=>key!=='season');
    const shares=sharesFor(applicable,id);
    const cohort=allocatedCount(age.historicalReturnCohort[`${threshold}days`],applicable,id,'numerator',shares);
    const returning=Math.min(cohort,allocatedCount(returns,applicable,id,'numerator',shares));
    panel.append(dataTable({title:`${threshold}天未使用与7天回流 · 同一合成规则`,
      columns:['观察项','人数','分母','率'],rows:[
        [`连续${threshold}天未使用`,value.numerator,value.denominator,percent(value.value)],
        ['历史入组后7天回流',returning,cohort,percent(returning/cohort)]],
      note:`迁徙季按21天、淡季按30天识别；回流属于历史入组群体，不与当前沉睡池直接相减。${age.note}`}));
  } else if(id===27&&value.kind==='rate') {
    const options=['Live','Playback','Recognition'];
    panel.append(dataTable({title:'业务功能渗透 · 同一活跃人群',columns:['功能','使用主账号','活跃主账号','使用率'],
      rows:options.map(option=>{
        const part=projectMetric(27,{...filterState,functionType:option});
        return [optionLabels[option],part.kind==='rate'?part.numerator:'不适用',part.kind==='rate'?part.denominator:'—',
          part.kind==='rate'?percent(part.value):'—'];
      }),note:sourceData.functionUsage.note}));
  } else if(id===25&&value.kind==='group') {
    const spec={title:'日 / 周 / 月活跃主账号（不同时间窗）',unit:'人',labels:['DAU','WAU','MAU'],series:[{name:'去重主账号',values:[value.value.DAU,value.value.WAU,value.value.MAU]}],note:'三个时间窗的去重人数不可相加；App MAU另列于下表。'};
    const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',spec.title);
    panel.append(box,element('p','table-note',spec.note));specs.push([box,spec]);
  } else if(id===35&&value.kind==='group') {
    const dimension=selectedFilters().map(([key])=>key).find(key=>key!=='week'&&contract.dimensions.includes(key)&&sourceData.slices[key])
      ??contract.dimensions.find(key=>key!=='week'&&sourceData.slices[key]);
    if(dimension) {
      const options=Object.keys(sourceData.slices[dimension]);
      const parts=options.map(option=>projectMetric(id,{...filterState,[dimension]:option}));
      const labels=options.map(option=>optionLabels[option]??option);
      for(const [title,unit,field] of [['月度订阅付款主账号','人','monthlySubscriptionPayers'],['订阅ARPPU','美元/人','ARPPU']]) {
        const spec={title:`${filterLabels[dimension]} · ${title}`,unit,labels,
          series:[{name:title,values:parts.map(part=>part.kind==='group'?part.value[field]:null)}],
          note:'同一筛选人口；付款人数与人均收入分别呈现，不使用双Y轴。'};
        const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',spec.title);
        panel.append(box,element('p','table-note',spec.note));specs.push([box,spec]);
      }
      panel.append(dataTable({title:`${filterLabels[dimension]} · 付款人数与ARPPU验算`,
        columns:['分组','付款主账号','订阅净收入','ARPPU'],
        rows:parts.map((part,index)=>part.kind==='group'?[labels[index],number(part.value.monthlySubscriptionPayers),`$${number(part.value.subscriptionNetIncome)}`,`$${part.value.ARPPU.toFixed(2)}`]:[labels[index],'不适用','—','—']),
        note:'订阅净收入除以同组付款主账号；金额与人数均为模拟分片。'}));
    }
  } else if(id===39&&value.kind==='group') {
    const entries=Object.entries(value.value);
    const spec={title:'设备型号经营表现 · 当前筛选',kind:'heatmap',unit:'%',labels:entries.map(([name])=>name),sampleSizes:entries.map(([,part])=>part.owners),
      dimensions:['30天活跃率','主账号订阅率'],series:[{name:'比率',values:entries.map(([,part])=>[part.activeRate*100,part.subscriptionRate*100])}],
      note:'统一0–100%色阶；两列分别以各型号主账号为分母。'};
    const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',spec.title);
    panel.append(box,element('p','table-note',spec.note));specs.push([box,spec]);
  } else if(['rate','count','usd'].includes(value.kind)) {
    const dimension=selectedFilters().map(([key])=>key).find(key=>key!=='week'&&contract.dimensions.includes(key)&&sourceData.slices[key])
      ??contract.dimensions.find(key=>key!=='week'&&sourceData.slices[key]);
    if(dimension) {
      const options=Object.keys(sourceData.slices[dimension]);
      const projected=options.map(option=>projectMetric(id,{...filterState,[dimension]:option}));
      const labels=options.map(option=>optionLabels[option]??option);
      const vals=projected.map(part=>part.kind==='na'?null:part.kind==='rate'?part.value*100:part.value);
      const countUnit=/设备|固件/.test(contract.entity)?'台':/事件|异常/.test(contract.entity)?'条':'人';
      const spec={title:`${filterLabels[dimension]} · 模拟分组对比`,unit:value.kind==='rate'?'%':value.kind==='usd'?'美元':countUnit,labels,series:[{name:item.name,values:vals}],note:'按演示分片分配分子和分母；跨维度交叉采用独立分布假设。'};
      const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',spec.title);
      panel.append(box,element('p','table-note',spec.note));specs.push([box,spec]);
      panel.append(dataTable({title:`${filterLabels[dimension]}分组验算`,columns:['分组','分子 / 数量','分母','结果'],rows:projected.map((part,index)=>{
        const cells=flattenMeasure(part)[0]??[];return [labels[index],cells[1]??'—',cells[2]??'—',part.kind==='rate'?percent(part.value):part.kind==='na'?'不适用':part.kind==='usd'?`$${number(part.value)}`:number(part.value)];
      }),note:'不同维度切片为模拟估算，不能作为生产经营结论。'}));
    }
  }
  panel.append(dataTable({title:`${item.name} · 当前筛选完整值`,columns:['子项','分子 / 数量','分母','结果'],rows:flattenMeasure(value.kind==='group'?value.value:value),
    note:`计算口径：${contract.formula.replace(/。+$/,'')}。${id===18?'本表与图表均由合成试用记录计算。':selectedFilters().length?'本表与图表使用相同的筛后分片。':'本表为演示底表值。'}`}));
  return {node:panel,specs};
}
function metricInventory(page) {
  const section=element('section','detail-section metric-inventory');
  const records=dataset.catalog.filter(item=>item.page===page);
  section.append(sectionTitle('06  /  METRIC CATALOG',`本页全部指标 · ${records.length} 项`,'点击指标名称查看证据；口径按钮查看定义、公式和来源'));
  const wrap=element('div','data-table-scroll');
  const table=element('table','diagnostic-table metric-table');
  table.append(element('caption','visually-hidden',`${pages[page].title}全部指标与底表定义`));
  const head=element('thead',''); const row=element('tr','');
  ['编号','指标','当前演示值','业务适用维度 / 演示能力'].forEach(label=>row.append(element('th','',label)));
  head.append(row);table.append(head);
  const body=element('tbody','');
  records.forEach(item=>{
    const tr=element('tr','');
    const title=element('td','metric-heading');const link=element('a','metric-inventory-link',item.name);link.href=routeHref(page,item.id);title.append(link,definition(item.id,item.name));
    tr.append(element('th','',String(item.id).padStart(2,'0')),title,element('td','',displayValue(item.id)),
      element('td','',policyFor(item.id).businessDimensions.map(key=>`${filterLabels[key]}${policyFor(item.id).unavailableDimensions.includes(key)?'（待补明细）':''}`).join('、')||'仅总体'));
    body.append(tr);
  });
  table.append(body);wrap.append(table);section.append(wrap);
  return section;
}
function trialSamplesPanel() {
  const week=filterState.week??String(sourceData.weekly.at(-1).week);
  const result=trialRows(trialState({...filterState,week}));
  if(!result.rows)return null;
  const failed=result.rows.filter(row=>row.payment_status==='failed');
  const panel=element('section','entity-workspace trial-samples');
  panel.append(element('h3','','成熟试用记录 · 支付失败样本'),
    element('p','table-note',`W${week} 当前范围支付失败 ${number(failed.length)} 条；下列最多5条真实参与本页合成试用聚合，只作逐条核对入口。`));
  if(!failed.length) {panel.append(element('p','na-note','该范围无支付失败演示记录；不能据此推断真实业务没有失败。'));return panel;}
  const list=element('div','trial-sample-list');
  failed.slice(0,5).forEach(row=>{
    const button=element('button','trial-sample-item');button.type='button';
    button.append(element('strong','',row.trial_id),element('span','',
      `${optionLabel('country',row.country)} · ${row.app_platform} · ${row.plan} ${row.billing_cycle==='monthly'?'月付':'年付'} · 观察至${row.outcome_observed_through}`),
      element('span','trial-sample-action','关联到下方问题单 ↘'));
    button.addEventListener('click',()=>{
      const form=document.querySelector('.action-record');
      const linked=form?.querySelector('[name="linkedSample"]');
      if(!linked)return;
      linked.value=`${row.trial_id} / ${row.user_id}`;
      const note=form.querySelector('[name="note"]');
      if(note&&!note.value.trim())note.value=`核对${row.trial_id}的支付失败记录与重试结果`;
      form.scrollIntoView({block:'center',behavior:'smooth'});linked.focus({preventScroll:true});
      document.querySelector('#announcement').textContent=`已将${row.trial_id}关联到问题单，保存后生效`;
    });
    list.append(button);
  });
  panel.append(list);
  return panel;
}
function actionRecord(page,evidenceId) {
  const scope=activeFilterDescription()||'默认演示范围';
  const key=`record:${page}:${scope}:${evidenceId}`;
  const current=simulatedActionState[key]??{};
  const hash=[...key].reduce((value,char)=>(value*31+char.charCodeAt(0))>>>0,7).toString(36).toUpperCase();
  const issueId=`DEMO-${page}-${evidenceId}-${hash}`;
  const baseline=current.baseline??displayValue(evidenceId);
  const baselineAt=current.baselineAt??(filterState.week?`成熟批次W${filterState.week} · ${sourceData.weekly.find(w=>String(w.week)===filterState.week)?.weekEnd}`:sourceData.snapshot.asOf);
  const form=element('form','action-record');
  form.append(element('strong','',`问题单 ${issueId}`),element('p','table-note',
    `基线：${catalogItem(evidenceId)?.name??'当前证据'} ${baseline} · ${baselineAt}；范围：${scope}。仅保存在此浏览器。`));
  const fields=element('div','action-record-fields');
  const ownerLabel=element('label','','负责人');const owner=element('input','');owner.name='owner';owner.placeholder='填写负责人';owner.value=current.owner??'';ownerLabel.append(owner);
  const statusLabel=element('label','','处理状态');const status=element('select','');status.name='status';
  [['pending','待处理'],['reviewing','核查中'],['resolved','已处理，待复查'],['verified','复查通过（人工确认）']].forEach(([value,label])=>{const option=element('option','',label);option.value=value;status.append(option);});
  status.value=current.status??'pending';statusLabel.append(status);
  const dueLabel=element('label','','计划复查日');const due=element('input','');due.type='date';due.name='due';due.value=current.due??'';dueLabel.append(due);
  const targetLabel=element('label','','验收条件');const target=element('input','');target.name='target';target.placeholder='填写业务确认的目标';target.value=current.target??'';targetLabel.append(target);
  const noteLabel=element('label','','处理说明');const note=element('input','');note.name='note';note.placeholder='记录核查或处理动作';note.value=current.note??'';noteLabel.append(note);
  const sampleLabel=element('label','','关联演示记录');const linkedSample=element('input','');linkedSample.name='linkedSample';linkedSample.placeholder='从上方记录关联或手动填写';linkedSample.value=current.linkedSample??'';sampleLabel.append(linkedSample);
  const reviewLabel=element('label','','复查实测值');const reviewValue=element('input','');reviewValue.name='reviewValue';reviewValue.placeholder='如 45.2% 或 434/1000';reviewValue.value=current.reviewValue??'';reviewLabel.append(reviewValue);
  const reviewedLabel=element('label','','实际复查日');const reviewedAt=element('input','');reviewedAt.type='date';reviewedAt.name='reviewedAt';reviewedAt.value=current.reviewedAt??'';reviewedLabel.append(reviewedAt);
  const save=element('button','action-toggle','保存本地记录');save.type='submit';
  fields.append(ownerLabel,statusLabel,dueLabel,targetLabel,noteLabel,sampleLabel,reviewLabel,reviewedLabel,save);form.append(fields);
  const receipt=element('p','action-receipt',current.updatedAt?`已保存：${current.updatedAt} · ${status.selectedOptions[0].textContent}`:'尚未记录');form.append(receipt);
  const review=element('a','insight-link','复查关联指标 ↗');review.href=routeHref(page,evidenceId);form.append(review);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(status.value==='verified'&&(!target.value.trim()||!reviewValue.value.trim()||!reviewedAt.value)) {
      receipt.textContent='复查通过需填写验收条件、复查实测值和实际复查日。';
      return;
    }
    const updatedAt=new Date().toLocaleString('zh-CN',{hour12:false});
    simulatedActionState[key]={issueId,owner:owner.value.trim()||'待指派',status:status.value,note:note.value.trim(),
      due:due.value,target:target.value.trim(),linkedSample:linkedSample.value.trim(),reviewValue:reviewValue.value.trim(),reviewedAt:reviewedAt.value,
      updatedAt,page,evidenceId,scope,filters:{...filterState},baseline,baselineAt,reviewMetric:evidenceId};
    try {localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(simulatedActionState));
      receipt.textContent=`已保存：${updatedAt} · ${status.selectedOptions[0].textContent}`;document.querySelector('#announcement').textContent='处理记录已保存在此浏览器';}
    catch {receipt.textContent='浏览器存储不可用，记录未保存';}
  });
  return form;
}
function actionQueue(page) {
  const info=dataset.diagnostics[page];
  const section=element('section','detail-section action-section');
  if(selectedFilters().length) {
    section.append(sectionTitle('05  /  ACTION QUEUE','筛后行动与复查','按当前范围记录问题；无自动触达'));
    const firstAvailable=sourceData.catalog.find(item=>item.page===page&&metric(item.id).kind!=='na')?.id;
    const findingId=filteredFinding(page)?.id??firstAvailable;
    const ids=[...new Set([findingId,...primaryHeroIds[page]])].filter(Boolean).slice(0,4);
    if(firstAvailable&&!ids.some(id=>metric(id).kind!=='na'))ids.unshift(firstAvailable);
    const next={A:'先按成熟注册批次核对分子分母，再查看绑定与首图阻塞设备。',
      B:'分开核对App主动活跃与复合活跃，并检查未使用阈值下的人群。',
      C:'按型号和固件比较失败次数及受影响设备，逐条核对样本。',
      D:'按平台和套餐对照成熟试用、支付尝试与失败人数，再复查转正。',
      E:'分开核对月内付款人数、净收入和ARPPU，确认收入口径。',
      F:'按主账号与设备分别比较结构，避免把相关性写成因果。',
      G:'先核对埋点丢失与ID映射，再研判业务异常事件。'};
    section.append(dataTable({title:'所选范围的核对对象',columns:['指标','筛后信号','建议下一步'],rows:ids.map(id=>[
      catalogItem(id).name,displayValue(id),metric(id).kind==='na'?metric(id).reason:next[page]]),
      note:'当前为演示数据；行动建议依据本页业务问题生成，阈值需业务确认。'}));
    section.append(actionRecord(page,findingId??info.heroIds[0]));
    return section;
  }
  section.append(sectionTitle('05  /  ACTION QUEUE','模拟行动出口','演示样本，处理记录保存在此浏览器；不会触达用户或连接外部系统'));
  const wrap=element('div','data-table-scroll');const table=element('table','diagnostic-table action-table');
  table.append(element('caption','visually-hidden',`${pages[page].title}模拟行动清单`));
  const head=element('thead','');const row=element('tr','');
  ['对象','触发信号','建议核对','责任角色','处理状态','更新时间','本地演示操作'].forEach(label=>row.append(element('th','',label)));
  head.append(row);table.append(head);
  const body=element('tbody','');
  info.actions.forEach(item=>{
    const tr=element('tr','');
    tr.append(element('th','',item.object),element('td','',item.trigger),element('td','',item.suggestion),element('td','',item.owner));
    const key=`${page}:${item.id}`;
    const status=element('td','');const time=element('td','');
    const cell=element('td','');
    const button=element('button','action-toggle');button.type='button';
    const update=()=>{const state=simulatedActionState[key];const complete=Boolean(state?.complete);status.textContent=complete?'演示已研判':item.status;time.textContent=state?.updatedAt??item.updatedAt;button.textContent=complete?'撤销本地标记':'模拟标记已研判';button.setAttribute('aria-pressed',String(complete));};
    update();
    button.addEventListener('click',()=>{const complete=!simulatedActionState[key]?.complete;simulatedActionState[key]={complete,updatedAt:`${new Date().toLocaleString('zh-CN',{hour12:false})}（本地演示）`,owner:item.owner,evidenceMetric:info.heroIds[0]};
      try {localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(simulatedActionState));} catch {document.querySelector('#announcement').textContent='本地存储不可用，处理状态仅在当前页面有效';}
      update();document.querySelector('#announcement').textContent=`${item.id}${complete?'已标记研判':'已撤销标记'}，本地演示状态`;});
    cell.append(button);tr.append(status,time,cell);body.append(tr);
  });
  table.append(body);wrap.append(table);section.append(wrap,actionRecord(page,defaultFindingMetric[page]));
  return section;
}
function filteredFinding(page) {
  const m=id=>metric(id);
  const trend=(id,split)=>{
    const values=trendValues(id);
    if(!values||values.some(value=>value===null||!Number.isFinite(value)))return null;
    const before=values.slice(0,split).reduce((a,b)=>a+b,0)/split;
    const after=values.slice(split).reduce((a,b)=>a+b,0)/(values.length-split);
    return {before,after,delta:after-before};
  };
  const recentChange=id=>{
    const history=metricHistory(id);
    if(!history)return null;
    const index=filterState.week&&history.labels[0]?.startsWith('W')?
      history.labels.indexOf(`W${filterState.week}`):history.values.length-1;
    const now=history.values[index],before=history.values[index-1];
    return index>0&&Number.isFinite(now)&&Number.isFinite(before)?
      {delta:now-before,previous:history.labels[index-1],current:history.labels[index],unit:history.unit}:null;
  };
  const changeText=(change,digits=1)=>!change?'':
    `；${change.current}较${change.previous}${Math.abs(change.delta)<.05?'基本持平':
      `${change.delta>=0?'上升':'下降'} ${Math.abs(change.delta).toFixed(digits)} ${change.unit==='%'?'个百分点':change.unit}`}`;
  if(page==='A'&&m(13).kind==='rate') {
    const t=trend(13,8);
    if(t)return {id:13,text:`所选范围的观鸟7日价值激活率为 ${percent(m(13).value)}；近4周均值较前8周 ${t.delta>=0?'上升':'下降'} ${Math.abs(t.delta).toFixed(1)} 个百分点。按当前合格批次${number(m(13).denominator)}人估算，差额约${number(Math.round(Math.abs(t.delta)/100*m(13).denominator))}人。该比较不证明设备问题是原因。`};
  }
  if(page==='B'&&filterState.functionType&&m(27).kind==='rate')
    return {id:27,text:`查看${optionLabel('functionType',filterState.functionType)}的活跃主账号 ${number(m(27).numerator)}/${number(m(27).denominator)}（${percent(m(27).value)}）。功能人数可能重叠，不与其他功能相加。`};
  if(page==='B'&&filterState.season&&m(29).kind==='rate')
    return {id:29,text:`按${optionLabel('season',filterState.season)}${m(29).thresholdDays}天规则，${number(m(29).numerator)}/${number(m(29).denominator)}名可观察主账号未使用（${percent(m(29).value)}）。这是判定阈值变化，不是切换季节人群。`};
  if(page==='B'&&m(25).kind==='group') {
    const v=m(25).value;
    return {id:25,text:`当前DAU ${number(v.DAU)}、WAU ${number(v.WAU)}、MAU ${number(v.MAU)}${changeText(recentChange(4),0)}；DAU/MAU 为 ${(v.DAU/v.MAU*100).toFixed(1)}%。三个时间窗人数不可相加。`};
  }
  if(page==='B'&&m(29).kind==='rate')
    return {id:29,text:`按当前${m(29).thresholdDays}天阈值，${number(m(29).numerator)}/${number(m(29).denominator)}名可观察主账号未使用（${percent(m(29).value)}）。迁徙季与淡季规则不可当作两个互斥人群相加。`};
  if(page==='C'&&m(42).kind==='rate') {
    const t=trend(42,8);
    if(t)return {id:42,text:`所选范围空触发率 ${percent(m(42).value)}；近4周均值较前8周 ${t.delta>=0?'上升':'下降'} ${Math.abs(t.delta).toFixed(1)} 个百分点。按当前${number(m(42).denominator)}次触发估算，差额约${number(Math.round(Math.abs(t.delta)/100*m(42).denominator))}次。请核对型号与固件分组，尚不能据此认定原因。`};
  }
  if(page==='D'&&filterState.plan==='Free'&&m(22).kind==='group') {
    const part=m(22).value.anyExhausted;
    return {id:22,text:`观鸟Free主账号中，任一权益用满 ${number(part.numerator)} / ${number(part.denominator)}（${percent(part.value)}）。付费试用与续费指标在Free筛选下不适用。`};
  }
  if(page==='D'&&m(18).kind==='na')
    return {id:18,text:`试用转正率当前${m(18).availability==='pending'?'待补数据':'不适用'}：${m(18).reason}。请查看指标口径与可用明细。`};
  if(page==='D'&&m(18).kind==='rate') {
    if(filterState.week) {
      const currentWeek=Number(filterState.week);
      const previousRows=trialRows(trialState({...filterState,week:String(currentWeek-1)}));
      const before=previousRows.rows?trialAggregate(previousRows.rows):null;
      const delta=before?.denominator>=30?(m(18).value-before.value)*100:null;
      const change=delta===null?'；前一周无可比样本':Math.abs(delta)<.05?`，较W${currentWeek-1} 持平`:`，较W${currentWeek-1} ${delta>=0?'+':''}${delta.toFixed(1)} 个百分点`;
      return {id:18,text:`W${currentWeek}成熟试用转正 ${number(m(18).numerator)}/${number(m(18).denominator)}（${percent(m(18).value)}）${change}。`};
    }
    const current=trialRows({...trialState(),week:undefined},'current');
    const previous=trialRows({...trialState(),week:undefined},'previous');
    if(current.rows&&previous.rows) {
      const now=trialAggregate(current.rows),before=trialAggregate(previous.rows);
      if(now.denominator>=30&&before.denominator>=30) {
        const delta=(now.value-before.value)*100;
        const target=row=>row.product_line==='Bird'&&row.app_platform==='Android'&&row.plan==='Plus'&&row.billing_cycle==='monthly';
        const targetNow=trialAggregate(current.rows.filter(target));
        const targetBefore=trialAggregate(previous.rows.filter(target));
        let text=`近3个成熟周的转正率 ${percent(now.value)}，较前9周 ${delta>=0?'+':''}${delta.toFixed(1)} 个百分点；最新W12为 ${number(m(18).numerator)}/${number(m(18).denominator)}。`;
        if(targetNow.denominator>=30&&targetBefore.denominator>=30)
          text+=`Android Plus月付组周均转正 ${Math.round(targetBefore.numerator/9)}→${Math.round(targetNow.numerator/3)} 人，周均支付失败 ${Math.round(targetBefore.failed/9)}→${Math.round(targetNow.failed/3)} 人；两项变化同步，尚不能据此确认因果。`;
        return {id:18,text};
      }
    }
    return {id:18,text:`当前试用转正 ${number(m(18).numerator)}/${number(m(18).denominator)}（${percent(m(18).value)}）；可比批次样本不足，暂不生成变化判断。`};
  }
  if(page==='E'&&m(35).kind==='group') {
    const v=m(35).value;
    return {id:35,text:`所选范围的月度订阅付款主账号 ${number(v.monthlySubscriptionPayers)} 人，订阅净收入 $${number(v.subscriptionNetIncome)}，ARPPU $${v.ARPPU.toFixed(2)}${changeText(recentChange(35),2)}。付款人数与ARPPU的月度趋势分别见下方图表。`};
  }
  if(page==='E'&&m(39).kind==='group') {
    const [name,part]=Object.entries(m(39).value)[0];
    return {id:39,text:`${filterState.country?`${optionLabel('country',filterState.country)} · `:''}${name}主型号样本 ${number(part.owners)} 位主账号，订阅率 ${percent(part.subscriptionRate)}（约 ${number(Math.round(part.owners*part.subscriptionRate))} 人）。仅覆盖可归属主型号的样本；不是全部82,400位主账号。`};
  }
  if(page==='E'&&m(40).kind==='group') {
    const [channel,v]=Object.entries(m(40).value)[0];
    return {id:40,text:`自报${channel}渠道演示样本 ${number(v.owners)} 位主账号，订阅率 ${percent(v.subscriptionRate)}。渠道为用户自报，不能直接解释购买归因。`};
  }
  if(page==='F'&&m(48).kind==='rate'&&m(49).kind==='rate')
    return {id:48,text:`多设备主账号占比 ${percent(m(48).value)}${changeText(recentChange(48))}；设备共享率 ${percent(m(49).value)}。前者以主账号为分母，后者以当前绑定设备为分母。`};
  if(page==='G'&&m(53).kind==='count')return {id:53,text:`当前筛选下有 ${number(m(53).value)} 条模拟异常事件${changeText(recentChange(53),0)}；先核对事件归属和数据质量，再判断业务异常。`};
  const fallback=dataset.diagnostics[page].heroIds.find(id=>m(id).kind!=='na')??
    sourceData.catalog.find(item=>item.page===page&&m(item.id).kind!=='na')?.id;
  return fallback?{id:fallback,text:`${catalogItem(fallback).name}为 ${displayValue(fallback)}。当前筛选下缺少可核验的趋势比较；请查看本项分子、分母和来源。`}:null;
}
function metricInspector(id,page) {
  const item=catalogItem(id),contract=contractFor(id),value=metric(id);
  const panel=element('div','metric-inspector-content');
  panel.append(element('p','inspector-kicker',`指标摘要 / #${String(id).padStart(2,'0')}`),
    element('h3','',item.name),element('strong','inspector-value',displayValue(id)));
  const rows=element('dl','inspector-facts');
  const fact=(label,text)=>{
    const row=element('div','');row.append(element('dt','',label),element('dd','',text));rows.append(row);
  };
  fact('统计对象',contract.entity);
  fact('时间窗口',contract.window);
  if(value.kind==='rate')fact('本期分子 / 分母',`${number(value.numerator)} / ${number(value.denominator)}`);
  else if(value.kind==='na')fact('当前状态',value.reason);
  else if(id===21&&value.kind==='group') {
    fact('期初 / 期末',`${number(value.value.opening)} / ${number(value.value.closing)}`);
    fact('本期净增',`${value.value.closing-value.value.opening>=0?'+':''}${number(value.value.closing-value.value.opening)} 人`);
  }
  const history=metricHistory(id);
  if(history) {
    const index=filterState.week&&history.labels[0]?.startsWith('W')?
      history.labels.indexOf(`W${filterState.week}`):history.values.length-1;
    const current=history.values[index],previous=history.values[index-1];
    if(index>0&&Number.isFinite(current)&&Number.isFinite(previous)) {
      const delta=current-previous;
      const amount=history.unit==='%'?`${Math.abs(delta).toFixed(1)} 个百分点`:
        history.unit==='美元/人'?`$${Math.abs(delta).toFixed(2)}`:
          `${number(Math.abs(Math.round(delta)))} ${history.unit}`;
      fact('较上一期',`${Math.abs(delta)<.05?'基本持平':`${delta>0?'上升':'下降'} ${amount}`} · ${history.labels[index-1]} → ${history.labels[index]}`);
    }
  }
  panel.append(rows);
  panel.append(element('p','inspector-source',value.kind==='na'?'当前条件没有可用结果。':
    id===18?'合成试用明细按当前条件交集重算；完整批次见下方证据。':
      selectedFilters().length?'当前筛选结果含模拟分片估算；请结合下方数据核对。':'结果来自演示底表；趋势中的构造数据在图注中说明。'));
  const link=element('a','inspector-link','查看图表与完整数据 ↓');
  link.href=routeHref(page,id);panel.append(link);
  return panel;
}
function entitySamplesPanel(page) {
  if(!['C','G'].includes(page))return null;
  const panel=element('section','entity-workspace');
  const heading=element('div','entity-workspace-head');
  heading.append(element('h3','',page==='C'?'设备样本 · 逐条核对':'异常事件 · 逐条核对'),
    element('p','table-note','演示样本不参与总体指标计算；选择一条查看核对线索。'));
  panel.append(heading);
  const selected=selectedFor(page);
  const all=sourceData.entitySamples[page];
  const records=page==='G'&&selected.length?[]:all.filter(record=>
    selected.every(([key,value])=>record.dimensions?.[key]===value));
  if(!records.length) {
    panel.append(element('p','na-note',page==='G'?
      '异常事件演示样本没有逐条筛选维度；当前条件下不展示样本，以上指标仍按各自可用维度计算。':
      '当前条件没有匹配的演示设备样本；这不代表总体设备数为 0，请查看上方分组证据。'));
    return panel;
  }
  const grid=element('div','entity-workspace-grid');
  const list=element('div','entity-sample-list');list.setAttribute('role','group');
  list.setAttribute('aria-label',page==='C'?'演示设备列表':'演示异常事件列表');
  const detail=element('aside','entity-sample-detail');detail.id=`${page}-sample-detail`;
  detail.setAttribute('aria-label',page==='C'?'选中设备样本':'选中异常事件');
  const buttons=[];
  function select(record,index) {
    buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    detail.replaceChildren(element('p','inspector-kicker',`${page==='C'?'设备':'事件'}样本 / ${record.id}`),
      element('h4','',record.signal),element('p','entity-sample-disclosure','模拟记录 · 不代表分组总体'));
    const facts=element('dl','inspector-facts');
    const fact=(label,value)=>{const row=element('div','');row.append(element('dt','',label),element('dd','',value));facts.append(row);};
    fact('观测时间',record.observedAt);fact('研判状态',record.status);
    if(page==='C') {
      for(const key of ['deviceModel','firmware','country','appPlatform','functionType'])
        fact(filterLabels[key],optionLabels[record.dimensions[key]]??record.dimensions[key]);
    } else {fact('所属领域',record.domain);fact('关联范围',record.scope);}
    detail.append(facts,element('p','entity-sample-context',record.detail??'该条是演示异常信号，不能替代原始事件或总体数据。'),
      element('p','entity-sample-review',`建议核对：${record.review}`));
    const link=element('a','inspector-link','查看关联指标证据 ↗');
    link.href=routeHref(record.evidence.page,record.evidence.metricId);detail.append(link);
  }
  records.forEach((record,index)=>{
    const button=element('button','entity-sample-item');button.type='button';
    button.setAttribute('aria-controls',detail.id);
    button.append(element('span','entity-sample-id',record.id),element('strong','',record.signal),
      element('span','entity-sample-meta',`${record.observedAt} · ${record.status}`));
    button.addEventListener('click',()=>select(record,index));
    buttons.push(button);list.append(button);
  });
  grid.append(list,detail);panel.append(grid);select(records[0],0);
  return panel;
}
function renderDetail(page,selectedMetric,showSelected=false) {
  disposeCharts();
  const detail=pages[page];
  const info=dataset.diagnostics[page];
  const week=sourceData.weekly.find(item=>String(item.week)===filterState.week);
  const period=week?`所选完整周 W${week.week} · ${week.weekEnd}；快照/月度指标不适用`:
    page==='D'?`试用明细最新成熟周截至 ${sourceData.weekly.at(-1).weekEnd}；其他指标按各自统计窗口`:info.period;
  main.replaceChildren();
  const top=element('div','detail-heading');
  const back=element('a','back-link','← 返回经营总览'); back.href=routeHref();
  top.append(back,element('p','eyebrow',`OPERATIONS / ${page} · 专题诊断`),
             element('h1','',detail.title),element('p','heading-sub',detail.question),element('p','detail-period',period));
  const body=element('div','detail-shell');
  body.append(filterBar(page));
  const overview=element('section','detail-section');
  overview.append(sectionTitle('01  /  SIGNALS','关键指标'));
  const overviewGrid=element('div','signals-layout');
  const overviewMain=element('div','signals-main');
  const hero=element('div','detail-kpis');
  const inspector=element('aside','metric-inspector');
  inspector.hidden=!showSelected;
  inspector.setAttribute('aria-label','选中指标摘要');
  inspector.tabIndex=-1;
  const selectMetric=id=>{
    const close=element('button','inspector-close','收起详情 ×');close.type='button';
    close.addEventListener('click',()=>{inspector.hidden=true;overviewGrid.classList.remove('inspector-open');
      hero.querySelector(`[data-metric-id="${id}"] .detail-select`)?.focus({preventScroll:true});});
    inspector.replaceChildren(close,metricInspector(id,page));
    inspector.hidden=false;overviewGrid.classList.add('inspector-open');
    hero.querySelectorAll('.detail-kpi').forEach(card=>{
      const selected=Number(card.dataset.metricId)===id;
      card.classList.toggle('selected',selected);
      card.querySelector('.detail-select')?.setAttribute('aria-pressed',String(selected));
    });
  };
  const heroIds=primaryHeroIds[page];
  heroIds.forEach(id=>{
    const item=catalogItem(id);
    const card=element('article',`detail-kpi${showSelected&&id===selectedMetric?' selected':''}`);
    card.dataset.metricId=String(id);
    const heading=element('div','metric-heading');heading.append(element('h3','',item.name),definition(id,item.name));
    const select=element('button','detail-select',displayValue(id));select.type='button';
    select.setAttribute('aria-label',`在右侧查看${item.name}摘要`);
    select.setAttribute('aria-pressed',String(showSelected&&id===selectedMetric));
    select.addEventListener('click',()=>{selectMetric(id);inspector.focus({preventScroll:true});});
    const trend=headlineTrend(id);
    const link=element('a','detail-evidence-link','查看对应数据 ↓');link.href=routeHref(page,id);
    card.append(element('span','detail-kpi-id',`#${String(id).padStart(2,'0')}`),heading,metricValueRow(id,select,trend),link);
    if(trend)card.append(trend);
    if(id===21){const flow=netAddComparison();if(flow)card.append(flow);}
    if(metric(id).kind==='na')card.append(element('p','metric-na-reason',metric(id).reason));
    else if(!trend&&id!==21)card.append(element('p','metric-compare-unavailable',
      metric(id).kind==='group'?'当前结构 · 无可比历史':
        selectedFilters().length?'筛后无可比历史':'当前快照 · 无可比历史'));
    hero.append(card);
  });
  const finding=element('aside','detail-finding');
  const appendFinding=text=>{
    const end=text.indexOf('。');
    finding.append(element('h3','finding-title',end>=0?text.slice(0,end):text));
    if(end>=0&&text.slice(end+1))finding.append(element('p','finding-context',text.slice(end+1)));
  };
  let findingMetric=defaultFindingMetric[page];
  if(selectedFilters().length) {
    const observation=filteredFinding(page);
    findingMetric=observation?.id??selectedMetric;
    finding.append(element('span','insight-tag','筛后观察'));
    appendFinding(observation?
      `${observation.text} 所选条件：${activeFilterDescription()}。`:
      '当前筛选下，本页关键指标均无适用的模拟事实；请调整筛选条件。');
  } else {
    const observation=filteredFinding(page);
    findingMetric=observation?.id??findingMetric;
    finding.append(element('span','insight-tag','关键观察'));
    appendFinding(observation?.text??info.finding);
  }
  const findingBasis=element('details','finding-basis');
  findingBasis.append(element('summary','','合成数据 · 查看观察依据'),element('p','finding-meta',
    `演示文案规则 ${findingRuleVersion} · 证据指标 #${String(findingMetric).padStart(2,'0')} · ${findingSource(findingMetric)}。不作因果归因。`));
  finding.append(findingBasis);
  const cross=element('a','insight-link','查看本条指标证据 ↓');
  cross.href=routeHref(page,findingMetric);finding.append(cross);
  const related=element('a','insight-link related-link',`${info.crossLabel} ↗`);
  related.href=routeHref(info.crossLink);finding.append(related);
  if(selectedFilters().some(([key])=>!relevantFilters(info.crossLink).includes(key)))
    finding.append(element('p','finding-meta','跨页时仅保留目标页支持的筛选条件。'));
  overviewMain.append(hero);overviewGrid.append(overviewMain,inspector);
  overview.append(overviewGrid);body.append(overview);
  if(showSelected)selectMetric(selectedMetric);
  const drawSpecs=[];
  const addChart=(container,spec)=>{
    spec=diagnosticChartFacts(page,spec);
    if(spec.kind==='heatmap'&&!spec.sampleSizes&&metric(39).kind==='group')
      spec={...spec,sampleSizes:spec.labels.map(name=>metric(39).value[name]?.owners)};
    const chartPanel=element('div','detail-chart-panel');
    const heading=element('div','chart-heading');heading.append(element('h3','',spec.title),element('span','chart-unit',`单位：${spec.unit}`));chartPanel.append(heading);
    const box=element('div','detail-chart');box.setAttribute('role','img');
    const latest=!spec.kind?spec.series.map(line=>`${line.name}：${chartValue(line.values.at(-1),spec.unit)}`).join('；'):'';
    box.setAttribute('aria-label',`${spec.title}；${latest?`末期或最后一组 ${latest}；`:''}${chartNote(spec)}`);
    chartPanel.append(box);
    const scaleNote=chartScaleNote(spec);
    if(scaleNote)chartPanel.append(element('p','chart-scale-note',scaleNote));
    chartPanel.append(element('p','table-note',spec.note),chartTable(spec));
    if(spec.kind==='heatmap'||spec.labels.length>=10)chartPanel.classList.add('chart-wide');
    container.append(chartPanel);drawSpecs.push([box,spec]);
  };
  const historySpec=history=>({title:`${history.title} · ${history.labels.length}期趋势`,unit:history.unit,
    labels:history.labels,details:history.details,series:[{name:history.title,values:history.values}],
    note:history.note});
  const filteredHistories=hasDataFilters(page)?(page==='E'?[paidPayersHistory(),metricHistory(35)]:
    page==='G'?[metricHistory(54)??metricHistory(53)]:
      page==='D'?[metricHistory(18),trialFailureHistory()]:[metricHistory(primaryTrendMetric[page])]).filter(Boolean):[];
  const analysis=element('section','detail-section');
  analysis.append(sectionTitle('02  /  TRAJECTORY','主趋势与关键观察'));
  const analysisGrid=element('div','analysis-grid');
  const analysisMain=element('div','analysis-main');
  if(hasDataFilters(page)) {
    if(filteredHistories.length)addChart(analysisMain,historySpec(filteredHistories[0]));
    else if(page==='E'&&modelSubscriptionHeatmap())addChart(analysisMain,modelSubscriptionHeatmap());
    else if(page==='B'&&metric(29).kind==='rate')addChart(analysisMain,seasonComparisonSpec());
    else analysisMain.append(element('p','na-note','当前条件下没有可比较的成熟批次或可用统计对象；请调整筛选条件。'));
  } else if(page==='B') {
    const pair=element('div','split-trends');
    info.chart.series.forEach((line,index)=>addChart(pair,{...info.chart,
      title:`${line.name} · 12个滚动快照`,series:[{...line,color:index?'#356d51':'#bf762b'}],
      note:`${info.chart.note} 两条趋势分别使用自身纵轴；绝对规模请核对数值表。`}));
    analysisMain.append(pair);
  } else addChart(analysisMain,info.chart);
  analysisGrid.append(analysisMain,finding);analysis.append(analysisGrid);body.append(analysis);
  const evidenceFor=metricEvidence(selectedMetric,page);
  const evidence=element('section','detail-section');
  let explorer;
  if(!hasDataFilters(page)) {
    evidence.append(sectionTitle('03  /  BREAKDOWN','分组与完整数据'));
    const bridge=page==='D'?subscriptionBridgeSpec():null;
    if(bridge)addChart(evidence,bridge);
    const contribution=page==='D'?trialContributionBreakdown():null;
    if(contribution)evidence.append(dataTable(contribution));
    const technical=page==='C'?technicalBreakdown():null;
    if(technical){addChart(evidence,technical.spec);evidence.append(dataTable(technical.table));}
    const ranking=page==='E'?modelSubscriptionRanking():null;
    if(ranking){addChart(evidence,ranking.spec);evidence.append(dataTable(ranking.table));}
    const extraCharts=info.extraCharts??[];
    if(extraCharts.length) {
      const chartGrid=element('div','evidence-charts-grid');
      extraCharts.forEach(spec=>addChart(chartGrid,spec));evidence.append(chartGrid);
    }
    const samplePanel=entitySamplesPanel(page);if(samplePanel)evidence.append(samplePanel);
    const trialSamples=page==='D'?trialSamplesPanel():null;if(trialSamples)evidence.append(trialSamples);
    if(info.structureViews) {
      explorer=structureExplorer(info.structureViews);
      evidence.append(explorer.node);
    }
    const grids=element('div','evidence-grid');
    info.tables.forEach((spec,index)=>{if(page!=='G'||index!==0)grids.append(dataTable(spec));});
    evidence.append(grids);
  } else {
    evidence.append(sectionTitle('03  /  BREAKDOWN','筛选后的补充证据'));
    const bridge=page==='D'?subscriptionBridgeSpec():null;
    if(bridge)addChart(evidence,bridge);
    const contribution=page==='D'?trialContributionBreakdown():null;
    if(contribution)evidence.append(dataTable(contribution));
    const technical=page==='C'?technicalBreakdown():null;
    if(technical){addChart(evidence,technical.spec);evidence.append(dataTable(technical.table));}
    const ranking=page==='E'?modelSubscriptionRanking():null;
    if(ranking){addChart(evidence,ranking.spec);evidence.append(dataTable(ranking.table));}
    if(filteredHistories.length>1) {
      const chartGrid=element('div','evidence-charts-grid');
      filteredHistories.slice(1).forEach(history=>addChart(chartGrid,historySpec(history)));
      evidence.append(chartGrid);
    }
    const breakdown=filteredBreakdown(page);
    if(breakdown) {
      const chartGrid=element('div','evidence-charts-grid');
      addChart(chartGrid,breakdown.spec);evidence.append(chartGrid,dataTable(breakdown.table));
    }
    const samplePanel=entitySamplesPanel(page);if(samplePanel)evidence.append(samplePanel);
    const trialSamples=page==='D'?trialSamplesPanel():null;if(trialSamples)evidence.append(trialSamples);
    if(!evidence.querySelector('.detail-chart-panel,.entity-workspace'))
      evidence.append(element('p','table-note','当前条件下没有额外的可比趋势；完整指标值与适用性见上方数据核对。'));
  }
  body.append(evidence,evidenceFor.node,actionQueue(page),metricInventory(page));
  const navigation=element('nav','section-navigation');navigation.setAttribute('aria-label','本页章节');
  const labels=['关键指标','趋势与观察','分组证据','数据核对','行动与复查','全部指标'];
  body.querySelectorAll(':scope > .detail-section').forEach((section,index)=>{
    if(!section.id)section.id=`${page}-section-${index}`;
    const button=element('button','section-navigation-item',labels[index]);button.type='button';
    button.dataset.target=section.id;button.setAttribute('aria-controls',section.id);
    if(index===0)button.setAttribute('aria-current','location');
    button.addEventListener('click',()=>{
      const heading=section.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});
      section.scrollIntoView({block:'start',behavior:chartAnimationDuration(1)?'smooth':'instant'});
    });
    navigation.append(button);
  });
  body.insertBefore(navigation,overview);
  main.append(top,body);
  document.querySelectorAll('.headline-sparkline').forEach(box=>{
    const id=Number(box.dataset.metricId),history=metricHistory(id);
    if(history)drawSparkline(box,history.values,id,history.labels,history.unit);
  });
  evidenceFor.specs.forEach(([box,spec])=>drawDetailChart(box,spec));
  drawSpecs.forEach(([box,spec])=>drawEvidenceChart(box,spec));
  if(!selectedFilters().length)explorer?.init();
}
function disposeCharts() {
  if (chart) {chart.dispose();chart=undefined;}
  if (statusChart) {statusChart.dispose();statusChart=undefined;}
  while (sparklines.length) sparklines.pop().dispose();
  while (detailCharts.length) detailCharts.pop().dispose();
}
function renderRoute({preserveScroll=false}={}) {
  document.querySelector('#metric-search')?.close();
  const {page:route,metricId}=readRoute();
  projectDataset();
  closeDefinitionPopover();
  if (route && pages[route]) {
    const requested=dataset.diagnostics[route].heroIds.includes(metricId)||contractFor(metricId)?.page===route?
      metricId:null;
    const observed=selectedFilters().length?filteredFinding(route)?.id:null;
    const selected=requested??(observed&&metric(observed).kind!=='na'?observed:defaultFindingMetric[route]);
    renderDetail(route,selected,Boolean(metricId)); document.title=`${pages[route].title} · Parallens`;
  } else {
    renderHome(); document.title='用户与设备经营总览 · Parallens';
  }
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link=>{
    const code=link.dataset.page;
    link.href=routeHref(code);
    link.classList.toggle('active',code===route);
    if(code===route)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  if(!preserveScroll)main.focus({preventScroll:true});
  if(metricId&&route&&!preserveScroll) requestAnimationFrame(()=>document.querySelector(`#metric-evidence-${metricId}`)?.scrollIntoView({block:'start'}));
  else if(!preserveScroll)scrollTo({top:0,behavior:'instant'});
  document.querySelector('#announcement').textContent=route && pages[route] ? `已打开${pages[route].title}诊断页` : '已返回经营总览';
}
const dataParts=['metric-catalog','metric-values','weekly','snapshot','stories','diagnostics','filter-contract','filter-policy','filter-slices','trial-facts','model-market','metric-trends','entity-samples','function-usage','inactivity-cohorts','technical-facts','subscription-flow'];
function showLoadingState() {
  const panel=element('section','load-panel');panel.setAttribute('aria-labelledby','load-title');
  const heading=element('h1','','正在准备经营数据');heading.id='load-title';
  const status=element('p','load-status',`已准备 0 / ${dataParts.length} 组数据`);status.id='load-status';
  const meter=element('progress','load-meter');meter.id='load-meter';meter.max=dataParts.length;meter.value=0;
  meter.setAttribute('aria-label','数据准备进度');meter.setAttribute('aria-describedby','load-status');
  panel.append(element('p','section-kicker','PARALLENS / OPERATIONS REVIEW'),heading,status,meter,
    element('p','load-hint','首次打开需要准备完整模拟样本，请稍候。'));
  main.replaceChildren(panel);
}
async function fetchDataPart(name) {
  for(let attempt=0;attempt<2;attempt++) {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(`./data/${name}.json`,{cache:'no-cache',signal:controller.signal});
      if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
      return await response.json();
    } catch(error) {
      if(attempt===1)throw error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise(resolve=>setTimeout(resolve,150));
  }
}
function bindAppEvents() {
  if(appEventsBound)return;
  appEventsBound=true;
  const search=document.querySelector('#metric-search');
  const input=document.querySelector('#metric-search-input');
  const trigger=document.querySelector('#open-metric-search');
  const updateSearch=()=>{
    const query=input.value.trim().toLocaleLowerCase();
    const records=sourceData.catalog.filter(item=>pages[item.page]&&
      (!query||`${item.id} #${String(item.id).padStart(2,'0')} ${item.name} ${pages[item.page].title} ${item.businessQuestion}`.toLocaleLowerCase().includes(query)));
    const results=document.querySelector('#metric-search-results');
    results.replaceChildren();
    document.querySelector('#metric-search-count').textContent=`${records.length} 项指标`;
    for(const item of records) {
      const row=element('li','');
      const link=element('a','metric-search-result');link.href=routeHref(item.page,item.id);
      link.append(element('span','metric-search-id',`#${String(item.id).padStart(2,'0')}`),
        element('span','metric-search-name',item.name),element('span','metric-search-page',pages[item.page].title));
      link.addEventListener('click',()=>search.close());row.append(link);results.append(row);
    }
    if(!records.length)results.append(element('li','metric-search-empty','没有匹配的指标。换一个业务关键词试试。'));
  };
  const openSearch=()=>{if(search.open)return;closeDefinitionPopover();input.value='';updateSearch();search.showModal();input.focus();};
  trigger.disabled=false;trigger.addEventListener('click',openSearch);
  document.querySelector('#close-metric-search').addEventListener('click',()=>search.close());
  input.addEventListener('input',updateSearch);
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter') {
      const results=search.querySelectorAll('.metric-search-result');
      if(results.length===1){event.preventDefault();results[0].click();}
    }
  });
  let scrollFrame;
  window.addEventListener('scroll',()=>{
    if(scrollFrame)return;
    scrollFrame=requestAnimationFrame(()=>{
      scrollFrame=null;
      const buttons=[...document.querySelectorAll('.section-navigation-item')];
      const atBottom=innerHeight+scrollY>=document.documentElement.scrollHeight-2;
      let current=atBottom?buttons.at(-1):buttons[0];
      if(!atBottom)for(const button of buttons)if(document.getElementById(button.dataset.target).getBoundingClientRect().top<=100)current=button;
      for(const button of buttons)if(button===current)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
    });
  },{passive:true});
    window.addEventListener('hashchange',()=>renderRoute());
    window.addEventListener('popstate',()=>renderRoute());
    document.addEventListener('keydown',event=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k') {event.preventDefault();openSearch();return;}
      if(event.key==='Escape'&&search.open) {event.preventDefault();search.close();return;}
      if(event.key==='Escape'&&document.querySelector('#metric-definition-popover')?.matches(':popover-open')) {
        event.preventDefault();closeDefinitionPopover();
      }
    });
    document.addEventListener('click',event=>{
      const link=event.target.closest?.('a[href^="#/"]');
      if(!link||link.getAttribute('href')!==location.hash)return;
      const id=Number(new URLSearchParams(location.hash.split('?')[1]??'').get('metric'));
      if(id){event.preventDefault();document.querySelector(`#metric-evidence-${id}`)?.scrollIntoView({block:'start',behavior:'smooth'});}
    });
}
async function start() {
  if(startupInProgress)return;
  startupInProgress=true;
  let ready=0;
  let dataLoaded=false;
  try {
    showLoadingState();
    main.setAttribute('aria-busy','true');
    document.querySelector('#announcement').textContent='正在准备经营数据';
    const parts=[];
    for(let offset=0;offset<dataParts.length;offset+=3) {
      const results=await Promise.allSettled(dataParts.slice(offset,offset+3).map(async name=>{
        const part=await fetchDataPart(name);
        ready++;
        document.querySelector('#load-meter').value=ready;
        document.querySelector('#load-status').textContent=`已准备 ${ready} / ${dataParts.length} 组数据`;
        return part;
      }));
      const failure=results.find(result=>result.status==='rejected');
      if(failure)throw failure.reason;
      parts.push(...results.map(result=>result.value));
    }
    sourceData=Object.fromEntries(dataParts.map((name,index)=>[name==='metric-catalog'?'catalog':name==='metric-values'?'metrics':name==='filter-contract'?'contract':name==='filter-policy'?'filterPolicy':name==='filter-slices'?'slices':name==='trial-facts'?'trialFacts':name==='model-market'?'modelMarket':name==='metric-trends'?'metricTrends':name==='entity-samples'?'entitySamples':name==='function-usage'?'functionUsage':name==='inactivity-cohorts'?'inactivityCohorts':name==='technical-facts'?'technicalFacts':name==='subscription-flow'?'subscriptionFlow':name,parts[index]]));
    dataLoaded=true;
    bindAppEvents();
    renderRoute();
  } catch(error) {
    const panel=element('section','load-panel load-error');panel.setAttribute('role','alert');
    panel.append(element('h1','',dataLoaded?'看板暂时无法显示':'数据未能完整加载'),
      element('p','',dataLoaded?'请重试。若仍无法打开，请联系看板维护者。':'请检查网络连接后重试。页面地址中的筛选条件已保留。'));
    const retry=element('button','load-retry','重新加载');retry.type='button';retry.addEventListener('click',()=>start());
    panel.append(retry);
    main.replaceChildren(panel);
    console.error(error);
  } finally {
    main.setAttribute('aria-busy','false');
    startupInProgress=false;
  }
}
start();
