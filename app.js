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
const findingRuleVersion='demo-2026-09-25-v1';
const main = document.querySelector('#main');
let dataset;
let sourceData;
let filterState={};
let definitionReturnFocus;
let chart;
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
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const filterLabels={
  week:'统计周',country:'国家/市场',appPlatform:'App平台',productLine:'产品线',deviceModel:'设备型号',
  deviceStatus:'设备状态',userType:'用户类型',season:'季节标记',salesChannel:'自报销售渠道',
  subscriptionPlatform:'订阅平台',plan:'套餐',firmware:'固件版本',functionType:'功能类型',anomalyType:'异常类型',
};
const optionLabels={
  US:'美国',UK:'英国',DE:'德国',Other:'其他',Bird:'观鸟',Hunting:'狩猎',Effective:'有效设备',Inactive:'非有效设备',
  Formal:'正式用户',Trial:'试用用户',Migration:'迁徙季',Amazon:'Amazon',Shopify:'Shopify',
  Upload:'上传',Recognition:'识别',Push:'推送',Business:'业务异常',Device:'设备异常',Quality:'数据质量',
};
const globalDimensions=['week','country','appPlatform','productLine','deviceModel','deviceStatus','userType','season'];
const moduleDimensions={A:['salesChannel'],B:['functionType'],C:['firmware','salesChannel','functionType'],D:['subscriptionPlatform','plan'],E:['subscriptionPlatform','plan','salesChannel'],F:[],G:['anomalyType','firmware']};
const paidPlanMetricIds=new Set([2,3,6,17,18,19,21,23,32,33,34,35,52]);
const trialFactDimensions=new Set(['week','country','appPlatform','productLine','plan']);
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
  if(state.plan)rows=rows.filter(row=>row.plan===state.plan);
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
const relevantFilters=page=>[...globalDimensions,...(moduleDimensions[page]??[])];
const selectedFilters=()=>Object.entries(filterState).filter(([,value])=>value&&value!=='All');
const selectedFor=page=>selectedFilters().filter(([key])=>relevantFilters(page).includes(key));
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
  for (const key of Object.keys(filterLabels)) if(params.has(key)) filterState[key]=params.get(key);
  return {page:pages[page]?page:'',metricId:Number(params.get('metric'))||null};
}
function activeFilterDescription() {
  return selectedFilters().map(([key,value])=>`${filterLabels[key]}：${key==='week'?`W${value}`:(optionLabels[value]??value)}`).join(' · ');
}
function filterBar(page='') {
  const bar=element(page?'details':'section','filter-bar');bar.setAttribute('aria-label','数据筛选');
  if(page) {
    bar.open=selectedFilters().length>0;
    bar.append(element('summary','filter-summary',selectedFilters().length?`筛选已生效 · ${activeFilterDescription()} · 点击调整`:`筛选数据范围 · ${relevantFilters(page).length} 个维度（点击展开）`));
  }
  const content=element('div','filter-content');
  const header=element('div','filter-bar-head');
  header.append(element('strong','','筛选数据范围'),element('span','','试用转正按模拟明细交集重算；其他指标仍用模拟分片'));
  const reset=element('button','filter-reset','重置全部');reset.type='button';
  reset.addEventListener('click',()=>changeFilter(page,null,null));header.append(reset);content.append(header);
  const fields=element('div','filter-fields');
  for (const key of relevantFilters(page)) {
    const label=element('label','filter-field');label.append(element('span','',filterLabels[key]));
    const select=element('select','');select.name=key;select.setAttribute('aria-label',filterLabels[key]);
    const all=element('option','',key==='deviceStatus'?'底表默认：有效设备':key==='userType'?'底表默认：正式用户':'全部');all.value='All';select.append(all);
    const options=key==='week'?Object.fromEntries(sourceData.weekly.slice(-4).reverse().map(w=>[String(w.week),`W${w.week} · ${w.weekEnd}`])):
      Object.fromEntries(Object.keys(sourceData.slices[key]??{}).filter(v=>!(key==='deviceStatus'&&v==='Effective')&&!(key==='userType'&&v==='Formal')).map(v=>[v,optionLabels[v]??v]));
    for (const [value,text] of Object.entries(options)) {const option=element('option','',text);option.value=value;select.append(option);}
    select.value=filterState[key]??'All';select.addEventListener('change',()=>changeFilter(page,key,select.value));
    label.append(select);fields.append(label);
  }
  content.append(fields);
  if(selectedFilters().length) content.append(element('p','filter-active',`当前：${activeFilterDescription()}。不支持的指标显示“不适用”；交叉分布为模拟估算。`));
  bar.append(content);
  return bar;
}
function changeFilter(page,key,value) {
  const currentMetric=Number(new URLSearchParams(location.hash.split('?')[1]??'').get('metric'))||null;
  if (!key) filterState={};
  else if (value==='All') delete filterState[key];
  else filterState[key]=value;
  const next=routeHref(page,currentMetric);
  history.pushState(null,'',next);
  renderRoute({preserveScroll:true});
  document.querySelector('#announcement').textContent=`筛选已更新：${activeFilterDescription()||'已重置'}`;
}
const na=reason=>({kind:'na',reason});
const contractFor=id=>sourceData.contract.find(item=>item.id===id);
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
    let slice=sourceData.slices[key]?.[value];
    if(!slice) continue;
    if(key==='plan'&&paidPlanMetricIds.has(metricId)&&value!=='Free') {
      const paid=sourceData.slices.plan;
      slice={denominatorShare:slice.denominatorShare/(paid.Plus.denominatorShare+paid.Pro.denominatorShare),
        numeratorShare:slice.numeratorShare/(paid.Plus.numeratorShare+paid.Pro.numeratorShare)};
    }
    denominator*=slice.denominatorShare;numerator*=slice.numeratorShare;
  }
  return {denominator,numerator};
}
function allocatedCount(total,filters,metricId,kind,shares) {
  if(!Number.isInteger(total))return total*shares[kind];
  const dimensions=filters.some(([key])=>key==='deviceModel')?
    filters.filter(([key])=>key!=='productLine'):filters;
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
function projectMetric(id,state=filterState) {
  const contract=contractFor(id);
  const filters=Object.entries(state).filter(([,value])=>value&&value!=='All');
  for(const [key,value] of filters) {
    if(!contract.dimensions.includes(key)) return na(`${filterLabels[key]}不适用于该指标`);
    if(key!=='week'&&!sourceData.slices[key]?.[value]) return na('未定义的筛选值');
  }
  const product=state.productLine,model=state.deviceModel;
  if(product&&model&&product!=='All'&&model!=='All'&&((product==='Hunting')!==(model==='Hunt Pro')))
    return na('产品线与设备型号组合无样本');
  if(product==='Hunting'&&[13,22,42].includes(id))return na('本指标只定义观鸟线，狩猎线口径待定义');
  if(product&&id===21)return na('底表没有分产品线的期初、进入和退出状态流转明细');
  if(state.plan==='Free'&&paidPlanMetricIds.has(id))
    return na('Free不是付费试用、订阅或续费套餐，不构成该指标的分母');
  if(id===22&&state.plan&&state.plan!=='Free')return na('本项只统计观鸟Free权益');
  if(state.plan&&id===5) return na('底表没有按套餐拆分的互斥订阅状态人数');
  if(id===18)return trialMetric(state);
  let raw=sourceData.metrics[`m${String(id).padStart(2,'0')}`];
  if(state.week) {
    const weekly=sourceData.weekly.find(w=>String(w.week)===state.week);
    if(!weekly) return na('指定周不存在');
    raw=weeklyMetric(id,weekly);
  }
  if(raw.kind==='na') return raw;
  if(filters.length&&[14,26,33,38].includes(id)) return na('本项只有汇总分布或分位数，缺少可重算的维度明细');
  if(filters.length&&id===39) {
    if(filters.some(([key])=>!['productLine','deviceModel'].includes(key))) return na('型号表现只提供产品线和型号级模拟样本');
    const entries=Object.entries(raw.value).filter(([name])=>(!state.productLine||state.productLine==='Hunting'===(name==='Hunt Pro'))&&(!state.deviceModel||state.deviceModel===name));
    return entries.length?{kind:'group',value:Object.fromEntries(entries)}:na('该产品线与型号组合无样本');
  }
  if(filters.length&&id===40) return {kind:'group',value:{[state.salesChannel]:raw.value[state.salesChannel]}};
  if(id===5&&state.productLine) {
    const key=state.productLine==='Bird'?'bird':'hunting';
    const applicable=filters.filter(([dimension])=>dimension!=='week'&&dimension!=='productLine');
    const shares=sharesFor(applicable,id);
    const value=projectGroup({[key]:raw.value[key]},shares,applicable,id);
    return Object.values(value[key]).reduce((a,b)=>a+b,0)>=30?{kind:'group',value}:na('筛选后订阅状态样本不足30');
  }
  const applicable=filters.filter(([key])=>key!=='week'&&!(id===22&&key==='plan')&&
    !(state.productLine==='Bird'&&[13,22,42].includes(id)&&key==='productLine'));
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
  const statuses=dataset.metrics.m05,subscribers=dataset.metrics.m02,flow=dataset.metrics.m21;
  if(statuses.kind==='group'&&subscribers.kind==='count') {
    const total=Object.values(statuses.value).reduce((sum,line)=>sum+line.paidCurrent+line.cancelledButEntitled,0);
    subscribers.value=total;
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
  if (value.kind === 'na') return '不适用';
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
  link.append(element('div','metric-value',value));
  if (status) {
    const statusLine = element('div',kind==='journey'?'node-status':'card-foot');
    const dot = element('span',`status-dot ${severity}`);
    statusLine.append(dot,element('span','',status));
    link.append(statusLine);
  }
  article.append(link);
  if (kind === 'journey') article.append(nodeTrendDetails(id));
  if (kind === 'snapshot') {const trend=headlineTrend(id);if(trend)article.append(trend);}
  return article;
}
function trendValues(id) {
  if(id===18) {
    const values=sourceData.weekly.map(w=>{
      const result=trialRows({...filterState,week:String(w.week)});
      if(!result.rows)return null;
      const summary=trialAggregate(result.rows);
      return summary.denominator>=30?summary.value*100:null;
    });
    return values.some(value=>value!==null)?values:null;
  }
  const history=sourceData.metricTrends?.[`m${String(id).padStart(2,'0')}`];
  if(history) {
    const invalid=selectedFilters().some(([key])=>key!=='week'&&!contractFor(id).dimensions.includes(key));
    if(invalid||filterState.week&&!contractFor(id).dimensions.includes('week'))return null;
    const applicable=selectedFilters().filter(([key])=>key!=='week');
    const shares=sharesFor(applicable,id);
    const values=history.points.map(raw=>{
      const value=projectValue(raw,shares,applicable,id);
      return value.kind==='na'?null:value.kind==='rate'?value.value*100:value.value;
    });
    const current=metric(id);
    if(current.kind!=='na'&&!filterState.week) {
      const latest=id===54?current.value.eventLoss:current;
      if(latest?.kind==='rate')values[values.length-1]=latest.value*100;
      else if(['count','usd'].includes(latest?.kind))values[values.length-1]=latest.value;
    }
    return values.some(value=>value!==null)?values:null;
  }
  if(filterState.productLine==='Hunting'&&[13,42].includes(id))return null;
  if(filterState.week&&!contractFor(id).dimensions.includes('week'))return null;
  const invalid=selectedFilters().some(([key])=>key!=='week'&&!contractFor(id).dimensions.includes(key));
  if(invalid) return null;
  const applicable=selectedFilters().filter(([key])=>key!=='week'&&
    !(filterState.productLine==='Bird'&&[13,42].includes(id)&&key==='productLine'));
  const shares=sharesFor(applicable,id);
  return sourceData.weekly.map(w=>{
    const raw=id===34?{kind:'count',value:w.paidUsersIncludingPackOnly}:weeklyMetric(id,w);
    const value=projectValue(raw,shares,applicable,id);
    return value.kind==='rate'?value.value*100:value.value;
  });
}
const headlineTrendIds=new Set([2,3,4,9,10,11,13,17,18,23,24,34,35,41,42,48,49,53,54]);
function metricHistory(id) {
  if(!headlineTrendIds.has(id)||metric(id)?.kind==='na')return null;
  if(id===35) {
    const counts=sourceData.diagnostics.E.chart.series[0].values;
    const arppus=sourceData.diagnostics.E.extraCharts[0].series[0].values;
    const filters=selectedFilters();
    if(filters.some(([key])=>!contractFor(id).dimensions.includes(key)))return null;
    const shares=sharesFor(filters,id);
    const values=counts.map((count,index)=>{
      const payers=allocatedCount(count,filters,id,'denominator',shares);
      const revenue=allocatedCount(Math.round(count*arppus[index]),filters,id,'numerator',shares);
      return payers>=30?revenue/payers:null;
    });
    values[values.length-1]=metric(id).value.ARPPU;
    return {labels:['6月','7月','8月'],values,unit:'美元/人',title:'订阅ARPPU',
      note:`按同月订阅净收入÷月内付款主账号重算；月份为完整自然月。${filters.length?'筛后历史为模拟分片估算。':''}`};
  }
  const history=sourceData.metricTrends?.[`m${String(id).padStart(2,'0')}`];
  const labels=history?.labels??sourceData.weekly.map(w=>`W${w.week}`);
  const values=trendValues(id);
  if(!values||!values.some(value=>value!==null&&Number.isFinite(value)))return null;
  const estimated=selectedFilters().length&&id!==18?'当前筛选的历史点按模拟分片估算；底表最新点说明仅适用于未筛选范围。':'';
  return {labels,values,unit:history?.unit??([9,34].includes(id)?'人':'%'),
    title:id===54?'事件丢失率':catalogItem(id).name,
    note:`${history?.note??(id===18?'合成试用明细逐周聚合。':'原有12个完整周模拟汇总。')}${estimated}`};
}
function paidPayersHistory() {
  const id=35,filters=selectedFilters(),value=metric(id);
  if(value.kind!=='group'||filters.some(([key])=>!contractFor(id).dimensions.includes(key)))return null;
  const shares=sharesFor(filters,id);
  const counts=sourceData.diagnostics.E.chart.series[0].values;
  const values=counts.map(count=>allocatedCount(count,filters,id,'denominator',shares));
  values[values.length-1]=value.value.monthlySubscriptionPayers;
  return {labels:['6月','7月','8月'],values,unit:'人',title:'月内订阅付款主账号',
    note:`完整自然月去重付款人数；与期末有效订阅人数不同。${filters.length?'筛后历史按模拟分片估算。':''}`};
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
  wrap.append(element('span','headline-trend-label',`${history.labels[index]} · ${deltaText}`));
  const box=element('div','node-sparkline headline-sparkline');box.dataset.metricId=String(id);
  box.setAttribute('role','img');box.setAttribute('aria-label',`${history.title}趋势，${history.labels[index]}${current==null?'无值':`${Number(current).toFixed(history.unit==='%'||history.unit==='美元/人'?1:0)}${history.unit}`}；${deltaText}。${history.note}`);
  wrap.append(box);
  return wrap;
}
function nodeTrendDetails(id) {
  const series=trendValues(id);
  if(!series) return element('p','node-change','当前维度无可用周趋势');
  const position=filterState.week?Number(filterState.week)-1:series.length-1;
  const current=series[position], previous=series[position-1];
  const isRate=![9,34].includes(id);
  const delta=previous==null||current==null?null:isRate?current-previous:(current/previous-1)*100;
  const change=delta==null?'缺少可比周':Math.abs(delta)<.05?'与上周持平':`${delta>0?'+':''}${delta.toFixed(1)}${isRate?'个百分点':'%'}（较上周）`;
  const details=element('div','node-extra');
  details.append(element('span','node-extra-label',filterState.week?`近12周趋势 · 当前选W${filterState.week}`:'近12周趋势'),element('p','node-change',change));
  const box=element('div','node-sparkline');
  box.dataset.metricId=String(id);
  box.setAttribute('role','img');
  box.setAttribute('aria-label',`最近12周趋势；${filterState.week?`所选W${filterState.week}`:'最新周'}值${current==null?'不适用':id===9||id===34?number(current):percent(current/100)}，${change}`);
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
    tooltip:{trigger:'axis',formatter:params=>`${labels[params[0].dataIndex]}：${params[0].value==null?'无值':unit==='%'||unit==='美元/人'?`${Number(params[0].value).toFixed(1)}${unit}`:`${number(params[0].value)}${unit}`}`},
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
    animationDuration:450,grid:{left:42,right:8,top:12,bottom:62},
    xAxis:{type:'value',max:100,axisLabel:{formatter:'{value}%'},splitLine:{lineStyle:{color:'#e4eae2'}}},
    yAxis:{type:'category',data:keys.map(key=>key==='bird'?'观鸟':'狩猎'),axisLine:{show:false},axisTick:{show:false}},
    legend:{bottom:0,itemWidth:12,textStyle:{fontSize:10,color:'#596b5e'}},
    tooltip:{trigger:'axis',axisPointer:{type:'shadow'},valueFormatter:value=>`${Number(value).toFixed(1)}%`},
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
function renderHome() {
  disposeCharts();
  const s=dataset.snapshot;
  main.replaceChildren(intro(),filterBar());
  const dash=element('div','dashboard');
  dash.append(sectionTitle('01  /  RESULT','经营结果','有效订阅是规模结果；净增按状态流转核对'));
  const snap=element('div','snapshot-grid');
  [
    {id:2,label:'有效订阅用户',value:displayValue(2),page:'D',status:'当前有效付费权益'},
    {id:21,label:'本月净增',value:metric(21).kind==='na'?'不适用':`${metric(21).value.closing-metric(21).value.opening>=0?'+':''}${number(metric(21).value.closing-metric(21).value.opening)}`,page:'D',status:'期末减期初'},
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
  panelHeader.append(element('h3','','过程指标 · 最近12个完整周'),element('p','panel-sub',filterState.week?`已选 W${filterState.week}；折线保留12周背景 · 单位%`:'单位：% / 各指标独立分母'));
  trend.append(panelHeader);
  const chartBox=element('div',''); chartBox.id='trendChart'; chartBox.setAttribute('role','img');
  chartBox.setAttribute('aria-label','观鸟线7日价值激活率在第9周下降，试用转正率在第10周下降');
  trend.append(chartBox);
  trend.append(createTrendTable());
  const insight=element('aside','insight-panel');
  if(selectedFilters().length) {
    const relevant=metric(18);
    const observation=filteredFinding('D');
    insight.append(element('span','insight-tag','筛后观察'),element('h3','',relevant.kind==='rate'?`试用转正率 ${percent(relevant.value)}`:'当前筛选下试用转正率不适用'),
      element('p','',observation?.id===18?observation.text:`${relevant.reason??'当前组合没有可比样本'}。`));
  } else insight.append(element('span','insight-tag','本周需要看'),element('h3','','试用转正率下降 1.6 个百分点'),
                 element('p','',filteredFinding('D')?.text??'成熟试用批次数据暂不可用。'));
  const storyLink=element('a','insight-link','查看订阅诊断与证据 ↗'); storyLink.href=routeHref('D',18); insight.append(storyLink);
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
    {id:29,label:'季节阈值未使用',page:'B',value:metric(29).kind==='rate'?number(metric(29).numerator):'不适用',note:'迁徙季连续21天',alert:true},
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
  drawTrend();
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
    r.append(element('td','',`W${w.week}`),
             element('td','',activation?`${activation[index].toFixed(1)}%`:'不适用'),
             element('td','',conversion?.[index]!=null?`${conversion[index].toFixed(1)}%`:'不适用'));
    body.append(r);
  });
  table.append(body); wrap.append(table); return wrap;
}
function drawTrend() {
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
  chart.setOption({
    color:['#d0832b','#356d51'],
    animationDuration:450,
    textStyle:{fontFamily:'DM Sans, Noto Sans SC, sans-serif'},
    tooltip:{trigger:'axis',valueFormatter:value=>`${Number(value).toFixed(1)}%`},
    legend:{bottom:0,itemWidth:17,itemHeight:3,textStyle:{color:'#536758',fontSize:11}},
    grid:{left:42,right:12,top:20,bottom:48},
    xAxis:{type:'category',boundaryGap:false,data:weeks.map(w=>`W${w.week}`),axisLine:{lineStyle:{color:'#bed0bf'}},axisTick:{show:false},axisLabel:{color:'#6b7f70'}},
    yAxis:{type:'value',scale:true,axisLabel:{formatter:'{value}%',color:'#6b7f70'},splitLine:{lineStyle:{color:'#e7ede6'}},axisLine:{show:false}},
    series:[
      ...(activation?[{name:'7日价值激活率（观鸟）',type:'line',smooth:.2,symbolSize:5,lineStyle:{width:2.5},data:activation.map(v=>Number(v.toFixed(1)))}]:[]),
      ...(conversion?[{name:'试用→转正率',type:'line',smooth:.2,symbolSize:5,lineStyle:{width:2.5},data:conversion.map(v=>v==null?null:Number(v.toFixed(1)))}]:[]),
    ],
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
  30:()=> '3类活跃来源',
  31:v=>`送达 ${percent(v.delivery.value)}`,
  32:v=>`升级 ${percent(v.upgrade.value)}`,
  33:v=>`恢复 ${percent(v.recovery.value)}`,
  35:v=>`$${Number(v.ARPPU).toFixed(2)}`,
  36:v=>`任一Pack ${percent(v.anyPack.value)}`,
  37:v=>`${number(v.firstPurchase)} / ${number(v.repeatOrRenewal)}`,
  38:v=>`${Object.keys(v).length}类构成`,
  39:v=>{if(Object.keys(v).length>1)return `${Object.keys(v).length}个演示型号`;const [name,item]=Object.entries(v)[0];return `${name} · ${percent(item.subscriptionRate)}`;},
  40:v=>{const names=Object.keys(v);return names.length===1?`${names[0]} ${number(v[names[0]].owners)}人`:`${names.length}个自报渠道样本`;},
  43:v=>`D7 ${percent(v.D7.value)}`,
  45:v=>`联网 ${percent(v.networkSuccess.value)}`,
  46:v=>`上传 ${percent(v.upload.value)}`,
  50:()=> '3类状态',
  51:v=>`30日回绑 ${percent(v.reboundWithin30d.value)}`,
  54:v=>`${percent(v.eventLoss.value)} / ${percent(v.idMapping.value)}`,
};
function displayValue(id) {
  const value=metric(id);
  if(value.kind==='na') return '不适用';
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
function chartTable(spec) {
  const rows=spec.labels.map((label,index)=>[label,...spec.series.map(line=>{
    const value=line.values[index];
    if(value===null||value===undefined||!Number.isFinite(Number(value)))return '不适用';
    return spec.unit==='%'?`${Number(value).toFixed(1)}%`:spec.unit==='美元/人'?`$${Number(value).toFixed(2)}`:number(value);
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
    columns=['型号',...spec.dimensions];
    rows.splice(0,rows.length,...spec.labels.map((label,index)=>
      [label,...spec.series[0].values[index].map(value=>`${Number(value).toFixed(1)}%`)]));
  }
  const details=element('details','chart-data');
  details.append(element('summary','','查看图表完整数据表'),dataTable({title:spec.title,columns,rows}));
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
  const isTimeline=spec.labels.every(label=>/^W\d+$/.test(label)||/^\d+月$/.test(label)||/^\d+\/\d+$/.test(label));
  const colors=['#bf762b','#356d51','#7593a0'];
  if (spec.kind==='boxplot') {
    instance.setOption({
      animationDuration:350,
      tooltip:{trigger:'item',formatter:params=>{
        const [minimum,q1,median,q3,maximum]=params.data;
        return `${spec.title}<br>最小 ${number(minimum)} · Q1 ${number(q1)} · P50 ${number(median)} · Q3 ${number(q3)} · 最大 ${number(maximum)} 分钟`;
      }},
      grid:{left:58,right:35,top:24,bottom:48},
      xAxis:{type:'category',data:spec.labels,axisLabel:{color:'#506455'},axisTick:{show:false}},
      yAxis:{type:'value',min:0,max:2600,name:'分钟',nameTextStyle:{color:'#506455'},axisLabel:{color:'#687d6e'},splitLine:{lineStyle:{color:'#e7ede6'}}},
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
      value:[x,y,value],label:{color:value>=55?'#fffefa':'#203b2b'},
    })));
    instance.setOption({
      animationDuration:350,
      tooltip:{formatter:params=>`${spec.labels[params.value[1]]} · ${spec.dimensions[params.value[0]]}：${Number(params.value[2]).toFixed(1)}%`},
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
      animationDuration:350,color:colors,
      tooltip:{trigger:'axis',axisPointer:{type:'shadow'},valueFormatter:value=>`${Number(value).toFixed(1)}%`},
      legend:{bottom:0,itemWidth:12,textStyle:{fontSize:11,color:'#506455'}},
      grid:{left:115,right:24,top:22,bottom:55},
      xAxis:{type:'value',min:0,max:100,axisLabel:{formatter:'{value}%',color:'#687d6e'},splitLine:{lineStyle:{color:'#e7ede6'}}},
      yAxis:{type:'category',data:spec.labels,axisLabel:{color:'#506455'},axisTick:{show:false}},
    series:spec.series.map((line,index)=>({name:line.name,type:'bar',stack:'total',barWidth:38,
        data:line.values,itemStyle:{color:line.color??colors[index%colors.length]}})),
    });
    return instance;
  }
  const plotted=spec.series.flatMap(line=>line.values).filter(value=>Number.isFinite(value));
  const span=plotted.length?Math.max(...plotted)-Math.min(...plotted):0;
  const axisValue=value=>{
    if(spec.unit==='%')return `${Number(value).toFixed(span<5?1:0)}%`;
    if(spec.unit==='美元/人')return `$${Number(value).toFixed(span<1?2:1)}`;
    if(spec.unit==='美元')return value>=1000?`$${(value/1000).toFixed(span<1000?2:1)}k`:`$${number(Math.round(value))}`;
    if(value>=1000)return `${(value/1000).toFixed(span<500?2:span<2000?1:0)}k`;
    return number(Math.round(value));
  };
  instance.setOption({
    animationDuration:350,
    color:colors,
    textStyle:{fontFamily:'DM Sans, Noto Sans SC, sans-serif'},
    tooltip:{trigger:'axis',valueFormatter:value=>spec.unit==='%'?`${Number(value).toFixed(1)}%`:spec.unit==='美元/人'?`$${Number(value).toFixed(2)}`:number(value)},
    legend:spec.series.length>1?{bottom:0,itemWidth:13,textStyle:{fontSize:11,color:'#506455'}}:{show:false},
    grid:{left:spec.unit==='人'||spec.unit==='台'?62:46,right:18,top:28,bottom:isTimeline?(spec.series.length>1?55:32):76},
    xAxis:{type:'category',data:spec.labels,axisLabel:{color:'#687d6e',interval:0,hideOverlap:true,rotate:isTimeline?0:18,fontSize:11},axisTick:{show:false},axisLine:{lineStyle:{color:'#bed0bf'}}},
    yAxis:{type:'value',min:isTimeline?'dataMin':0,scale:isTimeline,
      axisLabel:{color:'#687d6e',formatter:axisValue},splitLine:{lineStyle:{color:'#e7ede6'}}},
    series:spec.series.map((line,index)=>({name:line.name,type:isTimeline?'line':'bar',data:line.values,smooth:isTimeline ? 0.18 : false,symbolSize:5,barMaxWidth:52,lineStyle:{width:2.5},itemStyle:{color:line.color??colors[index%colors.length]}})),
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
  panel.append(sectionTitle('02  /  METRIC EVIDENCE',`#${String(id).padStart(2,'0')} ${item.name} · 数据核对`,
    id===18?'合成试用明细 · 逐条聚合':selectedFilters().length?'当前筛选的模拟分片':'当前底表模拟值'));
  const dimensions=id===18?[...trialFactDimensions]:contract.dimensions;
  const intro=element('p','evidence-meta',`统计对象：${contract.entity} · 窗口：${contract.window} · 当前数据可筛选维度：${dimensions.map(key=>filterLabels[key]).join('、')||'无'}。`);
  panel.append(intro);
  if(value.kind==='na') {panel.append(element('p','na-note',`不适用：${value.reason}。${contract.unsupported}`));return {node:panel,specs:[]};}
  const specs=[];
  const history=metricHistory(id);
  const primaryId=page==='G'&&!metricHistory(54)?53:primaryTrendMetric[page];
  if(history&&id!==primaryId&&(id!==18||selectedFilters().length)) {
    const spec={title:`${history.title} · ${history.labels.length}期趋势`,unit:history.unit,labels:history.labels,
      series:[{name:history.title,values:history.values}],
      note:`${history.note}趋势图纵轴按当前序列缩放，请结合数值表判断变化幅度。`};
    const box=element('div','detail-chart');box.setAttribute('role','img');
    box.setAttribute('aria-label',`${spec.title}；${spec.note}；完整数值见下方数据表`);
    panel.append(box,element('p','table-note',history.note));specs.push([box,spec]);
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
    const spec={title:'设备型号经营表现 · 当前筛选',kind:'heatmap',unit:'%',labels:entries.map(([name])=>name),
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
  section.append(sectionTitle('05  /  METRIC CATALOG',`本页全部指标 · ${records.length} 项`,'点击指标名称查看证据；口径按钮查看定义、公式和来源'));
  const wrap=element('div','data-table-scroll');
  const table=element('table','diagnostic-table metric-table');
  table.append(element('caption','visually-hidden',`${pages[page].title}全部指标与底表定义`));
  const head=element('thead',''); const row=element('tr','');
  ['编号','指标','当前演示值','适用维度'].forEach(label=>row.append(element('th','',label)));
  head.append(row);table.append(head);
  const body=element('tbody','');
  records.forEach(item=>{
    const tr=element('tr','');
    const title=element('td','metric-heading');const link=element('a','metric-inventory-link',item.name);link.href=routeHref(page,item.id);title.append(link,definition(item.id,item.name));
    tr.append(element('th','',String(item.id).padStart(2,'0')),title,element('td','',displayValue(item.id)),
      element('td','',contractFor(item.id).dimensions.map(key=>filterLabels[key]).join('、')||'无'));
    body.append(tr);
  });
  table.append(body);wrap.append(table);section.append(wrap);
  return section;
}
function actionRecord(page,evidenceId) {
  const scope=activeFilterDescription()||'默认演示范围';
  const key=`record:${page}:${scope}:${evidenceId}`;
  const current=simulatedActionState[key]??{};
  const form=element('form','action-record');
  form.append(element('strong','','问题处理记录'),element('p','table-note',`关联范围：${scope} · 复查指标：${catalogItem(evidenceId)?.name??'当前证据'}。记录只保存在此浏览器。`));
  const fields=element('div','action-record-fields');
  const ownerLabel=element('label','','负责人');const owner=element('input','');owner.name='owner';owner.placeholder='填写负责人';owner.value=current.owner??'';ownerLabel.append(owner);
  const statusLabel=element('label','','处理状态');const status=element('select','');status.name='status';
  [['pending','待处理'],['reviewing','核查中'],['resolved','已处理，待复查']].forEach(([value,label])=>{const option=element('option','',label);option.value=value;status.append(option);});
  status.value=current.status??'pending';statusLabel.append(status);
  const noteLabel=element('label','','处理说明');const note=element('input','');note.name='note';note.placeholder='记录核查结果';note.value=current.note??'';noteLabel.append(note);
  const save=element('button','action-toggle','保存本地记录');save.type='submit';
  fields.append(ownerLabel,statusLabel,noteLabel,save);form.append(fields);
  const receipt=element('p','action-receipt',current.updatedAt?`已保存：${current.updatedAt}`:'尚未记录');form.append(receipt);
  const review=element('a','insight-link','复查关联指标 ↗');review.href=routeHref(page,evidenceId);form.append(review);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const updatedAt=new Date().toLocaleString('zh-CN',{hour12:false});
    simulatedActionState[key]={owner:owner.value.trim()||'待指派',status:status.value,note:note.value.trim(),updatedAt,
      page,evidenceId,scope,reviewMetric:evidenceId};
    try {localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(simulatedActionState));
      receipt.textContent=`已保存：${updatedAt}`;document.querySelector('#announcement').textContent='处理记录已保存在此浏览器';}
    catch {receipt.textContent='浏览器存储不可用，记录未保存';}
  });
  return form;
}
function actionQueue(page) {
  const info=dataset.diagnostics[page];
  const section=element('section','detail-section action-section');
  if(selectedFilters().length) {
    section.append(sectionTitle('04  /  ACTION QUEUE','筛后核对清单','按当前筛选重建；仅建议核对，无自动触达'));
    const firstAvailable=sourceData.catalog.find(item=>item.page===page&&metric(item.id).kind!=='na')?.id;
    const ids=[...info.heroIds];
    if(firstAvailable&&!ids.some(id=>metric(id).kind!=='na'))ids.unshift(firstAvailable);
    section.append(dataTable({title:'所选范围的核对对象',columns:['指标','筛后信号','建议下一步'],rows:ids.map(id=>[
      catalogItem(id).name,displayValue(id),metric(id).kind==='na'?metric(id).reason:`核对 ${contractFor(id).entity} 的分子、分母、来源与完整观察窗`]),
      note:'这里展示指标核对任务，不沿用默认样本的行动对象与阈值。'}));
    section.append(actionRecord(page,filteredFinding(page)?.id??firstAvailable??info.heroIds[0]));
    return section;
  }
  section.append(sectionTitle('03  /  ACTION QUEUE','模拟行动出口','演示样本，处理记录保存在此浏览器；不会触达用户或连接外部系统'));
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
    if(t)return {id:13,text:`所选范围的观鸟7日价值激活率为 ${percent(m(13).value)}；近4周均值较前8周 ${t.delta>=0?'上升':'下降'} ${Math.abs(t.delta).toFixed(1)} 个百分点。该比较不证明设备问题是原因。`};
  }
  if(page==='B'&&m(25).kind==='group') {
    const v=m(25).value;
    return {id:25,text:`当前DAU ${number(v.DAU)}、WAU ${number(v.WAU)}、MAU ${number(v.MAU)}${changeText(recentChange(4),0)}；DAU/MAU 为 ${(v.DAU/v.MAU*100).toFixed(1)}%。三个时间窗人数不可相加。`};
  }
  if(page==='C'&&m(42).kind==='rate') {
    const t=trend(42,8);
    if(t)return {id:42,text:`所选范围空触发率 ${percent(m(42).value)}；近4周均值较前8周 ${t.delta>=0?'上升':'下降'} ${Math.abs(t.delta).toFixed(1)} 个百分点。请核对型号与固件分组。`};
  }
  if(page==='D'&&filterState.plan==='Free'&&m(22).kind==='group') {
    const part=m(22).value.anyExhausted;
    return {id:22,text:`观鸟Free主账号中，任一权益用满 ${number(part.numerator)} / ${number(part.denominator)}（${percent(part.value)}）。付费试用与续费指标在Free筛选下不适用。`};
  }
  if(page==='D'&&m(18).kind==='na')
    return {id:18,text:`试用转正率当前不适用：${m(18).reason}。请调整条件或查看其他指标的独立证据。`};
  if(page==='D'&&m(18).kind==='rate') {
    if(filterState.week) {
      const currentWeek=Number(filterState.week);
      const previousRows=trialRows({...filterState,week:String(currentWeek-1)});
      const before=previousRows.rows?trialAggregate(previousRows.rows):null;
      const delta=before?.denominator>=30?(m(18).value-before.value)*100:null;
      const change=delta===null?'；前一周无可比样本':Math.abs(delta)<.05?`，较W${currentWeek-1} 持平`:`，较W${currentWeek-1} ${delta>=0?'+':''}${delta.toFixed(1)} 个百分点`;
      return {id:18,text:`W${currentWeek}成熟试用转正 ${number(m(18).numerator)}/${number(m(18).denominator)}（${percent(m(18).value)}）${change}。`};
    }
    const current=trialRows({...filterState,week:undefined},'current');
    const previous=trialRows({...filterState,week:undefined},'previous');
    if(current.rows&&previous.rows) {
      const now=trialAggregate(current.rows),before=trialAggregate(previous.rows);
      if(now.denominator>=30&&before.denominator>=30) {
        const delta=(now.value-before.value)*100;
        const target=row=>row.app_platform==='Android'&&row.plan==='Plus'&&row.billing_cycle==='monthly';
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
function renderDetail(page,selectedMetric) {
  disposeCharts();
  const detail=pages[page];
  const info=dataset.diagnostics[page];
  const week=sourceData.weekly.find(item=>String(item.week)===filterState.week);
  const period=week?`所选完整周 W${week.week} · ${week.weekEnd}；快照/月度指标不适用`:
    page==='D'?`试用明细最新成熟周截至 ${sourceData.weekly.at(-1).weekEnd}；其他指标按各自统计窗口`:info.period;
  main.replaceChildren();
  const top=element('div','detail-heading');
  const back=element('a','back-link','← 返回经营总览'); back.href=routeHref();
  top.append(back,element('p','eyebrow',`DIAGNOSTIC ${page}  /  ROUND ${detail.round}`),
             element('h1','',detail.title),element('p','heading-sub',detail.question),element('p','detail-period',period));
  const body=element('div','detail-shell');
  body.append(filterBar(page));
  const overview=element('section','detail-section');
  overview.append(sectionTitle('01  /  SIGNALS','关键观察',period));
  const hero=element('div','detail-kpis');
  info.heroIds.forEach(id=>{
    const item=catalogItem(id);
    const card=element('article',`detail-kpi${id===selectedMetric?' selected':''}`);
    const heading=element('div','metric-heading');heading.append(element('h3','',item.name),definition(id,item.name));
    const link=element('a','detail-evidence-link','查看对应数据 ↓');link.href=routeHref(page,id);
    card.append(element('span','detail-kpi-id',`#${String(id).padStart(2,'0')}`),heading,element('strong','',displayValue(id)),link);
    const trend=headlineTrend(id);if(trend)card.append(trend);
    if(metric(id).kind==='na')card.append(element('p','metric-na-reason',metric(id).reason));
    hero.append(card);
  });
  const finding=element('aside','detail-finding');
  let findingMetric=defaultFindingMetric[page];
  if(selectedFilters().length) {
    const observation=filteredFinding(page);
    findingMetric=observation?.id??selectedMetric;
    finding.append(element('span','insight-tag','筛后观察'),element('p','',observation?
      `${observation.text} 所选条件：${activeFilterDescription()}。`:
      '当前筛选下，本页关键指标均无适用的模拟事实；请调整筛选条件。'));
    finding.append(element('p','finding-meta',
      `演示文案规则 ${findingRuleVersion} · 证据指标 #${String(findingMetric).padStart(2,'0')} · ${page==='D'&&findingMetric===18?'合成试用明细交集重算':'底表汇总与模拟分片估算'}`));
  } else {
    finding.append(element('span','insight-tag','演示发现'),element('p','',page==='D'?filteredFinding('D')?.text??info.finding:info.finding));
  }
  const cross=element('a','insight-link','查看本条指标证据 ↓');
  cross.href=routeHref(page,findingMetric);finding.append(cross);
  if(!selectedFilters().length) {
    const related=element('a','insight-link related-link',`${info.crossLabel} ↗`);
    related.href=routeHref(info.crossLink);finding.append(related);
  }
  overview.append(finding,hero);body.append(overview);
  const evidenceFor=metricEvidence(selectedMetric,page);body.append(evidenceFor.node);
  const evidence=element('section','detail-section');
  const drawSpecs=[];
  let explorer;
  if(!selectedFilters().length) {
  evidence.append(sectionTitle('03  /  EVIDENCE','趋势与分组证据','默认样本的图表与数据表使用同一份模拟数据'));
  [info.chart,...(info.extraCharts??[])].forEach(spec=>{
    const chartPanel=element('div','detail-chart-panel');
    chartPanel.append(element('h3','',spec.title));
    const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',`${spec.title}；${spec.note}；完整数值见下方数据表`);
    chartPanel.append(box,element('p','table-note',spec.note),chartTable(spec));evidence.append(chartPanel);
    drawSpecs.push([box,spec]);
  });
  const grids=element('div','evidence-grid');
  info.tables.forEach(spec=>grids.append(dataTable(spec)));
  if (info.structureViews) {
    explorer=structureExplorer(info.structureViews);
    evidence.append(explorer.node);
  }
  evidence.append(grids);body.append(evidence);
  } else {
    evidence.append(sectionTitle('03  /  EVIDENCE','当前筛选 · 核心趋势',
      '当前筛选下保留关键时间趋势；历史模拟分片和明细事实的来源见各图注。'));
    const histories=page==='E'?[paidPayersHistory(),metricHistory(35)]:
      page==='G'?[metricHistory(54)??metricHistory(53)]:[metricHistory(primaryTrendMetric[page])];
    const trendGrid=element('div',`filtered-trends${histories.length>1?' paired':''}`);
    histories.forEach(history=>{
      if(!history)return;
      const spec={title:`${history.title} · ${history.labels.length}期趋势`,unit:history.unit,
        labels:history.labels,series:[{name:history.title,values:history.values}],
        note:`${history.note}趋势图纵轴按当前序列缩放，请结合数值表判断变化幅度。`};
      const chartPanel=element('div','detail-chart-panel');
      const box=element('div','detail-chart');box.setAttribute('role','img');
      box.setAttribute('aria-label',`${spec.title}；${spec.note}；完整数值见下方表格`);
      chartPanel.append(element('h3','',spec.title),box,element('p','table-note',spec.note),chartTable(spec));
      trendGrid.append(chartPanel);drawSpecs.push([box,spec]);
    });
    if(!trendGrid.childElementCount)trendGrid.append(element('p','na-note','当前条件下核心趋势不适用：没有可比较的成熟批次或可用统计对象。请调整筛选条件。'));
    evidence.append(trendGrid);body.append(evidence);
  }
  body.append(actionQueue(page),metricInventory(page));
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
  const {page:route,metricId}=readRoute();
  projectDataset();
  closeDefinitionPopover();
  if (route && pages[route]) {
    const selected=dataset.diagnostics[route].heroIds.includes(metricId)||contractFor(metricId)?.page===route?
      metricId:defaultFindingMetric[route];
    renderDetail(route,selected); document.title=`${pages[route].title} · Parallens`;
  } else {
    renderHome(); document.title='用户与设备经营总览 · Parallens';
  }
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link=>{
    const code=link.dataset.page;
    link.href=routeHref(code);
    link.classList.toggle('active',code===route);
    if(code===route)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  main.focus({preventScroll:true});
  if(metricId&&route&&!preserveScroll) requestAnimationFrame(()=>document.querySelector(`#metric-evidence-${metricId}`)?.scrollIntoView({block:'start'}));
  else if(!preserveScroll)scrollTo({top:0,behavior:'instant'});
  document.querySelector('#announcement').textContent=route && pages[route] ? `已打开${pages[route].title}诊断页` : '已返回经营总览';
}
async function start() {
  try {
    const names=['metric-catalog','metric-values','weekly','snapshot','stories','diagnostics','filter-contract','filter-slices','trial-facts','metric-trends'];
    const fetchPart=async name=>{
      for(let attempt=0;attempt<2;attempt++) {
        try {
          const response=await fetch(`./data/${name}.json`,{cache:'no-store'});
          if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
          return await response.json();
        } catch(error) {
          if(attempt===1)throw error;
          await new Promise(resolve=>setTimeout(resolve,150));
        }
      }
    };
    const parts=[];
    for(let offset=0;offset<names.length;offset+=3)
      parts.push(...await Promise.all(names.slice(offset,offset+3).map(fetchPart)));
    sourceData=Object.fromEntries(names.map((name,index)=>[name==='metric-catalog'?'catalog':name==='metric-values'?'metrics':name==='filter-contract'?'contract':name==='filter-slices'?'slices':name==='trial-facts'?'trialFacts':name==='metric-trends'?'metricTrends':name,parts[index]]));
    window.addEventListener('hashchange',()=>renderRoute());
    window.addEventListener('popstate',()=>renderRoute());
    document.addEventListener('keydown',event=>{
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
    renderRoute();
  } catch(error) {
    const panel=element('div','load-error');
    panel.append(element('h1','','数据未加载'),element('p','','请确认本地服务正在运行，然后刷新页面重试。'));
    main.replaceChildren(panel);
    console.error(error);
  }
}
start();
