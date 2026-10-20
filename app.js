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
const findingRuleVersion='demo-2026-10-18-v5';
const findingSource=id=>({9:'同源合成注册批次v1',10:'同源合成注册批次v1',12:'同源合成注册批次v1',17:'同源注册分母与7天开启频数v1',54:'30个完整UTC日同源质量计数v1',4:'同源每日活跃窗口频数v1',25:'同源每日活跃窗口频数v1',30:'同源活跃频数与七类互斥构成v1',11:'同源合成绑定频数v1',13:'同源合成激活频数v1',15:'合成设备台账逐台计数',41:'合成设备行为间隔聚合',44:'合成设备行为间隔与独立回流群',18:'合成试用明细交集重算',42:'周×型号×固件合成触发汇总',27:'合成功能人数',29:'合成活跃间隔分层',45:'型号×固件合成请求',46:'型号×固件合成请求',2:'互斥订阅状态',6:'互斥订阅状态'})[id]??'汇总值与模拟分片估算';
const main = document.querySelector('#main');
main?.addEventListener('toggle',()=>updateScrollableTables(),true);
document.querySelector('.skip-link')?.addEventListener('click',event=>{
  event.preventDefault();
  main.focus({preventScroll:true});
  main.scrollIntoView({block:'start',behavior:'instant'});
});
let dataset;
let sourceData;
let routeCore;
let homeReadModel;
let routeProjectionIds=null;
let activeDataPage;
const preparedRoutes=new Map();
const routeRequests=new Map();
let routeLoadRevision=0;
let loadingRouteHash;
const currentRoutePage=()=>{const page=location.hash.replace(/^#\/?/,'').split(/[/?]/)[0].toUpperCase();return Object.hasOwn(pages,page)?page:'';};
const homeScopeKey=state=>['country','productLine','appPlatform'].map(key=>state[key]&&state[key]!=='All'?state[key]:'').join('|');
function homeProjection(){return homeReadModel&&currentRoutePage()===''&&!filterErrors.length?homeReadModel.scopes[homeScopeKey(filterState)]:null;}

let trialFactIndex;
let filterState={};
let retentionMonthRequest=[];
let userCohortTypeRequest=[];
let userCohortRequest=[];
let unbindingMonthRequest=[];
let riskSnapshotRequest=[];
let renewalMonthRequest=[];
let deviceRetentionCohortRequest=[];
let activationWeekRequest=[];
let filterErrors=[];
const filterDisclosure=new Map();
let startupInProgress=false;
let dataFirstRequested=false;
let appEventsBound=false;
let lastRenderedHash;
let diagnosticWorkspaceView='change';
const chartMotionPreference=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const chartAnimationDuration=duration=>chartMotionPreference?.matches?0:duration;
let definitionReturnFocus;
let chart;
let homeTrendFocus=null;
let homeSelectionMode='auto';
let statusChart;
const sparklines=[];
const detailCharts=[];
const chartPresentations=new WeakMap();
const evidenceChartSpecs=new WeakMap();
function refreshEvidenceChart(instance) {
  const box=instance.getDom(),spec=evidenceChartSpecs.get(box);
  if(!spec)return false;
  drawEvidenceChart(box,spec);return true;
}
const chartTextScale=()=>Math.max(1,parseFloat(getComputedStyle(document.documentElement).fontSize)/16);
const chartText=size=>size*chartTextScale();
function setChartOption(instance,build,{responsive=false,legendPadding=null}={}) {
  chartPresentations.set(instance,{build,responsive,legendPadding,scale:null,reducedMotion:null,width:null});
  refreshChartTypography(instance);
}
function refreshChartTypography(instance) {
  const presentation=chartPresentations.get(instance),scale=chartTextScale(),reducedMotion=!!chartMotionPreference?.matches;
  const width=instance.getDom().clientWidth;
  if(!presentation||presentation.scale===scale&&presentation.reducedMotion===reducedMotion&&(!presentation.responsive||presentation.width===width))return false;
  const option=presentation.build(),fontSize=chartText(12);
  option.animation=!reducedMotion&&(option.animation??true);
  option.textStyle={fontFamily:'DM Sans, PingFang SC, Microsoft YaHei, sans-serif',fontSize,...option.textStyle};
  for(const key of ['xAxis','yAxis']) {
    if(!option[key])continue;
    const axes=Array.isArray(option[key])?option[key]:[option[key]];
    axes.forEach(axis=>{
      axis.axisLabel={fontSize,margin:chartText(8),...axis.axisLabel};
      axis.nameTextStyle={fontSize,...axis.nameTextStyle};
      axis.nameGap=chartText(axis.nameGap??15);
    });
  }
  if(option.visualMap)option.visualMap.textStyle={fontSize,...option.visualMap.textStyle};
  if(option.grid)for(const key of ['left','right','top','bottom']) {
    if(typeof option.grid[key]==='number')option.grid[key]*=scale;
  }
  // Reapply authored presentation; ECharts merges the existing legend selection.
  if(reducedMotion||presentation.scale!==null)option.animationDurationUpdate=0;
  instance.setOption(option);presentation.scale=scale;presentation.reducedMotion=reducedMotion;presentation.width=width;return true;
}
chartMotionPreference?.addEventListener('change',()=>{
  for(const instance of [chart,statusChart,...sparklines,...detailCharts]) {
    if(instance&&!instance.isDisposed()&&!refreshEvidenceChart(instance))refreshChartTypography(instance);
  }
});
const chartSizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(entries=>requestAnimationFrame(()=>{
  for(const {target:box} of entries) {
    if(!box.isConnected||!box.clientWidth||!box.clientHeight)continue;
    const instance=window.echarts?.getInstanceByDom(box);
    if(!instance||instance.isDisposed())continue;
    if(refreshEvidenceChart(instance))continue;
    const typographyChanged=refreshChartTypography(instance);
    if(!typographyChanged&&Math.abs(instance.getWidth()-box.clientWidth)<1&&Math.abs(instance.getHeight()-box.clientHeight)<1)continue;
    instance.resize();
    if(box.parentElement.classList.contains('chart-legend-frame'))fitChartLegend(box.parentElement,instance);
  }
})):null;
function createChart(box) {
  if(box.classList.contains('chart-fallback')) {
    box.classList.remove('chart-fallback');box.replaceChildren();box.setAttribute('role','img');
  }
  const instance=window.echarts.init(box,null,{renderer:'svg'});
  chartSizeObserver?.observe(box);return instance;
}
function destroyChart(instance) {
  chartSizeObserver?.unobserve(instance.getDom());instance.dispose();
}
const ACTION_STORAGE_KEY='parallens-demo-actions-v1';
let simulatedActionState={};
try {
  const saved=JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY)||'{}');
  simulatedActionState=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
} catch { simulatedActionState={}; }
const actionDrafts=new Map();
const activeIssueMetrics=new Map();
const issueScopeKey=page=>`${page}:${activeFilterDescription()||'默认演示范围'}`;
const warnActionDrafts=event=>{event.preventDefault();event.returnValue='';};
function focusIssueOwner(form=document.querySelector('.action-record')) {
  const owner=form?.querySelector('[name="owner"]');
  if(!owner)return;
  owner.focus({preventScroll:true});
  const entry=currentReadingEntry,revision=readingRevision,hash=location.hash;
  const reveal=()=>{
    if(!owner.isConnected||document.activeElement!==owner||entry!==currentReadingEntry||
      revision!==readingRevision||hash!==location.hash||document.querySelector('dialog:modal'))return;
    const target=owner.closest('label')??owner,bounds=target.getBoundingClientRect(),field=owner.getBoundingClientRect();
    const navigation=document.querySelector('.section-navigation')?.getBoundingClientRect();
    const top=navigation?.top<=0?Math.max(0,navigation.bottom):0;
    const hit=document.elementFromPoint(field.x+field.width/2,field.y+field.height/2);
    if(bounds.top<top||bounds.bottom>innerHeight||hit!==owner)
      target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  };
  reveal();
  const left=scrollX,top=scrollY;
  // Evidence explorers build their initial content in the next animation frame.
  // Only finish this explicit action if the user has not moved or chosen another target.
  requestAnimationFrame(()=>{if(scrollX===left&&scrollY===top)reveal();});
}
function updateActionDraftWarning() {
  window.removeEventListener('beforeunload',warnActionDrafts);
  if(actionDrafts.size)window.addEventListener('beforeunload',warnActionDrafts);
}
function saveActionState(key,record) {
  const next={...simulatedActionState,[key]:record};
  try {localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(next));}
  catch {return false;}
  simulatedActionState=next;updateSavedIssueSummary();return true;
}
const issueStatusLabels={pending:'待处理',reviewing:'核查中',resolved:'已处理，待复查',verified:'复查通过（人工确认）'};
const issueStatusLabel=status=>Object.hasOwn(issueStatusLabels,status)?issueStatusLabels[status]:'状态待核对';
const savedIssueTableObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>updateScrollableTables()):null;
function issueIdForKey(key,page,id) {
  const hash=[...key].reduce((value,char)=>(value*31+char.charCodeAt(0))>>>0,7).toString(36).toUpperCase();
  return `DEMO-${page}-${id}-${hash}`;
}
function savedIssueTarget(key,record) {
  if(!record||typeof record!=='object'||Array.isArray(record))return {reason:'旧记录内容不完整，仅保留原记录。'};
  const {page,evidenceId:id,scope,filters}=record;
  if(typeof page!=='string'||!Object.hasOwn(pages,page)||!Number.isInteger(id)||!supportsPageMetric(page,id))
    return {reason:'记录中的专题或指标当前不可用。'};
  if(!filters||typeof filters!=='object'||Array.isArray(filters))return {reason:'旧记录未保存筛选快照，无法可靠恢复原范围。'};
  const allowed=[...relevantFilters(page),...(page==='B'&&id===28?['userCohortType','userCohort']:[]),...(page==='B'&&id===24?['retentionMonth']:[]),...(page==='D'&&id===23?['renewalMonth']:[]),...(page==='C'&&id===43?['activationCohort']:[]),...(page==='A'&&id===16?['activationWeek']:[]),...(page==='F'&&id===51?['unbindingMonth']:[]),...(['D','G'].includes(page)&&id===52?['riskSnapshot']:[])];
  if(Object.entries(filters).some(([name,value])=>!allowed.includes(name)||typeof value!=='string'||
    value!=='All'&&!availableOptions(page,name,filters).includes(value)))
    return {reason:'记录包含当前不支持的筛选值；保留原范围，不替换为总体。'};
  const selected=allowed.filter(name=>filters[name]&&filters[name]!=='All').map(name=>[name,filters[name]]);
  const restoredScope=formatIssueScope(selected);
  if(scope!==restoredScope||key!==`record:${page}:${scope}:${id}`||
    record.issueId&&record.issueId!==issueIdForKey(key,page,id))
    return {reason:'历史范围或问题标识与当前规则不一致；请先核对保存详情。'};
  const params=new URLSearchParams(selected);params.set('metric',String(id));params.set('issue',String(id));
  return {href:`#/${page}?${params}`,page,id};
}
function savedIssueEntries() {
  return Object.entries(simulatedActionState).filter(([key])=>key.startsWith('record:')).map(([key,value])=>{
    const record=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    const title=catalogItem(record.evidenceId)?.name??'历史指标待核对';
    return {key,record,title,target:savedIssueTarget(key,value)};
  }).sort((a,b)=>{
    const order={pending:0,reviewing:1,resolved:2,verified:3};
    return (Object.hasOwn(order,a.record.status)?order[a.record.status]:4)-(Object.hasOwn(order,b.record.status)?order[b.record.status]:4)||
      String(a.record.due||'9999').localeCompare(String(b.record.due||'9999'))||a.key.localeCompare(b.key,'zh-CN');
  });
}
function updateSavedIssueSummary() {
  const total=Object.keys(simulatedActionState).filter(key=>key.startsWith('record:')).length;
  const count=document.querySelector('#saved-issues-total');if(count)count.textContent=String(total);
  document.querySelector('#open-saved-issues')?.setAttribute('aria-label',`已登记问题，${total}条本地记录`);
}
function renderSavedIssues() {
  savedIssueTableObserver?.disconnect();
  const all=savedIssueEntries(),normalize=text=>String(text).normalize('NFKC').toLocaleLowerCase('zh-CN');
  const terms=normalize(document.querySelector('#saved-issues-query').value).trim().split(/\s+/).filter(Boolean);
  const rows=all.filter(({record,title})=>{
    const text=normalize([title,record.issueId,record.scope,record.owner,pages[record.page]?.title,
      issueStatusLabel(record.status),record.due].filter(Boolean).join(' '));
    const id=typeof record.evidenceId==='number'?record.evidenceId:
      typeof record.evidenceId==='string'&&/^\d+$/.test(record.evidenceId)?Number(record.evidenceId):null;
    return terms.every(term=>/^#\d+$/.test(term)?id!==null&&Number(term.slice(1))===id:text.includes(term));
  });
  document.querySelector('#saved-issues-count').textContent=`${rows.length} / ${all.length} 条已保存问题 · 按处理进度与计划复查日排列`;
  const content=document.querySelector('#saved-issues-content');content.replaceChildren();
  if(!rows.length) {
    content.append(element('p','saved-issues-empty',all.length?'没有匹配的问题。清空关键词可查看全部已保存记录。':
      '还没有已保存的问题单。进入任一指标的“问题登记”，保存后即可在这里跨范围查找。'));
    return;
  }
  const wrap=element('div','saved-issues-table data-table-scroll');
  const table=element('table','');table.append(element('caption','visually-hidden','本浏览器全部范围的已保存问题'));
  const head=element('thead',''),headRow=element('tr','');
  ['问题与指标','登记范围','负责人','处理进度','计划复查日','返回问题单'].forEach(label=>{
    const th=element('th','',label);th.scope='col';headRow.append(th);
  });head.append(headRow);table.append(head);
  const body=element('tbody','');
  for(const {key,record,title,target} of rows) {
    const tr=element('tr','');tr.dataset.recordKey=key;
    const metricCell=element('th','');metricCell.scope='row';
    metricCell.append(element('strong','',`${record.evidenceId?`#${record.evidenceId} `:''}${title}`),
      element('span','saved-issue-meta',`${pages[record.page]?.title??'历史专题'} · ${record.issueId??'旧记录未保存问题编号'}`));
    const details=element('details','saved-issue-details');details.append(element('summary','','查看保存详情'));
    for(const [field,label] of [['baseline','登记基线'],['baselineAt','基线周期'],['updatedAt','保存时间'],['note','处理说明'],['target','验收条件'],['reviewValue','复查实测值'],['reviewedAt','实际复查日'],['linkedSample','关联记录']])
      if(field==='baseline'&&[9,10,12].includes(record.evidenceId)&&record.baseline?.startsWith('注册批次证据v1：'))details.append(registrationBaselineDetails(record.baseline));
      else if(field==='baseline'&&record.evidenceId===17&&record.baseline?.startsWith('试用开启证据v1：'))details.append(trialOpeningBaselineDetails(record.baseline));
      else if(field==='baseline'&&record.evidenceId===28&&record.baseline?.startsWith('新客留存证据v1：'))details.append(userRetentionBaselineDetails(record.baseline));
      else if(field==='baseline'&&record.evidenceId===27&&record.baseline?.startsWith('功能配置证据v1：'))details.append(featureUsageBaselineDetails(record.baseline));
      else if(field==='baseline'&&record.evidenceId===52&&record.baseline?.startsWith('风险证据v1：'))details.append(riskBaselineDetails(record.baseline));
      else if(typeof record[field]==='string'&&record[field])details.append(element('p','',`${label}：${record[field]}`));
    if(details.children.length===1)details.append(element('p','','旧记录没有提供额外保存详情。'));
    metricCell.append(details);tr.append(metricCell,element('td','',typeof record.scope==='string'?record.scope:'旧记录未保存范围'),
      element('td','',typeof record.owner==='string'?record.owner:'未记录'),
      element('td','',issueStatusLabel(record.status)),element('td','',typeof record.due==='string'&&record.due?record.due:'未设置'));
    const action=element('td','');
    if(target.href) {
      const open=element('button','saved-issue-open','打开');open.type='button';
      open.setAttribute('aria-label',`打开 ${record.issueId??title} · ${record.scope}`);
      open.addEventListener('click',()=>{
        const current=savedIssueTarget(key,simulatedActionState[key]);
        if(!current.href){renderSavedIssues();return;}
        document.querySelector('#saved-issues').close('record');pushRoute(current.href);
        const pending=renderRoute({focusEvidence:false}),entry=currentReadingEntry;
        const finish=()=>requestAnimationFrame(()=>{
          if(entry!==currentReadingEntry||location.hash!==current.href||document.activeElement!==main||document.querySelector('dialog:modal'))return;
          main.querySelector('.income-workspace')?.scrollIntoView({block:'start',behavior:'instant'});
          focusIssueOwner();
          document.querySelector('#announcement').textContent=`已打开${title}的原范围问题单；登记基线和会话草稿保留。`;
        });
        if(pending)pending.then(finish);else finish();
      });action.append(open);
    } else action.append(element('span','saved-issue-readonly',target.reason));
    tr.append(action);body.append(tr);
  }
  table.append(body);wrap.append(table);content.append(wrap);savedIssueTableObserver?.observe(table);
  requestAnimationFrame(updateScrollableTables);
}
function cohortObservation(id,state=filterState,trialRecords) {
  const missing=()=>({reason:'批次或结果观察截止待核验；不能用批次周末代替观察完成日。'});
  if(id===11||id===13) {
    const part=onboardingRows(id,state);if(part.reason)return part;
    return {week:part.cohort.week,start:part.cohort.cohortStart,end:part.cohort.cohortEnd,observedThrough:part.cohort.observedThrough};
  }
  if(id!==18)return missing();
  const scoped=Object.fromEntries(effectiveFor(18,state));
  const week=sourceData.weekly.find(w=>String(w.week)===String(scoped.week??sourceData.weekly.at(-1).week));
  if(!week)return missing();
  const result=trialRecords?{rows:trialRecords}:trialRows({...scoped,week:String(week.week)});
  if(!result.rows?.length)return missing();
  const dates=new Map(),day=value=>{
    if(!dates.has(value))dates.set(value,typeof value==='string'&&baselineWindowEnd(`快照 ${value}`)?Date.parse(value+'T00:00:00Z'):NaN);
    return dates.get(value);
  };
  const end=day(week.weekEnd),asOf=day(sourceData.snapshot.asOf);let observed=-Infinity;
  if(!Number.isFinite(end)||!Number.isFinite(asOf)||sourceData.trialFacts.timezone!=='UTC')return missing();
  for(const row of result.rows) {
    const start=day(row.trial_started_at),ended=day(row.trial_ended_at),through=day(row.outcome_observed_through);
    if(row.cohort_mature!==true||row.maturity_week_end!==week.weekEnd||
      !Number.isFinite(start)||!Number.isFinite(ended)||!Number.isFinite(through)||
      start>ended||ended<end-6*86400000||ended>end||through<ended||through>asOf)return missing();
    observed=Math.max(observed,through);
  }
  if(observed<end)return missing();
  return {week:week.week,start:new Date(end-6*86400000).toISOString().slice(0,10),end:week.weekEnd,
    observedThrough:new Date(observed).toISOString().slice(0,10)};
}
function observedBaselineEnd(window) {
  if(typeof window!=='string')return null;
  const match=/^完整周 W[1-9]\d* · (\d{4}-\d{2}-\d{2})—(\d{4}-\d{2}-\d{2}) · 观察截至 (\d{4}-\d{2}-\d{2})（UTC）$/.exec(window);
  if(!match)return null;
  const dates=match.slice(1).map(value=>new Date(value+'T00:00:00Z'));
  if(dates.some((date,i)=>!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==match[i+1])||
    dates[0].getUTCDay()!==1||dates[1]-dates[0]!==6*86400000||dates[2]<dates[1])return null;
  return match[3];
}
function actionBaselineWindow(id) {
  if(metric(id)?.kind==='na')return '当前范围暂无可用基线周期';
  if([11,13,18].includes(id)){const c=cohortObservation(id);return c.reason?'当前批次观察截止待核验':`完整周 W${c.week} · ${c.start}—${c.end} · 观察截至 ${c.observedThrough}（UTC）`;}
  if(id===28)return userRetentionWindow();
  if([9,10,12].includes(id))return registrationWindow(id);
  if(id===27)return `功能配置v1 · ${activeWindowPeriod(30)}`;
  if(id===54)return qualityWindow();
  if(id===53)return anomalyWindow();
  if(id===26)return sessionDepthWindow();
  if([4,25,30].includes(id))return `快照 ${sourceData.snapshot.asOf} · 活跃窗口v1 · UTC零时截止`;
  if(id===35&&currentPaymentMonth())return `完整月 ${currentPaymentMonth()}`;
  if(id===23){const part=renewalProjection();return part.reason?'月度续订观察期待核验':`月度续订观察期末 ${new Date(Date.parse(part.current.renewalObservationEndExclusive)-86400000).toISOString().slice(0,10)} · 到期月 ${part.month}`;}
  if(id===24)return `完整月 ${retentionSelection().month}`;
  if(id===17)return trialOpeningWindow();
  if(id===16)return activationDeviceWindow();
  if(id===43)return deviceRetentionWindow();
  if(id===52)return riskWindow();
  if(id===51)return unbindingWindow();
  const history=metricHistory(id),last=history?.labels.at(-1);
  if([41,44].includes(id))return `快照 ${sourceData.snapshot.asOf} · 设备行为口径v1 · ${id===41?'近30天活跃':`${metric(id).thresholdDays}天未使用`}`;
  if(last&&/^W\d+$/.test(last)) {
    const selected=effectiveFor(id).find(([key])=>key==='week')?.[1];
    const week=sourceData.weekly.find(item=>String(item.week)===String(selected??last.slice(1)));
    if(week)return `完整周 W${week.week} · ${week.weekEnd}`;
  }
  if(last&&/^\d+月$/.test(last))return `完整月 ${sourceData.snapshot.asOf.slice(0,4)}-${last.slice(0,-1).padStart(2,'0')}`;
  return `快照 ${sourceData.snapshot.asOf}`;
}
function baselineWindowEnd(window) {
  if(typeof window!=='string')return null;
  const observed=observedBaselineEnd(window);if(observed)return observed;
  const opening=/^试用开启观察期末 (\d{4}-\d\d-\d\d) · 注册批次 W[1-9]\d* · (\d{4}-\d\d-\d\d)—(\d{4}-\d\d-\d\d)$/.exec(window);
  if(opening)return opening.slice(1).every(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)&&new Date(opening[2]).getUTCDay()===1&&Date.parse(opening[3])-Date.parse(opening[2])===6*86400000&&Date.parse(opening[1])-Date.parse(opening[3])===7*86400000?opening[1]:null;
  const firstContent=/^首次内容完整周v1 · (\d{4}-\d\d-\d\d)—(\d{4}-\d\d-\d\d)（UTC）$/.exec(window);
  if(firstContent)return firstContent.slice(1).every(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)&&new Date(firstContent[1]).getUTCDay()===1&&Date.parse(firstContent[2])-Date.parse(firstContent[1])===6*86400000?firstContent[2]:null;
  // Only interpret the explicit saved window formats. Never substitute today's
  // metric window for an unknown historical baseline.
  const risk=/^风险快照v1 · (\d{4}-\d\d-\d\dT00:00:00Z)（UTC）$/.exec(window);if(risk)return unbindingDates(risk[1])?risk[1].slice(0,10):null;
  const unbinding=/^解绑月v1 · (\d{4}-\d\d-01T00:00:00Z) → (\d{4}-\d\d-01T00:00:00Z) · 观察截至 (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)$/.exec(window);
  if(unbinding){const [start,end,asOf]=unbinding.slice(1);if(![start,end,asOf].every(unbindingDates)||Date.parse(end)!==Date.UTC(new Date(start).getUTCFullYear(),new Date(start).getUTCMonth()+1,1)||Date.parse(asOf)<Date.parse(end))return null;return asOf.slice(0,10);}
  const anomaly=/^(?:异常24小时v1|质量完整日v1) · (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ) → (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)（左含右不含）$/.exec(window);
  if(anomaly){if(window.startsWith('质量完整日')&&anomaly.slice(1).some(d=>!d.endsWith('T00:00:00Z')))return null;if(Date.parse(anomaly[2])-Date.parse(anomaly[1])!==86400000||anomaly.slice(1).some(d=>!Number.isFinite(Date.parse(d))||new Date(d).toISOString().replace('.000Z','Z')!==d))return null;return anomaly[2].slice(0,10);}
  const registered=/^注册批次v1 · W([1-9]\d*) · (\d{4}-\d\d-\d\d)—(\d{4}-\d\d-\d\d) · 观察截至 (\d{4}-\d\d-\d\d)（UTC）$/.exec(window);if(registered){const dates=registered.slice(2);return dates.every(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)&&Date.parse(dates[1])-Date.parse(dates[0])===6*86400000&&dates[2]>=dates[1]?dates[2]:null;}
  const cohort=/^新客留存v1 · (activation|registration) · (\d{4}-\d\d-\d\d)—(\d{4}-\d\d-\d\d) · 观察截至 (\d{4}-\d\d-\d\d)（UTC）$/.exec(window);if(cohort){const dates=cohort.slice(2);return dates.every(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)&&Date.parse(dates[1])-Date.parse(dates[0])===6*86400000&&dates[2]>=dates[1]?dates[2]:null;}
  const feature=/^功能配置v1 · (\d{4}-\d\d-\d\d) → (\d{4}-\d\d-\d\d) UTC零时（左含右不含）$/.exec(window);if(feature)return Date.parse(feature[2])-Date.parse(feature[1])===30*86400000?feature[2]:null;
  const session=/^会话日口径v1 · (\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2}) UTC零时（左含右不含）$/.exec(window);
  if(session){if(Date.parse(session[2])-Date.parse(session[1])!==86400000||session.slice(1).some(d=>!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))return null;return session[2];}
  const dated=/^(?:完整周 W[1-9]\d* · |快照 )(\d{4}-\d{2}-\d{2})(?:(?: · 设备行为口径v1 · (?:近30天活跃|(?:21|30)天未使用))|(?: · 活跃窗口v1 · UTC零时截止))?$/.exec(window);
  const month=/^完整月 (\d{4}-(?:0[1-9]|1[0-2]))$/.exec(window);
  const device=/^设备留存(D7|D30)观察期末 (\d{4}-\d{2}-\d{2}) · 激活批次 (\d{4}-\d{2}-\d{2})—(\d{4}-\d{2}-\d{2})$/.exec(window);
  if(device){
    const dates=device.slice(2).map(text=>new Date(`${text}T00:00:00Z`));
    if(dates.some((date,i)=>!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==device[i+2])||dates[1].getUTCDay()!==1||
      dates[2]-dates[1]!==6*86400000||dates[0]-dates[2]!==Number(device[1].slice(1))*86400000)return null;
  }
  const renewal=/^月度续订观察期末 (\d{4}-\d{2}-\d{2}) · 到期月 (\d{4}-(?:0[1-9]|1[0-2]))$/.exec(window);
  if(renewal&&Date.parse(renewal[1])!==Date.parse(`${renewal[2]}-01`)+new Date(Date.UTC(Number(renewal[2].slice(0,4)),Number(renewal[2].slice(5)),0)).getUTCDate()*86400000+6*86400000)return null;
  const text=dated?.[1]??device?.[2]??renewal?.[1]??(month?`${month[1]}-01`:null);
  if(!text)return null;
  const date=new Date(`${text}T00:00:00Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==text)return null;
  if(month)date.setUTCMonth(date.getUTCMonth()+1,0);
  return date.toISOString().slice(0,10);
}
window.addEventListener('resize',()=>{
  document.querySelectorAll('.income-context').forEach(node=>node.style.removeProperty('--context-height-limit'));
  [chart,statusChart,...sparklines,...detailCharts].filter(item=>item&&!item.isDisposed()).forEach(item=>{
    if(!refreshEvidenceChart(item)){refreshChartTypography(item);item.resize();}
  });
  document.querySelectorAll('.chart-legend-frame').forEach(frame=>{
    const box=frame.querySelector('.detail-chart,#trendChart');
    const instance=box&&window.echarts?.getInstanceByDom(box);
    if(instance&&!evidenceChartSpecs.has(box))fitChartLegend(frame,instance);
  });
  updateScrollableTables();
  updateSectionNavigation();
  positionDefinitionPopover();
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
function weeklyAxisLabel(label) {
  const week=sourceData?.weekly?.find(item=>`W${item.week}`===label);
  if(!week)return label;
  const end=new Date(`${week.weekEnd}T00:00:00Z`);
  return `{week|${label}}\n{date|${end.getUTCMonth()+1}/${end.getUTCDate()}}`;
}
const weeklyAxisText=()=>({week:{fontSize:chartText(12),lineHeight:chartText(18),color:'#506455'},date:{fontSize:chartText(12),lineHeight:chartText(18),color:'#58695b'}});
const weeklyAxisNote='周轴日期为观察周结束日；完整起止日期见数据表。';
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function restoreListPaginationFocus(paging,direction) {
  const buttons=[...paging.querySelectorAll('button')];
  const preferred=direction<0?buttons[0]:buttons.at(-1);
  const target=preferred&&!preferred.disabled?preferred:buttons.find(button=>!button.disabled);
  if(target) {
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  }
  if(!paging.querySelector('[aria-live]')) {
    const title=paging.closest('section')?.querySelector('h3')?.textContent??'清单';
    document.querySelector('#announcement').textContent=`${title}，已切换至${paging.querySelector('span')?.textContent??''}。`;
  }
}
const filterLabels={
  week:'统计周',country:'国家/市场',appPlatform:'App平台',productLine:'产品线',deviceModel:'设备型号',
  deviceStatus:'设备状态',season:'未使用判定规则',salesChannel:'自报销售渠道',billingCycle:'计费周期',
  subscriptionPlatform:'订阅平台',plan:'套餐',firmware:'固件版本',functionType:'功能类型',anomalyType:'异常类型',
};
const optionLabels={
  activation:'首次设备激活主账号',registration:'新注册用户',US:'美国',UK:'英国',DE:'德国',Other:'其他',Bird:'观鸟',Hunting:'狩猎',Effective:'有效设备',Inactive:'非有效设备',
  Migration:'迁徙季',Amazon:'Amazon',Shopify:'Shopify',monthly:'月付',annual:'年付',Starter:'Starter',
  Upload:'上传',Live:'直播',Playback:'事件回看',Recognition:'AI识别查看',Push:'推送',Business:'业务异常',Device:'设备异常',Quality:'数据质量',
};
const optionLabel=(key,value)=>key==='season'&&value==='Other'?'淡季':optionLabels[value]??value;
const controlScopes={period:'时间',page:'页面范围',module:'模块细分',view:'分析视角',rule:'业务规则'};
const riskSourceCoverage='同源合成账号与112日活跃；216只是原始演示群，不是全站分母。可核对规则、信号交集与合成名单，不预测真实流失概率。';
const paidPlanMetricIds=new Set([2,3,6,17,18,19,21,23,32,33,34,35]);
const trialFactDimensions=new Set(['week','country','appPlatform','productLine','subscriptionPlatform','plan','billingCycle']);
function indexedTrialFacts() {
  const records=sourceData.trialFacts.records;
  if(trialFactIndex?.records===records)return trialFactIndex;
  const weeks=new Map(),periods=new Map();
  for(const row of records) {
    for(const [groups,key] of [[weeks,row.maturity_week_end],[periods,row.period]]) {
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(row);
    }
  }
  // A retry replaces the records array; its first query rebuilds the index.
  trialFactIndex={records,weeks,periods};
  return trialFactIndex;
}
function trialRows(state=filterState,period) {
  const unsupported=Object.entries(state).find(([key,value])=>value&&value!=='All'&&!trialFactDimensions.has(key));
  if(unsupported)return {rows:null,reason:`新增试用明细暂无${filterLabels[unsupported[0]]}字段`};
  const index=indexedTrialFacts();
  const weekEnd=state.week?sourceData.weekly.find(item=>String(item.week)===String(state.week))?.weekEnd:null;
  const candidates=state.week?(index.weeks.get(weekEnd)??[]):period?(index.periods.get(period)??[]):index.records;
  const rows=candidates.filter(row=>(!period||row.period===period)&&
    (!state.country||row.country===state.country)&&
    (!state.appPlatform||row.app_platform===state.appPlatform)&&
    (!state.productLine||row.product_line===state.productLine)&&
    (!state.subscriptionPlatform||row.subscription_platform===state.subscriptionPlatform)&&
    (!state.plan||row.plan===state.plan)&&
    (!state.billingCycle||row.billing_cycle===state.billingCycle));
  return {rows};
}
function trialAggregate(rows) {
  const denominator=rows.length;
  let numerator=0,attempts=0,failed=0;
  for(const row of rows) {
    if(row.converted)numerator++;
    if(row.payment_attempted)attempts++;
    if(row.payment_status==='failed')failed++;
  }
  return {denominator,numerator,value:denominator?numerator/denominator:null,attempts,failed};
}
const isBirdPlusMonthlyAndroid=row=>row.product_line==='Bird'&&row.app_platform==='Android'&&row.plan==='Plus'&&row.billing_cycle==='monthly';
function trialGroupContributions(periodRows) {
  if(periodRows.length!==2||periodRows.some(rows=>!Array.isArray(rows)))return null;
  const overall=periodRows.map(trialAggregate);
  if(overall.some(item=>item.denominator<30))return null;
  const groups=[['观鸟 Android Plus月付',isBirdPlusMonthlyAndroid],['其他成熟试用',row=>!isBirdPlusMonthlyAndroid(row)]]
    .map(([name,matches])=>({name,summaries:periodRows.map(rows=>trialAggregate(rows.filter(matches)))}))
    .filter(group=>group.summaries.some(item=>item.denominator>0));
  if(!groups.length||groups.some(group=>group.summaries.some(item=>item.denominator<30)))return null;
  const changes=groups.map(group=>(group.summaries[1].numerator/overall[1].denominator-
    group.summaries[0].numerator/overall[0].denominator)*100);
  const effects=groups.map(group=>{
    const rates=group.summaries.map(item=>item.value);
    const weights=group.summaries.map((item,index)=>item.denominator/overall[index].denominator);
    return {rates,weights,within:(weights[0]+weights[1])/2*(rates[1]-rates[0])*100,
      composition:(rates[0]+rates[1])/2*(weights[1]-weights[0])*100};
  });
  return {overall,groups,changes,effects};
}
function homeTrialEvidence(comparison) {
  const overview=homeProjection();if(overview)return comparison.id===18?overview.trialEvidence:null;
  if(comparison.id!==18||filterState.week||Math.abs(comparison.delta)<.05)return null;
  const parts=trialGroupContributions(['previous','current'].map(period=>trialRows(filterState,period).rows));
  if(!parts||['before','after'].some((key,index)=>
    parts.overall[index].numerator!==comparison[key]?.numerator||parts.overall[index].denominator!==comparison[key]?.denominator)||
    Math.abs((parts.overall[1].value-parts.overall[0].value)*100-comparison.delta)>.00001)return null;
  const leader=parts.changes.map((value,index)=>({value,index}))
    .filter(item=>item.value*comparison.delta>0).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value))[0];
  if(!leader||Math.abs(leader.value)<.005)return null;
  return {parts,leader};
}
function homeTrialClue(comparison,evidence=homeTrialEvidence(comparison)) {
  if(!evidence)return '';
  const {parts,leader}=evidence;
  const signed=value=>`${value<0?'−':'+'}${Math.abs(value).toFixed(2)} 个百分点`;
  const remainder=parts.changes.reduce((sum,value,index)=>sum+(index===leader.index?0:value),0);
  return `${parts.groups[leader.index].name}对本次变化贡献 ${signed(leader.value)}${Math.abs(remainder)>=.005?`，其余合计 ${signed(remainder)}`:''}；这是数学分解，不证明因果。`;
}
function trialReadiness(state=filterState) {
  const source=sourceData.trialFacts.readiness;
  if(!source||source.as_of!==sourceData.snapshot.asOf)return {batches:[],reason:'暂无当前快照的批次可用性样例'};
  const scoped=trialState(state);
  const fields={country:'country',appPlatform:'app_platform',productLine:'product_line',
    subscriptionPlatform:'subscription_platform',plan:'plan',billingCycle:'billing_cycle'};
  const unsupported=Object.keys(scoped).find(key=>key!=='week'&&!fields[key]);
  if(unsupported)return {batches:[],reason:`批次可用性样例待补${filterLabels[unsupported]}明细`};
  const rows=source.records.filter(row=>Object.entries(fields).every(([key,field])=>!scoped[key]||row[field]===scoped[key]));
  if(!rows.length)return {batches:[],reason:'当前条件暂无批次可用性样例；不能据此判断没有待齐批次'};
  const batches=[...new Set(rows.map(row=>row.batch_end))].sort().reverse().map(end=>{
    const groups=rows.filter(row=>row.batch_end===end);
    const observationEnd=groups[0].observation_end;
    const expected=groups.reduce((sum,row)=>sum+row.expected_outcomes,0);
    const observed=observationEnd<=source.as_of;
    const received=observed&&groups.every(row=>Number.isInteger(row.received_outcomes))?
      groups.reduce((sum,row)=>sum+row.received_outcomes,0):null;
    const ready=observed&&received===expected;
    return {end,observationEnd,expected,received,observed,groups,
      status:!observed?'观察未结束':ready?'结果已齐':'结果待齐',
      ready,missing:received===null?null:expected-received};
  });
  return {batches};
}
function trialReadinessPanel() {
  const panel=element('section','entity-workspace trial-readiness');
  panel.append(element('h3','','批次数据可用性'),element('p','table-note',
    `快照 ${sourceData.snapshot.asOf} · 独立合成样例。业务条件沿用 #18 试用转正指标；统计周只应用于该指标的 W1–W12 成熟批次，本区按下列批次日期核对。`));
  const ignored=selectedFilters().filter(([key])=>key!=='week'&&!policyFor(18).businessDimensions.includes(key));
  if(ignored.length)panel.append(element('p','table-note',`${ignored.map(([key])=>filterLabels[key]).join('、')}不适用于试用批次，本区不应用这些条件。`));
  const result=trialReadiness();
  if(!result.batches.length) {panel.append(element('p','na-note',result.reason));return panel;}
  const grid=element('div','trial-readiness-grid');
  result.batches.forEach(batch=>{
    const card=element('article','trial-readiness-card');card.dataset.batchEnd=batch.end;
    const header=element('div','trial-readiness-header');
    header.append(element('h4','',`${batch.end} 试用结束批次`),element('span','trial-readiness-status',batch.status));
    card.append(header,element('p','trial-readiness-count',!batch.observed?
      `${number(batch.expected)} 人待完成观察`:batch.received===null?`应齐 ${number(batch.expected)} 人 · 已齐数量待核验`:
        `已齐 ${number(batch.received)} / 应齐 ${number(batch.expected)} 人`),
      element('p','table-note',!batch.observed?`观察截止 ${batch.observationEnd}；尚不核算最终转正结果。`:
        batch.received===null?`观察已于 ${batch.observationEnd} 结束；需补齐回流计数后核对结果。`:
        `观察截止 ${batch.observationEnd}；${batch.missing?`仍缺 ${number(batch.missing)} 人的最终结果，需核对迟到与缺失记录。`:'当前样例结果已齐。'}`),
      element('p','trial-readiness-rule',batch.ready?'样例结果已齐；未并入本页 W1–W12 历史。':'未纳入转正率分母；转正率 —'));
    const details=element('details','trial-readiness-details');
    details.append(element('summary','','核对分组与应齐 / 已齐人数'));
    details.append(dataTable({title:`${batch.end} 批次可用性合成分组`,
      columns:['业务分组','应齐人数','已齐人数','尚缺人数'],
      rows:batch.groups.map(row=>[`${optionLabel('country',row.country)} · ${row.product_line==='Bird'?'观鸟':'狩猎'} · ${row.app_platform} · ${row.subscription_platform} · ${row.plan} · ${optionLabel('billingCycle',row.billing_cycle)}`,
        number(row.expected_outcomes),row.received_outcomes===null?'—':number(row.received_outcomes),
        row.received_outcomes===null?'—':number(row.expected_outcomes-row.received_outcomes)]),
      note:'互斥分组人数可相加；— 表示尚不可核验。计数是可用性样例，不是转正人数，不与成熟试用明细混合。'}));
    card.append(details);grid.append(card);
  });
  panel.append(grid,element('p','table-note','样例仅覆盖部分交叉组合；未提供样例的范围显示待补数据，不显示为 0 或全部正常。'));
  return panel;
}
function trialMetric(state=filterState) {
  const selectedWeek=state.week??String(sourceData.weekly.at(-1).week);
  const result=trialRows({...state,week:selectedWeek});
  if(!result.rows)return na(result.reason);
  const {denominator,numerator,value}=trialAggregate(result.rows);
  if(denominator<30)return na(denominator?`新增试用明细样本不足30（${denominator}人）`:'新增试用明细中没有该筛选组合');
  const observation=cohortObservation(18,state,result.rows);
  return observation.reason?pending(observation.reason):{kind:'rate',denominator,numerator,value,source:'trial-facts'};
}
const relevantFilters=page=>page?Object.entries(sourceData?.filterPolicy?.controls??{})
  .filter(([,config])=>config.pages.includes(page)).map(([key])=>key):['country','productLine','appPlatform'];
const selectedFilters=()=>Object.entries(filterState).filter(([,value])=>value&&value!=='All');
function availableOptions(page,key,state=filterState) {
  // The verified option index lets saved scopes be found before their topic is loaded.
  // Opening the topic still loads and validates its actual source before showing evidence.
  const optionSource={userCohortType:sourceData?.diagnostics?.B?.userRetentionFacts,userCohort:sourceData?.diagnostics?.B?.userRetentionFacts,
    riskSnapshot:sourceData?.diagnostics?.D?.riskFacts,unbindingMonth:sourceData?.diagnostics?.F?.unbindingFacts,
    renewalMonth:sourceData?.monthlyRenewalFacts,retentionMonth:sourceData?.metricTrends?.m24,
    activationWeek:sourceData?.diagnostics?.A?.activationFacts,activationCohort:sourceData?.deviceRetentionFacts};
  if(routeCore?.options[key]&&!optionSource[key])return routeCore.options[key];
  if(key==='userCohortType')return Object.keys(userRetentionTypeLabels);
  if(key==='userCohort')return [...new Set((userRetentionIndex().rows??[]).map(c=>c.id))];
  if(key==='riskSnapshot')return riskIndex().rows?.map(r=>r.date)??[];
  if(key==='unbindingMonth')return unbindingIndex().rows?.map(r=>r.month)??[];
  if(key==='renewalMonth')return renewalIndex().rows?.map(row=>row.month)??[];
  if(key==='retentionMonth')return retentionIndex().rows?.map(row=>row.observedMonth)??[];
  if(key==='activationWeek')return activationDeviceIndex().weeks?.map(w=>w.start)??[];
  if(key==='activationCohort')return deviceRetentionIndex().rows?.map(row=>row.id)??[];
  const config=sourceData.filterPolicy.controls[key];
  const productLine=sourceData.filterPolicy.controls.productLine.options.includes(state.productLine)?state.productLine:undefined;
  if(key==='week')return sourceData.weekly.map(w=>String(w.week));
  if(key==='deviceModel'&&productLine)return config.options.filter(value=>
    (value==='Hunt Pro')===(productLine==='Hunting'));
  return config.optionsByProduct?(config.optionsByProduct[productLine]??[...new Set(Object.values(config.optionsByProduct).flat())]):
    config.optionsByPage?.[page]??config.options;
}
const selectedFor=page=>selectedFilters().filter(([key,value])=>relevantFilters(page).includes(key)&&
  availableOptions(page,key).includes(value));
const hasDataFilters=page=>selectedFor(page).some(([key])=>
  ['page','module','period'].includes(sourceData.filterPolicy.controls[key].scope));
const supportsPageMetric=(page,id)=>Boolean(pages[page]&&id&&
  (sourceData.diagnostics[page].heroIds.includes(id)||contractFor(id)?.page===page));
function routeHref(page='',metricId,evidencePanel) {
  const params=new URLSearchParams();
  selectedFor(page).forEach(([key,value])=>params.set(key,value));
  for(const error of filterErrors)if(relevantFilters(page).includes(error.key)) {
    params.delete(error.key);error.values.forEach(value=>params.append(error.key,value));
  }
  if (metricId) params.set('metric',String(metricId));
  if(['D','G'].includes(page))riskSnapshotRequest.forEach(value=>params.append('riskSnapshot',value));
  if(page==='F')unbindingMonthRequest.forEach(value=>params.append('unbindingMonth',value));
  if(page==='D')renewalMonthRequest.forEach(value=>params.append('renewalMonth',value));
  if(page==='B'){userCohortTypeRequest.forEach(v=>params.append('userCohortType',v));userCohortRequest.forEach(v=>params.append('userCohort',v));}
  if(page==='B')retentionMonthRequest.forEach(value=>params.append('retentionMonth',value));
  if(page==='A')activationWeekRequest.forEach(value=>params.append('activationWeek',value));
  if(page==='C')deviceRetentionCohortRequest.forEach(value=>params.append('activationCohort',value));
  const issue=activeIssueMetrics.get(issueScopeKey(page));
  if(issue)params.set('issue',String(issue));
  const currentPage=location.hash.replace(/^#\/?/,'').split(/[/?]/)[0].toUpperCase();
  if(page&&['change','groups','data'].includes(evidencePanel))params.set('panel',evidencePanel);
  else if(page&&page===currentPage&&!metricId&&diagnosticWorkspaceView!=='change')params.set('panel',diagnosticWorkspaceView);
  return `#/${page}${params.size?`?${params}`:''}`;
}
function readFilters(page,params) {
  filterState={};filterErrors=[];
  const requested=relevantFilters(page).filter(key=>params.has(key))
    .map(key=>({key,values:params.getAll(key)}));
  for(const {key,values} of requested)if(values.length!==1||values[0]!=='All')filterState[key]=values[0];
  for(const {key,values} of requested) {
    if(values.length===1&&values[0]==='All')continue;
    const reason=values.length>1?'同一条件包含多个值，请重新选择一个值。':
      !availableOptions(page,key).includes(values[0])?'此值不在当前可选范围内，请重新选择或清除。':null;
    if(reason)filterErrors.push({key,values,reason});
  }
}
function readRoute() {
  const [path,query='']=location.hash.replace(/^#\/?/,'').split('?');
  const page=path.replace(/\/$/,'').toUpperCase();
  const params=new URLSearchParams(query);
  riskSnapshotRequest=['D','G'].includes(page)?params.getAll('riskSnapshot'):[];
  unbindingMonthRequest=page==='F'?params.getAll('unbindingMonth'):[];
  renewalMonthRequest=page==='D'?params.getAll('renewalMonth'):[];
  userCohortTypeRequest=page==='B'?params.getAll('userCohortType'):[];
  userCohortRequest=page==='B'?params.getAll('userCohort'):[];
  retentionMonthRequest=page==='B'?params.getAll('retentionMonth'):[];
  deviceRetentionCohortRequest=page==='C'?params.getAll('activationCohort'):[];
  activationWeekRequest=page==='A'?params.getAll('activationWeek'):[];
  diagnosticWorkspaceView=['change','groups','data'].includes(params.get('panel'))?params.get('panel'):'change';
  readFilters(pages[page]?page:'',params);
  const issue=Number(params.get('issue'));
  if(!filterErrors.length) {
    if(supportsPageMetric(page,issue))activeIssueMetrics.set(issueScopeKey(page),issue);
    else if(!isTopicOverviewRequest())activeIssueMetrics.delete(issueScopeKey(page));
  }
  return {page:pages[page]?page:'',metricId:Number(params.get('metric'))||null};
}
function activeFilterDescription() {
  return selectedFilters().map(([key,value])=>`${filterLabels[key]}：${key==='week'?`W${value}`:optionLabel(key,value)}`).join(' · ');
}
function formatIssueScope(entries) {
  return entries.map(([key,value])=>`${key==='userCohortType'?'新客入组':key==='userCohort'?'新客批次':key==='riskSnapshot'?'风险快照':key==='unbindingMonth'?'解绑观察月':key==='renewalMonth'?'续订观察月':key==='retentionMonth'?'留存观察月':key==='activationCohort'?'激活批次':key==='activationWeek'?'首次内容统计周':filterLabels[key]}：${key==='week'?`W${value}`:['userCohort','riskSnapshot','unbindingMonth','retentionMonth','renewalMonth','activationCohort','activationWeek'].includes(key)?value:optionLabel(key,value)}`).join(' · ')||'默认演示范围';
}
function issueFilters(page,id) {
  const result={...filterState};
  if(page==='B'&&id===28){if(userCohortTypeRequest.length&&!(userCohortTypeRequest.length===1&&userCohortTypeRequest[0]==='activation'))result.userCohortType=userCohortTypeRequest.join(' / ');if(userCohortRequest.length&&!(userCohortRequest.length===1&&userCohortRequest[0]===userRetentionIndex().source?.defaultCohort))result.userCohort=userCohortRequest.join(' / ');}
  if(['D','G'].includes(page)&&id===52&&riskSnapshotRequest.length&&!(riskSnapshotRequest.length===1&&riskSnapshotRequest[0]===riskIndex().defaultDate))result.riskSnapshot=riskSnapshotRequest.join(' / ');
  if(page==='F'&&id===51&&unbindingMonthRequest.length&&!(unbindingMonthRequest.length===1&&unbindingMonthRequest[0]===unbindingIndex().defaultMonth))result.unbindingMonth=unbindingMonthRequest.join(' / ');
  if(page==='D'&&id===23&&renewalMonthRequest.length&&!(renewalMonthRequest.length===1&&renewalMonthRequest[0]===renewalIndex().defaultMonth))result.renewalMonth=renewalMonthRequest.join(' / ');
  if(page==='B'&&id===24&&retentionMonthRequest.length&&
    !(retentionMonthRequest.length===1&&retentionMonthRequest[0]===currentPaymentMonth()))
    result.retentionMonth=retentionMonthRequest.join(' / ');
  if(page==='C'&&id===43&&deviceRetentionCohortRequest.length&&!(deviceRetentionCohortRequest.length===1&&deviceRetentionCohortRequest[0]===deviceRetentionIndex().defaultCohort))
    result.activationCohort=deviceRetentionCohortRequest.join(' / ');
  if(page==='A'&&id===16&&activationWeekRequest.length&&!(activationWeekRequest.length===1&&activationWeekRequest[0]===activationDeviceIndex().defaultWeek))result.activationWeek=activationWeekRequest.join(' / ');
  return result;
}
const recordScope=(page,id)=>formatIssueScope(Object.entries(issueFilters(page,id)));
const recordKey=(page,id)=>`record:${page}:${recordScope(page,id)}:${id}`;
function filterBar(page='') {
  const bar=element('details','filter-bar');bar.setAttribute('aria-label','数据筛选');
  bar.open=filterErrors.length>0||(filterDisclosure.get(page)??false);
  bar.addEventListener('toggle',()=>{if(bar.isConnected)filterDisclosure.set(page,bar.open);});
  bar.append(element('summary','filter-summary',filterErrors.length?'筛选条件无效 · 请修正':selectedFilters().length?`当前条件 · ${activeFilterDescription()} · 点击调整`:`筛选与分析视角 · 点击展开`));
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
    const error=filterErrors.find(item=>item.key===key);
    if(error) {
      const invalid=element('option','',`无效：${error.values.map(value=>value||'空值').join(' / ')}`);
      invalid.value=filterState[key];invalid.disabled=true;select.append(invalid);
      select.setAttribute('aria-invalid','true');select.setAttribute('aria-describedby',`filter-error-${key}`);
    }
    if(error)select.selectedIndex=select.options.length-1;
    else select.value=filterState[key]??'All';
    select.addEventListener('change',()=>changeFilter(page,key,select.value));
    label.append(select);
    if(error) {
      const note=element('small','filter-field-error',error.reason);note.id=`filter-error-${key}`;label.append(note);
    }
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
  content.append(element('p','filter-active',filterErrors.length?'筛选尚未生效。修正或主动清除无效条件后，再展示数据与分析。':selectedFilters().length?
    `已应用：${activeFilterDescription()}。分析视角只影响对应指标；业务适用但缺演示明细时显示“待补数据”。`:
    '所有关键指标按默认业务对象展示；切换筛选后，请核对每张卡的适用状态与周期。'));
  bar.append(content);
  return bar;
}
// Reading state belongs to a browser history entry, separate from business filters and issue data.
const readingViews=new Map();
let currentReadingEntry;
let readingRevision=0;
let pendingReadingRestore=null;
function selectReadingEntry() {
  // Restore disclosures and charts before scrolling; native restoration can race that work.
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  currentReadingEntry=history.state?.parallensReadingEntry;
  if(!currentReadingEntry) {
    currentReadingEntry=crypto.randomUUID();
    history.replaceState({...history.state,parallensReadingEntry:currentReadingEntry},'');
  }
}
function readingControls(selector='details') {
  const occurrences=new Map();
  return [...main.querySelectorAll(selector)].map(node=>{
    const scope=node.closest('[id]')?.id??'main';
    const label=node.getAttribute('aria-label')??node.querySelector(':scope > summary')?.textContent.trim()??'';
    const caption=node.querySelector('caption')?.textContent.trim()??'';
    const identity=JSON.stringify([scope,label,caption]),occurrence=occurrences.get(identity)??0;
    occurrences.set(identity,occurrence+1);
    return [node,`${identity}:${occurrence}`];
  });
}
function rememberReadingView() {
  if(!currentReadingEntry||lastRenderedHash===undefined||!main.querySelector('h1'))return;
  // A rapid traversal can leave before restoration paints. Preserve the stored destination.
  if(pendingReadingRestore?.entry===currentReadingEntry&&pendingReadingRestore.revision===readingRevision)return;
  const view={hash:lastRenderedHash,left:scrollX,top:scrollY,focusId:main.contains(document.activeElement)?document.activeElement.id:null,
    homeSelection:{focus:homeTrendFocus,mode:homeSelectionMode},
    structures:readingControls('.structure-tabs').map(([node,key])=>[key,[...node.querySelectorAll('[role=tab]')].findIndex(button=>button.getAttribute('aria-selected')==='true')]),
    disclosures:readingControls().map(([node,key])=>[key,node.open]),
    legends:readingControls('.chart-legend').map(([node,key])=>[key,[...node.querySelectorAll('button')].map(button=>[button.textContent,button.getAttribute('aria-pressed')])])};
  readingViews.set(currentReadingEntry,view);
  const topic=main.querySelector('.topic-overview')?.dataset.topic;if(topic)topicOverviewOrigins.set(topic,view);
}
function pushRoute(href) {
  rememberReadingView();
  currentReadingEntry=crypto.randomUUID();
  history.pushState({parallensReadingEntry:currentReadingEntry},'',href);
}
function restoreReadingView(view) {
  const revision=++readingRevision,entry=currentReadingEntry;
  pendingReadingRestore={revision,entry};
  const current=()=>revision===readingRevision&&entry===currentReadingEntry&&view.hash===location.hash;
  const disclosures=new Map(view.disclosures),legends=new Map(view.legends),structures=new Map(view.structures??[]);
  const apply=()=>{
    for(const [node,key] of readingControls()) {
      if(disclosures.has(key)&&node.open!==disclosures.get(key))node.open=disclosures.get(key);
    }
    for(const [node,key] of readingControls('.structure-tabs')) {
      const buttons=[...node.querySelectorAll('[role=tab]')],index=structures.get(key);
      if(Number.isInteger(index)&&buttons[index]&&buttons[index].getAttribute('aria-selected')!=='true')buttons[index].click();
    }
    for(const [node,key] of readingControls('.chart-legend')) {
      const selected=new Map(legends.get(key));
      for(const button of node.querySelectorAll('button')) {
        if(selected.has(button.textContent)&&button.getAttribute('aria-pressed')!==selected.get(button.textContent))button.click();
      }
    }
  };
  apply();
  // Disclosure toggles can lazily create nested chart tables; restore them before positioning.
  requestAnimationFrame(()=>{
    if(!current())return;apply();
    requestAnimationFrame(()=>{
      if(!current())return;apply();
      const focus=view.focusId?document.getElementById(view.focusId):null;
      (focus??main).focus({preventScroll:true});scrollTo({left:view.left,top:view.top,behavior:'instant'});
      pendingReadingRestore=null;
      updateScrollableTables();updateSectionNavigation();
    });
  });
}
function changeFilter(page,key,value) {
  const previousBar=document.querySelector('.filter-bar');
  if(previousBar)filterDisclosure.set(page,previousBar.open);
  const overviewRequest=isTopicOverviewRequest();
  const currentMetric=Number(new URLSearchParams(location.hash.split('?')[1]??'').get('metric'))||null;
  const params=new URLSearchParams(location.hash.split('?')[1]??'');
  const previousErrors=new Set(filterErrors.map(error=>error.key));
  if(!key){for(const field of relevantFilters(page))params.delete(field);params.delete('userCohortType');params.delete('userCohort');userCohortTypeRequest=[];userCohortRequest=[];params.delete('riskSnapshot');riskSnapshotRequest=[];params.delete('unbindingMonth');unbindingMonthRequest=[];params.delete('renewalMonth');renewalMonthRequest=[];params.delete('retentionMonth');retentionMonthRequest=[];params.delete('activationCohort');deviceRetentionCohortRequest=[];params.delete('activationWeek');activationWeekRequest=[];}
  else if(value==='All')params.delete(key);
  else params.set(key,value);
  readFilters(page,params);
  if(key==='productLine') {
    for(const dependent of ['plan','deviceModel'])if(filterState[dependent]&&
      !previousErrors.has(dependent)&&!availableOptions(page,dependent).includes(filterState[dependent]))params.delete(dependent);
    readFilters(page,params);
  }
  const next=overviewRequest?topicOverviewHref(page):routeHref(page,currentMetric,diagnosticWorkspaceView==='change'?undefined:diagnosticWorkspaceView);
  pushRoute(next);
  renderRoute({preserveScroll:true});
  const nextBar=document.querySelector('.filter-bar');
  const nextControl=nextBar?.querySelector(key?`select[name="${key}"]`:'.filter-reset');
  (nextControl??nextBar?.querySelector('summary'))?.focus({preventScroll:true});
  document.querySelector('#announcement').textContent=filterErrors.length?'仍有无效筛选条件，经营数据暂停展示。':`筛选已更新：${activeFilterDescription()||'已重置'}`;
}
const na=reason=>({kind:'na',reason});
const pending=reason=>({kind:'na',availability:'pending',reason});
const contractFor=id=>sourceData.contract.find(item=>item.id===id);
const metricEntityLabel=entity=>({
  '用户Cohort':'新注册用户批次','试用Cohort':'试用用户批次','Eligible用户Cohort':'符合条件的主账号批次',
  'Owner用户':'主账号','设备Cohort':'新激活设备批次','Session':'会话',
})[entity]??entity;
const policyFor=id=>sourceData.filterPolicy.metrics.find(item=>item.id===id);
const effectiveFor=(id,state=filterState)=>Object.entries(state).filter(([key,value])=>
  value&&value!=='All'&&(id===17?policyFor(id).rateDimensions:policyFor(id).businessDimensions).includes(key));
function metricFilterContext(id) {
  const applied=effectiveFor(id),composition=id===17?selectedFilters().filter(([key])=>trialOpeningCompositionKeys.includes(key)):[];
  const ignored=selectedFilters().filter(([key])=>!policyFor(id).businessDimensions.includes(key));
  return {applied,composition,ignored,ignoredText:ignored.map(([key,value])=>`${filterLabels[key]} ${optionLabel(key,value)}`).join('、')};
}

const trialState=(state=filterState)=>Object.fromEntries(effectiveFor(18,state));
function deviceEventMetric(state=filterState,weekNumber=state.week??sourceData.weekly.at(-1).week,group='all') {
  const scoped=Object.fromEntries(effectiveFor(42,state));
  if(scoped.productLine==='Hunting'||scoped.deviceModel==='Hunt Pro')return na('空触发率仅定义观鸟线，狩猎线不适用');
  if(scoped.deviceStatus==='Inactive')return na('非有效设备不属于触发事件分母');
  const missing=Object.keys(scoped).find(key=>!['week','productLine','deviceModel','firmware','deviceStatus'].includes(key));
  if(missing)return pending(`${filterLabels[missing]}适用，但合成触发数据缺少该维度明细`);
  const rows=sourceData.weekly.find(week=>String(week.week)===String(weekNumber))?.deviceEventsBird.records;
  if(!rows)return pending('指定周缺少合成触发事件明细');
  const selected=rows.filter(row=>(!scoped.deviceModel||row.model===scoped.deviceModel)&&
    (!scoped.firmware||row.firmware===scoped.firmware)&&
    (group==='all'||(group==='k6Firmware28')===(row.model==='K6'&&row.firmware==='2.8')));
  if(!selected.length)return na('该型号与固件组合没有观鸟触发样本');
  const denominator=selected.reduce((sum,row)=>sum+row.triggers,0),numerator=selected.reduce((sum,row)=>sum+row.empty,0);
  return denominator>=30?{kind:'rate',numerator,denominator,value:numerator/denominator}:na('筛选后触发样本少于30');
}
function deviceEventContributionTable() {
  const rows=[];
  for(const [group,label] of [['k6Firmware28','K6 固件2.8'],['others','其他设备'],['all','整体']]) {
    for(const [start,end] of [[0,8],[8,12]]) {
      const values=sourceData.weekly.slice(start,end).map(week=>deviceEventMetric({},week.week,group));
      const n=values.reduce((sum,value)=>sum+value.numerator,0),d=values.reduce((sum,value)=>sum+value.denominator,0);
      rows.push([`W${start+1}–W${end} · ${label}`,n,d,percent(n/d)]);
    }
  }
  return {title:'空触发异常贡献',columns:['周期 / 分组','空触发（次）','触发（次）','合并空触发率'],rows,
    note:'各周期汇总合成事件计数再计算比例。总体42%→58%；K6固件2.8每周增加1,600次空触发，占总体每周10,000次触发的16个百分点。其他型号拆分为构造样本，不作因果归因。'};
}
function deviceEventGroupChanges(comparison=weeklyRateComparison(42)) {
  const overview=homeProjection();if(overview)return overview.deviceChanges;
  if(!comparison)return {reason:filterState.week==='1'?'所选W1没有前一完整周，暂不生成分组变化贡献。':'当前范围缺少两期可比触发计数，暂不生成分组变化贡献。'};
  const scoped=Object.fromEntries(effectiveFor(42));
  const index=comparison.selectedWeek?sourceData.weekly.findIndex(w=>w.week===comparison.selectedWeek):-1;
  const periods=comparison.selectedWeek?[[sourceData.weekly[index-1]],[sourceData.weekly[index]]]:
    [sourceData.weekly.slice(0,comparison.split),sourceData.weekly.slice(comparison.split)];
  const periodRows=periods.map(weeks=>weeks.flatMap(w=>w.deviceEventsBird.records).filter(row=>
    (!scoped.deviceModel||row.model===scoped.deviceModel)&&(!scoped.firmware||row.firmware===scoped.firmware)));
  const aggregate=rows=>{
    const numerator=rows.reduce((sum,row)=>sum+row.empty,0),denominator=rows.reduce((sum,row)=>sum+row.triggers,0);
    return {numerator,denominator,value:denominator?numerator/denominator:null};
  };
  const overall=periodRows.map(aggregate);
  if(overall.some((part,i)=>part.numerator!==[comparison.before,comparison.after][i].numerator||
    part.denominator!==[comparison.before,comparison.after][i].denominator))
    return {reason:'分组计数与两期总体不闭合，暂停展示变化贡献，请先核对来源。'};
  const target=row=>row.model==='K6'&&row.firmware==='2.8';
  const groups=[['K6 · 固件2.8',target],['其他型号／固件',row=>!target(row)]]
    .map(([name,matches])=>({name,summaries:periodRows.map(rows=>aggregate(rows.filter(matches)))}))
    .filter(group=>group.summaries.some(part=>part.denominator>0));
  if(!groups.length||groups.some(group=>group.summaries.some(part=>part.denominator<30)))
    return {reason:'部分互斥分组在前期或近期的触发样本少于30次，暂不生成变化贡献；总体比较仍可核对。'};
  const changes=groups.map(group=>(group.summaries[1].numerator/overall[1].denominator-
    group.summaries[0].numerator/overall[0].denominator)*100);
  const effects=groups.map(group=>{
    const rates=group.summaries.map(part=>part.value),weights=group.summaries.map((part,i)=>part.denominator/overall[i].denominator);
    return {rates,weights,within:(weights[0]+weights[1])/2*(rates[1]-rates[0])*100,
      composition:(rates[0]+rates[1])/2*(weights[1]-weights[0])*100};
  });
  return {comparison,overall,groups,changes,effects};
}
function deviceEventChangeSpec(parts) {
  const {comparison,groups,changes}=parts,low=Math.min(0,...changes),high=Math.max(0,...changes),span=high-low||1;
  const interval=chartNiceStep(span/4),rounded=value=>Number(value.toPrecision(12));
  return {title:'空触发率变化 · 互斥分组贡献',comparisonGroup:'device-periods',unit:'个百分点',adverseWhenHigh:true,
    labels:groups.map(group=>group.name),labelRotation:0,
    series:[{name:'对总体变化的贡献',values:changes}],
    minY:low<0?rounded(Math.floor((low-span*.1)/interval)*interval):0,
    maxY:high>0?rounded(Math.ceil((high+span*.1)/interval)*interval):high===low?1:0,intervalY:interval,
    scopeNote:`${comparison.beforeWindow} → ${comparison.afterWindow}。合并空触发率 ${comparison.beforeRate.toFixed(1)}% → ${comparison.afterRate.toFixed(1)}%。`,
    note:`贡献＝近期该组空触发数÷近期总体触发数−前期该组空触发数÷前期总体触发数。两组互斥，合计 ${chartValue(comparison.delta,'个百分点')}；pp＝百分点，纵轴含0。合成事件计数的算术分解，不证明固件导致异常。`};
}
function homeDeviceClue() {
  const disclosure=element('details','home-device-clue');disclosure.id='home-device-clue';
  const measure=metric(42),comparison=weeklyRateComparison(42),context=metricFilterContext(42);
  const summary=element('summary','',`设备线索 · 空触发${comparison?
    ` ${comparison.beforeRate.toFixed(1)}% → ${comparison.afterRate.toFixed(1)}%`:
    ` · ${measure.kind==='na'?(measure.availability==='pending'?'待补数据':measure.availability==='invalid-filter'?'筛选无效':'不适用'):'暂无可比数据'}`}`);
  disclosure.append(summary);
  if(comparison) {
    const count=part=>`${part.numerator.toLocaleString('zh-CN')}／${part.denominator.toLocaleString('zh-CN')} 次`;
    disclosure.append(element('p','device-clue-periods',`${comparison.beforeLabel} ${comparison.beforeWindow}（${count(comparison.before)}） → ${comparison.afterLabel} ${comparison.afterWindow}（${count(comparison.after)}）。计数为「空触发／触发」，比例按各期合并计数计算。`));
    const parts=deviceEventGroupChanges(comparison);
    disclosure.append(element('p','device-clue-contributions',parts.reason??
      `${parts.groups.map((group,index)=>`${group.name}贡献 ${chartValue(parts.changes[index],'个百分点')}`).join('；')}。`));
  } else disclosure.append(element('p','device-clue-unavailable',measure.reason??'当前范围缺少两期可比触发计数，暂不展示变化及分组贡献。'));
  if(context.ignored.length) {
    const scope=context.applied.length?
      `${measure.kind==='na'?'本项条件':'本项应用'}：${context.applied.map(([key,value])=>`${filterLabels[key]} ${optionLabel(key,value)}`).join('、')}`:'本项仍为总体范围';
    disclosure.append(element('p','metric-filter-scope',`${scope}；未应用：${context.ignoredText}`));
  }
  disclosure.append(element('p','device-clue-guardrail','独立设备线索，来源为合成触发事件；不与用户过程率排序，也不证明设备导致激活或转正变化。'));
  const link=element('a','insight-link','核对设备分组变化证据 ↗');link.href=routeHref('C',42,'groups');
  disclosure.append(link);return disclosure;
}
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
  if(id===42) return deviceEventMetric({},w.week);
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
  // Effective is already the default population and carries no allocation weight.
  // Remove that neutral condition before choosing single-dimension apportionment.
  const weighted=filters.filter(([key,value])=>key!=='deviceStatus'||value!=='Effective');
  const dimensions=weighted.some(([key])=>key==='deviceModel')?
    weighted.filter(([key])=>key!=='productLine'):weighted;
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
function technicalRequestSource(id) {
  return effectiveFor(id).some(([key])=>!['productLine','deviceModel','firmware','functionType'].includes(key))?
    '合成请求明细与模拟分片估算':'型号×固件合成请求明细';
}
const technicalChains={upload:'uploadFailures',live:'liveFailures',push:'pushFailures'};
function technicalRowsProblem(rows,fields) {
  const keys=new Set();
  if(!Array.isArray(rows)||rows.length!==8)return '请求分组缺行，需补齐四型号×两固件的互斥计数';
  for(const row of rows) {
    if(!row||!['K6','Bird Lite','Bird Pro','Hunt Pro'].includes(row.model)||!['2.8','Other'].includes(row.firmware)||
      keys.has(`${row.model}:${row.firmware}`)||!Number.isSafeInteger(row.attempts)||row.attempts<0||
      fields.some(field=>!Number.isSafeInteger(row[field])||row[field]<0||row[field]>row.attempts))return '请求计数、失败次数、型号／固件归属或唯一性待核验';
    keys.add(`${row.model}:${row.firmware}`);
  }
  return null;
}
function technicalCurrentSource(id=46) {
  const source=sourceData.technicalFacts,fields=id===45?['networkFailures']:Object.values(technicalChains),problem=technicalRowsProblem(source?.records,fields);
  if(problem)return {reason:problem};
  if(source.asOf!==sourceData.snapshot.asOf)return {reason:'请求快照日期与看板不一致，不能借用旧值'};
  const total=source.records.reduce((n,r)=>n+r.attempts,0),raw=sourceData.metrics[id===45?'m45':'m46'];
  const components=id===45?{networkSuccess:'networkFailures'}:technicalChains;
  if(!Number.isSafeInteger(total)||raw?.kind!=='group'||Object.entries(components).some(([name,field])=>{
    const part=raw.value?.[name],failed=source.records.reduce((n,r)=>n+r[field],0);
    return part?.kind!=='rate'||part.denominator!==total||part.numerator!==total-failed;
  }))return {reason:'请求分组与当前成功／分母锚点不闭合，暂停相关成功率'};
  return {rows:source.records};
}
function technicalCounts(rows,state=filterState,id=46) {
  const filters=effectiveFor(id,state);
  if(filters.some(([key])=>!policyFor(id).demonstrableDimensions.includes(key)))return {reason:'当前条件缺少同范围请求归属明细'};
  if(state.deviceStatus==='Inactive')return {reason:'非有效设备不属于当前请求统计对象'};
  const records=rows.filter(row=>(!state.productLine||(row.model==='Hunt Pro'?'Hunting':'Bird')===state.productLine)&&
    (!state.deviceModel||row.model===state.deviceModel)&&(!state.firmware||row.firmware===state.firmware));
  if(!records.length)return {reason:'该型号与固件组合没有合成请求样本'};
  const other=filters.filter(([key])=>!['productLine','deviceModel','firmware','functionType','week'].includes(key));
  const shares=sharesFor(other,id),denominator=allocatedCount(records.reduce((n,r)=>n+r.attempts,0),other,id,'denominator',shares);
  const fields=id===45?{networkSuccess:'networkFailures'}:technicalChains,counts={};
  for(const [name,field] of Object.entries(fields)) {
    const failed=allocatedCount(records.reduce((n,r)=>n+r[field],0),other,id,'numerator',shares);
    if(!Number.isSafeInteger(denominator)||!Number.isSafeInteger(failed)||failed<0||failed>denominator)return {reason:'筛后失败次数超过请求分母，不能截断为零成功率'};
    counts[name]={numerator:denominator-failed,denominator,failed};
  }
  return {counts};
}
function technicalHistoryProjection(state=filterState) {
  const current=technicalCurrentSource();if(current.reason)return current;
  const source=sourceData.technicalFacts,history=source.dailyHistory,bad=()=>({reason:'30日请求历史缺失、日期不连续或与当前锚点不闭合；保留可靠的最近24小时结果'});
  if(history?.version!=='synthetic-technical-days-v1'||history.endExclusive!==`${source.asOf}T00:00:00Z`||
    history.provenance!=='constructed-simulation-preserving-current-anchor'||!Array.isArray(history.rows)||history.rows.length!==30)return bad();
  const end=Date.parse(history.endExclusive);if(!Number.isFinite(end))return bad();
  const rows=[];
  for(const [i,row] of history.rows.entries()) {
    if(!row||row.date!==new Date(end-(30-i)*86400000).toISOString().slice(0,10)||technicalRowsProblem(row.records,Object.values(technicalChains)))return bad();
    const part=technicalCounts(row.records,state);if(part.reason)return part;
    rows.push({date:row.date,...part});
  }
  const latest=new Map(history.rows.at(-1).records.map(r=>[`${r.model}:${r.firmware}`,r]));
  if(current.rows.some(row=>{const last=latest.get(`${row.model}:${row.firmware}`);return ['attempts',...Object.values(technicalChains)].some(field=>last?.[field]!==row[field]);}))return bad();
  const selected={Upload:'upload',Live:'live',Push:'push'}[state.functionType],names=selected?[selected]:Object.keys(technicalChains);
  if(state.functionType&&!selected)return {reason:'该功能不属于上传／直播／推送技术链路'};
  const aggregate=days=>Object.fromEntries(names.map(name=>[name,rows.slice(-days).reduce((sum,row)=>({
    numerator:sum.numerator+row.counts[name].numerator,denominator:sum.denominator+row.counts[name].denominator,failed:sum.failed+row.counts[name].failed}),{numerator:0,denominator:0,failed:0})]));
  return {rows,names,endExclusive:history.endExclusive,day:aggregate(1),week:aggregate(7),note:history.note};
}
function technicalHistoryHeadline(state=filterState) {
  const part=technicalHistoryProjection(state);if(part.reason)return null;
  const details=part.rows.map(row=>{
    const rates=part.names.map(name=>({name,...row.counts[name]}));
    if(rates.some(r=>r.denominator<30))return null;
    const value=rates.reduce((a,b)=>a.numerator/a.denominator<=b.numerator/b.denominator?a:b);
    return {...value,value:value.numerator/value.denominator,basisLabel:`${groupLabels[value.name]}成功 / 该链路请求`,numeratorUnit:'次',denominatorUnit:'次'};
  });
  return {labels:part.rows.map(r=>r.date),values:details.map(d=>d?d.value*100:null),details,unit:'%',comparisonLabel:'较前24小时',
    title:part.names.length===1?`${groupLabels[part.names[0]]}成功率`:'三链路最低成功率',
    note:`30个完整UTC日，截至${part.endExclusive.replace('T',' ').replace('Z',' UTC')}。${part.names.length===1?'仅当前所选链路。':'各日取三链路中最低成功率，最低项可能变化，不代表同一功能的连续率。'}各链路分母独立；新增合成历史，非生产日志。`};
}
function technicalHistoryEvidence(panel,appendEvidencePair) {
  const part=technicalHistoryProjection();
  if(part.reason){const note=element('p','na-note technical-history-unavailable',part.reason);note.dataset.evidenceKind='change';panel.append(note);return;}
  const format=r=>r.denominator>=30?percent(r.numerator/r.denominator):r.denominator?'样本不足30次':'无合格分母';
  const end=part.endExclusive.slice(0,10),start=days=>new Date(Date.parse(part.endExclusive)-days*86400000).toISOString().slice(0,10);
  const summary=dataTable({title:'最近24小时与7天 · 同源请求核对',columns:['链路','24小时成功／请求（次）','24小时成功率','7天成功／请求（次）','7天成功率'],
    rows:part.names.map(name=>[groupLabels[name],`${number(part.day[name].numerator)} / ${number(part.day[name].denominator)}`,format(part.day[name]),`${number(part.week[name].numerator)} / ${number(part.week[name].denominator)}`,format(part.week[name])]),
    note:`UTC起含止不含：最近24小时 ${start(1)} → ${end}；最近7天 ${start(7)} → ${end}。7天按成功总数÷请求总数计算，不平均日率；各链路请求不可相加，也不等于影响设备数。生产目标线、错误码与逐请求来源待补。`},'technical-window-summary');
  summary.dataset.evidenceKind='change';panel.append(summary);
  const spec={title:'上传／直播／推送成功率 · 30个完整日',unit:'%',nearestLinePoint:true,labels:part.rows.map(r=>r.date),
    series:part.names.map(name=>({name:`${groupLabels[name]}成功率`,values:part.rows.map(r=>r.counts[name].denominator>=30?r.counts[name].numerator/r.counts[name].denominator*100:null),
      details:part.rows.map(r=>({...r.counts[name],numeratorUnit:'次',denominatorUnit:'次'}))})),note:`${technicalRequestSource(46)}；30个完整UTC日，末日 ${start(1)} → ${end}，不含逐请求或设备身份；${part.note}`};
  const table={title:'30日技术链路 · 成功／请求完整计数',columns:['UTC自然日',...part.names.flatMap(name=>[`${groupLabels[name]}成功（次）`,`${groupLabels[name]}请求（次）`,`${groupLabels[name]}成功率`])],
    rows:part.rows.map(row=>[row.date,...part.names.flatMap(name=>[row.counts[name].numerator,row.counts[name].denominator,format(row.counts[name])])]),note:spec.note};
  appendEvidencePair(spec,table,'change');
}

function technicalMetric(id,state,filters) {
  const source=technicalCurrentSource(id);if(source.reason)return pending(source.reason);
  const part=technicalCounts(source.rows,state,id);if(part.reason)return pending(part.reason);
  const values=Object.values(part.counts);if(values.some(r=>r.denominator<30))return na(values[0].denominator?'筛选后请求样本少于30':'当前没有合格请求分母');
  const rateFor=name=>{const r=part.counts[name];return {kind:'rate',numerator:r.numerator,denominator:r.denominator,value:r.numerator/r.denominator};};
  if(id===45) {
    const heartbeats=sourceData.metrics.m45.value.reportedWithin24h,all=filters.filter(([key])=>key!=='week');
    return {kind:'group',value:{networkSuccess:rateFor('networkSuccess'),reportedWithin24h:allocatedCount(heartbeats,all,id,'denominator',sharesFor(all,id))}};
  }
  const field={Upload:'upload',Live:'live',Push:'push'}[state.functionType],names=field?[field]:Object.keys(technicalChains);
  return {kind:'group',value:Object.fromEntries(names.map(name=>[name,rateFor(name)]))};
}
const activityCombinations=[
  {key:'appOnly',label:'仅App',sources:['app']},
  {key:'contentOnly',label:'仅内容',sources:['content']},
  {key:'pushOnly',label:'仅推送',sources:['pushClicked']},
  {key:'appContentOnly',label:'App＋\n内容',sources:['app','content']},
  {key:'appPushOnly',label:'App＋\n推送',sources:['app','pushClicked']},
  {key:'contentPushOnly',label:'内容＋\n推送',sources:['content','pushClicked']},
  {key:'allThree',label:'三者\n都有',sources:['app','content','pushClicked']},
];
// #17: cohort conversion and attributes of starters have different populations.
const trialOpeningCompositionKeys=['productLine','plan','billingCycle','subscriptionPlatform'];
const trialOpeningIndexes=new WeakMap();
function trialOpeningRegistrationCounts() {
  const reg=sourceData.diagnostics?.A?.registrationFacts;
  if(!reg)return sourceData.registrationCohortCounts;
  if(reg.version!=='synthetic-registration-cohorts-v1'||reg.status!=='approved-synthetic'||!Array.isArray(reg.cohorts)||reg.cohorts.length!==12||reg.cohorts.some(c=>!c||!Array.isArray(c.records)||c.records.length!==48||
    c.records.some(r=>!r||!['US','UK','DE','Other'].includes(r.country)||!['iOS','Android'].includes(r.appPlatform)||!['Bird','Hunting'].includes(r.productLine)||!['Demo 1.1.0','Demo 1.2.0','Demo 1.3.0'].includes(r.registrationAppVersion)||!Number.isSafeInteger(r.registered)||r.registered<0)||
    new Set(c.records.map(r=>[r.country,r.appPlatform,r.productLine,r.registrationAppVersion].join('|'))).size!==48))return null;
  return {version:reg.version,asOf:reg.asOf,cohorts:reg.cohorts.map(c=>({week:c.week,start:c.start,end:c.end,observationThrough:c.observed7Through,
    groups:['US','UK','DE','Other'].flatMap(country=>['iOS','Android'].map(appPlatform=>({country,appPlatform,registered:c.records.filter(r=>r.country===country&&r.appPlatform===appPlatform).reduce((n,r)=>n+r.registered,0)})))}))};
}
function trialOpeningIndex() {
  const source=sourceData.diagnostics?.D?.trialOpeningFacts,reference=trialOpeningRegistrationCounts();
  const bad=()=>({reason:'试用开启频数、注册分母、7天观察窗或开启构成不一致；待核验，不回退到旧分片。'});
  if(!source||typeof source!=='object'||!reference)return bad();
  // A loaded registration source may change independently during backfill checks.
  const cached=trialOpeningIndexes.get(source),signature=JSON.stringify(reference);if(cached?.signature===signature)return cached.index;
  const verify=()=>{
    const whole=n=>Number.isSafeInteger(n)&&n>=0,date=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
    if(source.version!=='synthetic-trial-opening-v1'||source.status!=='approved-synthetic'||source.classification!=='entirely_synthetic'||source.timezone!=='UTC'||source.asOf!==sourceData.snapshot.asOf||reference.asOf!==source.asOf||reference.version!==source.registrationSource||!Array.isArray(source.cohorts)||source.cohorts.length!==12||!Array.isArray(reference.cohorts)||reference.cohorts.length!==12||
      JSON.stringify(source.rateDimensions)!==JSON.stringify(['country','appPlatform','week'])||JSON.stringify(source.compositionOnlyDimensions)!==JSON.stringify(trialOpeningCompositionKeys))return bad();
    const keys=['US','UK','DE','Other'].flatMap(country=>['iOS','Android'].map(app=>`${country}|${app}`));
    for(const [i,c]of source.cohorts.entries()) {
      const original=sourceData.weekly[i],ref=reference.cohorts[i];
      if(!c||!ref||c.week!==original.week||c.week!==ref.week||c.start!==ref.start||c.end!==ref.end||c.observationThrough!==ref.observationThrough||!date(c.start)||!date(c.end)||!date(c.observationThrough)||new Date(c.start).getUTCDay()!==1||Date.parse(c.end)-Date.parse(c.start)!==6*86400000||Date.parse(c.observationThrough)-Date.parse(c.end)!==7*86400000||c.observationThrough>source.asOf||!Array.isArray(c.groups)||c.groups.length!==8||!Array.isArray(ref.groups)||ref.groups.length!==8)return bad();
      for(const[j,r]of c.groups.entries()) {
        if(!r||`${r.country}|${r.appPlatform}`!==keys[j]||`${ref.groups[j]?.country}|${ref.groups[j]?.appPlatform}`!==keys[j]||!whole(r.registered)||r.registered!==ref.groups[j].registered||!whole(r.trialStarted7d)||r.trialStarted7d>r.registered||!whole(r.notStarted7d)||r.trialStarted7d+r.notStarted7d!==r.registered||!Array.isArray(r.openings)||!Array.isArray(r.firstOpeningLagHourCounts))return bad();
        const seen=new Set();let count=0,previous=-1,lagCount=0;
        for(const cell of r.firstOpeningLagHourCounts){if(!Array.isArray(cell)||cell.length!==2||!Number.isInteger(cell[0])||cell[0]<0||cell[0]>=168||cell[0]<=previous||!whole(cell[1]))return bad();previous=cell[0];lagCount+=cell[1];}
        if(lagCount!==r.trialStarted7d)return bad();
        for(const o of r.openings){const key=trialOpeningCompositionKeys.map(k=>o?.[k]).join('|');if(!o||seen.has(key)||!whole(o.count)||!o.count||!['Bird','Hunting'].includes(o.productLine)||!(o.productLine==='Bird'?['Plus','Pro']:['Starter','Plus','Pro']).includes(o.plan)||!['monthly','annual'].includes(o.billingCycle)||!(r.appPlatform==='iOS'?['App Store','Web']:['Google Play','Web']).includes(o.subscriptionPlatform))return bad();seen.add(key);count+=o.count;}
        if(count!==r.trialStarted7d)return bad();
      }
      if(c.registered!==original.registrationCohort.registered||c.trialStarted7d!==original.registrationCohort.trialStarted7d||c.groups.reduce((n,r)=>n+r.registered,0)!==c.registered||c.groups.reduce((n,r)=>n+r.trialStarted7d,0)!==c.trialStarted7d)return bad();
    }
    const last=source.cohorts.at(-1),raw=sourceData.metrics.m17;
    if(raw.kind!=='rate'||raw.numerator!==last.trialStarted7d||raw.denominator!==last.registered)return bad();
    return {source,rows:source.cohorts};
  };
  const index=verify();trialOpeningIndexes.set(source,{signature,index});return index;
}
function trialOpeningProjection(state=filterState) {
  const index=trialOpeningIndex();if(index.reason)return index;
  const filters=effectiveFor(17,state).filter(([key])=>key!=='week'),week=Number(state.week??index.rows.at(-1).week);
  const rows=index.rows.map(c=>{const groups=c.groups.filter(r=>filters.every(([key,value])=>r[key]===value));return {...c,groups,registered:groups.reduce((n,r)=>n+r.registered,0),trialStarted7d:groups.reduce((n,r)=>n+r.trialStarted7d,0)};});
  const current=rows.find(c=>c.week===week);return current?{source:index.source,rows,current,previous:rows[rows.indexOf(current)-1]??null}:{reason:'注册周无效，未回退到默认批次。'};
}
function trialOpeningMetric(state=filterState) {const p=trialOpeningProjection(state);if(p.reason)return pending(p.reason);const c=p.current;return c.registered<30?{...na(c.registered?'同批注册人数少于30，保留计数，不展示可靠开启率':'同批无注册用户，保留0计数，不补0%'),numerator:c.trialStarted7d,denominator:c.registered}:{kind:'rate',numerator:c.trialStarted7d,denominator:c.registered,value:c.trialStarted7d/c.registered};}
function trialOpeningHistory(){const p=trialOpeningProjection();return p.reason?null:{title:'注册后7天试用开启率',unit:'%',labels:p.rows.map(c=>'W'+c.week),values:p.rows.map(c=>c.registered>=30?c.trialStarted7d/c.registered*100:null),details:p.rows.map(c=>({numerator:c.trialStarted7d,denominator:c.registered,basisLabel:`${c.start}—${c.end} 7天开启 / 同批注册`,numeratorUnit:'人',denominatorUnit:'人'})),selectedPeriod:'W'+p.current.week,note:trialOpeningNote};}
const trialOpeningNote='同一注册批次、国家×注册App合成频数；首次试用延时0≤小时数<168，每人最多计一次。产品线、套餐、周期和订阅平台仅为已开启者属性，不为未开启者构造分母。与#18到期试用批次不同，不做用户身份关联。';
function trialOpeningComposition(state=filterState,cohort=trialOpeningProjection(state).current) {
  if(!cohort)return {reason:'开启构成来源不可用。'};
  const filters=trialOpeningCompositionKeys.filter(key=>state[key]&&state[key]!=='All').map(key=>[key,state[key]]);
  const all=cohort.groups.flatMap(r=>r.openings),rows=all.filter(r=>filters.every(([key,value])=>r[key]===value));
  const grouped=new Map();for(const r of rows){const key=trialOpeningCompositionKeys.map(k=>r[k]).join('|');const prior=grouped.get(key);if(prior)prior.count+=r.count;else grouped.set(key,{...r});}
  return {rows:[...grouped.values()].sort((a,b)=>trialOpeningCompositionKeys.map(k=>a[k]).join('|').localeCompare(trialOpeningCompositionKeys.map(k=>b[k]).join('|'))),count:rows.reduce((n,r)=>n+r.count,0),total:cohort.trialStarted7d,filters};
}
function trialOpeningWindow(){const p=trialOpeningProjection();return p.reason?'当前范围暂无可用基线周期':`试用开启观察期末 ${p.current.observationThrough} · 注册批次 W${p.current.week} · ${p.current.start}—${p.current.end}`;}
function trialOpeningBaseline(){const p=trialOpeningProjection();return '试用开启证据v1：'+JSON.stringify({source:p.source.version,asOf:p.source.asOf,rateFilters:effectiveFor(17),compositionFilters:trialOpeningComposition().filters,current:p.current,previous:p.previous});}
function trialOpeningBaselineDetails(value) {
  const box=element('details','trial-opening-baseline-details');box.append(element('summary','','查看首次保存的注册批次与开启计数'));
  try{const p=JSON.parse(value.slice('试用开启证据v1：'.length));box.append(dataTable({title:'首次保存 · 两期试用开启',columns:['用途','注册批次','同批注册','7天开启','观察至UTC'],rows:[['当前',p.current],['上一期',p.previous]].filter(([,c])=>c).map(([label,c])=>[label,`W${c.week} · ${c.start}—${c.end}`,c.registered,c.trialStarted7d,c.observationThrough]),note:trialOpeningNote}));
    const state=Object.fromEntries(p.compositionFilters??[]);
    box.append(element('p','table-note',`首次保存的开启构成条件：${(p.compositionFilters??[]).map(([key,value])=>`${filterLabels[key]} ${optionLabel(key,value)}`).join('、')||'全部开启方案'}；不作为总体开启率分母。`));
    for(const [label,c]of [['当前',p.current],['上一期',p.previous]])if(c){const part=trialOpeningComposition(state,c),detail=element('details','trial-opening-saved-period');detail.append(element('summary','',`${label} W${c.week} · 查看首次保存的分组与开启构成`),dataTable({title:'首次保存 · 同批注册分组',columns:['国家','注册App','同批注册','7天开启'],rows:c.groups.map(r=>[optionLabel('country',r.country),r.appPlatform,r.registered,r.trialStarted7d]),note:trialOpeningNote}),dataTable({title:'首次保存 · 匹配的开启方案',columns:['产品线','首次套餐','周期','订阅平台','人数'],rows:part.rows.map(r=>[optionLabel('productLine',r.productLine),r.plan,optionLabel('billingCycle',r.billingCycle),r.subscriptionPlatform,r.count]),note:`匹配 ${number(part.count)} / ${number(part.total)} 名已开启者。` }));box.append(detail);}
  }
  catch{box.append(element('p','table-note','首次保存的证据格式待核对；保留原文，不使用当前数据补写。'));}return box;
}
function trialOpeningHistoryTable(p=trialOpeningProjection()){return {title:'注册批次 · 12周开启计数',columns:['注册批次','同批注册（人）','7天开启（人）','未开启（人）','开启率','7天观察至UTC'],rows:p.rows.map(c=>[`W${c.week} · ${c.start}—${c.end}`,c.registered,c.trialStarted7d,c.registered-c.trialStarted7d,c.registered>=30?percent(c.trialStarted7d/c.registered):c.registered?'样本不足':'无注册用户',c.observationThrough]),note:trialOpeningNote};}
function trialOpeningEvidence(panel,append) {
  const p=trialOpeningProjection();if(p.reason)return;const c=p.current,part=trialOpeningComposition(),history=trialOpeningHistory();
  const summary=element('p','table-note trial-opening-population',`注册批次 W${c.week} · ${c.start}—${c.end}；7天观察至 ${c.observationThrough} UTC。总体 ${number(c.trialStarted7d)} / ${number(c.registered)} 人；开启构成匹配 ${number(part.count)} / ${number(part.total)} 名已开启者。后者是构成占比，不是方案开启率。`);
  const link=element('a','insight-link','查看已开启者构成 →');link.href=routeHref('D',17,'groups');summary.append(' ',link);summary.dataset.evidenceKind='change';panel.append(summary);
  append({metricId:17,title:'注册后7天试用开启率 · 12个成熟注册批次',unit:'%',labels:history.labels,details:history.details,selectedPeriod:history.selectedPeriod,series:[{name:'试用开启率',values:history.values}],note:trialOpeningNote},trialOpeningHistoryTable(p),'change');
  const block=element('section','trial-opening-composition');block.dataset.evidenceKind='groups';block.append(element('h3','','已开启者构成 · 方案属性不作为开启率分母'));
  const controls=element('div','binding-list-controls');
  for(const key of trialOpeningCompositionKeys) {
    const label=element('label','',`${filterLabels[key]}（仅#17开启构成）`),select=element('select','');select.dataset.compositionDimension=key;select.setAttribute('aria-label',`${filterLabels[key]}（仅#17开启构成）`);
    for(const value of ['All',...availableOptions('D',key)]){const o=element('option','',value==='All'?'全部':optionLabel(key,value));o.value=value;select.append(o);}select.value=filterState[key]??'All';
    select.addEventListener('change',()=>{changeFilter('D',key,select.value);document.querySelector(`.trial-opening-composition [data-composition-dimension="${key}"]`)?.focus({preventScroll:true});});label.append(select);controls.append(label);
  }
  block.append(controls,element('p','table-note',`本组控件与页面筛选同步；仅改变#17开启构成，国家／App／注册周仍决定总体开启率。其他D页指标各按自身规则响应。当前匹配 ${number(part.count)} / ${number(part.total)} 名已开启者，不为未开启者补方案归属。`));panel.append(block);
  const plans=['Starter','Plus','Pro'],planCounts=plans.map(plan=>part.rows.filter(r=>r.plan===plan).reduce((n,r)=>n+r.count,0));
  append({metricId:17,title:'首次试用套餐 · 已开启者人数',unit:'人',labels:plans,series:[{name:'已开启者',values:planCounts}],note:'已按当前产品线、套餐、周期和订阅平台筛选。各套餐计数合计当前匹配开启者；不把人数或构成占比解释为套餐开启率。'},
    {title:'已开启者 · 套餐计数',columns:['首次套餐','匹配开启者（人）'],rows:plans.map((plan,i)=>[plan,planCounts[i]]),note:trialOpeningNote},'groups');
  const groupedTable={title:'已开启者 · 完整方案构成',columns:['产品线','首次试用套餐','计费周期','开启订阅平台','人数'],rows:part.rows.map(r=>[optionLabel('productLine',r.productLine),r.plan,optionLabel('billingCycle',r.billingCycle),r.subscriptionPlatform,r.count]),note:`匹配 ${number(part.count)} 人；该注册范围同批开启 ${number(part.total)} 人。`};
  for(const spec of [trialOpeningHistoryTable(p),{title:'当前注册批次 · 国家×App分母核对',columns:['国家','注册App','同批注册','7天开启','未开启'],rows:c.groups.map(r=>[optionLabel('country',r.country),r.appPlatform,r.registered,r.trialStarted7d,r.notStarted7d]),note:trialOpeningNote},groupedTable]){const table=dataTable(spec);table.dataset.evidenceKind='data';panel.append(table);}
  const counts=dataTable(groupedTable);counts.dataset.evidenceKind='groups';panel.append(counts);
  panel.querySelectorAll('.data-table-scroll').forEach(table=>table.classList.add('trial-opening-data'));
}

// #16 is an independent first-content ledger, not the App-bound #43 retention pool.
const activationDeviceIndexes=new WeakMap();
function activationDeviceIndex() {
  const source=sourceData.diagnostics?.A?.activationFacts;
  if(!source||typeof source!=='object')return {reason:'首次内容设备明细待补，不回退到原未注明统计期的2,450台汇总。'};
  if(activationDeviceIndexes.has(source))return activationDeviceIndexes.get(source);
  const invalid=()=>{const result={reason:'首次内容设备ID、日期、归属或周计数不一致，待核验后再展示。'};activationDeviceIndexes.set(source,result);return result;};
  const date=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if(source.version!=='synthetic-first-content-devices-v1'||source.status!=='approved-synthetic'||source.classification!=='entirely_synthetic'||source.timezone!=='UTC'||source.asOf!==sourceData.snapshot.asOf||!date(source.asOf)||source.deviceStatus!=='Effective'||
    JSON.stringify(source.columns)!==JSON.stringify(['id','firstContentDay','country','deviceModel','salesChannel'])||!Array.isArray(source.weeks)||source.weeks.length!==12||!Array.isArray(source.records)||
    Object.entries({country:['US','UK','DE','Other'],deviceModel:['K6','Bird Lite','Bird Pro','Hunt Pro'],salesChannel:['Amazon','Shopify']}).some(([key,values])=>JSON.stringify(source.codes?.[key])!==JSON.stringify(values)))return invalid();
  const day=86400000,asOf=Date.parse(source.asOf),weekday=new Date(asOf).getUTCDay(),lastEnd=asOf-(weekday||7)*day,byDate=new Map(),weeks=[];
  for(const [i,w] of source.weeks.entries()) {
    if(!w||!date(w.start)||!date(w.end)||Date.parse(w.end)!==lastEnd-(11-i)*7*day||Date.parse(w.end)-Date.parse(w.start)!==6*day||!Number.isSafeInteger(w.count)||w.count<0)return invalid();
    const week={...w,rows:[]};weeks.push(week);
    for(let d=0;d<7;d++)byDate.set(new Date(Date.parse(w.start)+d*day).toISOString().slice(0,10),week);
  }
  if(source.defaultWeek!==weeks.at(-1).start||weeks.at(-1).count!==sourceData.metrics.m16.value)return invalid();
  const seen=new Set(),rows=[];
  for(const r of source.records) {
    if(!Array.isArray(r)||r.length!==5||!Number.isSafeInteger(r[0])||r[0]<1||seen.has(r[0])||!byDate.has(r[1])||
      [2,3,4].some((j,i)=>!Number.isInteger(r[j])||!source.codes[['country','deviceModel','salesChannel'][i]][r[j]]))return invalid();
    seen.add(r[0]);const row={id:`ACT16-${String(r[0]).padStart(6,'0')}`,firstContentDay:r[1],country:source.codes.country[r[2]],deviceModel:source.codes.deviceModel[r[3]],salesChannel:source.codes.salesChannel[r[4]],deviceStatus:'Effective',productLine:r[3]===3?'Hunting':'Bird'};
    rows.push(row);byDate.get(r[1]).rows.push(row);
  }
  if(weeks.some(w=>w.rows.length!==w.count))return invalid();
  const index={source,rows,weeks,defaultWeek:source.defaultWeek};activationDeviceIndexes.set(source,index);return index;
}
function activationDeviceProjection(state=filterState) {
  const index=activationDeviceIndex();if(index.reason)return index;
  const id=activationWeekRequest.length?activationWeekRequest[0]:index.defaultWeek;
  if(activationWeekRequest.length>1||!index.weeks.some(w=>w.start===id))return {reason:'首次内容统计周无效或包含多个值；请选择一个完整周。'};
  const filters=effectiveFor(16,state),match=row=>filters.every(([key,value])=>row[key]===value);
  const weeks=index.weeks.map(w=>({...w,rows:w.rows.filter(match)})),current=weeks.find(w=>w.start===id);
  const days=Array.from({length:7},(_,i)=>{const date=new Date(Date.parse(current.start)+i*86400000).toISOString().slice(0,10);return {date,count:current.rows.filter(r=>r.firstContentDay===date).length};});
  return {weeks,current,days,id};
}
const activationDeviceNote='独立合成首次内容记录；设备在首次产出首图／首视频当天计一次，国家、型号和自报渠道按当天冻结，后续解绑不剔除。不是#43的App绑定留存入组群，不定义跨来源设备关联。';
function activationDeviceWindow() {const p=activationDeviceProjection();return p.reason?'当前范围暂无可用基线周期':`首次内容完整周v1 · ${p.current.start}—${p.current.end}（UTC）`;}
function activationDeviceHistory() {const p=activationDeviceProjection();return p.reason?null:{title:'新增激活设备',unit:'台',labels:p.weeks.map(w=>w.start),values:p.weeks.map(w=>w.rows.length),selectedPeriod:p.id,comparisonLabel:'较前完整周',nearestLinePoint:true,note:`每点为周一至周日的完整UTC周；横轴标记周起始日。${activationDeviceNote}`};}
function activationDeviceControl() {
  const wrap=element('div','retention-month-control activation-device-control'),label=element('label','','首次内容统计周（仅#16）'),select=element('select','');
  select.name='activationWeek';select.setAttribute('aria-label','首次内容统计周（仅#16）');
  const p=activationDeviceProjection(),index=activationDeviceIndex();
  if(p.reason){const option=element('option','',`待修正：${activationWeekRequest.join(' / ')||'来源待核验'}`);option.value='invalid';option.disabled=true;select.append(option);}
  for(const w of index.weeks??[]){const option=element('option','',`${w.start}—${w.end}${w.start===index.defaultWeek?' · 最近完整周':''}`);option.value=w.start;select.append(option);}
  select.value=p.reason?'invalid':p.id;
  select.addEventListener('change',()=>{
    const params=new URLSearchParams(location.hash.split('?')[1]??'');params.delete('activationWeek');if(select.value!==index.defaultWeek)params.set('activationWeek',select.value);
    pushRoute(`#/A?${params}`);renderRoute({preserveScroll:true});document.querySelector('[name="activationWeek"]')?.focus({preventScroll:true});
    document.querySelector('#announcement').textContent='首次内容统计周已更新；仅影响#16及其新登记范围，原问题单和草稿保留。';
  });
  label.append(select);wrap.append(label,element('p','table-note','按首次内容日期计数，不使用成熟统计周。原未注明统计期的2,450台不作为本场景的历史证据。'));return wrap;
}
function activationDeviceEvidence(panel,append) {
  const p=activationDeviceProjection(),history=activationDeviceHistory();if(p.reason)return;
  append({metricId:16,title:'首次内容设备 · 最近12个完整周',unit:'台',labels:history.labels,selectedPeriod:p.id,nearestLinePoint:true,series:[{name:'新增激活设备',values:history.values}],note:history.note},
    {title:'完整周计数验算',columns:['首次内容周（UTC）','新增激活设备（台）'],rows:p.weeks.map(w=>[`${w.start}—${w.end}`,number(w.rows.length)]),note:history.note},'change');
  append({metricId:16,title:'所选周 · 每日首次内容设备',unit:'台',labels:p.days.map(d=>d.date),nearestLinePoint:true,series:[{name:'首次内容设备',values:p.days.map(d=>d.count)}],note:`${p.current.start}—${p.current.end} UTC；七天互斥，合计 ${number(p.current.rows.length)} 台。`},
    {title:'日计数验算',columns:['首次内容日（UTC）','设备数（台）'],rows:p.days.map(d=>[d.date,number(d.count)]),note:'按同一份设备记录计数；每天和完整周可相加核对。'},'change');
  for(const key of ['country','deviceModel','salesChannel']) {
    const options=sourceData.filterPolicy.controls[key].options,parts=options.map(option=>({option,count:p.current.rows.filter(r=>r[key]===option).length}));
    const note=`保留当前所有条件，在当前设备集合内按${filterLabels[key]}划分；各组互斥合计 ${number(p.current.rows.length)} 台。${activationDeviceNote}`;
    append({metricId:16,title:`${filterLabels[key]} · 首次内容设备`,unit:'台',labels:parts.map(r=>optionLabel(key,r.option)),series:[{name:'设备数',values:parts.map(r=>r.count)}],note},
      {title:`${filterLabels[key]}计数验算`,columns:['分组','新增激活设备（台）'],rows:parts.map(r=>[optionLabel(key,r.option),number(r.count)]),note},'groups');
  }
  const queue=element('section','binding-device-list activation-device-list');queue.dataset.evidenceKind='data';
  queue.append(element('h3','','所选周 · 首次内容设备明细'));
  const controls=element('div','binding-list-controls'),label=element('label','','查找设备（仅清单）'),search=element('input','');search.type='search';search.setAttribute('aria-label','查找首次内容设备');label.append(search);controls.append(label);
  const status=element('p','binding-list-status');status.setAttribute('role','status');const table=element('div',''),pager=element('div','binding-list-pagination');
  let page=0;const pageSize=10;
  const render=()=>{
    const term=search.value.trim().toLocaleLowerCase(),rows=p.current.rows.filter(r=>Object.values(r).join(' ').toLocaleLowerCase().includes(term)).sort((a,b)=>a.firstContentDay.localeCompare(b.firstContentDay)||a.id.localeCompare(b.id)),pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
    status.textContent=`所选周共 ${number(p.current.rows.length)} 台 · 清单匹配 ${number(rows.length)} 台 · 第 ${page+1} / ${pages} 页`;
    table.replaceChildren(dataTable({title:'合成首次内容设备',columns:['合成设备ID','首次内容日（UTC）','国家','设备型号','自报销售渠道'],rows:rows.slice(page*pageSize,(page+1)*pageSize).map(r=>[r.id,r.firstContentDay,optionLabel('country',r.country),r.deviceModel,optionLabel('salesChannel',r.salesChannel)]),note:activationDeviceNote}));
    pager.replaceChildren();for(const [text,step] of [['上一页',-1],['下一页',1]]){const button=element('button','',text);button.type='button';button.disabled=step<0?page===0:page===pages-1;button.addEventListener('click',()=>{page+=step;render();const focus=[...pager.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled)??pager.querySelector('button:not(:disabled)');focus?.focus({preventScroll:true});});pager.append(button);}
    updateScrollableTables();
  };
  search.addEventListener('input',()=>{page=0;render();});queue.append(controls,status,table,pager);panel.append(queue);render();
}

const bindingDeviceIndexes=new WeakMap();
function bindingDeviceIndex() {
  const source=sourceData.bindingDeviceFacts;
  if(!source||typeof source!=='object')return {reason:'设备台账待补，不能用汇总数生成设备名单。'};
  if(bindingDeviceIndexes.has(source))return bindingDeviceIndexes.get(source);
  const invalid=()=>{const result={reason:'设备台账字段、时间、型号归属或快照数量不一致，待核对后再显示。'};bindingDeviceIndexes.set(source,result);return result;};
  const parse=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)&&
    Number.isFinite(Date.parse(value))&&new Date(value).toISOString().replace('.000Z','Z')===value?Date.parse(value):NaN;
  const at=parse(source.asOf),seen=new Set();
  if(source.version!=='synthetic-binding-devices-v1'||source.thresholdHours!==72||!Number.isFinite(at)||
    source.asOf.slice(0,10)!==sourceData.snapshot.asOf||!Array.isArray(source.records)||!Array.isArray(source.snapshots)||!source.snapshots.length)return invalid();
  const records=[];
  for(const row of source.records) {
    if(!row||typeof row!=='object'||Array.isArray(row))return invalid();
    const bound=parse(row.boundAt),first=row.firstImageAt===null?null:parse(row.firstImageAt);
    if(typeof row.id!=='string'||!row.id||seen.has(row.id)||!Number.isFinite(bound)||bound>at||
      first!==null&&(!Number.isFinite(first)||first<bound||first>at)||
      !sourceData.filterPolicy.controls.country.options.includes(row.country)||
      !sourceData.filterPolicy.controls.deviceModel.options.includes(row.deviceModel)||
      row.productLine!==(row.deviceModel==='Hunt Pro'?'Hunting':'Bird')||row.deviceStatus!=='Effective'||
      !['appVersion','handlingStatus','owner'].every(key=>typeof row[key]==='string'&&row[key].trim()))return invalid();
    seen.add(row.id);records.push({...row,boundMs:bound,firstImageMs:first});
  }
  let previous=-Infinity;
  const snapshots=[];
  for(const point of source.snapshots) {
    if(!point||typeof point!=='object'||Array.isArray(point))return invalid();
    const time=parse(point.at);
    if(!Number.isFinite(time)||time<=previous||time>at||!Number.isSafeInteger(point.count)||point.count<0)return invalid();
    const count=records.filter(row=>row.boundMs<time-72*3600000&&(row.firstImageMs===null||row.firstImageMs>time)).length;
    if(count!==point.count)return invalid();
    snapshots.push({...point,time});previous=time;
  }
  const legacy=sourceData.metricTrends?.m15;
  if(previous!==at||snapshots.at(-1).count!==sourceData.metrics.m15.value||snapshots.length!==legacy?.points?.length||
    snapshots.some((point,index)=>point.count!==legacy.points[index].value||
      `${new Date(point.time).getUTCMonth()+1}/${new Date(point.time).getUTCDate()}`!==legacy.labels[index]))return invalid();
  const result={records,snapshots,at,asOf:source.asOf};bindingDeviceIndexes.set(source,result);return result;
}
function bindingDeviceRows(state=filterState,time) {
  const index=bindingDeviceIndex();if(index.reason)return index;
  const at=time??index.at;
  if(!index.snapshots.some(point=>point.time===at))return {reason:'该快照没有完整设备台账，不能反推历史名单。'};
  const filters=effectiveFor(15,state);
  const rows=index.records.filter(row=>row.boundMs<at-72*3600000&&(row.firstImageMs===null||row.firstImageMs>at)&&
    filters.every(([key,value])=>row[key]===value));
  return {rows,at,asOf:new Date(at).toISOString()};
}
function bindingWaitDays(row,at=bindingDeviceIndex().at) {return Math.floor((at-row.boundMs)/86400000);}
function bindingWaitBand(row,at) {const days=bindingWaitDays(row,at);return days>=14?'14天及以上':days>=7?'7–13天':'超过3天、未满7天';}
const deviceActivityIndexes=new WeakMap();
function deviceActivityIndex() {
  const source=sourceData.deviceActivityFacts;
  const invalid=()=>({reason:'设备行为间隔事实缺失、分组不完整或与快照计数不一致；不能沿用独立分片或旧率。'});
  if(!source||typeof source!=='object')return invalid();
  if(deviceActivityIndexes.has(source))return deviceActivityIndexes.get(source);
  const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(value)&&
    Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString()===value.replace('Z','.000Z');
  if(source.version!=='synthetic-device-age-v1'||source.activeWindowDays!==30||!iso(source.asOf)||
    source.asOf.slice(0,10)!==sourceData.snapshot.asOf||JSON.stringify(source.ageBands)!=='[[0,1],[1,7],[7,21],[21,30],[30,null]]'||
    !Array.isArray(source.snapshots)||source.snapshots.length!==12)return invalid();
  const whole=value=>Number.isSafeInteger(value)&&value>=0;
  const keys=new Set(sourceData.filterPolicy.controls.country.options.flatMap(country=>
    sourceData.filterPolicy.controls.deviceModel.options.flatMap(model=>(model==='K6'?['2.8','Other']:['Other'])
      .map(firmware=>`${country}|${model}|${firmware}`))));
  const validGroups=records=>Array.isArray(records)&&records.length===keys.size&&
    new Set(records.map(row=>row&&`${row.country}|${row.deviceModel}|${row.firmware}`)).size===keys.size&&
    records.every(row=>row&&keys.has(`${row.country}|${row.deviceModel}|${row.firmware}`)&&row.deviceStatus==='Effective'&&
      row.productLine===(row.deviceModel==='Hunt Pro'?'Hunting':'Bird'));
  const snapshots=[];let previous=-Infinity;
  for(const [i,point] of source.snapshots.entries()) {
    if(!point||!iso(point.at)||!iso(point.observedFrom)||Date.parse(point.at)<=previous||Date.parse(point.at)>Date.parse(source.asOf)||
      Date.parse(point.at)-Date.parse(point.observedFrom)!==30*86400000||!whole(point.eligibleDevices)||!validGroups(point.records)||
      !point.records.every(row=>Array.isArray(row.counts)&&row.counts.length===5&&row.counts.every(whole)))return invalid();
    const bands=Array.from({length:5},(_,band)=>point.records.reduce((sum,row)=>sum+row.counts[band],0));
    const legacy=sourceData.metricTrends?.m41;
    if(!Array.isArray(legacy?.points)||legacy.points.length!==12||!Array.isArray(legacy.labels))return invalid();
    if(bands.reduce((a,b)=>a+b,0)!==point.eligibleDevices||point.eligibleDevices!==legacy?.points[i]?.denominator||
      bands.slice(0,4).reduce((a,b)=>a+b,0)!==legacy.points[i].numerator||
      `${new Date(point.at).getUTCMonth()+1}/${new Date(point.at).getUTCDate()}`!==legacy.labels[i])return invalid();
    snapshots.push({...point,time:Date.parse(point.at)});previous=Date.parse(point.at);
  }
  const last=snapshots.at(-1),bands=Array.from({length:5},(_,i)=>last.records.reduce((n,row)=>n+row.counts[i],0));
  if(last.at!==source.asOf||last.eligibleDevices!==sourceData.metrics.m41.denominator||
    bands.slice(0,4).reduce((a,b)=>a+b,0)!==sourceData.metrics.m41.numerator||
    bands[3]+bands[4]!==sourceData.metrics.m44.numerator)return invalid();
  const result={source,snapshots,validGroups,iso,whole};deviceActivityIndexes.set(source,result);return result;
}
function deviceActivitySummary(id,state=filterState,at) {
  const index=deviceActivityIndex();if(index.reason)return index;
  const point=at?index.snapshots.find(point=>point.at===at):index.snapshots.at(-1);
  if(!point)return {reason:'所选快照没有完整设备行为分层。'};
  const filters=effectiveFor(id,state).filter(([key])=>key!=='season');
  const rows=point.records.filter(row=>filters.every(([key,value])=>row[key]===value));
  const bands=Array.from({length:5},(_,i)=>rows.reduce((sum,row)=>sum+row.counts[i],0));
  const denominator=bands.reduce((a,b)=>a+b,0);
  return {bands,denominator,active1:bands[0],active7:bands[0]+bands[1],
    active30:bands.slice(0,4).reduce((a,b)=>a+b,0),unused21:bands[3]+bands[4],unused30:bands[4],at:point.at,observedFrom:point.observedFrom};
}
function deviceActivityMetric(id,state=filterState,at) {
  const part=deviceActivitySummary(id,state,at);if(part.reason)return pending(part.reason);
  if(part.denominator<30)return na(part.denominator?'可观察设备少于30台，不生成可靠比例':'当前组合没有完整可观察设备，不以0%代替');
  const thresholdDays=state.season==='Other'?30:21;
  const numerator=id===41?part.active30:part[`unused${thresholdDays}`];
  return {kind:'rate',numerator,denominator:part.denominator,value:numerator/part.denominator,
    ...(id===41?{windowDays:30}:{thresholdDays}),source:'synthetic-device-age-v1'};
}
function deviceReturnSummary(state=filterState) {
  const index=deviceActivityIndex();if(index.reason)return index;
  const threshold=state.season==='Other'?30:21;
  const points=index.source.returnCohorts?.filter(point=>point?.thresholdDays===threshold);
  const point=points?.length===1?points[0]:null;
  if(!point||point.windowDays!==7||!index.iso(point.entryAt)||!index.iso(point.observedThrough)||
    Date.parse(point.observedThrough)-Date.parse(point.entryAt)!==7*86400000||Date.parse(point.observedThrough)>Date.parse(index.source.asOf)||
    !index.validGroups(point.records)||!point.records.every(row=>index.whole(row.eligible)&&index.whole(row.returned)&&row.returned<=row.eligible)||
    !index.whole(point.eligibleDevices)||!index.whole(point.returnedDevices)||
    point.records.reduce((sum,row)=>sum+row.eligible,0)!==point.eligibleDevices||
    point.records.reduce((sum,row)=>sum+row.returned,0)!==point.returnedDevices)
    return {reason:'独立回流入组计数或完整7天观察日期待核验；不以当前未使用池替代。'};
  const filters=effectiveFor(44,state).filter(([key])=>key!=='season');
  const rows=point.records.filter(row=>filters.every(([key,value])=>row[key]===value));
  return {thresholdDays:threshold,denominator:rows.reduce((sum,row)=>sum+row.eligible,0),
    numerator:rows.reduce((sum,row)=>sum+row.returned,0),entryAt:point.entryAt,observedThrough:point.observedThrough};
}

// Immutable loaded frequencies: each success has one duration, each failure one reason.
const onboardingIndexes=new WeakMap();
function onboardingIndex() {
  const source=sourceData.onboardingDurationFacts;
  const invalid=()=>({reason:'绑定／激活频数、批次观察窗或同周计数不一致，待核对后再显示；不回退到独立分片。'});
  if(!source||typeof source!=='object')return invalid();
  if(onboardingIndexes.has(source))return onboardingIndexes.get(source);
  const verify=()=>{
    const whole=n=>Number.isSafeInteger(n)&&n>=0,day=v=>baselineWindowEnd(`快照 ${v}`)?Date.parse(`${v}T00:00:00Z`):NaN;
    if(source.version!=='synthetic-onboarding-duration-v1'||source.status!=='SYNTHETIC_DEMO'||source.asOf!==sourceData.snapshot.asOf||!Number.isFinite(day(source.asOf)))return invalid();
    const sections={};
    for(const id of [11,13]) {
      const section=source[id===11?'binding':'activation'],dimensions=id===11?['appPlatform','deviceModel','appVersion']:['country','appPlatform','deviceModel'];
      const options=id===11?[['iOS','Android'],sourceData.filterPolicy.controls.deviceModel.options,['Demo 1.1.0','Demo 1.2.0','Demo 1.2.1']]:
        [sourceData.filterPolicy.controls.country.options,['iOS','Android'],sourceData.filterPolicy.controls.deviceModel.options.filter(v=>v!=='Hunt Pro')];
      const expected=options.reduce((groups,values)=>groups.flatMap(group=>values.map(v=>[...group,v])),[[]]).map(JSON.stringify);
      const reasons=source.binding?.failureReasonLabels;
      if(section?.unit!=='seconds'||!Array.isArray(section.cohorts)||section.cohorts.length!==sourceData.weekly.length||
        !Array.isArray(reasons)||reasons.length!==3||new Set(reasons).size!==3||reasons.some(v=>typeof v!=='string'||!v.trim()))return invalid();
      for(const [i,cohort] of section.cohorts.entries()) {
        const original=sourceData.weekly[i],seen=new Set();let n=0,d=0;
        if(!cohort||typeof cohort!=='object')return invalid();
        if(cohort.week!==original.week||cohort.cohortEnd!==original.weekEnd||day(cohort.cohortEnd)-day(cohort.cohortStart)!==6*86400000||
          !(day(cohort.observedThrough)>=day(cohort.cohortEnd)+(id===11?2:8)*86400000&&day(cohort.observedThrough)<=day(source.asOf))||
          !Array.isArray(cohort.records)||cohort.records.length!==expected.length)return invalid();
        for(const row of cohort.records) {
          if(!row||typeof row!=='object')return invalid();
          const key=JSON.stringify(dimensions.map(k=>row[k]));
          if(!expected.includes(key)||seen.has(key)||!whole(row.eligible)||!Array.isArray(row.durationCounts)||!row.durationCounts.length||
            (id===11?row.deviceStatus!=='Effective':row.productLine!=='Bird'))return invalid();
          seen.add(key);let count=0,prior=-1;
          for(const cell of row.durationCounts) {
            if(!Array.isArray(cell)||cell.length!==2||!whole(cell[0])||cell[0]<=prior||!whole(cell[1])||cell[0]>(id===11?86400:604799))return invalid();
            prior=cell[0];count+=cell[1];
          }
          const failed=id===11?row.failureCounts:row.notActivatedWithin7d;
          if(id===11&&(!failed||Object.keys(failed).length!==reasons.length||reasons.some(k=>!whole(failed[k]))))return invalid();
          if(id===13&&!whole(failed))return invalid();
          if(count+(id===11?reasons.reduce((sum,k)=>sum+failed[k],0):failed)!==row.eligible)return invalid();
          n+=count;d+=row.eligible;
        }
        const originalN=id===11?original.bindingAttempts.successful:original.registrationCohort.valueActivated7dBird;
        const originalD=id===11?original.bindingAttempts.total:original.registrationCohort.birdEligible;
        if(n!==originalN||d!==originalD)return invalid();
      }
      const raw=sourceData.metrics[`m${String(id).padStart(2,'0')}`],last=sourceData.weekly.at(-1);
      if(!raw||raw.numerator!==(id===11?last.bindingAttempts.successful:last.registrationCohort.valueActivated7dBird)||
        raw.denominator!==(id===11?last.bindingAttempts.total:last.registrationCohort.birdEligible))return invalid();
      sections[id]=section;
    }
    return {sections};
  };
  const result=verify();onboardingIndexes.set(source,result);return result;
}
function onboardingRows(id,state=filterState,weekNumber=state.week??sourceData.weekly.at(-1).week) {
  const index=onboardingIndex();if(index.reason)return index;
  const filters=effectiveFor(id,state);
  if(filters.some(([key])=>!policyFor(id).demonstrableDimensions.includes(key)))return {reason:'本范围缺少同源绑定／激活频数。'};
  if(id===13&&(state.productLine==='Hunting'||state.deviceModel==='Hunt Pro'))return {reason:'7日价值激活只定义观鸟线，狩猎型号不适用。'};
  if(id===11&&state.deviceStatus==='Inactive')return {reason:'非有效设备不属于首次绑定尝试分母。'};
  const cohort=index.sections[id]?.cohorts.find(c=>String(c.week)===String(weekNumber));
  if(!cohort)return {reason:'指定批次没有同源频数。'};
  const rows=cohort.records.filter(row=>filters.every(([key,value])=>key==='week'||row[key]===value));
  return {rows,cohort,section:index.sections[id]};
}
function frequencyQuantile(frequency,p) {
  const total=frequency.reduce((sum,[,count])=>sum+count,0);if(total<30)return null;
  const h=(total-1)*p;
  const at=rank=>{let seen=0;for(const [seconds,count] of frequency){seen+=count;if(seen>rank)return seconds;}return null;};
  const low=at(Math.floor(h)),high=at(Math.ceil(h));return low+(high-low)*(h-Math.floor(h));
}
function onboardingAggregate(rows) {
  const counts=new Map(),failureCounts={};let denominator=0;
  for(const row of rows) {
    denominator+=row.eligible;
    for(const [seconds,count] of row.durationCounts)counts.set(seconds,(counts.get(seconds)??0)+count);
    for(const [cause,count] of Object.entries(row.failureCounts??{}))failureCounts[cause]=(failureCounts[cause]??0)+count;
  }
  const frequency=[...counts].sort((a,b)=>a[0]-b[0]),numerator=frequency.reduce((sum,[,count])=>sum+count,0);
  return {numerator,denominator,frequency,failureCounts,p50Seconds:frequencyQuantile(frequency,.5),p90Seconds:frequencyQuantile(frequency,.9)};
}
function onboardingSummary(id,state=filterState,weekNumber) {
  const part=onboardingRows(id,state,weekNumber);return part.reason?part:{...part,...onboardingAggregate(part.rows)};
}
function onboardingMetric(id,state=filterState) {
  const part=onboardingSummary(id,state);if(part.reason)return pending(part.reason);
  if(part.denominator<30)return na(`${part.denominator?'样本不足30':'无合格样本'}；成功 ${part.numerator} / 分母 ${part.denominator} ${id===11?'次':'人'}，不显示可靠比率或耗时分位数`);
  return {kind:'rate',numerator:part.numerator,denominator:part.denominator,value:part.numerator/part.denominator};
}
function onboardingDuration(seconds,id) {
  return seconds===null?'成功样本不足30':`${(seconds/(id===11?60:3600)).toFixed(1)}${id===11?'分钟':'小时'}`;
}

const activityWindowIndexes=new WeakMap();
const activityWindows=[{days:1,name:'近1天',composite:'DAU',app:'appDAU'},{days:7,name:'近7天',composite:'WAU',app:'appWAU'},{days:30,name:'近30天',composite:'MAU',app:'appMAU'}];
let activityWindowView=0;
function aggregateActiveWindows(records) {
  const counts={DAU:0,WAU:0,MAU:0,appDAU:0,appWAU:0,appMAU:0};
  for(const r of records)for(const o of r.outcomes)for(const [i,w] of activityWindows.entries()) {
    if(o.compositeAge<=i)counts[w.composite]+=o.count;
    if(o.appAge!==null&&o.appAge<=i)counts[w.app]+=o.count;
  }
  return counts;
}
function activeWindowIndex() {
  const source=sourceData.activityWindowFacts;
  if(!source||typeof source!=='object')return {reason:'活跃窗口频数待补，不能用MAU推算日活与7日活跃。'};
  if(activityWindowIndexes.has(source))return activityWindowIndexes.get(source);
  const invalid=()=>{const result={reason:'同源活跃的日期、窗口人数或来源构成待核验；不沿用独立分片估算。'};activityWindowIndexes.set(source,result);return result;};
  const whole=n=>Number.isSafeInteger(n)&&n>=0;
  const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().replace('.000Z','Z')===s;
  if(source.version!=='synthetic-active-windows-v1'||source.status!=='approved-synthetic'||source.classification!=='entirely_synthetic'||!date(source.asOf)||source.asOf.slice(0,10)!==sourceData.snapshot.asOf||!Array.isArray(source.rows)||source.rows.length!==84||!Array.isArray(source.currentComposition)||source.currentComposition.length!==8)return invalid();
  const keys=r=>['US','UK','DE','Other'].includes(r?.country)&&['iOS','Android'].includes(r.appPlatform)?`${r.country}|${r.appPlatform}`:null;
  const rows=[];
  for(const [i,row] of source.rows.entries()) {
    if(!date(row?.at)||Date.parse(row.at)!==Date.parse(source.asOf)-(83-i)*86400000||!Array.isArray(row.records)||row.records.length!==8)return invalid();
    const seen=new Set();
    for(const r of row.records) {
      const key=keys(r);if(!key||seen.has(key)||!Array.isArray(r.outcomes))return invalid();seen.add(key);
      const signatures=new Set();
      for(const o of r.outcomes) {
        if(!o||!whole(o.count)||o.count===0||!Number.isInteger(o.compositeAge)||o.compositeAge<0||o.compositeAge>2||!(o.appAge===null||Number.isInteger(o.appAge)&&o.appAge>=o.compositeAge&&o.appAge<=2))return invalid();
        const signature=`${o.compositeAge}|${o.appAge}`;if(signatures.has(signature))return invalid();signatures.add(signature);
      }
    }
    rows.push({...row,counts:aggregateActiveWindows(row.records)});
  }
  // Necessary temporal bounds: every daily count inside a window is included
  // in its distinct count, which cannot exceed the sum of those daily counts.
  for(let cell=0;cell<8;cell++) {
    const key=keys(rows[0].records[cell]),daily=rows.map(row=>aggregateActiveWindows([row.records.find(r=>keys(r)===key)]));
    for(let i=0;i<daily.length;i++)for(const w of activityWindows)for(const app of [false,true]) {
      const key=app?w.app:w.composite,dayKey=app?'appDAU':'DAU';
      const values=daily.slice(Math.max(0,i-w.days+1),i+1).map(r=>r[dayKey]);
      if(daily[i][key]<Math.max(...values)||i>=w.days-1&&daily[i][key]>values.reduce((n,v)=>n+v,0))return invalid();
    }
  }
  const current=rows.at(-1),raw=sourceData.metrics.m25?.value;
  if(sourceData.metrics.m04?.kind!=='count'||sourceData.metrics.m04.value!==current.counts.MAU||sourceData.metrics.m25?.kind!=='group'||!Object.keys(current.counts).every(k=>raw?.[k]===current.counts[k]))return invalid();
  const composition=new Map(),totals=Object.fromEntries(activityCombinations.map(c=>[c.key,0]));
  for(const r of source.currentComposition) {
    const key=keys(r),record=current.records.find(c=>keys(c)===key),counts=record&&aggregateActiveWindows([record]);
    if(!key||composition.has(key)||!counts||!whole(r.composite)||!whole(r.app)||r.composite!==counts.MAU||r.app!==counts.appMAU||!r.exclusive||Object.keys(r.exclusive).length!==7||!activityCombinations.every(c=>whole(r.exclusive[c.key])))return invalid();
    const sum=field=>activityCombinations.reduce((n,c)=>n+(!field||c.sources.includes(field)?r.exclusive[c.key]:0),0);
    if(sum()!==r.composite||sum('app')!==r.app)return invalid();
    for(const c of activityCombinations)totals[c.key]+=r.exclusive[c.key];composition.set(key,r);
  }
  const original=sourceData.metrics.m30;
  if(original?.kind!=='group'||activityCombinations.some(c=>original.value.exclusiveCells?.[c.key]!==totals[c.key]))return invalid();
  for(const field of ['composite','app','content','pushClicked'])if(original.value[field]!==activityCombinations.reduce((n,c)=>n+(field==='composite'||c.sources.includes(field)?totals[c.key]:0),0))return invalid();
  // Preserve the reviewed 12 weekly anchors while adding daily observations between them.
  const chart=sourceData.diagnostics.B.chart;
  for(const [i,label] of chart.labels.entries()) {
    const row=rows.find(r=>`${Number(r.at.slice(5,7))}/${Number(r.at.slice(8,10))}`===label);
    if(!row||row.counts.MAU!==chart.series[0].values[i]||row.counts.appMAU!==chart.series[1].values[i])return invalid();
  }
  const result={rows,composition,asOf:source.asOf};activityWindowIndexes.set(source,result);return result;
}
function activeWindowProjection(state=filterState) {
  const index=activeWindowIndex();if(index.reason)return index;
  const filters=effectiveFor(25,state);
  if(filters.some(([key])=>!['country','appPlatform'].includes(key)))return {reason:'缺少产品线或设备主型号的主账号归属明细；不能独立乘比例生成筛后活跃。'};
  const matches=r=>filters.every(([key,value])=>r[key]===value);
  const rows=index.rows.map(row=>({...row,counts:aggregateActiveWindows(row.records.filter(matches))}));
  const parts=[...index.composition.values()].filter(matches),exclusiveCells=Object.fromEntries(activityCombinations.map(c=>[c.key,parts.reduce((n,r)=>n+r.exclusive[c.key],0)]));
  const sum=field=>activityCombinations.reduce((n,c)=>n+(field==='composite'||c.sources.includes(field)?exclusiveCells[c.key]:0),0);
  return {rows,current:rows.at(-1),asOf:index.asOf,composition:{composite:sum('composite'),app:sum('app'),content:sum('content'),pushClicked:sum('pushClicked'),exclusiveCells,overlapAllowed:true}};
}
function activeWindowMetric(id,state=filterState) {
  const part=activeWindowProjection(state);if(part.reason)return pending(part.reason);
  return id===4?{kind:'count',value:part.current.counts.MAU}:id===25?{kind:'group',value:part.current.counts}:{kind:'group',value:part.composition};
}
function activeWindowPeriod(days) {
  const source=activeWindowIndex();if(source.reason)return '窗口待核验';
  return `${new Date(Date.parse(source.asOf)-days*86400000).toISOString().slice(0,10)} → ${source.asOf.slice(0,10)} UTC零时（左含右不含）`;
}
function activeWindowTable(days) {
  const part=activeWindowProjection();if(part.reason)return {title:'活跃窗口待核验',columns:['状态'],rows:[[part.reason]]};
  if(days===30)return {title:'84日 · 近30天复合与App活跃人数',columns:['截至日（UTC零时）','复合近30天（人）','App近30天（人）','窗口起点（UTC零时）'],rows:part.rows.map(r=>[r.at.slice(0,10),r.counts.MAU,r.counts.appMAU,new Date(Date.parse(r.at)-30*86400000).toISOString().slice(0,10)]),note:'同一UTC零时截止向前30天，左含右不含；App是复合子集，跨日窗口重叠，人数及快照不能相加。合成频数，不是逐账号轨迹。'};
  return {title:'84日 · 同源活跃窗口人数',columns:['截至日（UTC零时）','复合近1天（人）','App近1天（人）','复合近7天（人）','App近7天（人）','复合近30天（人）','App近30天（人）'],rows:part.rows.map(r=>[r.at.slice(0,10),...activityWindows.flatMap(w=>[r.counts[w.composite],r.counts[w.app]])]),note:'窗口从截至时点向前1／7／30天，起含止不含。App是复合子集，1天⊆7天⊆30天；人数不可相加，跨日快照也不可相加为独立人数。全部为合成频数，无跨日账号身份。'};
}
function activityExplorer(onSelect,{metricId=25,fixedDays=null}={}) {
  const section=element('section','activity-window-explorer');section.dataset.evidenceMetric=String(metricId);
  const tabs=element('div','structure-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','活跃滚动窗口');
  const panel=element('div','activity-window-panel');panel.id='activity-window-panel';panel.setAttribute('role',fixedDays?'region':'tabpanel');if(fixedDays)panel.setAttribute('aria-label',`近${fixedDays}天活跃历史`);
  const buttons=(fixedDays?[]:activityWindows).map((w,i)=>{const b=element('button','structure-tab',w.name);b.type='button';b.id=`activity-window-${i}`;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel.id);tabs.append(b);return b;});
  section.append(...(fixedDays?[panel]:[tabs,panel]));
  function select(i) {
    if(!fixedDays)activityWindowView=i;section.dataset.initialized='true';buttons.forEach((b,j)=>{b.setAttribute('aria-selected',String(i===j));b.tabIndex=i===j?0:-1;});if(!fixedDays)panel.setAttribute('aria-labelledby',buttons[i].id);
    for(const box of panel.querySelectorAll('.detail-chart')){const instance=window.echarts?.getInstanceByDom(box);if(instance){destroyChart(instance);const p=detailCharts.indexOf(instance);if(p>=0)detailCharts.splice(p,1);}}
    const projection=activeWindowProjection(),w=activityWindows[i],part=projection.current,previous=projection.rows.at(-2),delta=key=>part.counts[key]-previous.counts[key];
    const grid=element('div','evidence-charts-grid');panel.replaceChildren(element('p','table-note activity-window-period',`${activeWindowPeriod(w.days)}；复合 ${number(part.counts[w.composite])} 人，App ${number(part.counts[w.app])} 人。分别较前日快照 ${delta(w.composite)>=0?'+':''}${number(delta(w.composite))}／${delta(w.app)>=0?'+':''}${number(delta(w.app))} 人；变化不是当日新增人数。两图独立纵轴，规模以人数核对。`),grid);
    for(const [j,[field,label]] of [[w.composite,'复合活跃'],[w.app,'App主动活跃']].entries()) {
      const spec={nearestLinePoint:true,title:`${label} · ${w.name} · 84日快照`,unit:'人',labels:projection.rows.map(r=>r.at.slice(0,10)),series:[{name:label,values:projection.rows.map(r=>r.counts[field]),color:j?'#356d51':'#bf762b'}],note:'UTC零时截止；向前滚动窗口，非自然周／月。App为复合子集；合成每日频数，不提供跨日身份。'};
      const shell=element('section','detail-chart-panel workspace-chart-panel');shell.dataset.evidenceMetric=String(metricId);shell.append(element('h3','',spec.title));
      const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',`${spec.title}；${spec.note}`);shell.append(box);const scale=chartScaleNote(spec);if(scale)shell.append(element('p','chart-scale-note',scale));
      const detail=element('details','chart-data');detail.append(element('summary','','查看窗口人数与精确UTC起止'),dataTable({title:spec.title,columns:['截至日（UTC零时）','人数（人）','窗口起点（UTC零时）'],rows:projection.rows.map(r=>[r.at.slice(0,10),r.counts[field],new Date(Date.parse(r.at)-w.days*86400000).toISOString().slice(0,10)]),note:spec.note}));shell.append(detail);grid.append(shell);drawEvidenceChart(box,spec);
    }
    onSelect?.();updateScrollableTables();
  }
  buttons.forEach((b,i)=>{b.addEventListener('click',()=>select(i));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;buttons[next].focus();select(next);});});
  return {node:section,init:()=>select(fixedDays?activityWindows.findIndex(w=>w.days===fixedDays):activityWindowView)};
}

// Pack counts describe current entitlements, not monthly purchasers. Validate
// their common population before using any card, chart or supplementary table.
const packTypeNames=['Extra Memory Pack','Device Pack','观鸟 AI Agent Pack','HD Pack','狩猎 AI Agent Pack'];
const validHeadcount=value=>Number.isSafeInteger(value)&&value>=0;
function paidRightsFacts(state=filterState) {
  const filters=effectiveFor(34,state),unsupported=filters.find(([key])=>!policyFor(34).demonstrableDimensions.includes(key));
  if(unsupported)return {reason:`${filterLabels[unsupported[0]]}适用，但缺少可闭合的订阅与Pack权益归属明细`};
  if(filters.some(([key,value])=>!sourceData.slices[key]?.[value]))return {reason:'权益筛选值未定义，不能回退到总体'};
  const paid=sourceData.metrics.m34,base=sourceData.metrics.m02,snapshot=sourceData.snapshot;
  if(paid?.kind!=='count'||base?.kind!=='count'||![paid.value,base.value,snapshot.paidUsersIncludingPackOnly,snapshot.effectiveSubscribers,snapshot.packOnlyUsers].every(validHeadcount)||
    paid.value!==snapshot.paidUsersIncludingPackOnly||base.value!==snapshot.effectiveSubscribers||paid.value-base.value!==snapshot.packOnlyUsers)
    return {reason:'付费权益总数、有效订阅与仅持Pack人数不闭合，需核验同日权益来源'};
  const statusesSource=sourceData.metrics.m05,rawLines=['bird','hunting'].map(key=>statusesSource?.value?.[key]);
  if(statusesSource?.kind!=='group'||rawLines.some(line=>!line||![line.paidCurrent,line.cancelledButEntitled].every(validHeadcount))||
    rawLines.reduce((sum,line)=>sum+line.paidCurrent+line.cancelledButEntitled,0)!==base.value)
    return {reason:'同日订阅状态与有效订阅总数不闭合，暂停权益包含关系核对'};
  const applicable=Object.fromEntries(filters),subscriptions=projectMetric(2,applicable),statuses=projectMetric(5,applicable);
  if(subscriptions.kind!=='count'||statuses.kind!=='group')return {reason:'缺少同范围有效订阅状态，不能核对付费权益分母'};
  const lines=Object.values(statuses.value);
  if(lines.some(line=>!line||![line.paidCurrent,line.cancelledButEntitled].every(validHeadcount)))return {reason:'同范围订阅状态人数不合法，不能核对权益组成'};
  const sub=lines.reduce((sum,line)=>sum+line.paidCurrent+line.cancelledButEntitled,0),total=allocatedCount(paid.value,filters,34,'denominator',sharesFor(filters,34)),packOnly=total-sub;
  if(![total,sub,packOnly].every(validHeadcount)||total>paid.value||sub>base.value||packOnly>snapshot.packOnlyUsers)
    return {reason:'同范围付费权益与有效订阅的包含关系不闭合；不使用独立比例补齐'};
  return {total,subscriptions:sub,packOnly,filters};
}
function packPenetrationFacts(state=filterState) {
  const filters=effectiveFor(36,state),unsupported=filters.find(([key])=>!policyFor(36).demonstrableDimensions.includes(key));
  if(unsupported)return {reason:`${filterLabels[unsupported[0]]}适用，但缺少可闭合的Pack与付费权益归属明细`};
  if(filters.some(([key,value])=>!sourceData.slices[key]?.[value]))return {reason:'Pack筛选值未定义，不能回退到总体'};
  // Ignore only filters outside #36's business scope, consistently for both sides.
  const parent=paidRightsFacts(Object.fromEntries(filters));if(parent.reason)return parent;
  const raw=sourceData.metrics.m36,group=raw?.value,byPack=group?.byPack,globalPaid=sourceData.metrics.m34.value;
  const rateValid=part=>part?.kind==='rate'&&validHeadcount(part.numerator)&&validHeadcount(part.denominator)&&part.denominator===globalPaid&&part.numerator<=part.denominator;
  if(raw?.kind!=='group'||!byPack||Array.isArray(byPack)||Object.keys(byPack).length!==packTypeNames.length||!rateValid(group.anyPack)||!packTypeNames.every(name=>rateValid(byPack[name])))
    return {reason:'Pack人数缺失、非法或未使用同日付费权益分母；暂停相关比例与结构'};
  const all=packTypeNames.map(name=>byPack[name]),sum=all.reduce((n,r)=>n+r.numerator,0),union=group.anyPack.numerator;
  if(!Number.isSafeInteger(sum)||union<sourceData.snapshot.packOnlyUsers||all.some(r=>r.numerator>union)||union>sum)
    return {reason:'各Pack、任一Pack与仅持Pack人数的包含关系不闭合，无法展示可靠结构'};
  const shares=sharesFor(filters,36),project=part=>({numerator:allocatedCount(part.numerator,filters,36,part.numerator>part.denominator*.9?'denominator':'numerator',shares),denominator:allocatedCount(part.denominator,filters,36,'denominator',shares)});
  const anyPack=project(group.anyPack),products=packTypeNames.map(name=>({name,...project(byPack[name])})),membershipSum=products.reduce((n,r)=>n+r.numerator,0);
  if(anyPack.denominator!==parent.total||anyPack.numerator<parent.packOnly||anyPack.numerator>union||anyPack.numerator>parent.total||
    products.some(r=>r.denominator!==parent.total||r.numerator>anyPack.numerator||r.numerator>byPack[r.name].numerator)||anyPack.numerator>membershipSum)
    return {reason:'筛选后Pack计数与付费权益分母不闭合；不截断计数或保留旧比例'};
  return {parent,anyPack,products,membershipSum,duplicateMemberships:membershipSum-anyPack.numerator,filters};
}
function packPenetrationTable(part=packPenetrationFacts()) {
  if(part.reason)return {title:'各Pack当前渗透率',columns:['状态'],rows:[[part.reason]]};
  const proportion=row=>row.denominator>=30?percent(row.numerator/row.denominator):row.denominator?'样本不足30人':'无合格分母';
  return {title:'各Pack当前渗透率',columns:['Pack类型','持有人（人）','付费权益主账号（人）','渗透率'],
    rows:[...part.products.map(r=>[r.name,r.numerator,r.denominator,proportion(r)]),['任一Pack（去重）',part.anyPack.numerator,part.anyPack.denominator,proportion(part.anyPack)]],
    note:`${sourceData.snapshot.asOf} 当前有效权益快照；五项持有合计 ${number(part.membershipSum)} 主账号次，超出去重人数 ${number(part.duplicateMemberships)} 次，不是多Pack人数。各Pack可重叠，不能相加为独立用户。历史趋势与具体重叠组合待补，未从边际人数反推。`};
}
function paidRightsComposition() {
  const part=packPenetrationFacts();if(part.reason)return part;
  const {parent,anyPack}=part;
  if(parent.total<30)return {reason:parent.total?'付费权益主账号不足30人，保留计数，不展示结构比例':'无付费权益主账号，结构比例无合格分母'};
  return {...part,counts:[parent.total-anyPack.numerator,parent.packOnly,anyPack.numerator-parent.packOnly]};
}
function paidContextTable(spec) {
  if(spec.title==='权益与Pack持有结构') {
    const part=paidRightsComposition();if(part.reason)return {...spec,columns:['状态'],rows:[[part.reason]],note:'同日订阅与Pack来源核验后才展示权益组成；不使用旧比例补齐。'};
    return {...spec,rows:[...['仅订阅','仅增值Pack','订阅和Pack都有'].map((name,i)=>[name,part.counts[i],part.parent.total,percent(part.counts[i]/part.parent.total)]),
      ...part.products.map(r=>[r.name,r.numerator,r.denominator,percent(r.numerator/r.denominator)])],note:packPenetrationTable(part).note};
  }
  if(spec.title==='收入与权益口径') {
    const rights=paidRightsFacts(),packs=packPenetrationFacts(),unavailable=reason=>['待核验','—',reason];
    const rows=spec.rows.map(row=>{
      if(row[0]==='期末有效订阅'){const part=metric(2);return [row[0],...(part.kind==='count'?[part.value,'—',`${number(part.value)}人`]:unavailable(part.reason))];}
      if(row[0]==='期末仅持Pack')return [row[0],...(rights.reason?unavailable(rights.reason):[rights.packOnly,'—',`${number(rights.packOnly)}人`])];
      if(row[0]==='期末付费权益主账号')return [row[0],...(rights.reason?unavailable(rights.reason):[`${number(rights.subscriptions)} + ${number(rights.packOnly)}`,'—',`${number(rights.total)}人`])];
      if(row[0]==='增值包持有人占比')return [row[0],...(packs.reason?unavailable(packs.reason):[packs.anyPack.numerator,packs.anyPack.denominator,packs.anyPack.denominator>=30?percent(packs.anyPack.numerator/packs.anyPack.denominator):'无合格分母或样本不足30人'])];
      return row;
    });return {...spec,rows};
  }
  if(spec.title==='增值服务首购与复购')return {...spec,columns:['类型','去重主账号','占分类样本'],rows:spec.rows.map(row=>row[0]==='本期Pack持有人'?['分类样本合计',...row.slice(1)]:row),note:'独立首购／复购分类样本；交易窗口尚未明确，不用于填补当前有效Pack持有人、渗透率或历史趋势。'};
  return spec;
}

function accountStockRowsProblem(rows) {
  const seen=new Set();
  if(!Array.isArray(rows)||rows.length!==8)return '账号存量分组缺行，需补齐国家×App的互斥人数';
  for(const row of rows) {
    if(!row||!['US','UK','DE','Other'].includes(row.country)||!['iOS','Android'].includes(row.appPlatform)||
      seen.has(`${row.country}:${row.appPlatform}`)||![row.registered,row.boundOwners].every(validHeadcount)||row.boundOwners>row.registered)return '注册／绑定人数、归属或唯一性待核验；不能用比例补齐';
    seen.add(`${row.country}:${row.appPlatform}`);
  }
  return null;
}
function accountStockCurrentSource() {
  const source=sourceData.diagnostics.A.accountHistory,raw=sourceData.metrics.m07?.value,snapshot=sourceData.snapshot;
  const problem=accountStockRowsProblem(source?.current?.records);if(problem)return {reason:problem};
  if(source.version!=='synthetic-account-month-stocks-v1'||source.provenance!=='constructed-month-end-stocks'||source.asOf!==`${snapshot.asOf}T00:00:00Z`||
    source.current.endExclusive!==source.asOf||source.current.date!==snapshot.asOf)return {reason:'账号快照日期或来源版本待核验'};
  const rows=source.current.records,registered=rows.reduce((n,r)=>n+r.registered,0),boundOwners=rows.reduce((n,r)=>n+r.boundOwners,0);
  if(sourceData.metrics.m07?.kind!=='group'||![registered,boundOwners].every(validHeadcount)||registered!==raw?.registered||boundOwners!==raw?.boundOwners||
    registered!==snapshot.registeredCumulative||boundOwners!==snapshot.boundOwnerAccounts)return {reason:'账号分组与当前注册／绑定快照不闭合'};
  const dimensions=[['country','countryShare',['US','UK','DE','Other']],['appPlatform','appPlatformShare',['iOS','Android']]];
  for(const [dimension,field,keys] of dimensions)for(const key of keys) {
    const expected=sourceData.metrics.m38?.value?.[field]?.[key],count=rows.filter(r=>r[dimension]===key).reduce((n,r)=>n+r.registered,0);
    if(!Number.isFinite(expected)||Math.abs(count-registered*expected)>1e-7)return {reason:'同日注册国家／平台结构与账号存量不一致，待核对来源'};
  }
  return {source,rows};
}
function accountStockProjection(state=filterState) {
  const current=accountStockCurrentSource();if(current.reason)return current;
  const filters=effectiveFor(7,state);
  if(filters.some(([key,value])=>!['country','appPlatform'].includes(key)||!sourceData.slices[key]?.[value]))return {reason:'当前条件缺少账号归属，不能回退到总体'};
  const aggregate=rows=>rows.filter(row=>filters.every(([key,value])=>row[key]===value)).reduce((sum,row)=>({registered:sum.registered+row.registered,boundOwners:sum.boundOwners+row.boundOwners}),{registered:0,boundOwners:0});
  return {...aggregate(current.rows),source:current.source,aggregate,filters};
}
function accountStockHistory(state=filterState) {
  const part=accountStockProjection(state);if(part.reason)return part;
  const bad=()=>({reason:'月末账号历史缺失、月份不连续或累计存量不闭合；保留可靠当前人数'}),source=part.source,months=source.months;
  if(!Array.isArray(months)||months.length!==12)return bad();
  const at=new Date(source.asOf);if(!Number.isFinite(at.getTime()))return bad();
  const bridge=source.registrationBridge?.days,first=Date.parse(`${sourceData.weekly[0].weekEnd}T00:00:00Z`)-6*86400000;
  if(!Array.isArray(bridge)||bridge.length!==(at.getTime()-first)/86400000||bridge.some((r,i)=>!r||r.date!==new Date(first+i*86400000).toISOString().slice(0,10)||!validHeadcount(r.registered)))return bad();
  for(const week of sourceData.weekly){const end=Date.parse(`${week.weekEnd}T00:00:00Z`),start=new Date(end-6*86400000).toISOString().slice(0,10);if(bridge.filter(r=>r.date>=start&&r.date<=week.weekEnd).reduce((n,r)=>n+r.registered,0)!==week.registrationCohort.registered)return bad();}
  const rows=[];let previous;
  for(const [i,row] of months.entries()) {
    const day=new Date(Date.UTC(at.getUTCFullYear(),at.getUTCMonth()-12+i+1,0)),date=day.toISOString().slice(0,10),end=new Date(day.getTime()+86400000).toISOString().replace('.000Z','Z');
    if(!row||row.month!==date.slice(0,7)||row.date!==date||row.endExclusive!==end||accountStockRowsProblem(row.records))return bad();
    if(previous&&row.records.some(r=>r.registered<previous.find(p=>p.country===r.country&&p.appPlatform===r.appPlatform).registered))return bad();
    if(day.getTime()>=first&&row.records.reduce((n,r)=>n+r.registered,0)!==sourceData.metrics.m07.value.registered-bridge.filter(r=>r.date>date).reduce((n,r)=>n+r.registered,0))return bad();
    rows.push({date,kind:'完整月末',...part.aggregate(row.records)});previous=row.records;
  }
  if(source.current.records.some(r=>r.registered<previous.find(p=>p.country===r.country&&p.appPlatform===r.appPlatform).registered))return bad();
  rows.push({date:source.current.date,kind:'当前快照',registered:part.registered,boundOwners:part.boundOwners});
  return {rows,note:source.note,asOf:source.asOf};
}
function accountStockHistoryEvidence(panel,append) {
  const part=accountStockHistory();
  const ratio=r=>r.registered>=30?percent(r.boundOwners/r.registered):r.registered?'样本不足30人':'无合格分母';
  if(part.reason){const note=element('p','na-note account-history-unavailable',part.reason);note.dataset.evidenceKind='change';panel.append(note);}else {
  const spec={title:'注册与当前绑定主账号 · 12个月末＋当前',unit:'人',nearestLinePoint:true,labels:part.rows.map(r=>r.date),
    categoryLabels:part.rows.map(r=>r.kind==='完整月末'?r.date.slice(0,7):r.date),
    series:[{name:'累计注册',values:part.rows.map(r=>r.registered)},{name:'当时绑定主账号',values:part.rows.map(r=>r.boundOwners)}],
    scopeNote:`12个完整月末＋${part.rows.at(-1).date}当前快照；最后一段不是完整月新增。合成固定国家×App归属，非逐账号日志。`,
    note:`${part.note} 末点${part.rows.at(-1).date}是当前快照，和上月末的差值不是完整月新增或解绑人数。`};
  append(spec,{title:'账号存量 · 月末与当前完整计数',columns:['快照日期','周期性质','累计注册（人）','当时绑定（人）','当时未绑定（人）','当时绑定占比'],
    rows:part.rows.map(r=>[r.date,r.kind,r.registered,r.boundOwners,r.registered-r.boundOwners,ratio(r)]),note:spec.note},'change');
  }
  for(const dimension of ['country','appPlatform']) {
    const options=sourceData.filterPolicy.controls[dimension].options,parts=options.map(option=>accountStockProjection({...filterState,[dimension]:option}));
    const table=dataTable({title:`${filterLabels[dimension]} · 当前账号存量`,columns:['分组','累计注册（人）','当前绑定（人）','当前未绑定（人）','绑定占比'],
      rows:parts.map((r,i)=>[optionLabel(dimension,options[i]),r.registered,r.boundOwners,r.registered-r.boundOwners,ratio(r)]),
      note:'保留另一项筛选，仅替换本分组；各行互斥，合计为移除本分组条件后的总体。当前未绑定按主账号关系计算，不等于从未绑定或流失；组间比率接近，不生成强行排名。'},'account-stock-group');table.dataset.evidenceKind='groups';panel.append(table);
  }
}

// Complete UTC days share #25 App-active account denominators; Session and
// duration frequencies are synthetic, with no user identities or background time.
const sessionDepthIndexes=new WeakMap();
function sessionDepthIndex() {
  const source=sourceData.diagnostics.B.sessionDepth;
  if(!source||typeof source!=='object')return {reason:'缺少同源会话日频数，不沿用观察期不明的旧汇总。'};
  if(sessionDepthIndexes.has(source))return sessionDepthIndexes.get(source);
  const bad=reason=>{const result={reason};sessionDepthIndexes.set(source,result);return result;};
  const active=activeWindowIndex();
  if(active.reason||source.metricId!==26||!Array.isArray(source.rules)||!Array.isArray(source.limitations)||![...source.rules,...source.limitations].every(text=>typeof text==='string'&&text.trim())||source.version!=='synthetic-session-day-v1'||source.status!=='approved-synthetic'||source.classification!=='entirely_synthetic'||source.period!=='rolling-1-day-at-UTC-midnight'||source.asOf!==active.asOf||!Array.isArray(source.rows)||!source.rows.length)
    return bad('会话日口径、截至时点或App日活人数待核验；不回退到旧汇总。');
  const validate=(row,end)=>{
    if(!row||row.endExclusive!==end||row.startInclusive!==new Date(Date.parse(end)-86400000).toISOString().replace('.000Z','Z')||!Array.isArray(row.cells)||row.cells.length!==8)return false;
    const parent=active.rows.find(r=>r.at===end);if(!parent)return false;
    const seen=new Set();
    for(const cell of row.cells){
      const key=`${cell?.country}|${cell?.appPlatform}`,account=parent.records.find(r=>`${r.country}|${r.appPlatform}`===key);
      if(!account||seen.has(key)||!validHeadcount(cell.activeAccounts)||cell.activeAccounts!==aggregateActiveWindows([account]).appDAU)return false;seen.add(key);
      const frequency=cell.accountSessionFrequency,duration=cell.durationSecondsFrequency;
      const valid=rows=>Array.isArray(rows)&&rows.every(r=>Array.isArray(r)&&r.length===2&&Number.isSafeInteger(r[0])&&r[0]>0&&validHeadcount(r[1]))&&new Set(rows.map(r=>r[0])).size===rows.length;
      if(!valid(frequency)||!valid(duration)||duration.some(([seconds])=>seconds>86400)||frequency.reduce((n,r)=>n+r[1],0)!==cell.activeAccounts)return false;
      const sessions=frequency.reduce((n,[k,count])=>n+k*count,0),timed=duration.reduce((n,r)=>n+r[1],0);
      if(!Number.isSafeInteger(sessions)||!Number.isSafeInteger(timed)||timed>sessions)return false;
    }
    return true;
  };
  const current=source.rows.at(-1);
  if(!validate(current,source.asOf))return bad('当前会话的人数、频数、时长样本或UTC日界不闭合，暂停#26；#25仍按自身来源计算。');
  const historyValid=source.rows.length===84&&source.rows.every((r,i)=>validate(r,new Date(Date.parse(source.asOf)-(83-i)*86400000).toISOString().replace('.000Z','Z')));
  const result={source,current,rows:historyValid?source.rows:null,historyReason:historyValid?null:'84日会话历史缺失或计数不闭合；保留可靠当前日，停止绘制旧趋势。'};
  sessionDepthIndexes.set(source,result);return result;
}
function sessionDepthProjection(state=filterState) {
  const index=sessionDepthIndex();if(index.reason)return index;
  const filters=effectiveFor(26,state);
  if(filters.some(([key,value])=>!['country','appPlatform'].includes(key)||!sourceData.slices[key]?.[value]))return {reason:'当前条件缺少同范围会话归属，不能回退总体。'};
  const aggregate=row=>{
    let accounts=0,sessions=0;const frequency=new Map(),durations=new Map();
    for(const cell of row.cells.filter(c=>filters.every(([key,value])=>c[key]===value))){
      accounts+=cell.activeAccounts;
      for(const[k,n]of cell.accountSessionFrequency){sessions+=k*n;frequency.set(k,(frequency.get(k)??0)+n);}
      for(const[k,n]of cell.durationSecondsFrequency)durations.set(k,(durations.get(k)??0)+n);
    }
    const frequencies=[...frequency].sort((a,b)=>a[0]-b[0]),durationFrequency=[...durations].sort((a,b)=>a[0]-b[0]),timedSessions=durationFrequency.reduce((n,r)=>n+r[1],0);
    return {start:row.startInclusive,end:row.endExclusive,accounts,sessions,timedSessions,frequencies,durations:durationFrequency,
      frequency:accounts>=30?sessions/accounts:null,p50:frequencyQuantile(durationFrequency,.5),p90:frequencyQuantile(durationFrequency,.9)};
  };
  return {current:aggregate(index.current),rows:index.rows?.map(aggregate),historyReason:index.historyReason,source:index.source};
}
const sessionDepthNumber=(value,digits=1)=>value===null?'样本不足':Number(value).toFixed(digits);
const sessionDepthDuration=(seconds,count,digits=1)=>count===0?'无合格时长':seconds===null?'样本不足30次':`${(seconds/60).toFixed(digits)}分钟`;
function sessionDepthWindow() {
  const part=sessionDepthProjection();return part.reason?'当前范围暂无可用基线周期':`会话日口径v1 · ${part.current.start.slice(0,10)} → ${part.current.end.slice(0,10)} UTC零时（左含右不含）`;
}
function sessionDepthBaseline() {
  const part=sessionDepthProjection();if(part.reason)return part.reason;const r=part.current;
  return '会话日证据v1：'+JSON.stringify({version:'synthetic-session-day-v1',start:r.start,end:r.end,accounts:r.accounts,sessions:r.sessions,timedSessions:r.timedSessions,frequencies:r.frequencies,durations:r.durations});
}
function sessionDepthBaselineDetails(baseline) {
  const details=element('details','session-baseline-details');details.append(element('summary','','查看首次保存的会话与分布证据'));
  // Saved evidence is display-only. Never rewrite legacy or unrecognized records.
  try{const r=JSON.parse(baseline.slice('会话日证据v1：'.length));
    if(r.version!=='synthetic-session-day-v1'||![r.accounts,r.sessions,r.timedSessions].every(validHeadcount)||!Array.isArray(r.frequencies)||!Array.isArray(r.durations))throw Error('unknown');
    details.append(element('p','table-note',`${r.start} → ${r.end}；App活跃 ${number(r.accounts)} 人，有效会话 ${number(r.sessions)} 次，合格时长 ${number(r.timedSessions)} 次。`),
      dataTable({title:'首次登记 · 次数频数',columns:['每人次数','主账号人数'],rows:r.frequencies}),dataTable({title:'首次登记 · 时长频数',columns:['前台时长（秒）','会话次数'],rows:r.durations}));
  }catch{details.append(element('p','table-note','原证据格式无法识别，请人工核对；不改写或补齐原内容。'),element('p','table-note',baseline));}
  return details;
}
function sessionDepthChange(a,b,unit,digits) {
  if(!Number.isFinite(a)||!Number.isFinite(b))return '暂无可比值';const delta=a-b,threshold=10**(-digits);
  return Math.abs(delta)<1e-12?'与前日持平':`${Math.abs(delta)<threshold?(delta>0?'增加不足':'减少不足')+threshold.toFixed(digits):(delta>0?'+':'−')+Math.abs(delta).toFixed(digits)} ${unit} · 较前日`;
}
function sessionDepthEvidence(panel,append) {
  const part=sessionDepthProjection();if(part.reason)return null;
  const r=part.current,previous=part.rows?.at(-2),summary=element('div','session-depth-summary');summary.dataset.evidenceKind='change';
  for(const[key,label,divisor,unit,digits]of [['frequency','人均有效会话',1,'次/人',2],['p50','会话时长 P50',60,'分钟',1],['p90','会话时长 P90',60,'分钟',1]]){
    const card=element('article','session-depth-value'),value=r[key]===null?null:r[key]/divisor,before=previous?.[key]==null?null:previous[key]/divisor;
    const text=value===null?(key==='frequency'?(r.accounts?'样本不足30人':'无合格分母'):sessionDepthDuration(r[key],r.timedSessions)):key==='frequency'?`${value.toFixed(digits)} ${unit}`:sessionDepthDuration(r[key],r.timedSessions,digits);
    card.append(element('p','',label),element('strong','',text));
    const delta=element('p','table-note',sessionDepthChange(value,before,unit,digits));delta.title=`${previous?.start??'前期缺失'} → ${previous?.end??''} 对比 ${r.start} → ${r.end}；精确变化 ${value===null||before===null?'无值':value-before} ${unit}`;
    card.append(delta);summary.append(card);
  }
  panel.append(summary);const note=`${sessionDepthWindow()}。${number(r.sessions)}次有效会话 ÷ ${number(r.accounts)}名App日活；合格时长 ${number(r.timedSessions)}次。合成国家×App固定归属，与#25同日人数一致；不是跨日独立人数或真实客户端占比。`;
  const basis=element('p','table-note session-depth-basis',note);basis.dataset.evidenceKind='change';panel.append(basis);
  let selected=r.end,initialized=false,dynamicPlots=[];const section=element('section','session-distributions');section.dataset.evidenceKind='groups';section.dataset.evidenceMetric='26';
  const label=element('label','retention-month-control','分布统计日（截至UTC零时）'),select=element('select','');select.id='session-distribution-day';select.name='sessionDistributionDay';label.htmlFor=select.id;
  for(const row of part.rows??[r]){const option=element('option','',`${row.start.slice(0,10)} → ${row.end.slice(0,10)}`);option.value=row.end;select.append(option);}select.value=selected;label.append(select);
  const content=element('div','session-distribution-content');section.append(label,element('p','table-note','选择日期只更新下方分布；顶部当前值、登记日窗及已有问题单保持最新完整日。1—4次是本合成场景的取值，不是业务上限。'),content);
  function renderDistribution(){
    for(const box of content.querySelectorAll('.detail-chart')){const instance=window.echarts?.getInstanceByDom(box);if(instance){destroyChart(instance);const i=detailCharts.indexOf(instance);if(i>=0)detailCharts.splice(i,1);}}
    content.replaceChildren();dynamicPlots=[];const row=(part.rows??[r]).find(row=>row.end===selected)??r;
    content.append(element('p','table-note session-distribution-window',`${row.start} → ${row.end}；${number(row.accounts)}人／${number(row.sessions)}次会话；合格时长${number(row.timedSessions)}次。`));
    const limits=[60,180,600,1800,Infinity],bins=limits.map(()=>0);for(const[seconds,n]of row.durations)bins[limits.findIndex(max=>seconds<max)]+=n;
    const items=[{title:'每名活跃主账号 · 日会话次数',unit:'人',labels:row.frequencies.map(([k])=>`${k}次`),values:row.frequencies.map(([,n])=>n),table:{title:'会话次数 · 原始频数',columns:['每人会话次数','主账号（人）','有效会话（次）'],rows:row.frequencies.map(([k,n])=>[k,n,k*n])}},
      {title:'单次前台时长 · 分布（分钟）',unit:'次',labels:['<1','1—<3','3—<10','10—<30','≥30'],values:bins,table:{title:'时长区间 · 会话次数',columns:['前台时长（分钟）','合格会话（次）'],rows:['<1','1—<3','3—<10','10—<30','≥30'].map((s,i)=>[s,bins[i]])}}];
    for(const item of items){const spec={title:item.title,unit:item.unit,labels:item.labels,series:[{name:item.unit==='人'?'主账号':'合格会话',values:item.values}],note:'按当前日期与国家×App重算。柱高从0开始；分位数按原始秒值频数计算，不按区间中点估计。'};
      const shell=element('div','detail-chart-panel workspace-chart-panel');shell.dataset.evidenceMetric='26';const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',spec.title+'；'+spec.note);
      const details=element('details','chart-data');details.append(element('summary','','查看完整频数'),dataTable(item.table));shell.append(element('h3','',item.title),box,details);content.append(shell);
      dynamicPlots.push([box,spec]);if(section.getClientRects().length)drawEvidenceChart(box,spec);
    }
    const exact=element('details','session-raw-duration');exact.append(element('summary','','查看时长原始秒值与会话频数'),dataTable({title:'时长原始频数 · R7验算',columns:['前台秒数','分钟','合格会话（次）'],rows:row.durations.map(([s,n])=>[s,(s/60).toFixed(3),n]),note:`合格会话 ${number(row.timedSessions)}次；P50 ${sessionDepthNumber(row.p50===null?null:row.p50/60,3)}分钟，P90 ${sessionDepthNumber(row.p90===null?null:row.p90/60,3)}分钟。少于30次不显示可靠分位数。`}));content.append(exact);updateScrollableTables();
  }
  select.addEventListener('change',()=>{selected=select.value;renderDistribution();document.querySelector('#announcement').textContent='已更新所选日分布，当前主值与登记日窗保持不变。';});
  if(part.rows){
    for(const[key,title,divisor,unit]of [['frequency','人均有效会话',1,'次/人'],['p50','会话时长 P50',60,'分钟'],['p90','会话时长 P90',60,'分钟']]){
      const spec={title:`${title} · 84个完整UTC日`,unit,nearestLinePoint:true,labels:part.rows.map(row=>row.end.slice(0,10)),series:[{name:title,values:part.rows.map(row=>row[key]===null?null:row[key]/divisor)}],
        note:'独立纵轴，只比较各自方向；趋势不表示留存或打开间隔。点击日期可在分组证据查看同日分布。',onPoint:index=>{selected=part.rows[index].end;select.value=selected;if(initialized)renderDistribution();document.querySelector('#announcement').textContent=`已选择截至${selected.slice(0,10)}的分布，可在分组证据查看；当前值与问题单保持不变。`;}};
      append(spec,{title:spec.title,columns:['截至日（UTC零时）',title+'（'+unit+'）','App活跃（人）','有效会话（次）','合格时长（次）'],rows:part.rows.map(row=>[row.end.slice(0,10),row[key]===null?'样本不足':(row[key]/divisor).toFixed(3),row.accounts,row.sessions,row.timedSessions]),note:spec.note},'change');
    }
  }else{const missing=element('p','na-note session-history-unavailable',part.historyReason);missing.dataset.evidenceKind='change';panel.append(missing);}
  panel.append(section);
  const full=dataTable({title:'84日会话 · 完整计数与分位数',columns:['UTC日窗（起含止不含）','App活跃（人）','会话（次）','次/人','合格时长（次）','P50（分钟）','P90（分钟）'],rows:(part.rows??[r]).map(row=>[`${row.start.slice(0,10)} → ${row.end.slice(0,10)}`,row.accounts,row.sessions,sessionDepthNumber(row.frequency,3),row.timedSessions,sessionDepthNumber(row.p50===null?null:row.p50/60,3),sessionDepthNumber(row.p90===null?null:row.p90/60,3)]),note:'每个日窗独立去重；跨日人数不相加。无合格分母或少于30人／次仅保留计数，不作可靠均值或分位数。'},'session-depth-full');full.dataset.evidenceKind='data';panel.append(full);
  const rules=element('details','session-depth-rules');rules.dataset.evidenceKind='data';rules.append(element('summary','','查看会话规则与模拟边界'));const ul=element('ul','');for(const text of [...part.source.rules,...part.source.limitations])ul.append(element('li','',text));rules.append(ul);panel.append(rules);
  return {node:section,init:()=>{initialized=true;renderDistribution();},refresh:()=>{if(initialized&&section.getClientRects().length)for(const[box,spec]of dynamicPlots)drawEvidenceChart(box,spec);}};
}

// Keep parent totals and their device-state subsets closed after allocation.
// Attribution remains the existing synthetic independent-dimension assumption.
function deviceStateProjection(state=filterState) {
  const parent=sourceData.metrics.m08,raw=sourceData.metrics.m50,sharing=sourceData.metrics.m49;
  const invalid=()=>({reason:'设备激活、绑定或共享的同日台数不闭合，需核验原始计数；不截断或回退旧结构。'});
  const fields=['boundActivated','boundNotActivated','activatedUnbound','sharedBoundActivated','sharedBoundNotActivated'];
  if(parent?.kind!=='group'||raw?.kind!=='group'||sharing?.kind!=='rate'||
    ![parent.value?.activatedCumulative,parent.value?.boundCurrent,sharing.numerator,sharing.denominator,...fields.map(key=>raw.value?.[key])].every(validHeadcount))return invalid();
  const p=parent.value,r=raw.value;
  if(p.boundCurrent!==sourceData.snapshot.boundDevicesCurrent||p.activatedCumulative!==sourceData.snapshot.activatedDevicesCumulative||
    r.boundActivated+r.boundNotActivated!==p.boundCurrent||r.boundActivated+r.activatedUnbound!==p.activatedCumulative||
    r.sharedBoundActivated>r.boundActivated||r.sharedBoundNotActivated>r.boundNotActivated||
    sharing.denominator!==p.boundCurrent||sharing.numerator!==r.sharedBoundActivated+r.sharedBoundNotActivated||
    !Number.isFinite(sharing.value)||Math.abs(sharing.value-(sharing.denominator?sharing.numerator/sharing.denominator:0))>1e-6)return invalid();
  const filters=effectiveFor(50,state);
  if(filters.some(([key,value])=>!policyFor(50).demonstrableDimensions.includes(key)||!sourceData.slices[key]?.[value]))return {reason:'此范围缺少设备状态归属，不能回退总体。'};
  const scope=Object.fromEntries(filters);if(scope.productLine&&scope.deviceModel&&(scope.productLine==='Hunting')!==(scope.deviceModel==='Hunt Pro'))return {reason:'产品线与设备型号组合无样本。'};
  const shares=sharesFor(filters,50),allocate=(n,kind='denominator')=>allocatedCount(n,filters,50,kind,shares);
  const boundCurrent=allocate(p.boundCurrent),activatedCumulative=allocate(p.activatedCumulative),boundNotActivated=allocate(r.boundNotActivated);
  const boundActivated=boundCurrent-boundNotActivated,activatedUnbound=activatedCumulative-boundActivated;
  const shared=allocate(sharing.numerator,sharing.value>.9?'denominator':'numerator');
  if(![boundCurrent,activatedCumulative,boundNotActivated,boundActivated,activatedUnbound,shared].every(validHeadcount)||shared>boundCurrent)return invalid();
  // Allocate the shared subset jointly rather than round its two parts independently.
  // Feasible bounds prevent a shared sub-state exceeding its parent at tiny scales.
  const lower=Math.max(0,shared-boundActivated),upper=Math.min(boundNotActivated,shared);
  const sharedBoundNotActivated=sharing.numerator?Math.min(upper,Math.max(lower,Math.round(shared*r.sharedBoundNotActivated/sharing.numerator))):0;
  return {value:{boundActivated,boundNotActivated,activatedUnbound,sharedBoundActivated:shared-sharedBoundNotActivated,sharedBoundNotActivated},
    boundCurrent,activatedCumulative,shared,scope:filters,note:'沿用原模拟分片估算，先确定绑定、累计激活及共享总数，再约束互斥子项闭合；没有逐设备关系明细，不能解释为实际设备迁移或解绑事件。'};
}
function deviceInventoryMetric(state=filterState) {
  const raw=sourceData.metrics.m08;
  if(raw?.kind!=='group'||![raw.value?.boundCurrent,raw.value?.activatedCumulative].every(validHeadcount)||raw.value.boundCurrent!==sourceData.snapshot.boundDevicesCurrent||raw.value.activatedCumulative!==sourceData.snapshot.activatedDevicesCumulative)return pending('设备绑定与累计激活的同日计数待核验，不沿用旧快照。');
  const filters=effectiveFor(8,state);return projectValue(raw,sharesFor(filters,8),filters,8);
}
function deviceSharingMetric(state=filterState) {
  const raw=sourceData.metrics.m49;
  if(raw?.kind!=='rate'||![raw.numerator,raw.denominator].every(validHeadcount)||raw.numerator>raw.denominator||raw.denominator!==sourceData.snapshot.boundDevicesCurrent||
    !Number.isFinite(raw.value)||Math.abs(raw.value-(raw.denominator?raw.numerator/raw.denominator:0))>1e-6)return pending('设备共享的分子、同日绑定设备分母或比例待核验，不截断坏计数。');
  const filters=effectiveFor(49,state);return projectValue(raw,sharesFor(filters,49),filters,49);
}
function deviceStateTable(part=deviceStateProjection()) {
  if(part.reason)return {title:'设备状态 · 待核验',columns:['状态'],rows:[[part.reason]]};
  const v=part.value,total=v.boundActivated+v.boundNotActivated+v.activatedUnbound;
  const ratio=(n,d)=>d>=30?percent(n/d):d?'样本不足30台':'无合格分母';
  return {title:'设备交叉状态 · 数量与包含关系',columns:['互斥状态','设备（台）','占三类并集','其中有共享（台）','其中无共享（台）'],
    rows:[['绑定且已激活',v.boundActivated,ratio(v.boundActivated,total),v.sharedBoundActivated,v.boundActivated-v.sharedBoundActivated],
      ['绑定未激活',v.boundNotActivated,ratio(v.boundNotActivated,total),v.sharedBoundNotActivated,v.boundNotActivated-v.sharedBoundNotActivated],
      ['已激活未绑定',v.activatedUnbound,ratio(v.activatedUnbound,total),'不属当前绑定共享分母','—'],
      ['三类并集',total,total>=30?'100.0%':ratio(total,total),'—','—']],
    note:`当前绑定 ${number(part.boundCurrent)} 台＝前两类；累计激活 ${number(part.activatedCumulative)} 台＝第一类＋第三类。共享 ${number(part.shared)} / ${number(part.boundCurrent)} 台；共享是绑定状态子集，不是第四种状态。三类并集不是全部出厂设备。${part.note}`};
}
function relationshipContextTable(spec) {
  if(spec.title==='主账号、共享与回绑'){
    const shared=metric(49),part=deviceStateProjection();
    return {...spec,rows:spec.rows.map(row=>row[0]!=='开启共享的绑定设备'?row:shared.kind==='rate'?
      [row[0],shared.numerator,shared.denominator,percent(shared.value)]:!part.reason?
        [row[0],part.shared,part.boundCurrent,part.boundCurrent?'样本不足30台':'无合格分母']:[row[0],'—','—',shared.reason??'共享计数待核验'])};
  }
  if(spec.title!=='设备状态双向核对'&&spec.title!=='共享作为绑定状态子维度')return spec;
  const part=deviceStateProjection();if(part.reason)return {title:spec.title+' · 待核验',columns:['状态'],rows:[[part.reason]],note:'其他可靠指标仍按自身来源展示。'};
  const v=part.value;
  return {...spec,rows:spec.title==='设备状态双向核对'?[
    ['当前绑定',`已激活 ${number(v.boundActivated)}`,`未激活 ${number(v.boundNotActivated)}`,`${number(part.boundCurrent)}台`],
    ['历史激活',`当前绑定 ${number(v.boundActivated)}`,`当前未绑定 ${number(v.activatedUnbound)}`,`${number(part.activatedCumulative)}台`]]:[
    ['绑定且已激活',v.sharedBoundActivated,v.boundActivated-v.sharedBoundActivated,v.boundActivated],
    ['绑定未激活',v.sharedBoundNotActivated,v.boundNotActivated-v.sharedBoundNotActivated,v.boundNotActivated],
    ['绑定设备合计',part.shared,part.boundCurrent-part.shared,part.boundCurrent]],note:part.note};
}

const qualityCount=v=>v===null?'待核验':number(v);
const qualityPercent=v=>v===null||v===undefined?'待核验':percent(v);
const qualityNote='30个完整UTC日，横轴为起始日，起含止不含；采集事件与ID关联记录分母独立。国家×App为新合成归属；事件类型只切换丢失率证据，不改变顶部整体质量状态。无可靠预期不计算丢失数或率。';
function qualityProjection(state=filterState,eventType='') {
  const source=sourceData.diagnostics.G.qualityFacts,invalid=()=>({reason:'质量日窗、来源或计数待核验，未回退旧汇总'}),filters=effectiveFor(54,state);
  if(filters.some(([key])=>!['country','appPlatform'].includes(key)))return {reason:'质量记录缺少当前维度归属；不能用总体或0代替'};
  const whole=n=>Number.isSafeInteger(n)&&n>=0,iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT00:00:00Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
  if(source?.status!=='approved-synthetic'||source.version!=='synthetic-quality-utc-v1'||source.classification!=='entirely_synthetic'||!iso(source.asOf)||!Array.isArray(source.days)||source.days.length!==30||Object.keys(source.eventTypes??{}).sort().join()!=='Account,Content,Notification'||eventType&&!Object.hasOwn(source.eventTypes,eventType))return invalid();
  const rows=[],match=r=>filters.every(([key,value])=>r[key]===value),sum=(rs,key)=>rs.reduce((n,r)=>n+r[key],0);
  for(const [i,d]of source.days.entries()){
    if(!iso(d.startInclusive)||!iso(d.endExclusive)||Date.parse(d.endExclusive)!==Date.parse(source.asOf)-(29-i)*86400000||Date.parse(d.endExclusive)-Date.parse(d.startInclusive)!==86400000||!Array.isArray(d.eventGroups)||d.eventGroups.length!==24||!Array.isArray(d.mappingGroups)||d.mappingGroups.length!==8)return invalid();
    const events=new Set(),maps=new Set(),group=r=>r&&['US','UK','DE','Other'].includes(r.country)&&['iOS','Android'].includes(r.appPlatform);
    for(const r of d.eventGroups){const key=`${r?.country}:${r?.appPlatform}:${r?.eventType}`;if(!group(r)||!Object.hasOwn(source.eventTypes,r.eventType)||events.has(key)||![r.expected,r.ingested].every(whole)||r.ingested>r.expected||typeof r.expectedReliable!=='boolean')return invalid();events.add(key);}
    for(const r of d.mappingGroups){const key=`${r?.country}:${r?.appPlatform}`;if(!group(r)||maps.has(key)||![r.records,r.mapped].every(whole)||r.mapped>r.records)return invalid();maps.add(key);}
    const selected=d.eventGroups.filter(r=>match(r)&&(!eventType||r.eventType===eventType)),mapping=d.mappingGroups.filter(match),reliable=selected.every(r=>r.expectedReliable),expected=sum(selected,'expected'),ingested=sum(selected,'ingested'),records=sum(mapping,'records'),mapped=sum(mapping,'mapped'),lost=reliable?expected-ingested:null;
    rows.push({start:d.startInclusive,end:d.endExclusive,expected,ingested,lost,records,mapped,reliable,loss:reliable&&expected>0?lost/expected:null,mapping:records>0?mapped/records:null});
  }
  return {rows,current:rows.at(-1),previous:rows.at(-2),source:source.version,note:qualityNote,eventType};
}
function qualityMetric(state=filterState) {
  const p=qualityProjection(state);if(p.reason)return pending(p.reason);const r=p.current;
  const rate=(n,d,v,reason)=>v===null?{kind:'na',value:null,numerator:n,denominator:d,reason}:{kind:'rate',value:v,numerator:n,denominator:d};
  const value={kind:'group',value:{eventLoss:rate(r.lost,r.expected,r.loss,r.reliable?'无合格预期事件':'预期事件数来源不可靠'),idMapping:rate(r.mapped,r.records,r.mapping,'无待关联记录')}};value.value.status=dataQualityState(value).label;return value;
}
function qualityHistory(key='loss',state=filterState,eventType='') {
  const p=qualityProjection(state,eventType);if(p.reason)return null;const loss=key==='loss',type=sourceData.diagnostics.G.qualityFacts.eventTypes[eventType],title=loss?`${type?type+' · ':''}事件丢失率`:'ID映射覆盖率';
  return {comparisonLabel:'较前完整日',nearestLinePoint:true,title,unit:'%',labels:p.rows.map(r=>r.start.slice(0,10)),values:p.rows.map(r=>r[key]===null?null:r[key]*100),details:p.rows.map(r=>r[key]===null?null:{numerator:loss?r.lost:r.mapped,denominator:loss?r.expected:r.records,basisLabel:loss?'丢失 / 预期事件':'成功关联 / 待关联记录',numeratorUnit:loss?'事件':'记录',denominatorUnit:loss?'事件':'记录'}),note:p.note};
}
function qualityWindow() {const p=qualityProjection();return p.reason?'质量日窗待核验':`质量完整日v1 · ${p.current.start} → ${p.current.end}（左含右不含）`;}
function qualityBaseline() {
  const p=qualityProjection();if(p.reason)return '质量计数证据待核验';
  const types=sourceData.diagnostics.G.qualityFacts.eventTypes;
  return '质量日证据v1：'+JSON.stringify({source:p.source,classification:'entirely_synthetic',windows:[p.previous,p.current],eventTypes:Object.fromEntries(Object.keys(types).map(key=>[key,qualityProjection(filterState,key).rows.slice(-2)]))});
}
function qualityHistoryTable(p=qualityProjection()) {
  return {title:'质量计数 · 30个完整UTC日',columns:['起点（含，UTC）','终点（不含，UTC）','入库事件','丢失 / 预期事件','丢失率','关联 / 待关联记录','映射覆盖率'],rows:p.rows.map(r=>[r.start,r.end,r.ingested,r.reliable?`${qualityCount(r.lost)} / ${number(r.expected)}`:'预期待核验；未算丢失数',qualityPercent(r.loss),`${number(r.mapped)} / ${number(r.records)}`,qualityPercent(r.mapping)]),note:qualityNote};
}
function qualityBaselineDetails(baseline) {
  const node=element('details','quality-baseline-details');node.append(element('summary','','查看首次保存的两日质量计数与事件类型证据'));
  try{const saved=JSON.parse(baseline.slice('质量日证据v1：'.length));node.append(element('p','table-note',`合成来源 ${saved.source}；两类分母独立。`),dataTable({...qualityHistoryTable({rows:saved.windows}),title:'首次保存 · 两日整体质量计数'}));for(const [key,rows]of Object.entries(saved.eventTypes))node.append(dataTable({...qualityHistoryTable({rows}),title:`首次保存 · ${sourceData.diagnostics.G.qualityFacts.eventTypes[key]??key}丢失计数`}));}
  catch{node.append(element('p','na-note','原质量证据文本无法解析，保留原文，不以当前数据替换。'),element('p','table-note',baseline));}return node;
}
function qualityEvidence(panel,appendPair) {
  const p=qualityProjection();if(p.reason)return null;
  panel.append(element('p','table-note quality-window',qualityWindow()));
  for(const key of ['loss','mapping']){const history=qualityHistory(key);appendPair({...history,metricId:54,title:`${history.title} · 30个完整日`,series:[{name:history.title,values:history.values,details:history.details,color:key==='loss'?'#bf762b':'#356d51'}]},qualityHistoryTable(p),'change');}
  const full=dataTable(qualityHistoryTable(p),'quality-history-table');full.dataset.evidenceKind='data';panel.append(full);
  const node=element('section','entity-workspace quality-explorer');node.dataset.evidenceKind='groups';node.append(element('h3','','采集事件类型与App证据'),element('p','table-note',qualityNote));
  const platformRows=['iOS','Android'].map(appPlatform=>{const r=qualityProjection({...filterState,appPlatform}).current;return [appPlatform,qualityPercent(r.loss),`${qualityCount(r.lost)} / ${number(r.expected)}`,qualityPercent(r.mapping),`${number(r.mapped)} / ${number(r.records)}`];});
  node.append(dataTable({title:'同国家范围 · 两平台对照（不沿用平台选择）',columns:['App','丢失率','丢失 / 预期事件','映射覆盖率','关联 / 待关联记录'],rows:platformRows,note:'平台对照保留所选国家，点击平台行应用该App；事件类型不改变ID关联总体。'},'quality-platform-table'));
  node.querySelectorAll('.quality-platform-table tbody tr').forEach((row,i)=>{const cell=row.children[0],link=element('a','',platformRows[i][0]),params=new URLSearchParams(location.hash.split('?')[1]??'');params.set('metric','54');params.set('appPlatform',platformRows[i][0]);params.set('panel','groups');link.href='#/G?'+params;cell.replaceChildren(link);});
  const label=element('label','retention-month-control','丢失率证据视角'),select=element('select','quality-event-type');select.setAttribute('aria-label','丢失率事件类型');
  for(const [key,name]of [['','全部事件'],...Object.entries(sourceData.diagnostics.G.qualityFacts.eventTypes)]){const option=element('option','',name);option.value=key;select.append(option);}label.append(select);node.append(label);
  const chartPanel=element('div','detail-chart-panel'),title=element('h3',''),box=element('div','detail-chart');box.setAttribute('role','img');const scale=element('p','chart-scale-note'),detail=element('details','workspace-calculation');detail.append(element('summary','','查看30日完整计数'));chartPanel.append(title,box,scale,detail);node.append(chartPanel);
  const typeRows=Object.entries(sourceData.diagnostics.G.qualityFacts.eventTypes).map(([key,name])=>{const r=qualityProjection(filterState,key).current;return [key,name,`${qualityCount(r.lost)} / ${number(r.expected)}`,qualityPercent(r.loss)];});
  const types=dataTable({title:'最新完整日 · 事件类型',columns:['事件类型','丢失 / 预期事件','丢失率'],rows:typeRows.map(r=>r.slice(1))},'quality-type-table');node.append(types);
  types.querySelectorAll('tbody tr').forEach((row,i)=>{const button=element('button','',typeRows[i][1]);button.type='button';button.addEventListener('click',()=>{select.value=typeRows[i][0];render();select.focus({preventScroll:true});});row.children[0].replaceChildren(button);});
  const render=()=>{const history=qualityHistory('loss',filterState,select.value),part=qualityProjection(filterState,select.value),spec={...history,metricId:54,title:`${history.title} · 30个完整日`,series:[{name:history.title,values:history.values,details:history.details}]};title.textContent=spec.title;box.setAttribute('aria-label',spec.title+'；'+qualityNote);const table=dataTable(qualityHistoryTable(part));detail.replaceChildren(element('summary','','查看30日完整计数'),table);scale.textContent=chartScaleNote(spec);const old=window.echarts?.getInstanceByDom(box);if(old){destroyChart(old);const i=detailCharts.indexOf(old);if(i>=0)detailCharts.splice(i,1);}drawEvidenceChart(box,spec);updateScrollableTables();};
  select.addEventListener('change',render);panel.append(node);return {node,init:render,refresh:()=>{const instance=window.echarts?.getInstanceByDom(box);if(instance&&node.getClientRects().length){refreshChartTypography(instance);instance.resize();}}};
}

function qualityContextTable(spec) {
  if(!['数据质量与业务信号','异常信号与前期基线'].includes(spec.title))return spec;
  const p=qualityProjection();if(p.reason)return {...spec,rows:[['数据质量','—','—',p.reason]],note:qualityNote};
  const r=p.current,previous=p.previous,q=dataQualityState(metric(54));
  return {...spec,rows:spec.rows.map(row=>row[0]==='流失高危主账号'?[row[0],metric(52).kind==='count'?metric(52).value:'—','—',metric(52).kind==='count'?'同源合成风险名单':'风险来源待核验']:row[0]==='埋点事件丢失率'?[row[0],qualityCount(r.lost),r.expected,qualityPercent(r.loss)]:row[0]==='ID-Mapping覆盖率'?[row[0],r.mapped,r.records,qualityPercent(r.mapping)]:row[0]==='数据状态'?[row[0],'演示判断','—',q.label]:row[0]==='埋点丢失率'?[row[0],previous.start.slice(0,10)+' '+qualityPercent(previous.loss),r.start.slice(0,10)+' '+qualityPercent(r.loss),'完整UTC日；演示阈值，不推断生产达标']:row),note:spec.note+' 质量子项：'+qualityWindow()};
}

const anomalyDimensions=['country','appPlatform','anomalyType'];
const anomalyNote='30个连续24小时窗口，按同一合成异常发现记录去重；不是受影响用户或设备数。统一近4周告警基线、严重程度及影响人数待补。';
function anomalyProjection(state=filterState) {
  const source=sourceData.diagnostics.G.anomalyEvents,invalid=()=>({reason:'异常事件来源、归属或24小时窗口待核验，未回退原汇总'});
  const filters=effectiveFor(53,state),unsupported=filters.find(([key])=>!anomalyDimensions.includes(key));
  if(unsupported)return {reason:`${filterLabels[unsupported[0]]}适用，但异常记录缺少该归属，不能用总体或0代替`};
  const iso=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().replace('.000Z','Z')===s;
  if(!source||source.status!=='approved-synthetic'||source.version!=='synthetic-anomaly-events-noon-v1'||source.classification!=='entirely_synthetic'||!iso(source.asOf)||!Array.isArray(source.windows)||source.windows.length!==30||!Array.isArray(source.events))return invalid();
  const byId=new Map(),covered=new Set();
  for(const e of source.events){
    if(!e||typeof e.id!=='string'||!e.id||byId.has(e.id)||!iso(e.observedAt)||!['US','UK','DE','Other'].includes(e.country)||!['iOS','Android'].includes(e.appPlatform)||!['Business','Device','Quality'].includes(e.anomalyType)||!['signal','status','scope','review','domain'].every(k=>typeof e[k]==='string'&&e[k])||!e.evidence||!supportsPageMetric(e.evidence.page,e.evidence.metricId)||e.severity!==null||e.affectedCount!==null)return invalid();
    byId.set(e.id,e);
  }
  const rows=[];
  for(const [i,w] of source.windows.entries()){
    if(!w||!iso(w.startInclusive)||!iso(w.endExclusive)||Date.parse(w.endExclusive)!==Date.parse(source.asOf)-(29-i)*86400000||Date.parse(w.endExclusive)-Date.parse(w.startInclusive)!==86400000||!Array.isArray(w.eventIds))return invalid();
    const events=[];
    for(const id of w.eventIds){const e=byId.get(id);if(!e||covered.has(id)||e.observedAt<w.startInclusive||e.observedAt>=w.endExclusive)return invalid();covered.add(id);if(filters.every(([key,value])=>e[key]===value))events.push(e);}
    rows.push({...w,events,count:events.length});
  }
  if(covered.size!==byId.size)return invalid();
  return {rows,current:rows.at(-1),previous:rows.at(-2),note:anomalyNote,source:source.version};
}
function anomalyWindow() {
  const p=anomalyProjection();return p.reason?'异常24小时窗口待核验':`异常24小时v1 · ${p.current.startInclusive} → ${p.current.endExclusive}（左含右不含）`;
}
function anomalyBaseline() {
  const p=anomalyProjection();if(p.reason)return '异常事件证据待核验';
  return '异常事件证据v1：'+JSON.stringify({source:p.source,windows:[p.previous,p.current].map(w=>({start:w.startInclusive,end:w.endExclusive,events:[...w.events].sort((a,b)=>a.id.localeCompare(b.id)).map(e=>({id:e.id,at:e.observedAt,country:e.country,app:e.appPlatform,type:e.anomalyType,signal:e.signal,status:e.status,evidence:e.evidence}))}))});
}
function anomalyBaselineDetails(baseline) {
  const detail=element('details','anomaly-baseline-details');detail.append(element('summary','','查看首次保存的两窗异常事件证据'));
  try{const saved=JSON.parse(baseline.slice('异常事件证据v1：'.length));for(const w of saved.windows){detail.append(element('p','table-note',`${w.start} → ${w.end} · ${w.events.length}条`));detail.append(dataTable({title:'首次保存事件',columns:['ID','观测时间（UTC）','国家/App','异常类型','发现'],rows:w.events.map(e=>[e.id,e.at,`${optionLabel('country',e.country)} / ${e.app}`,optionLabel('anomalyType',e.type),e.signal])}));}}catch{detail.append(element('p','na-note','原证据文本无法解析，未用当前数据替换。'),element('p','table-note',baseline));}return detail;
}
function anomalyContextTable(spec) {
  const p=anomalyProjection();return {...spec,title:'最新24小时异常事件',rows:p.reason?[['—','—',p.reason,'待核验']]:p.current.events.map(e=>[e.id,e.domain,e.signal,e.status]),note:anomalyNote};
}
function anomalyHistoryTable(p=anomalyProjection()) {
 return {title:'异常发现 · 30个完整24小时窗口',columns:['起点（含，UTC）','终点（不含，UTC）','发现数（条）'],rows:p.rows.map(w=>[w.startInclusive,w.endExclusive,w.count]),note:anomalyNote};
}
function anomalyEventExplorer() {
  const node=element('section','entity-workspace anomaly-event-workspace'),part=anomalyProjection();
  node.append(element('h3','','异常事件 · 同源清单'));
  if(part.reason){node.append(element('p','na-note',part.reason));return node;}
  node.append(element('p','table-note','顶部主值与趋势按完整窗口计算；以下历史选择和查找只缩小清单。'));
  const controls=element('div','anomaly-list-controls'),windowLabel=element('label','','清单窗口'),select=element('select',''),searchLabel=element('label','','查找事件'),search=element('input','');
  search.type='search';search.placeholder='编号、发现、国家或状态';search.autocomplete='off';
  for(const w of [...part.rows].reverse()){const option=element('option','',`${w.endExclusive.slice(5,10)} 12:00 UTC 截止 · ${w.count}条`);option.value=w.endExclusive;select.append(option);}
  windowLabel.append(select);searchLabel.append(search);controls.append(windowLabel,searchLabel);node.append(controls);
  const basis=element('p','table-note anomaly-list-basis'),status=element('p','table-note anomaly-list-status'),grid=element('div','entity-workspace-grid'),list=element('div','anomaly-event-list'),detail=element('aside','entity-sample-detail');
  detail.id='G-anomaly-event-detail';detail.setAttribute('aria-label','选中异常事件');list.setAttribute('role','group');list.setAttribute('aria-label','同源异常事件列表');grid.append(list,detail);node.append(basis,status,grid);let chosen;
  const choose=(e,announce=false)=>{
    chosen=e.id;const viewport={left:scrollX,top:scrollY,behavior:'instant'};
    for(const b of list.querySelectorAll('button')){b.setAttribute('aria-pressed',String(b.dataset.eventId===e.id));b.closest('tr').toggleAttribute('data-selected',b.dataset.eventId===e.id);}
    const facts=element('dl','inspector-facts');for(const [k,v]of [['观测时间',e.observedAt.replace('T',' ').replace('Z',' UTC')],['国家/App',`${optionLabel('country',e.country)} / ${e.appPlatform}`],['异常类型',optionLabel('anomalyType',e.anomalyType)],['研判状态',e.status],['严重程度','待评级'],['影响人数','未知'],['关联范围',e.scope]]){const row=element('div','');row.append(element('dt','',k),element('dd','',v));facts.append(row);}
    const link=element('a','inspector-link',`查看关联指标 #${e.evidence.metricId} 证据 ↗`);link.href=routeHref(e.evidence.page,e.evidence.metricId);
    detail.replaceChildren(element('p','inspector-kicker',e.id),element('h4','',e.signal),facts,element('p','entity-sample-review',`建议核对：${e.review}`),link,element('p','table-note','关联指标按自身周期和范围计算；合成归属不建立跨源用户或设备身份。查看证据不会替换已有问题单。'));
    if(announce){scrollTo(viewport);document.querySelector('#announcement').textContent=`已选择 ${e.id}，原位详情已更新；问题单未改变。`;}
  };
  const draw=()=>{
    const w=part.rows.find(w=>w.endExclusive===select.value),query=search.value.trim().normalize('NFKC').toLocaleLowerCase(),events=w.events.filter(e=>!query||[e.id,e.signal,e.country,optionLabel('country',e.country),e.appPlatform,e.status,e.domain,optionLabel('anomalyType',e.anomalyType)].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query));
    basis.textContent=`${w.startInclusive.replace('T',' ').replace('Z','')} → ${w.endExclusive.replace('T',' ').replace('Z','')} UTC（左含右不含）`;
    status.textContent=`显示 ${events.length} / ${w.count} 条；最新24小时 ${part.current.count} 条。查找不改变指标和趋势。`;
    if(!events.length){list.replaceChildren(element('p','na-note',w.count?'没有匹配当前查找的事件；清除查找可恢复此窗清单。':'此完整窗口已知0条合成异常发现，来源完整。'));detail.replaceChildren(element('h4','','暂无选中事件'));chosen=null;return;}
    const table=dataTable({title:'异常事件清单',columns:['事件编号','观测（UTC）','发现与状态'],rows:events.map(e=>[e.id,e.observedAt.slice(11,16),`${e.signal} · ${e.status}`])},'anomaly-event-table');
    [...table.querySelectorAll('tbody tr')].forEach((tr,i)=>{const e=events[i],button=element('button','retention-device-select',e.id);button.type='button';button.dataset.eventId=e.id;button.setAttribute('aria-controls',detail.id);button.setAttribute('aria-label',`查看${e.id} ${e.signal}`);tr.firstChild.replaceChildren(button);button.addEventListener('click',()=>choose(e,true));});list.replaceChildren(table);choose(events.find(e=>e.id===chosen)??events[0]);updateScrollableTables();
  };
  node.selectAnomalyWindow=end=>{if(part.rows.some(w=>w.endExclusive===end)){select.value=end;draw();select.focus({preventScroll:true});}};
  select.addEventListener('change',draw);search.addEventListener('input',draw);draw();return node;
}


// #51: opening populations and unbind/rebind episodes are one synthetic monthly ledger.
const UNBINDING_DAY=86400000,unbindingCountries={US:'美国',UK:'英国',DE:'德国',Other:'其他'};
const unbindingModels={K6:'Bird','Bird Lite':'Bird','Bird Pro':'Bird','Hunt Pro':'Hunting'};
const unbindingDates=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
const unbindingWhole=n=>Number.isSafeInteger(n)&&n>=0;
let unbindingSourceCache;
function unbindingOutcome(r,days,s=sourceData.diagnostics.F.unbindingFacts){
 const first=[...r.unbindings].sort((a,b)=>a.at.localeCompare(b.at))[0],at=Date.parse(first.at),end=at+days*UNBINDING_DAY;
 const firstBind=[...r.bindings].sort((a,b)=>a.at.localeCompare(b.at)).find(b=>Date.parse(b.at)>at);
 return {first,firstBind,end:new Date(end).toISOString().replace('.000Z','Z'),mature:Date.parse(s.asOf)>=end,hit:Boolean(firstBind&&Date.parse(firstBind.at)<=end)};
}
function validateUnbindingSource(s){
 if(s?.status!=='approved-synthetic'||s.version!=='synthetic-monthly-unbinding-v1'||s.classification!=='entirely_synthetic'||!unbindingDates(s.asOf)||!Array.isArray(s.months)||s.months.length!==12||!s.months.some(m=>m.month===s.defaultMonth))throw Error('候选来源或月份待核验');
 if(JSON.stringify(s.models)!==JSON.stringify(unbindingModels)||Object.keys(s.reasons??{}).join(',')!=='Move,Transfer,Return,Connection,Unknown'||Object.keys(s.appVersions??{}).join(',')!=='Demo-A,Demo-B,Unknown')throw Error('型号、原因或版本定义无效');
 const globalIds=new Set(),eventIds=new Set();let previous;
 for(const m of s.months){const start=Date.parse(m.startInclusive),end=Date.parse(m.endExclusive);if(!/^\d{4}-\d\d$/.test(m.month)||m.startInclusive!==m.month+'-01T00:00:00Z'||!unbindingDates(m.endExclusive)||new Date(start).getUTCDate()!==1||new Date(end).getUTCDate()!==1||end!==Date.UTC(new Date(start).getUTCFullYear(),new Date(start).getUTCMonth()+1,1)||end-start<28*UNBINDING_DAY||end-start>31*UNBINDING_DAY||end>Date.parse(s.asOf)||previous&&m.startInclusive!==previous||!Array.isArray(m.openingGroups)||m.openingGroups.length!==64||!Array.isArray(m.devices))throw Error('完整月窗口或月初归属缺行');previous=m.endExclusive;
  const validGroup=r=>r&&Object.hasOwn(unbindingCountries,r.country)&&['iOS','Android'].includes(r.appPlatform)&&Object.hasOwn(s.models,r.deviceModel)&&r.productLine===s.models[r.deviceModel]&&['Effective','Inactive'].includes(r.deviceStatus),groups=new Set();
  for(const r of m.openingGroups){const key=[r.country,r.appPlatform,r.deviceModel,r.deviceStatus].join(':');if(!validGroup(r)||groups.has(key)||!unbindingWhole(r.count)||r.deviceStatus==='Inactive'&&r.count!==0)throw Error('月初分母重复、归属或数量无效');groups.add(key);}
  for(const r of m.devices){if(!validGroup(r)||r.deviceStatus!=='Effective'||typeof r.id!=='string'||!r.id||globalIds.has(r.id)||!Array.isArray(r.unbindings)||!r.unbindings.length||!Array.isArray(r.bindings))throw Error('设备ID、归属或事件来源无效');globalIds.add(r.id);const us=[...r.unbindings].sort((a,b)=>a.at.localeCompare(b.at)),bs=[...r.bindings].sort((a,b)=>a.at.localeCompare(b.at));
   if(Date.parse(us[0].at)<start||Date.parse(us[0].at)>=end||us.some(u=>!unbindingDates(u.at)||Date.parse(u.at)>=end||Date.parse(u.at)<start||Date.parse(u.at)>=Date.parse(s.asOf)||!Object.hasOwn(s.reasons,u.reason)||!Object.hasOwn(s.appVersions,u.appVersion)))throw Error('解绑事件不在该月或原因/版本无效');
   if(bs.some(b=>!unbindingDates(b.at)||Date.parse(b.at)<=Date.parse(us[0].at)||Date.parse(b.at)>Date.parse(s.asOf)||!['same','different','unknown'].includes(b.ownerRelation)))throw Error('回绑事件越过快照或顺序无效');
   const timeline=[...us.map(u=>({...u,type:'U'})),...bs.map(b=>({...b,type:'B'}))].sort((a,b)=>a.at.localeCompare(b.at));let bound=true,ids=new Set();for(const e of timeline){if(typeof e.id!=='string'||!e.id||ids.has(e.id)||eventIds.has(e.id)||e.type==='U'&&!bound||e.type==='B'&&bound)throw Error('重复ID或事件不构成解绑—回绑序列');ids.add(e.id);eventIds.add(e.id);bound=e.type==='B';}
  }
  const controls={devices:m.devices.length,events:m.devices.reduce((n,r)=>n+r.unbindings.length,0),opening:m.openingGroups.reduce((n,r)=>n+r.count,0)};
  for(const days of[7,30]){const values=m.devices.map(r=>unbindingOutcome(r,days,s));controls['mature'+days]=values.filter(o=>o.mature).length;controls['observed'+days]=values.filter(o=>o.hit).length;}
  if(!m.controls||Object.entries(controls).some(([k,v])=>m.controls[k]!==v))throw Error('设备清单、事件或观察计数与来源控制数不闭合');
  const grouped=new Map();for(const r of m.devices){const key=[r.country,r.appPlatform,r.deviceModel,r.deviceStatus].join(':');grouped.set(key,(grouped.get(key)||0)+1);}if(m.openingGroups.some(g=>(grouped.get([g.country,g.appPlatform,g.deviceModel,g.deviceStatus].join(':'))||0)>g.count))throw Error('解绑设备超出候选月初分母群');
 }
}

function unbindingIndex(){
 const source=sourceData.diagnostics.F.unbindingFacts;
 if(unbindingSourceCache&&unbindingSourceCache.source===source)return unbindingSourceCache.result;
 let result;
 try{validateUnbindingSource(source);if(source.asOf!==sourceData.snapshot.asOf+'T00:00:00Z')throw Error('快照不一致');result={source,rows:source.months,defaultMonth:source.defaultMonth};}
 catch{result={reason:'解绑月窗、月初归属或事件计数待核验；未回退旧汇总或独立比例估算。'};}
 unbindingSourceCache={source,result};return result;
}
function unbindingProjection(state=filterState,month=unbindingMonthRequest[0]??unbindingIndex().defaultMonth){
 const index=unbindingIndex();if(index.reason)return index;
 if(unbindingMonthRequest.length>1||!index.rows.some(m=>m.month===month))return {reason:'解绑观察月无效或包含多个值，请选择一个完整解绑月。'};
 const f=effectiveFor(51,state);if(f.some(([key])=>!['country','appPlatform','deviceModel','productLine','deviceStatus'].includes(key)))return {reason:'当前条件缺少同源解绑归属。'};
 const match=r=>f.every(([k,v])=>r[k]===v),m=index.rows.find(m=>m.month===month),rows=m.devices.filter(match),opening=m.openingGroups.filter(match).reduce((n,r)=>n+r.count,0),n=rows.length;
 const out={month,start:m.startInclusive,end:m.endExclusive,asOf:index.source.asOf,opening,devices:n,events:rows.reduce((n,r)=>n+r.unbindings.length,0),rate:opening>0?n/opening:null,rows};
 for(const days of[7,30]){const values=rows.map(r=>unbindingOutcome(r,days)),mature=values.filter(o=>o.mature).length,hits=values.filter(o=>o.hit).length;
  out['D'+days]={numerator:n&&mature===n?hits:null,observedHits:hits,denominator:n,mature,value:n>=30&&mature===n?hits/n:null,status:!n?'无解绑设备':mature!==n?'观察中':n<30?'样本不足30台':'观察完成'};}
 return out;
}
function unbindingRate(part){return part.value===null?na(part.status):{kind:'rate',value:part.value,numerator:part.numerator,denominator:part.denominator};}
function unbindingMetric(state){const p=unbindingProjection(state);if(p.reason)return pending(p.reason);
 if(!p.opening)return na(state.deviceStatus==='Inactive'?'月初已注销／报废设备不属于月初已绑定群；不适用。':'所选产品线、型号或月初状态组合无绑定分母。');
 return {kind:'group',value:{cohort:p.month,unboundEvents:p.events,observedUnboundDevices:p.devices,unboundDeviceRate:{kind:'rate',numerator:p.devices,denominator:p.opening,value:p.rate},reboundWithin7d:unbindingRate(p.D7),reboundWithin30d:unbindingRate(p.D30)}};
}
const unbindingDevicePercent=v=>v===null?'不适用':`${(v*100).toFixed(2)}%`;
const unbindingPercent=p=>p.value===null?p.status:percent(p.value);
const unbindingBasis=p=>`${number(p.observedHits)} / ${number(p.denominator)}台${p.mature!==p.denominator?`；成熟${number(p.mature)}台，非最终比例`:p.denominator<30?'；保留计数':''}`;
const unbindingNote='月初归属冻结；当月首次解绑去重，重复解绑另计事件。7／30个24小时内含等号；未成熟和小样本不补0，未回绑不等于已流失。';
function unbindingWindow(){const p=unbindingProjection();return p.reason?'解绑月窗待核验':`解绑月v1 · ${p.start} → ${p.end} · 观察截至 ${p.asOf}`;}
function unbindingHistoryTable(rows=unbindingIndex().rows?.map(m=>unbindingProjection(filterState,m.month))??[]){return {title:'解绑与回绑 · 12月计数',columns:['解绑月','解绑 / 月初绑定（台）','解绑事件（次）','解绑率','7日回绑计数 / 比例','30日回绑计数 / 比例'],rows:rows.map(r=>[r.month,`${number(r.devices)} / ${number(r.opening)}`,r.events,unbindingDevicePercent(r.rate),`${unbindingBasis(r.D7)} · ${unbindingPercent(r.D7)}`,`${unbindingBasis(r.D30)} · ${unbindingPercent(r.D30)}`]),note:unbindingNote};}
function unbindingModelsTable(){const index=unbindingIndex();return {title:'型号对照 · 同一解绑月',columns:['型号','解绑 / 月初绑定（台）','解绑率','7日回绑','30日回绑'],rows:Object.keys(index.source.models).map(model=>{const p=unbindingProjection({...filterState,deviceModel:model});return [model,...(p.opening?[`${number(p.devices)} / ${number(p.opening)}`,unbindingDevicePercent(p.rate),`${unbindingBasis(p.D7)} · ${unbindingPercent(p.D7)}`,`${unbindingBasis(p.D30)} · ${unbindingPercent(p.D30)}`]:['不属于所选产品线或状态','不适用','不适用','不适用'])];}),note:'型号横向对照保留国家、App、产品线和月初状态，逐行替换型号选择。'};}
function unbindingReasons(p=unbindingProjection()){return Object.keys(unbindingIndex().source.reasons).map(key=>({key,count:p.rows.filter(r=>unbindingOutcome(r,7).first.reason===key).length}));}
function unbindingBaseline(){const p=unbindingProjection();return '解绑月证据v1：'+JSON.stringify({source:unbindingIndex().source.version,month:p.month,start:p.start,end:p.end,asOf:p.asOf,opening:p.opening,devices:p.devices,events:p.events,rate:p.rate,D7:p.D7,D30:p.D30,models:unbindingModelsTable().rows,reasons:unbindingReasons(p)});}
function unbindingBaselineDetails(baseline){const node=element('details','unbinding-baseline-details');node.append(element('summary','','查看首次保存的解绑月、计数与分组证据'));
 try{const p=JSON.parse(baseline.slice('解绑月证据v1：'.length));node.append(element('p','table-note',`来源 ${p.source}；观察截至 ${p.asOf}`),dataTable({...unbindingHistoryTable([p]),title:'首次保存 · 解绑与回绑'}),dataTable({title:'首次保存 · 型号对照',columns:unbindingModelsTable().columns,rows:p.models}),dataTable({title:'首次保存 · 首次解绑原因',columns:['原因代码','设备（台）'],rows:p.reasons.map(r=>[r.key,r.count])}));}
 catch{node.append(element('p','na-note','原证据无法解析；保留原文，不用当前值替换。'),element('p','table-note',baseline));}return node;}
function unbindingControl(){const wrap=element('div','retention-month-control'),label=element('label','','解绑观察月（仅#51）'),select=element('select','');select.name='unbindingMonth';select.setAttribute('aria-label','解绑观察月（仅#51）');const index=unbindingIndex(),p=unbindingProjection();
 if(p.reason){const o=element('option','','月份待修正');o.value='invalid';o.disabled=true;select.append(o);}
 for(const m of index.rows??[]){const o=element('option','',m.month);o.value=m.month;select.append(o);}select.value=p.reason?'invalid':p.month;
 select.addEventListener('change',()=>{const params=new URLSearchParams(location.hash.split('?')[1]??'');params.delete('unbindingMonth');if(select.value!==index.defaultMonth)params.set('unbindingMonth',select.value);pushRoute(`#/F?${params}`);renderRoute({preserveScroll:true});document.querySelector('[name=unbindingMonth]')?.focus({preventScroll:true});document.querySelector('#announcement').textContent=`解绑月已切换${select.value}；仅更新#51及其登记范围。`;});label.append(select);wrap.append(label);return wrap;
}
function unbindingEvidence(panel,appendPair){const p=unbindingProjection(),index=unbindingIndex(),history=index.rows.map(m=>unbindingProjection(filterState,m.month)),labels=history.map(r=>r.month),table=unbindingHistoryTable(history);
 const windowNote=element('p','table-note unbinding-window',`${unbindingWindow()}；${p.D30.status==='观察中'?`30日观察仅${p.D30.mature}/${p.devices}台成熟，暂不报最终率。`:unbindingNote}`);windowNote.dataset.evidenceKind='change';panel.append(windowNote);
 const onPoint=i=>{const select=document.querySelector('[name=unbindingMonth]');if(select&&index.rows[i]){select.value=index.rows[i].month;select.dispatchEvent(new Event('change'));}};
 appendPair({metricId:51,title:'解绑设备率 · 12个完整月',unit:'%',labels,selectedPeriod:p.month,series:[{name:'解绑 / 月初绑定',values:history.map(r=>r.rate===null?null:r.rate*100),details:history.map(r=>({numerator:r.devices,denominator:r.opening,numeratorUnit:'台',denominatorUnit:'台'}))}],onPoint,note:unbindingNote},table,'change');
 appendPair({metricId:51,title:'同批次7／30日回绑率 · 12月',unit:'%',labels,selectedPeriod:p.month,series:[7,30].map(days=>({name:`${days}日回绑率`,values:history.map(r=>r['D'+days].value===null?null:r['D'+days].value*100),details:history.map(r=>({numerator:r['D'+days].numerator,denominator:r.devices,numeratorUnit:'台',denominatorUnit:'台'}))})),onPoint,note:'完整解绑月不等于回绑观察已成熟；空缺保留计数，不连接、不补0。'},table,'change');
 const models=unbindingModelsTable(),t=dataTable(models,'unbinding-model-table');t.dataset.evidenceKind='groups';[...t.querySelectorAll('tbody tr')].forEach((tr,i)=>{const model=Object.keys(index.source.models)[i],button=element('button','retention-device-select',model);button.type='button';button.disabled=!unbindingProjection({...filterState,deviceModel:model}).opening;button.addEventListener('click',()=>{changeFilter('F','deviceModel',model);});tr.firstChild.replaceChildren(button);});panel.append(t);
 const reasons=unbindingReasons(p),reasonSpec={title:'首次解绑原因 · 去重设备',columns:['自报原因','设备（台）'],rows:reasons.map(r=>[index.source.reasons[r.key],r.count]),note:'模拟自报标签，不证明原因。每台只取首次解绑原因；版本与原因只筛清单。'};
 appendPair({metricId:51,title:reasonSpec.title,unit:'台',onPoint:i=>{const select=panel.querySelector('[aria-label="首次解绑原因（仅清单）"]');if(select&&reasons[i]){select.value=reasons[i].key;select.dispatchEvent(new Event('change'));select.focus({preventScroll:true});}},labels:reasonSpec.rows.map(r=>r[0]),series:[{name:'去重设备',values:reasons.map(r=>r.count)}],note:reasonSpec.note},reasonSpec,'groups');
 panel.append(unbindingList(p));const full=dataTable(table,'unbinding-history-table');full.dataset.evidenceKind='data';panel.append(full);
 const method=element('details','unbinding-method');method.dataset.evidenceKind='data';method.append(element('summary','','来源与观察规则'),element('p','table-note',[...index.source.rules,...index.source.limitations].join(' ')));panel.append(method);
}
const unbindingListState=new Map();
function unbindingList(p){const source=unbindingIndex().source,node=element('section','unbinding-device-list');node.dataset.evidenceKind='groups';node.append(element('h3','','所选解绑月 · 设备清单与事件'));
 const key=recordScope('F',51),state=unbindingListState.get(key)??{version:'',reason:'',query:'',page:0,selected:null};unbindingListState.set(key,state);
 const controls=element('div','binding-list-controls');
 for(const [key,label,options]of [['version','首次解绑版本',source.appVersions],['reason','首次解绑原因',source.reasons]]){const l=element('label','',label),select=element('select','');select.setAttribute('aria-label',label+'（仅清单）');const all=element('option','','全部');all.value='';select.append(all);for(const [k,v]of Object.entries(options)){const o=element('option','',v);o.value=k;select.append(o);}select.value=state[key];select.addEventListener('change',()=>{state[key]=select.value;state.page=0;draw();});l.append(select);controls.append(l);}
 const l=element('label','','查找设备'),input=element('input','');input.type='search';input.value=state.query;input.setAttribute('aria-label','搜索解绑设备');input.addEventListener('input',()=>{state.query=input.value;state.page=0;draw();});l.append(input);controls.append(l);
 const reset=element('button','filter-reset','清除清单条件');reset.type='button';reset.addEventListener('click',()=>{state.query=state.version=state.reason='';state.page=0;controls.querySelectorAll('select,input').forEach(n=>n.value='');draw();reset.focus({preventScroll:true});});controls.append(reset);
 const result=element('p','table-note unbinding-list-status'),list=element('div',''),paging=element('div','binding-list-pagination'),detail=element('section','entity-detail unbinding-device-detail');detail.id='unbinding-device-detail';detail.setAttribute('aria-label','解绑设备原位详情');node.append(controls,result,list,paging,detail,element('p','table-note','清单条件不改变顶部、趋势和问题单范围。演示A／B不是实际App版本。'));
 const choose=(r)=>{state.selected=r?.id??null;detail.replaceChildren(element('h4','',r?r.id:'选择设备查看原位事件'));if(!r)return;
  detail.append(element('p','table-note',`${optionLabel('country',r.country)} · ${r.deviceModel} · ${r.appPlatform} · 月初有效；7日${unbindingOutcome(r,7).mature?(unbindingOutcome(r,7).hit?'已回绑':'未回绑'):'观察中'}／30日${unbindingOutcome(r,30).mature?(unbindingOutcome(r,30).hit?'已回绑':'未回绑'):'观察中'}；30日截止${unbindingOutcome(r,30).end}`));
  const events=[...r.unbindings.map(e=>({...e,type:'解绑'})),...r.bindings.map(e=>({...e,type:'回绑'}))].sort((a,b)=>a.at.localeCompare(b.at));detail.append(dataTable({title:'已观测关系事件 · UTC',columns:['事件','时间','属性'],rows:events.map(e=>[e.type,e.at,e.type==='解绑'?`${source.reasons[e.reason]} · ${source.appVersions[e.appVersion]}`:({same:'同号（合成）',different:'异号（合成）',unknown:'关系未知'}[e.ownerRelation])]),note:'首次解绑后的首个回绑决定7／30日结果；之后重复解绑不新增去重设备。不跨接其他指标的模拟设备ID。'}));};
 function draw(){const q=state.query.trim().normalize('NFKC').toLowerCase(),rows=p.rows.filter(r=>{const f=unbindingOutcome(r,7).first;return(!state.version||f.appVersion===state.version)&&(!state.reason||f.reason===state.reason)&&(!q||[r.id,r.deviceModel,optionLabel('country',r.country),source.reasons[f.reason]].join(' ').normalize('NFKC').toLowerCase().includes(q));});state.page=Math.min(state.page,Math.max(0,Math.ceil(rows.length/20)-1));const pageRows=rows.slice(state.page*20,state.page*20+20);
 result.textContent=`显示匹配${number(rows.length)} / 当前范围${number(p.devices)}台；全范围${number(p.events)}次解绑事件。${!rows.length?'没有匹配设备；未替换为总体。':''}`;
 const table=dataTable({title:'解绑设备 · 每页20台',columns:['设备编号','国家／型号','首次解绑（UTC）','首次原因','7日／30日结果'],rows:pageRows.map(r=>[r.id,`${optionLabel('country',r.country)} / ${r.deviceModel}`,unbindingOutcome(r,7).first.at,source.reasons[unbindingOutcome(r,7).first.reason],[7,30].map(d=>{const o=unbindingOutcome(r,d);return !o.mature?'观察中':o.hit?'已回绑':'未在窗内回绑';}).join('／')])});
 [...table.querySelectorAll('tbody tr')].forEach((tr,i)=>{const r=pageRows[i],b=element('button','retention-device-select',r.id);b.type='button';b.dataset.deviceId=r.id;b.setAttribute('aria-controls',detail.id);b.setAttribute('aria-pressed',String(state.selected===r.id));b.addEventListener('click',()=>{choose(r);node.querySelectorAll('[data-device-id]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.deviceId===r.id)));updateScrollableTables();document.querySelector('#announcement').textContent=`已选择${r.id}，原位事件已更新，问题单未改变。`;});tr.firstChild.replaceChildren(b);});list.replaceChildren(table);paging.replaceChildren();
 const prev=element('button','filter-reset','上一页'),next=element('button','filter-reset','下一页');prev.type=next.type='button';prev.disabled=state.page===0;next.disabled=(state.page+1)*20>=rows.length;for(const [b,d]of[[prev,-1],[next,1]])b.addEventListener('click',()=>{state.page+=d;draw();restoreListPaginationFocus(paging,d);});paging.append(prev,element('span','table-note',`第${state.page+1} / ${Math.max(1,Math.ceil(rows.length/20))}页`),next);choose(rows.find(r=>r.id===state.selected));updateScrollableTables();}
 draw();return node;
}


// #52: one synthetic account population, daily activity and snapshot signals.
const riskLedger=(()=>{const DAY=86400000,countries={US:'美国',UK:'英国',DE:'德国',Other:'其他'};
function selection(s,at){const t=Date.parse(at),indexes=(lo,hi)=>s.dates.flatMap((d,i)=>{const time=Date.parse(d+'T00:00:00Z');return time>=lo&&time<hi?[i]:[];});return {recent:indexes(t-7*DAY,t),baseline:indexes(t-35*DAY,t-7*DAY)};}
function evidence(r,at,s,cuts=selection(s,at)){const t=Date.parse(at),activity=s.activity[r.id],recent=cuts.recent.reduce((n,i)=>n+activity[i],0),baseline=cuts.baseline.reduce((n,i)=>n+activity[i],0),recentEvent=date=>date!==null&&Date.parse(date)>=t-30*DAY&&Date.parse(date)<t;
 const intent=r.cancelAutoRenew||(recentEvent(r.trialEndedAt)&&!r.trialPaid)||recentEvent(r.expiredAt),behavior=baseline>0&&recent*8<baseline,device=r.devices.some(d=>Date.parse(d.boundAt)<=t&&t-Date.parse(d.lastOnlineAt)>=7*DAY),push=!r.pushEnabled,ignored=r.ignoredAlerts.filter(d=>Date.parse(d)>=t-30*DAY&&Date.parse(d)<t).length,attitude=ignored>=3,qualified=behavior&&(device||push||attitude);
 return {intent,behavior,device,push,attitude,qualified,risk:!!(intent||qualified),recent,baseline,decline:baseline?1-recent/(baseline/4):null,ignored};}
const matchesDefinition=(actual,want)=>actual&&Object.keys(actual).length===Object.keys(want).length&&Object.entries(want).every(([k,v])=>Object.hasOwn(actual,k)&&actual[k]===v);
function validate(s){const evaluated=[];const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
 if(s?.status!=='approved-synthetic'||s.version!=='synthetic-risk-account-evidence-v1'||s.classification!=='entirely_synthetic'||!iso(s.asOf)||s.snapshots?.length!==12||s.dates?.length!==112||Object.keys(s.activity??{}).length!==216)throw Error('风险候选来源不完整');
 if(!matchesDefinition(s.models,{'K6':'Bird','Bird Lite':'Bird','Bird Pro':'Bird','Hunt Pro':'Hunting'}))throw Error('主型号与产品线归属不一致');
 if(!matchesDefinition(s.rule,{intentLookbackDays:30,recentActivityDays:7,baselineActivityDays:28,declineStrictlyGreaterThan:.5,offlineHoursAtLeast:168,ignoredAlertLookbackDays:30,ignoredAlertCountAtLeast:3}))throw Error('候选规则版本与实现不一致');
 for(let i=0;i<s.dates.length;i++)if(!/^\d{4}-\d\d-\d\d$/.test(s.dates[i])||i&&Date.parse(s.dates[i])-Date.parse(s.dates[i-1])!==DAY)throw Error('每日活跃日期不连续');
 for(const values of Object.values(s.activity))if(values.length!==s.dates.length||values.some(v=>v!==0&&v!==1))throw Error('活跃日频数缺失');
 for(const [i,w]of s.snapshots.entries()){if(!iso(w.at)||Date.parse(w.at)!==Date.parse(s.asOf)-(11-i)*7*DAY||w.accounts.length!==216||w.eligible!==216||new Set(w.accounts.map(r=>r.id)).size!==216)throw Error('快照日期或账号群不闭合');
  const deviceIds=new Set();for(const r of w.accounts){if(!/^RISK-\d{3}$/.test(r.id)||!s.activity[r.id]||!Object.hasOwn(s.models,r.deviceModel)||!Object.hasOwn(countries,r.country)||!['iOS','Android'].includes(r.appPlatform)||r.productLine!==s.models[r.deviceModel]||!['Free','Starter','Plus','Pro'].includes(r.plan)||!['App Store','Google Play','Web'].includes(r.subscriptionPlatform)||r.plan==='Free'&&r.productLine!=='Bird'||r.plan==='Starter'&&r.productLine!=='Hunting'||![r.cancelAutoRenew,r.trialPaid,r.pushEnabled].every(v=>typeof v==='boolean')||![r.trialEndedAt,r.expiredAt].every(d=>d===null||iso(d)&&d<w.at)||!Array.isArray(r.devices)||!Array.isArray(r.ignoredAlerts)||new Set(r.ignoredAlerts).size!==r.ignoredAlerts.length||r.ignoredAlerts.some(d=>!iso(d)||d>=w.at))throw Error('账号归属或信号来源待核验');
   if(r.devices.some(d=>deviceIds.has(d.id))||new Set(r.devices.map(d=>d.id)).size!==r.devices.length||r.devices.some(d=>!d.id||d.owner!==r.id||!iso(d.boundAt)||!iso(d.lastOnlineAt)||d.boundAt>w.at||d.lastOnlineAt>w.at))throw Error('设备归属或离线时点待核验');r.devices.forEach(d=>deviceIds.add(d.id));}
  const cuts=selection(s,w.at);if(cuts.recent.length!==7||cuts.baseline.length!==28)throw Error('35日活跃观察不完整');const accounts=w.accounts.map(r=>({...r,...evidence(r,w.at,s,cuts)}));if(accounts.filter(r=>r.risk).length!==w.expectedRisk)throw Error('逐账号命中与控制数不闭合');evaluated.push({...w,date:w.at.slice(0,10),accounts});
 }return evaluated;}

return {evidence,validate};})();
let riskSourceCache;
const riskSignalNames={intent:'意图层',behavior:'活跃下降>50%',device:'设备离线≥7日',push:'推送关闭',attitude:'明确忽略≥3次'};
const riskRuleNote='高危＝意图 ∪（行为 ∩（设备 ∪ 触达 ∪ 态度））；同号只计一次。意图／态度回看30日，行为近7完整UTC日对照此前28日周均，严格下降>50%；任一已绑定主设备离线满168小时。';
function riskIndex(){const source=sourceData.diagnostics.D.riskFacts;if(riskSourceCache&&riskSourceCache.source===source)return riskSourceCache.result;let result;
 try{const rows=riskLedger.validate(source);if(source.asOf!==sourceData.snapshot.asOf+'T00:00:00Z')throw Error('快照不一致');result={source,rows,defaultDate:source.asOf.slice(0,10)};}
 catch{result={reason:'风险规则、账号归属或信号窗口待核验；未回退旧汇总、比例分片或生成名单。'};}riskSourceCache={source,result};return result;}
function riskProjection(state=filterState,date=riskSnapshotRequest[0]??riskIndex().defaultDate){const index=riskIndex();if(index.reason)return index;
 if(riskSnapshotRequest.length>1||!index.rows.some(w=>w.date===date))return {reason:'风险快照无效或包含多个日期，请重新选择一个完整观察快照。'};
 const filters=effectiveFor(52,state);if(filters.some(([key])=>!['country','appPlatform','productLine','deviceModel','plan','subscriptionPlatform'].includes(key)))return {reason:'当前条件缺少同源风险归属。'};
 const windows=index.rows.map(w=>riskSummarize(w.accounts.filter(r=>filters.every(([k,v])=>r[k]===v)),w.at));return {source:index.source.version,date,rows:windows,current:windows.find(w=>w.date===date)};}
function riskSummarize(accounts,at){const risks=accounts.filter(r=>r.risk),intent=risks.filter(r=>r.intent).length,qualified=risks.filter(r=>r.qualified).length,both=risks.filter(r=>r.intent&&r.qualified).length;return {at,date:at.slice(0,10),accounts,risks,eligible:accounts.length,count:risks.length,intent,qualified,both,intentOnly:intent-both,behaviorOnly:qualified-both,neither:accounts.length-risks.length,signals:Object.fromEntries(Object.keys(riskSignalNames).map(k=>[k,risks.filter(r=>r[k]).length]))};}
function riskMetric(state){const p=riskProjection(state);return p.reason?pending(p.reason):{kind:'count',value:p.current.count};}
function riskWindow(){const p=riskProjection();return p.reason?'风险快照待核验':`风险快照v1 · ${p.current.at}（UTC）`;}
function riskHistory(){const p=riskProjection();return p.reason?null:{title:'流失高危主账号 · 12期同源快照',unit:'人',labels:p.rows.map(w=>w.date),values:p.rows.map(w=>w.count),selectedPeriod:p.date,comparisonLabel:'较前快照',note:'各快照按当期单一主归属重算，同一账号逐日活跃与对应信号；216为原始合成演示群，不是全站分母。人数变化不是已流失或挽留效果。'};}
function riskHistoryTable(rows=riskProjection().rows??[]){return {title:'高危主账号 · 快照人数验算',columns:['快照（UTC）','高危去重（人）','意图命中','行为叠加命中','两者交集','仅意图','仅行为叠加','有记录演示群'],rows:rows.map(w=>[w.at,w.count,w.intent,w.qualified,w.both,w.intentOnly,w.behaviorOnly,w.eligible]),note:'仅意图＋仅行为叠加＋交集＝高危去重。演示群不用于全站风险率；信号人数不能直接相加。'};}
function riskBaseline(){const p=riskProjection(),i=p.rows.findIndex(w=>w.date===p.date),windows=p.rows.slice(Math.max(0,i-1),i+1).map(w=>{const {accounts,risks,...counts}=w;return {...counts,members:risks.map(r=>[r.id,r.country,r.appPlatform,r.productLine,r.deviceModel,r.plan,r.subscriptionPlatform,r.intent,r.behavior,r.qualified,r.device,r.push,r.attitude,r.recent,r.baseline,r.ignored])};});return '风险证据v1：'+JSON.stringify({source:p.source,rules:riskIndex().source.rule,windows});}
function riskBaselineDetails(baseline){const detail=element('details','risk-baseline-details');detail.append(element('summary','','查看首次保存的风险规则、快照与命中计数'));
 try{const saved=JSON.parse(baseline.slice('风险证据v1：'.length));detail.append(element('p','table-note',`来源 ${saved.source}；近${saved.rules.recentActivityDays}日对照前${saved.rules.baselineActivityDays}日，意图／忽略回看${saved.rules.intentLookbackDays}日。`),dataTable({...riskHistoryTable(saved.windows),title:'首次保存 · 风险快照计数'}));for(const w of saved.windows)detail.append(dataTable({title:`首次保存 · ${w.date}重叠信号`,columns:['信号','高危群内命中（人）'],rows:Object.entries(w.signals).map(([k,n])=>[riskSignalNames[k]??k,n])}));const members=element('details','');members.append(element('summary','','查看首次保存的账号命中名册'));for(const w of saved.windows)members.append(dataTable({title:`${w.date} · 已保存合成账号命中`,columns:['账号','国家／App','主型号／套餐','意图／行为叠加','近7日／前28日活跃'],rows:w.members.map(r=>[r[0],`${r[1]} / ${r[2]}`,`${r[4]} / ${r[5]}`,`${r[7]?'命中':'—'} / ${r[9]?'命中':'—'}`,`${r[13]} / ${r[14]}天`])}));detail.append(members);}
 catch{detail.append(element('p','na-note','原风险证据无法解析，保留原文，不用当前数据替换。'),element('p','table-note',baseline));}return detail;}
function riskControl(page){const wrap=element('div','retention-month-control'),label=element('label','','风险快照（仅#52）'),select=element('select','');select.name='riskSnapshot';select.setAttribute('aria-label','风险快照（仅#52）');const index=riskIndex(),p=riskProjection();if(p.reason){const o=element('option','','快照待修正');o.value='invalid';o.disabled=true;select.append(o);}for(const w of index.rows??[]){const o=element('option','',w.date);o.value=w.date;select.append(o);}select.value=p.reason?'invalid':p.date;
 select.addEventListener('change',()=>{const params=new URLSearchParams(location.hash.split('?')[1]??'');params.delete('riskSnapshot');if(select.value!==index.defaultDate)params.set('riskSnapshot',select.value);pushRoute(`#/${page}?${params}`);renderRoute({preserveScroll:true});document.querySelector('[name=riskSnapshot]')?.focus({preventScroll:true});document.querySelector('#announcement').textContent=`风险快照已切换${select.value}，仅更新#52及其登记范围。`;});label.append(select);wrap.append(label);return wrap;}
function riskEvidence(panel,appendPair,page){const p=riskProjection(),w=p.current,h=riskHistory(),proof=element('p','table-note risk-intersection',`互斥验算：仅意图${number(w.intentOnly)}人＋仅行为叠加${number(w.behaviorOnly)}人＋两者交集${number(w.both)}人＝高危${number(w.count)}人；有完整记录演示群${number(w.eligible)}人，未命中${number(w.neither)}人。`);proof.dataset.evidenceKind='change';panel.append(proof);
 appendPair({...h,metricId:52,series:[{name:'高危主账号',values:h.values}],onPoint:i=>{const select=panel.querySelector('[name=riskSnapshot]');if(select&&p.rows[i]){select.value=p.rows[i].date;select.dispatchEvent(new Event('change'));}}},riskHistoryTable(p.rows),'change');
 const counts=Object.keys(riskSignalNames).map(k=>[riskSignalNames[k],w.signals[k]]);appendPair({metricId:52,title:`${number(w.count)}位高危主账号 · 五层重叠信号`,unit:'人',labels:counts.map(r=>r[0]),series:[{name:'命中主账号',values:counts.map(r=>r[1])}],note:'各层可重叠，不能相加得到人数。行为层需叠加设备／触达／态度任一层；单有离线、关闭推送或忽略告警不判高危。',onPoint:i=>{const select=panel.querySelector('[aria-label="风险信号（仅清单）"]');if(select){select.value=Object.keys(riskSignalNames)[i];select.dispatchEvent(new Event('change'));select.focus({preventScroll:true});}}},{title:'高危群内信号验算',columns:['信号','主账号（人）'],rows:counts,note:riskRuleNote},'groups');
 panel.append(riskAccountList(p,page));const full=dataTable(riskHistoryTable(p.rows),'risk-history-table');full.dataset.evidenceKind='data';panel.append(full);const rules=element('details','risk-rules');rules.dataset.evidenceKind='data';rules.append(element('summary','','同源规则与演示范围'));for(const note of riskIndex().source.notes)rules.append(element('p','table-note',note));panel.append(rules);}
const riskListStates=new Map();
function riskAccountList(p,page){const w=p.current,node=element('section','risk-account-list');node.dataset.evidenceKind='groups';node.append(element('h3','','高危合成账号 · 信号证据与名单'));
 const key=recordScope(page,52),state=riskListStates.get(key)??{signal:'',query:'',page:0,selected:null};riskListStates.set(key,state);const controls=element('div','binding-list-controls'),label=element('label','','风险信号（仅清单）'),select=element('select','');select.setAttribute('aria-label','风险信号（仅清单）');for(const [k,text]of[['','全部高危'],['intent','意图层'],['qualified','行为叠加'],['behavior','活跃下降>50%'],['device','设备离线'],['push','推送关闭'],['attitude','明确忽略告警']]){const o=element('option','',text);o.value=k;select.append(o);}select.value=state.signal;label.append(select);controls.append(label);
 const searchLabel=element('label','','查找账号'),search=element('input','');search.type='search';search.value=state.query;search.setAttribute('aria-label','搜索合成风险账号');searchLabel.append(search);controls.append(searchLabel);const reset=element('button','filter-reset','清除名单条件'),exportButton=element('button','filter-reset','');reset.type=exportButton.type='button';controls.append(reset);node.append(controls);
 const status=element('p','table-note risk-list-status');status.setAttribute('aria-live','polite');const content=element('div',''),paging=element('div','binding-list-pagination');node.append(status,exportButton,content,paging,element('p','table-note','信号与搜索只筛清单，不改变顶部、趋势或问题单范围。CSV仅为合成证据，不连接触达渠道。'));let matched=[];
 const draw=()=>{const query=state.query.trim().normalize('NFKC').toLowerCase();matched=w.risks.filter(r=>(!state.signal||r[state.signal])&&(!query||[r.id,optionLabel('country',r.country),r.deviceModel,r.plan,r.appPlatform].join(' ').normalize('NFKC').toLowerCase().includes(query)));state.page=Math.min(state.page,Math.max(0,Math.ceil(matched.length/20)-1));const rows=matched.slice(state.page*20,state.page*20+20);status.textContent=`匹配${number(matched.length)} / 当前高危${number(w.count)}人；有完整记录演示群${number(w.eligible)}人。${!matched.length?'无匹配高危账号，不代表缺失记录或全站没有风险。':''}`;exportButton.textContent=`导出全部匹配的合成证据（${number(matched.length)}人）`;exportButton.disabled=!matched.length;
 const table=dataTable({title:'高危合成账号 · 每页20人',columns:['账号','国家／主型号','套餐／平台','意图命中','行为叠加'],rows:rows.map(r=>[r.id,`${optionLabel('country',r.country)} / ${r.deviceModel}`,`${r.plan} / ${r.subscriptionPlatform}`,r.intent?'命中':'—',r.qualified?'命中':'—']),note:'点击账号原位核对命中依据；同账号多台设备只命中一次。'});[...table.querySelectorAll('tbody tr')].forEach((tr,i)=>{const r=rows[i],b=element('button','retention-device-select',r.id);b.type='button';b.dataset.riskId=r.id;b.setAttribute('aria-pressed',String(state.selected===r.id));b.setAttribute('aria-controls',`${page}-workspace-device`);b.addEventListener('click',()=>{state.selected=r.id;node.querySelectorAll('[data-risk-id]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.riskId===r.id)));node.dispatchEvent(new CustomEvent('risk-account-select',{bubbles:true,detail:{record:r,at:w.at,trigger:b}}));document.querySelector('#announcement').textContent=`已选择${r.id}，原位显示风险证据，问题单未改变。`;});tr.firstChild.replaceChildren(b);});content.replaceChildren(table);paging.replaceChildren();const prev=element('button','filter-reset','上一页'),next=element('button','filter-reset','下一页');prev.type=next.type='button';prev.disabled=state.page===0;next.disabled=(state.page+1)*20>=matched.length;for(const [b,d]of[[prev,-1],[next,1]])b.addEventListener('click',()=>{state.page+=d;draw();restoreListPaginationFocus(paging,d);});paging.append(prev,element('span','table-note',`第${state.page+1} / ${Math.max(1,Math.ceil(matched.length/20))}页`),next);if(state.selected&&!matched.some(r=>r.id===state.selected)){state.selected=null;node.dispatchEvent(new CustomEvent('risk-account-clear',{bubbles:true}));}updateScrollableTables();};
 select.addEventListener('change',()=>{state.signal=select.value;state.page=0;draw();});search.addEventListener('input',()=>{state.query=search.value;state.page=0;draw();});reset.addEventListener('click',()=>{state.signal=state.query='';select.value=search.value='';state.page=0;draw();reset.focus({preventScroll:true});});exportButton.addEventListener('click',()=>{if(riskIndex().reason){status.textContent='风险来源待核验，未导出名单。';return;}const headers=['合成账号','快照UTC','国家','App','产品线','主型号','套餐','订阅平台','意图命中','行为叠加命中','近7日活跃天数','前28日活跃天数','设备离线命中','推送关闭','30日明确忽略次数','规则来源'],rows=matched.map(r=>[r.id,w.at,r.country,r.appPlatform,r.productLine,r.deviceModel,r.plan,r.subscriptionPlatform,r.intent,r.qualified,r.recent,r.baseline,r.device,r.push,r.ignored,p.source]),quote=v=>'"'+String(v).replace(/"/g,'""')+'"',csv='\uFEFF'+[headers,...rows].map(r=>r.map(quote).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=element('a','');a.href=url;a.download=`parallens-synthetic-risk-${w.date}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.querySelector('#announcement').textContent=`已导出全部匹配的${matched.length}名合成风险账号。`;});draw();return node;}
function riskAccountDetail(r,at,onBack){const node=element('section','risk-account-detail'),back=element('button','binding-device-back','返回账号清单');back.type='button';back.addEventListener('click',onBack);node.append(back,element('p','inspector-kicker',`合成账号 / ${r.id}`),element('h3','','风险命中证据'),element('p','table-note',`${at} · ${r.intent&&r.qualified?'意图与行为叠加同时命中，只计1人':r.intent?'意图层命中，只计1人':'行为下降且叠加其他层，只计1人'}`));
 const facts=element('dl','inspector-facts');for(const [k,v]of[['归属',`${optionLabel('country',r.country)} / ${r.appPlatform} / ${r.deviceModel}`],['套餐／订阅平台',`${r.plan} / ${r.subscriptionPlatform}`],['意图依据',r.cancelAutoRenew?'当前关闭自动续订':r.trialEndedAt?`试用结束未付费 ${r.trialEndedAt}`:r.expiredAt?`权益过期 ${r.expiredAt}`:'未命中'],['近7日复合活跃',`${r.recent}天`],['前28日活跃',`${r.baseline}天，折合${(r.baseline/4).toFixed(1)}天/周`],['相对周均变化',r.decline===null?'基线为0，不算无限下降':r.decline===0?'持平；行为层需下降严格>50%':`${r.decline>0?'下降':'上升'}${(Math.abs(r.decline)*100).toFixed(1)}%；行为层需下降严格>50%`],['推送',r.push?'已关闭':'已开启'],['明确忽略告警',`${r.ignored}次 / 最近30日`]]){const row=element('div','');row.append(element('dt','',k),element('dd','',v));facts.append(row);}const devices=element('dl','inspector-facts');for(const d of r.devices){const row=element('div','');row.append(element('dt','',d.id),element('dd','',`${d.lastOnlineAt.replace('T',' ').replace('Z',' UTC')} · 距快照${((Date.parse(at)-Date.parse(d.lastOnlineAt))/3600000).toFixed(1)}小时`));devices.append(row);}node.append(facts,element('h4','','当前绑定主设备 · 最近在线'),devices,element('p','table-note','任一绑定主设备离线满168小时命中设备层，多台只计该主账号一次。'),element('p','table-note','只解释是否命中演示规则，不预测流失概率；付费中可标高危，不加入沉睡分层。查看账号不替换问题单。'));return node;}

// #27: function activity and notification configuration share the reviewed active cohort.
const featureFunctions=['Live','Playback','Recognition'];
let featureUsageCache;
function featureUsageIndex(){
 if(featureUsageCache)return featureUsageCache;
 const bad=()=>featureUsageCache={reason:'功能／通知频数与同日活跃人数未闭合；暂停#27，不沿用旧分片。'};
 const s=sourceData.functionUsage?.facts,a=activeWindowIndex(),whole=n=>Number.isSafeInteger(n)&&n>=0;
 if(a.reason||s?.status!=='approved-synthetic'||s.version!=='synthetic-feature-usage-v1'||s.classification!=='entirely_synthetic'||s.defaultFunction!=='Live'||s.configDefinition!=='Account-level in-app notification master setting as of cutoff; independent of OS permission or push delivery'||!Array.isArray(s.rows)||s.rows.length!==84)return bad();
 for(const [i,row]of s.rows.entries()){
  const active=a.rows[i];if(!row||!active||row.at!==active.at||!Array.isArray(row.records)||row.records.length!==8)return bad();const seen=new Set();
  for(const r of row.records){if(!r)return bad();const key=r.country+'|'+r.appPlatform,part=active.records.find(n=>n.country===r.country&&n.appPlatform===r.appPlatform);if(!part||seen.has(key)||!Array.isArray(r.functionMasks)||r.functionMasks.length!==8||!r.functionMasks.every(whole))return bad();seen.add(key);const n=aggregateActiveWindows([part]);
   if(r.functionMasks.reduce((n,v)=>n+v,0)!==n.appMAU||!r.notification||Object.keys(r.notification).sort().join(',')!=='off,on,unknown'||!Object.values(r.notification).every(whole)||Object.values(r.notification).reduce((n,v)=>n+v,0)!==n.MAU)return bad();
  }
 }
 const all=row=>featureUsageAggregate(row.records),last=all(s.rows.at(-1));
 if(last.denominator!==sourceData.functionUsage.denominator||featureFunctions.some((key,i)=>last.users[i]!==sourceData.functionUsage.functions[key]?.users))return bad();
 for(const [i,label]of sourceData.metricTrends.m27.labels.entries()){const row=s.rows.find(r=>`${+r.at.slice(5,7)}/${+r.at.slice(8,10)}`===label),old=sourceData.metricTrends.m27.points[i];if(!row)return bad();const n=all(row);if(n.users[0]!==old.numerator||n.denominator!==old.denominator)return bad();}
 return featureUsageCache={source:s,rows:s.rows};
}
function featureUsageAggregate(records){return records.reduce((a,r)=>{const counts=r.functionMasks;a.app+=counts.reduce((n,v)=>n+v,0);for(let i=0;i<3;i++)a.users[i]+=counts.reduce((n,v,mask)=>n+(mask&(1<<i)?v:0),0);for(const key of ['on','off','unknown'])a.config[key]+=r.notification[key];a.denominator+=Object.values(r.notification).reduce((n,v)=>n+v,0);return a;},{app:0,denominator:0,users:[0,0,0],config:{on:0,off:0,unknown:0}});}
function featureUsageProjection(state=filterState){const index=featureUsageIndex();if(index.reason)return index;const filters=effectiveFor(27,state).filter(([key])=>key!=='functionType');if(filters.some(([key])=>!['country','appPlatform'].includes(key)))return {reason:'功能与配置缺少型号／产品线／设备状态的同源主账号归属。'};const rows=index.rows.map(row=>({at:row.at,...featureUsageAggregate(row.records.filter(r=>filters.every(([k,v])=>r[k]===v)))}));return {source:index.source,rows,current:rows.at(-1),functionType:state.functionType??'Live'};}
function featureUsageMetric(state){const p=featureUsageProjection(state);if(p.reason)return pending(p.reason);const i=featureFunctions.indexOf(p.functionType),r=p.current;if(i<0)return na('功能不属于本项口径');return r.denominator>=30?{kind:'rate',numerator:r.users[i],denominator:r.denominator,value:r.users[i]/r.denominator}:na(r.denominator?'当前活跃人群少于30人，保留人数，不展示可靠使用率':'当前范围无活跃主账号，使用率无合格分母');}
const featureUsageNote='同一滚动30天复合活跃人群；功能使用者均在App活跃子集中，可重叠不相加。通知为期末账号级App内总开关，不代表系统授权、推送送达或通知使用。全部为合成频数，无跨日账号身份。';
function featureUsageTable(p=featureUsageProjection()){return {title:'功能与配置 · 84日完整人数',columns:['截止日（UTC零时）','直播（人）','事件回看（人）','AI查看（人）','App活跃（人）','复合活跃分母（人）','通知开（人）','通知关（人）','未知（人）'],rows:p.rows.map(r=>[r.at.slice(0,10),...r.users,r.app,r.denominator,r.config.on,r.config.off,r.config.unknown]),note:featureUsageNote};}
function featureUsageHistory(){const p=featureUsageProjection();if(p.reason)return null;const i=featureFunctions.indexOf(p.functionType);return {comparisonLabel:'较前日快照',title:`${optionLabel('functionType',p.functionType)}使用率`,unit:'%',labels:p.rows.map(r=>r.at.slice(0,10)),values:p.rows.map(r=>r.denominator>=30?r.users[i]/r.denominator*100:null),details:p.rows.map(r=>({numerator:r.users[i],denominator:r.denominator,numeratorUnit:'人',denominatorUnit:'人'})),note:featureUsageNote};}
function featureUsageBaseline(){const p=featureUsageProjection();return '功能配置证据v1：'+JSON.stringify({source:p.source.version,functionType:p.functionType,windows:p.rows.slice(-2).map(r=>({start:new Date(Date.parse(r.at)-30*86400000).toISOString(),...r}))});}
function featureUsageBaselineDetails(value){const node=element('details','feature-baseline-details');node.append(element('summary','','查看首次保存的功能与通知计数'));try{const p=JSON.parse(value.slice('功能配置证据v1：'.length));node.append(element('p','table-note',`规则 ${p.source}；所选${optionLabel('functionType',p.functionType)}；各窗口起含止不含。`),dataTable(featureUsageTable({rows:p.windows})));}catch{node.append(element('p','na-note','旧证据无法解析，保留原文，不以当前值替换。'),element('p','table-note',value));}return node;}
function featureUsageEvidence(panel,appendPair){const p=featureUsageProjection();if(p.reason)return;const r=p.current,full=featureUsageTable(p),note=featureUsageNote;
 const selector=element('div','retention-month-control'),label=element('label','','所看功能（仅#27）'),select=element('select','');select.setAttribute('aria-label','所看功能（仅#27）');for(const key of featureFunctions){const o=element('option','',optionLabel('functionType',key));o.value=key;select.append(o);}select.value=p.functionType;select.addEventListener('change',()=>{changeFilter('B','functionType',select.value==='Live'?'All':select.value);document.querySelector('[aria-label="所看功能（仅#27）"]')?.focus({preventScroll:true});});label.append(select);selector.append(label);selector.dataset.evidenceKind='change';panel.append(selector);
 const labels=p.rows.map(r=>r.at.slice(0,10)),rates=fn=>p.rows.map(r=>r.denominator>=30?fn(r)/r.denominator*100:null);
 const ratesAll=p.rows.flatMap(r=>r.denominator>=30?r.users.map(n=>n/r.denominator*100):[]),low=Math.min(...ratesAll),high=Math.max(...ratesAll),span=Math.max(high-low,.5),step=chartNiceStep(span/6),axis=ratesAll.length?{minY:Math.max(0,Math.floor((low-span*.1)/step)*step),maxY:Math.min(100,Math.ceil((high+span*.1)/step)*step),intervalY:step}:{};
 appendPair({title:'三类功能使用率 · 同一滚动30天人群',unit:'%',...axis,labels,series:featureFunctions.map((key,i)=>({name:optionLabel('functionType',key),values:rates(r=>r.users[i]),details:p.rows.map(r=>({numerator:r.users[i],denominator:r.denominator,numeratorUnit:'人',denominatorUnit:'人'}))})),note},full,'change');
 const latest={title:'账号级通知配置 · 当前快照',columns:['配置','主账号（人）','同范围复合活跃（人）','占比'],rows:['on','off','unknown'].map((key,i)=>[['已确认开','已确认关','未知'][i],r.config[key],r.denominator,r.denominator>=30?percent(r.config[key]/r.denominator):'无可靠比例']),note:'开／关／未知互斥且合计回到复合活跃分母；未知不当作关闭。'+note};
 appendPair({title:latest.title,unit:'%',labels:['已确认开','已确认关','未知'],series:[{name:'主账号占比',values:['on','off','unknown'].map(key=>r.denominator>=30?r.config[key]/r.denominator*100:null)}],note:latest.note},latest,'groups');
 const details=element('details','workspace-context feature-notification-history');details.dataset.evidenceKind='groups';details.append(element('summary','','查看账号通知配置历史'));const shell=element('div','detail-chart-panel'),box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label','账号级通知开／关／未知 · 84日快照；'+note);shell.append(element('h3','','通知配置 · 各日匹配活跃人群'),box);details.append(shell,dataTable(full));panel.append(details);details.addEventListener('toggle',()=>{if(details.open)drawEvidenceChart(box,{title:'通知配置 · 各日匹配活跃人群',unit:'%',labels,minY:0,maxY:100,series:['on','off','unknown'].map((key,i)=>({name:['已确认开','已确认关','未知'][i],values:rates(r=>r.config[key])})),note});});
 const table=dataTable(full,'feature-usage-calculation');table.dataset.evidenceKind='data';panel.append(table);
}

// #28: two distinct cohort populations, exact UTC-day compound activity.
let userRetentionCache;
const userRetentionDays=['D1','D7','D30'];
const accountRateText=part=>part.kind==='rate'?percent(part.value):part.numerator===null?'观察未结束':part.denominator<30?(part.denominator?'样本不足30人':'无合格样本'):'待核验';
const userRetentionTypeLabels={activation:'首次设备激活主账号',registration:'新注册用户'};
function userRetentionIndex(){
 if(userRetentionCache)return userRetentionCache;const s=sourceData.diagnostics.B.userRetentionFacts,bad=()=>userRetentionCache={reason:'新客留存批次、入组归属或观察计数待核验，不沿用未注明批次的旧比例。'},whole=n=>Number.isSafeInteger(n)&&n>=0,date=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(s?.status!=='approved-synthetic'||s.version!=='synthetic-user-retention-v1'||s.classification!=='entirely_synthetic'||s.asOf!==sourceData.snapshot.asOf||s.timezone!=='UTC'||s.defaultCohort!=='2026-08-17'||!Array.isArray(s.cohorts)||s.cohorts.length!==24)return bad();
 const seen=new Set();for(const c of s.cohorts){if(!c)return bad();const key=c.type+'|'+c.id;if(!Object.hasOwn(userRetentionTypeLabels,c.type)||seen.has(key)||c.id!==c.start||!date(c.start)||!date(c.end)||new Date(c.start).getUTCDay()!==1||Date.parse(c.end)-Date.parse(c.start)!==6*86400000||!whole(c.eligible)||!Array.isArray(c.records))return bad();seen.add(key);const groups=new Set();
  for(const d of userRetentionDays){const expected=new Date(Date.parse(c.end)+(+d.slice(1)+1)*86400000).toISOString().slice(0,10);if(c.observationEndExclusive?.[d]!==expected||c.mature?.[d]!==Boolean(expected<=s.asOf))return bad();}
  for(const r of c.records){if(!r)return bad();const k=[r.country,r.appPlatform,r.deviceModel,r.salesChannel].join('|');if(groups.has(k)||!['US','UK','DE','Other'].includes(r.country)||!['iOS','Android'].includes(r.appPlatform)||!whole(r.eligible)||!Array.isArray(r.outcomeCounts)||c.type==='registration'&&(r.deviceModel!==null||r.salesChannel!==null)||c.type==='activation'&&(!['K6','Bird Lite','Bird Pro','Hunt Pro'].includes(r.deviceModel)||!['Amazon','Shopify'].includes(r.salesChannel)))return bad();groups.add(k);const masks=new Set();let n=0;for(const o of r.outcomeCounts){if(!o)return bad();const signature=userRetentionDays.map(d=>String(o[d])).join('|');if(masks.has(signature)||!whole(o.count)||o.count===0||userRetentionDays.some(d=>c.mature[d]?typeof o[d]!=='boolean':o[d]!==null))return bad();masks.add(signature);n+=o.count;}if(n!==r.eligible)return bad();}
  if(c.records.reduce((n,r)=>n+r.eligible,0)!==c.eligible)return bad();
 }
 for(const type of Object.keys(userRetentionTypeLabels)){const rows=s.cohorts.filter(c=>c.type===type);if(rows.length!==12||rows.some((c,i)=>i&&Date.parse(c.start)-Date.parse(rows[i-1].start)!==7*86400000)||!rows.some(c=>c.id===s.defaultCohort))return bad();}
 const base=s.cohorts.find(c=>c.type==='activation'&&c.id===s.defaultCohort),raw=sourceData.metrics.m28;
 if(!base||s.defaultType!=='activation'||raw?.kind!=='group')return bad();for(const d of userRetentionDays){const n=base.records.reduce((n,r)=>n+r.outcomeCounts.reduce((n,o)=>n+(o[d]?o.count:0),0),0),v=raw.value[d];if(v?.kind!=='rate'||v.numerator!==n||v.denominator!==base.eligible||Math.abs(v.value-n/base.eligible)>1e-12)return bad();}
 const deviceIndex=deviceRetentionIndex();if(deviceIndex.reason)return bad();
 for(const c of s.cohorts.filter(c=>c.type==='activation')){const device=deviceIndex.rows.find(d=>d.id===c.id);if(!device||c.eligible!==Math.floor(device.activated*.9))return bad();for(const country of ['US','UK','DE','Other'])for(const model of ['K6','Bird Lite','Bird Pro','Hunt Pro'])for(const channel of ['Amazon','Shopify']){const own=c.records.filter(r=>r.country===country&&r.deviceModel===model&&r.salesChannel===channel),raw=device.records.filter(r=>r.country===country&&r.deviceModel===model&&r.salesChannel===channel),n=own.reduce((n,r)=>n+r.eligible,0),m=raw.reduce((n,r)=>n+r.activated,0);if(n>m)return bad();for(const d of ['D7','D30'])if(c.mature[d]){const dn=raw.reduce((n,r)=>n+r.outcomeCounts.reduce((n,o)=>n+(o[d]?o.count:0),0),0),un=own.reduce((n,r)=>n+r.outcomeCounts.reduce((n,o)=>n+(o[d]?o.count:0),0),0);if(un<Math.max(0,dn-(m-n))||un>n)return bad();}}}
 return userRetentionCache={source:s,rows:s.cohorts};
}
function userRetentionSelection(){const index=userRetentionIndex();if(index.reason)return index;const type=userCohortTypeRequest[0]??'activation',id=userCohortRequest[0]??index.source.defaultCohort;if(userCohortTypeRequest.length>1||userCohortRequest.length>1||!Object.hasOwn(userRetentionTypeLabels,type)||!index.rows.some(c=>c.type===type&&c.id===id))return {reason:'新客入组方式或批次无效，请重新选择；只暂停#28。'};return {type,id};}
function userRetentionProjection(state=filterState){const index=userRetentionIndex(),selection=userRetentionSelection();if(index.reason||selection.reason)return {reason:index.reason??selection.reason};if(selection.type==='registration'){const reg=registrationIndex();if(reg.reason)return {reason:'共同注册入组来源待核验；不使用独立留存分母。'};for(const c of index.rows.filter(c=>c.type==='registration')){const common=reg.rows.find(r=>r.start===c.start);if(!common)continue;for(const country of ['US','UK','DE','Other'])for(const app of ['iOS','Android']){const n=c.records.filter(r=>r.country===country&&r.appPlatform===app).reduce((n,r)=>n+r.eligible,0),m=common.records.filter(r=>r.country===country&&r.appPlatform===app).reduce((n,r)=>n+r.registered,0);if(n!==m)return {reason:'新客留存与同批注册国家×App分母不一致；暂停注册型留存。'};}}}const filters=effectiveFor(28,state),rows=index.rows.filter(c=>c.type===selection.type).map(c=>{const records=c.records.filter(r=>filters.every(([k,v])=>r[k]===v)),denominator=records.reduce((n,r)=>n+r.eligible,0);const measures=Object.fromEntries(userRetentionDays.map(d=>{const numerator=c.mature[d]?records.reduce((n,r)=>n+r.outcomeCounts.reduce((n,o)=>n+(o[d]?o.count:0),0),0):null;return [d,{...(numerator===null?pending('完整观察未结束'):denominator<30?na(denominator?'样本不足30人':'无入组样本'):{kind:'rate',value:numerator/denominator}),numerator,denominator}];}));return {...c,records,denominator,measures};});return {...selection,source:index.source,rows,current:rows.find(c=>c.id===selection.id)};}
function userRetentionMetric(state){const p=userRetentionProjection(state);return p.reason?pending(p.reason):{kind:'group',value:p.current.measures};}
function userRetentionWindow(){const p=userRetentionProjection();return p.reason?'新客观察期待核验':`新客留存v1 · ${p.type} · ${p.current.start}—${p.current.end} · 观察截至 ${p.source.asOf}（UTC）`;}
const userRetentionNote='按入组后第1／7／30个UTC自然日是否复合活跃；三个观察日可交叉，不是逐级漏斗或连续留存。整批观察未结束留空，不补0。激活主账号与首台设备的映射、App归属和全部新增结果均为合成设定，不是实测账号日志。';
function userRetentionTable(p=userRetentionProjection()){return {title:'新客留存 · 全部批次与观察截止',columns:['入组方式','入组起日','入组止日','同批人数（人）',...userRetentionDays.flatMap(d=>[d+'活跃（人）',d+'留存率',d+'观察至（UTC）'])],rows:p.rows.map(c=>[userRetentionTypeLabels[c.type],c.start,c.end,c.denominator,...userRetentionDays.flatMap(d=>[c.measures[d].numerator??'—',accountRateText(c.measures[d]),new Date(Date.parse(c.observationEndExclusive[d])-86400000).toISOString().slice(0,10)])]),note:userRetentionNote};}
function selectUserRetention(key,value){const params=new URLSearchParams(location.hash.split('?')[1]??'');params.delete(key);if(value!==(key==='userCohortType'?'activation':userRetentionIndex().source.defaultCohort))params.set(key,value);pushRoute(`#/B?${params}`);renderRoute({preserveScroll:true});document.querySelector(`[name="${key}"]`)?.focus({preventScroll:true});document.querySelector('#announcement').textContent='已更新#28新客入组／批次；其他指标与原问题单不变。';}
function userRetentionControl(){const p=userRetentionProjection(),index=userRetentionIndex(),wrap=element('div','retention-month-control');for(const [key,title,entries]of[['userCohortType','新客入组方式（仅#28）',Object.entries(userRetentionTypeLabels)],['userCohort','新客观察批次（仅#28）',(index.rows??[]).filter(c=>c.type===(p.type??'activation')).map(c=>[c.id,`${c.start}—${c.end}`])]]){const l=element('label','',title),s=element('select','');s.name=key;s.setAttribute('aria-label',title);if(p.reason){const o=element('option','','待修正');o.value='invalid';o.disabled=true;s.append(o);}for(const [value,label]of entries){const o=element('option','',label);o.value=value;s.append(o);}s.value=p.reason?'invalid':key==='userCohortType'?p.type:p.id;s.addEventListener('change',()=>selectUserRetention(key,s.value));l.append(s);wrap.append(l);}return wrap;}
function userRetentionBaseline(){const p=userRetentionProjection(),c=p.current;return '新客留存证据v1：'+JSON.stringify({source:p.source.version,type:p.type,id:p.id,asOf:p.source.asOf,start:c.start,end:c.end,denominator:c.denominator,observationEndExclusive:c.observationEndExclusive,measures:c.measures,groups:c.records});}
function userRetentionBaselineDetails(value){const n=element('details','user-retention-baseline-details');n.append(element('summary','','查看首次保存的新客批次与留存计数'));try{const p=JSON.parse(value.slice('新客留存证据v1：'.length));n.append(element('p','table-note',`${userRetentionTypeLabels[p.type]}；${p.start}—${p.end}；观察截至${p.asOf}。`),dataTable({title:'首次保存 · 同批留存',columns:['观察日','活跃（人）','入组（人）','状态／率'],rows:userRetentionDays.map(d=>[d,p.measures[d].numerator??'—',p.denominator,accountRateText(p.measures[d])])}));}catch{n.append(element('p','table-note',value));}return n;}
function userRetentionEvidence(panel,append){const p=userRetentionProjection();if(p.reason)return;const c=p.current,summary=element('section','onboarding-stats');summary.dataset.evidenceKind='change';for(const d of userRetentionDays){const card=element('div','');card.append(element('h3','',d+'留存'),element('strong','',accountRateText(c.measures[d])),element('p','table-note',`${c.measures[d].numerator===null?'观察中':number(c.measures[d].numerator)} / ${number(c.denominator)}人`));summary.append(card);}panel.append(summary);const table=userRetentionTable(p);
 append({kind:'deviceRetentionHeatmap',measureKeys:userRetentionDays,measureText:accountRateText,denominatorUnit:'人',onCohortSelect:id=>selectUserRetention('userCohort',id),title:'12个同口径批次 · D1／D7／D30',unit:'%',labels:p.rows.map(c=>c.start),selectedPeriod:p.id,cohorts:p.rows,series:[],note:'统一0–100%色阶，越接近100%颜色越深；数值同时可读。灰格为观察中或样本不足；可用上方批次选择。'+userRetentionNote},table,'change');
 append({title:'同一观察日 · 跨批次留存趋势',unit:'%',labels:p.rows.map(c=>c.start),series:userRetentionDays.map(d=>({name:d,values:p.rows.map(c=>c.measures[d].kind==='rate'?c.measures[d].value*100:null),details:p.rows.map(c=>({...c.measures[d],numeratorUnit:'人',denominatorUnit:'人'}))})),note:userRetentionNote},table,'change');
 for(const dimension of ['country','appPlatform']){const options=sourceData.filterPolicy.controls[dimension].options,parts=options.map(v=>userRetentionProjection({...filterState,[dimension]:v}).current);append({title:`${filterLabels[dimension]} · 同一${c.start}批次`,unit:'%',labels:options.map(v=>optionLabel(dimension,v)),series:userRetentionDays.map(d=>({name:d,values:parts.map(c=>c.measures[d].kind==='rate'?c.measures[d].value*100:null),details:parts.map(c=>({...c.measures[d],numeratorUnit:'人',denominatorUnit:'人'}))})),note:'保留其余条件，各组按自身入组分母计算。'+userRetentionNote},{title:dimension+' · 人数核对',columns:['分组','入组（人）',...userRetentionDays.flatMap(d=>[d+'活跃（人）',d+'率'])],rows:parts.map((c,i)=>[optionLabel(dimension,options[i]),c.denominator,...userRetentionDays.flatMap(d=>[c.measures[d].numerator??'—',accountRateText(c.measures[d])])]),note:userRetentionNote},'groups');}
 const full=dataTable(table,'user-retention-calculation');full.dataset.evidenceKind='data';panel.append(full);
}

// #9/#10/#12: one registration frequency source, separate observation horizons.
let registrationSourceCache;
function registrationIndex(){if(registrationSourceCache)return registrationSourceCache;const s=sourceData.diagnostics.A.registrationFacts,bad=()=>registrationSourceCache={reason:'注册批次的绑定／首图计数、观察截止或归属未闭合；不沿用旧分片。'},whole=n=>Number.isSafeInteger(n)&&n>=0;if(s?.status!=='approved-synthetic'||s.version!=='synthetic-registration-cohorts-v1'||s.classification!=='entirely_synthetic'||s.asOf!==sourceData.snapshot.asOf||s.timezone!=='UTC'||s.default30Cohort!==7||!Array.isArray(s.cohorts)||s.cohorts.length!==12||!Array.isArray(sourceData.onboardingDurationFacts?.activation?.cohorts))return bad();
 for(const [i,c]of s.cohorts.entries()){if(!c||typeof c.end!=='string'||!/^\d{4}-\d\d-\d\d$/.test(c.end)||!Number.isFinite(Date.parse(c.end))||new Date(c.end).toISOString().slice(0,10)!==c.end)return bad();const w=sourceData.weekly[i],end=Date.parse(c.end);if(c.week!==w.week||c.end!==w.weekEnd||c.start!==new Date(end-6*86400000).toISOString().slice(0,10)||!Array.isArray(c.records)||c.records.length!==48||!['72','7','30'].every(d=>c['observed'+(d==='72'?'72':d)+'Through']===new Date(end+(d==='72'?3:+d)*86400000).toISOString().slice(0,10))||c.mature30!==(c.observed30Through<s.asOf))return bad();const keys=new Set();
  for(const r of c.records){if(!r)return bad();const key=[r.country,r.appPlatform,r.productLine,r.registrationAppVersion].join('|');if(keys.has(key)||!['US','UK','DE','Other'].includes(r.country)||!['iOS','Android'].includes(r.appPlatform)||!['Bird','Hunting'].includes(r.productLine)||!['Demo 1.1.0','Demo 1.2.0','Demo 1.3.0'].includes(r.registrationAppVersion)||!whole(r.registered)||!Array.isArray(r.bindingLagCounts)||r.bindingLagCounts.length!==3||!r.bindingLagCounts.every(whole)||r.bindingLagCounts.reduce((n,v)=>n+v,0)!==r.registered||!whole(r.firstImage7d)||r.firstImage7d>r.bindingLagCounts[0]+r.bindingLagCounts[1]||(c.mature30?!whole(r.firstImage30d)||r.firstImage30d<r.firstImage7d||r.firstImage30d>r.registered:r.firstImage30d!==null))return bad();keys.add(key);}
  const n=registrationAggregate(c.records);if(n.registered!==w.registrationCohort.registered||n.bound72!==w.registrationCohort.bound72h||n.image7!==w.registrationCohort.firstImage7d)return bad();
  const activation=sourceData.onboardingDurationFacts.activation.cohorts.find(r=>r.week===c.week);if(!activation||!Array.isArray(activation.records)||activation.records.some(r=>!r||!whole(r.eligible)||!Array.isArray(r.durationCounts)||r.durationCounts.some(n=>!Array.isArray(n)||n.length!==2||!whole(n[1]))))return bad();for(const country of ['US','UK','DE','Other'])for(const app of ['iOS','Android']){const selected=c.records.filter(r=>r.country===country&&r.appPlatform===app&&r.productLine==='Bird'),known=activation.records.filter(r=>r.country===country&&r.appPlatform===app);if(selected.reduce((n,r)=>n+r.registered,0)!==known.reduce((n,r)=>n+r.eligible,0)||selected.reduce((n,r)=>n+r.firstImage7d,0)<known.reduce((n,r)=>n+r.durationCounts.reduce((n,[,count])=>n+count,0),0))return bad();}
 }
 return registrationSourceCache={source:s,rows:s.cohorts};}
function registrationAggregate(records){return records.reduce((a,r)=>({registered:a.registered+r.registered,bound72:a.bound72+r.bindingLagCounts[0],bound7:a.bound7+r.bindingLagCounts[0]+r.bindingLagCounts[1],image7:a.image7+r.firstImage7d,image30:a.image30+(r.firstImage30d??0)}),{registered:0,bound72:0,bound7:0,image7:0,image30:0});}
function registrationProjection(id,state=filterState){const index=registrationIndex();if(index.reason)return index;const filters=effectiveFor(id,state).filter(([k])=>k!=='week'),rows=index.rows.map(c=>{const records=c.records.filter(r=>filters.every(([k,v])=>r[k]===v));return {...c,records,...registrationAggregate(records)};}),current=rows.find(r=>String(r.week)===String(state.week??12));if(!current)return {reason:'注册批次不存在'};const d30=state.week?current:rows.find(r=>r.week===index.source.default30Cohort);return {source:index.source,rows,current,d30};}
const registrationRate=(n,d,mature=true)=>({...(!mature?pending('本批次30天观察尚未结束'):d<30?na(d?'注册批次样本不足30人':'本批次无注册用户'):{kind:'rate',value:n/d}),numerator:mature?n:null,denominator:d});
function registrationMetric(id,state){const p=registrationProjection(id,state);if(p.reason)return pending(p.reason);const r=p.current;if(id===9)return {kind:'count',value:r.registered};if(id===10)return {...registrationRate(r.bound72,r.registered),sevenDay:registrationRate(r.bound7,r.registered)};return {kind:'group',value:{D7:registrationRate(r.image7,r.registered),D30:registrationRate(p.d30.image30,p.d30.registered,p.d30.mature30)}};}
const registrationNote='注册时国家／App／产品归属冻结；三个版本是合成分组，不是实际App版本或实验。72h≤7天绑定≤注册，7日首图≤7天绑定；未在窗内完成不代表永不完成。30日未成熟留空，不补0。频数可验算，不是逐账号事件链。';
function registrationTable(id,p=registrationProjection(id)){return {title:'注册、绑定与首图 · 12批次完整计数',columns:['注册批次','起日','止日','注册（人）','72h绑定（人）','7天绑定（人）','7日首图（人）','30日首图（人）','72h观察至','7日观察至','30日观察至'],rows:p.rows.map(r=>['W'+r.week,r.start,r.end,r.registered,r.bound72,r.bound7,r.image7,r.mature30?r.image30:'观察中',r.observed72Through,r.observed7Through,r.observed30Through]),note:registrationNote};}
function registrationHistory(id){const p=registrationProjection(id);if(p.reason)return null;const field=id===9?'registered':id===10?'bound72':'image7';return {title:id===9?'当周新增注册':id===10?'注册后72小时绑定率':'注册后7天首图激活率',unit:id===9?'人':'%',labels:p.rows.map(r=>'W'+r.week),values:p.rows.map(r=>id===9?r.registered:r.registered>=30?r[field]/r.registered*100:null),details:id===9?undefined:p.rows.map(r=>({numerator:r[field],denominator:r.registered,numeratorUnit:'人',denominatorUnit:'人'})),note:registrationNote};}
function registrationWindow(id){const p=registrationProjection(id);return p.reason?'注册批次观察待核验':`注册批次v1 · W${p.current.week} · ${p.current.start}—${p.current.end} · 观察截至 ${p.source.asOf}（UTC）`;}
function registrationBaseline(id){const p=registrationProjection(id),save=r=>({week:r.week,start:r.start,end:r.end,registered:r.registered,bound72:r.bound72,bound7:r.bound7,image7:r.image7,image30:r.mature30?r.image30:null,mature30:r.mature30,observed72Through:r.observed72Through,observed7Through:r.observed7Through,observed30Through:r.observed30Through,groups:r.records});return '注册批次证据v1：'+JSON.stringify({source:p.source.version,id,current:save(p.current),D30:save(p.d30),asOf:p.source.asOf});}
function registrationBaselineDetails(value){const n=element('details','registration-baseline-details');n.append(element('summary','','查看首次保存的注册批次与计数'));try{const p=JSON.parse(value.slice('注册批次证据v1：'.length));n.append(dataTable({title:'首次保存 · 注册计数',columns:['用途','批次','注册','72h绑定','7天绑定','7日首图','30日首图'],rows:[['当前',p.current],['30日参照',p.D30]].map(([purpose,r])=>[purpose,'W'+r.week,r.registered,r.bound72,r.bound7,r.image7,r.image30??'观察中']),note:registrationNote}));}catch{n.append(element('p','table-note',value));}return n;}
function registrationEvidence(id,panel,append){const p=registrationProjection(id);if(p.reason)return;const r=p.current,full=registrationTable(id,p),labels=p.rows.map(r=>'W'+r.week),rate=field=>p.rows.map(r=>r.registered>=30?r[field]/r.registered*100:null);
 const intro=element('p','table-note registration-source-note',`当前注册批次W${r.week} · ${r.start}—${r.end}。72h观察至${r.observed72Through}；7日观察至${r.observed7Through}。${id===12?`30日当前${filterState.week?'同批':'参照W'+p.d30.week}；观察至${p.d30.observed30Through}${p.d30.mature30?'（已成熟）':'（尚未成熟）'}。`:''}`);intro.dataset.evidenceKind='change';panel.append(intro);
 if(id===9){append({title:'新增注册 · 12个完整周',unit:'人',labels,series:[{name:'新增注册',values:p.rows.map(r=>r.registered)}],note:'当周首次绑定人数仍缺事件发生周来源；注册后绑定批次不替代它。'+registrationNote},full,'change');const missing=element('p','na-note registration-event-gap','当周首次绑定用户：待补按事件发生周的来源；不使用注册批次绑定人数替代。');missing.dataset.evidenceKind='data';panel.append(missing);}
 if(id===10)append({title:'注册后72h／7天绑定 · 同一注册分母',unit:'%',labels,series:[{name:'72h绑定',values:rate('bound72')},{name:'7天绑定',values:rate('bound7')}],note:registrationNote},full,'change');
 if(id===12)append({title:'注册后7／30天首图 · 各自批次与观察窗',unit:'%',labels,series:[{name:'7日首图',values:rate('image7')},{name:'30日首图',values:p.rows.map(r=>r.mature30&&r.registered>=30?r.image30/r.registered*100:null)}],note:'默认7日对应W12，30日参照W7；主动选择注册批次后两项均使用同批。曲线中的30日仅显示已成熟批次，默认主值参照不是自动最近成熟批次。'+registrationNote},full,'change');
 const versions=['Demo 1.1.0','Demo 1.2.0','Demo 1.3.0'],parts=versions.map(v=>registrationAggregate(r.records.filter(n=>n.registrationAppVersion===v))),field=id===12?'image7':'bound72';append({title:'注册时版本 · 同批'+(id===9?'新增注册':id===12?'7日首图':'72h／7天绑定'),unit:id===9?'人':'%',labels:versions,series:id===9?[{name:'新增注册',values:parts.map(r=>r.registered)}]:[{name:id===12?'7日首图':'72h绑定',values:parts.map(r=>r.registered>=30?r[field]/r.registered*100:null)},...(id===10?[{name:'7天绑定',values:parts.map(r=>r.registered>=30?r.bound7/r.registered*100:null)}]:[])],note:registrationNote},{title:'注册版本 · 同源人数',columns:['版本','注册','72h绑定','7天绑定','7日首图','30日首图'],rows:parts.map((n,i)=>[versions[i],n.registered,n.bound72,n.bound7,n.image7,r.mature30?n.image30:'观察中']),note:registrationNote},'groups');const table=dataTable(full,'registration-cohort-calculation');table.dataset.evidenceKind='data';panel.append(table);
}

function projectMetric(id,state=filterState) {
  const contract=contractFor(id);
  const policy=policyFor(id);
  const filters=effectiveFor(id,state);
  for(const [key,value] of filters) {
    if(key==='week'&&!contract.dimensions.includes(key))continue;
    if([34,36].includes(id)&&['plan','productLine'].includes(key)&&!policy.demonstrableDimensions.includes(key))return pending(`${filterLabels[key]}适用，但缺少可闭合的订阅与Pack权益归属明细`);
    if(!policy.demonstrableDimensions.includes(key))return pending(key==='deviceStatus'&&id===51?
      '设备状态适用，但缺少入组时设备状态明细；不能用当前状态排除未留存或已解绑设备':
      `${filterLabels[key]}适用，但演示数据缺少同范围明细`);
    if(!['week','functionType'].includes(key)&&!sourceData.slices[key]?.[value]) return na('未定义的筛选值');
  }
  const scoped=Object.fromEntries(filters),product=scoped.productLine,model=scoped.deviceModel;
  if(id===23){if(scoped.plan==='Free'||product==='Bird'&&scoped.plan==='Starter')return na('所选套餐不属于期初有效付费主订阅群');return renewalMetric(state);}
  if([4,25,30].includes(id))return activeWindowMetric(id,state);
  if(id===27)return featureUsageMetric(state);
  if(id===28)return userRetentionMetric(state);
  if([9,10,12].includes(id))return registrationMetric(id,state);
  if(id===51)return unbindingMetric(state);
  if(id===54)return qualityMetric(state);
  if(id===53){const part=anomalyProjection(state);return part.reason?pending(part.reason):{kind:"count",value:part.current.count};}
  if(id===26){const part=sessionDepthProjection(state);return part.reason?pending(part.reason):{kind:'group',value:{sessionsPerUser:part.current.frequency,durationP50Minutes:part.current.p50===null?null:part.current.p50/60,durationP90Minutes:part.current.p90===null?null:part.current.p90/60}};}
  if(id===7){const part=accountStockProjection(state);return part.reason?pending(part.reason):{kind:'group',value:{registered:part.registered,boundOwners:part.boundOwners}};}
  if(id===34){const part=paidRightsFacts(state);return part.reason?pending(part.reason):{kind:'count',value:part.total};}
  if(id===36){const part=packPenetrationFacts(state);if(part.reason)return pending(part.reason);
    if(part.anyPack.denominator<30)return na(part.anyPack.denominator?'付费权益主账号少于30人，保留计数，不展示可靠比例':'无付费权益主账号，比例无合格分母');
    const rate=part=>({kind:'rate',...part,value:part.numerator/part.denominator});
    return {kind:'group',value:{anyPack:rate(part.anyPack),byPack:Object.fromEntries(part.products.map(({name,...part})=>[name,rate(part)]))}};
  }
  if(id===17)return trialOpeningMetric(state);
  if(id===24)return retentionMetric(state);
  if(id===43)return deviceRetentionMetric(state);
  if(id===38){const source=structureMetricViews();if(source.reason)return pending(source.reason);}
  if(scoped.deviceStatus==='Inactive'&&[8,11,15,16,27,41,42,44,45,46,47].includes(id))
    return na('该指标以有效设备为统计对象，非有效设备不属于分母');
  if(product&&model&&product!=='All'&&model!=='All'&&((product==='Hunting')!==(model==='Hunt Pro')))
    return na('产品线与设备型号组合无样本');
  if(product&&scoped.plan&&((product==='Bird'&&scoped.plan==='Starter')||(product==='Hunting'&&scoped.plan==='Free')))
    return na('该套餐不属于所选产品线');
  if(product==='Hunting'&&[13,22,42].includes(id))return na('本指标只定义观鸟线，狩猎线口径待定义');
  if(id===13&&model==='Hunt Pro')return na('7日价值激活率只定义观鸟线；Hunt Pro属于狩猎线，当前口径不适用');
  if(scoped.plan==='Free'&&paidPlanMetricIds.has(id))
    return na('Free不是付费试用、订阅或续费套餐，不构成该指标的分母');
  if(id===52)return riskMetric(state);
  if(id===22&&scoped.plan&&scoped.plan!=='Free')return na('本项只统计观鸟Free权益');
  if(scoped.plan&&id===5) return pending('套餐适用，但底表缺少按套餐拆分的互斥订阅状态人数');
  if(id===46&&scoped.functionType&&!['Upload','Live','Push'].includes(scoped.functionType))
    return na('该功能不属于技术链路成功率口径');
  if(id===45||id===46)return technicalMetric(id,scoped,filters);
  if(id===41||id===44)return deviceActivityMetric(id,state);
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
  if(id===11||id===13)return onboardingMetric(id,state);
  if(id===18)return trialMetric(scoped);
  if(id===42)return deviceEventMetric(scoped);
  if(id===16){if(scoped.deviceStatus==='Inactive')return na('首次内容时非有效设备不属于本指标统计对象');const p=activationDeviceProjection(state);return p.reason?pending(p.reason):{kind:'count',value:p.current.rows.length};}
  if(id===15){const result=bindingDeviceRows(state);return result.rows?{kind:'count',value:result.rows.length}:pending(result.reason);}
  if(id===8)return deviceInventoryMetric(state);
  if(id===49)return deviceSharingMetric(state);
  if(id===50){const part=deviceStateProjection(state);return part.reason?pending(part.reason):{kind:'group',value:part.value};}
  let raw=sourceData.metrics[`m${String(id).padStart(2,'0')}`];
  if(scoped.week&&contract.dimensions.includes('week')) {
    const weekly=sourceData.weekly.find(w=>String(w.week)===scoped.week);
    if(!weekly) return na('指定周不存在');
    raw=weeklyMetric(id,weekly);
  }
  if(raw.kind==='na') return raw;

  const effectiveFilters=filters.filter(([key])=>key!=='week'||contract.dimensions.includes('week'));
  if(effectiveFilters.length&&[14,33,38].includes(id)) return na('本项只有汇总分布或分位数，缺少可重算的维度明细');
  if(id===39) {
    if(effectiveFilters.some(([key])=>!['country','productLine','deviceModel'].includes(key))) return pending('型号表现缺少当前条件下的关联模拟样本');
    const rows=sourceData.modelMarket?.records,products={K6:'Bird','Bird Lite':'Bird','Bird Pro':'Bird','Hunt Pro':'Hunting'};
    if(!Array.isArray(rows)||rows.some(row=>!row||!['US','UK','DE','Other'].includes(row.country)||
      !Object.hasOwn(products,row.model)||row.productLine!==products[row.model]))
      return pending('型号汇总的市场、主型号归属或记录结构待核验；不使用旧比例补齐');
    const records=rows.filter(row=>(!scoped.country||row.country===scoped.country)&&
      (!scoped.productLine||row.productLine===scoped.productLine)&&(!scoped.deviceModel||row.model===scoped.deviceModel));
    if(new Set(records.map(row=>`${row.country}:${row.model}`)).size!==records.length)
      return pending('同一市场与主型号出现重复汇总，需核对后再计算人数和比例');
    if(records.some(row=>![row.owners,row.activeOwners,row.subscribedOwners].every(Number.isSafeInteger)||
      row.owners<=0||row.activeOwners<0||row.subscribedOwners<0||row.activeOwners>row.owners||row.subscribedOwners>row.owners))
      return pending('型号汇总的人数缺失或不合法，需补齐同范围主账号、活跃和订阅人数后再计算');
    const grouped={};
    for(const row of records) {
      const item=grouped[row.model]??{owners:0,activeOwners:0,subscribedOwners:0};
      item.owners+=row.owners;item.activeOwners+=row.activeOwners;item.subscribedOwners+=row.subscribedOwners;
      grouped[row.model]=item;
    }
    return Object.keys(grouped).length?{kind:'group',value:Object.fromEntries(Object.entries(grouped).map(([name,item])=>[name,
      {...item,activeRate:item.activeOwners/item.owners,subscriptionRate:item.subscribedOwners/item.owners}]))}:
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
function dataQualityState(value) {
  if(value.kind==='na')return {label:value.availability==='pending'?'待补数据':'不适用',reason:value.reason};
  const {eventLoss,idMapping}=value.value??{};
  const thresholds=sourceData.snapshot.quality?.thresholds;
  const validRate=part=>part?.kind==='rate'&&Number.isFinite(part.numerator)&&Number.isFinite(part.denominator)&&
    part.denominator>0&&part.numerator>=0&&part.numerator<=part.denominator&&
    Number.isFinite(part.value)&&Math.abs(part.value-part.numerator/part.denominator)<1e-9;
  const validThreshold=limit=>Number.isFinite(limit)&&limit>=0&&limit<=1;
  if(!validThreshold(thresholds?.eventLossMax)||!validThreshold(thresholds?.idMappingMin))
    return {label:'待核验',reason:'缺少有效演示阈值，不能判定正常。'};
  const checks=[{key:'eventLoss',name:'事件丢失率',...eventLoss,limit:thresholds.eventLossMax,upper:true,unit:'事件'},
    {key:'idMapping',name:'ID映射覆盖率',...idMapping,limit:thresholds.idMappingMin,upper:false,unit:'记录'}]
    .map(check=>({...check,available:validRate(check),warning:validRate(check)&&(check.upper?check.value>check.limit:check.value<check.limit)}));
  const complete=checks.every(c=>c.available),warning=checks.some(c=>c.warning);
  return {label:warning?'演示预警':complete?'演示正常':'待核验',checks,
    reason:`演示阈值：事件丢失率≤${percent(thresholds.eventLossMax)}，ID映射覆盖率≥${percent(thresholds.idMappingMin)}；尚未确认生产达标标准。${complete?'':'至少一项比例不可核验，保留独立可用指标，不判为正常。'}`};
}
function projectDataset() {
  unbindingSourceCache=null;riskSourceCache=null;featureUsageCache=null;userRetentionCache=null;registrationSourceCache=null;
  if(filterErrors.length) {
    dataset={...sourceData,metrics:Object.fromEntries(sourceData.contract.map(c=>
      [`m${String(c.id).padStart(2,'0')}`,{...na('筛选条件无效，请修正或主动清除后查看。'),availability:'invalid-filter'}]))};
    return;
  }
  const overview=homeProjection();
  if(overview){dataset={...sourceData,metrics:Object.fromEntries(sourceData.contract.map(c=>{const key=`m${String(c.id).padStart(2,'0')}`;return [key,overview.metrics[key]?JSON.parse(JSON.stringify(overview.metrics[key])):pending('请进入所属专题准备并核验指标明细。')];}))};return;}
  dataset={...sourceData,metrics:Object.fromEntries(sourceData.contract.map(c=>[`m${String(c.id).padStart(2,'0')}`,
    !routeProjectionIds||routeProjectionIds.includes(c.id)?projectMetric(c.id):pending('请进入所属专题准备并核验指标明细。')]))};
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
    const v=flow.value,lost=v.opening+v.trialPaid+v.directPaid+v.recovered-subscribers.value;
    if(lost<0)dataset.metrics.m21=na('同范围订阅存量与流转人数不闭合：期末超过期初加全部新增；请核对来源，暂不计算净增。');
    else {v.closing=subscribers.value;v.lost=lost;}
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
    const title=element('strong','',`${label} · 指标口径`);title.id='metric-definition-title';
    heading.append(title);popover.setAttribute('aria-labelledby',title.id);
    const close=element('button','definition-close','×');
    close.type='button';close.setAttribute('aria-label','关闭指标口径');
    close.addEventListener('click',()=>closeDefinitionPopover());
    heading.append(close);popover.append(heading);
    const body=element('div','definition-popover-body');body.tabIndex=0;
    body.setAttribute('role','region');body.setAttribute('aria-label',`${label}定义、计算与来源`);
    for (const [name,value] of [['定义',item?.definition],['计算方法',item?.formula],['数据粒度',item?.grain],['数据来源',item?.source]]) {
      if (!value) continue;
      const row=element('div','definition-popover-row');
      row.append(element('span','',name),element('p','',value));body.append(row);
    }
    popover.append(body);popover.scrollTop=0;
    if (popover.showPopover) {
      if(popover.matches(':popover-open'))popover.hidePopover();
      popover.hidden=false;popover.showPopover();
    }
    else {popover.hidden=false;popover.classList.add('definition-fallback-open');}
    positionDefinitionPopover();close.focus({preventScroll:true});
  });
  return button;
}
function definitionPopoverIsOpen(popover=document.querySelector('#metric-definition-popover')) {
  return Boolean(popover&&(popover.showPopover?popover.matches(':popover-open'):!popover.hidden&&popover.classList.contains('definition-fallback-open')));
}
function positionDefinitionPopover() {
  const popover=document.querySelector('#metric-definition-popover');
  if(!definitionPopoverIsOpen(popover)||!definitionReturnFocus?.isConnected)return;
  const rect=definitionReturnFocus.getBoundingClientRect(),width=popover.offsetWidth,height=popover.offsetHeight;
  const left=Math.min(Math.max(16,rect.left),window.innerWidth-width-16);
  const below=rect.bottom+10;
  const top=below+height<=window.innerHeight-16?below:Math.max(16,rect.top-height-10);
  popover.style.left=`${left}px`;popover.style.top=`${Math.min(top,Math.max(16,window.innerHeight-height-16))}px`;
}
const definitionSizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(positionDefinitionPopover):null;
function closeDefinitionPopover() {
  const popover=document.querySelector('#metric-definition-popover');
  const wasOpen=definitionPopoverIsOpen(popover);
  if (popover?.showPopover && popover.matches(':popover-open')) popover.hidePopover();
  else if (popover) {popover.hidden=true;popover.classList.remove('definition-fallback-open');}
  if(wasOpen&&definitionReturnFocus?.isConnected) {
    definitionReturnFocus.focus({preventScroll:true});
    const rect=definitionReturnFocus.getBoundingClientRect();
    const navigation=document.querySelector('.section-navigation')?.getBoundingClientRect();
    const covered=navigation&&navigation.top<=0&&rect.top<navigation.bottom;
    if(covered||rect.top<0||rect.bottom>innerHeight||rect.left<0||rect.right>innerWidth) {
      definitionReturnFocus.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      const moved=definitionReturnFocus.getBoundingClientRect();
      const top=navigation&&navigation.top<=0?navigation.bottom+8:8;
      if(moved.top<top)scrollBy({top:moved.top-top,behavior:'instant'});
      else if(moved.bottom>innerHeight-8)scrollBy({top:moved.bottom-innerHeight+8,behavior:'instant'});
    }
  }
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
  const valueNode=element('div','metric-value',value);
  if(kind==='journey'&&[9,34].includes(id)&&metric(id).kind!=='na')valueNode.append(element('span','metric-value-unit','人'));
  link.append(metricValueRow(id,valueNode,trend));
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
const renewalIndexes=new WeakMap();
const renewalReasons={'cancel-expired':'主动取消后到期失效','payment-expired':'支付未完成后失效','unclassified-expiry':'未归因失效'};
function renewalAggregate(records) {
  const totals={opening:0,due:0,renewed:0,lostDuring:0,cancelled:0,restoredAfterLoss:0,cancelAndLoss:0,basePayers:0,reasons:Object.fromEntries(Object.keys(renewalReasons).map(k=>[k,0]))};
  for(const row of records)for(const o of row.outcomeCounts) {
    const n=o.count;totals.opening+=n;
    for(const key of ['due','renewed','cancelled','restoredAfterLoss'])if(o[key])totals[key]+=n;
    if(o.lossReason!==null){totals.lostDuring+=n;totals.reasons[o.lossReason]+=n;if(o.cancelled)totals.cancelAndLoss+=n;}
    if(o.renewed||o.restoredAfterLoss)totals.basePayers+=n;
  }
  return totals;
}
function renewalIndex() {
  const source=sourceData.monthlyRenewalFacts;
  if(!source||typeof source!=='object')return {reason:'月度续订频数待补，不能沿用原周度结果。'};
  if(renewalIndexes.has(source))return renewalIndexes.get(source);
  const invalid=()=>{const part={reason:'月度续订来源的月份、人数或观察窗口待核验；不以周度或独立分片替代。'};renewalIndexes.set(source,part);return part;};
  const whole=n=>Number.isSafeInteger(n)&&n>=0;
  const dates=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  if(source.version!=='synthetic-monthly-renewal-v1'||source.status!=='APPROVED_SYNTHETIC'||source.classification!=='entirely_synthetic'||source.timezone!=='UTC'||source.asOf!==sourceData.snapshot.asOf||!Array.isArray(source.months)||source.months.length!==12)return invalid();
  const rows=[];
  for(const [i,m] of source.months.entries()) {
    const ordinal=monthOrdinal(m?.month);
    if(ordinal===null||i&&ordinal!==monthOrdinal(rows[i-1].month)+1||!dates(m.start)||!dates(m.endExclusive)||!dates(m.renewalObservationEndExclusive)||m.start!==`${m.month}-01`||monthOrdinal(m.endExclusive.slice(0,7))!==ordinal+1||!m.endExclusive.endsWith('-01')||Date.parse(m.renewalObservationEndExclusive)-Date.parse(m.endExclusive)!==7*86400000||!Array.isArray(m.records)||m.records.length!==240)return invalid();
    const seen=new Set();
    for(const r of m.records) {
      if(!r||!['US','UK','DE','Other'].includes(r.country)||!['iOS','Android'].includes(r.appPlatform)||!['App Store','Google Play','Web'].includes(r.subscriptionPlatform)||!['Monthly','Annual'].includes(r.billingCycle)||!(r.productLine==='Bird'?['Plus','Pro']:r.productLine==='Hunting'?['Starter','Plus','Pro']:[]).includes(r.plan)||!whole(r.opening)||!Array.isArray(r.outcomeCounts))return invalid();
      const key=[r.country,r.appPlatform,r.subscriptionPlatform,r.productLine,r.plan,r.billingCycle].join('|');if(seen.has(key))return invalid();seen.add(key);
      const outcomes=new Set();let count=0;
      for(const o of r.outcomeCounts) {
        if(!o||!whole(o.count)||o.count===0||!['due','renewed','cancelled','restoredAfterLoss'].every(k=>typeof o[k]==='boolean')||!(o.lossReason===null||Object.hasOwn(renewalReasons,o.lossReason))||o.renewed&&!o.due||o.restoredAfterLoss&&o.lossReason===null||o.lossReason==='cancel-expired'&&!o.cancelled||r.billingCycle==='Monthly'&&!o.due)return invalid();
        const signature=JSON.stringify([o.due,o.renewed,o.cancelled,o.lossReason,o.restoredAfterLoss]);if(outcomes.has(signature))return invalid();outcomes.add(signature);count+=o.count;
      }
      if(count!==r.opening)return invalid();
    }
    const totals=renewalAggregate(m.records);
    if(!['opening','due','renewed','lostDuring','cancelled','restoredAfterLoss'].every(k=>whole(m[k])&&m[k]===totals[k])||!['noRightsAtEnd','otherInflow','monthlyPayers','netIncome','closing'].every(k=>whole(m[k]))||m.noRightsAtEnd!==totals.lostDuring-totals.restoredAfterLoss||m.closing!==m.opening-m.noRightsAtEnd+m.otherInflow||m.monthlyPayers!==totals.basePayers+m.otherInflow||i&&rows[i-1].closing!==m.opening)return invalid();
    rows.push({...m,mature:Date.parse(m.renewalObservationEndExclusive)<=Date.parse(source.asOf)});
  }
  const latest=rows.filter(r=>r.mature).at(-1);
  if(!latest||source.defaultMonth!==latest.month)return invalid();
  const part={rows,defaultMonth:latest.month};renewalIndexes.set(source,part);return part;
}
function renewalProjection(state=filterState) {
  const source=renewalIndex();if(source.reason)return source;
  const month=renewalMonthRequest.length?renewalMonthRequest[0]:source.defaultMonth;
  if(renewalMonthRequest.length>1||!source.rows.some(r=>r.month===month))return {reason:'续订观察月无效；请选择已有完整月份。'};
  const filters=effectiveFor(23,state);
  if(filters.some(([key])=>!policyFor(23).demonstrableDimensions.includes(key)))return {reason:'当前范围缺少期初归属同源明细。'};
  const rows=source.rows.map(m=>{
    const records=m.records.filter(r=>filters.every(([k,v])=>r[k]===(k==='billingCycle'?({monthly:'Monthly',annual:'Annual'})[v]:v))),totals=renewalAggregate(records);
    const rate=(n,d)=>d>=30?{kind:'rate',numerator:n,denominator:d,value:n/d}:({...na(d?'样本不足30人':'无合格样本'),numerator:n,denominator:d});
    return {...m,...totals,renewal:m.mature?rate(totals.renewed,totals.due):pending('到期后7天观察未结束'),loss:rate(totals.lostDuring,totals.opening),cancel:rate(totals.cancelled,totals.opening)};
  });
  return {month,rows,current:rows.find(r=>r.month===month),filtered:filters.length>0};
}
function renewalMetric(state=filterState) {
  const part=renewalProjection(state);return part.reason?pending(part.reason):part.current.renewal;
}
function renewalControl() {
  const wrap=element('div','retention-month-control renewal-month-control'),label=element('label','','续订观察月（仅#23）'),select=element('select',''),part=renewalProjection(),index=renewalIndex();
  select.name='renewalMonth';select.setAttribute('aria-label','续订观察月（仅#23）');
  if(part.reason){const option=element('option','',`待修正：${renewalMonthRequest.join(' / ')||'来源待核验'}`);option.value='invalid';option.disabled=true;select.append(option);}
  for(const r of index.rows??[]){const option=element('option','',`${r.month}${r.mature?'':' · 观察未结束'}`);option.value=r.month;select.append(option);}
  select.value=part.reason?'invalid':part.month;
  select.addEventListener('change',()=>{const params=new URLSearchParams(location.hash.split('?')[1]??'');params.delete('renewalMonth');if(select.value!==index.defaultMonth)params.set('renewalMonth',select.value);pushRoute(`#/D?${params}`);renderRoute({preserveScroll:true});document.querySelector('[name="renewalMonth"]')?.focus({preventScroll:true});document.querySelector('#announcement').textContent=`已选择${select.value}；仅更新#23及其登记范围。`;});
  label.append(select);wrap.append(label,element('p','table-note','完整到期月，UTC；到期后7天为合成观察窗，非支付平台宽限期。'));return wrap;
}
function renewalMonthTable(part=renewalProjection()) {
  if(part.reason)return {title:'月度续订 · 待核验',columns:['状态'],rows:[[part.reason]]};
  const text=rate=>rate.kind==='rate'?percent(rate.value):rate.reason;
  return {title:'12个月 · 同源续订、权益流失与取消',selectedPeriod:part.month,columns:['完整月','期初有效主订阅（人）','当月到期（人）','成功续订（人）','续订率','发生权益流失（人）','流失率','主动取消（人）','取消率','最晚观察日（UTC）'],rows:part.rows.map(r=>[r.month,r.opening,r.due,r.mature?r.renewed:'—',text(r.renewal),r.lostDuring,text(r.loss),r.cancelled,text(r.cancel),new Date(Date.parse(r.renewalObservationEndExclusive)-86400000).toISOString().slice(0,10)]),note:'全部为独立月份合成频数，归属按月初冻结；不提供跨月用户身份，不相加为年度独立人数。续订、流失与取消分母不同；取消与流失可重叠，恢复后仍记发生过流失。'};
}
function renewalContextTable(spec) {
  if(spec.title!=='转化与续费环节')return spec;
  const part=renewalProjection(),r=part.current,rate=r?.renewal,flow=metric(21),flowWindow=sourceData.subscriptionFlow?.window??'窗口待核验';
  const period=r?`${r.month}到期人群，观察至${new Date(Date.parse(r.renewalObservationEndExclusive)-86400000).toISOString().slice(0,10)}（UTC）`:'月度到期续订待核验，未沿用原周度样例';
  return {...spec,rows:spec.rows.map(row=>{
    if(row[0]==='到期续订')return [`月度到期续订${r?`（${r.month}）`:''}`,
      rate?.numerator??'—',rate?.denominator??'—',rate?.kind==='rate'?percent(rate.value):part.reason??rate?.reason??'待核验'];
    if(row[0]==='期初有效订阅退出')return ['本期权益退出（#21）',flow.kind==='group'?flow.value.lost:'—',
      flow.kind==='group'?flow.value.opening:'—',flow.kind==='group'&&flow.value.opening>=30?percent(flow.value.lost/flow.value.opening):'无可靠比例'];
    return row;
  }),note:`到期续订：${period}；其余环节各按自身批次。权益退出仍为${flowWindow}订阅流转（#21），不等于同月到期未续订，也不等于离开产品。`};
}
function renewalEvidence(panel,appendPair) {
  const part=renewalProjection();if(part.reason){const warning=element('p','na-note',part.reason);warning.dataset.evidenceKind='change';panel.append(warning);return;}
  if(metric(23).kind==='na'&&metric(23).availability!=='pending'&&part.current.opening===0){const warning=element('p','na-note',metric(23).reason);warning.dataset.evidenceKind='change';panel.append(warning);}
  const r=part.current,summary=element('section','renewal-summary');summary.dataset.evidenceKind='change';summary.append(element('h3','',`${r.month} · 期初同群结果`));
  const cards=element('dl','onboarding-stats');
  for(const [label,value] of [['到期续订',r.renewal],['发生权益流失',r.loss],['主动取消',r.cancel]]){const card=element('div','');card.append(element('dt','',label),element('dd','',value.kind==='rate'?percent(value.value):value.reason),element('p','table-note',value.numerator===undefined?'观察未结束；不计算最终比例':`${number(value.numerator)} / ${number(value.denominator)} 人`));cards.append(card);}
  summary.append(cards,element('p','table-note',`流失后恢复 ${number(r.restoredAfterLoss)} 人；期末仍无权益 ${number(r.lostDuring-r.restoredAfterLoss)} 人；取消与流失交集 ${number(r.cancelAndLoss)} 人。回落Free不等于离开产品；这些人数不可直接相加。`));panel.append(summary);
  const history=part.rows;
  appendPair({title:'发生权益流失与主动取消 · 12个月',unit:'%',labels:history.map(r=>r.month),selectedPeriod:part.month,series:[['loss','发生权益流失率'],['cancel','主动取消率']].map(([key,name])=>({name,values:history.map(r=>r[key].kind==='rate'?r[key].value*100:null),details:history.map(r=>({...r[key],numeratorUnit:'人',denominatorUnit:'人',basisLabel:'当月发生人数 / 期初有效主订阅'}))})),note:'两条线均以各月期初有效主订阅群为分母，可重叠，不相加；和续订到期分母分开呈现。'},renewalMonthTable(part),'change');
  appendPair({title:`${r.month} · 首次权益失效主原因`,unit:'人',labels:Object.values(renewalReasons),series:[{name:'发生流失主账号',values:Object.keys(renewalReasons).map(k=>r.reasons[k])}],note:'每人只计首个失效主原因，三类互斥合计发生流失人数；未归因保留，合成分类不证明因果。'}, {title:'失效原因验算',columns:['首个主原因','发生流失（人）','占本月流失'],rows:Object.entries(renewalReasons).map(([key,label])=>[label,r.reasons[key],r.lostDuring?percent(r.reasons[key]/r.lostDuring):'无流失样本']),note:`合计${number(r.lostDuring)}人；不使用1−续订率推算流失率。`});
  const full=dataTable(renewalMonthTable(part),'renewal-calculation');full.dataset.evidenceKind='data';panel.append(full);
}
function trendValues(id) {
  const overview=homeProjection();if(overview)return overview.trends[id]??null;
  if([9,10,12].includes(id))return registrationHistory(id)?.values??null;
  if(id===17)return trialOpeningHistory()?.values??null;
  if(id===16)return activationDeviceHistory()?.values??null;
  if(id===52)return riskHistory()?.values??null;
  if(id===54){const p=qualityProjection();return p.rows?p.rows.map(r=>r.loss===null?null:r.loss*100):null;}
  if(id===53){const part=anomalyProjection();return part.rows?part.rows.map(w=>w.count):null;}
  if(id===7){const part=accountStockHistory();return part.rows?part.rows.map(r=>r.registered):null;}
  if(id===46)return technicalHistoryHeadline()?.values??null;
  if(id===2){const part=subscriptionStatusHistoryProjection();if(part.rows)return part.rows.map(r=>Object.values(r.products).reduce((sum,p)=>sum+p.paidCurrent+p.cancelledButEntitled,0));}
  if(id===4||id===25){const p=activeWindowProjection();return p.rows?p.rows.map(r=>r.counts[id===4?'MAU':'DAU']):null;}
  if(id===23){const part=renewalProjection();return part.rows?part.rows.map(r=>r.renewal.kind==='rate'?r.renewal.value*100:null):null;}
  if(id===24){const part=retentionProjection();return part.rows?part.rows.map(r=>r.value===null?null:r.value*100):null;}
  if(id===11||id===13){const values=sourceData.weekly.map(week=>{const value=projectMetric(id,{...filterState,week:String(week.week)});return value.kind==='rate'?value.value*100:null;});return values.some(Number.isFinite)?values:null;}
  if(id===41||id===44){const index=deviceActivityIndex();if(index.reason)return null;return index.snapshots.map(point=>{const value=deviceActivityMetric(id,filterState,point.at);return value.kind==='rate'?value.value*100:null;});}
  if(id===15) {
    const index=bindingDeviceIndex();if(index.reason)return null;
    return index.snapshots.map(point=>bindingDeviceRows(filterState,point.time).rows.length);
  }
  if(id===27)return featureUsageHistory()?.values??null;
  if(id===42) {
    const values=sourceData.weekly.map(week=>{const value=deviceEventMetric(filterState,week.week);return value.kind==='rate'?value.value*100:null;});
    return values.some(value=>value!==null)?values:null;
  }
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
  if((filterState.productLine==='Hunting'||filterState.deviceModel==='Hunt Pro')&&[13,42].includes(id))return null;
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
function monthOrdinal(value) {
  const match=typeof value==='string'&&/^([1-9]\d{3})-(0[1-9]|1[0-2])$/.exec(value);
  return match?Number(match[1])*12+Number(match[2])-1:null;
}
function ordinalMonth(value) {return `${Math.floor(value/12)}-${String(value%12+1).padStart(2,'0')}`;}
// Approved activation-week cohorts, kept separate from trigger weeks and current device pools.
function deviceRetentionIndex() {
  const source=sourceData.deviceRetentionFacts,raw=sourceData.metrics.m43;
  const invalid=()=>({reason:'设备留存批次、观察期或同源设备计数待核验；不回退原独立分片。'});
  const date=text=>{if(typeof text!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(text))return NaN;const n=Date.parse(`${text}T00:00:00Z`);return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===text?n:NaN;};
  const asOf=date(source?.asOf),day=86400000,whole=n=>Number.isSafeInteger(n)&&n>=0;
  if(!source||source.version!=='synthetic-device-retention-v1'||source.status!=='approved-synthetic'||source.classification!=='entirely_synthetic'||
    source.timezone!=='UTC'||source.asOf!==sourceData.snapshot.asOf||!Number.isFinite(asOf)||!Array.isArray(source.cohorts)||source.cohorts.length!==12)return invalid();
  const latestEnd=asOf-((new Date(asOf).getUTCDay()+6)%7+1)*day;
  const cells=['US','UK','DE','Other'].flatMap(country=>['K6','Bird Lite','Bird Pro','Hunt Pro'].flatMap(model=>['Amazon','Shopify'].map(channel=>`${country}:${model}:${channel}`)));
  for(const [i,c] of source.cohorts.entries()) {
    const end=latestEnd-(11-i)*7*day,start=end-6*day;
    if(!c||date(c.start)!==start||date(c.end)!==end||c.id!==c.start||!whole(c.activated)||!c.activated||!Array.isArray(c.records)||c.records.length!==32||!c.mature||!c.observationEndExclusive)return invalid();
    for(const horizon of [7,30]) {
      const key=`D${horizon}`,cutoff=end+(horizon+1)*day;
      if(date(c.observationEndExclusive[key])!==cutoff||c.mature[key]!==Boolean(asOf>=cutoff))return invalid();
    }
    for(const [j,r] of c.records.entries()) {
      if(!r||`${r.country}:${r.deviceModel}:${r.salesChannel}`!==cells[j]||r.productLine!==(r.deviceModel==='Hunt Pro'?'Hunting':'Bird')||r.entryDeviceStatus!=='Effective'||
        !whole(r.activated)||!Array.isArray(r.outcomeCounts)||r.outcomeCounts.length<1||r.outcomeCounts.length>4)return invalid();
      const seen=new Set();let previous='';
      for(const outcome of r.outcomeCounts) {
        if(!outcome||!whole(outcome.count)||outcome.count===0||['D7','D30'].some(key=>c.mature[key]?typeof outcome[key]!=='boolean':outcome[key]!==null))return invalid();
        const key=['D7','D30'].map(k=>outcome[k]===null?'u':outcome[k]?'1':'0').join('');
        if(seen.has(key)||previous&&key<previous)return invalid();seen.add(key);previous=key;
      }
      if(r.outcomeCounts.reduce((n,o)=>n+o.count,0)!==r.activated)return invalid();
    }
    if(c.records.reduce((n,r)=>n+r.activated,0)!==c.activated)return invalid();
  }
  const anchor=source.cohorts.filter(c=>c.mature.D30).at(-1);
  if(!anchor||source.defaultCohort!==anchor.id||raw?.kind!=='group')return invalid();
  for(const key of ['D7','D30']) {
    const n=anchor.records.reduce((n,r)=>n+r.outcomeCounts.reduce((sum,o)=>sum+(o[key]?o.count:0),0),0),part=raw.value?.[key];
    if(part?.kind!=='rate'||!Number.isFinite(part.value)||part.numerator!==n||part.denominator!==anchor.activated||Math.abs(part.value-n/anchor.activated)>1e-12)return invalid();
  }
  return {rows:source.cohorts,defaultCohort:source.defaultCohort,asOf:source.asOf};
}
function deviceRetentionSelection() {
  const index=deviceRetentionIndex(),id=deviceRetentionCohortRequest.length?deviceRetentionCohortRequest[0]:index.defaultCohort;
  if(index.reason)return {...index,id};
  if(deviceRetentionCohortRequest.length>1||!index.rows.some(c=>c.id===id))return {id,reason:'激活批次无效或包含多个值；请重新选择一个完整激活周。'};
  return {...index,id};
}
function deviceRetentionProjection(state=filterState) {
  const selected=deviceRetentionSelection();if(selected.reason)return selected;
  const filters=effectiveFor(43,state);
  if(filters.some(([key])=>!['country','deviceModel','productLine','salesChannel','deviceStatus'].includes(key)))return {reason:'当前范围缺少同源激活批次明细。'};
  return {...selected,rows:selected.rows.map(c=>{
    const records=c.records.filter(r=>filters.every(([key,value])=>r[key==='deviceStatus'?'entryDeviceStatus':key]===value)),denominator=records.reduce((n,r)=>n+r.activated,0);
    const measures=Object.fromEntries(['D7','D30'].map(key=>{
      const numerator=c.mature[key]?records.reduce((n,r)=>n+r.outcomeCounts.reduce((a,o)=>a+(o[key]?o.count:0),0),0):null;
      if(denominator<30)return [key,{...na(`${denominator?'样本不足30台':'无合格样本'}；本批次入组 ${denominator} 台${numerator===null?'':`，${key}留存 ${numerator} 台`}`),numerator,denominator}];
      if(numerator===null)return [key,{...pending(`本批次${key}观察未结束；最晚观察日至${new Date(Date.parse(c.observationEndExclusive[key])-86400000).toISOString().slice(0,10)}`),numerator:null,denominator}];
      return [key,{kind:'rate',numerator,denominator,value:numerator/denominator,numeratorUnit:'台',denominatorUnit:'台',basisLabel:`${c.start}—${c.end} ${key}留存 / 激活入组`}];
    }));
    return {...c,records,denominator,measures};
  })};
}
function deviceRetentionCurrent(state=filterState) {
  const part=deviceRetentionProjection(state);return part.reason?part:part.rows.find(c=>c.id===part.id);
}
function deviceRetentionMetric(state=filterState) {
  const current=deviceRetentionCurrent(state);return current.reason?pending(current.reason):{kind:'group',value:current.measures};
}
const deviceRetentionText=part=>part.kind==='rate'?percent(part.value):part.denominator<30?(part.denominator?'样本不足30台':'无合格样本'):'观察未结束';
function hasRegistrationBaseline(id) {
  const value=metric(id);return value.kind!=='na'&&(id!==26||value.value.sessionsPerUser!==null)&&(![12,28,43].includes(id)||Object.values(value.value).some(part=>part.kind==='rate'));
}
function deviceRetentionWindow() {
  const c=deviceRetentionCurrent();if(c.reason)return '当前范围暂无可用基线周期';
  const key=c.measures.D30.kind==='rate'?'D30':c.measures.D7.kind==='rate'?'D7':null;
  return key?`设备留存${key}观察期末 ${new Date(Date.parse(c.observationEndExclusive[key])-86400000).toISOString().slice(0,10)} · 激活批次 ${c.start}—${c.end}`:'所选激活批次尚无可用完整观察基线';
}
function selectDeviceRetentionCohort(id,{fromChart=false}={}) {
  const params=new URLSearchParams(location.hash.split('?')[1]??'');params.delete('activationCohort');
  if(id!==deviceRetentionIndex().defaultCohort)params.set('activationCohort',id);
  pushRoute(`#/C?${params}`);renderRoute({preserveScroll:true});
  document.querySelector('[name="activationCohort"]')?.focus({preventScroll:true});
  document.querySelector('#announcement').textContent=`已选择激活批次${id}；仅更新#43及其登记范围${fromChart?'，当前问题单指标保持不变':''}。`;
}
function deviceRetentionControl() {
  const wrap=element('div','retention-month-control device-retention-control'),label=element('label','','激活批次（仅#43）'),select=element('select','');
  select.name='activationCohort';select.setAttribute('aria-label','激活批次（仅#43）');
  const selected=deviceRetentionSelection(),index=deviceRetentionIndex();
  if(selected.reason){const option=element('option','',`待修正：${deviceRetentionCohortRequest.join(' / ')||'批次来源待核验'}`);option.value='invalid';option.disabled=true;select.append(option);}
  for(const c of index.rows??[]){const option=element('option','',`${c.start}—${c.end}${c.id===index.defaultCohort?' · 默认完整D30':''}`);option.value=c.id;select.append(option);}
  select.value=selected.reason?'invalid':selected.id;select.addEventListener('change',()=>selectDeviceRetentionCohort(select.value));
  label.append(select);wrap.append(label,element('p','table-note','首图激活周，UTC；默认最新D30完整批次，两项留存使用同一群设备。'));return wrap;
}
function deviceRetentionTable(projection=deviceRetentionProjection()) {
  if(projection.reason)return {title:'设备留存 · 待核验',columns:['状态'],rows:[[projection.reason]]};
  return {title:'12个激活批次 · 留存设备验算',selectedPeriod:projection.id,columns:['激活周起日','激活周止日','入组设备（台）','D7留存（台）','D7留存率','D7最晚观察日','D30留存（台）','D30留存率','D30最晚观察日'],
    rows:projection.rows.map(c=>[c.start,c.end,c.denominator,...['D7','D30'].flatMap(key=>[c.measures[key].numerator??'—',deviceRetentionText(c.measures[key]),new Date(Date.parse(c.observationEndExclusive[key])-86400000).toISOString().slice(0,10)])]),
    note:'首图／首视频为D0；D7、D30分别是第7／30个UTC自然日的有效设备行为，心跳不计入。入组时归属固定，后续停用仍在分母；D30不是D7子集，不是连续存活率。全部是合成频数，非真实设备日志。'};
}
function deviceRetentionEvidence(appendPair,panel) {
  const part=deviceRetentionProjection(),c=part.rows.find(row=>row.id===part.id),table=deviceRetentionTable(part),stats=element('section','device-retention-summary');stats.dataset.evidenceKind='change';
  stats.append(element('h3','',`${c.start}—${c.end} · 同批次留存`));
  const cards=element('dl','onboarding-stats');
  for(const [title,text,basis] of ['D7','D30'].map(key=>[`${key}留存`,deviceRetentionText(c.measures[key]),c.measures[key].numerator===null?'完整观察期尚未结束':`${number(c.measures[key].numerator)} / ${number(c.denominator)} 台`]).concat([['首图激活入组',`${number(c.denominator)} 台`,'按入组时状态与归属']])) {
    const cell=element('div','');cell.append(element('dt','',title),element('dd','',text),element('p','table-note',basis));cards.append(cell);
  }
  stats.append(cards);panel.append(stats);
  const note=table.note;
  const heat={kind:'deviceRetentionHeatmap',title:'近12个激活批次 · D7／D30留存',unit:'%',labels:part.rows.map(r=>r.start),selectedPeriod:part.id,cohorts:part.rows,series:[],note:`统一0–100%色阶；观察未结束或不足30台单独标记，不作为0%。点击单元选择批次，键盘可用上方批次选择。${note}`};
  appendPair(heat,table,'change');
  const series=['D7','D30'].map(key=>({name:`${key}留存`,values:part.rows.map(r=>r.measures[key].kind==='rate'?r.measures[key].value*100:null),details:part.rows.map(r=>r.measures[key])}));
  if(series.some(line=>line.values.some(Number.isFinite)))appendPair({title:'分批设备留存趋势 · 同一观察日比较',endLastValid:true,unit:'%',labels:part.rows.map(r=>r.start),selectedPeriod:part.id,series,note:'横轴为激活周起日；两条线分别比较各批次D7／D30，不把未完整观察或小样本补0，不把跨批次变化视作型号或渠道因果。'},table,'change');
  for(const dimension of ['deviceModel','salesChannel']) {
    const options=availableOptions('C',dimension),parts=options.map(option=>({option,current:deviceRetentionCurrent({...filterState,[dimension]:option})}));
    const labels=options.map(option=>optionLabel(dimension,option)),spec={title:`${filterLabels[dimension]} · 所选激活批次留存`,unit:'%',labels,
      series:['D7','D30'].map(key=>({name:`${key}留存`,values:parts.map(p=>p.current.measures[key].kind==='rate'?p.current.measures[key].value*100:null),details:parts.map(p=>p.current.measures[key])})),
      note:`${c.start}—${c.end}；保留其他筛选，仅替换${filterLabels[dimension]}。两项分母均为该组入组设备；型号与渠道两套分组不相加。少于30台不画可靠率；自报渠道不证明真实订单归因。`};
    appendPair(spec,{title:`${filterLabels[dimension]} · 设备数验算`,columns:['分组','入组（台）','D7留存（台）','D7率','D30留存（台）','D30率'],
      rows:parts.map((p,i)=>[labels[i],p.current.denominator,p.current.measures.D7.numerator??'—',deviceRetentionText(p.current.measures.D7),p.current.measures.D30.numerator??'—',deviceRetentionText(p.current.measures.D30)]),note:spec.note});
    const pair=panel.lastElementChild,body=pair.querySelector('tbody');
    [...body.rows].forEach((tr,i)=>{const td=element('td',''),button=element('button','filter-reset','查看设备');button.type='button';button.setAttribute('aria-label',`查看${labels[i]}的批次设备`);
      button.addEventListener('click',()=>{const params=new URLSearchParams(location.hash.split('?')[1]??'');params.set(dimension,options[i]);params.set('panel','data');pushRoute(`#/C?${params}`);renderRoute({preserveScroll:true});document.querySelector('.device-retention-list h3')?.focus({preventScroll:true});});td.append(button);tr.append(td);});
    pair.querySelector('thead tr').append(element('th','','下钻'));
  }
  const full=dataTable(table,'device-retention-calculation');full.dataset.evidenceKind='data';panel.append(full,deviceRetentionList(c));
}
const deviceRetentionPalette=['#f4f7ee','#b6ceaa','#173e2b'];
function deviceRetentionLabelColor(value) {
  const part=Math.min(1,Math.floor(value/50)),fraction=value/50-part;
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const a=rgb(deviceRetentionPalette[part]),b=rgb(deviceRetentionPalette[part+1]);
  const luminance=a.map((v,i)=>(v+(b[i]-v)*fraction)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  return luminance>=.18?'#000000':'#ffffff';
}
function drawDeviceRetentionHeatmap(instance,box,spec) {
  const valid=[],missing=[],measureKeys=spec.measureKeys??['D7','D30'],measureText=spec.measureText??deviceRetentionText;
  spec.cohorts.forEach((c,y)=>measureKeys.forEach((key,x)=>{const part=c.measures[key];
    if(part.kind==='rate'){const value=part.value*100;valid.push({value:[x,y,value],label:{color:deviceRetentionLabelColor(value)}});}
    else missing.push({value:[x,y],label:{formatter:measureText(part)}});
  }));
  setChartOption(instance,()=>{
    const left=148,right=18,top=30,bottom=48;
    return {animationDuration:0,grid:{left,right,top,bottom},
      tooltip:{...chartTooltipStyle(),trigger:'item',formatter:params=>{const [x,y]=params.value,c=spec.cohorts[y],key=measureKeys[x],part=c.measures[key];
        return `${c.start}—${c.end}<br>${key}：${measureText(part)}<br>${part.numerator===null?'完整观察期尚未结束':`${number(part.numerator)} / ${number(part.denominator)} ${spec.denominatorUnit??'台'}`}<br>最晚观察日至 ${new Date(Date.parse(c.observationEndExclusive[key])-86400000).toISOString().slice(0,10)}`;}},
      xAxis:{type:'category',position:'top',data:measureKeys,axisTick:{show:false},axisLine:{show:false},axisLabel:{fontSize:chartText(12),color:'#355b43',fontWeight:600}},
      yAxis:{type:'category',inverse:true,data:spec.cohorts.map(c=>`${c.start.slice(5)}—${c.end.slice(5)}`),axisTick:{show:false},axisLine:{show:false},
        axisLabel:{interval:0,fontSize:chartText(11),color:'#405e49',formatter:(label,i)=>spec.cohorts[i].id===spec.selectedPeriod?`▶ ${label}`:label}},
      visualMap:{min:0,max:100,dimension:2,seriesIndex:[0],orient:'horizontal',left:'center',bottom:0,itemWidth:chartText(10),itemHeight:chartText(140),text:['100%','0%'],calculable:false,inRange:{color:deviceRetentionPalette}},
      series:[{name:'完整观察留存率',type:'heatmap',data:valid,label:{show:true,fontSize:chartText(12),formatter:p=>`${p.value[2].toFixed(1)}%`},itemStyle:{borderWidth:3,borderColor:'#fffefa'}},
        {name:'观察或样本状态',type:'scatter',data:missing,encode:{x:0,y:1},symbol:'rect',symbolSize:[Math.max(0,(box.clientWidth-chartText(left+right))/measureKeys.length-4),Math.max(0,(box.clientHeight-chartText(top+bottom))/spec.cohorts.length-3)],
          itemStyle:{color:'#edf1e9',opacity:1},label:{show:true,position:'inside',fontSize:chartText(11),color:'#526b55'}}]};
  },{responsive:true});
  instance.on('click',params=>{const index=params.value?.[1];if(Number.isInteger(index)&&spec.cohorts[index])(spec.onCohortSelect??selectDeviceRetentionCohort)(spec.cohorts[index].id,{fromChart:true});});
}
const deviceRetentionQueues=new Map();
function deviceRetentionDevices(c) {
  const index=deviceRetentionIndex();if(index.reason)return [];
  const original=index.rows.find(row=>row.id===c.id),devices=[];
  for(const r of c.records){const cell=original.records.indexOf(r);let position=0;
    for(const outcome of r.outcomeCounts)for(let i=0;i<outcome.count;i++) {
      position++;const activatedAt=new Date(Date.parse(`${c.start}T12:00:00Z`)+(position-1)%7*86400000).toISOString();
      devices.push({id:`SIM43-${c.id.replaceAll('-','')}-${String(cell+1).padStart(2,'0')}-${String(position).padStart(4,'0')}`,cohort:c.id,start:c.start,end:c.end,activatedAt,
        country:r.country,productLine:r.productLine,deviceModel:r.deviceModel,salesChannel:r.salesChannel,entryDeviceStatus:r.entryDeviceStatus,D7:outcome.D7,D30:outcome.D30});
    }
  }return devices;
}
function deviceRetentionList(c) {
  const node=element('section','device-retention-list');node.dataset.evidenceKind='data';
  const title=element('h3','','所选激活批次 · 合成设备清单');title.tabIndex=-1;node.append(title);
  const key=recordScope('C',43),state=deviceRetentionQueues.get(key)??{query:'',page:0,selected:null};deviceRetentionQueues.set(key,state);
  const devices=deviceRetentionDevices(c),controls=element('div','binding-list-controls'),label=element('label','','查找设备'),input=element('input','');input.type='search';input.value=state.query;input.setAttribute('aria-label','搜索留存批次设备');label.append(input);controls.append(label);node.append(controls);
  const result=element('p','table-note'),content=element('div',''),paging=element('div','binding-list-pagination');node.append(result,content,paging);
  const select=(record,trigger,announce=true)=>{state.selected=record.id;node.dispatchEvent(new CustomEvent('device-retention-select',{bubbles:true,detail:{record,trigger}}));
    node.querySelectorAll('tbody tr').forEach(tr=>{const selected=tr.dataset.deviceId===record.id;tr.toggleAttribute('data-selected',selected);tr.querySelector('button')?.setAttribute('aria-pressed',String(selected));});
    if(announce)document.querySelector('#announcement').textContent=`已选择 ${record.id}，右侧显示同批次设备详情；问题单未改变。`;
  };
  const draw=()=>{
    const query=state.query.trim().toLowerCase(),rows=devices.filter(r=>[r.id,optionLabel('country',r.country),r.deviceModel,r.salesChannel].join(' ').toLowerCase().includes(query));
    state.page=Math.min(state.page,Math.max(0,Math.ceil(rows.length/20)-1));const pageRows=rows.slice(state.page*20,state.page*20+20);
    result.textContent=`本批次 ${number(c.denominator)} 台；匹配 ${number(rows.length)} 台。合成频数按固定顺序枚举；不是生产设备日志。`;
    const wrap=dataTable({title:'留存批次设备 · 每页20台',columns:['合成设备编号','国家/市场','型号','自报渠道','D7有效行为','D30有效行为'],
      rows:pageRows.map(r=>[r.id,optionLabel('country',r.country),r.deviceModel,r.salesChannel,...['D7','D30'].map(k=>r[k]===null?'批次待观察':r[k]?'有':'无')]),note:'入组时状态为有效；首图日期为合成分配。后续未使用设备仍在分母。D7／D30未知不解释为无行为。'});
    const body=wrap.querySelector('tbody');[...body.rows].forEach((tr,i)=>{const record=pageRows[i],button=element('button','retention-device-select',record.id);button.type='button';button.setAttribute('aria-label',`查看${record.id}设备留存`);tr.dataset.deviceId=record.id;tr.toggleAttribute('data-selected',state.selected===record.id);button.setAttribute('aria-pressed',String(state.selected===record.id));tr.firstChild.replaceChildren(button);button.addEventListener('click',()=>select(record,button));});
    content.replaceChildren(wrap);paging.replaceChildren();
    const previous=element('button','filter-reset','上一页'),next=element('button','filter-reset','下一页');previous.type=next.type='button';previous.disabled=state.page===0;next.disabled=(state.page+1)*20>=rows.length;
    for(const [button,delta] of [[previous,-1],[next,1]])button.addEventListener('click',()=>{state.page+=delta;draw();restoreListPaginationFocus(paging,delta);});
    paging.append(previous,element('span','table-note',`第 ${state.page+1} / ${Math.max(1,Math.ceil(rows.length/20))} 页`),next);updateScrollableTables();
  };
  input.addEventListener('input',()=>{state.query=input.value;state.page=0;draw();});draw();
  if(state.selected){const row=devices.find(r=>r.id===state.selected);if(row)requestAnimationFrame(()=>{if(node.isConnected&&!node.closest('[hidden]')&&!new URLSearchParams(location.hash.split('?')[1]??'').has('issue'))select(row,node.querySelector(`[data-device-id="${row.id}"] button`),false);});}
  return node;
}
function deviceRetentionDetail(row,onBack) {
  const box=element('section','retention-device-detail'),back=element('button','binding-device-back','返回设备清单');back.type='button';back.addEventListener('click',onBack);box.append(back,element('h3','',row.id));
  const facts=element('dl','inspector-facts');
  const entries=[['激活批次',`${row.start}—${row.end}`],['首图时间（合成分配）',row.activatedAt.replace('T',' ').replace('.000Z',' UTC')],['入组时归属',`${optionLabel('country',row.country)} · ${row.deviceModel} · ${row.salesChannel}`],['入组时设备状态','有效；不使用当前状态筛掉历史停用设备']];
  for(const key of ['D7','D30'])entries.push([`${key}有效行为`,row[key]===null?'所属批次尚未完整观察，不展示部分结果':row[key]?`该UTC自然日有有效行为（合成）`:'该完整UTC自然日无有效行为（合成）']);
  for(const [name,value] of entries){const part=element('div','');part.append(element('dt','',name),element('dd','',value));facts.append(part);}box.append(facts,element('p','table-note','由同一固定版本合成频数枚举，编号不连接现有绑定／活跃池。查看设备不会关联或保存问题单。'));return box;
}

function currentPaymentMonth() {
  const asOf=sourceData.snapshot.asOf,ordinal=monthOrdinal(asOf?.slice(0,7));
  return baselineWindowEnd(`快照 ${asOf}`)&&ordinal!==null?ordinalMonth(ordinal-1):null;
}
function retentionIndex() {
  const source=sourceData.metricTrends?.m24,latest=currentPaymentMonth(),end=monthOrdinal(latest);
  const invalid=()=>({reason:'月度留存来源、批次、人数或分组接续待核验；不回退旧分片或总体值。'});
  if(!source||source.version!=='synthetic-monthly-retention-v1'||source.status!=='approved-synthetic'||
    source.classification!=='entirely_synthetic'||source.asOf!==sourceData.snapshot.asOf||end===null||
    !Array.isArray(source.points)||source.points.length!==12||!Array.isArray(source.labels)||source.labels.length!==12)return invalid();
  const whole=n=>Number.isSafeInteger(n)&&n>=0,keys=new Set(['US','UK','DE','Other'].flatMap(c=>['iOS','Android'].map(p=>`${c}:${p}`)));
  for(const [i,row] of source.points.entries()) {
    const observed=ordinalMonth(end-11+i),base=ordinalMonth(end-12+i),through=baselineWindowEnd(`完整月 ${observed}`);
    if(!row||row.kind!=='rate'||!Number.isFinite(row.value)||row.observedMonth!==observed||row.baseMonth!==base||source.labels[i]!==observed||
      row.observedThrough!==through||through>=sourceData.snapshot.asOf||!['constructed-monthly-simulation','reconstructed-demo-anchor'].includes(row.provenance)||
      ![row.numerator,row.denominator,row.activeObserved].every(whole)||row.numerator>Math.min(row.denominator,row.activeObserved)||
      row.denominator<=0||Math.abs(row.value-row.numerator/row.denominator)>1e-12||
      !Array.isArray(row.records)||row.records.length!==8)return invalid();
    const seen=new Set();
    for(const r of row.records) {
      if(!r||!keys.has(`${r.country}:${r.appPlatform}`)||seen.has(`${r.country}:${r.appPlatform}`)||
        ![r.baseActive,r.retained,r.observedActive].every(whole)||r.retained>Math.min(r.baseActive,r.observedActive))return invalid();
      seen.add(`${r.country}:${r.appPlatform}`);
      const previous=source.points[i-1]?.records.find(p=>p.country===r.country&&p.appPlatform===r.appPlatform);
      if(previous&&previous.observedActive!==r.baseActive)return invalid();
    }
    if(row.records.reduce((n,r)=>n+r.baseActive,0)!==row.denominator||row.records.reduce((n,r)=>n+r.retained,0)!==row.numerator||
      row.records.reduce((n,r)=>n+r.observedActive,0)!==row.activeObserved)return invalid();
  }
  const last=source.points.at(-1),raw=sourceData.metrics.m24;
  if(raw?.kind!=='rate'||!Number.isFinite(raw.value)||raw.numerator!==last.numerator||raw.denominator!==last.denominator||Math.abs(raw.value-last.value)>1e-12)return invalid();
  return {rows:source.points,note:source.note};
}
function retentionSelection() {
  const source=retentionIndex(),month=retentionMonthRequest.length?retentionMonthRequest[0]:currentPaymentMonth();
  if(retentionMonthRequest.length>1||!source.rows?.some(r=>r.observedMonth===month))
    return {month,reason:source.reason??'留存观察月无效或包含多个值；请重新选择一个有完整观察期的月份。'};
  return {month,...source};
}
function retentionProjection(state=filterState) {
  const selected=retentionSelection();if(selected.reason)return selected;
  const filters=effectiveFor(24,state);
  if(filters.some(([key])=>!['country','appPlatform'].includes(key)))return {reason:'当前范围缺少同源月度留存分组。'};
  return {...selected,rows:selected.rows.map(row=>{
    const records=row.records.filter(r=>filters.every(([key,value])=>r[key]===value));
    const numerator=records.reduce((n,r)=>n+r.retained,0),denominator=records.reduce((n,r)=>n+r.baseActive,0);
    return {...row,records,numerator,denominator,activeObserved:records.reduce((n,r)=>n+r.observedActive,0),value:denominator>=30?numerator/denominator:null};
  })};
}
function retentionMetric(state=filterState) {
  const source=retentionProjection(state);if(source.reason)return pending(source.reason);
  const row=source.rows.find(r=>r.observedMonth===source.month);
  return row.denominator>=30?{kind:'rate',numerator:row.numerator,denominator:row.denominator,value:row.value}:
    na(`基期活跃 ${row.denominator} 人、留存 ${row.numerator} 人；${row.denominator?'样本不足30人':'无合格样本'}，不显示可靠留存率`);
}
function retentionTable() {
  const part=retentionProjection();if(part.reason)return {title:'月度留存 · 待核验',columns:['状态'],rows:[[part.reason]]};
  return {title:'月度留存 · 12个月人数验算',selectedPeriod:part.month,columns:['观察月','基期月','留存主账号（人）','基期活跃（人）','观察月活跃（人）','留存率'],
    rows:part.rows.map(r=>[r.observedMonth,r.baseMonth,r.numerator,r.denominator,r.activeObserved,r.value===null?'样本不足30人':percent(r.value)]),
    note:`所选观察月 ${part.month}；留存人数÷基期活跃人数。观察月活跃含新进入者，不能作为留存分母。${part.note}`};
}
function retentionContextTable(spec){const original=retentionContextTableLegacy(spec),p=userRetentionProjection();return {...original,rows:original.rows.map(row=>{const day=/新客(?:样本 · )?D(1|7|30)/.exec(String(row[0]));if(day){if(p.reason)return [row[0],'待补数据','—',p.reason];const d='D'+day[1],c=p.current,v=c.measures[d];return [`${userRetentionTypeLabels[p.type]} ${d} · ${c.start}`,v.numerator??'观察中',c.denominator,accountRateText(v)];}if(String(row[0]).startsWith('核心功能使用')){const f=featureUsageProjection(),m=metric(27);return [m.kind==='rate'?optionLabel('functionType',f.functionType)+'使用主账号':'核心功能使用主账号',m.kind==='rate'?`${number(m.numerator)} / ${number(m.denominator)}人`:'待补数据',m.kind==='rate'?percent(m.value):m.reason];}return row;}),note:original.note+(['留存与回流观察','完整月与新客留存批次'].includes(spec.title)?' 新客留存按所选入组类型、批次和UTC日观察，旧未注明批次的76%／60%／44%不用于当前比较。':'')};}
function registrationContextTable(spec){if(spec.title==='最新注册批次核对'){return {...spec,rows:spec.rows.map(row=>{const id=row[0]==='72小时首绑'?10:row[0]==='7日首图'?12:row[0]==='观鸟7日价值激活'?13:row[0]==='7日开启试用'?17:null;if(!id)return row;const value=metric(id),v=id===12?value.value?.D7:value;return v?.kind==='rate'?[row[0],v.numerator,v.denominator,percent(v.value)]:[row[0],'待核验','—',v?.reason??'待补数据'];}),note:spec.note+' 注册、绑定、首图按同源注册批次；价值激活与试用仍按各自来源。'};}if(spec.title==='不同完整观察窗的注册批次'){const p=registrationProjection(12);if(p.reason)return {...spec,rows:[['待补','—','—','—',p.reason]]};return {...spec,rows:[['7日',p.current,'image7',true],['30日',p.d30,'image30',p.d30.mature30]].map(([label,r,field,mature])=>[label,'W'+r.week,mature?r[field]:'观察中',r.registered,accountRateText(registrationRate(r[field],r.registered,mature))]),note:registrationNote};}return spec;}
function retentionContextTableLegacy(spec) {
  if(spec.title==='使用深度与核心功能'){
    const part=sessionDepthProjection(),r=part.current;
    return {...spec,rows:spec.rows.map(row=>{
      if(row[0].startsWith('App人均'))return ['App人均有效会话次数',r?`${sessionDepthNumber(r.frequency,2)}次/人`:'待核验',r?`${number(r.sessions)}次 / ${number(r.accounts)}名App日活`:'同源日窗或会话计数待核验'];
      if(row[0].startsWith('单次使用时长'))return ['单次前台时长 P50 / P90',r?`${sessionDepthDuration(r.p50,r.timedSessions)} / ${sessionDepthDuration(r.p90,r.timedSessions)}`:'待核验',r?`${number(r.timedSessions)}次合格时长，按R7重算`:'不沿用旧汇总分位数'];
      return row;
    }),note:`${r?sessionDepthWindow():part.reason}；后台不计时，会话次数不是打开间隔。核心功能仍以复合活跃为分母。`};
  }
  if(spec.title==='完整月与新客留存批次') {
    const source=retentionProjection();
    return {...spec,rows:spec.rows.map(row=>{
      if(!row[0].includes('月度复合活跃'))return row;
      const point=source.rows?.find(r=>`${r.baseMonth}→${r.observedMonth.slice(5)}`===row[0].split(' · ')[0]);
      return [row[0],point?.numerator??'—',point?.denominator??'—',point?.value===null?'样本不足30人':point?percent(point.value):'待核验'];
    })};
  }
  if(spec.title!=='留存与回流观察')return spec;
  const value=metric(24),month=retentionSelection().month;
  return {...spec,rows:spec.rows.map(row=>row[0]==='月度留存'?[`${month}月度留存`,
    value.kind==='rate'?value.numerator:'—',value.kind==='rate'?value.denominator:'—',value.kind==='rate'?percent(value.value):'待核验']:row)};
}
function retentionControl() {
  const wrap=element('div','retention-month-control'),label=element('label','','留存观察月（仅#24）'),select=element('select','');
  select.name='retentionMonth';select.setAttribute('aria-label','留存观察月（仅#24）');
  const part=retentionSelection(),months=retentionIndex().rows??[];
  if(part.reason){const option=element('option','',`待修正：${retentionMonthRequest.join(' / ')||'月份来源待核验'}`);option.value='invalid';option.disabled=true;select.append(option);}
  for(const row of months){const option=element('option','',row.observedMonth);option.value=row.observedMonth;select.append(option);}
  select.value=part.reason?'invalid':part.month;
  select.addEventListener('change',()=>{
    const params=new URLSearchParams(location.hash.split('?')[1]??'');params.delete('retentionMonth');
    if(select.value!==currentPaymentMonth())params.set('retentionMonth',select.value);
    pushRoute(`#/B?${params}`);renderRoute({preserveScroll:true});
    document.querySelector('[name="retentionMonth"]')?.focus({preventScroll:true});
    document.querySelector('#announcement').textContent=`留存观察月已切换为${select.value}；仅更新#24及其登记范围。`;
  });
  label.append(select);wrap.append(label,element('p','table-note','完整自然月；只更新本项留存、证据与问题范围，其他指标保留各自周期。'));return wrap;
}
function paymentMonthRows() {
  const source=sourceData.diagnostics.E.paymentMonths,current=currentPaymentMonth();
  const invalid=()=>({reason:'完整月付款历史缺失、月份不连续或人数／收入未闭合；当前单月值保留，暂停历史与收入变化比较。'});
  if(!source||source.version!=='synthetic-payment-months-v1'||source.asOf!==sourceData.snapshot.asOf||
    !current||!Array.isArray(source.rows)||source.rows.length!==12)return invalid();
  const last=monthOrdinal(current);
  for(const [i,row] of source.rows.entries())if(!row||monthOrdinal(row.month)!==last-11+i||
    !Number.isSafeInteger(row.payers)||row.payers<0||!Number.isSafeInteger(row.netIncome)||row.netIncome<0||
    row.payers===0&&row.netIncome!==0||!['constructed-simulation','existing-demo-summary'].includes(row.provenance))return invalid();
  const point=source.rows.at(-1),raw=sourceData.metrics.m35.value;
  if(point.payers!==raw.monthlySubscriptionPayers||point.netIncome!==raw.subscriptionNetIncome||
    point.payers<=0||!Number.isFinite(raw.ARPPU)||Math.abs(point.netIncome/point.payers-raw.ARPPU)>1e-9)return invalid();
  return {rows:source.rows,note:source.note};
}
function paymentMonthProjection(state=filterState) {
  const source=paymentMonthRows();if(source.reason)return source;
  const filters=effectiveFor(35,state);
  if(filters.some(([key])=>!policyFor(35).demonstrableDimensions.includes(key)))return {reason:'当前范围缺少完整月付款明细。'};
  const shares=sharesFor(filters,35);
  const rows=source.rows.map(row=>{
    const denominator=allocatedCount(row.payers,filters,35,'denominator',shares),numerator=allocatedCount(row.netIncome,filters,35,'numerator',shares);
    return {month:row.month,denominator,numerator,value:denominator>=30?numerator/denominator:null,
      ...(denominator<30?{reason:denominator?'样本不足（少于30人）':'该月无付款样本'}:{})};
  });
  return {rows,note:`${source.note}${filters.length?' 当前筛选历史按原型既有独立分片估算，不是实测交叉分组。':''}`};
}
function paymentMonthTable() {
  const source=paymentMonthProjection();
  return source.reason?{title:'完整月付款历史 · 待核验',columns:['状态'],rows:[[source.reason]]}:
    {title:'完整月付款与人均收入 · 12个月',columns:['完整自然月','订阅付款主账号（人）','订阅净收入（美元）','ARPPU（美元/人）'],
      rows:source.rows.map(row=>[row.month,number(row.denominator),`$${number(row.numerator)}`,row.value===null?row.reason:`$${row.value.toFixed(2)}`]),note:source.note};
}
function savedMonthLabel(period) {
  return monthOrdinal(period)!==null?`完整月 ${period.slice(0,4)}年${Number(period.slice(5))}月`:
    `完整月 ${sourceData.snapshot.asOf.slice(0,4)}年${period}`;
}

const headlineTrendIds=new Set([2,3,4,7,9,10,11,13,15,16,17,18,23,24,25,26,27,34,35,41,42,44,46,48,49,52,53,54]);
function metricHistory(id) {
  const overview=homeProjection();if(overview)return overview.histories[id]??null;
  if([9,10,12].includes(id)&&metric(id).kind!=='na')return registrationHistory(id);
  if(id===27&&metric(27).kind!=='na')return featureUsageHistory();
  if(id===51){const p=unbindingProjection();if(p.reason||metric(id).kind==='na')return null;const rows=unbindingIndex().rows.map(m=>unbindingProjection(filterState,m.month));return {title:'月度解绑设备数',unit:'台',labels:rows.map(r=>r.month),values:rows.map(r=>r.opening?r.devices:null),selectedPeriod:p.month,note:'各完整月内设备去重；不同月份可能重复，不累计为全年独立设备。回绑成熟状态另列。'};}
  if(!headlineTrendIds.has(id)||metric(id)?.kind==='na')return null;
  if(id===34&&trendValues(34)?.at(-1)!==metric(34).value)return null;
  if(id===7){const part=accountStockHistory();return part.rows?{labels:part.rows.map(r=>r.date),values:part.rows.map(r=>r.registered),unit:'人',title:'累计注册用户',comparisonLabel:'较上月末快照',note:'12个完整月末＋当前快照；最后一段是月内变化，不是完整月新增。'+part.note}:null;}
  if(id===17)return trialOpeningHistory();
  if(id===16)return activationDeviceHistory();
  if(id===52)return riskHistory();
  if(id===54)return qualityHistory();
  if(id===53){const p=anomalyProjection();return p.rows?{comparisonLabel:'较前24小时',title:'异常发现',unit:'条',nearestLinePoint:true,labels:p.rows.map(w=>w.endExclusive.slice(0,10)),values:p.rows.map(w=>w.count),note:'每点为当日12:00 UTC截止的完整24小时窗口，起含止不含；'+anomalyNote}:null;}
  if(id===26){const p=sessionDepthProjection();return p.rows?{comparisonLabel:'较前日',title:'人均有效会话',unit:'次/人',labels:p.rows.map(r=>r.end.slice(0,10)),values:p.rows.map(r=>r.frequency),note:'84个完整UTC日；独立刻度，不代表留存或打开间隔。'}:null;}
  if(id===46)return technicalHistoryHeadline();
  if(id===4||id===25){const p=activeWindowProjection();if(p.reason)return null;return {comparisonLabel:'较前日',nearestLinePoint:true,title:id===4?'近30天复合活跃主账号':'近1天复合活跃主账号',unit:'人',labels:p.rows.map(r=>r.at.slice(0,10)),values:trendValues(id),note:'84个每日UTC零时快照；滚动窗口，起含止不含，不是自然周／月。合成频数，7／30天相邻窗口重叠，不相加为独立人数。'};}
  if(id===23){const part=renewalProjection();if(part.reason)return null;return {labels:part.rows.map(r=>r.month),values:trendValues(23),selectedPeriod:part.month,details:part.rows.map(r=>({...r.renewal,basisLabel:'成功续订 / 当月到期',numeratorUnit:'人',denominatorUnit:'人'})),unit:'%',title:'月度到期续订率',note:'完整到期月，期初归属固定；到期后7天为演示观察窗。原周度86%与月度95%不可直接比较；月环比只比较相邻完整月。'};}
  if(id===24){const part=retentionProjection();if(part.reason)return null;return {labels:part.rows.map(r=>r.observedMonth),
    values:part.rows.map(r=>r.value===null?null:r.value*100),selectedPeriod:part.month,
    details:part.rows.map(r=>({...r,basisLabel:`${r.baseMonth} → ${r.observedMonth} 留存 / 基期活跃`,numeratorUnit:'人',denominatorUnit:'人'})),
    unit:'%',title:'月度用户留存率',note:`虚线标示所选观察月 ${part.month}；末端标签对应 ${part.rows.at(-1).observedMonth}。${part.note}`};}
  if(id===41||id===44) {
    const index=deviceActivityIndex();if(index.reason)return null;
    const threshold=filterState.season==='Other'?30:21;
    return {labels:index.snapshots.map(point=>`${new Date(point.at).getUTCMonth()+1}/${new Date(point.at).getUTCDate()}`),values:trendValues(id),
      details:index.snapshots.map(point=>{const value=deviceActivityMetric(id,filterState,point.at);return value.kind==='rate'?{...value,basisLabel:id===41?'30天活跃 / 完整可观察设备':`${threshold}天未使用 / 完整可观察设备`,numeratorUnit:'台',denominatorUnit:'台'}:null;}),
      unit:'%',title:id===41?'近30天设备活跃率':`${threshold}天未使用设备率`,
      note:'每7天一个UTC零时快照；同一国家×型号×固件×行为间隔合成事实重算。每期分母具备完整30天观察，纯心跳不计活跃；快照设备集合可变，不能相减推算回流。新定义下的构造历史，不是追溯测得的生产数据。'};
  }
  if(id===15) {
    const index=bindingDeviceIndex();if(index.reason)return null;
    return {labels:index.snapshots.map(point=>`${new Date(point.time).getUTCMonth()+1}/${new Date(point.time).getUTCDate()}`),
      values:trendValues(id),unit:'台',title:metricCardLabels[id],
      note:'每7天一个UTC零时快照；按同一合成设备台账重算绑定超过72小时且截至当时未产首图的设备，筛选后历史与当前清单同源。型号、国家及有效状态在样本中固定，非真实运营数据。'};
  }
  if(id===35) {
    const source=paymentMonthProjection();if(source.reason)return null;
    return {labels:source.rows.map(row=>row.month),values:source.rows.map(row=>row.value),
      details:source.rows.map(row=>({...row,basisLabel:'订阅净收入 / 付款主账号',numeratorUnit:'美元',denominatorUnit:'人'})),
      unit:'美元/人',title:'订阅ARPPU',note:source.note};
  }
  if(id===2){const part=subscriptionStatusHistoryProjection();if(part.rows)return {labels:sourceData.metricTrends.m02.labels,values:trendValues(2),unit:'人',title:metricCardLabels[2],note:`${part.note} 有效付费按付费中＋已取消未到期合计；当前范围与#5共用状态人数。`};}
  const history=sourceData.metricTrends?.[`m${String(id).padStart(2,'0')}`];
  const labels=history?.labels??sourceData.weekly.map(w=>`W${w.week}`);
  const values=trendValues(id);
  if(!values||!values.some(value=>value!==null&&Number.isFinite(value)))return null;
  const details=history?.kind==='rate'?history.points.map(raw=>{
    const applicable=effectiveFor(id).filter(([key])=>key!=='week');
    const value=projectValue(raw,sharesFor(applicable,id),applicable,id);
    return value.kind==='rate'?value:null;
  }):[10,11,13,17,18,23,42].includes(id)?weeklyRateDetails(id):null;
  const estimated=effectiveFor(id).some(([key])=>key!=='week')&&![11,13,18,42].includes(id)?
    '当前筛选的整条历史序列采用同一模拟分片方法，不能用于真实经营判断。':'';
  return {labels,values,details,unit:history?.unit??([9,34].includes(id)?'人':'%'),
    title:metricCardLabels[id]??catalogItem(id).name,
    note:`${id===42?'周×型号×固件合成触发计数逐周汇总；保留原有总体及K6固件2.8分组，其他型号分配为构造样本。':history?.note??(id===18?'合成试用明细逐周聚合。':'原有12个完整周模拟汇总。')}${estimated}`};
}
function weeklyRateDetails(id) {
  const overview=homeProjection();if(overview)return overview.details[id]??[];
  if(id===11||id===13)return sourceData.weekly.map(week=>{const value=projectMetric(id,{...filterState,week:String(week.week)});return value.kind==='rate'?{...value,numeratorUnit:id===11?'次':'人',denominatorUnit:id===11?'次':'人'}:null;});
  if(id===13&&(filterState.productLine==='Hunting'||filterState.deviceModel==='Hunt Pro'))return sourceData.weekly.map(()=>null);
  if(id===42)return sourceData.weekly.map(week=>{const value=deviceEventMetric(filterState,week.week);return value.kind==='rate'?{...value,numeratorUnit:'次',denominatorUnit:'次'}:null;});
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
function weeklyRateComparison(id,split=id===18?9:8,respectWeek=true) {
  const overview=homeProjection();if(overview)return overview.comparisons[id]??null;
  const series=trendValues(id);
  if(metric(id)?.kind!=='rate'||!series)return null;
  const rows=weeklyRateDetails(id);
  const aggregate=items=>{
    if(!items.length||items.some(row=>!row||!Number.isFinite(row.numerator)||!Number.isFinite(row.denominator)||row.denominator<0||row.numerator<0||row.numerator>row.denominator))return null;
    const numerator=items.reduce((sum,row)=>sum+row.numerator,0),denominator=items.reduce((sum,row)=>sum+row.denominator,0);
    return denominator>=30?{numerator,denominator}:null;
  };
  const selected=respectWeek?effectiveFor(id).find(([key])=>key==='week')?.[1]:null;
  const index=selected?sourceData.weekly.findIndex(week=>String(week.week)===selected):-1;
  const before=selected?aggregate(index>0?[rows[index-1]]:[]):aggregate(rows.slice(0,split));
  const after=selected?aggregate(index>=0?[rows[index]]:[]):aggregate(rows.slice(split));
  if(!before||!after)return null;
  const window=(first,last)=>{
    const firstWeek=`W${sourceData.weekly[first].week}`,lastWeek=`W${sourceData.weekly[last].week}`;
    if(first===last)return periodLabel(firstWeek);
    return `${firstWeek}–${lastWeek} · ${periodLabel(firstWeek).split(' · ')[1].split('–')[0]}–${periodLabel(lastWeek).split('–')[1]}`;
  };
  const beforeRate=before.numerator/before.denominator*100,afterRate=after.numerator/after.denominator*100;
  const estimated=![11,13,18,42].includes(id)&&effectiveFor(id).some(([key])=>key!=='week'&&!(id===13&&key==='productLine'&&filterState.productLine==='Bird'));
  return {id,before,after,beforeRate,afterRate,delta:afterRate-beforeRate,split,series,
    selectedWeek:selected?Number(selected):null,
    beforeLabel:selected?`W${sourceData.weekly[index-1].week}`:`前${split}周合并率`,
    afterLabel:selected?`W${sourceData.weekly[index].week}`:`近${rows.length-split}周合并率`,
    beforeWindow:selected?window(index-1,index-1):window(0,split-1),
    afterWindow:selected?window(index,index):window(split,rows.length-1),
    unit:id===42?'次':'人',scope:id===42?'观鸟触发事件':id===13?'观鸟注册批次':'成熟试用批次',
    source:[11,13].includes(id)?'同源合成绑定／激活频数v1':estimated?'模拟分片估算':id===18?'合成试用明细汇总':id===42?'周×型号×固件合成触发汇总':'合成周度注册批次'};
}
function paidPayersHistory() {
  if(metric(35).kind!=='group')return null;
  const source=paymentMonthProjection();if(source.reason)return null;
  return {labels:source.rows.map(row=>row.month),values:source.rows.map(row=>row.denominator),unit:'人',title:'月内订阅付款主账号',note:source.note};
}

function subscriptionIncomeChange(history=metricHistory(35)) {
  if(!history||history.details.length<2)return null;
  const [before,after]=history.details.slice(-2);
  if(![before,after].every(row=>Number.isFinite(row.denominator)&&row.denominator>=30&&Number.isFinite(row.numerator)))return null;
  const beforeARPPU=before.numerator/before.denominator,afterARPPU=after.numerator/after.denominator;
  const delta=after.numerator-before.numerator;
  // Symmetric arithmetic decomposition: average both periods, no ordering bias.
  const payersContribution=Math.round((after.denominator-before.denominator)*(beforeARPPU+afterARPPU)/2*100)/100;
  const arppuContribution=Math.round((delta-payersContribution)*100)/100;
  return {before,after,beforeARPPU,afterARPPU,delta,payersContribution,arppuContribution,
    beforePeriod:history.labels.at(-2),afterPeriod:history.labels.at(-1),
    beforeLabel:monthOrdinal(history.labels.at(-2))!==null?`${Number(history.labels.at(-2).slice(5))}月`:history.labels.at(-2),
    afterLabel:monthOrdinal(history.labels.at(-1))!==null?`${Number(history.labels.at(-1).slice(5))}月`:history.labels.at(-1),
    source:effectiveFor(35).length?'模拟分片估算':'完整月演示汇总'};
}
function subscriptionIncomeSpec(change) {
  const values=[change.payersContribution,change.arppuContribution];
  const low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1;
  const interval=Math.max(.01,chartNiceStep(span/5)),padding=span*.1;
  const rounded=value=>Number(value.toPrecision(12));
  return {title:`订阅净收入变化拆分 · ${change.beforeLabel} → ${change.afterLabel}`,unit:'美元',signedContribution:true,
    labels:['付款人数变化','ARPPU变化'],labelRotation:0,series:[{name:'收入变化的算术贡献',values,color:'#356d51'}],
    minY:low<0?rounded(Math.floor((low-padding)/interval)*interval):0,
    maxY:high>0?rounded(Math.ceil((high+padding)/interval)*interval):high===low?1:0,intervalY:interval,
    note:`订阅净收入 $${number(change.before.numerator)} → $${number(change.after.numerator)}，净变化 ${change.delta>=0?'+':'−'}$${number(Math.abs(change.delta))}。正值增加收入，负值抵减收入；两项贡献之和等于净变化。采用两期均值拆分，不代表价格或业务原因。${change.source}，与MRR分别计算。`};
}
function subscriptionIncomeCalculationSpec(change) {
  return {title:'订阅净收入变化 · 计算依据',columns:['完整月','付款主账号','订阅净收入','ARPPU'],
    rows:[[change.beforeLabel,`${number(change.before.denominator)}人`,`$${number(change.before.numerator)}`,`$${change.beforeARPPU.toFixed(2)}/人`],
      [change.afterLabel,`${number(change.after.denominator)}人`,`$${number(change.after.numerator)}`,`$${change.afterARPPU.toFixed(2)}/人`]],
    note:`人数项＝人数差×两期平均ARPPU：${change.payersContribution>=0?'+':'−'}$${number(Math.abs(change.payersContribution))}；ARPPU项＝ARPPU差×两期平均人数：${change.arppuContribution>=0?'+':'−'}$${number(Math.abs(change.arppuContribution))}。ARPPU显示两位，拆分使用收入÷人数的未舍入值；金额按美分呈现并分配尾差，合计 ${change.delta>=0?'+':'−'}$${number(Math.abs(change.delta))}。${change.source}；ARPPU包含价格、套餐结构等因素，本表仅作算术拆分。`};
}
function subscriptionIncomeCalculation(change) {
  return dataTable(subscriptionIncomeCalculationSpec(change));
}
function arppuChangeLabel(delta) {
  if(Math.abs(delta)<1e-10)return '持平';
  // Preserve half-cent rounding despite binary subtraction near the boundary.
  const cents=Math.round((Math.abs(delta)+1e-10)*100);
  return cents?`${delta>0?'+':'−'}$${(cents/100).toFixed(2)}/人`:
    `${delta>0?'上升':'下降'}不足 $0.01/人`;
}
function incomeDriverSummary(change) {
  const wrap=element('div','finding-income-drivers');
  wrap.append(element('p','income-driver-period',`${change.beforeLabel} → ${change.afterLabel} · 指标本身的变化`));
  const values=element('dl','income-driver-values');
  const countDelta=change.after.denominator-change.before.denominator;
  const arppuDelta=change.afterARPPU-change.beforeARPPU;
  const signed=(value,format)=>Math.abs(value)<1e-10?'持平':`${value>0?'+':'−'}${format(Math.abs(value))}`;
  const arppuDeltaLabel=arppuChangeLabel(arppuDelta);
  for(const [key,label,before,after,delta] of [
    ['payers','月内订阅付款主账号',number(change.before.denominator),`${number(change.after.denominator)} 人`,signed(countDelta,value=>`${number(value)} 人`)],
    ['arppu','订阅ARPPU',`$${change.beforeARPPU.toFixed(2)}`,`$${change.afterARPPU.toFixed(2)}/人`,arppuDeltaLabel]
  ]) {
    const row=element('div','');row.dataset.driver=key;
    const value=element('dd','');value.append(element('strong','',`${before} → ${after}`),element('span','income-driver-delta',delta));
    row.append(element('dt','',label),value);values.append(row);
  }
  wrap.append(values);return wrap;
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
  const groups=options.map(option=>{
    const state={...filterState,[dimension]:option};
    const value=projectMetric(id,state);
    return {label:optionLabels[option]??option,value};
  });
  const rows=groups.filter(row=>['rate','count','usd'].includes(row.value.kind));
  const omitted=groups.filter(row=>row.value.kind==='na');
  if(rows.length<2)return null;
  const unit=rows[0].value.kind==='rate'?'%':rows[0].value.kind==='usd'?'美元':'人';
  const values=rows.map(row=>row.value.kind==='rate'?row.value.value*100:row.value.value);
  const comparisonScope=`保留其余筛选条件，仅切换${filterLabels[dimension]}；当前选择：${optionLabel(dimension,filterState[dimension])}。${omitted.length?` 未绘制：${omitted.map(row=>`${row.label}（${row.value.reason}）`).join('；')}。`:''}`;
  const spec={metricId:id,title:`${filterLabels[dimension]} · ${catalogItem(id).name}分组对照`,unit,
    labels:rows.map(row=>row.label),details:unit==='%'?rows.map(row=>row.value):null,series:[{name:catalogItem(id).name,values}],
    note:`${comparisonScope} 当前模拟分组用于定位差异，不能证明原因。`};
  const table={title:`${filterLabels[dimension]} · 组规模与指标`,
    columns:['分组',unit==='%'?'分子':'当前值',unit==='%'?'分母':'统计对象', '指标值'],
    rows:rows.map(row=>row.value.kind==='rate'?[row.label,row.value.numerator,row.value.denominator,percent(row.value.value)]:
      [row.label,row.value.value,metricEntityLabel(contract.entity),unit==='美元'?`$${number(row.value.value)}`:`${number(row.value.value)}${unit}`]),
    note:spec.note};
  return {metricId:id,dimension,comparisonScope,spec,table};
}
function subscriptionBridgeSpec() {
  const flow=metric(21);
  if(flow.kind!=='group')return null;
  const v=flow.value;
  if(Object.values(v).some(x=>!Number.isFinite(x)||x<0))return null;
  const labels=['期初','试用转正','直接首付','恢复订阅','失去权益','期末'];
  const steps=[v.opening,v.trialPaid,v.directPaid,v.recovered,-v.lost,v.closing];
  return {kind:'waterfall',metricId:21,title:'有效订阅人数流转 · 9/1–9/24',unit:'人',labels,
    series:[{name:'人数变化',values:steps}],flow:v,
    note:`${number(v.opening)} + ${number(v.trialPaid)} + ${number(v.directPaid)} + ${number(v.recovered)} − ${number(v.lost)} = ${number(v.closing)} 人；净增 ${v.closing-v.opening>=0?'+':''}${number(v.closing-v.opening)} 人。${effectiveFor(21).some(([key])=>!['productLine','week'].includes(key))?'筛后各项为模拟分片流转估算。':'各项与当前演示订阅流水闭合。'}`};
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
  const spec={metricId:46,title:`${filterLabels[dimension]} · 技术链路失败请求率`,unit:'%',maxY,labels:rows.map(row=>row.label),series,
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
  const spec={metricId:39,title:'设备型号订阅率排序 · 合成主账号样本',unit:'%',labels:rows.map(([name])=>name),
    series:[{name:'订阅率',values:rows.map(([,part])=>part.subscriptionRate*100),details:rows.map(([,part])=>({
      numerator:part.subscribedOwners,denominator:part.owners,numeratorUnit:'人',denominatorUnit:'人'}))}],
    note:'按订阅率排序；分母为各型号主账号。型号经营表现为相关性，不能直接解释订阅差异的原因。'};
  const table={title:'型号规模与订阅人数核对',columns:['型号','主账号','有效订阅主账号','订阅率'],
    rows:rows.map(([name,part])=>[name,part.owners,part.subscribedOwners,percent(part.subscriptionRate)]),
    note:'按同一市场×主型号合成汇总中的主账号和订阅账号计算，不从展示率反推人数。'};
  return {spec,table};
}
function modelPerformanceRows() {
  const value=metric(39);
  return value.kind==='group'?Object.entries(value.value).sort((a,b)=>b[1].owners-a[1].owners||
    (a[0]<b[0]?-1:a[0]>b[0]?1:0)):[];
}
function modelSubscriptionHeatmap() {
  const entries=modelPerformanceRows();
  if(!entries.length)return null;
  return {kind:'heatmap',sortBy:'owners-desc',title:'所选市场与型号 · 主账号活跃率和订阅率',unit:'%',
    labels:entries.map(([name])=>name),sampleSizes:entries.map(([,item])=>item.owners),
    sampleCounts:entries.map(([,item])=>[item.activeOwners,item.subscribedOwners]),
    dimensions:['30天活跃率','主账号订阅率'],
    series:[{name:'比例',values:entries.map(([,item])=>[item.activeRate*100,item.subscriptionRate*100])}],
    note:'按当前范围主账号人数从上到下降序排列；人数相同按型号名排列。同一0–100%色阶；每格以所选市场中归属该主型号的主账号为分母。该样本不等于全部主账号。'};
}
function modelCalculationTable() {
  const entries=modelPerformanceRows(),contract=contractFor(39);
  return {title:'型号活跃与订阅 · 人数验算',columns:['型号','主账号（人）','活跃（人）','活跃率','订阅（人）','订阅率'],
    rows:entries.map(([name,part])=>[name,part.owners,part.activeOwners,percent(part.activeRate),
      part.subscribedOwners,percent(part.subscriptionRate)]),
    note:`${contract.window}。按当前范围主账号人数降序，同规模按型号名排列，与矩阵从上到下顺序一致。活跃率＝30天活跃主账号÷该型号主账号；订阅率＝有效订阅主账号÷该型号主账号。按同一市场×主型号合成汇总重算；当前范围 ${number(entries.reduce((sum,[,part])=>sum+part.owners,0))} 个已归属主型号的主账号，不代表全部合资格主账号。型号内多设备占比待补同范围绑定关系明细。`};
}
function modelContextTable() {
  const value=metric(39);
  return value.kind==='group'?{...modelCalculationTable(),title:'设备型号订阅表现 · 主型号归属人数'}:
    {title:'设备型号订阅表现 · 暂不可用',columns:['状态'],rows:[[`${value.availability==='pending'?'待补数据':'不适用'}：${value.reason}`]],
      note:'未展示旧汇总比例或反推人数；补齐同范围来源后再核对型号表现。'};
}
// Display precision must not turn a measurable movement into a claim of equality.
function trendMovement(delta,unit,digits=1) {
  if(!Number.isFinite(delta))return '暂无可比值';
  if(Math.abs(delta)<1e-10)return '持平';
  const step=10**-digits;
  return Math.abs(delta)<step/2?`${delta>0?'上升':'下降'}不足 ${step.toFixed(digits)}${unit}`:`${delta>0?'+':''}${delta.toFixed(digits)}${unit}`;
}
function headlineTrend(id) {
  const history=metricHistory(id);
  if(!history)return null;
  const index=history.selectedPeriod?history.labels.indexOf(history.selectedPeriod):filterState.week&&/^W\d+$/.test(history.labels[0])?Math.max(0,history.labels.indexOf(`W${filterState.week}`)):history.values.length-1;
  const current=history.values[index],before=history.values[index-1];
  const delta=current==null||before==null?null:current-before;
  const moneyChange=history.unit==='美元/人'&&delta!==null?arppuChangeLabel(delta):null;
  const deltaText=id===26?sessionDepthChange(current,before,'次/人',2):delta==null?'暂无可比值':moneyChange?(moneyChange==='持平'?'与上期持平':`${moneyChange}（较上期）`):Math.abs(delta)<1e-10?'与上期持平':history.unit==='%'?
    trendMovement(delta,' 个百分点'):
    `${delta>0?'+':''}${number(Math.round(delta))}${history.unit}（${history.comparisonLabel??'较上期'}）`;
  const wrap=element('div','headline-trend');
  if(delta!==null)wrap.dataset.delta=String(delta);
  const visibleDelta=id===7&&delta!==null?`${delta>=0?'+':''}${number(delta)}人`:deltaText;
  const label=element('span','headline-trend-label',[7,46].includes(id)?visibleDelta:`${history.labels[index]} · ${deltaText}`);
  if([7,46].includes(id)){const comparison=`${history.labels[index]} 较 ${history.labels[index-1]??'无前期'}；${deltaText}`;label.title=comparison;label.setAttribute('aria-label',comparison);}
  wrap.append(label);
  const box=element('div','node-sparkline headline-sparkline');box.dataset.metricId=String(id);
  box.setAttribute('role','img');box.setAttribute('aria-label',`${history.title}趋势，${history.labels[index]}，${current==null?'无值':chartValue(current,history.unit)}；${deltaText}。${history.note}`);
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
      const adverseWhenHigh=new Set([15,29,42,52,54]);
      const favorableWhenHigh=new Set([2,3,4,9,10,11,13,17,18,23,24,27,34,41,46]);
      const direction=adverseWhenHigh.has(id)?-1:favorableWhenHigh.has(id)?1:0;
      label.className=`metric-delta${direction&&Math.abs(delta)>.05?delta*direction>0?' improving':' adverse':''}`;
      if(id===53)label.title='事件发现数的增减，不表示严重程度、影响人数或业务变好／变坏。';
      row.append(label);
    }
  } else if(id===21&&metric(21).kind==='group') {
    const {opening,closing}=metric(21).value;
    if(opening>0&&Number.isFinite(closing))
      row.append(element('span','metric-delta',`存量较期初 ${closing-opening>=0?'+':''}${((closing-opening)/opening*100).toFixed(1)}%`));
  }
  return row;
}
function journeyStatus(id) {
  const value=metric(id);
  if(value.kind==='na')return {status:value.availability==='pending'?'待补数据':'不适用',severity:'neutral'};
  if(id===13||id===18) {
    const comparison=weeklyRateComparison(id,id===13?8:9);
    if(!comparison)return {status:'缺少可比批次',severity:'neutral'};
    const before=comparison.beforeLabel.replace('合并率',''),after=comparison.afterLabel.replace('合并率','');
    const direction=Math.abs(comparison.delta)<.05?0:Math.sign(comparison.delta);
    return {status:direction?`${after}${direction<0?'低于':'高于'}${before}`:`${after}较${before}${trendMovement(comparison.delta,' 个百分点')}`,
      severity:direction<0?'warn':direction>0?'ok':'neutral'};
  }
  if(id===9) {
    const series=trendValues(id),week=effectiveFor(id).find(([key])=>key==='week')?.[1];
    const index=week?Number(week)-1:(series?.length??0)-1,current=series?.[index],previous=series?.[index-1];
    if(!Number.isFinite(current)||!Number.isFinite(previous))return {status:'缺少可比周',severity:'neutral'};
    const direction=Math.sign(current-previous);
    return {status:`较上周${direction>0?'增加':direction<0?'减少':'持平'}`,severity:direction>0?'ok':direction<0?'warn':'neutral'};
  }
  return {status:({11:'绑定尝试口径',23:'月度到期 · 7天合成观察窗',34:'当前有效付费权益'})[id]??'当前范围',severity:'neutral'};
}
function nodeTrendDetails(id) {
  const history=metricHistory(id);
  if(!history)return element('p','node-change','当前维度无可用趋势');
  const {values:series,labels,unit}=history;
  const weekly=labels.every(label=>/^W\d+$/.test(label));
  const monthly=labels.every(label=>/^\d{4}-\d{2}$/.test(label));
  const position=history.selectedPeriod?labels.indexOf(history.selectedPeriod):weekly&&filterState.week?labels.indexOf(`W${filterState.week}`):series.length-1;
  const current=series[position],previous=series[position-1];
  const isRate=unit==='%';
  const comparable=Number.isFinite(current)&&Number.isFinite(previous)&&(isRate||previous!==0);
  const delta=comparable?(isRate?current-previous:(current/previous-1)*100):null;
  const compare=monthly?'上月':weekly?'上周':'上期';
  const change=delta===null?'缺少可比期':Math.abs(delta)<1e-10?`与${compare}持平`:`${trendMovement(delta,isRate?'个百分点':'%')}（较${compare}）`;
  const details=element('div','node-extra');
  const windowLabel=`近${series.length}${monthly?'个月':weekly?'周':'期'}${monthly||weekly?'趋势':'模拟快照'}`;
  details.append(element('span','node-extra-label',`${windowLabel} · ${labels[position]??'无可用期'}`),element('p','node-change',change));
  const box=element('div','node-sparkline');
  box.dataset.metricId=String(id);
  box.setAttribute('role','img');
  box.setAttribute('aria-label',`${history.title}；${labels[position]??'无可用期'}值${Number.isFinite(current)?chartValue(current,unit):'不适用'}，${change}；比较期${labels[position-1]??'无'}。趋势独立缩放，不用于跨指标比较波动幅度。${history.note??''}`);
  details.append(box);
  return details;
}
function drawSparkline(box,values,id,labels=dataset.weekly.map(w=>`W${w.week}`),unit=[9,34].includes(id)?'人':'%') {
  box.dataset.drawn='1';
  if (!window.echarts) {
    box.removeAttribute('role'); box.textContent='图表不可用；上方保留环比。'; return;
  }
  const instance=createChart(box);
  sparklines.push(instance);
  setChartOption(instance,()=>({
    animation:false,grid:{left:2,right:2,top:5,bottom:5},
    xAxis:{type:'category',show:false,data:labels},
    yAxis:{type:'value',show:false,scale:true},
    tooltip:{...chartTooltipStyle(),trigger:'axis',formatter:params=>`${periodLabel(labels[params[0].dataIndex])}：${chartValue(params[0].value,unit)}`},
    series:[{type:'line',data:values,symbol:'circle',symbolSize:(_,params)=>filterState.week&&labels[params.dataIndex]===`W${filterState.week}`?6:0,
      smooth:.2,lineStyle:{width:2,color:'#bf762b'},areaStyle:{color:'rgba(232,150,60,.13)'}}]
  }));
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
  const table=element('table','');table.append(element('caption','','分产品线状态人数（人）'));
  const head=element('thead','');const row=element('tr','');
  ['产品线','Free或无权益','试用中','付费中','已取消未到期','支付失败','已过期','合计'].forEach(label=>{
    const header=element('th','',label);header.scope='col';row.append(header);
  });
  head.append(row);table.append(head);
  const body=element('tbody','');
  for (const [key,label] of [['bird','观鸟'],['hunting','狩猎']]) {
    const item=metric(5).value[key];
    if(!item) continue;
    const values=[item.free??item.noEntitlement,item.trialEarly+item.trialNearExpiry,item.paidCurrent,item.cancelledButEntitled,item.paymentFailed,item.expired??0,Object.values(item).reduce((a,b)=>a+b,0)];
    const tr=element('tr',''),header=element('th','',label);header.scope='row';tr.append(header);
    values.forEach(value=>tr.append(element('td','',number(value))));body.append(tr);
  }
  table.append(body);
  const tableWrap=element('div','data-table-scroll status-table');tableWrap.append(table);details.append(tableWrap);
  return details;
}
function subscriptionStatusSpec(value=metric(5).value) {
  const keys=Object.keys(value),totals=keys.map(key=>Object.values(value[key]).reduce((sum,count)=>sum+count,0));
  const definitions=[['Free或无权益',['free','noEntitlement'],'#9eaa9a','#263d2e'],
    ['试用中',['trialEarly','trialNearExpiry'],'#e8b765','#263d2e'],
    ['付费中',['paidCurrent'],'#356d51','#ffffff'],['已取消未到期',['cancelledButEntitled'],'#e8963c','#263d2e'],
    ['支付失败',['paymentFailed'],'#e5484d','#ffffff'],['已过期',['expired'],'#718078','#ffffff']];
  const series=definitions.map(([name,fields,color,labelColor])=>{
    const counts=keys.map(key=>fields.reduce((sum,field)=>sum+(value[key][field]??0),0));
    return {name,color,labelColor,values:counts.map((count,index)=>totals[index]>0?count/totals[index]*100:null),
      details:counts.map((count,index)=>({numerator:count,denominator:totals[index],
        numeratorUnit:'人',denominatorUnit:'人',basisLabel:'状态主账号 / 产品线主账号'}))};
  });
  return {kind:'stacked100',metricId:5,title:'产品线订阅状态 · 当前快照',unit:'%',
    labels:keys.map(key=>groupLabels[key]??key),series,showPercentLabels:true,
    note:`每行按本产品线主账号合计100%；${keys.map((key,index)=>`${groupLabels[key]??key} ${number(totals[index])}人`).join('，')}。试用中合并前期与临期，Free仅适用于观鸟，无权益仅适用于狩猎；零分母不绘制比例。`};
}
const statusHistoryCache=new WeakMap();
const statusHistorySelections=new Map();
const statusHistoryFields={free:'Free',noEntitlement:'无权益',trialEarly:'试用早期（>3天）',trialNearExpiry:'试用临期（≤3天）',paidCurrent:'付费中',cancelledButEntitled:'已取消未到期',paymentFailed:'支付失败',expired:'已过期'};
const statusHistoryColors={free:'#9eaa9a',noEntitlement:'#9eaa9a',trialEarly:'#e8b765',trialNearExpiry:'#d89935',paidCurrent:'#356d51',cancelledButEntitled:'#e8963c',paymentFailed:'#e5484d',expired:'#718078'};
function subscriptionStatusHistoryIndex() {
  const source=sourceData.subscriptionFlow?.statusHistory;
  if(!source||typeof source!=='object')return {reason:'订阅状态历史待补；当前快照仍可在分组证据核对。'};
  if(statusHistoryCache.has(source))return statusHistoryCache.get(source);
  const invalid=()=>{const result={reason:'订阅状态历史的日期、分类或人数待核验；不以当前结构回填旧日期。'};statusHistoryCache.set(source,result);return result;};
  const current=sourceData.metrics.m05?.value,paid=sourceData.metricTrends?.m02,pool=sourceData.metricTrends?.m48,asOf=Date.parse(source.asOf+'T00:00:00Z');
  if(source.version!=='synthetic-status-snapshots-v1'||source.classification!=='entirely_synthetic'||source.timezone!=='UTC'||source.asOf!==sourceData.snapshot.asOf||!Number.isFinite(asOf)||new Date(asOf).toISOString().slice(0,10)!==source.asOf||!Array.isArray(source.rows)||source.rows.length!==12||!current||paid?.points?.length!==12||pool?.points?.length!==12)return invalid();
  for(const [i,row]of source.rows.entries()) {
    const time=typeof row?.at==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.at)?Date.parse(row.at+'T00:00:00Z'):NaN;
    if(!Number.isFinite(time)||time!==asOf-(11-i)*7*86400000||new Date(time).toISOString().slice(0,10)!==row.at||!row.products||Object.keys(row.products).length!==2)return invalid();
    let owners=0,entitled=0;
    for(const product of ['bird','hunting']) {
      const part=row.products[product],fields=Object.keys(current[product]??{});
      if(!part||!fields.length||fields.some(k=>!Object.hasOwn(statusHistoryFields,k))||Object.keys(part).length!==fields.length||fields.some(k=>!Number.isSafeInteger(part[k])||part[k]<0))return invalid();
      owners+=Object.values(part).reduce((sum,n)=>sum+n,0);entitled+=part.paidCurrent+part.cancelledButEntitled;
      if(i===11&&fields.some(k=>part[k]!==current[product][k]))return invalid();
    }
    const label=`${new Date(time).getUTCMonth()+1}/${new Date(time).getUTCDate()}`;
    if(!Number.isSafeInteger(owners)||!Number.isSafeInteger(entitled)||owners!==pool.points[i].denominator||entitled!==paid.points[i].value||paid.labels?.[i]!==label||pool.labels?.[i]!==label)return invalid();
  }
  const result={rows:source.rows,note:source.note};statusHistoryCache.set(source,result);return result;
}
function subscriptionStatusHistoryProjection(state=filterState) {
  const source=subscriptionStatusHistoryIndex();if(source.reason)return source;
  const filters=effectiveFor(5,state);
  if(filters.some(([key])=>!policyFor(5).demonstrableDimensions.includes(key)))return {reason:'当前条件缺少同范围订阅状态历史；不回退到总体。'};
  const product=filters.find(([key])=>key==='productLine')?.[1],keys=product?[product==='Bird'?'bird':'hunting']:['bird','hunting'],other=filters.filter(([key])=>key!=='productLine'),shares=sharesFor(other,5);
  return {rows:source.rows.map(row=>({at:row.at,products:projectGroup(Object.fromEntries(keys.map(key=>[key,row.products[key]])),shares,other,5)})),keys,
    note:source.note+(other.length?' 当前历史沿用本原型的独立维度分片估算，不是实测国家、平台或订阅平台交叉明细。':''),estimated:!!other.length};
}
function subscriptionStatusHistoryTable(part=subscriptionStatusHistoryProjection()) {
  if(part.reason)return {title:'订阅状态历史 · 待核验',columns:['状态'],rows:[[part.reason]]};
  return {title:'12个状态快照 · 全部人数（人）',columns:['快照 / 产品线','主账号合计','Free或无权益','试用早期','试用临期','付费中','已取消未到期','支付失败','已过期'],rows:part.rows.flatMap(row=>part.keys.map(key=>{const p=row.products[key];return [`${row.at} · ${groupLabels[key]}`,Object.values(p).reduce((a,b)=>a+b,0),p.free??p.noEntitlement,p.trialEarly,p.trialNearExpiry,p.paidCurrent,p.cancelledButEntitled,p.paymentFailed,p.expired??0];})),note:part.note};
}
function subscriptionStatusHistory() {
  const node=element('section','status-history');node.dataset.evidenceMetric='5';node.append(element('h3','','近12个订阅状态快照'));
  const part=subscriptionStatusHistoryProjection();
  if(part.reason){node.append(element('p','na-note',part.reason));return {node,init:()=>{}};}
  node.append(element('p','table-note',part.note));
  const scope=JSON.stringify(effectiveFor(5).sort(([a],[b])=>a.localeCompare(b))),previous=statusHistorySelections.get(scope)??{product:part.keys[0],measure:'paidEntitled'};
  const controls=element('div','status-history-controls'),productLabel=element('label','','历史产品线（仅查看）'),product=element('select',''),measureLabel=element('label','','查看状态占比趋势'),measure=element('select','');
  product.id='status-history-product';measure.id='status-history-measure';productLabel.htmlFor=product.id;measureLabel.htmlFor=measure.id;
  for(const key of part.keys){const option=element('option','',groupLabels[key]);option.value=key;product.append(option);}product.value=part.keys.includes(previous.product)?previous.product:part.keys[0];
  productLabel.append(product);measureLabel.append(measure);controls.append(productLabel,measureLabel);node.append(controls);
  const summary=element('p','status-history-summary'),content=element('div','status-history-charts');node.append(summary,content,element('p','table-note','产品线和状态控件仅切换历史视图；登记仍按全局筛选与当前快照，查看旧日期不更新原基线或草稿。'));
  let boxes=[];
  function render() {
    node.dataset.initialized='true';
    for(const box of boxes){const e=window.echarts?.getInstanceByDom(box);if(e){destroyChart(e);const i=detailCharts.indexOf(e);if(i>=0)detailCharts.splice(i,1);}}boxes=[];
    const key=product.value,fields=Object.keys(part.rows[0].products[key]),selected=measure.value||previous.measure;
    measure.replaceChildren();for(const [value,label]of [['paidEntitled','有效付费（含已取消未到期）'],...fields.map(k=>[k,statusHistoryFields[k]])]){const o=element('option','',label);o.value=value;measure.append(o);}measure.value=[...measure.options].some(o=>o.value===selected)?selected:'paidEntitled';
    statusHistorySelections.set(scope,{product:key,measure:measure.value});
    const selectedFields=measure.value==='paidEntitled'?['paidCurrent','cancelledButEntitled']:[measure.value],name=measure.selectedOptions[0].textContent,rows=part.rows.map(r=>{const p=r.products[key],denominator=Object.values(p).reduce((a,b)=>a+b,0),numerator=selectedFields.reduce((a,k)=>a+p[k],0);return {at:r.at,parts:p,denominator,numerator,value:denominator>=30?numerator/denominator*100:null};});
    const first=rows[0],last=rows.at(-1),delta=last.value!==null&&first.value!==null?last.value-first.value:null;
    summary.textContent=`${groupLabels[key]} · ${name}：${number(first.numerator)} / ${number(first.denominator)} 人 → ${number(last.numerator)} / ${number(last.denominator)} 人；${delta===null?'样本不足30，不生成占比变化':`占比 ${first.value.toFixed(1)}% → ${last.value.toFixed(1)}%（${delta>=0?'+':'−'}${Math.abs(delta).toFixed(2)} 个百分点）`}。这是不同快照的状态构成，不是同一用户的转化或流失。`;
    content.replaceChildren();
    const append=(spec,table,extra='')=>{const panel=element('section','detail-chart-panel workspace-chart-panel');panel.dataset.evidenceMetric='5';panel.append(element('h3','',spec.title));const box=element('div',`detail-chart ${extra}`);box.setAttribute('role','img');box.setAttribute('aria-label',`${spec.title}；${spec.note}`);panel.append(box);const scale=chartScaleNote(spec);if(scale)panel.append(element('p','chart-scale-note',scale));panel.append(element('p','table-note',spec.note));const detail=element('details','chart-data');detail.append(element('summary','','查看状态人数与占比'),dataTable(table));panel.append(detail);content.append(panel);boxes.push(box);drawEvidenceChart(box,spec);};
    append({title:`${groupLabels[key]} · ${name}占比`,unit:'%',nearestLinePoint:true,labels:rows.map(r=>r.at),series:[{name,values:rows.map(r=>r.value),details:rows.map(r=>({...r,numeratorUnit:'人',denominatorUnit:'人',basisLabel:'所选状态 / 本产品线主账号'}))}],note:'每个比例使用本快照、本产品线的主账号合计；人数与完整值可验算。'},
      {title:`${groupLabels[key]} · ${name}人数验算`,columns:['快照','所选状态（人）','产品线主账号（人）','占比'],rows:rows.map(r=>[r.at,r.numerator,r.denominator,r.value===null?'样本不足或无样本':`${r.value.toFixed(1)}%`]),note:part.estimated?'独立分片模拟估算。':'同一合成状态快照。'});
    append({kind:'stacked100',chronologicalRows:true,title:`${groupLabels[key]} · 12期互斥状态结构`,unit:'%',labels:rows.map(r=>r.at),series:fields.map(k=>({name:statusHistoryFields[k],color:statusHistoryColors[k],values:rows.map(r=>r.denominator>=30?r.parts[k]/r.denominator*100:null),details:rows.map(r=>({numerator:r.parts[k],denominator:r.denominator,numeratorUnit:'人',denominatorUnit:'人'}))})),note:'从上到下按日期递增；有效样本每行状态互斥合计100%，分母是该行本产品线主账号；不足30人不绘制比例，完整人数仍可查。不将12期人数相加为独立用户。'},
      {title:`${groupLabels[key]} · 每期完整状态人数`,columns:['快照','主账号合计（人）',...fields.map(k=>statusHistoryFields[k]+'（人）')],rows:rows.map(r=>[r.at,r.denominator,...fields.map(k=>r.parts[k])]),note:part.note},'status-history-structure');
    updateScrollableTables();
  }
  product.addEventListener('change',render);measure.addEventListener('change',render);return {node,init:render};
}

function drawStatus(box) {
  box.dataset.drawn='1';
  if (!window.echarts) {box.removeAttribute('role');box.textContent='图表不可用；下方保留完整状态人数表。';return;}
  statusChart=createChart(box);
  const spec=subscriptionStatusSpec();
  setChartOption(statusChart,()=>({
    animationDuration:chartAnimationDuration(450),grid:{left:42,right:26,top:12,bottom:62},
    xAxis:{type:'value',max:100,axisLabel:{formatter:'{value}%',color:'#58695b'},splitLine:{lineStyle:{color:'#e4eae2'}}},
    yAxis:{type:'category',data:spec.labels,axisLabel:{color:'#506455'},axisLine:{show:false},axisTick:{show:false}},
    legend:{bottom:0,itemWidth:12,selectedMode:false,textStyle:{fontSize:chartText(12),color:'#596b5e'}},
    tooltip:{...chartTooltipStyle(),trigger:'axis',axisPointer:{type:'shadow'},formatter:params=>{
      const index=params[0]?.dataIndex;
      if(index===undefined)return '';
      return `${spec.labels[index]} · 主账号 ${number(spec.series[0].details[index].denominator)}人<br>${params.map(item=>
        `${item.marker}${item.seriesName}：${chartValue(item.value,'%')} · ${number(spec.series[item.seriesIndex].details[index].numerator)}人`).join('<br>')}`;
    }},
    series:spec.series.map(line=>({name:line.name,type:'bar',stack:'status',barWidth:25,itemStyle:{color:line.color},data:line.values})),
  }));
  const table=box.closest('.status-details').querySelector('.status-table table');
  bindChartTableSelection(statusChart,table,params=>{
    const line=spec.series[params.seriesIndex],detail=line.details[params.dataIndex];
    return `${spec.labels[params.dataIndex]} · ${line.name} ${number(detail.numerator)}人（${chartValue(params.value,'%')}）`;
  },{resolvePoint:params=>stackedChartPoint(statusChart,spec,params),indexFor:params=>[...table.querySelectorAll('tbody tr')].findIndex(row=>
    row.firstElementChild.textContent===spec.labels[params.dataIndex]),columnFor:params=>params.seriesIndex+1});
}
function miniCard({id,label,page,value,unit='',note='',critical=false,alert=false}) {
  const measure=metric(id),filterContext=metricFilterContext(id);
  const article=element('article',`mini-card${alert?' alert-card':''}${critical?' critical':''}`);
  let body=article;
  if (alert) { article.append(element('span','alert-icon')); body=element('div',''); article.append(body); }
  const heading=element('div','metric-heading');heading.append(element('div','metric-label',label),definition(id,label));body.append(heading);
  const link=element('a','card-link'); link.href=routeHref(page,id);
  const valueNode=element('div','metric-value',value);
  if(unit&&metric(id).kind!=='na')valueNode.append(element('span','metric-value-unit',unit));
  link.append(valueNode);
  const explanation=measure.kind==='na'?measure.reason:note;
  if(explanation)link.append(element('p','',explanation));
  let scope='';
  if(filterContext.ignored.length) {
    scope=filterContext.applied.length?
      `${measure.kind==='na'?'本项条件':'本项应用'}：${filterContext.applied.map(([key,option])=>`${filterLabels[key]} ${optionLabel(key,option)}`).join('、')}`:
      '本项仍为总体范围';
    scope+=`；未应用：${filterContext.ignoredText}`;
  }
  const source=measure.kind!=='na'&&filterContext.applied.length?
    (id===17?'同源注册分母与7天开启频数':[9,10,12].includes(id)?'同源国家×注册App×注册批次频数':[4,25,30].includes(id)?'同源国家×App活跃窗口频数':[11,13].includes(id)?'同源合成绑定／激活频数':id===16?'独立合成首次内容设备逐台计数':id===15?'合成设备台账逐台计数':id===41?'合成设备行为间隔汇总':id===42?'合成触发事件汇总':'按适用条件模拟分片估算'):'';
  const context=[scope,source].filter(Boolean).join('；');
  if(context)link.append(element('p','metric-filter-scope',context));
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
  const header=element('div','page-heading home-field-heading');
  const landscape=element('img','field-landscape');
  landscape.src='./assets/field-mark.webp';landscape.alt='';
  landscape.width=384;landscape.height=224;landscape.decoding='async';
  landscape.setAttribute('fetchpriority','low');landscape.setAttribute('aria-hidden','true');
  const text=element('div','');
  text.append(element('p','eyebrow','BUSINESS FIELD NOTES  /  01'),
              element('h1','','经营简报'),
              element('p','heading-sub','从新客接入到付费留存，沿经营主线观察变化；异常进入对应诊断页。'));
  const tags=element('div','heading-meta');
  tags.append(element('span','meta-tag',`快照 ${s.asOf}`),element('span','meta-tag accent',s.season));
  const qualityState=dataQualityState(metric(54));
  const quality=element('a','meta-tag quality-status',`数据质量：${qualityState.label} ↗`);
  quality.dataset.state=qualityState.label==='演示预警'?'warning':qualityState.label==='演示正常'?'normal':'unavailable';
  quality.href=routeHref('G',54);quality.setAttribute('aria-describedby','quality-status-description');
  const qualityDescription=element('span','visually-hidden',qualityState.reason);qualityDescription.id='quality-status-description';
  tags.append(quality,qualityDescription);
  header.append(text,landscape,tags);
  return header;
}
function homeComparisons() {
  const comparisons=[];
  const activation=weeklyRateComparison(13,8,false),trial=weeklyRateComparison(18,9,false);
  if(activation?.series.length===12&&activation.series.every(Number.isFinite))comparisons.push({...activation,page:'A',name:'7日价值激活'});
  if(trial)comparisons.push({...trial,page:'D',name:'试用转正'});
  return comparisons;
}
function homeStartingPoint(comparisons) {
  // These two process rates both deteriorate when falling. Compare evidence readiness,
  // never magnitudes across different cohorts or denominators.
  const adverse=comparisons.filter(item=>item.delta<=-.05);
  const supported=adverse.find(item=>{
    const evidence=homeTrialEvidence(item);
    return evidence&&evidence.parts.groups.length>1;
  });
  if(supported)return {id:supported.id,kind:'supported',reason:'先看试用转正：同范围、同周期的分组贡献可验算。此为排查起点，不代表业务损失最大。'};
  if(adverse.length)return {id:adverse[0].id,kind:'unsegmented',reason:'有可比下降，暂无充分的分组贡献证据；按主线顺序展开，不判断业务影响大小。'};
  return {id:comparisons[0]?.id??null,kind:comparisons.length?'no-decline':'unavailable',reason:comparisons.length?
    '当前可比线索未见明显下降；展示事实，不生成异常优先级。':'当前范围缺少可比样本，不判定异常或优先级。'};
}
function homeComparisonChange(comparison) {
  return trendMovement(comparison.delta,' 个百分点');
}
function homeResult({id,label,value,page,status}) {
  const article=element('article','home-result');article.dataset.metricId=String(id);
  const heading=element('div','metric-heading');heading.append(element('h3','metric-label',label),definition(id,label));
  const link=element('a','home-result-link');link.href=routeHref(page,id);
  link.setAttribute('aria-label',`${label} ${value}${metric(id).kind==='na'?'':id===3?'美元每月':'人'}，查看${pages[page].title}数据`);
  const valueNode=element('div','metric-value',value);
  if(metric(id).kind!=='na')valueNode.append(element('span','metric-value-unit',id===3?'/ 月':'人'));
  link.append(valueNode);article.append(heading,link);
  const compare=element('div','home-result-comparison');
  const history=metricHistory(id);
  let delta=null,change='暂无可比值',period='',fullPeriod='';
  if(id===21&&metric(id).kind==='group') {
    const {opening,closing}=metric(id).value;
    if(opening>0&&Number.isFinite(closing)) {
      delta=closing-opening;change=`存量 ${delta>=0?'+':''}${(delta/opening*100).toFixed(1)}%`;
      period='9/24 较 9/1';
    }
  } else if(history) {
    const index=history.values.length-1,current=history.values[index],previous=history.values[index-1];
    if(Number.isFinite(current)&&Number.isFinite(previous)) {
      delta=current-previous;
      change=Math.abs(delta)<.05?'持平':`${delta>0?'+':'−'}${number(Math.round(Math.abs(delta)))}${history.unit}`;
      const labels=[history.labels[index],history.labels[index-1]];
      fullPeriod=`${labels[0]} 较 ${labels[1]}`;
      const sameYear=labels.every(label=>/^\d{4}-\d{2}-\d{2}$/.test(label))&&labels[0].slice(0,4)===labels[1].slice(0,4);
      const display=label=>sameYear?`${Number(label.slice(5,7))}/${Number(label.slice(8,10))}`:label;
      period=`${display(labels[0])} 较 ${display(labels[1])}`;
    }
  }
  if(metric(id).kind==='na')change=metric(id).availability==='pending'?'待补数据':'当前范围不适用';
  compare.append(element('span',`home-result-delta${delta==null||Math.abs(delta)<.05?' neutral':delta<0?' adverse':' improving'}`,change),
    element('span','home-result-period',period));
  compare.lastElementChild.title=fullPeriod||period;
  compare.setAttribute('aria-label',`${change}${period?`，${fullPeriod||period}`:''}${id===21?'；变化比例以期初存量为基准':''}`);
  article.append(compare);
  if(id===21&&metric(id).kind!=='na') {const flow=netAddComparison();if(flow)article.append(flow);}
  else article.append(element('p','home-result-context',metric(id).kind==='na'?metric(id).reason:status));
  return article;
}
function renderHome() {
  disposeCharts();
  const s=dataset.snapshot;
  main.replaceChildren(intro());
  const dash=element('div','dashboard home-dashboard');
  const resultHead=element('div','home-result-head');
  resultHead.append(sectionTitle('01  /  RESULT','经营结果'),filterBar());dash.append(resultHead);
  const snap=element('div','home-results');
  [
    {id:2,label:'有效订阅用户',value:displayValue(2),page:'D',status:'当前有效付费权益'},
    {id:21,label:'9月截至24日净增',value:metric(21).kind==='na'?displayValue(21):`${metric(21).value.closing-metric(21).value.opening>=0?'+':''}${number(metric(21).value.closing-metric(21).value.opening)}`,page:'D',status:'9/1期初 → 9/24期末'},
    {id:3,label:'MRR',value:displayValue(3),page:'D',status:'基础订阅 + 增值Pack'},
    {id:4,label:'复合活跃主账号',value:displayValue(4),page:'B',status:'最近30天去重'},
  ].forEach(item=>snap.append(homeResult(item)));
  dash.append(snap);

  const journeyTitle=sectionTitle('03  /  VALUE JOURNEY','六节点经营主线','调查顺序 · 各自批次与分母，不能相乘 · 趋势独立缩放');
  const rail=element('div','journey-rail');
  [
    {id:9,label:'周新增注册',value:formatMetric(9),page:'A',detail:1},
    {id:11,label:'首次绑定成功率',value:formatMetric(11),page:'A',detail:2},
    {id:13,label:'7日价值激活率',value:formatMetric(13),page:'A',detail:3,star:true},
    {id:18,label:'试用→转正率',value:formatMetric(18),page:'D',detail:4,star:true},
    {id:23,label:'月度续订率',value:formatMetric(23),page:'D',detail:5,star:true},
    {id:34,label:'付费权益主账号',value:formatMetric(34),page:'E',detail:6},
  ].forEach(item=>rail.append(card({...item,kind:'journey',...journeyStatus(item.id)})));

  const story=element('div','story-panel');
  const trend=element('section','trend-panel');
  const panelHeader=element('div','panel-header');
  const comparisons=homeComparisons();
  const startingPoint=homeStartingPoint(comparisons);
  if(homeSelectionMode==='manual'&&homeTrendFocus!==null&&!comparisons.some(item=>item.id===homeTrendFocus))homeSelectionMode='auto';
  if(homeSelectionMode==='auto')homeTrendFocus=startingPoint.id;
  const heading=element('h3','');
  const period=element('p','panel-sub',`${periodLabel('W1').split(' · ')[1].split('–')[0]}–${periodLabel('W12').split('–')[1]} · 12个观察周${filterState.week?` · 已选W${filterState.week}，保留完整趋势`:''}`);
  const labels=element('div','trend-heading');labels.append(element('p','section-kicker','02 / CHANGE · 变化线索'),heading,period);
  const overview=element('button','trend-overview','并列对照');overview.type='button';overview.setAttribute('aria-controls','trendChart home-contribution');
  panelHeader.append(labels,overview);
  trend.append(panelHeader);
  const chartBox=element('div',''); chartBox.id='trendChart'; chartBox.setAttribute('role','img');
  trend.append(chartBox);
  const scaleNote=element('p','chart-scale-note');trend.append(scaleNote);
  const contribution=element('section','home-contribution');contribution.hidden=true;
  contribution.id='home-contribution';trend.append(contribution);
  trend.append(createTrendTable());
  const insight=element('aside','insight-panel');
  insight.append(element('h3','signal-heading','变化解读与行动建议'));
  const selection=element('div','home-selection');
  const selectionReason=element('p','home-selection-reason');
  const resetSelection=element('button','home-selection-reset','恢复建议起点');resetSelection.type='button';
  resetSelection.setAttribute('aria-controls','trendChart home-contribution home-comparison-context');
  selection.append(selectionReason,resetSelection);insight.append(selection,homeDeviceClue());
  const signals=element('div','home-signals');
  comparisons.forEach(item=>{
    const button=element('button',`home-signal signal-${item.id}`);button.type='button';button.dataset.metricId=item.id;
    button.setAttribute('aria-controls','trendChart home-contribution home-comparison-context');
    const title=element('span','home-signal-title');title.append(element('strong','',item.name));
    const values=element('span','home-signal-values');values.append(element('span','',`${item.beforeRate.toFixed(1)}%`),element('span','signal-arrow','→'),element('strong','',`${item.afterRate.toFixed(1)}%`),
      element('span',`signal-delta ${item.delta<-.05?'adverse':item.delta>.05?'improving':'neutral'}`,homeComparisonChange(item)));
    const windows=element('span','home-signal-windows');
    for(const [label,window] of [[item.beforeLabel,item.beforeWindow],[item.afterLabel,item.afterWindow]]) {
      const column=element('span','');column.append(element('span','',label),element('span','',window));windows.append(column);
    }
    button.append(title,values,element('span','home-signal-period',`${item.beforeLabel} → ${item.afterLabel}`),windows);
    button.addEventListener('click',()=>selectSignal(item.id));signals.append(button);
  });
  insight.append(signals);
  const context=element('div','home-comparison-context');context.id='home-comparison-context';context.setAttribute('aria-live','polite');
  insight.append(context);
  insight.append(element('p','home-signal-guardrail','两条线各自计算，不构成连续漏斗；变化提供排查线索。'));
  if(!comparisons.length)signals.append(element('p','','当前范围缺少可用于前后期趋势比较的样本；可查看下方数据表中的可用趋势。'));
  function selectSignal(id,redraw=true,manual=true) {
    if(manual) {
      homeSelectionMode='manual';
      // A new reading choice supersedes any queued back/forward focus restoration.
      readingRevision++;
    }
    homeTrendFocus=id;
    selectionReason.textContent=homeSelectionMode==='auto'?`选择依据 · ${startingPoint.reason}`:
      id===null?'已切换为并列对照；筛选更新后保留此视图。':'当前为手动选择；筛选更新后，线索可用时继续保留。';
    resetSelection.hidden=homeSelectionMode==='auto';
    const selected=comparisons.find(item=>item.id===id);
    const trialEvidence=selected?homeTrialEvidence(selected):null;
    updateHomeContribution(contribution,selected,trialEvidence,redraw);
    trend.classList.toggle('has-contribution',!!trialEvidence);
    heading.textContent=selected?`${selected.name} · 周度变化`:'激活与转正 · 周度对照';
    overview.setAttribute('aria-pressed',String(!selected));
    signals.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.metricId)===id)));
    const axis=trendAxisDomain(selected?[selected.series,[selected.beforeRate,selected.afterRate]]:[trendValues(13),trendValues(18)],'%');
    scaleNote.hidden=!axis||!window.echarts;scaleNote.textContent=axis?`${trendAxisNote(axis,'%')} ${weeklyAxisNote}`:'';
    chartBox.setAttribute('aria-label',`${heading.textContent}，12个观察周；${selected?`${selected.beforeLabel}${selected.beforeRate.toFixed(1)}%，${selected.afterLabel}${selected.afterRate.toFixed(1)}%，变化${homeComparisonChange(selected)}；`:''}${scaleNote.textContent}`);
    context.replaceChildren();
    if(selected) {
      const basis=element('details','home-comparison-basis');basis.append(element('summary','','查看比较依据'));
      basis.append(element('p','',`${selected.beforeLabel}：${number(selected.before.numerator)} / ${number(selected.before.denominator)}；${selected.afterLabel}：${number(selected.after.numerator)} / ${number(selected.after.denominator)}。分母为${selected.scope}中的主账号。来源：${selected.source}。`));
      if(selected.series.some(value=>!Number.isFinite(value)))basis.append(element('p','','样本少于30的周在折线上留空；合并率仍按全周期合格人数计算。'));
      const link=element('a','insight-link','核对分组证据 ↗');link.href=routeHref(selected.page,selected.id,'groups');
      link.setAttribute('aria-label',`进入${pages[selected.page].title}，核对${selected.name}分组证据`);
      const action=element('div','home-signal-actions');action.append(link,basis);
      const movement=`较前期${trendMovement(selected.delta,' 个百分点')}`;
      const adverse=selected.delta<=-.05;
      const advice=homeTrialClue(selected,trialEvidence)||(adverse?
        selected.id===13?'优先核对分组差异及成熟注册批次。':'优先核对转正失败构成及成熟试用批次。':
        '可查看分组与批次明细；当前变化不作为异常处置依据。');
      context.append(element('strong','home-observation-label','观察'),
        element('p','signal-explanation',`近期合并率${movement}。${advice}`),
        element('strong','home-observation-label',adverse?'建议优先行动':'建议查看'),action);
      const selectedButton=signals.querySelector(`[data-metric-id="${selected.id}"]`);
      const keepFocus=document.activeElement===selectedButton;
      if(signals.firstElementChild!==selectedButton)signals.prepend(selectedButton);
      selectedButton.after(context);
      if(keepFocus)selectedButton.focus({preventScroll:true});
    } else context.append(element('p','signal-explanation','两条线使用各自批次和分母；不构成连续漏斗。选择线索可查看基准、近期区间与专题证据。'));
    if(!selected)signals.after(context);
    if(redraw)drawTrend(homeTrendFocus,selected);
  }
  overview.addEventListener('click',()=>selectSignal(null));
  resetSelection.addEventListener('click',()=>{
    readingRevision++;
    homeSelectionMode='auto';selectSignal(startingPoint.id,true,false);
    (startingPoint.id===null?overview:signals.querySelector(`[data-metric-id="${startingPoint.id}"]`)).focus({preventScroll:true});
  });
  selectSignal(homeTrendFocus,false,false);
  story.append(trend,insight); dash.append(story,journeyTitle,rail);

  const lower=element('div','lower-grid');
  const foundation=element('section',''); foundation.append(sectionTitle('04  /  FOUNDATION','设备与用户结构'));
  const foundationCards=element('div','foundation-grid');
  [
    {id:41,label:'设备活跃率',page:'C',value:formatMetric(41),note:'近30天有效设备行为；心跳不计活跃'},
    {id:42,label:'空触发率',page:'C',value:formatMetric(42),note:'观鸟线 · K6 固件2.8集中偏高'},
    {id:48,label:'多设备用户占比',page:'F',value:formatMetric(48),note:'已绑定主账号'},
    {id:49,label:'设备共享率',page:'F',value:formatMetric(49),note:'当前绑定设备'},
  ].forEach(item=>foundationCards.append(miniCard(item)));
  foundation.append(foundationCards);
  lower.append(subscriptionDetails(),foundation);dash.append(lower);
  const alert=element('section','home-alerts'); alert.append(sectionTitle('05  /  ACTION QUEUE','预警与行动入口'));
  const alertCards=element('div','alert-grid');
  [
    {id:15,label:'绑定未激活设备',page:'A',value:displayValue(15),unit:metricCountUnits[15],note:'已绑定超过3天，仍无首图',alert:true,critical:true},
    {id:52,label:'流失高危主账号',page:'D',value:displayValue(52),unit:metricCountUnits[52],note:'同源规则命中 · 合成账号',alert:true,critical:true},
    {id:29,label:'季节阈值未使用主账号',page:'B',value:metric(29).kind==='rate'?number(metric(29).numerator):'不适用',unit:'人',note:`连续${metric(29).thresholdDays??21}天`,alert:true},
    {id:22,label:'Free权益用满主账号',page:'D',value:metric(22).kind==='group'?number(metric(22).value.anyExhausted.numerator):'不适用',unit:'人',note:'观鸟线 · 升级机会',alert:true},
  ].forEach(item=>alertCards.append(miniCard(item)));
  alert.append(alertCards);dash.append(alert);
  main.append(dash);
  document.querySelectorAll('.node-sparkline').forEach(box=>{
    const id=Number(box.dataset.metricId);
    const history=metricHistory(id);
    drawSparkline(box,history?.values??trendValues(id),id,history?.labels,history?.unit);
  });
  const statusBox=document.querySelector('#statusChart');if(statusBox)drawStatus(statusBox);
  drawTrend(homeTrendFocus,comparisons.find(item=>item.id===homeTrendFocus));
  const contributionPlot=contribution.querySelector('.home-contribution-chart');
  if(contributionPlot)drawEvidenceChart(contributionPlot,evidenceChartSpecs.get(contributionPlot));
}
function updateHomeContribution(container,comparison,evidence,draw=true) {
  const oldPlot=container.querySelector('.home-contribution-chart');
  const oldInstance=oldPlot&&window.echarts?.getInstanceByDom(oldPlot);
  if(oldInstance) {
    destroyChart(oldInstance);
    const index=detailCharts.indexOf(oldInstance);if(index>=0)detailCharts.splice(index,1);
  }
  container.replaceChildren();container.hidden=!evidence;
  if(!evidence)return;
  const {parts}=evidence;
  const title=`同周期分组贡献 · 合计 ${chartValue(comparison.delta,'个百分点')}`;
  const note=`${comparison.beforeLabel} → ${comparison.afterLabel}；每组转正人数分别除以同期总体成熟试用人数，再比较差值。数学分解，不证明因果。`;
  const spec={kind:'groupContribution',title,unit:'个百分点',labels:parts.groups.map(group=>group.name),
    series:[{name:'变化贡献',values:parts.changes}],parts,comparison};
  const heading=element('h4','',title);heading.id='home-contribution-heading';
  container.setAttribute('aria-labelledby',heading.id);
  const plot=element('div','home-contribution-chart');plot.setAttribute('role','img');
  plot.setAttribute('aria-label',`${title}；${parts.groups.map((group,index)=>`${group.name} ${chartValue(parts.changes[index],'个百分点')}`).join('；')}。下方可核对两期人数。`);
  evidenceChartSpecs.set(plot,spec);
  const table=element('details','chart-data');
  table.append(element('summary','','核对贡献人数与计算'));
  const rows=parts.groups.map((group,index)=>[group.name,
    `${number(group.summaries[0].numerator)} / ${number(parts.overall[0].denominator)}`,
    `${number(group.summaries[1].numerator)} / ${number(parts.overall[1].denominator)}`,
    chartValue(parts.changes[index],'个百分点')]);
  rows.push(['合计',`${number(parts.overall[0].numerator)} / ${number(parts.overall[0].denominator)}`,
    `${number(parts.overall[1].numerator)} / ${number(parts.overall[1].denominator)}`,chartValue(comparison.delta,'个百分点')]);
  table.append(dataTable({title:'试用转正 · 同周期互斥分组贡献',
    columns:['互斥分组',`${comparison.beforeLabel} · 组内转正 / 总体成熟`,`${comparison.afterLabel} · 组内转正 / 总体成熟`,'变化贡献'],rows,
    note:`${comparison.beforeWindow} → ${comparison.afterWindow}。来源：${comparison.source}。各行分母为同期总体人数，不是该组自身人数；贡献合计等于总体转正率变化。`}));
  const link=element('a','insight-link','查看专题分组证据 ↗');link.href=routeHref('D',18,'groups');
  const actions=element('div','home-contribution-actions');actions.append(table,link);
  container.append(heading,plot,element('p','home-contribution-note',note),actions);
  if(draw&&container.isConnected)drawEvidenceChart(plot,spec);
}
function createTrendTable() {
  const wrap=element('details','trend-table-wrap');
  wrap.append(element('summary','','查看趋势数据表'));
  const table=element('table','');
  table.append(element('caption','','近12个完整周过程指标（各自独立分母）'));
  const head=element('thead',''); const row=element('tr','');
  ['周','观鸟线7日价值激活率','试用→转正率'].forEach(label=>{
    const cell=element('th','',label);cell.scope='col';row.append(cell);
  });
  head.append(row); table.append(head);
  const body=element('tbody','');
  const activation=trendValues(13),conversion=trendValues(18);
  dataset.weekly.forEach((w,index)=>{
    const r=element('tr','');
    const week=element('th','',periodLabel(`W${w.week}`));week.scope='row';
    r.append(week,
             element('td','',Number.isFinite(activation?.[index])?`${activation[index].toFixed(1)}%`:'不适用'),
             element('td','',conversion?.[index]!=null?`${conversion[index].toFixed(1)}%`:'不适用'));
    body.append(r);
  });
  table.append(body); wrap.append(table); return wrap;
}
function isTimelineSpec(spec) {
  return spec.labels.every(label=>/^W\d+$/.test(label)||/^\d+月$/.test(label)||/^\d+\/\d+$/.test(label)||/^\d{4}-\d{2}-\d{2}$/.test(label)||monthOrdinal(label)!==null);
}
function chartNiceStep(roughStep) {
  const magnitude=10**Math.floor(Math.log10(roughStep)),relative=roughStep/magnitude;
  return (relative<=1?1:relative<=2?2:relative<=2.5?2.5:relative<=5?5:10)*magnitude;
}
function trendAxisDomain(series,unit) {
  const values=series.flatMap(line=>Array.isArray(line)?line:line?.values??[]).filter(Number.isFinite);
  if(!values.length)return null;
  const low=Math.min(...values),high=Math.max(...values);
  const minimumSpan=unit==='次/人'?.1:(unit==='%'||unit==='美元/人') ? .5 : Math.max(1,Math.max(Math.abs(low),Math.abs(high))*.02);
  const span=Math.max((high-low)*1.5,minimumSpan);
  let lower=(low+high-span)/2,upper=lower+span;
  if(low>=0)lower=Math.max(0,lower);
  if(unit==='%')upper=Math.min(100,upper);
  const roughStep=(upper-lower)/4;
  const nice=chartNiceStep(roughStep);
  const step=unit==='%'||unit==='美元/人'||unit==='次/人'?nice:Math.max(1,nice);
  const rounded=value=>Number(value.toPrecision(12));
  const min=rounded(Math.floor(lower/step)*step);
  const max=rounded(unit==='%'?Math.min(100,Math.ceil(upper/step)*step):Math.ceil(upper/step)*step);
  return {min,max,step};
}
function percentageBarAxis(spec) {
  if(spec.kind||spec.unit!=='%'||isTimelineSpec(spec)||spec.minY!=null||spec.maxY!=null)return null;
  const values=spec.series.flatMap(line=>line.values).filter(Number.isFinite);
  if(!values.length||values.some(value=>value<0||value>100))return null;
  const high=Math.max(...values),upper=Math.min(100,high?high*1.12:1),step=chartNiceStep(upper/5);
  return {min:0,max:Number(Math.min(100,Math.ceil(upper/step)*step).toPrecision(12)),step};
}
const chartStepPrecision=step=>(step?.toFixed(6).replace(/0+$/,'').split('.')[1]??'').length;
function trendAxisNote(axis,unit) {
  const format=value=>unit==='%'?`${value.toFixed(Math.max(1,chartStepPrecision(axis.step)))}%`:
    unit==='美元/人'?`$${value.toFixed(2)}/人`:
      unit==='美元'?`$${number(value)}`:`${number(value)}${unit}`;
  return `纵轴 ${format(axis.min)}–${format(axis.max)}${axis.min>0?'，为观察趋势采用非零起点':''}；精确值见数据表。`;
}
function waterfallLevels(spec) {
  let running=0;
  return spec.series[0].values.map((step,index)=>{
    running=index===0||index===spec.labels.length-1?step:running+step;
    return running;
  });
}
function evidenceTrendAxis(spec) {
  const axis=trendAxisDomain(spec.series,spec.unit);
  if(axis&&spec.metricId===51&&spec.series.length===1&&spec.unit==='%'){const values=spec.series[0].values.filter(Number.isFinite);if(values.length){const lo=Math.min(...values),hi=Math.max(...values),span=Math.max((hi-lo)*1.5,.02),step=chartNiceStep(span/4);return {min:Math.max(0,Number((Math.floor((lo+hi-span)/2/step)*step).toPrecision(12))),max:Math.min(100,Number((Math.ceil((lo+hi+span)/2/step)*step).toPrecision(12))),step};}}
  if(axis&&spec.metricId===53){axis.step=Math.max(1,Math.ceil(axis.step));axis.min=0;axis.max=Math.max(axis.step,Math.ceil(Math.max(...spec.series.flatMap(s=>s.values))/axis.step)*axis.step);}
  return axis;
}
function chartScaleNote(spec) {
  if(spec.kind==='waterfall') {
    const axis=trendAxisDomain([waterfallLevels(spec)],spec.unit);
    return `点表示期初/期末存量，柱表示各环节增减；${trendAxisNote(axis,spec.unit).replace('为观察趋势采用非零起点','局部范围展示流转')}`;
  }
  if(spec.kind==='periodComparison') {
    const axis=trendAxisDomain(spec.series,spec.unit);
    return axis?trendAxisNote(axis,spec.unit).replace('纵轴','横轴').replace('为观察趋势采用非零起点','点图使用局部范围比较两批次；不表示人数规模'):'';
  }
  const barAxis=percentageBarAxis(spec);
  if(barAxis)return `${trendAxisNote(barAxis,spec.unit)} 柱形从零比较；不同图的刻度上限可能不同。`;
  const axis=!spec.kind&&isTimelineSpec(spec)?evidenceTrendAxis(spec):null;
  return axis?`${trendAxisNote(axis,spec.unit)}${spec.labels.some(label=>/^W\d+$/.test(label))?` ${weeklyAxisNote}`:''}`:'';
}
function chartNote(spec) {
  return [spec.scopeNote??spec.note,chartScaleNote(spec)].filter(Boolean).join(' ');
}
function fitChartLegend(frame,instance) {
  const controls=frame.querySelector('.chart-legend');
  const padding=chartPresentations.get(instance)?.legendPadding?.()??Number(frame.dataset.legendPadding);
  if(controls?.offsetHeight)instance.setOption({animationDurationUpdate:chartAnimationDuration(200),
    grid:{bottom:controls.offsetHeight+chartText(padding)}});
}
function interactiveChartLegend(box,instance,lines,title,axisPadding=28) {
  let frame=box.parentElement;
  if(!frame)return;
  if(frame.classList.contains('chart-legend-frame'))frame.querySelector('.chart-legend')?.remove();
  if(lines.length<2)return;
  if(!frame.classList.contains('chart-legend-frame')) {
    frame=element('div','chart-legend-frame');box.before(frame);frame.append(box);
  }
  frame.dataset.legendPadding=String(axisPadding);
  const controls=element('div','chart-legend');controls.setAttribute('role','group');
  controls.setAttribute('aria-label',`${title}图例；选择显示或隐藏系列`);
  const buttons=lines.map((line,index)=>{
    const button=element('button','chart-legend-button');button.type='button';
    const mark=element('span','chart-legend-mark');mark.setAttribute('aria-hidden','true');
    mark.style.setProperty('--series-color',line.color);
    mark.dataset.pattern=line.pattern??['solid','dashed','dotted'][index%3];
    button.append(mark,element('span','',line.name));
    button.addEventListener('click',()=>instance.dispatchAction({type:'legendToggleSelect',name:line.name}));
    controls.append(button);return button;
  });
  const empty=element('p','chart-legend-empty','未选择系列；点击图例恢复显示。');empty.hidden=true;
  controls.append(empty);frame.append(controls);
  const label=(box.getAttribute('aria-label')??title).split('；当前显示：')[0];
  function update(announce=false) {
    const selected=instance.getOption().legend[0].selected??{},visible=[];
    lines.forEach((line,index)=>{
      const shown=selected[line.name]!==false;
      buttons[index].setAttribute('aria-pressed',String(shown));
      buttons[index].title=`${shown?'隐藏':'显示'}${line.name}；完整数据表保留全部系列`;
      if(shown)visible.push(line.name);
    });
    empty.hidden=visible.length>0;
    box.setAttribute('aria-label',`${label}；当前显示：${visible.join('、')||'无系列'}。完整数据表保留全部系列。`);
    fitChartLegend(frame,instance);
    if(announce)document.querySelector('#announcement').textContent=`${title}，当前显示：${visible.join('、')||'无系列'}。完整数据表保留全部系列。`;
  }
  instance.on('legendselectchanged',()=>update(true));update();
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
  if (chart) destroyChart(chart);
  chart=createChart(node);
  const weeks=dataset.weekly;
  const selected=comparison??homeComparisons().find(item=>item.id===focusId);
  const lines=[{id:13,name:'7日价值激活率（观鸟）',values:activation,color:'#b87021',pattern:'solid',details:weeklyRateDetails(13)},
    {id:18,name:'试用→转正率',values:conversion,color:'#356d51',pattern:'dashed',details:weeklyRateDetails(18)}].filter(item=>item.values&&(!selected||item.id===selected.id));
  const axis=trendAxisDomain([...lines.map(item=>item.values),...(selected?[[selected.beforeRate,selected.afterRate]]:[])],'%');
  setChartOption(chart,()=>({
    color:lines.map(item=>item.color),
    animationDuration:chartAnimationDuration(450),
    textStyle:{fontFamily:'DM Sans, PingFang SC, Microsoft YaHei, sans-serif'},
    tooltip:{...chartTooltipStyle(),trigger:'axis',formatter:params=>{
      const index=params[0]?.dataIndex;if(index===undefined)return '';
      return `${periodLabel(`W${weeks[index].week}`)}<br>${params.map(item=>{
        const line=lines.find(line=>line.name===item.seriesName),basis=Number.isFinite(item.value)?chartBasis(line?.details[index]):'';
        return `${item.marker}${item.seriesName}：${chartValue(item.value,'%')}${basis?`<br>${basis}`:''}`;
      }).join('<br>')}`;
    }},
    legend:{show:lines.length<2,selectedMode:lines.length>1,bottom:0,itemWidth:17,itemHeight:3,textStyle:{color:'#536758',fontSize:chartText(12)}},
    grid:{left:48,right:52,top:28,bottom:64},
    xAxis:{type:'category',boundaryGap:false,data:weeks.map(w=>`W${w.week}`),axisLine:{lineStyle:{color:'#bed0bf'}},axisTick:{show:false},
      axisLabel:{color:'#58695b',formatter:weeklyAxisLabel,rich:weeklyAxisText(),showMinLabel:true,showMaxLabel:true,hideOverlap:true}},
    yAxis:{type:'value',min:axis.min,max:axis.max,interval:axis.step,axisLabel:{formatter:value=>`${Number(value).toFixed(axis.step<.1?2:1)}%`,color:'#58695b'},splitLine:{lineStyle:{color:'#e7ede6'}},axisLine:{show:false}},
    series:lines.map(item=>({name:item.name,type:'line',smooth:false,symbolSize:6,
      symbol:item.id===18?'rect':'circle',lineStyle:{width:2.5,type:item.pattern},
      data:item.values.map(value=>Number.isFinite(value)?Number(value.toFixed(1)):null),
      endLabel:{show:true,formatter:params=>`${Number(params.value).toFixed(1)}%`,color:chartLabelColor(item.color),fontSize:chartText(12),fontWeight:600},
      ...(selected?{
        markLine:{silent:true,symbol:'none',lineStyle:{color:'#718777',type:'dashed',width:1.2},
          label:{formatter:`${selected.beforeLabel} ${selected.beforeRate.toFixed(1)}%`,position:'insideStartTop',color:'#4d6655',fontSize:chartText(12)},
          data:[{yAxis:selected.beforeRate}]},
        markArea:{silent:true,itemStyle:{color:selected.id===13?'rgba(184,112,33,.07)':'rgba(53,109,81,.07)'},
          label:{show:true,position:'insideTopRight',color:'#58695b',fontSize:chartText(12)},
          data:[[{name:selected.afterLabel.replace('合并率',''),xAxis:`W${weeks[selected.split].week}`},{xAxis:`W${weeks.at(-1).week}`}]]},
      }:{}),
    })),
  }));
  interactiveChartLegend(node,chart,lines,'激活与转正周度趋势',44);
  bindChartTableSelection(chart,document.querySelector('.trend-table-wrap table'),params=>
    `${periodLabel(`W${weeks[params.dataIndex].week}`)} · ${lines[params.seriesIndex].name} ${chartValue(params.value,'%')}`,
    {columnFor:params=>lines[params.seriesIndex].id===13?1:2});
}
const groupLabels={
  bird:'观鸟',hunting:'狩猎',free:'Free',noEntitlement:'无权益',trialEarly:'试用前期',trialNearExpiry:'试用临期',paidCurrent:'付费中',cancelledButEntitled:'已取消未到期',paymentFailed:'支付失败',expired:'已过期',
  registered:'累计注册',boundOwners:'绑定主账号',activatedCumulative:'累计激活设备',boundCurrent:'当前绑定设备',p50Minutes:'P50分钟',p90Minutes:'P90分钟',opening:'期初',trialPaid:'试用转正',directPaid:'直接首付',recovered:'恢复',lost:'退出',closing:'期末',DAU:'DAU',WAU:'WAU',MAU:'MAU',appMAU:'App MAU',sessionsPerUser:'人均次数',durationP50Minutes:'时长P50分钟',durationP90Minutes:'时长P90分钟',D1:'D1',D7:'D7',D30:'D30',D30Cohort:'30日观察批次',composite:'复合',app:'App主动',content:'内容',pushClicked:'推送点击',exclusiveCells:'互斥交叉单元',appOnly:'仅App',contentOnly:'仅内容',pushOnly:'仅推送',appContentOnly:'App+内容',appPushOnly:'App+推送',contentPushOnly:'内容+推送',allThree:'三者皆有',overlapAllowed:'来源可重叠',delivery:'送达',click:'点击',monthlySubscriptionPayers:'月内订阅付款主账号',monthlyPayers:'月内付款主账号',subscriptionNetIncome:'订阅净收入',ARPPU:'ARPPU',firstPurchase:'首购',repeatOrRenewal:'复购/续购',countryShare:'国家构成',appPlatformShare:'App平台构成',deviceModelShare:'设备型号构成',US:'美国',UK:'英国',DE:'德国',Other:'其他',K6:'K6',owners:'主账号',activeRate:'活跃率',subscriptionRate:'订阅率',activation7dRate:'7日激活率',Amazon:'Amazon',Shopify:'Shopify',declarationOnly:'仅用户自报',networkSuccess:'联网成功',reportedWithin24h:'24小时有上报',upload:'上传',live:'直播',push:'推送',combined:'触点合计',subscriptionPage:'订阅页',popup:'运营弹窗',anyExhausted:'任一权益用满',aiExhausted:'AI识别用满',storageExhausted:'存储用满',transferExhausted:'传输用满',upgrade:'套餐升级',downgrade:'套餐降级',recovery:'恢复订阅',durationP50Months:'订阅时长P50月',durationP90Months:'订阅时长P90月',anyPack:'任一Pack',byPack:'按Pack',boundActivated:'绑定且已激活',boundNotActivated:'绑定未激活',activatedUnbound:'已激活未绑定',sharedBoundActivated:'已激活且共享',sharedBoundNotActivated:'未激活且共享',cohort:'批次',unboundEvents:'解绑事件',observedUnboundDevices:'可观察解绑设备',unboundDeviceRate:'解绑设备率',reboundWithin7d:'7日回绑',reboundWithin30d:'30日回绑',eventLoss:'事件丢失',idMapping:'ID映射',status:'状态'};
const groupSummary={
  5:v=>`${Object.keys(v).map(key=>key==='bird'?'观鸟':'狩猎').join(' / ')}状态`,
  7:v=>`${number(v.registered)} / ${number(v.boundOwners)}`,
  8:v=>`${number(v.activatedCumulative)} / ${number(v.boundCurrent)}`,
  12:v=>`7日 ${accountRateText(v.D7)}`,
  14:v=>`P50 ${number(v.p50Minutes)}分钟`,
  20:v=>`页${percent(v.subscriptionPage.value)} / 弹窗${percent(v.popup.value)}`,
  21:v=>`净增 ${v.closing-v.opening>=0?'+':''}${number(v.closing-v.opening)}`,
  22:v=>`任一用满 ${percent(v.anyExhausted.value)}`,
  25:v=>`DAU ${number(v.DAU)}`,
  26:v=>`${sessionDepthNumber(v.sessionsPerUser,2)}${v.sessionsPerUser===null?'':'次 / 人'}`,
  28:v=>`D7 ${accountRateText(v.D7)}`,
  30:v=>`App ${number(v.app)} / 复合 ${number(v.composite)}`,
  31:v=>`送达 ${percent(v.delivery.value)}`,
  32:v=>`升级 ${percent(v.upgrade.value)}`,
  33:v=>`恢复 ${percent(v.recovery.value)}`,
  35:v=>`$${Number(v.ARPPU).toFixed(2)}`,
  36:v=>`任一Pack ${percent(v.anyPack.value)}`,
  37:v=>`首购 ${number(v.firstPurchase)}人 · 复购/续购 ${number(v.repeatOrRenewal)}人`,
  38:v=>`美国 ${percent(v.countryShare.US)}`,
  39:v=>{const [name,item]=Object.entries(v).sort((a,b)=>b[1].subscriptionRate-a[1].subscriptionRate)[0];return `${name} · ${percent(item.subscriptionRate)}`;},
  40:v=>{const names=Object.keys(v);return names.length===1?`${names[0]} ${number(v[names[0]].owners)}人`:`${names.length}个自报渠道样本`;},
  43:v=>`D7 ${percent(v.D7.value)}`,
  45:v=>`联网 ${percent(v.networkSuccess.value)}`,
  46:v=>{const [name,part]=Object.entries(v)[0];return `${groupLabels[name]??name} ${percent(part.value)}`;},
  50:v=>`绑定未激活 ${number(v.boundNotActivated)}台`,
  51:v=>`30日回绑 ${v.reboundWithin30d.kind==='rate'?percent(v.reboundWithin30d.value):v.reboundWithin30d.reason}`,
  54:v=>`${qualityPercent(v.eventLoss.value)} / ${qualityPercent(v.idMapping.value)}`,
};
function displayValue(id) {
  const value=metric(id);
  if(value.kind==='na') return value.availability==='pending'?'待补数据':'不适用';
  if(id===43)return ['D7','D30'].map(key=>`${key} ${deviceRetentionText(value.value[key])}`).join(' · ');
  if(value.kind==='group'&&JSON.stringify(value).includes('"kind":"na"')) return '不适用';
  return value.kind==='group' ? (groupSummary[id]?.(value.value) ?? '查看分组值') : formatMetric(id);
}
const metricCardLabels={2:'有效订阅主账号',4:'复合活跃主账号（MAU）',7:'累计注册用户',8:'累计首图激活设备',
    9:'周新增注册用户',10:'注册后72小时绑定率',11:'首次绑定成功率',13:'观鸟7日价值激活率',
    15:'绑定后未产首图设备',18:'成熟试用转正率',21:'有效订阅净增',25:'近1天复合活跃主账号',
    41:'近30天设备活跃率',44:'长期未使用设备率',29:'季节阈值未使用率',34:'付费权益主账号',35:'订阅ARPPU',48:'多设备主账号占比',
    49:'设备共享率',52:'流失高危主账号',53:'近24小时异常发现',54:'事件丢失率'};
const metricCountUnits={2:'人',4:'人',9:'人',15:'台',16:'台',34:'人',52:'人',53:'条'};
const metricSearchSubitems={
  11:['首次绑定失败原因','蓝牙配对','WiFi连接','App流程','绑定过程耗时'],
  7:['当前绑定主账号'],8:['当前绑定设备'],
  22:['Free权益用满主账号'],29:['季节阈值未使用主账号'],
  25:['DAU 日活 近1天','WAU 周活 近7天','MAU 月活 近30天','App DAU','App WAU','App MAU'],
  41:['日活设备','近24小时活跃设备','周活设备','月活设备','近30天设备活跃率'],44:['21天未使用设备','30天未使用设备','7天设备回流'],
  30:['复合活跃主账号','互斥活跃组合','App主动活跃','内容活跃','推送点击活跃'],
  35:['月内订阅付款主账号'],39:['型号订阅率最高','所选型号订阅率','同型号活跃率'],
  46:['关键功能最低成功率','上传成功率','直播成功率','推送成功率'],54:['ID映射覆盖率']
};
function metricSearchMatches(query) {
  const normalize=text=>String(text).normalize('NFKC').toLocaleLowerCase();
  const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
  return sourceData.catalog.filter(item=>pages[item.page]).flatMap(item=>{
    const original=`${item.id} #${String(item.id).padStart(2,'0')} ${item.name} ${pages[item.page].title} ${item.businessQuestion}`;
    const aliases=[metricCardLabels[item.id],...(metricSearchSubitems[item.id]??[])].filter(Boolean);
    const matches=text=>terms.every(term=>/^#\d+$/.test(term)?Number(term.slice(1))===item.id:normalize(text).includes(term));
    if(!matches(`${original} ${aliases.join(' ')}`))return [];
    const matchingAliases=aliases.filter(alias=>terms.some(term=>normalize(alias).includes(term)));
    return [{item,alias:terms.length&&!matches(original)?matchingAliases.join(' · '):''}];
  });
}
function metricCardSummary(id) {
  const value=metric(id),item=catalogItem(id);
  const summary={label:metricCardLabels[id]??item.name,text:displayValue(id),unit:'',context:'',fields:[]};
  if(id===27&&value.kind==='rate'){const p=featureUsageProjection();summary.label=optionLabel('functionType',p.functionType)+'使用率';summary.context='近30天使用人数／复合活跃人数；功能可重叠';return summary;}
  if(id===28&&value.kind==='group'){const p=userRetentionProjection();summary.text='D7 '+accountRateText(value.value.D7);summary.fields=['D1','D30'].map(d=>[d+'留存',`${accountRateText(value.value[d])} · ${value.value[d].numerator===null?'观察中':number(value.value[d].numerator)+' / '+number(value.value[d].denominator)+'人'}`]);summary.context=`${userRetentionTypeLabels[p.type]} · ${p.current.start}—${p.current.end}`;return summary;}
  if(id===51&&value.kind==='group'){const p=unbindingProjection();summary.context=`${p.month}解绑批次 · 截至${p.asOf.slice(0,10)}`;summary.fields=[['去重解绑',`${number(p.devices)}台／${number(p.events)}次事件`],['7日回绑',`${unbindingPercent(p.D7)} · ${unbindingBasis(p.D7)}`],['月初绑定',`${number(p.opening)}台`]];return summary;}
  if(id===43&&value.kind==='group'){const c=deviceRetentionCurrent();summary.context=`激活批次 ${c.start}—${c.end} · 同批次D7／D30`;return summary;}
  if(value.kind==='na'||value.kind==='group'&&JSON.stringify(value).includes('"kind":"na"'))return summary;
  if(value.kind==='count')summary.unit=metricCountUnits[id]??'';
  const contexts={3:'月化经常性收入，非本月实际收款',4:'最近30天复合活跃主账号去重',
    10:'已满72小时观察的新注册批次',13:'已满7日观察的观鸟注册批次',15:'绑定已超过3天，仍未产出首图',
    34:'当前有效付费权益，含订阅或增值Pack',48:'绑定2台及以上的主账号占比',49:'至少共享给1人的主账号绑定设备占比',
    52:'同源五层演示规则 · 主账号去重',53:'截至9/24 12:00 UTC；不代表受影响人数'};
  summary.context=contexts[id]??'';
  if(id===23){const part=renewalProjection();if(!part.reason)summary.context=`${part.month} · 到期后7天合成观察窗`;}
  if(id===24){const part=retentionProjection(),row=part.rows?.find(r=>r.observedMonth===part.month);if(row)summary.context=`${row.baseMonth} → ${row.observedMonth} · 完整自然月` ;}
  if(id===3)summary.unit='/月';
  if(value.kind==='group') {
    const v=value.value;
    if(id===7) {
      summary.text=number(v.registered);summary.unit='人';
      summary.fields=[['当前绑定主账号',`${number(v.boundOwners)}人 · ${v.registered>=30?percent(v.boundOwners/v.registered):v.registered?'样本不足30人':'无合格分母'}`]];
      const history=accountStockHistory();if(history.rows)summary.context=`变化较${Number(history.rows.at(-2).date.slice(5,7))}月末快照`;
    } else if(id===8) {
      summary.text=number(v.activatedCumulative);summary.unit='台';
      summary.fields=[['当前绑定设备',`${number(v.boundCurrent)}台`]];
      summary.context='累计激活与当前绑定是不同集合，不能直接相减';
    } else if(id===21) {
      const net=v.closing-v.opening;
      summary.text=`${net>=0?'+':''}${number(net)}`;summary.unit='人';
      summary.context=`${sourceData.subscriptionFlow.window} · 期末减期初`;
    } else if(id===25) {
      summary.text=number(v.DAU);summary.unit='人';
      summary.fields=[['近7天',`${number(v.WAU)}人`],['近30天',`${number(v.MAU)}人`]];
      summary.context='滚动1／7／30天；UTC零时截止，App子项见证据';
    } else if(id===26) {
      summary.text=sessionDepthNumber(v.sessionsPerUser,2);summary.unit=v.sessionsPerUser===null?'':'次/人';
      summary.fields=[['时长P50',v.durationP50Minutes===null?'时长样本不足':sessionDepthNumber(v.durationP50Minutes)+'分钟'],['时长P90',v.durationP90Minutes===null?'时长样本不足':sessionDepthNumber(v.durationP90Minutes)+'分钟']];summary.context='最近完整UTC日；前台会话，人数对齐App日活';
    } else if(id===35) {
      summary.unit='/人';summary.fields=[['月内订阅付款主账号',`${number(v.monthlySubscriptionPayers)}人`]];
      summary.context=`${metricHistory(id)?.labels.at(-1)??'完整月'} · 订阅净收入÷当月付款主账号`;
    } else if(id===30) {
      summary.label='复合活跃主账号';summary.text=number(v.composite);summary.unit='人';
      summary.fields=[['App主动活跃',`${number(v.app)}人`],['内容活跃',`${number(v.content)}人`],['推送点击活跃',`${number(v.pushClicked)}人`]];
      summary.context='三个来源可重叠，不能相加；七类互斥组合合计为复合活跃人数';
    } else if(id===39) {
      const entries=Object.entries(v).sort((a,b)=>b[1].subscriptionRate-a[1].subscriptionRate);
      const [name,part]=entries[0];
      summary.label=entries.length===1?'所选型号订阅率':'型号订阅率最高';
      summary.text=`${name} · ${percent(part.subscriptionRate)}`;
      summary.fields=[['主账号样本',`${number(part.owners)}人`],['同型号活跃率',percent(part.activeRate)]];
      summary.context='两项比率均以该型号主账号为分母';
    } else if(id===46) {
      const entries=Object.entries(v).sort((a,b)=>a[1].value-b[1].value);
      const [name,part]=entries[0];
      summary.label=entries.length===1?`${groupLabels[name]}成功率`:'关键功能最低成功率';
      summary.text=entries.length===1?percent(part.value):`${groupLabels[name]} · ${percent(part.value)}`;
      summary.fields=entries.slice(1).map(([key,rate])=>[`${groupLabels[key]}成功率`,percent(rate.value)]);
      summary.context=`${sourceData.technicalFacts.window} · 各链路独立计算`;
    } else if(id===54) {
      summary.text=qualityPercent(v.eventLoss.value);
      summary.fields=[['ID映射覆盖率',qualityPercent(v.idMapping.value)]];
      summary.context='最近完整UTC日 · 两类来源各自计算';
    }
  } else if(id===41&&value.kind==='rate') {
    summary.context='近30天有效行为 · 心跳不计活跃';
  } else if(id===44&&value.kind==='rate')summary.context=`连续${value.thresholdDays}天未使用；独立7天回流另列`;
  else if(id===29&&Number.isFinite(value.thresholdDays))summary.context=`连续${value.thresholdDays}天无复合活跃的主账号占比`;
  return summary;
}
function metricSecondaryValues(summary) {
  const list=element('dl','metric-secondary-values');
  summary.fields.forEach(([label,value])=>{
    const row=element('div','');row.append(element('dt','',label),element('dd','',value));list.append(row);
  });
  return list;
}
function actionBaselineValue(id) {
  if([9,10,12].includes(id)&&metric(id).kind!=='na')return registrationBaseline(id);
  if(id===17&&metric(17).kind==='rate')return trialOpeningBaseline();
  if(id===27&&metric(27).kind==='rate')return featureUsageBaseline();
  if(id===28&&metric(28).kind==='group')return userRetentionBaseline();
  if(id===52&&metric(52).kind==='count')return riskBaseline();
  if(id===51&&metric(51).kind==='group')return unbindingBaseline();
  if(id===54&&metric(54).kind==='group')return qualityBaseline();
  if(id===53&&metric(53).kind==='count')return anomalyBaseline();
  if(id===50&&metric(50).kind==='group'){const v=metric(50).value;return '设备状态计数：'+['boundActivated','boundNotActivated','activatedUnbound','sharedBoundActivated','sharedBoundNotActivated'].map(key=>`${groupLabels[key]} ${number(v[key])}台`).join('；');}
  if(id===26&&metric(26).kind==='group')return sessionDepthBaseline();
  if(id===7&&metric(7).kind==='group'){const v=metric(7).value;return `累计注册用户：${number(v.registered)}人；当前绑定主账号：${number(v.boundOwners)}人`;}
  if(id===5&&metric(5).kind==='group') {
    const value=metric(5).value;
    return '状态人数：'+['bird','hunting'].filter(key=>Object.hasOwn(value,key)).map(key=>{
      const p=value[key],fields=[...Object.keys(statusHistoryFields).filter(k=>Object.hasOwn(p,k)),...Object.keys(p).filter(k=>!Object.hasOwn(statusHistoryFields,k)).sort()];
      return `${groupLabels[key]}（合计${number(Object.values(p).reduce((a,b)=>a+b,0))}人）：${fields.map(field=>`${statusHistoryFields[field]??field}${number(p[field])}`).join('、')}`;
    }).join('；');
  }
  if(id===25&&metric(25).kind==='group'){const v=metric(25).value;return activityWindows.map(w=>`${w.name} 复合${number(v[w.composite])}人／App${number(v[w.app])}人；${activeWindowPeriod(w.days)}`).join('；');}
  if(id===23&&metric(23).kind==='rate'){const part=renewalProjection(),r=part.current;return `${part.month} 续订 ${percent(r.renewal.value)}（${number(r.renewed)}/${number(r.due)}人）；发生权益流失 ${number(r.lostDuring)}/${number(r.opening)}人；主动取消 ${number(r.cancelled)}/${number(r.opening)}人`;}
  if(id===38&&metric(38).kind==='group'){const source=structureMetricViews();if(source.views)return source.views.map(view=>`${view.label}（分母${number(view.denominator)}${view.unit}）：${view.rows.map(([name,n])=>`${name}${number(n)}${view.unit}/${percent(n/view.denominator)}`).join('、')}`).join('；');}
  if(id===43&&metric(43).kind==='group'){const c=deviceRetentionCurrent();return ['D7','D30'].map(key=>`${key} ${deviceRetentionText(c.measures[key])}${c.measures[key].numerator===null?'':`（${number(c.measures[key].numerator)} / ${number(c.denominator)}台）`}`).join('；')+`；激活批次 ${c.start}—${c.end}`;}
  if(id===24&&metric(24).kind==='rate') {const part=retentionProjection(),row=part.rows.find(r=>r.observedMonth===part.month);
    return `${percent(row.value)}（${number(row.numerator)} / ${number(row.denominator)}人；${row.baseMonth} → ${row.observedMonth}）`;}
  const summary=metricCardSummary(id);
  if(!summary.fields.length)return `${summary.text}${summary.unit}`;
  const parts=[`${summary.label}：${summary.text}${summary.unit}`,
    ...summary.fields.map(([label,value])=>`${label}：${value}`)];
  if(id===35) {
    const income=metric(id).value.subscriptionNetIncome;
    if(Number.isFinite(income))parts.push(`订阅净收入：$${number(income)}`);
  }
  return parts.join('；');
}
function groupValueUnit(key) {
  return /(?:Rate|Share)$/.test(key)?'%':key==='ARPPU'?'美元/人':key==='subscriptionNetIncome'?'美元':'';
}
function groupText(value,key='',unit=groupValueUnit(key)) {
  if (typeof value==='boolean') return value?'是':'否';
  if (typeof value==='number') {
    if (unit==='%') return percent(value);
    if (unit==='美元/人') return `$${Number(value).toFixed(2)}/人`;
    if (unit==='美元') return `$${number(value)}`;
    return number(value);
  }
  if (typeof value==='string') return value;
  if (value?.kind==='na') return `不适用（${value.reason}）`;
  if (value?.kind==='rate') return `${percent(value.value)}（${number(value.numerator)} / ${number(value.denominator)}）`;
  if (value && typeof value==='object') return Object.entries(value).map(([field,item])=>`${groupLabels[field]??field}：${groupText(item,field,unit||groupValueUnit(field))}`).join('；');
  return '—';
}
function updateScrollableTables() {
  document.querySelectorAll('.data-table-scroll').forEach(wrap=>{
    const overflowing=wrap.clientWidth>0&&wrap.scrollWidth>wrap.clientWidth+1;
    wrap.toggleAttribute('data-scrollable',overflowing);
    const hint=wrap.querySelector('.table-scroll-hint');
    if(overflowing) {
      wrap.tabIndex=0;wrap.setAttribute('role','region');
      wrap.setAttribute('aria-label',`${wrap.querySelector('caption')?.textContent??'数据表'}，可横向滚动`);
      if(!hint)wrap.insertBefore(element('p','table-scroll-hint','左右滚动查看完整列；键盘聚焦后可用左右方向键。'),wrap.querySelector('table'));
    } else {
      wrap.removeAttribute('tabindex');wrap.removeAttribute('role');wrap.removeAttribute('aria-label');hint?.remove();
    }
  });
}
function deviceContextTable(spec) {
  const value=id=>{const part=metric(id);return part.kind==='rate'?[part.numerator,part.denominator,percent(part.value)]:['—','—',part.availability==='pending'?'待补数据':'不适用'];};
  return {...spec,rows:spec.rows.map(row=>{
    if(row[0]==='近30天活跃设备')return [row[0],...value(41)];
    if(row[0]==='21天未使用设备')return [`${metric(44).thresholdDays??(filterState.season==='Other'?30:21)}天未使用设备`,...value(44)];
    if(row[0]==='独立21天未使用入组后7天回流') {
      const part=deviceReturnSummary();return part.reason?['独立7天回流','—','—','待补数据']:
        [`独立${part.thresholdDays}天未使用入组后7天回流`,part.numerator,part.denominator,
          part.denominator>=30?percent(part.numerator/part.denominator):part.denominator?'样本不足':'无历史入组设备'];
    }
    return row;
  })};
}
function dataTable(spec, extraClass='') {
  const wrap=element('div',`data-table-scroll ${extraClass}`);
  const table=element('table','diagnostic-table');
  table.append(element('caption','',spec.title));
  const thead=element('thead',''); const heading=element('tr','');
  spec.columns.forEach(label=>{const cell=element('th','',label);cell.scope='col';heading.append(cell);});
  thead.append(heading); table.append(thead);
  const tbody=element('tbody','');
  spec.rows.forEach(row=>{
    const tr=element('tr','');
    if(spec.selectedPeriod&&row[0]===spec.selectedPeriod){tr.setAttribute('aria-current','date');tr.dataset.observedMonth=row[0];}
    row.forEach((cell,index)=>{const node=element(index===0?'th':'td','',typeof cell==='number'?number(cell):String(cell));
      if(index===0)node.scope='row';tr.append(node);});
    tbody.append(tr);
  });
  table.append(tbody); wrap.append(table);
  if (spec.note) wrap.append(element('p','table-note',spec.note));
  return wrap;
}
function chartValue(value,unit) {
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return '无值';
  const numeric=Number(value);
  if(unit==='次/人')return `${numeric.toFixed(2)}次/人`;
  if(unit==='%')return `${numeric.toFixed(1)}%`;
  if(unit==='个百分点')return `${Math.abs(numeric)<.005?'':numeric>0?'+':'−'}${Math.abs(numeric).toFixed(2)} 个百分点`;
  if(unit==='美元/人')return `$${numeric.toFixed(2)}/人`;
  if(unit==='美元')return `$${number(numeric)}`;
  return `${number(numeric)}${unit??''}`;
}
const chartLabelColor=color=>({'#bf762b':'#97541c','#b87021':'#97541c','#7593a0':'#496876','#e5484d':'#b82d37'})[color]??color;
const chartTooltipStyle=()=>({confine:true,enterable:true,className:'chart-tooltip',transitionDuration:chartMotionPreference?.matches?0:.4,backgroundColor:'#fffefa',borderColor:'#cddbc7',
  textStyle:{fontFamily:'DM Sans, PingFang SC, Microsoft YaHei, sans-serif',fontSize:chartText(13),lineHeight:chartText(20),color:'#263d2e'}});
function chartPointDetail(spec,line,index) {
  if(!['%','美元/人'].includes(spec.unit)&&!spec.structureComposition)return null;
  return line.details?.[index]??(spec.series.length===1?spec.details?.[index]:null);
}
function chartBasis(detail) {
  if(!detail||!Number.isFinite(detail.numerator)||!Number.isFinite(detail.denominator)||detail.denominator<=0)return '';
  return `${detail.basisLabel??'分子 / 分母'}：${detail.estimated?'约 ':''}${number(detail.numerator)}${detail.numeratorUnit??''} / ${number(detail.denominator)}${detail.denominatorUnit??''}`;
}
function diagnosticChartFacts(page,spec) {
  const info=sourceData.diagnostics[page];
  if(page==='G'&&spec.title===info.extraCharts?.[0]?.title){const h=qualityHistory();return h?{...h,title:'事件丢失率 · 30个完整UTC日',metricId:54,series:[{name:h.title,values:h.values,details:h.details}]}:{...spec,series:[],unavailableReason:qualityProjection().reason};}
  if(page==='G'&&spec.title===info.chart.title){const p=anomalyProjection();return p.reason?{...spec,series:[],unavailableReason:p.reason}:{...spec,title:'最新24小时异常发现 · 领域',labels:['新客','订阅','设备','数据质量'],series:[{name:'异常发现',values:['新客','订阅','设备','数据质量'].map(k=>p.current.events.filter(e=>e.domain===k).length)}],note:anomalyNote};}
  if(page==='F'&&spec.metricId===50){const part=deviceStateProjection();return part.reason?{...spec,unavailableReason:part.reason,series:[]}:{...spec,series:[{...spec.series[0],values:[part.value.boundActivated,part.value.boundNotActivated,part.value.activatedUnbound]}],note:deviceStateTable(part).note};}
  if(page==='E'&&spec.kind==='heatmap'&&metric(39).kind==='group')
    spec={...spec,...modelSubscriptionHeatmap(),title:spec.title};
  let details;
  if(spec.title===info.chart.title) {
    if(page==='A')details=[10,12,13].map(id=>sourceData.weekly.map(week=>{
      const raw=weeklyMetric(id,week),rate=id===12?raw.value.D7:raw;
      return {...rate,numeratorUnit:'人',denominatorUnit:'人'};
    }));
    if(page==='C') {
      details=['all','k6Firmware28','others'].map(group=>sourceData.weekly.map(week=>({
        ...deviceEventMetric({},week.week,group),numeratorUnit:'次',denominatorUnit:'次'})));
      spec={...spec,series:spec.series.map((line,index)=>({...line,values:details[index].map(value=>value.value*100)}))};
    }
    if(page==='D')details=[weeklyRateDetails(18)];
  } else if(page==='E'&&spec.kind==='stacked100'&&spec.title===info.extraCharts?.[1]?.title) {
    const part=paidRightsComposition();
    if(part.reason)return {...spec,series:[],unavailableReason:part.reason};
    details=part.counts.map(numerator=>[{numerator,denominator:part.parent.total,numeratorUnit:'人',denominatorUnit:'人'}]);
    spec={...spec,series:spec.series.map((line,i)=>({...line,values:[part.counts[i]/part.parent.total*100]})),
      note:`${sourceData.snapshot.asOf} 同范围有效权益；人数 ${part.counts.map(number).join(' / ')}，三类互斥，合计 ${number(part.parent.total)} 人。`};
  } else if(page==='D'&&spec.title===info.extraCharts?.[0]?.title)details=[sourceData.weekly.map(week=>({
    numerator:week.trialMaturity.plusMonthlyAndroid.paymentFailed,denominator:week.trialMaturity.plusMonthlyAndroid.paymentAttempts,
    numeratorUnit:'人',denominatorUnit:'人'}))];
  if(!details)return spec;
  return {...spec,series:spec.series.map((line,index)=>({...line,details:details[index]}))};
}
function chartTable(spec) {
  const rows=spec.labels.map((label,index)=>[periodLabel(label),...spec.series.map(line=>{
    const value=line.values[index];
    if(value===null||value===undefined||!Number.isFinite(Number(value)))return line.details?.[index]?.reason??spec.details?.[index]?.reason??'不适用';
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
    columns=spec.sampleSizes?['型号','主账号（人）','活跃（人）','订阅（人）',...spec.dimensions]:['型号',...spec.dimensions];
    rows.splice(0,rows.length,...spec.labels.map((label,index)=>
      [label,...(spec.sampleSizes?[spec.sampleSizes[index],
        ...spec.series[0].values[index].map((value,column)=>spec.sampleCounts?.[index]?.[column]??
          Math.round(spec.sampleSizes[index]*value/100))]:[]),
        ...spec.series[0].values[index].map(value=>`${Number(value).toFixed(1)}%`)]));
  }
  if(spec.kind==='waterfall') {
    columns=['流转环节','存量 / 人数变化','累计有效订阅'];
    const levels=waterfallLevels(spec);
    rows.splice(0,rows.length,...spec.labels.map((label,index)=>{
      const step=spec.series[0].values[index];
      return [label,index===0||index===spec.labels.length-1?number(step):`${step>=0?'+':''}${number(step)}`,number(levels[index])];
    }));
  }
  const details=element('details','chart-data');
  const table=dataTable({title:spec.title,columns,rows});
  if(!spec.kind||spec.kind==='stacked100'||spec.kind==='periodComparison')spec.labels.forEach((_,index)=>{
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
function stackedChartPoint(instance,spec,params) {
  const event=params.event?.event;
  if(!Number.isFinite(event?.clientX)||!Number.isFinite(event?.clientY))return params;
  const rect=instance.getDom().getBoundingClientRect();
  const pixel=[(event.clientX-rect.left)*instance.getWidth()/rect.width,
    (event.clientY-rect.top)*instance.getHeight()/rect.height];
  if(!instance.containPixel({gridIndex:0},pixel))return null;
  // SVG click offsetX can round differently from pointer movement in WebKit.
  // Use the actual viewport position and exact shares, without widening a band.
  const [value,index]=instance.convertFromPixel({gridIndex:0},pixel);
  if(!Number.isInteger(index)||!spec.labels[index])return null;
  let end=0;
  const seriesIndex=spec.series.findIndex(line=>{
    const start=end;end+=line.values[index]??0;
    return value>=start&&value<end;
  });
  return seriesIndex<0?null:{...params,dataIndex:index,seriesIndex,value:spec.series[seriesIndex].values[index]};
}
function bindChartTableSelection(instance,table,describe,{indexFor=params=>params.dataIndex,columnFor,resolvePoint=params=>params,
  disclosure=table?.closest('details')}={}) {
  if(!instance||!table)return;
  const details=disclosure,anchor=details??table.closest('.data-table-scroll')??table;
  const previous=anchor.previousElementSibling;
  const feedback=previous?.matches('.chart-selection')?previous:element('p','chart-selection');
  feedback.setAttribute('aria-live','polite');if(feedback!==previous)anchor.before(feedback);
  const clear=()=>{
    table.querySelectorAll('.chart-selected,.chart-selected-cell').forEach(node=>node.classList.remove('chart-selected','chart-selected-cell'));
    feedback.textContent='';
  };
  clear();instance.on('legendselectchanged',clear);
  const select=params=>{
    params=resolvePoint(params);if(!params)return;
    const index=indexFor(params);
    if(!Number.isInteger(index))return;
    const row=table.querySelectorAll('tbody tr')[index];
    if(!row)return;
    instance.dispatchAction({type:'hideTip'});
    clear();if(details)details.open=true;
    row.classList.add('chart-selected');
    const column=columnFor?.(params);if(Number.isInteger(column))row.children[column]?.classList.add('chart-selected-cell');
    feedback.textContent=`图中临时选中：${describe(params)}。${details?'已展开':'已标亮'}对应数据行；全局筛选保持不变。`;
    requestAnimationFrame(()=>{if(row.isConnected&&row.classList.contains('chart-selected'))row.scrollIntoView({block:'nearest'});});
  };
  instance.on('click',select);return select;
}
function drawEvidenceChart(box,spec,legendSelection) {
  evidenceChartSpecs.set(box,spec);
  if(box.classList.contains('chart-render-error'))return;
  const panel=box.closest('.detail-chart-panel,.evidence-pair,.home-contribution');
  const details=panel?.querySelector(':scope > .chart-data,:scope > .workspace-calculation,:scope > .home-contribution-actions > .chart-data');
  const description=box.getAttribute('aria-label')??spec.title;
  try {
    const existing=window.echarts?.getInstanceByDom(box);
    if(existing) {
      legendSelection={...existing.getOption().legend?.[0]?.selected};
      refreshChartTypography(existing);
      existing.resize();
      if(box.parentElement.classList.contains('chart-legend-frame'))fitChartLegend(box.parentElement,existing);
      return;
    }
    const instance=drawDetailChart(box,spec);
    if(instance&&legendSelection)for(const [name,selected] of Object.entries(legendSelection))
      if((instance.getOption().legend?.[0]?.selected?.[name]!==false)!==selected)
        instance.dispatchAction({type:'legendToggleSelect',name});
    if(instance&&spec.structureComposition){bindChartTableSelection(instance,box.closest('.structure-panel')?.querySelector('table'),params=>spec.labels[params.dataIndex],{disclosure:null});return;}
    if(!instance||!details||spec.kind==='deviceRetentionHeatmap')return;
    const indexFor=params=>spec.kind==='heatmap'?params.value?.[1]:params.dataIndex;
    const select=bindChartTableSelection(instance,details.querySelector('table'),params=>{
      const index=indexFor(params);
      const dimension=spec.kind==='heatmap'?spec.dimensions[params.value?.[0]]:
        spec.kind==='stacked100'?spec.series[params.seriesIndex].name:null;
      spec.onPoint?.(index);
      return `${spec.labels[index]}${dimension?` · ${dimension}`:''}`;
    },{indexFor,resolvePoint:params=>spec.kind==='stacked100'?stackedChartPoint(instance,spec,params):params});
    if(spec.nearestLinePoint&&select)instance.getZr().on('click',event=>{
      const pixel=[event.offsetX,event.offsetY];if(!instance.containPixel({gridIndex:0},pixel))return;
      const coordinate=instance.convertFromPixel({seriesIndex:0},pixel),index=Math.round(coordinate[0]);
      const value=spec.series[0].values[index];if(!Number.isFinite(value))return;
      const point=instance.convertToPixel({seriesIndex:0},[index,value]);
      if(Math.hypot(point[0]-pixel[0],point[1]-pixel[1])>Math.max(8,chartText(4)))return;
      const selected=instance.getOption().legend?.[0]?.selected;
      if(selected?.[spec.series[0].name]===false)return;
      select({dataIndex:index,seriesIndex:0,value,seriesName:spec.series[0].name});
    });
  } catch(error) {
    console.error(`证据图表绘制失败：${spec.title}`,error);
    const frame=box.parentElement,restoreFocus=box.contains(document.activeElement)||
      frame.classList.contains('chart-legend-frame')&&frame.contains(document.activeElement);
    const failed=window.echarts?.getInstanceByDom(box);
    if(failed&&!failed.isDisposed()) {
      try {destroyChart(failed);}catch(cleanupError){console.error('清理失败的证据图表时出错',cleanupError);}
      const index=detailCharts.indexOf(failed);if(index>=0)detailCharts.splice(index,1);
    }
    if(box.parentElement.classList.contains('chart-legend-frame'))box.parentElement.querySelector('.chart-legend')?.remove();
    box.classList.add('chart-fallback','chart-render-error');
    box.setAttribute('role','group');box.setAttribute('aria-label',`${spec.title}图表状态`);
    const message=element('p','',details?'图表暂时无法显示，完整数据表仍可查看。':'图表暂时无法显示，可切换至完整数据核对。');
    message.setAttribute('role','status');
    const actions=element('div','chart-error-actions');
    const retry=element('button','filter-reset','重试图表');retry.type='button';retry.setAttribute('aria-label',`重试${spec.title}图表`);
    retry.addEventListener('click',()=>{
      box.classList.remove('chart-render-error');box.setAttribute('aria-label',description);
      drawEvidenceChart(box,spec,legendSelection);
      const restored=window.echarts?.getInstanceByDom(box);
      const recovered=!!restored&&!restored.isDisposed()&&!!box.querySelector('svg')&&!box.classList.contains('chart-render-error');
      if(!recovered&&box.querySelector('button'))box.querySelector('button').focus({preventScroll:true});
      else {box.tabIndex=-1;box.focus({preventScroll:true});}
      document.querySelector('#announcement').textContent=!recovered?
        `${spec.title}仍无法显示，完整数据可继续核对。`:`${spec.title}图表已恢复。`;
    });
    actions.append(retry);
    if(details) {
      const data=element('button','filter-reset','查看数据表');data.type='button';data.setAttribute('aria-label',`查看${spec.title}完整数据表`);
      data.addEventListener('click',()=>{details.open=true;details.querySelector('summary').focus();updateScrollableTables();});actions.append(data);
    }
    box.replaceChildren(message,actions);
    if(restoreFocus)retry.focus({preventScroll:true});
  }
}
function structureMetricViews() {
  const views=sourceData.diagnostics?.E?.structureViews,shares=sourceData.metrics.m38;
  const invalid=()=>({reason:'用户与设备结构的人数、分母或占比待核验；不从比例反推人数。'});
  const expected=[['countryShare','人',sourceData.metrics.m07?.value?.registered,['US','UK','DE','Other'].map(key=>[key,optionLabel('country',key)])],
    ['appPlatformShare','人',sourceData.metrics.m07?.value?.registered,['iOS','Android'].map(key=>[key,key])],
    ['deviceModelShare','台',sourceData.metrics.m08?.value?.boundCurrent,['K6','Bird Lite','Bird Pro','Hunt Pro'].map(key=>[key,key])]];
  if(shares?.kind!=='group'||!Array.isArray(views)||views.length!==3||Object.keys(shares.value??{}).length!==3)return invalid();
  for(const [index,[field,unit,total,keys]] of expected.entries()) {
    const view=views[index],values=shares.value[field];
    if(!view||typeof view.label!=='string'||!view.label||typeof view.note!=='string'||!view.note||view.unit!==unit||!Number.isSafeInteger(total)||total<=0||view.denominator!==total||
      !Array.isArray(view.rows)||view.rows.length!==keys.length||!values||Object.keys(values).length!==keys.length)return invalid();
    for(const [i,[key,label]] of keys.entries()) {
      const row=view.rows[i];if(!Array.isArray(row)||row.length!==2||row[0]!==label||!Number.isSafeInteger(row[1])||row[1]<0||
        !Number.isFinite(values[key])||values[key]<0||values[key]>1||Math.abs(values[key]-row[1]/total)>1e-10)return invalid();
    }
    if(view.rows.reduce((sum,row)=>sum+row[1],0)!==total)return invalid();
  }
  return {views};
}
function structureMetricTable() {
  const source=structureMetricViews();if(source.reason)return {title:'用户与设备结构 · 待核验',columns:['状态'],rows:[[source.reason]]};
  return {title:'用户与设备结构 · 三类对象完整验算',columns:['统计对象','分组','数量','同口径分母','占比'],
    rows:source.views.flatMap(view=>view.rows.map(([label,n])=>[view.label,label,`${number(n)}${view.unit}`,`${number(view.denominator)}${view.unit}`,percent(n/view.denominator)])),
    note:`${sourceData.snapshot.asOf} 总体演示快照。国家与App平台按全部注册用户，型号按当前绑定设备；三套分母不相加，不等于付费人群。当前没有12个月结构历史，不生成趋势。`};
}
function structureMetricContext(view,panel) {
  if(!panel)return;
  const ordered=[...view.rows].sort((a,b)=>b[1]-a[1]),[name,n]=ordered[0];
  panel.querySelector('.inspector-value').textContent=`${view.label.split(' / ')[0]} · ${name} ${percent(n/view.denominator)}`;
  let context=panel.querySelector('.structure-current-view');
  if(!context){context=element('p','inspector-source structure-current-view');panel.querySelector('.finding-summary-status')?.after(context);if(!context.isConnected)panel.querySelector('.inspector-value').after(context);}
  context.textContent=`当前查看：${view.label}；最大分组为${name}。分母 ${number(view.denominator)}${view.unit}。${view.note}仅当前快照，无12个月历史；切换视图不改变问题单或旧基线。`;
}
function structureExplorer(views,{idPrefix='structure',onSelect}={}) {
  const section=element('section','structure-explorer');
  section.append(element('h3','','用户与设备构成 · 切换统计对象'));
  const tabs=element('div','structure-tabs');tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','用户与设备构成维度');
  const panel=element('div','structure-panel');panel.id=`${idPrefix}-panel`;panel.setAttribute('role','tabpanel');
  const buttons=views.map((view,index)=>{
    const button=element('button','structure-tab',view.label.split(' / ')[0]);
    button.type='button';button.id=`${idPrefix}-tab-${index}`;
    button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);
    tabs.append(button);return button;
  });
  section.append(tabs,panel);
  function select(index) {
    section.dataset.initialized='true';
    buttons.forEach((button,i)=>{
      button.setAttribute('aria-selected',String(i===index));
      button.tabIndex=i===index?0:-1;
    });
    const view=views[index];panel.setAttribute('aria-labelledby',buttons[index].id);
    const previousBox=panel.querySelector('.detail-chart'),currentChart=previousBox&&window.echarts?.getInstanceByDom(previousBox);
    if (currentChart) {
      destroyChart(currentChart);
      const position=detailCharts.indexOf(currentChart);
      if (position>=0) detailCharts.splice(position,1);
    }
    const spec=seriesForStructure(view);
    const box=element('div','detail-chart');box.setAttribute('role','img');
    box.setAttribute('aria-label',`${view.label}；${view.note}；完整数值见下方表格`);
    const rows=view.rows.map(([label,value])=>[label,value,percent(value/view.denominator)]);
    panel.replaceChildren(element('p','table-note',`${view.label} · 分母 ${number(view.denominator)}${view.unit}。${view.note}`),
      box,dataTable({title:view.label,columns:['分组',`数量（${view.unit}）`,'占比'],rows}));
    drawEvidenceChart(box,spec);
    onSelect?.(view,index);updateScrollableTables();
  }
  buttons.forEach((button,index)=>{
    button.addEventListener('click',()=>select(index));
    button.addEventListener('keydown',event=>{
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const target=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length;
      buttons[target].focus();select(target);
    });
  });
  return {node:section,init:()=>select(0)};
}
function seriesForStructure(view) {
  return {title:view.label,unit:view.unit,structureComposition:true,labels:view.rows.map(row=>row[0]),
    series:[{name:'数量',values:view.rows.map(row=>row[1]),details:view.rows.map(([,n])=>({numerator:n,denominator:view.denominator,numeratorUnit:view.unit,denominatorUnit:view.unit,basisLabel:`占比 ${percent(n/view.denominator)} · 分组 / 总体`}))}],note:view.note};
}
function categoryAxisLayout(box,spec,left,right) {
  const scale=chartTextScale(),font=`${chartText(12)}px DM Sans, PingFang SC, Microsoft YaHei, sans-serif`;
  const bounds=(spec.categoryLabels??spec.labels).map(label=>window.echarts.format.getTextRect(String(label),font));
  const width=Math.max(0,...bounds.map(rect=>rect.width));
  const height=Math.max(chartText(12),...bounds.map(rect=>rect.height));
  const slot=(box.clientWidth-chartText(left+right))/Math.max(1,spec.labels.length);
  const rotate=spec.labelRotation??(width+chartText(12)<=slot?0:18);
  const radians=Math.abs(rotate)*Math.PI/180;
  const padding=Math.max(36,Math.ceil((width*Math.sin(radians)+height*Math.cos(radians))/scale+20));
  return {rotate,padding};
}
function drawDetailChart(box,spec) {
  if (!window.echarts) {
    box.classList.add('detail-chart','chart-fallback'); box.removeAttribute('role');
    box.textContent='图表未加载；下方保留完整数据表。'; return undefined;
  }
  const instance=createChart(box);
  detailCharts.push(instance);
  if(box.parentElement?.classList.contains('chart-legend-frame'))box.parentElement.querySelector('.chart-legend')?.remove();
  const isTimeline=isTimelineSpec(spec);
  if(spec.kind==='deviceRetentionHeatmap'){drawDeviceRetentionHeatmap(instance,box,spec);return instance;}
  const colors=['#bf762b','#356d51','#7593a0'];
  if(spec.kind==='groupContribution') {
    setChartOption(instance,()=>{
      const values=spec.series[0].values.map(value=>Math.abs(value)<1e-10?0:value);
      const extent=Math.max(...values.map(Math.abs),.1),step=chartNiceStep(extent/4);
      const min=Math.floor((Math.min(0,...values)-extent*.22)/step)*step;
      const max=Math.ceil((Math.max(0,...values)+extent*.22)/step)*step;
      const left=142,right=38;
      const available=box.clientWidth-chartText(left+right);
      const label=value=>`${value<0?'−':value>0?'+':''}${Math.abs(value).toFixed(2)}`;
      return {animationDuration:chartAnimationDuration(350),
        grid:{left,right,top:4,bottom:25},
        xAxis:{type:'value',min,max,interval:step,
          axisLabel:{color:'#58695b',formatter:value=>`${value<0?'−':''}${Math.abs(value).toFixed(step<.1?2:1)}`},
          splitLine:{lineStyle:{color:'#e7ede6'}},axisLine:{show:false},axisTick:{show:false}},
        yAxis:{type:'category',inverse:true,data:spec.labels,
          axisLabel:{color:'#405a48',formatter:value=>value.replace(' Android ',' Android\n'),lineHeight:chartText(16)},axisLine:{show:false},axisTick:{show:false}},
        tooltip:{...chartTooltipStyle(),trigger:'item',formatter:params=>{
          const index=params.dataIndex,group=spec.parts.groups[index];
          return `${group.name}：${chartValue(values[index],'个百分点')}<br>${group.summaries.map((part,i)=>`${i?spec.comparison.afterLabel:spec.comparison.beforeLabel}：${number(part.numerator)} / ${number(spec.parts.overall[i].denominator)}`).join('<br>')}<br>分母为同期总体成熟试用人数`;
        }},
        series:[{name:'变化贡献',type:'bar',barMaxWidth:chartText(20),
          data:values.map(value=>{
            const inside=Math.abs(value)/(max-min)*available>chartText(58);
            return {value,itemStyle:{color:value<0?'#ad551f':value>0?'#356d51':'#718078'},
              label:{show:true,position:value<0?(inside?'insideLeft':'left'):(inside?'insideRight':'right'),
                distance:chartText(6),color:inside?'#fffefa':'#405a48',fontWeight:600,fontSize:chartText(12),formatter:label(value)}};
          })},
          {name:'零贡献',type:'scatter',symbolSize:chartText(6),itemStyle:{color:'#718078'},
            data:values.map((value,index)=>value===0?[0,index]:[null,index])}],
      };
    },{responsive:true});
    return instance;
  }
  if(spec.kind==='periodComparison') {
    const line=spec.series[0],axis=trendAxisDomain(spec.series,spec.unit);
    setChartOption(instance,()=>({animationDuration:chartAnimationDuration(350),
      grid:{left:184,right:62,top:35,bottom:42},
      xAxis:{type:'value',min:axis?.min,max:axis?.max,interval:axis?.step,
        axisLabel:{color:'#58695b',formatter:value=>chartValue(value,spec.unit)},
        splitLine:{lineStyle:{color:'#e7ede6'}},axisLine:{show:false},axisTick:{show:false}},
      yAxis:{type:'category',inverse:true,data:spec.labels,
        axisLabel:{color:'#506455',fontSize:chartText(12)},axisLine:{show:false},axisTick:{show:false}},
      tooltip:{...chartTooltipStyle(),trigger:'item',formatter:params=>{
        const index=params.dataIndex,basis=chartBasis(chartPointDetail(spec,line,index));
        return `${spec.labels[index]}：${chartValue(line.values[index],spec.unit)}${basis?`<br>${basis}`:''}`;
      }},
      series:[{name:line.name,type:'scatter',symbolSize:12,
        data:line.values.map((value,index)=>Number.isFinite(value)?{value:[value,index],
          itemStyle:{color:index?'#356d51':'#fffefa',borderColor:index?'#356d51':'#506e5b',borderWidth:2,opacity:1}}:{value:[null,index]}),
        label:{show:true,position:'right',distance:9,formatter:params=>chartValue(params.value[0],spec.unit),
          color:'#315540',fontSize:chartText(12),fontWeight:600}}],
    }));
    return instance;
  }
  if(spec.kind==='waterfall') {
    const v=spec.flow,levels=waterfallLevels(spec),axis=trendAxisDomain([levels],spec.unit);
    setChartOption(instance,()=>({animationDuration:chartAnimationDuration(350),
      tooltip:{...chartTooltipStyle(),trigger:'axis',axisPointer:{type:'shadow'},formatter:params=>{
        const index=params[0]?.dataIndex;
        if(index===undefined)return '';
        const stock=index===0||index===5,step=spec.series[0].values[index];
        return `${spec.labels[index]}：${stock?'':step>=0?'+':''}${number(step)} 人${stock?'':`<br>流转后有效订阅：${number(levels[index])} 人`}`;
      }},
      grid:{left:65,right:22,top:38,bottom:44},
      xAxis:{type:'category',data:spec.labels,axisLabel:{color:'#506455',interval:0},axisTick:{show:false}},
      yAxis:{type:'value',min:axis.min,max:axis.max,interval:axis.step,axisLabel:{color:'#58695b',formatter:value=>number(value)},splitLine:{lineStyle:{color:'#e7ede6'}}},
      series:[
        {type:'bar',stack:'flow',silent:true,itemStyle:{color:'transparent'},data:[0,levels[0],levels[1],levels[2],levels[4],0]},
        {type:'bar',stack:'flow',barMaxWidth:50,itemStyle:{color:'#356d51'},data:[0,v.trialPaid,v.directPaid,v.recovered,0,0],
          label:{show:true,position:'top',color:'#315540',fontSize:chartText(12),fontWeight:600,
            formatter:params=>params.dataIndex>=1&&params.dataIndex<=3?`${params.value>0?'+':''}${number(params.value)}`:''}},
        {type:'bar',stack:'flow',barMaxWidth:50,itemStyle:{color:'#c16952'},data:[0,0,0,0,v.lost,0],
          label:{show:true,position:'bottom',color:'#913e2b',fontSize:chartText(12),fontWeight:600,
            formatter:params=>params.dataIndex===4?`${params.value>0?'−':''}${number(params.value)}`:''}},
        {type:'scatter',symbolSize:12,itemStyle:{color:'#234f37'},
          data:levels.map((value,index)=>[index,index===0||index===5?value:null]),
          label:{show:true,position:'top',distance:8,color:'#315540',fontSize:chartText(12),fontWeight:600,
            formatter:params=>number(params.value[1])},
          markLine:{silent:true,symbol:'none',label:{show:false},lineStyle:{color:'#98ac9a',type:'dashed',width:1},
            data:levels.slice(0,-1).map((value,index)=>[{coord:[index,value]},{coord:[index+1,value]}])}},
      ],
    }));
    return instance;
  }
  if (spec.kind==='boxplot') {
    setChartOption(instance,()=>({
      animationDuration:chartAnimationDuration(350),
      tooltip:{...chartTooltipStyle(),trigger:'item',formatter:params=>{
        const [minimum,q1,median,q3,maximum]=params.data;
        return `${spec.title}<br>最小 ${number(minimum)} · Q1 ${number(q1)} · P50 ${number(median)} · Q3 ${number(q3)} · 最大 ${number(maximum)} 分钟`;
      }},
      grid:{left:58,right:35,top:38,bottom:48},
      xAxis:{type:'category',data:spec.labels,axisLabel:{color:'#506455'},axisTick:{show:false}},
      yAxis:{type:'value',min:0,max:2600,name:'分钟',nameTextStyle:{color:'#506455'},axisLabel:{color:'#58695b'},splitLine:{lineStyle:{color:'#e7ede6'}}},
      series:[{name:'时长分位',type:'boxplot',data:spec.series[0].values,
        itemStyle:{color:'#f1c38a',borderColor:'#a76222',borderWidth:2},
        markLine:{silent:true,symbol:'none',lineStyle:{type:'dashed',width:1.5,color:'#356d51'},
          label:{formatter:params=>params.name,position:'insideEndTop',color:'#315540'},
          data:[{name:'P50 170分钟',yAxis:170},{name:`P90 ${number(spec.p90)}分钟`,yAxis:spec.p90}]}}],
    }));
    return instance;
  }
  if (spec.kind==='heatmap') {
    const cells=spec.series[0].values.flatMap((row,y)=>row.map((value,x)=>({
      value:[x,y,value],label:{color:value>=90?'#fffefa':'#000'},
    })));
    setChartOption(instance,()=>({
      animationDuration:chartAnimationDuration(350),
      tooltip:{...chartTooltipStyle(),formatter:params=>{
        const index=params.value[1],owners=spec.sampleSizes?.[index];
        const numerator=spec.sampleCounts?.[index]?.[params.value[0]];
        return `${spec.labels[index]} · ${spec.dimensions[params.value[0]]}：${Number(params.value[2]).toFixed(1)}%${owners?
          `<br>${Number.isFinite(numerator)?`${params.value[0]===0?'30天活跃':'有效订阅'}主账号 ${number(numerator)} 人 / `:''}该型号主账号 ${number(owners)} 人`:''}`;
      }},
      grid:{left:spec.sortBy==='owners-desc'?112:86,right:38,top:26,bottom:88},
      xAxis:{type:'category',data:spec.dimensions,axisLabel:{color:'#506455'},axisTick:{show:false}},
      yAxis:{type:'category',inverse:spec.sortBy==='owners-desc',data:spec.labels,
        axisLabel:{color:'#506455',interval:spec.sortBy==='owners-desc'?0:'auto',lineHeight:chartText(15),
          formatter:spec.sortBy==='owners-desc'?((value,index)=>`${value}\n${number(spec.sampleSizes[index])}人`):undefined},axisTick:{show:false}},
      visualMap:{min:0,max:100,calculable:false,orient:'horizontal',left:'center',bottom:2,
        text:['100%','0%'],textStyle:{color:'#506455'},inRange:{color:['#eaf2e7','#a9caa9','#356d51']}},
      series:[{type:'heatmap',data:cells,label:{show:true,formatter:params=>`${Number(params.value[2]).toFixed(1)}%`,fontWeight:600},
        itemStyle:{borderColor:'#fffefa',borderWidth:4}}],
    }));
    return instance;
  }
  if (spec.kind==='stacked100') {
    setChartOption(instance,()=>({
      animationDuration:chartAnimationDuration(350),color:colors,
      tooltip:{...chartTooltipStyle(),trigger:'axis',axisPointer:{type:'shadow'},formatter:params=>{
        const index=params[0]?.dataIndex;if(index===undefined)return '';
        return `${spec.labels[index]}<br>${params.map(item=>{
          const basis=chartBasis(chartPointDetail(spec,spec.series[item.seriesIndex],index));
          return `${item.marker}${item.seriesName}：${chartValue(item.value,'%')}${basis?`<br>${basis}`:''}`;
        }).join('<br>')}`;
      }},
      legend:{bottom:0,itemWidth:12,selectedMode:false,textStyle:{fontSize:chartText(12),color:'#506455'}},
      grid:{left:115,right:24,top:22,bottom:spec.chronologicalRows?90:55},
      xAxis:{type:'value',min:0,max:100,axisLabel:{formatter:'{value}%',color:'#58695b'},splitLine:{lineStyle:{color:'#e7ede6'}}},
      yAxis:{type:'category',inverse:!!spec.chronologicalRows,data:spec.labels,axisLabel:{color:'#506455',interval:spec.chronologicalRows?0:'auto'},axisTick:{show:false}},
    series:spec.series.map((line,index)=>({name:line.name,type:'bar',stack:'total',barWidth:spec.chronologicalRows?chartText(18):38,
        data:line.values,itemStyle:{color:line.color??colors[index%colors.length]},
        label:{show:!!spec.showPercentLabels,position:'inside',color:line.labelColor??'#263d2e',fontSize:chartText(12),
          formatter:params=>Number.isFinite(params.value)&&params.value>=8?`${params.value.toFixed(1)}%`:''}})),
    }));
    return instance;
  }
  const plotted=spec.series.flatMap(line=>line.values).filter(value=>Number.isFinite(value));
  const span=plotted.length?Math.max(...plotted)-Math.min(...plotted):0;
  const trendAxis=isTimeline?evidenceTrendAxis(spec):null;
  const barAxis=percentageBarAxis(spec);
  const weeklyAxis=isTimeline&&spec.labels.some(label=>/^W\d+$/.test(label));
  const nameInEndLabel=spec.series.length>1&&box.clientWidth>=480;
  const evidenceValue=value=>spec.metricId===51&&spec.series.length===1&&spec.unit==='%'&&Number.isFinite(value)?`${value.toFixed(2)}%`:chartValue(value,spec.unit);
  const endText=(line,value)=>`${nameInEndLabel?`${line.name} `:''}${evidenceValue(value)}`;
  const endWidth=Math.max(0,...spec.series.map(line=>[...endText(line,line.values.at(-1))].reduce((sum,char)=>sum+(char.charCodeAt(0)>255?12:6.8),0)));
  const rightReserve=isTimeline?Math.max(52,Math.min(Math.ceil(endWidth+24),box.clientWidth*.32)):18;
  const timelineLabelInterval=index=>{
    const spacing=chartText(Math.max(weeklyAxis?62:42,...spec.labels.map(label=>String(label).length*7+18)));
    const slots=Math.min(spec.labels.length,Math.max(2,Math.floor((box.clientWidth-leftReserve-rightReserve)/spacing)+1));
    return Array.from({length:slots},(_,slot)=>Math.round(slot*(spec.labels.length-1)/Math.max(1,slots-1))).includes(index);
  };
  const axisValue=value=>{
    if(spec.unit==='%') {
      const step=barAxis?.step??trendAxis?.step;
      const precision=Math.max(span<5?1:0,chartStepPrecision(step));
      return `${Number(value).toFixed(precision)}%`;
    }
    if(spec.unit==='个百分点')return `${Number(value).toFixed(Math.max(1,chartStepPrecision(spec.intervalY)))}pp`;
    if(spec.unit==='美元/人')return `$${Number(value).toFixed(span<1?2:1)}`;
    if(spec.unit==='美元')return spec.intervalY?`$${number(value)}`:
      value>=1000?`$${(value/1000).toFixed(span<1000?2:1)}k`:`$${number(Math.round(value))}`;
    if(spec.unit==='次/人')return Number(value).toFixed(Math.max(2,chartStepPrecision(trendAxis?.step??.01)));
    if(['分钟','小时'].includes(spec.unit))return Number(value).toFixed(chartStepPrecision(trendAxis?.step??barAxis?.step??1));
    if(value>=1000)return `${(value/1000).toFixed(span<500?2:span<2000?1:0)}k`;
    return number(Math.round(value));
  };
  const percentageLabels=spec.unit==='%'?[...plotted,trendAxis?.min??barAxis?.min??spec.minY??0,trendAxis?.max??barAxis?.max??spec.maxY??100].map(axisValue):[];
  // Measure the same base font used by SVG labels; shared typography scales this gutter with the text.
  const percentageReserve=percentageLabels.length?Math.ceil(Math.max(...percentageLabels.map(label=>window.echarts.format.getTextRect(label,'12px "DM Sans", "PingFang SC", "Microsoft YaHei", sans-serif').width)))+12:46;
  const leftReserve=spec.unit==='%'?Math.max(46,percentageReserve):['美元','个百分点'].includes(spec.unit)?70:spec.unit==='人'||spec.unit==='台'?62:46;
  const categoryLayout=()=>categoryAxisLayout(box,spec,leftReserve,rightReserve);
  setChartOption(instance,()=>{
    const category=isTimeline?null:categoryLayout();
    return {
      animationDuration:chartAnimationDuration(350),
      color:colors,
      textStyle:{fontFamily:'DM Sans, PingFang SC, Microsoft YaHei, sans-serif'},
      tooltip:{...chartTooltipStyle(),trigger:'axis',formatter:params=>{
        const index=params[0]?.dataIndex;
        if(index===undefined)return '';
        const lines=[periodLabel(spec.labels[index]),...params.map(item=>{
          const line=spec.series[item.seriesIndex],basis=Number.isFinite(item.value)?chartBasis(chartPointDetail(spec,line,index)):'';
          return `${item.marker}${item.seriesName}：${evidenceValue(item.value)}${basis?`<br>${basis}`:''}`;
        })];
        return lines.join('<br>');
      }},
      legend:{show:false},
      grid:{left:leftReserve,right:rightReserve,top:28,bottom:isTimeline?(spec.series.length>1?55:32)+(weeklyAxis?16:0):category.padding},
      xAxis:{type:'category',data:spec.labels,axisLabel:{color:'#58695b',
        ...(weeklyAxis?{formatter:weeklyAxisLabel,rich:weeklyAxisText()}:spec.categoryLabels?{formatter:(_,index)=>spec.categoryLabels[index]}:{}),
        interval:isTimeline?timelineLabelInterval:0,
        showMinLabel:true,showMaxLabel:true,hideOverlap:true,rotate:category?.rotate??0,fontSize:chartText(12)},
        axisTick:{show:false},axisLine:{lineStyle:{color:'#bed0bf'}}},
      yAxis:{type:'value',min:trendAxis?.min??barAxis?.min??spec.minY??0,max:trendAxis?.max??barAxis?.max??spec.maxY??(spec.unit==='%'?100:undefined),
        ...(trendAxis||barAxis?{interval:(trendAxis??barAxis).step}:spec.intervalY?{interval:spec.intervalY}:['人','台','条','次'].includes(spec.unit)?{minInterval:1}:{}),
        axisLabel:{color:'#58695b',formatter:axisValue},splitLine:{lineStyle:{color:'#e7ede6'}}},
      series:spec.series.map((line,index)=>({name:line.name,type:isTimeline?'line':'bar',
        data:spec.unit==='个百分点'||spec.signedContribution?line.values.map(value=>{
          const adverse=spec.adverseWhenHigh?value>0:value<0;
          return {value,label:{position:value<0?'bottom':'top',color:value===0?'#58695b':adverse?'#97541c':'#315e41'},
            itemStyle:{color:value===0?'#718078':adverse?'#bc6a20':'#356d51'}};
        }):line.values,smooth:false,symbolSize:6,
        markLine:index===0&&spec.selectedPeriod?{silent:true,symbol:'none',label:{show:false},lineStyle:{type:'dashed',color:'#718777'},data:[{xAxis:spec.selectedPeriod}]}:undefined,
        barMaxWidth:52,symbol:['circle','rect','triangle'][index%3],
        lineStyle:{width:2.5,type:['solid','dashed','dotted'][index%3]},itemStyle:{color:line.color??colors[index%colors.length]},
        endLabel:{show:isTimeline&&(Number.isFinite(line.values.at(-1))||spec.endLastValid&&line.values.some(Number.isFinite)),formatter:params=>endText(line,params.value),
          color:chartLabelColor(line.color??colors[index%colors.length]),fontSize:chartText(12),fontWeight:600,width:chartText(rightReserve-12),overflow:'truncate'},
        label:{show:!isTimeline&&spec.series.length===1&&spec.labels.length<=8,position:'top',formatter:params=>chartValue(params.value,spec.unit),
          fontSize:chartText(12),fontWeight:600,color:'#365a43'},
        labelLayout:{hideOverlap:true,moveOverlap:'shiftY'},
      })),
    };
  },{responsive:!isTimeline,legendPadding:isTimeline?null:()=>categoryLayout().padding});
  interactiveChartLegend(box,instance,spec.series.map((line,index)=>({...line,color:line.color??colors[index%colors.length],
    pattern:isTimeline?['solid','dashed','dotted'][index%3]:'bar'})),spec.title,isTimeline?28+(weeklyAxis?16:0):categoryLayout().padding);
  return instance;
}
function flattenMeasure(value,path='',rows=[],field='',unit=groupValueUnit(field)) {
  if(value?.kind==='na') {rows.push([path||'结果','—','—',`${value.availability==='pending'?'待补数据':'不适用'}：${value.reason}`]);return rows;}
  if(value?.kind==='rate') {rows.push([path||'结果',number(value.numerator),number(value.denominator),percent(value.value)]);return rows;}
  if(value?.kind==='count'||value?.kind==='usd') {rows.push([path||'结果',value.kind==='usd'?`$${number(value.value)}`:number(value.value),'—','—']);return rows;}
  if(value&&typeof value==='object') {
    for(const [key,part] of Object.entries(value)) flattenMeasure(part,path?`${path} / ${groupLabels[key]??key}`:(groupLabels[key]??key),rows,key,unit||groupValueUnit(key));
    return rows;
  }
  const formatted=groupText(value,field,unit),isResult=unit==='%'||unit==='美元/人'||typeof value!=='number';
  rows.push([path||'结果',isResult?'—':formatted,'—',isResult?formatted:'—']);return rows;
}
function compactMetricValueTable(spec) {
  if(!spec.rows.length)return spec;
  const keep=spec.columns.map((_,index)=>index).filter(index=>index===0||spec.rows.some(row=>row[index]!=='—'));
  const columns=keep.map(index=>index===1&&!keep.includes(2)&&spec.columns[index]==='分子 / 数量'?'数值':spec.columns[index]);
  const partialRatios=spec.rows.some(row=>row[1]==='—'&&row[2]==='—'&&/%$/.test(row[3]));
  return {...spec,columns,rows:spec.rows.map(row=>keep.map(index=>row[index])),
    note:`${spec.note}${partialRatios?' 仅有结果的比例项未提供同口径分子、分母明细。':''}`};
}
function bindingDeviceList(code) {
  const section=element('section','binding-device-list');section.dataset.evidenceKind='data';
  section.append(element('h3','','待核查设备清单'));
  const result=bindingDeviceRows();if(!result.rows){section.append(element('p','na-note',result.reason));return section;}
  const all=[...result.rows].sort((a,b)=>a.boundMs-b.boundMs||a.id.localeCompare(b.id));
  section.append(element('p','table-note',`${sourceData.snapshot.asOf} 00:00 UTC · 当前计算范围 ${number(all.length)} 台。合成设备台账；绑定已超过72小时，且截至快照仍无首图。`));
  const tools=element('div','binding-list-controls'),label=element('label','','查找设备');
  const search=element('input','');search.type='search';search.placeholder='设备编号、型号或App版本';search.setAttribute('aria-label','查找清单中的设备');label.append(search);
  const bandLabel=element('label','','等待分层（仅清单）'),band=element('select','');
  band.setAttribute('aria-label','等待分层（仅清单）');
  for(const text of ['全部','超过3天、未满7天','7–13天','14天及以上']){const option=element('option','',text);option.value=text;band.append(option);}
  bandLabel.append(band);tools.append(label,bandLabel);section.append(tools);
  const status=element('p','binding-list-status');status.setAttribute('role','status');
  const tableBox=element('div','binding-list-table'),pagination=element('div','binding-list-pagination');
  const previous=element('button','','上一页'),next=element('button','','下一页');previous.type=next.type='button';
  const pageText=element('span','');pageText.setAttribute('aria-live','polite');pagination.append(previous,pageText,next);
  section.append(status,tableBox,pagination,element('p','table-note','搜索、等待分层和翻页只改变清单，不改变上方指标总数。等待分层是演示处理优先级，不是预测风险；源处理状态不随本地问题单自动改变。'));
  let page=0,selected=null;const pageSize=10;
  const render=()=>{
    const query=search.value.trim().toLocaleLowerCase('zh-CN');
    const rows=all.filter(row=>(band.value==='全部'||bindingWaitBand(row,result.at)===band.value)&&
      [row.id,row.deviceModel,row.appVersion].some(value=>value.toLocaleLowerCase('zh-CN').includes(query)));
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
    if(selected&&!rows.some(row=>row.id===selected)) {selected=null;section.dispatchEvent(new CustomEvent('binding-device-select',{bubbles:true,detail:null}));}
    status.textContent=`当前范围 ${number(all.length)} 台 · 匹配 ${number(rows.length)} 台`;
    pageText.textContent=`第 ${page+1} / ${pages} 页`;previous.disabled=page===0;next.disabled=page===pages-1;
    const visible=rows.slice(page*pageSize,(page+1)*pageSize);
    const table=dataTable({title:'设备名单 · 等待时间较长者优先',columns:['设备编号','设备型号','绑定日期（UTC）','等待天数','App版本','等待分层','源处理状态'],
      rows:visible.map(row=>[row.id,row.deviceModel,row.boundAt.slice(0,10),bindingWaitDays(row,result.at),row.appVersion,bindingWaitBand(row,result.at),row.handlingStatus])});
    if(!rows.length)table.append(element('p','na-note','没有匹配设备；请核对清单搜索条件，不能据此将当前范围总数记为0。'));
    table.querySelectorAll('tbody tr').forEach((tr,index)=>{
      const row=visible[index],cell=tr.firstElementChild,button=element('button','binding-device-link',row.id);button.type='button';
      button.setAttribute('aria-label',`查看设备 ${row.id} 详情`);button.setAttribute('aria-controls',`${code}-workspace-device`);
      button.setAttribute('aria-pressed',String(selected===row.id));tr.classList.toggle('binding-device-selected',selected===row.id);
      button.addEventListener('click',()=>{
        selected=row.id;
        table.querySelectorAll('tbody tr').forEach(line=>{const active=line===tr;line.classList.toggle('binding-device-selected',active);line.querySelector('button').setAttribute('aria-pressed',String(active));});
        section.dispatchEvent(new CustomEvent('binding-device-select',{bubbles:true,detail:{record:row,trigger:button}}));
        document.querySelector('#announcement').textContent=`已选择设备 ${row.id}，右侧设备详情已更新；问题单保持不变。`;
      });cell.replaceChildren(button);
    });
    tableBox.replaceChildren(table);requestAnimationFrame(updateScrollableTables);
  };
  search.addEventListener('input',()=>{page=0;render();});band.addEventListener('change',()=>{page=0;render();});
  previous.addEventListener('click',()=>{page--;render();restoreListPaginationFocus(pagination,-1);});next.addEventListener('click',()=>{page++;render();restoreListPaginationFocus(pagination,1);});render();return section;
}
function bindingDeviceDetail(row,onLink,onBack) {
  const box=element('div','binding-device-detail-content');
  const back=element('button','binding-device-back','返回设备清单');back.type='button';back.addEventListener('click',onBack);
  box.append(back,element('span','insight-tag','合成设备记录'),element('h3','',row.id));
  const facts=element('dl','inspector-facts');
  for(const [name,value] of [['国家/市场',optionLabel('country',row.country)],['产品线',optionLabel('productLine',row.productLine)],['设备型号',row.deviceModel],
    ['绑定时间（UTC）',row.boundAt.replace('T',' ').replace('Z','')],['等待天数',`${bindingWaitDays(row)}天`],['App版本',row.appVersion],
    ['等待分层',bindingWaitBand(row)],['源处理状态',`${row.handlingStatus}（演示）`],['源负责人',row.owner]]) {
    const line=element('div','');line.append(element('dt','',name),element('dd','',value));facts.append(line);
  }
  const button=element('button','issue-register','将编号填入#15关联样本');button.type='button';
  const feedback=element('p','table-note');feedback.setAttribute('role','status');button.addEventListener('click',()=>{feedback.textContent=onLink(row);});
  box.append(facts,element('p','table-note','截至快照仍无首图。该记录不代表已确认故障，等待分层不是预测模型；填写问题单不会自动更新设备源处理状态。'),button,feedback);return box;
}
const onboardingViews=new Map();
function onboardingDurationEvidence(id) {
  const part=onboardingSummary(id),node=element('section','onboarding-duration');node.dataset.evidenceKind='change';
  if(part.reason){node.append(element('p','na-note',part.reason));return {node,specs:[]};}
  const unit=id===11?'次':'人',timeUnit=id===11?'分钟':'小时',scale=id===11?60:3600;
  node.append(element('h3','',`${id===11?'成功绑定':'价值激活'}耗时 · W${part.cohort.week}`));
  const stats=element('dl','onboarding-stats');
  for(const [label,text] of [['成功／合格分母',`${number(part.numerator)} / ${number(part.denominator)} ${unit}`],['P50',onboardingDuration(part.p50Seconds,id)],['P90',onboardingDuration(part.p90Seconds,id)]]) {
    const cell=element('div','');cell.append(element('dt','',label),element('dd','',text));stats.append(cell);
  }
  node.append(stats,element('p','table-note onboarding-window',`批次 ${part.cohort.cohortStart}—${part.cohort.cohortEnd}；观察截至 ${part.cohort.observedThrough}（UTC）。`),element('p','table-note',`${id===11?'开始首次有效绑定尝试 → 绑定成功':'注册 → 首次识别鸟种或完成直播（取更早者，严格小于7天）'}。仅成功者进入耗时分布，失败／未达成不填0或7天；分位数不是置信区间。`));
  const weekly=sourceData.weekly.map(w=>({week:w.week,...onboardingSummary(id,filterState,w.week)}));
  const trend={title:`成功者耗时 · 12周P50／P90`,unit:timeUnit,labels:weekly.map(w=>`W${w.week}`),
    series:[{name:'P50',values:weekly.map(w=>w.p50Seconds===null||w.reason?null:w.p50Seconds/scale)},
      {name:'P90',values:weekly.map(w=>w.p90Seconds===null||w.reason?null:w.p90Seconds/scale)}],
    note:`同一筛选的完整批次，单位：${timeUnit}。频数合并后使用R7线性分位数，不平均分组P50／P90；成功样本不足30显示断点。`};
  const bounds=id===11?[60,180,600,1800,Infinity]:[3600,21600,86400,259200,604800];
  const bins=bounds.map((upper,i)=>part.frequency.filter(([seconds])=>seconds<=upper&&seconds>(i?bounds[i-1]:-1)).reduce((n,[,count])=>n+count,0));
  const distribution={title:`W${part.cohort.week} · 成功者耗时分布`,unit,labels:id===11?['≤1分钟','1–3分钟','3–10分钟','10–30分钟','>30分钟']:['≤1小时','1–6小时','6–24小时','1–3天','3–7天'],
    series:[{name:id===11?'成功尝试':'已达成主账号',values:bins}],
    note:`区间左开右闭，首段含0；激活仍严格小于7天。各柱合计 ${number(part.numerator)} ${unit}成功样本，不能替代以 ${number(part.denominator)} ${unit}为分母的成功率。合成频数，不是实测日志。`};
  const tablist=element('div','onboarding-tabs');tablist.setAttribute('role','tablist');tablist.setAttribute('aria-label',`#${id}成功者耗时图示`);
  node.append(tablist);const specs=[],views=[],buttons=[];
  for(const [i,spec] of [trend,distribution].entries()) {
    const key=i?'distribution':'trend',button=element('button','',i?'耗时分布':'耗时趋势');button.type='button';button.id=`onboarding-${id}-${key}-tab`;
    button.setAttribute('role','tab');button.setAttribute('aria-controls',`onboarding-${id}-${key}`);tablist.append(button);buttons.push(button);
    const panel=element('section','detail-chart-panel onboarding-plot');panel.id=`onboarding-${id}-${key}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
    panel.append(element('h3','',spec.title));
    const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',spec.title);panel.append(box);
    const note=chartScaleNote(spec);if(note)panel.append(element('p','chart-scale-note',note));panel.append(element('p','table-note',spec.note));
    const details=element('details','chart-data');details.append(element('summary','','查看耗时完整数据表'));
    details.append(dataTable(i?{title:spec.title,columns:['耗时区间',`成功样本（${unit}）`,`全部成功（${unit}）`,'占成功样本'],
      rows:bins.map((n,j)=>[spec.labels[j],n,part.numerator,part.numerator>=30?percent(n/part.numerator):'成功样本不足30'])}:
      {title:spec.title,columns:['完整批次',`成功／合格分母（${unit}）`,'P50','P90'],rows:weekly.map(w=>[
        periodLabel(`W${w.week}`),w.reason?'待核验':`${number(w.numerator)} / ${number(w.denominator)}`,
        w.reason?'待核验':onboardingDuration(w.p50Seconds,id),w.reason?'待核验':onboardingDuration(w.p90Seconds,id)])}));
    panel.append(details);node.append(panel);views.push(panel);specs.push([box,spec]);
  }
  const activate=index=>{
    onboardingViews.set(id,index?'distribution':'trend');
    buttons.forEach((b,i)=>{b.setAttribute('aria-selected',String(index===i));b.tabIndex=index===i?0:-1;views[i].hidden=index!==i;});
    if(node.isConnected)requestAnimationFrame(()=>{if(views[index].getClientRects().length){drawEvidenceChart(...specs[index]);updateScrollableTables();}});
  };
  buttons.forEach((button,i)=>button.addEventListener('click',()=>activate(i)));
  tablist.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const current=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?1:1-current;
    buttons[next].focus();activate(next);
  });
  activate(onboardingViews.get(id)==='distribution'?1:0);return {node,specs};
}
function onboardingGroupTables(id) {
  const part=onboardingSummary(id);if(part.reason)return [];
  return (id===11?['appVersion','deviceModel']:['deviceModel','country']).map(key=>{
    const labels=[...new Set(part.rows.map(row=>row[key]))];
    const table=dataTable({title:`${key==='appVersion'?'App版本':filterLabels[key]} · 同范围成功率与耗时`,
      columns:[key==='appVersion'?'App版本':filterLabels[key],`成功／分母（${id===11?'次':'人'}）`,'成功率','P50','P90'],
      rows:labels.map(label=>{const a=onboardingAggregate(part.rows.filter(row=>row[key]===label));return [optionLabels[label]??label,
        `${number(a.numerator)} / ${number(a.denominator)}`,a.denominator>=30?percent(a.numerator/a.denominator):'样本不足30',onboardingDuration(a.p50Seconds,id),onboardingDuration(a.p90Seconds,id)];}),
      note:`W${part.cohort.week} · 保留当前全部适用筛选，各行互斥，计数合计回到同范围总体；分位数不能相加或平均。${id===11?'Demo版本为合成标签，版本／型号差异不作因果判断。':'型号为预设合成归属；真实接入须保留未激活者，不能用后验设备关系筛掉分母；型号差异不作因果判断。'}`},'onboarding-group-table');
    table.dataset.evidenceKind='groups';return table;
  });
}
function bindingFailureEvidence() {
  const part=onboardingSummary(11);if(part.reason)return {reason:part.reason};
  const failed=part.denominator-part.numerator,ordered=Object.entries(part.failureCounts).sort((a,b)=>b[1]-a[1]);
  if(ordered.reduce((sum,[,n])=>sum+n,0)!==failed)return {reason:'失败原因与失败总数不闭合，待核对。'};
  const scope=`${periodLabel(`W${part.cohort.week}`)}；总尝试 ${number(part.denominator)} 次，成功 ${number(part.numerator)} 次，失败 ${number(failed)} 次。`;
  const note='同一合成首次绑定频数；每次失败仅归一个原因，比例以失败尝试为分母，不是全部绑定尝试或设备人数。分类不等于已验证故障根因。';
  const share=n=>failed>=30?percent(n/failed):failed?'样本不足（少于30次）':'无失败尝试';
  return {spec:{title:`首次绑定失败原因 · W${part.cohort.week}`,unit:'次',labels:ordered.map(([cause])=>cause),scopeNote:scope,note,
    series:[{name:'失败尝试',values:ordered.map(([,n])=>n)}]},table:{title:'首次绑定失败原因 · 次数与占比',
      columns:['失败原因','失败次数（次）','全部失败尝试（次）','占失败尝试','建议核对'],
      rows:[...ordered.map(([cause,n])=>[cause,n,failed,share(n),sourceData.diagnostics.A.tables.find(t=>t.title==='首次绑定失败原因 · W12')?.rows.find(r=>r[0]===cause)?.[3]??'核对绑定日志']),['合计',failed,failed,share(failed),'总尝试−成功尝试']],note:scope+note}};
}

function metricEvidence(id,page) {
  const item=catalogItem(id),contract=contractFor(id),value=metric(id);
  const panel=element('section','detail-section metric-evidence');panel.id=`metric-evidence-${id}`;
  panel.append(sectionTitle('04  /  METRIC EVIDENCE',`#${String(id).padStart(2,'0')} ${item.name} · 数据核对`,
    value.kind==='na'?(value.availability==='pending'?'缺少同范围数据':'当前范围不适用'):id===17?'同注册批次 · 7天开启计数':[9,10,12].includes(id)?'同源合成注册批次 · 12周':id===28?'12批次同源合成新客留存':id===27?'同源功能／通知频数 · 84日':id===52?'同源合成账号 · 12期风险快照':id===51?'12月同源合成解绑台账':id===54?'30个完整UTC日 · 独立质量计数':id===53?'30窗同源异常事件 · ID去重':id===26?'完整UTC日 · 同源合成会话频数':id===7?'国家×App同源合成账号存量':[4,25,30].includes(id)?'同源活跃窗口频数 · 84日':id===23?'月度同源合成频数 · 人数重算':id===43?'同源合成激活批次 · 设备频数':id===24?'合成月度留存分组 · 人数重算':[11,13].includes(id)?'同源合成频数 · 成功率与耗时':id===16?'独立合成首次内容设备 · 12个完整周':id===15?'合成设备台账 · 逐台计数':[41,44].includes(id)?'合成行为间隔事实 · 同群重算':id===18?'合成试用明细 · 逐条聚合':id===42?'周×型号×固件合成触发汇总':id===46?technicalRequestSource(id):selectedFilters().length?'当前筛选的模拟分片':'当前底表模拟值'));
  const dimensions=(id===18?[...trialFactDimensions]:policyFor(id).demonstrableDimensions)
    .filter(key=>relevantFilters(page).includes(key));
  const observed=[11,13,18].includes(id)?cohortObservation(id):null;
  const evidenceWindow=id===17?trialOpeningWindow():id===16?activationDeviceWindow():id===52?riskWindow():id===51?unbindingWindow():observed&&!observed.reason?`W${observed.week} · ${observed.start}—${observed.end}；观察截至 ${observed.observedThrough}（UTC）`:contract.window;
  const intro=element('p','evidence-meta',`统计对象：${metricEntityLabel(contract.entity)} · 窗口：${evidenceWindow} · 本指标可演示筛选：${dimensions.map(key=>filterLabels[key]).join('、')||'无'}。`);
  if(id===52)intro.append(element('span','metric-filter-scope risk-source-coverage',value.kind==='na'?'风险来源不可用，不生成名单或导出。':riskSourceCoverage));
  panel.append(intro);
  if(id===52)panel.append(riskControl(page));
  if(id===51)panel.append(unbindingControl());
  if(id===23)panel.append(renewalControl());
  if(id===24)panel.append(retentionControl());
  if(id===16)panel.append(activationDeviceControl());
  if(id===43)panel.append(deviceRetentionControl());
  if(id===28)panel.append(userRetentionControl());
  const filterContext=metricFilterContext(id);
  if(selectedFilters().length)intro.append(element('span','metric-filter-scope',
    `${filterContext.applied.length?`本项应用：${filterContext.applied.map(([key,option])=>`${filterLabels[key]} ${optionLabel(key,option)}`).join('、')}`:'本项仍为总体范围'}${filterContext.ignored.length?`；未应用：${filterContext.ignoredText}（不适用于本项）`:''}。`));
  if(id===17)intro.append(element('span','metric-filter-scope trial-opening-scope','总体开启率只应用国家、注册App和注册周；产品线、套餐、周期及订阅平台仅应用于已开启者构成。'));
  if(value.kind==='na'&&(id!==17||trialOpeningProjection().reason)&&(id!==23||!renewalProjection().current)&&(id!==36||packPenetrationFacts().reason)&&(id!==46||technicalHistoryProjection().reason)) {panel.append(element('p','na-note',`${value.availability==='pending'?'待补数据':'不适用'}：${value.reason}。`));return {node:panel,specs:[]};}
  if(hasRegistrationBaseline(id))panel.append(registerIssueButton(page,id,{compact:true}));
  if(id===24){const table=dataTable(retentionTable(),'retention-calculation');table.dataset.evidenceKind='data';panel.append(table);}
  if(id===54)panel.append(element('p','table-note quality-threshold-note',dataQualityState(value).reason));
  const specs=[];
  if(id===15)panel.append(bindingDeviceList(page));
  const appendEvidencePair=(spec,tableSpec,kind='groups')=>{
    const pair=element('div','evidence-pair');
    pair.dataset.evidenceKind=kind;
    pair.dataset.evidenceMetric=String(id);
    if(spec.comparisonGroup)pair.dataset.comparisonGroup=spec.comparisonGroup;
    const plot=element('div','evidence-plot');
    const box=element('div','detail-chart');box.setAttribute('role','img');
    box.setAttribute('aria-label',`${spec.title}；${chartNote(spec)}`);
    plot.append(element('h3','evidence-plot-title',spec.title));
    if(spec.scopeNote)plot.append(element('p','table-note group-evidence-context',spec.scopeNote));
    if(spec.kind==='deviceRetentionHeatmap')box.classList.add('device-retention-heatmap');
    plot.append(box);
    const scaleNote=chartScaleNote(spec);
    if(scaleNote)plot.append(element('p','chart-scale-note',scaleNote));
    if(spec.note&&spec.note!==tableSpec.note)plot.append(element('p','table-note',spec.note));
    pair.append(plot,dataTable(tableSpec));panel.append(pair);specs.push([box,spec]);
  };
  if(id===17){trialOpeningEvidence(panel,appendEvidencePair);return {node:panel,specs};}
  if(id===16){activationDeviceEvidence(panel,appendEvidencePair);return {node:panel,specs};}
  if(id===52){riskEvidence(panel,appendEvidencePair,page);return {node:panel,specs};}
  if(id===51){unbindingEvidence(panel,appendEvidencePair);return {node:panel,specs};}
  if(id===54){const explorer=qualityEvidence(panel,appendEvidencePair);return {node:panel,specs,explorer};}
  if(id===53){const part=anomalyProjection(),history=metricHistory(53);
    appendEvidencePair({metricId:53,title:'异常发现 · 最近30个24小时窗口',unit:'条',nearestLinePoint:true,onPoint:index=>panel.dispatchEvent(new CustomEvent('anomaly-window-select',{bubbles:true,detail:part.rows[index]?.endExclusive})),labels:history.labels,series:[{name:'异常发现',values:history.values}],note:history.note},anomalyHistoryTable(part),'change');
    const table=dataTable(anomalyHistoryTable(part),'anomaly-history-table');table.dataset.evidenceKind='data';panel.append(table);return {node:panel,specs};
  }
  if(id===50){const part=deviceStateProjection(),v=part.value;
    appendEvidencePair({metricId:50,title:'设备交叉状态 · 当前快照',unit:'台',labels:['绑定且已激活','绑定未激活','已激活未绑定'],series:[{name:'设备数',values:[v.boundActivated,v.boundNotActivated,v.activatedUnbound]}],note:deviceStateTable(part).note},deviceStateTable(part));
    const table=dataTable(deviceStateTable(part),'device-state-calculation');table.dataset.evidenceKind='data';panel.append(table);
    const note=element('p','table-note','当前只有状态快照；原要求的近6个月变化和逐设备关系来源仍待补，不由当前比例反推。');note.dataset.evidenceKind='change';panel.append(note);return {node:panel,specs};
  }
  if(id===26){const explorer=sessionDepthEvidence(panel,appendEvidencePair);return {node:panel,specs,explorer};}
  if(id===7)accountStockHistoryEvidence(panel,appendEvidencePair);
  if(id===46){if(value.kind==='na')panel.append(element('p','na-note',value.reason));technicalHistoryEvidence(panel,appendEvidencePair);}
  if(id===36){
    const part=packPenetrationFacts(),table=packPenetrationTable(part);
    if(value.kind==='na'){const counts=dataTable(table,'pack-penetration-calculation');counts.dataset.evidenceKind='data';panel.append(element('p','na-note',value.reason),counts);}
    else appendEvidencePair({title:'五类Pack · 当前持有人渗透率',unit:'%',labels:part.products.map(r=>r.name),
      labelRotation:0,categoryLabels:part.products.map(r=>r.name.replace(/ Pack$/,'\nPack')),
      series:[{name:'当前有效Pack持有人 / 付费权益主账号',values:part.products.map(r=>r.numerator/r.denominator*100),details:part.products.map(r=>({...r,numeratorUnit:'人',denominatorUnit:'人'}))}],
      note:table.note},table);
    if(value.kind!=='na'){const counts=dataTable(table,'pack-penetration-calculation');counts.dataset.evidenceKind='data';panel.append(counts);}
    return {node:panel,specs};
  }
  if(id===23){renewalEvidence(panel,appendEvidencePair);if(value.kind==='na')return {node:panel,specs};}
  if(id===4){const table=dataTable(activeWindowTable(30),'activity-window-calculation');table.dataset.evidenceKind='data';panel.append(table);}
  if(id===25){
    const table=dataTable(activeWindowTable(),'activity-window-calculation');table.dataset.evidenceKind='data';panel.append(table);
    for(const dimension of ['country','appPlatform']) {
      const options=availableOptions('B',dimension),parts=options.map(option=>activeWindowProjection({...filterState,[dimension]:option})),labels=options.map(option=>optionLabel(dimension,option));
      for(const app of [false,true]){
        const spec={title:`${filterLabels[dimension]} · ${app?'App':'复合'}三窗口人数`,unit:'人',labels,series:activityWindows.map(w=>({name:w.name,values:parts.map(p=>p.current.counts[app?w.app:w.composite])})),note:'同一UTC截止，保留其他条件，仅替换该分组；三个窗口嵌套不相加，分组各自互斥。'};
        appendEvidencePair(spec,{title:spec.title,columns:['分组','近1天（人）','近7天（人）','近30天（人）'],rows:parts.map((p,i)=>[labels[i],...activityWindows.map(w=>p.current.counts[app?w.app:w.composite])]),note:spec.note});
      }
    }
    return {node:panel,specs};
  }
  if(id===27){featureUsageEvidence(panel,appendEvidencePair);return {node:panel,specs};}
  if(id===28){userRetentionEvidence(panel,appendEvidencePair);return {node:panel,specs};}
  if([9,10,12].includes(id)){registrationEvidence(id,panel,appendEvidencePair);return {node:panel,specs};}
  if(id===43){deviceRetentionEvidence(appendEvidencePair,panel);return {node:panel,specs};}
  if((id===41||id===44)&&value.kind==='rate') {
    const part=deviceActivitySummary(id),date=part.at.slice(0,10);
    const sourceNote='合成行为间隔聚合；相同完整30天可观察有效已激活设备池，纯心跳不算有效行为。不同窗口是嵌套集合，人数不可相加。UTC左闭右开窗口，截至时点不计入前一窗口。';
    if(id===41) {
      const counts=[part.active1,part.active7,part.active30],labels=['近24小时','近7天','近30天'];
      appendEvidencePair({title:'活跃设备 · 三个嵌套窗口',unit:'台',labels,series:[{name:'活跃设备',values:counts}],note:sourceNote},
        {title:'日／周／月活跃设备 · 同一分母',columns:['有效行为窗口','活跃设备（台）','可观察设备（台）','活跃率','UTC起止（起含、止不含）'],
          rows:labels.map((label,i)=>[label,counts[i],part.denominator,percent(counts[i]/part.denominator),
            `${new Date(Date.parse(part.at)-[1,7,30][i]*86400000).toISOString().slice(0,10)} → ${date}`]),note:sourceNote},'data');
    } else {
      const note='21天与30天是同一设备池的判定阈值，切换规则不表示切换两个季节人群；30天活跃与30天未使用互补，21天未使用与30天活跃可能重叠，不相加。';
      appendEvidencePair({title:'长期未使用设备 · 同池两种阈值',unit:'台',labels:['至少21天未使用','至少30天未使用'],
        series:[{name:'未使用设备',values:[part.unused21,part.unused30]}],note},
        {title:'21／30天未使用 · 同一分母',columns:['未使用阈值','设备（台）','可观察设备（台）','未使用率','快照（UTC）'],
          rows:[21,30].map(days=>[`${days}天`,part[`unused${days}`],part.denominator,percent(part[`unused${days}`]/part.denominator),date]),note},'data');
      const returns=deviceReturnSummary();
      const table=returns.reason?element('p','na-note device-return-unavailable',returns.reason):dataTable({
        title:`独立${returns.thresholdDays}天未使用入组 · 7天回流`,
        columns:['入组时条件','回流设备（台）','入组设备（台）','7天回流率','入组 → 观察截止（UTC）'],
        rows:[[`${returns.thresholdDays}天无有效行为`,returns.numerator,returns.denominator,
          returns.denominator>=30?percent(returns.numerator/returns.denominator):returns.denominator?'样本不足（少于30台）':'无历史入组设备',
          `${returns.entryAt.slice(0,10)} → ${returns.observedThrough.slice(0,10)}`]],
        note:'独立历史入组且完成7天观察；与当前未使用池不是同一群体，不直接相减。两阈值入组群可重叠，不相加；没有干预对照，不能解释为召回效果。数据为合成计数，无逐台名单。'});
      table.classList.add('device-return-evidence');table.dataset.evidenceKind='data';panel.append(table);
    }
  }
  if(id===11) {
    const failure=bindingFailureEvidence();
    if(failure.spec)appendEvidencePair(failure.spec,failure.table);
    else {const missing=element('p','na-note binding-failure-unavailable',failure.reason);missing.dataset.evidenceKind='groups';panel.append(missing);}

  }
  const history=[4,7,25,46].includes(id)?null:metricHistory(id);
  const primaryId=page==='G'&&!metricHistory(54)?53:primaryTrendMetric[page];
  if(history&&(id!==primaryId||id===13||id===54||page==='F'&&!hasDataFilters(page))&&(id!==18||selectedFilters().length)) {
    const qualityDetails=id===54?history.details?.map(detail=>detail?{...detail,
      basisLabel:'丢失事件 / 预期事件',numeratorUnit:'次',denominatorUnit:'次'}:null):null;
    const spec={nearestLinePoint:history.nearestLinePoint,title:`${history.title} · ${history.labels.length}期趋势`,unit:history.unit,labels:history.labels,details:qualityDetails??history.details,
      series:[{name:history.title,values:history.values}],selectedPeriod:history.selectedPeriod,note:history.note};
    const rows=history.labels.map((label,index)=>[label,history.values[index]==null?'不适用':
        history.unit==='%'?`${history.values[index].toFixed(1)}%`:history.unit==='美元/人'?`$${history.values[index].toFixed(2)}`:
          history.unit==='美元'?`$${number(history.values[index])}`:`${number(history.values[index])}${history.unit}`]);
    if(qualityDetails)rows.forEach((row,index)=>row.push(qualityDetails[index]?number(qualityDetails[index].numerator):'—',
      qualityDetails[index]?number(qualityDetails[index].denominator):'—'));
    appendEvidencePair(spec,id===23?renewalMonthTable():id===24?retentionTable():{title:`${history.title} · 趋势数据`,columns:qualityDetails?['日期','丢失率','丢失事件（次）','预期事件（次）']:['周期','值'],rows,
      note:history.note},'change');
    if(id===23)panel.insertBefore(panel.lastElementChild,panel.querySelector('.evidence-pair'));

  }
  if(id===11||id===13){
    const duration=onboardingDurationEvidence(id),part=onboardingSummary(id);
    panel.append(duration.node,...onboardingGroupTables(id));specs.push(...duration.specs);
    const table=dataTable({title:'本批成功率与耗时 · 同源验算',columns:['完整批次',`成功／合格分母（${id===11?'次':'人'}）`,'成功率','成功者P50','成功者P90'],
      rows:[[periodLabel(`W${part.cohort.week}`),`${number(part.numerator)} / ${number(part.denominator)}`,percent(part.numerator/part.denominator),onboardingDuration(part.p50Seconds,id),onboardingDuration(part.p90Seconds,id)]],
      note:`观察截至 ${part.cohort.observedThrough}（UTC）。仅成功者进入R7分位数，不足30个成功样本不报P50／P90；失败／未达成不补0或7天。与#14绑定至首图是不同事件口径。`},'onboarding-current-table');
    table.dataset.evidenceKind='data';panel.append(table);
  }
  if(id===3&&!selectedFilters().length) {
    panel.append(dataTable({title:'MRR组成 · 当前演示快照',columns:['收入组成','MRR'],
      rows:[['基础订阅',`$${number(sourceData.snapshot.baseMRR)}`],['增值Pack',`$${number(sourceData.snapshot.packMRR)}`],
        ['合计',`$${number(sourceData.snapshot.totalMRR)}`]],
      note:'基础订阅与增值Pack按快照加总；月内实际付款人数使用另一个统计窗口。'}));
  }
  if(id===5&&value.kind==='group') {
    const spec=subscriptionStatusSpec(value.value);
    const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',`${spec.title}；${spec.note}`);
    panel.append(box,element('p','table-note',spec.note));specs.push([box,spec]);
  }
  if(id===42&&!selectedFilters().length)panel.append(dataTable(deviceEventContributionTable()));
  if(id===42&&value.kind==='rate') {
    const parts=deviceEventGroupChanges();
    if(parts.groups) {
      const {comparison,groups,changes,effects}=parts;
      appendEvidencePair(deviceEventChangeSpec(parts),{
        title:'空触发率变化贡献 · 计算依据',
        columns:['互斥分组',`${comparison.beforeLabel}：空触发 / 总体触发（次）`,`${comparison.afterLabel}：空触发 / 总体触发（次）`,'变化贡献（百分点）'],
        rows:groups.map((group,i)=>[group.name,...group.summaries.map((part,j)=>`${number(part.numerator)} / ${number(parts.overall[j].denominator)}`),chartValue(changes[i],'个百分点')]),
        note:'每组贡献的分母是同期总体触发数，不是该组触发数；两期长短不同时不直接比较事件合计。来源为当前筛选下的周×型号×固件合成计数，不作因果归因。',
      });
      const basis=element('details','workspace-context device-rate-decomposition');basis.dataset.evidenceKind='groups';
      basis.append(element('summary','','核对组内空触发率与触发构成'),dataTable({
        title:'空触发率变化拆分 · 同一筛选与比较周期',
        columns:['互斥分组',`${comparison.beforeLabel}：空触发 / 该组触发（组内率）`,`${comparison.afterLabel}：空触发 / 该组触发（组内率）`,'触发占比（前→后）','组内变化（pp）','构成变化（pp）'],
        rows:groups.map((group,i)=>[group.name,...group.summaries.map(part=>`${number(part.numerator)} / ${number(part.denominator)}（${percent(part.value)}）`),
          effects[i].weights.map(percent).join(' → '),chartValue(effects[i].within,'个百分点'),chartValue(effects[i].composition,'个百分点')]),
        note:`${comparison.beforeWindow} → ${comparison.afterWindow}。组内率r＝该组空触发÷该组触发；触发占比w＝该组触发÷同期总体触发。组内变化＝两期平均w×率差；构成变化＝两期平均r×占比差，均乘100换为百分点。未舍入合计回到每组贡献；这不是设备故障因果判断。`,
      }));panel.append(basis);
    } else {
      const unavailable=element('p','na-note',parts.reason);unavailable.dataset.evidenceKind='groups';panel.append(unavailable);
    }
  }
  if(id===18&&value.kind==='rate') {
    const periods=filterState.week?[[`所选W${filterState.week}`,trialRows(filterState)]]:
      [['前9个成熟周 · W1–9',trialRows(filterState,'previous')],['近3个成熟周 · W10–12',trialRows(filterState,'current')]];
    const summaries=periods.map(([label,result])=>[label,result.rows?trialAggregate(result.rows):null]);
    if(!filterState.week&&summaries.every(([,item])=>item?.denominator>=30)) {
      const contribution=trialGroupContributions(periods.map(([,result])=>result.rows));
      if(contribution) {
        const {groups,overall,changes,effects}=contribution;
        const plottedChanges=changes.map(value=>Math.abs(value)<1e-10?0:value);
        const low=Math.min(0,...plottedChanges),high=Math.max(0,...plottedChanges),span=high-low||1;
        const interval=chartNiceStep(span/4),rounded=value=>Number(value.toPrecision(12));
        const signed=value=>`${Math.abs(value)<.005?'':value>0?'+':'−'}${Math.abs(value).toFixed(2)}`;
        const changeSpec={title:'转正率变化 · 互斥分组贡献',comparisonGroup:'trial-periods',unit:'个百分点',labels:groups.map(group=>group.name),
          minY:low<0?rounded(Math.floor((low-span*.1)/interval)*interval):0,
          maxY:high>0?rounded(Math.ceil((high+span*.1)/interval)*interval):high===low?1:0,intervalY:interval,
          labelRotation:0,series:[{name:'对总体变化的贡献',values:plottedChanges,color:'#bc6a20'}],
          note:`前9周→近3周：组内表现 ${signed(effects.reduce((sum,item)=>sum+item.within,0))}、人群构成 ${signed(effects.reduce((sum,item)=>sum+item.composition,0))}，合计 ${signed((overall[1].value-overall[0].value)*100)} 个百分点。算术拆分不证明原因；纵轴含0，pp＝百分点。`};
        appendEvidencePair(changeSpec,{title:'分组贡献 · 可验算依据',
          columns:['互斥分组','前9周转正 / 总体成熟','近3周转正 / 总体成熟','变化贡献（百分点）'],
          rows:groups.map((group,index)=>[group.name,`${number(group.summaries[0].numerator)} / ${number(overall[0].denominator)}`,
            `${number(group.summaries[1].numerator)} / ${number(overall[1].denominator)}`,signed(changes[index])]),
          note:'贡献＝近期该组转正人数÷近期总体成熟人数−前期该组转正人数÷前期总体成熟人数。分母为同一期总体成熟人群，区别于组内转正率；这是数学分解，不证明支付失败导致转正下降。'});
        const decomposition=element('details','workspace-context trial-rate-decomposition');
        decomposition.dataset.evidenceKind='groups';
        decomposition.append(element('summary','','核对组内表现与人群构成拆分'),dataTable({
          title:'转正率变化拆分 · 同一筛选与成熟批次',
          columns:['互斥分组','前9周：转正 / 该组成熟（组内率）','近3周：转正 / 该组成熟（组内率）',
            '人群占比（前→后）','组内表现（pp）','构成变化（pp）'],
          rows:groups.map((group,index)=>[group.name,...group.summaries.map(item=>
            `${number(item.numerator)} / ${number(item.denominator)}（${percent(item.value)}）`),
            effects[index].weights.map(percent).join(' → '),signed(effects[index].within),signed(effects[index].composition)]),
          note:`总体成熟人数：前期 ${number(overall[0].denominator)} 人，近期 ${number(overall[1].denominator)} 人。组内率 r＝该组转正÷该组成熟；人群占比 w＝该组成熟÷同期总体成熟。组内表现＝两期平均 w×(近期 r−前期 r)；构成变化＝两期平均 r×(近期 w−前期 w)，均乘100换算为百分点。两部分未舍入合计等于原分组贡献；显示值可能有舍入尾差。占比不变时构成变化为0；这是算术分解，不证明业务因果。`,
        }));
        panel.append(decomposition);
      } else {
        const pending=element('p','na-note','部分分组的前期或近期成熟样本不足30人，暂不展示变化贡献；总体批次比较仍可核对。');
        pending.dataset.evidenceKind='groups';panel.append(pending);
      }
    }
    const spec={title:filterState.week?`成熟试用转正率 · 所选W${filterState.week}`:'成熟试用转正率 · 可比批次',comparisonGroup:filterState.week?undefined:'trial-periods',kind:summaries.length===2?'periodComparison':undefined,unit:'%',labels:summaries.map(([label])=>label),
      details:summaries.map(([,item])=>item?.denominator>=30?{...item,basisLabel:'转正 / 成熟试用',numeratorUnit:'人',denominatorUnit:'人'}:null),
      series:[{name:'转正率',values:summaries.map(([,item])=>item?.denominator>=30?item.value*100:null)}],
      note:filterState.week?'所选完整周的转正人数除以成熟试用人数；小于30人的批次不绘制比例。':'前9周与近3周分别汇总分子、分母后计算；小于30人的批次不绘制比例。'};
    const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',`${spec.title}；${chartNote(spec)}`);
    panel.append(box,element('p','table-note',spec.note));specs.push([box,spec]);
    panel.append(dataTable({title:'试用明细聚合 · 转正与支付',
      columns:['批次','成熟试用','转正','转正率','支付尝试','支付失败'],
      rows:summaries.map(([label,item])=>[label,item?number(item.denominator):'—',item?number(item.numerator):'—',
        item?.denominator>=30?percent(item.value):'样本不足',item?number(item.attempts):'—',item?number(item.failed):'—']),
      note:filterState.week?'人数为所选完整周的合计；每条试用记录在样例中最多有一次支付尝试。':'前后两段长短不同；人数为区间合计，比较规模变化需换算为周均。每条试用记录在样例中最多有一次支付尝试。'}));
    if(!filterState.week){
      const rows=periods.map(([label,result])=>[label,result.rows?trialAggregate(result.rows.filter(isBirdPlusMonthlyAndroid)):null]);
      const panelTable=dataTable({title:'观鸟 Android Plus月付组 · 转正与支付核对',
        columns:['批次','成熟试用','转正','转正率','支付尝试','失败人数','失败率'],
        rows:rows.map(([label,item])=>[label,item?number(item.denominator):'—',item?number(item.numerator):'—',
          item?.denominator>=30?percent(item.value):'样本不足',item?number(item.attempts):'—',
          item?number(item.failed):'—',item?.attempts>=30?percent(item.failed/item.attempts):'样本不足']),
        note:'前9周与近3周分别聚合，人数不能直接比较；上方观察使用周均变化。同一筛选条件下重算，同步变化不构成因果证明。'});
      panelTable.id='trial-contribution';panelTable.dataset.evidenceKind='groups';panel.append(panelTable);
    }
  } else if(id===29&&value.kind==='rate') {
    const age=sourceData.inactivityCohorts;
    const threshold=value.thresholdDays;
    const returns=threshold===21?age.returnsAfterThreshold['21days']:age.returnsAfterThreshold['30days'];
    const applicable=effectiveFor(id).filter(([key])=>key!=='season');
    const shares=sharesFor(applicable,id);
    const cohort=allocatedCount(age.historicalReturnCohort[`${threshold}days`],applicable,id,'numerator',shares);
    const returning=Math.min(cohort,allocatedCount(returns,applicable,id,'numerator',shares));
    const returnRate=cohort>=30?percent(returning/cohort):cohort>0?'样本不足（少于30人）':'无历史样本';
    panel.append(dataTable({title:`${threshold}天未使用与7天回流 · 不同人群`,
      columns:['观察项','人数（人）','分母（人）','率','时点 / 观察窗'],rows:[
        [`连续${threshold}天未使用`,value.numerator,value.denominator,percent(value.value),`${age.asOf} 快照`],
        ['历史入组后7天回流',returning,cohort,returnRate,`${age.returnWindow}；入组日期未提供`]],
      note:'未使用池与历史回流为不同人群，不能直接相减。迁徙季按21天、淡季按30天识别；历史入组日期未提供，不作跨期比较或召回效果归因。数值为合成样例；回流分母少于30人时只保留人数，30人为演示规则。'}));
  } else if(id===30&&value.kind==='group') {
    const v=value.value,labels=activityCombinations.map(item=>item.label),counts=activityCombinations.map(item=>v.exclusiveCells[item.key]);
    const note=`${contract.window}。每人只计入一个组合，七类合计 ${number(v.composite)} 人；标签列出的就是该组全部来源，App＋内容不含推送。App ${number(v.app)}、内容 ${number(v.content)}、推送点击 ${number(v.pushClicked)} 是可重叠来源，不能相加。当前范围按国家×平台同源合成频数重算，与#4和#25的近30天人数一致。`;
    appendEvidencePair({title:'复合活跃 · 七类互斥构成',unit:'人',labels,series:[{name:'主账号',values:counts}],note},
      {title:'复合活跃互斥构成 · 人数与占比',columns:['互斥组合','主账号（人）','复合活跃分母（人）','占比'],
        rows:[...activityCombinations.map((item,index)=>[item.label.replace('\n',''),counts[index],v.composite,
          v.composite>=30?percent(counts[index]/v.composite):'样本不足（少于30人）']),
          ['合计',v.composite,v.composite,v.composite>=30?'100.0%':'无可靠比例']],note});
  } else if(id===27&&value.kind==='rate') {
    const options=['Live','Playback','Recognition'];
    panel.append(dataTable({title:'业务功能渗透 · 同一活跃人群',columns:['功能','使用主账号','活跃主账号','使用率'],
      rows:options.map(option=>{
        const part=projectMetric(27,{...filterState,functionType:option});
        return [optionLabels[option],part.kind==='rate'?part.numerator:'不适用',part.kind==='rate'?part.denominator:'—',
          part.kind==='rate'?percent(part.value):'—'];
      }),note:sourceData.functionUsage.note}));
  } else if(id===35&&value.kind==='group') {
    const monthlyTable=dataTable(paymentMonthTable(),'payment-month-table');monthlyTable.dataset.evidenceKind='data';panel.append(monthlyTable);
    const monthly=paymentMonthRows();if(monthly.reason){const warning=element('p','na-note payment-history-unavailable',monthly.reason);warning.dataset.evidenceKind='change';panel.append(warning);}
    const incomeChange=subscriptionIncomeChange();
    if(incomeChange)appendEvidencePair(subscriptionIncomeSpec(incomeChange),subscriptionIncomeCalculationSpec(incomeChange),'change');
    const dimension=selectedFilters().map(([key])=>key).find(key=>key!=='week'&&contract.dimensions.includes(key)&&sourceData.slices[key])
      ??contract.dimensions.find(key=>key!=='week'&&sourceData.slices[key]);
    if(dimension) {
      const options=Object.keys(sourceData.slices[dimension]);
      const parts=options.map(option=>projectMetric(id,{...filterState,[dimension]:option}));
      const labels=options.map(option=>`${optionLabels[option]??option}${filterState[dimension]===option?'（当前）':''}`);
      const groupNote=`保留当前其他筛选条件，仅切换${filterLabels[dimension]}进行组间对照；${filterState[dimension]?`当前选择为${optionLabel(dimension,filterState[dimension])}。`:'当前未限定该维度。'}付款人数与ARPPU分别呈现，不使用双Y轴；各组为模拟分片估算。`;
      for(const [title,unit,field] of [['月度订阅付款主账号','人','monthlySubscriptionPayers'],['订阅ARPPU','美元/人','ARPPU']]) {
        const spec={title:`${filterLabels[dimension]} · ${title}`,unit,labels,
          series:[{name:title,values:parts.map(part=>part.kind==='group'?part.value[field]:null)}],
          note:groupNote};
        const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',spec.title);
        panel.append(box,element('p','table-note',spec.note));specs.push([box,spec]);
      }
      const groupTable=dataTable({title:`${filterLabels[dimension]} · 付款人数与ARPPU验算`,
        columns:['分组','付款主账号','订阅净收入','ARPPU'],
        rows:parts.map((part,index)=>part.kind==='group'?[labels[index],number(part.value.monthlySubscriptionPayers),`$${number(part.value.subscriptionNetIncome)}`,`$${part.value.ARPPU.toFixed(2)}`]:[labels[index],'不适用','—','—']),
        note:`订阅净收入除以同组付款主账号。${groupNote}`});
      groupTable.dataset.evidenceKind='groups';panel.append(groupTable);
    }
  } else if(id===39&&value.kind==='group') {
    const spec={...modelSubscriptionHeatmap(),title:'设备型号经营表现 · 当前筛选'};
    const box=element('div','detail-chart');box.setAttribute('role','img');box.setAttribute('aria-label',spec.title);
    panel.append(box,element('p','table-note',spec.note));specs.push([box,spec]);
  } else if(id===46&&value.kind==='group') {
    const entries=Object.entries(value.value).sort((a,b)=>a[1].value-b[1].value);
    const failures=entries.map(([,part])=>({numerator:part.denominator-part.numerator,denominator:part.denominator,
      numeratorUnit:'次',denominatorUnit:'次'}));
    const rates=failures.map(part=>part.numerator/part.denominator*100);
    const note=`${sourceData.technicalFacts.window}，截至${sourceData.technicalFacts.asOf}。${technicalRequestSource(id)}。失败率＝失败请求÷该链路请求；链路请求不可相加，未设定生产达标阈值。`;
    const spec={title:'关键功能失败请求率 · 当前筛选',unit:'%',labels:entries.map(([name])=>groupLabels[name]),
      maxY:Math.min(100,Math.max(5,Math.ceil(Math.max(...rates)/5)*5)),
      series:[{name:'失败请求率',values:rates,details:failures}],note};
    appendEvidencePair(spec,{title:'关键功能请求验算',columns:['链路','请求次数','成功次数','失败次数','失败率'],
      rows:entries.map(([name,part],index)=>[groupLabels[name],number(part.denominator),number(part.numerator),
        number(failures[index].numerator),percent(failures[index].numerator/part.denominator)]),note});
  } else if(['rate','count','usd'].includes(value.kind)) {
    const dimension=id===42?'deviceModel':selectedFilters().map(([key])=>key).find(key=>key!=='week'&&contract.dimensions.includes(key)&&sourceData.slices[key])
      ??contract.dimensions.find(key=>key!=='week'&&sourceData.slices[key]);
    if(dimension) {
      const options=Object.keys(sourceData.slices[dimension]).filter(option=>id!==42||option!=='Hunt Pro');
      const projected=options.map(option=>projectMetric(id,{...filterState,[dimension]:option}));
      const labels=options.map(option=>optionLabels[option]??option);
      const vals=projected.map(part=>part.kind==='na'?null:part.kind==='rate'?part.value*100:part.value);
      const countUnit=metricCountUnits[id]??'';
      const comparison=filteredBreakdown(page);
      const comparisonNote=comparison?.metricId===id&&comparison.dimension===dimension?comparison.comparisonScope:'';
      const groupNote=[[11,13].includes(id)?'按当前批次与筛选交集汇总同一合成频数；成功率与耗时同源，不是独立分片估算，仍非真实经营日志。':
    id===4?'同一国家×平台合成活跃窗口计数。':id===16?activationDeviceNote:id===15?'按同一合成设备台账逐台计数；产品线由设备型号确定，各分组合计回到同范围总数。':id===23?'按同一到期月和期初固定归属的互斥合成频数重算；不平均分组率。':id===24?'按同一完整自然月×国家×基期App平台的互斥合成分组重算；保留其他条件，仅切换本分组，不平均比例。':[41,44].includes(id)?'按同一行为间隔聚合事实汇总互斥分组；产品线由型号确定，固件按组内归属，不使用独立分片。':id===42?'保留当前其他条件，按周×型号×固件合成计数重算；型号分配为构造样本，不证明真实业务原因。':'按演示分片分配分子和分母；跨维度交叉采用独立分布假设。',comparisonNote].filter(Boolean).join(' ');
      const spec={title:`${filterLabels[dimension]} · 模拟分组对比`,groupDimension:dimension,unit:value.kind==='rate'?'%':value.kind==='usd'?'美元':countUnit,labels,details:projected,series:[{name:item.name,values:vals}],note:groupNote,
        scopeNote:`${actionBaselineWindow(id)} · 比较当前分组水平，不表示跨期变化贡献。${groupNote}`};
      appendEvidencePair(spec,{title:`${filterLabels[dimension]}分组验算`,columns:['分组','分子 / 数量','分母','结果'],rows:projected.map((part,index)=>{
        const cells=flattenMeasure(part)[0]??[];return [labels[index],cells[1]??'—',cells[2]??'—',part.kind==='rate'?percent(part.value):part.kind==='na'?'不适用':part.kind==='usd'?`$${number(part.value)}`:number(part.value)];
      }),note:groupNote});
    }
  }
  const fullValue=dataTable(id===38?structureMetricTable():id===39?modelCalculationTable():compactMetricValueTable({title:`${item.name} · 当前筛选完整值`,columns:['子项',id===5?'主账号人数（人）':'分子 / 数量','分母','结果 / 说明'],rows:flattenMeasure(value.kind==='group'?value.value:value,value.kind==='group'?'':metricCardLabels[id]??item.name),
    note:`计算口径：${contract.formula.replace(/。+$/,'')}。${[11,13].includes(id)?'本表、成功率趋势与耗时按同一合成频数汇总。':id===15?'本表、趋势和清单由同一合成设备台账计数。':[41,44].includes(id)?'本表、趋势和分组按同一合成行为间隔重算；回流使用独立历史入组。':id===42?'本表与卡片、趋势、分组均按同一合成触发计数汇总。':id===18?'本表与图表均由合成试用记录计算。':selectedFilters().length?'本表与图表使用相同的筛后分片。':'本表为演示底表值。'}`}),id===38?'structure-calculation':id===39?'model-calculation':'');
  fullValue.dataset.evidenceKind='data';panel.append(fullValue);
  return {node:panel,specs};
}
// Topic browsing and diagnosis share metric projections, never separate summary data.
const topicGroups={
 A:[['规模与新增',[7,9,16]],['绑定过程',[10,11]],['激活与首图',[12,13,14,15]]],
 B:[['活跃规模与来源',[4,25,30]],['使用与触达',[26,27,31]],['留存与回流',[24,28,29]]],
 C:[['规模与使用',[8,41,44]],['内容与功能质量',[42,45,46]],['留存与版本',[43,47]]],
 D:[['规模与结果',[2,3,6,21]],['试用与首购',[17,18,19,20]],['状态与权益',[5,22]],['续订与存量经营',[23,32,33,52]]],
 E:[['付费规模与价值',[34,35,3]],['增值服务',[36,37]],['人群与设备差异',[38,39,40]]],
 F:[['关系规模',[7,8]],['持有与共享',[48,49]],['绑定变化',[50,51]],['关联设备质量',[47]]],
 G:[['异常信号',[53]],['数据可信度',[54]],['关联业务风险',[15,29,42,52]]]
};
const topicHighlights={A:[9,13,16],B:[4,24,27],C:[41,42,46],D:[2,18,23],E:[34,35],F:[48,49],G:[53,54]};
function topicMetricWindow(id) {
 const registration=id===9?registrationProjection(9):null;
 const window=registration&&!registration.reason?`事件统计周：W${registration.current.week} · ${registration.current.start}—${registration.current.end}；首次绑定事件待补`:actionBaselineWindow(id);
 return (window.startsWith('快照 ')?contractFor(id).window:window).replaceAll('v1','').replace(/T(\d{2}:\d{2}):00Z/g,' $1 UTC');
}
const topicOverviewOrigins=new Map();
function isTopicOverviewRequest() {
 const params=new URLSearchParams(location.hash.split('?')[1]??'');
 return !params.has('metric')&&!params.has('panel')&&!params.has('issue');
}
function topicOverviewHref(page) {
 const href=routeHref(page),params=new URLSearchParams(href.split('?')[1]??'');
 for(const key of ['metric','panel','issue'])params.delete(key);
 return `#/${page}${params.size?'?'+params:''}`;
}
function returnToTopic(page,id) {
 const origin=topicOverviewOrigins.get(page),href=topicOverviewHref(page);
 pushRoute(href);renderRoute({preserveScroll:true});
 if(origin){restoreReadingView({...origin,hash:location.hash,focusId:origin.focusId||`topic-open-${page}-${id}`});return;}
 const hash=location.hash,revision=readingRevision;
 requestAnimationFrame(()=>{
  if(hash!==location.hash||revision!==readingRevision)return;
  const link=document.getElementById(`topic-open-${page}-${id}`);link?.focus({preventScroll:true});
  link?.closest('.topic-metric')?.scrollIntoView({block:'center',behavior:'instant'});
 });
}
function bindTopicDiagnosisLink(link) {
 link.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button)return;event.preventDefault();pushRoute(link.getAttribute('href'));renderRoute();});
 return link;
}
function topicReturnLink(page,id) {
 const link=element('a','back-link topic-return','← 返回专题概览');link.href=topicOverviewHref(page);
 link.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button)return;event.preventDefault();returnToTopic(page,id);});return link;
}
const topicPartLabels={registered:'累计注册',boundOwners:'当前绑定主账号',activatedCumulative:'累计首图激活',boundCurrent:'当前绑定设备',
 opening:'期初有效订阅',closing:'期末有效订阅',trialPaid:'试用转正流入',directPaid:'直接付费流入',recovered:'恢复流入',lost:'权益流失',
 combined:'触点合并',subscriptionPage:'订阅页',popup:'弹窗',anyExhausted:'任一权益耗尽',aiExhausted:'AI额度耗尽',storageExhausted:'存储耗尽',transferExhausted:'传输耗尽',
 upgrade:'升级',downgrade:'降级',recovery:'恢复率',durationP50Months:'连续订阅时长P50',durationP90Months:'连续订阅时长P90',
 D1:'D1',D7:'D7',D30:'D30',p50Minutes:'首图耗时P50',p90Minutes:'首图耗时P90',DAU:'复合活跃近1天',WAU:'复合活跃近7天',MAU:'复合活跃近30天',appDAU:'App活跃近1天',appWAU:'App活跃近7天',appMAU:'App活跃近30天',
 sessionsPerUser:'人均会话',durationP50Minutes:'会话时长P50',durationP90Minutes:'会话时长P90',delivery:'送达率',click:'点击率',
 monthlySubscriptionPayers:'月度付款主账号',subscriptionNetIncome:'订阅净收入',ARPPU:'订阅ARPPU',anyPack:'任一增值包',firstPurchase:'首购用户',repeatOrRenewal:'复购／续订用户',
 networkSuccess:'联网成功率',reportedWithin24h:'24小时内上报设备',upload:'上传成功率',live:'直播成功率',push:'推送成功率',
 boundActivated:'已绑定且已激活',boundNotActivated:'已绑定未激活',activatedUnbound:'已激活未绑定',sharedBoundActivated:'共享的已绑定已激活',sharedBoundNotActivated:'共享的已绑定未激活',
 eventLoss:'事件丢失率',idMapping:'ID映射覆盖率'};
function topicRateText(value,unit='人') {
 if(value?.kind==='na')return `${value.reason}${Number.isFinite(value.denominator)?' · '+(value.numerator===null?'观察中':Number.isFinite(value.numerator)?number(value.numerator):'未知')+' / '+number(value.denominator)+unit:''}`;
 if(value?.numerator===null)return '观察中';
 if(value?.value===null||!Number.isFinite(value?.value))return '待核验';
 const basis=Number.isFinite(value.numerator)&&Number.isFinite(value.denominator)?` · ${number(value.numerator)} / ${number(value.denominator)}${unit}`:'';
 return `${percent(value.value)}${basis}`;
}
function topicMetricRows(id) {
 const value=metric(id);if(value.kind==='na')return [];
 const v=value.value,unit=[11,42,45,46,31].includes(id)?'次':id===54?'条':metricCountUnits[id]??([8,15,16,41,43,44,47,49,50,51].includes(id)?'台':'人');
 if(value.kind==='rate'){
  const rows=[[metricCardSummary(id).label,topicRateText(value,unit)]];
  if(id===17&&metricFilterContext(17).composition.length){const p=trialOpeningComposition();rows.push(['所选已开启者构成人数',`${number(p.count)} / ${number(p.total)}人`]);}
  if(id===29){const age=sourceData.inactivityCohorts,threshold=value.thresholdDays,applicable=effectiveFor(id).filter(([k])=>k!=='season'),shares=sharesFor(applicable,id),d=allocatedCount(age.historicalReturnCohort[`${threshold}days`],applicable,id,'numerator',shares),n=Math.min(d,allocatedCount(age.returnsAfterThreshold[`${threshold}days`],applicable,id,'numerator',shares));rows.push(['独立历史入组7天回流',topicRateText(d>=30?{kind:'rate',value:n/d,numerator:n,denominator:d}:na('历史样本不足30人'))]);}
  if(id===23){const p=renewalProjection();if(!p.reason)rows.push(['月内发生权益流失 / 期初',topicRateText(p.current.loss)],['月内主动取消 / 期初',topicRateText(p.current.cancel)]);}
  if(id===27){const p=featureUsageProjection();if(!p.reason){rows.length=0;featureFunctions.forEach((key,i)=>rows.push([optionLabel('functionType',key)+'使用率',topicRateText({value:p.current.users[i]/p.current.denominator,numerator:p.current.users[i],denominator:p.current.denominator})]));}}
  if(id===10&&value.sevenDay)rows.push(['7日首次绑定',topicRateText(value.sevenDay)]);
  if([11,13].includes(id)){const p=onboardingSummary(id);if(!p.reason)rows.push(['成功耗时P50',onboardingDuration(p.p50Seconds,id)],['成功耗时P90',onboardingDuration(p.p90Seconds,id)]);}
  if(id===41){const p=deviceActivitySummary(id);if(!p.reason)rows.push(['近24小时活跃设备',number(p.active1)+'台'],['近7天活跃设备',number(p.active7)+'台'],['近30天活跃设备',number(p.active30)+'台']);}
  if(id===44){const p=deviceActivitySummary(id);if(!p.reason)rows.push(['至少21天未使用设备',number(p.unused21)+'台'],['至少30天未使用设备',number(p.unused30)+'台']);}
  if(id===44){const p=deviceReturnSummary();if(!p.reason)rows.push(['历史入组7天回流',topicRateText({...p,value:p.denominator>=30?p.numerator/p.denominator:null},'台')]);}
  return rows;
 }
 if(value.kind!=='group')return [[metricCardSummary(id).label,`${displayValue(id)}${metricCardSummary(id).unit}`],...(id===9?[['当周首次绑定用户','待补按事件发生周的来源']]:[])];
 if(id===51)return [['去重解绑设备',number(v.observedUnboundDevices)+'台'],['解绑事件',number(v.unboundEvents)+'次'],['月初绑定设备解绑率',topicRateText(v.unboundDeviceRate,'台')],['7日回绑',topicRateText(v.reboundWithin7d,'台')],['30日回绑',topicRateText(v.reboundWithin30d,'台')]];
 if([5,30,36,38,39,40].includes(id))return [];
 return Object.entries(v).filter(([key])=>Object.hasOwn(topicPartLabels,key)).map(([key,part])=>{
  let text;if(part&&typeof part==='object')text=topicRateText(part,unit);
  else if(part===null)text='样本不足';
  else if(key.toLowerCase().includes('minutes')||key==='p50Minutes'||key==='p90Minutes')text=number(part)+'分钟';
  else if(key.endsWith('Months'))text=number(part)+'个月';
  else if(key==='reportedWithin24h')text=number(part)+'台';
  else if(key==='sessionsPerUser')text=sessionDepthNumber(part,2)+'次/人';
  else if(key==='ARPPU')text='$'+Number(part).toFixed(2)+'/人';
  else if(key==='subscriptionNetIncome')text='$'+number(part);
  else text=number(part)+unit;
  const label=id===12&&key==='D30'&&!filterState.week?`D30 · 参照W${registrationProjection(12).d30.week}`:topicPartLabels[key];
  return [label,text];
 });
}
function topicMetricStructure(id) {
 const current=metric(id);
 if(current.kind!=='na'&&[3,34,48,49].includes(id)) {
  const unavailable=text=>element('p','topic-context',text);
  if(id===34){const part=paidRightsComposition();if(part.reason)return unavailable('权益构成待补：'+part.reason);
   return dataTable({title:'同日付费权益 · 互斥构成',columns:['权益','主账号','占付费权益'],rows:['仅订阅','仅增值Pack','订阅和Pack都有'].map((label,i)=>[label,number(part.counts[i])+'人',percent(part.counts[i]/part.parent.total)]),note:'三类互斥，合计回到当前付费主账号；各Pack持有明细见本页增值包渗透。'},'topic-mini-table');}
  if(selectedFilters().length)return unavailable(id===3?'MRR分项待补当前筛选范围的来源；不沿用总体组成。':id===48?'平均设备数和持有分布待补当前范围明细；不沿用总体结构。':'共享用户数及人数分布待补当前范围关系明细；设备共享率仍按自身范围显示。');
  if(id===3){const {baseMRR,packMRR,totalMRR}=sourceData.snapshot;
   if(![baseMRR,packMRR,totalMRR].every(n=>Number.isFinite(n)&&n>=0)||Math.abs(baseMRR+packMRR-totalMRR)>.001||Math.abs(totalMRR-current.value)>.001)return unavailable('MRR分项与总额待核验。');
   return dataTable({title:'当前MRR组成',columns:['收入组成','月化收入'],rows:[['基础订阅','$'+number(baseMRR)],['增值Pack','$'+number(packMRR)]],note:'按同一快照加总；月化收入不等于当月实际收款。'},'topic-mini-table');}
  if(id===48){const rows=sourceData.diagnostics.F.tables.find(t=>t.title==='每主账号绑定设备数分层')?.rows;
   const valid=rows?.length===4&&rows.every(r=>validHeadcount(r[1])&&validHeadcount(r[2]));
   if(!valid)return unavailable('持有结构缺少可靠计数，平均设备数待核验。');
   const owners=rows.reduce((n,r)=>n+r[1],0),devices=rows.reduce((n,r)=>n+r[2],0),multi=rows.slice(1).reduce((n,r)=>n+r[1],0);
   if(owners!==current.denominator||multi!==current.numerator||devices!==sourceData.snapshot.boundDevicesCurrent)return unavailable('设备持有结构与主账号／设备总数不闭合，待核验。');
   return dataTable({title:'主账号持有结构',columns:['设备数','主账号','占绑定主账号'],rows:rows.map(r=>[r[0],number(r[1])+'人',owners>=30?percent(r[1]/owners):'样本不足']),note:`平均绑定 ${owners>=30?(devices/owners).toFixed(2):'待核验'}台/主账号 · ${number(devices)}台 / ${number(owners)}人；4台及以上是聚合组，不表示每人恰好4台。`},'topic-mini-table');}
  const row=sourceData.diagnostics.F.tables.find(t=>t.title==='主账号、共享与回绑')?.rows.find(r=>r[0]==='通过共享获得访问权限的用户');
  if(!row||!validHeadcount(row[1]))return unavailable('去重共享用户数待核验；每台设备共享人数分布待补。');
  return dataTable({title:'共享覆盖 · 总体快照',columns:['观察项','数量'],rows:[['通过共享获得访问权限的去重用户',number(row[1])+'人']],note:'共享用户与设备不是同一统计对象，不相加；每台设备共享人数分布待补关系明细。'},'topic-mini-table');
 }
 if(id===27&&current.kind==='rate'){const p=featureUsageProjection();if(p.reason)return null;const r=p.current;return dataTable({title:'账号通知总开关 · 期末快照',columns:['配置','主账号','占同范围复合活跃'],rows:['on','off','unknown'].map((key,i)=>[['已确认开','已确认关','未知'][i],number(r.config[key])+'人',percent(r.config[key]/r.denominator)]),note:'三类互斥；未知不当作关闭。这里是App内账号配置，不等于系统授权或推送送达。'},'topic-mini-table');}
 const m=current;if(m.kind==='count'&&[15,52,53].includes(id)){
  let title,rows,note;
  if(id===15){const p=bindingDeviceRows();if(!p.rows)return null;title='当前设备 · 互斥等待分层';rows=['超过3天、未满7天','7–13天','14天及以上'].map(label=>[label,number(p.rows.filter(r=>bindingWaitBand(r,p.at)===label).length)+'台']);note='同一设备只归一层，合计回到当前清单；等待分层不代表预测风险。';}
  if(id===52){const p=riskProjection();if(p.reason)return null;const w=p.current;title='高危主账号 · 互斥命中构成';rows=[['仅意图层',number(w.intentOnly)+'人'],['仅行为叠加层',number(w.behaviorOnly)+'人'],['两者同时命中',number(w.both)+'人']];note='三类合计回到高危去重人数；单个风险信号可能重叠，详情中核对。';}
  if(id===53){const p=anomalyProjection();if(p.reason)return null;title='同一24小时窗 · 异常分类';rows=['Business','Device','Quality'].map(key=>[optionLabel('anomalyType',key),number(p.current.events.filter(r=>r.anomalyType===key).length)+'条']);note='每条发现归入一个类别，合计回到当前数量；严重程度和受影响人数尚未提供，不据此判断影响大小。';}
  return dataTable({title,columns:['分类','数量'],rows,note},'topic-mini-table');
 }
 if(m.kind!=='group')return null;const v=m.value;
 let columns,rows,note='';
 if(id===5){const container=element('div','topic-status-products');for(const [line,parts] of Object.entries(v)){const total=Object.values(parts).reduce((a,b)=>a+b,0),table=dataTable({title:`${groupLabels[line]} · ${number(total)}主账号`,columns:['状态','人数','占本线'],rows:Object.entries(parts).map(([key,n])=>[statusHistoryFields[key]??groupLabels[key],number(n)+'人',total>=30?percent(n/total):'样本不足']),note:'本产品线内状态互斥合计100%；跨线不能相加为独立用户。'},'topic-mini-table');container.append(table);}return container;}

 if(id===30){columns=['互斥活跃来源','主账号','占复合活跃'];rows=activityCombinations.map(item=>[item.label.replace('\n',''),number(v.exclusiveCells[item.key])+'人',v.composite>=30?percent(v.exclusiveCells[item.key]/v.composite):'样本不足']);note=`七类互斥组合合计 ${number(v.composite)} 人；App ${number(v.app)}、内容 ${number(v.content)}、推送 ${number(v.pushClicked)} 为可重叠来源，不能相加。`;}
 if(id===36){columns=['增值包','有效权益主账号','渗透率'];rows=[['任一增值包',number(v.anyPack.numerator)+'人',topicRateText(v.anyPack)],...Object.entries(v.byPack).map(([name,part])=>[name,number(part.numerator)+'人',topicRateText(part)])];note='各包可重叠，人数不可相加；分母为同日付费权益主账号。';}
 if(id===38){const source=structureMetricViews();if(source.reason)return null;const container=element('div','topic-structure-dimensions');for(const view of source.views)container.append(dataTable({title:view.label,columns:['类别','数量','占比'],rows:view.rows.map(([label,n])=>[label,number(n)+view.unit,percent(n/view.denominator)]),note:`同口径分母 ${number(view.denominator)}${view.unit}；本维度独立归一化。`},'topic-mini-table'));return container;}
 if(id===39){columns=['型号','主账号','30天活跃率','订阅率'];rows=Object.entries(v).map(([name,r])=>[name,number(r.owners)+'人',percent(r.activeRate),percent(r.subscriptionRate)]);note='同型号主账号为分母；各型号可能共享主账号，不能相加。';}
 if(id===40){columns=['自报渠道','样本主账号','7日激活','活跃率','订阅率','月付款人数','ARPPU'];rows=Object.entries(v).map(([name,r])=>[name,number(r.owners),percent(r.activation7dRate),percent(r.activeRate),percent(r.subscriptionRate),number(r.monthlyPayers),'$'+r.ARPPU.toFixed(2)]);note='自报渠道合成样本；不同窗口单独解释，不视为平台归因或因果。30日激活率待补；未提供具体统计月份。';}
 if(id===51){columns=['观察项','当前结果'];rows=[['去重解绑设备',number(v.observedUnboundDevices)+'台'],['解绑事件',number(v.unboundEvents)+'次'],['月初绑定设备解绑率',topicRateText(v.unboundDeviceRate,'台')],['7日回绑',topicRateText(v.reboundWithin7d,'台')],['30日回绑',topicRateText(v.reboundWithin30d,'台')]];note=`解绑批次 ${v.cohort}；未成熟观察窗不补零。`;}
 if(!rows)return null;
 const node=dataTable({title:'当前构成与完整摘要',columns,rows,note},'topic-mini-table');return node;
}
// Compact overview charts use raw scoped counts; the original table remains available.
function topicStructureGraphic(id,structure) {
 if(![3,5,15,27,30,34,36,38,39,40,47,48,51,52,53].includes(id)||!structure.querySelector('table'))return structure;
 const m=metric(id),groups=[];
 if(id===39){
  const entries=Object.entries(m.value);if(entries.some(([,r])=>[r.activeRate,r.subscriptionRate].some(v=>!Number.isFinite(v)||v<0||v>1)))return structure;
  const rows=structure.querySelectorAll('tbody tr');entries.forEach(([,r],i)=>[r.activeRate,r.subscriptionRate].forEach((rate,j)=>{const cell=rows[i].querySelectorAll('td')[j+1],color=[245,248,242].map((n,k)=>Math.round(n-rate*[213,189,195][k]));cell.style.backgroundColor=`rgb(${color.join(',')})`;cell.dataset.rate=String(rate);const luminance=color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,k)=>n+v*[.2126,.7152,.0722][k],0);cell.style.color=luminance<.179?'#fff':'#000';cell.classList.add('topic-heat-cell');}));
  const legend=element('div','topic-heat-legend');legend.append(element('span','','活跃率／订阅率 · 统一0–100%色阶'));for(const rate of [0,.25,.5,.75,1]){const cell=element('span','',percent(rate));cell.style.backgroundColor=`rgb(${[245,248,242].map((n,k)=>Math.round(n-rate*[213,189,195][k])).join(',')})`;cell.style.color=rate>=.75?'#fff':'#000';legend.append(cell);}structure.prepend(legend);return structure;
 }
 if(id===40){for(const [key,title] of [['activation7dRate','注册后7日激活率'],['activeRate','激活后30天活跃率'],['subscriptionRate','订阅率'],['monthlyPayers','月付款人数'],['ARPPU','ARPPU']]){const rate=key.endsWith('Rate');groups.push({title,rate,rateOnly:rate,unit:key==='ARPPU'?'美元/人':'人',decimal:key==='ARPPU',rows:Object.entries(m.value).map(([label,r])=>({label,n:r[key],rate:rate?r[key]:undefined}))});}}

 if(id===34){const p=paidRightsComposition();if(p.reason)return structure;groups.push({title:'付费权益构成',stack:true,denominator:p.parent.total,rows:['仅订阅','仅增值Pack','订阅和Pack都有'].map((label,i)=>({label,n:p.counts[i]}))});}
 if(id===3){const s=sourceData.snapshot;groups.push({title:'MRR组成',stack:true,money:true,denominator:s.totalMRR,rows:[{label:'基础订阅',n:s.baseMRR},{label:'增值Pack',n:s.packMRR}]});}
 if(id===36){const v=m.value,parts=[['任一增值包',v.anyPack],...Object.entries(v.byPack)];if(parts.some(([,r])=>r.kind!=='rate'||!Number.isFinite(r.value)))return structure;groups.push({title:'增值包渗透 · 各包可重叠',rate:true,rows:parts.map(([label,r])=>({label,n:r.numerator,rate:r.value}))});}
 if(id===38){const p=structureMetricViews();if(p.reason)return structure;for(const v of p.views)groups.push({title:v.label,denominator:v.denominator,unit:v.unit,rows:v.rows.map(([label,n])=>({label,n})).sort((a,b)=>b.n-a.n)});}
 if(id===48){const rows=sourceData.diagnostics.F.tables.find(t=>t.title==='每主账号绑定设备数分层').rows;groups.push({title:'主账号持有设备数',denominator:rows.reduce((n,r)=>n+r[1],0),rows:rows.map(r=>({label:r[0],n:r[1]}))});}
 if(id===5){for(const [line,parts] of Object.entries(m.value)){const denominator=Object.values(parts).reduce((a,b)=>a+b,0);if(denominator<30)return structure;groups.push({title:groupLabels[line]+' · '+number(denominator)+'主账号',stack:true,denominator,rows:Object.entries(parts).map(([key,n])=>({label:statusHistoryFields[key]??groupLabels[key],n,color:statusHistoryColors[key]}))});}}
 if(id===27){const p=featureUsageProjection();if(p.reason)return structure;const r=p.current;if(r.denominator<30)return structure;groups.push({title:'账号通知总开关',stack:true,denominator:r.denominator,rows:['on','off','unknown'].map((key,i)=>({label:['已确认开','已确认关','未知'][i],n:r.config[key],color:['#356d51','#9eaa9a','#d4d9d1'][i]}))});}
 if(id===30){const v=m.value;groups.push({title:'互斥活跃组合 · 每个主账号仅归一行',matrix:true,denominator:v.composite,rows:activityCombinations.map(c=>({label:c.label.replace('\n',''),n:v.exclusiveCells[c.key],sources:c.sources})).sort((a,b)=>b.n-a.n)});}
 if(id===52){const p=riskProjection();if(p.reason)return structure;const r=p.current;groups.push({title:'风险命中 · 互斥构成',denominator:r.intentOnly+r.behaviorOnly+r.both,rows:[{label:'仅意图层',n:r.intentOnly},{label:'仅行为叠加层',n:r.behaviorOnly},{label:'两者同时命中',n:r.both}]});}
 if(id===47){const table=sourceData.diagnostics.C.tables?.find(t=>t.title==='当前可升级设备固件结构'),rows=table?.rows;if(!rows?.length||rows.some(r=>!Number.isSafeInteger(r[1])||r[1]<0||r[2]!==rows[0][2])||rows.reduce((n,r)=>n+r[1],0)!==rows[0][2])return structure;groups.push({title:'可升级设备 · 固件版本构成',stack:true,unit:'台',denominator:rows[0][2],rows:rows.map(r=>({label:r[0],n:r[1]}))});}
 if(id===15){const p=bindingDeviceRows();if(!p.rows)return structure;groups.push({title:'等待首图 · 互斥时长分层',unit:'台',denominator:p.rows.length,rows:['超过3天、未满7天','7–13天','14天及以上'].map(label=>({label,n:p.rows.filter(r=>bindingWaitBand(r,p.at)===label).length}))});}
 if(id===53){const p=anomalyProjection();if(p.reason)return structure;groups.push({title:'同一24小时窗 · 发现事件分类',unit:'条',denominator:p.current.events.length,rows:['Business','Device','Quality'].map(key=>({label:optionLabel('anomalyType',key),n:p.current.events.filter(r=>r.anomalyType===key).length})).sort((a,b)=>b.n-a.n)});}
 if(id===51){const p=unbindingProjection();if(p.reason)return structure;const reasons=unbindingReasons(p),labels=unbindingIndex().source.reasons,rows=reasons.map(r=>({label:labels[r.key],n:r.count})).sort((a,b)=>b.n-a.n);groups.push({title:'首次解绑原因 · '+p.month,unit:'台',denominator:p.devices,rows});structure.append(dataTable({title:'首次解绑原因 · 去重设备',columns:['自报原因','设备（台）'],rows:rows.map(r=>[r.label,r.n]),note:'每台仅归入首次解绑原因；模拟自报标签不证明因果。原因与版本筛选只影响诊断清单。'},'topic-mini-table'));}
 const wrap=element('div','topic-visual-summary'+([5,38,40].includes(id)?' topic-visual-columns':''));
 for(const g of groups){
  if(g.rows.some(r=>!Number.isFinite(r.n)||r.n<0))return structure;
  const figure=element('figure','topic-composition'),caption=element('figcaption','',g.title);figure.append(caption);
  const scale=g.rate?1:g.stack?g.denominator:Math.max(...g.rows.map(r=>r.n),1);
  if(!(scale>0))return structure;
  if(!g.rate&&!g.stack)figure.append(element('p','topic-chart-scale',`${g.decimal?'金额':'数量'}尺度 0–${g.decimal?scale.toFixed(2):number(scale)}${g.unit||'人'}${Number.isFinite(g.denominator)?'；占比分母 '+number(g.denominator)+(g.unit||'人'):''}`));
  const stack=g.stack?element('div','topic-stack'):null;if(stack){stack.setAttribute('aria-hidden','true');g.rows.forEach((r,i)=>{const mark=element('span','topic-stack-segment');mark.style.width=(r.n/scale*100)+'%';mark.dataset.tone=String(i);if(r.color)mark.style.backgroundColor=r.color;stack.append(mark);});figure.append(stack);}
  if(g.matrix)figure.append(element('p','topic-chart-scale','来源矩阵：App / 内容 / 推送；实心为包含，空心为不包含。'));
  for(const [i,r] of g.rows.entries()){
   const row=element('div','topic-bar-row');row.dataset.value=String(r.n);row.dataset.scale=String(scale);
   const label=element('span','topic-bar-label',r.label),value=element('span','topic-bar-value',g.rateOnly?percent(r.n):g.decimal?'$'+r.n.toFixed(2)+'/人':g.money?'$'+number(r.n):number(r.n)+(g.unit||'人'));
   if(!g.rateOnly&&(g.rate||g.denominator>=30))value.append(element('span','topic-bar-share',' · '+percent(g.rate?r.rate:r.n/g.denominator)));
   if(g.stack){const key=element('span','topic-color-key');key.dataset.tone=String(i);if(r.color)key.style.backgroundColor=r.color;key.setAttribute('aria-hidden','true');label.prepend(key);}
   if(g.matrix){const sources=element('span','topic-source-matrix');sources.setAttribute('aria-hidden','true');for(const source of ['app','content','pushClicked'])sources.append(element('span',r.sources.includes(source)?'included':'',r.sources.includes(source)?'●':'○'));label.prepend(sources);}
   row.append(label,value);
   if(!g.stack){const track=element('div','topic-bar-track'),mark=element('span','topic-bar-mark');track.setAttribute('aria-hidden','true');mark.style.width=((g.rate?r.rate:r.n/scale)*100)+'%';track.append(mark);row.append(track);}
   figure.append(row);
  }
  if(g.rate)figure.append(element('p','topic-chart-scale','统一尺度 0–100%'));
  wrap.append(figure);
 }
 // Keep scope qualifications visible even when the exact-value table is closed.
 if(id===40)wrap.append(element('p','table-note','自报渠道样本主账号：'+Object.entries(m.value).map(([label,r])=>label+' '+number(r.owners)+'人').join('；')));
 if(id!==38){const notes=new Set();structure.querySelectorAll('.table-note').forEach(note=>{if(!notes.has(note.textContent)){wrap.append(note.cloneNode(true));notes.add(note.textContent);}});}
 if(id===51){const evidence=element('a','insight-link','核对原因与设备清单 ↗');evidence.href=routeHref('F',51,'groups');bindTopicDiagnosisLink(evidence);wrap.append(evidence);}
 const details=element('details','topic-chart-data');details.append(element('summary','','查看完整数据表'),structure);wrap.append(details);return wrap;
}
function topicTrendRange(history) {
 const values=history.values.filter(Number.isFinite);if(values.length<2)return null;
 const min=Math.min(...values),max=Math.max(...values),span=max-min;
 const count=['人','台','条','次'].includes(history.unit);
 const precision=count?0:Math.min(6,Math.max(2,span>0?1-Math.floor(Math.log10(span)):2));
 const format=n=>{const text=n.toLocaleString('en-US',{maximumFractionDigits:precision});return history.unit==='美元'?`$${text}`:history.unit==='美元/人'?`$${text}/人`:`${text}${history.unit??''}`;};
 const note=element('p','topic-trend-range',span===0?`序列各期均为 ${format(min)}`:`序列范围 ${format(min)}–${format(max)} · 独立缩放`);
 note.dataset.min=String(min);note.dataset.max=String(max);return note;
}
function drawTopicSparkline(box,history) {
 const values=history.values.filter(Number.isFinite);if(values.length<2){box.textContent='无可比趋势';return;}
 const min=Math.min(...values),max=Math.max(...values),spread=max-min||Math.max(1,Math.abs(max)*.02),low=min-spread*.15,high=max+spread*.15;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 240 40');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
 let d='',gap=true;history.values.forEach((n,i)=>{if(!Number.isFinite(n)){gap=true;return;}const x=2+i/Math.max(1,history.values.length-1)*236,y=36-(n-low)/(high-low)*32;d+=`${gap?'M':'L'}${x.toFixed(2)},${y.toFixed(2)} `;gap=false;});
 const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('vector-effect','non-scaling-stroke');svg.append(path);const selected=history.selectedPeriod?history.labels.indexOf(history.selectedPeriod):filterState.week&&/^W\d+$/.test(history.labels[0])?history.labels.indexOf('W'+filterState.week):history.values.length-1,n=history.values[selected];if(selected>=0&&Number.isFinite(n)){const dot=element('span','topic-sparkline-marker');dot.setAttribute('aria-hidden','true');dot.style.left=((2+selected/Math.max(1,history.values.length-1)*236)/240*100)+'%';dot.style.top=((36-(n-low)/(high-low)*32)/40*100)+'%';box.replaceChildren(svg,dot);}else box.replaceChildren(svg);
}
function topicNetChange(m){const n=m.value.closing-m.value.opening;return (n>=0?'+':'')+number(n);}
function renderTopicOverview(page) {
 disposeCharts();main.replaceChildren();
 const top=element('div','detail-heading');const home=element('a','back-link','← 返回经营总览');home.href=routeHref();
 top.append(home,element('p','eyebrow',`OPERATIONS / ${page} · 专题概览`),element('h1','',pages[page].title),element('p','heading-sub',pages[page].question));
 const body=element('div','detail-shell topic-overview');body.dataset.topic=page;body.append(filterBar(page));
 const highlights=element('div','topic-highlights');highlights.setAttribute('aria-label','专题重点摘要');
 for(const id of topicHighlights[page]){const s=metricCardSummary(id),link=element('a','topic-highlight');link.id=`topic-highlight-${page}-${id}`;link.href=routeHref(page,id);bindTopicDiagnosisLink(link);link.append(element('span','',s.label),element('strong','',s.text+s.unit),element('span','topic-highlight-window',topicMetricWindow(id)));highlights.append(link);}
 body.append(highlights,element('p','topic-reading-note','按业务分组浏览全部指标；短趋势各用独立刻度，不比较跨图斜率。点击指标进入完整诊断。'));
 const navigation=element('nav','section-navigation topic-navigation');navigation.setAttribute('aria-label','专题业务分组');
 body.append(navigation);
 let pairedGroup=null;
 topicGroups[page].forEach(([label,ids],index)=>{
  const section=element('section','topic-group');section.id=`topic-${page}-group-${index}`;
  const head=sectionTitle(`0${index+1} / ${ids.length} METRICS`,label);section.append(head);
  const grid=element('div','topic-metrics');
  for(const id of ids){
   const item=catalogItem(id),m=metric(id),s=metricCardSummary(id),card=element('article',`topic-metric${[5,30,38,39,40].includes(id)?' topic-metric-wide':''}`);card.id=`topic-${page}-metric-${id}`;card.dataset.metricId=String(id);
   const heading=element('div','metric-heading');heading.append(element('span','detail-kpi-id','#'+String(id).padStart(2,'0')),element('h3','',item.name),definition(id,item.name));card.append(heading);
   if(item.page!==page)card.append(element('p','topic-shared',`共享指标 · 归属${item.page} ${pages[item.page].title}`));
   card.append(element('p','topic-window',topicMetricWindow(id)));
   if(m.kind==='na'){card.append(element('p','na-note',displayValue(id)+'：'+m.reason));if(Number.isFinite(m.denominator))card.append(element('p','topic-context',`已知计数：${Number.isFinite(m.numerator)?number(m.numerator):'未知'} / ${number(m.denominator)}；不生成可靠比率。`));}
   else{
    const rows=topicMetricRows(id);if(rows.length){const values=metricSecondaryValues({fields:rows});for(const row of values.children){const dd=row.querySelector('dd'),parts=dd.textContent.split(' · ');if(parts.length===2){dd.replaceChildren(element('span','topic-main-value',parts[0]),element('span','topic-basis',' · '+parts[1]));}}if([12,28,43].includes(id))for(const row of values.children){const key=row.querySelector('dt').textContent.split(' ')[0],rate=m.value?.[key];if(rate?.kind==='rate'&&Number.isFinite(rate.value)){row.classList.add('topic-retention-cell');const color=[245,248,242].map((n,i)=>Math.round(n-rate.value*[213,189,195][i]));row.style.backgroundColor=`rgb(${color.join(',')})`;const luminance=color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);if(luminance<.179)row.classList.add('topic-retention-dark');}}card.append(values);}
    const structure=topicMetricStructure(id);if(structure)card.append(topicStructureGraphic(id,structure));
    if(id===47){const versions=sourceData.diagnostics.C.tables?.find(t=>t.title==='当前可升级设备固件结构');if(!effectiveFor(47).length&&versions)card.append(topicStructureGraphic(47,dataTable(versions,'topic-mini-table')));else card.append(element('p','topic-context','版本详细构成待补当前范围明细；不以总体版本人数替代筛后值。'));}
    if(id===23)card.append(element('p','topic-context','续订以当月到期主账号为分母；流失与取消以期初有效订阅为分母，人数可重叠，不能相加。取消不等于立即失去权益。'));
    if(id===22)card.append(element('p','topic-context','各权益耗尽人群可重叠；任一权益耗尽为去重并集，不能把子项人数相加。'));
    if(id===50)card.append(element('p','topic-context','前三项为互斥设备状态；共享两项分别是已绑定已激活、已绑定未激活的子集，不与前三项相加。'));
    if(id===29)card.append(element('p','topic-context','当前未使用池与历史回流入组不同；历史入组日期未提供，不用于跨期归因。'));
    if(id===12){const part=registrationProjection(12);if(!part.reason)card.append(element('p','topic-context',`D7采用W${part.current.week}，D30采用W${part.d30.week}；分别核对观察窗。`));}
    if(id===21)card.append(element('p','topic-net-change',`净增 ${topicNetChange(m)}人 · 期末减期初`));
    // These available structures already expose the same scope or interpretation.
    const contextCovered=structure?.querySelector('table')&&[3,30,34,51].includes(id);
    if(s.context&&!contextCovered)card.append(element('p','topic-context',s.context));
    const history=metricHistory(id),trend=headlineTrend(id);
    if(trend&&history){if(rows.length>1||[27,51].includes(id))trend.prepend(element('span','topic-trend-title',history.title+' · 趋势'));const box=trend.querySelector('.headline-sparkline');drawTopicSparkline(box,history);box.classList.add('topic-sparkline');const range=topicTrendRange(history);if(range)trend.append(range);card.append(trend);}
    else card.append(element('p','topic-no-history',m.kind==='group'?'当前构成 · 无可比历史':'当前结果 · 无可比历史'));
   }
   const context=metricFilterContext(id);if(context.ignored.length)card.append(element('p','metric-filter-scope',`未应用：${context.ignoredText}`));
   if(id===17&&context.composition?.length)card.append(element('p','metric-filter-scope',`开启者构成条件：${context.composition.map(([key,v])=>`${filterLabels[key]} ${optionLabel(key,v)}`).join('、')}；不改变总体开启率。`));
   const link=element('a','topic-diagnose',[28,43].includes(id)?'查看12批次留存热力图 ↗':'查看诊断 ↗');link.id=`topic-open-${page}-${id}`;link.href=routeHref(page,id);link.setAttribute('aria-label',`查看 #${id} ${item.name} 诊断`);bindTopicDiagnosisLink(link);card.append(link);grid.append(card);
  }
  section.append(grid);
  const next=topicGroups[page][index+1]?.[1],compact=list=>list?.length===1&&![5,30,38,39,40].includes(list[0]);
  if(!pairedGroup&&compact(ids)&&compact(next)){pairedGroup=element('div','topic-group-pair');body.append(pairedGroup);}
  if(pairedGroup){pairedGroup.append(section);if(pairedGroup.children.length===2)pairedGroup=null;}else body.append(section);
  const button=element('button','section-navigation-item',label);button.type='button';button.dataset.target=section.id;button.setAttribute('aria-controls',section.id);button.addEventListener('click',()=>{const h=section.querySelector('h2');h.tabIndex=-1;h.focus({preventScroll:true});section.scrollIntoView({block:'start',behavior:'instant'});updateSectionNavigation();});navigation.append(button);
 });
 main.append(top,body);updateSectionNavigation();
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
    const summary=metricCardSummary(item.id);
    const tr=element('tr','');
    const title=element('td','metric-heading');const link=element('a','metric-inventory-link',item.name);link.href=routeHref(page,item.id);title.append(link,definition(item.id,item.name));
    const result=element('td','');result.append(element('span','',`${summary.label===item.name?'':`${summary.label}：`}${summary.text}${summary.unit}`));
    summary.fields.forEach(([label,value])=>result.append(element('p','metric-table-context',`${label}：${value}`)));
    tr.append(element('th','',String(item.id).padStart(2,'0')),title,result,
      element('td','',policyFor(item.id).businessDimensions.map(key=>`${filterLabels[key]}${policyFor(item.id).unavailableDimensions.includes(key)?'（待补明细）':''}`).join('、')||'仅总体'));
    body.append(tr);
  });
  table.append(body);wrap.append(table);section.append(wrap);
  return section;
}
function trialSamplesPanel() {
  const page='D';
  const week=filterState.week??String(sourceData.weekly.at(-1).week);
  const result=trialRows(trialState({...filterState,week}));
  const measure=metric(18),panel=element('section','entity-workspace trial-samples');
  panel.append(element('h3','','成熟试用记录 · 支付失败样本'));
  if(!result.rows?.length) {
    panel.append(element('p','table-note',`W${week} · 当前范围支付失败数量 —`),
      element('p','na-note',`${measure.kind==='na'?measure.reason:result.reason??'当前范围没有可核验的成熟试用记录'}。不能将此状态解读为零失败。`));
    return panel;
  }
  const failed=result.rows.filter(row=>row.payment_status==='failed'),canLink=measure.kind!=='na';
  panel.append(element('p','table-note',`W${week} · 成熟试用 ${number(result.rows.length)} 人 · 支付失败 ${number(failed.length)} 条；下列最多5条参与当前范围的合成试用聚合，只作逐条核对入口。`));
  if(!canLink)panel.append(element('p','na-note',`${measure.reason}；记录保留供核对，当前指标尚不能作为问题登记基线。`));
  if(!failed.length) {panel.append(element('p','na-note','该范围无支付失败演示记录；不能据此推断真实业务没有失败。'));return panel;}
  const feedback=element('p','trial-sample-feedback table-note');feedback.hidden=true;
  panel.append(feedback);
  const list=element('div','trial-sample-list');
  failed.slice(0,5).forEach(row=>{
    const button=element(canLink?'button':'article','trial-sample-item');if(canLink)button.type='button';
    button.append(element('strong','',row.trial_id),element('span','',
      `${optionLabel('country',row.country)} · ${optionLabel('productLine',row.product_line)} · ${row.app_platform}`),
      element('span','',`${row.plan} ${row.billing_cycle==='monthly'?'月付':'年付'} · ${row.subscription_platform}`),
      element('span','',`观察至${row.outcome_observed_through}`),
      element('span',canLink?'trial-sample-action':'trial-sample-context',canLink?'关联到试用转正问题单 ↘':'仅供核对 · 暂不可登记'));
    if(canLink)button.addEventListener('click',()=>{
      const side=document.querySelector('.income-context');
      const alongside=side&&side.getBoundingClientRect().left>=panel.getBoundingClientRect().right;
      registerIssue(page,18,{preserveEvidence:Boolean(alongside)});
      const form=document.querySelector('.action-record');
      const linked=form?.querySelector('[name="linkedSample"]');
      if(!linked)return;
      const reference=`${row.trial_id} / ${row.user_id}`,existing=linked.value.trim();
      let message;
      if(existing&&existing!==reference)message=`当前问题单已有其他关联样本，未覆盖。若需更换，请在问题登记中人工核对后修改；原处理说明和基线保留。`;
      else if(existing===reference)message=`当前问题单已关联${row.trial_id}；再次选择未修改记录。`;
      else {
        linked.value=reference;
        const note=form.querySelector('[name="note"]');
        if(note&&!note.value.trim())note.value=`核对${row.trial_id}的支付失败记录与重试结果`;
        linked.dispatchEvent(new Event('input',{bubbles:true}));
        message=`已将${row.trial_id}关联到问题单草稿，请核对处理说明；保存后生效。`;
      }
      feedback.textContent=message;feedback.hidden=false;
      if(alongside) {
        const rail=form.closest('.income-context');
        rail.style.removeProperty('--context-height-limit');
        const stickyTop=parseFloat(getComputedStyle(rail).top),available=rail.parentElement.getBoundingClientRect().bottom-stickyTop-1;
        // A taller replacement form can meet the grid's bottom before its
        // sticky top, hiding its controls beneath the page navigation.
        if(rail.getBoundingClientRect().top<stickyTop&&available>rail.querySelector('.income-context-controls').offsetHeight+80)
          rail.style.setProperty('--context-height-limit',`${available}px`);
        const bounds=rail.getBoundingClientRect(),field=linked.getBoundingClientRect();
        const visibleTop=bounds.top+rail.querySelector('.income-context-controls').offsetHeight+12;
        if(field.top<visibleTop)rail.scrollTop+=field.top-visibleTop;
        else if(field.bottom>bounds.bottom-12)rail.scrollTop+=field.bottom-bounds.bottom+12;
      } else form.scrollIntoView({block:'center',behavior:chartAnimationDuration(1)?'smooth':'instant'});
      linked.focus({preventScroll:true});
      document.querySelector('#announcement').textContent=message;
    });
    list.append(button);
  });
  panel.append(list);
  return panel;
}
function registerIssue(page,id,{preserveEvidence=false}={}) {
  activeIssueMetrics.set(issueScopeKey(page),id);
  const side=preserveEvidence&&document.querySelector('.income-context');
  if(side) {
    const viewport={left:scrollX,top:scrollY,behavior:'instant'};
    const params=new URLSearchParams(location.hash.split('?')[1]??'');
    params.set('issue',String(id));
    pushRoute(`#/${page}?${params}`);lastRenderedHash=location.hash;
    side.dispatchEvent(new Event('register-issue'));
    // Replacing a sticky form can move Safari's viewport even though the evidence DOM is retained.
    scrollTo(viewport);
    return;
  }
  const target=new URL(routeHref(page,id),location.href);
  const params=new URLSearchParams(target.hash.split('?')[1]??'');
  if(diagnosticWorkspaceView!=='change')params.set('panel',diagnosticWorkspaceView);
  pushRoute(`#/${page}?${params}`);
  renderRoute({preserveScroll:true});
  const form=document.querySelector('.action-record');
  document.querySelector('.income-workspace')?.scrollIntoView({block:'start',behavior:'instant'});
  focusIssueOwner(form);
  document.querySelector('#announcement').textContent=`已打开 #${id} ${catalogItem(id).name} 的当前范围问题单；填写后保存本地记录`;
}
function registerIssueButton(page,id,{compact=false}={}) {
  const button=element('button','issue-register',compact?`登记 #${id} 问题`:`登记 #${id} ${catalogItem(id).name}问题`);button.type='button';
  button.dataset.metricId=String(id);
  if(!hasRegistrationBaseline(id)){button.disabled=true;button.title='当前批次没有可用完整观察基线';}
  button.setAttribute('aria-label',`登记 #${id} ${catalogItem(id).name} 的当前范围问题`);
  button.addEventListener('click',()=>registerIssue(page,id));
  return button;
}
const comparisonEvidenceIds=new Set([13,18,35,42]);
const comparisonEvidenceFilters=(id,state=filterState)=>effectiveFor(id,state).sort(([a],[b])=>a.localeCompare(b,'en'));
function currentComparisonEvidence(id) {
  if(!comparisonEvidenceIds.has(id)||metric(id).kind==='na'||filterErrors.length)return null;
  const base={version:1,metricId:id,filters:comparisonEvidenceFilters(id),asOf:sourceData.snapshot.asOf,rule:findingRuleVersion};
  if(id===35) {
    const change=subscriptionIncomeChange();if(!change)return null;
    return {...base,kind:'income',source:change.source,
      periods:[change.before,change.after].map((part,index)=>({label:savedMonthLabel(index?change.afterPeriod:change.beforePeriod),
        numerator:part.numerator,denominator:part.denominator})),
      contributions:[{name:'付款人数变化',value:change.payersContribution},{name:'ARPPU变化',value:change.arppuContribution}]};
  }
  const comparison=weeklyRateComparison(id);if(!comparison)return null;
  const periods=['before','after'].map(key=>({label:`${comparison[`${key}Label`]} · ${comparison[`${key}Window`]}`,
    numerator:comparison[key].numerator,denominator:comparison[key].denominator}));
  const parts=id===42?deviceEventGroupChanges(comparison):id===18&&!filterState.week?
    trialGroupContributions(['previous','current'].map(period=>trialRows(filterState,period).rows)):null;
  const matched=parts?.groups&&parts.overall.every((part,index)=>part.numerator===periods[index].numerator&&part.denominator===periods[index].denominator);
  return {...base,kind:'rate',source:comparison.source,unit:comparison.unit,periods,
    groups:matched?parts.groups.map((group,index)=>({name:group.name,
      periods:group.summaries.map(part=>({numerator:part.numerator,denominator:part.denominator})),
      contribution:parts.changes[index]})):[],
    groupNote:matched?'':parts?.reason??'当前比较未提供可核验的分组贡献，未保存分组判断。'};
}
function validComparisonEvidence(value,id,state=filterState) {
  if(!value||typeof value!=='object'||value.version!==1||value.metricId!==id||!comparisonEvidenceIds.has(id)||
    value.kind!==(id===35?'income':'rate')||typeof value.source!=='string'||typeof value.rule!=='string'||
    !baselineWindowEnd(`快照 ${value.asOf}`)||
    JSON.stringify(value.filters)!==JSON.stringify(comparisonEvidenceFilters(id,state)))return false;
  const count=part=>part&&Number.isFinite(part.numerator)&&Number.isFinite(part.denominator)&&part.denominator>=30&&
    (value.kind==='income'||part.numerator>=0&&part.numerator<=part.denominator);
  if(!Array.isArray(value.periods)||value.periods.length!==2||!value.periods.every(part=>count(part)&&typeof part.label==='string'))return false;
  if(value.kind==='income') {
    if(!Array.isArray(value.contributions)||value.contributions.length!==2||
      !value.contributions.every(part=>typeof part.name==='string'&&Number.isFinite(part.value)))return false;
    const [before,after]=value.periods,expected=Math.round((after.denominator-before.denominator)*
      (before.numerator/before.denominator+after.numerator/after.denominator)/2*100)/100;
    return Math.abs(value.contributions[0].value-expected)<1e-8&&
      Math.abs(value.contributions.reduce((sum,part)=>sum+part.value,0)-(after.numerator-before.numerator))<1e-8;
  }
  if(!['人','次'].includes(value.unit)||typeof value.groupNote!=='string'||!Array.isArray(value.groups)||value.groups.length>32)return false;
  if(!value.groups.length)return Boolean(value.groupNote);
  if(!value.groups.every(group=>typeof group.name==='string'&&Array.isArray(group.periods)&&group.periods.length===2&&
    group.periods.every(count)&&Number.isFinite(group.contribution)&&Math.abs(group.contribution-
      (group.periods[1].numerator/value.periods[1].denominator-group.periods[0].numerator/value.periods[0].denominator)*100)<1e-8))return false;
  return value.periods.every((part,index)=>['numerator','denominator'].every(key=>
    value.groups.reduce((sum,group)=>sum+group.periods[index][key],0)===part[key]));
}
function comparisonEvidenceSection(id,record) {
  const section=element('div','comparison-evidence');
  if(!comparisonEvidenceIds.has(id))return section;
  const current=currentComparisonEvidence(id),saved=record?.comparisonEvidence,exists=Boolean(record);
  const valid=validComparisonEvidence(saved,id);
  if(exists&&!valid) {
    section.append(element('p','table-note comparison-evidence-status',saved===null?
      '首次保存时无可比数据，未保存比较证据；原单点基线仍保留。':Object.hasOwn(record,'comparisonEvidence')?
      '已保存的比较证据无法核对或版本不支持；原内容保留，不用当前数据替换。':
      '旧记录未保存比较证据；仅保留原单点基线，不从当前数据补写历史。'));
    return section;
  }
  const evidence=exists?saved:current;
  if(!evidence) {
    section.append(element('p','table-note comparison-evidence-status','当前无两期可比数据；首次保存将保留单点基线，不生成比较证据。'));return section;
  }
  const result=value=>value.kind==='income'?
    `${value.periods.map(part=>`$${number(part.numerator)}`).join(' → ')}（变化 ${chartValue(value.periods[1].numerator-value.periods[0].numerator,'美元')}）`:
    `${value.periods.map(part=>percent(part.numerator/part.denominator)).join(' → ')}（${chartValue((value.periods[1].numerator/value.periods[1].denominator-value.periods[0].numerator/value.periods[0].denominator)*100,'个百分点')}）`;
  const changes=current?[['periods','两期窗口或计数'],['groups','分组贡献或计数'],['contributions','收入贡献'],
    ['groupNote','分组可用性'],['asOf','数据快照'],['source','来源'],['rule','规则']]
    .filter(([key])=>JSON.stringify(saved?.[key])!==JSON.stringify(current[key])).map(([,label])=>label):[];
  if(exists&&(!current||changes.length))section.append(element('p','action-baseline-note comparison-evidence-warning',
    `比较证据已变化：首次保存 ${result(saved)}；${current?`当前 ${result(current)}。${changes.join('、')}与原证据不同`:'当前缺少可比证据'}。图表为当前数据，首次保存的证据保留。`));
  const details=element('details','workspace-calculation saved-comparison-evidence');
  details.append(element('summary','',exists?'查看首次保存时的比较证据':'查看首次保存时将记录的比较证据'));
  details.append(element('p','table-note',`${evidence.source} · 数据快照 ${evidence.asOf} · 规则 ${evidence.rule}。${exists?'此处为首次保存的证据，更新处理进度不会覆盖。':'以下为当前比较事实，首次成功保存后固定。'}`));
  const scope=evidence.filters.map(([key,value])=>`${filterLabels[key]}：${key==='week'?`W${value}`:optionLabel(key,value)}`).join(' · ')||'总体 · 默认业务对象';
  details.append(element('p','table-note',`计算范围：${scope}。${result(evidence)}`));
  for(const part of evidence.periods)details.append(element('p','table-note evidence-period',evidence.kind==='income'?
    `${part.label}：订阅净收入 $${number(part.numerator)}／付款主账号 ${number(part.denominator)} 人；ARPPU $${(part.numerator/part.denominator).toFixed(2)}/人。`:
    `${part.label}：${number(part.numerator)}／${number(part.denominator)} ${evidence.unit}（${percent(part.numerator/part.denominator)}）。`));
  const list=element('ul','evidence-contributions');
  if(evidence.kind==='income')for(const part of evidence.contributions)list.append(element('li','',`${part.name}贡献：${chartValue(part.value,'美元')}。`));
  else {
    if(evidence.groups.length)details.append(element('p','table-note','下列分组分子除以同一期总体分母，用于验算变化贡献；组内率需按各组自己的分母另算。'));
    for(const group of evidence.groups)list.append(element('li','',`${group.name}：${group.periods.map((part,index)=>`${number(part.numerator)}／${number(evidence.periods[index].denominator)} ${evidence.unit}`).join(' → ')}；贡献 ${chartValue(group.contribution,'个百分点')}。`));
  }
  if(list.children.length)details.append(list);
  if(evidence.groupNote)details.append(element('p','table-note',evidence.groupNote));
  details.append(element('p','table-note','合成数据的比较与算术分解，不证明原因，也不表示处理后恢复。'));
  section.append(details);return section;
}
function actionRecord(page,evidenceId) {
  const defaultId=evidenceId;
  evidenceId=activeIssueMetrics.get(issueScopeKey(page))??evidenceId;
  const scope=recordScope(page,evidenceId);
  const key=`record:${page}:${scope}:${evidenceId}`;
  const current=simulatedActionState[key]??{};
  const draft=actionDrafts.get(key),initial=draft??current;
  const issueId=issueIdForKey(key,page,evidenceId);
  const currentBaseline=actionBaselineValue(evidenceId),currentWindow=actionBaselineWindow(evidenceId);
  const baseline=draft?.baseline??current.baseline??currentBaseline;
  const baselineAt=draft?.baselineAt??current.baselineAt??currentWindow;
  const form=element('form','action-record');
  form.noValidate=true;
  const header=element('div','action-record-header');
  const badge=element('span','action-stage-badge');header.append(element('strong','',`问题单 ${issueId}`),badge);
  const trialOpeningBaselineSaved=evidenceId===17&&baseline.startsWith('试用开启证据v1：');
  const registrationBaselineSaved=[9,10,12].includes(evidenceId)&&baseline.startsWith('注册批次证据v1：');
  const userRetentionBaselineSaved=evidenceId===28&&baseline.startsWith('新客留存证据v1：');
  const featureBaselineSaved=evidenceId===27&&baseline.startsWith('功能配置证据v1：');
  const riskBaselineSaved=evidenceId===52&&baseline.startsWith('风险证据v1：');
  const unbindingBaselineSaved=evidenceId===51&&baseline.startsWith('解绑月证据v1：');
  const qualityBaselineSaved=evidenceId===54&&baseline.startsWith('质量日证据v1：');
  const anomalyBaselineSaved=evidenceId===53&&baseline.startsWith('异常事件证据v1：');
  const deviceStateBaseline=evidenceId===50&&baseline.startsWith('设备状态计数：');
  const sessionBaseline=evidenceId===26&&baseline.startsWith('会话日证据v1：');
  const statusCountBaseline=evidenceId===5&&baseline.startsWith('状态人数：');
  form.append(header,element('p','table-note',`登记基线：${catalogItem(evidenceId)?.name??'当前证据'} ${trialOpeningBaselineSaved?'同源注册与两期试用开启计数':registrationBaselineSaved?'同源注册、绑定与首图计数':userRetentionBaselineSaved?'同源入组、成熟观察与留存计数':featureBaselineSaved?'两期功能与通知计数证据':riskBaselineSaved?'风险规则、快照与计数证据':unbindingBaselineSaved?'解绑月计数与分组证据':qualityBaselineSaved?'两日质量计数证据':anomalyBaselineSaved?'两窗异常事件证据':deviceStateBaseline?'完整设备状态计数':sessionBaseline?'完整日会话与分布证据':statusCountBaseline?'当前快照状态人数':baseline} · ${baselineAt}。`));
  if(trialOpeningBaselineSaved)form.append(trialOpeningBaselineDetails(baseline));
  if(registrationBaselineSaved)form.append(registrationBaselineDetails(baseline));
  if(userRetentionBaselineSaved)form.append(userRetentionBaselineDetails(baseline));
  if(featureBaselineSaved)form.append(featureUsageBaselineDetails(baseline));
  if(riskBaselineSaved)form.append(riskBaselineDetails(baseline));
  if(unbindingBaselineSaved)form.append(unbindingBaselineDetails(baseline));
  if(qualityBaselineSaved)form.append(qualityBaselineDetails(baseline));
  if(anomalyBaselineSaved)form.append(anomalyBaselineDetails(baseline));
  if(deviceStateBaseline){const detail=element('details','device-state-baseline-details');detail.append(element('summary','','查看首次保存的五项状态计数'),element('p','table-note',baseline));form.append(detail);}
  if(sessionBaseline)form.append(sessionDepthBaselineDetails(baseline));
  if(statusCountBaseline){const counts=element('details','status-baseline-details');counts.append(element('summary','','查看本次基线的完整状态人数'),element('p','table-note',baseline));form.append(counts);}
  let comparisonSection=comparisonEvidenceSection(evidenceId,simulatedActionState[key]);form.append(comparisonSection);
  const filterContext=metricFilterContext(evidenceId),scopeDetails=element('dl','action-scope');
  const calculationScope=filterContext.applied.map(([name,value])=>`${filterLabels[name]}：${name==='week'?`W${value}`:optionLabel(name,value)}`).join(' · ')||'总体 · 默认业务对象';
  const calculationDescription=element('dd','',calculationScope);
  if(evidenceId===43){const c=deviceRetentionCurrent();calculationDescription.append(element('p','table-note',c.reason?c.reason:`激活批次：${c.start}—${c.end}；D7／D30分别完整观察，设备状态按激活入组时冻结。`));}
  if(evidenceId===23)calculationDescription.append(element('p','table-note',`${actionBaselineWindow(23)}；旧周度结果与月度结果不能直接比较。`));
  if(evidenceId===24)calculationDescription.append(element('p','table-note',`留存观察月：${retentionSelection().month}；完整月，分母为上一基期月的复合活跃主账号。`));
  if(evidenceId===17)calculationDescription.append(element('p','table-note','总体开启率仅按国家、注册App及注册周计算；界面中产品线、套餐、周期和订阅平台仅筛已开启者构成，不是注册分母。'));
  if(filterContext.ignored.length)calculationDescription.append(element('span','action-scope-ignored',
    `未参与计算：${filterContext.ignoredText}（不适用于本指标）。`));
  scopeDetails.append(element('dt','','计算范围'),calculationDescription,element('dt','','界面条件'),element('dd','',scope));
  scopeDetails.id=`scope-${issueId}`;form.setAttribute('aria-describedby',scopeDetails.id);form.append(scopeDetails);
  const issueIds=[...new Set([defaultId,evidenceId,...sourceData.catalog.filter(item=>supportsPageMetric(page,item.id)&&
    (simulatedActionState[recordKey(page,item.id)]||actionDrafts.has(recordKey(page,item.id)))).map(item=>item.id)])];
  const switchLabel=element('label','issue-switch','同一界面条件下的问题单');
  const switcher=element('select','');switcher.name='issueMetric';
  const issueOptionLabel=id=>{
    const issueKey=recordKey(page,id);
    const state=actionDrafts.has(issueKey)?'未保存草稿':simulatedActionState[issueKey]?'已保存':'';
    return `${state?`${state} · `:''}#${id} ${catalogItem(id).name}`;
  };
  issueIds.forEach(id=>{const option=element('option','',issueOptionLabel(id));option.value=String(id);switcher.append(option);});
  switcher.value=String(evidenceId);switcher.addEventListener('change',()=>registerIssue(page,Number(switcher.value)));
  const updateIssueLabels=()=>{
    for(const option of switcher.options)option.textContent=issueOptionLabel(Number(option.value));
    switcher.title=switcher.selectedOptions[0]?.textContent??'';
  };
  updateIssueLabels();
  switchLabel.append(switcher);form.append(switchLabel);
  const legacyObservation=[11,13,18].includes(evidenceId)&&(current.baselineAt||draft?.baselineAt)&&!observedBaselineEnd(baselineAt);
  if(legacyObservation)form.append(element('p','action-baseline-note observation-legacy-note',
    `旧登记未保存结果观察截止；当前指标为 ${currentBaseline} · ${currentWindow}。原编号、基线、窗口和草稿保留，复查日期仍按原登记窗口校验；请人工核对原观察期是否完整。`));
  else if(evidenceId===17&&(current.baseline||draft?.baseline)){
    if(!trialOpeningBaselineSaved)form.append(element('p','action-baseline-note trial-opening-legacy-note','旧登记未保存同源注册分母与完整7天观察窗，旧方案范围可能用于估算开启率；当前方案属性仅筛开启构成。原编号、范围、基线、周期和草稿保留，不补写历史。'));
    else if(baseline!==currentBaseline||baselineAt!==currentWindow)form.append(element('p','action-baseline-note trial-opening-evidence-change','当前注册批次、两期计数或开启构成与首次保存不同；即使主值相同也需核对。保存进度保留首次证据。'));
  }
  else if([9,10,12,27,28].includes(evidenceId)&&(current.baseline||draft?.baseline)){
    const saved=[9,10,12].includes(evidenceId)?registrationBaselineSaved:evidenceId===27?featureBaselineSaved:userRetentionBaselineSaved;
    const name=[9,10,12].includes(evidenceId)?'registration':evidenceId===27?'feature':'user-retention';
    if(!saved)form.append(element('p',`action-baseline-note ${name}-legacy-note`,'旧登记未保存本次同源规则、计数或明确观察窗口，不能直接比较；原编号、范围、基线、比较证据和草稿保留，不补写历史。'));
    else if(baseline!==currentBaseline||baselineAt!==currentWindow)form.append(element('p',`action-baseline-note ${name}-evidence-change`,'当前窗口、计数、构成或观察成熟性与首次保存不同，即使主值相同也需核对；保存进度保留首次证据。'));
  }
  else if(evidenceId===52&&(current.baseline||draft?.baseline)){
    if(!riskBaselineSaved)form.append(element('p','action-baseline-note risk-legacy-note','旧登记只保存风险汇总，未保存逐账号规则与快照计数。当前数据与登记基线不同；原编号、范围、基线、周期与草稿保留，不补写历史。'));
    else if(baseline!==currentBaseline||baselineAt!==currentWindow)form.append(element('p','action-baseline-note risk-evidence-change','当前规则、快照、信号交集或账号命中与首次保存不同，即使总人数相同也需核对；保存处理进度保留首次证据。'));
  }
  else if(evidenceId===51&&(current.baseline||draft?.baseline)){
    if(!unbindingBaselineSaved)form.append(element('p','action-baseline-note unbinding-legacy-note','当前数据与登记基线不同：本项现按同源月台账计算。旧登记未保存台账计数与分组；原编号、范围、基线、周期与草稿保留，不补写历史。'));
    else if(baseline!==currentBaseline||baselineAt!==currentWindow)form.append(element('p','action-baseline-note unbinding-evidence-change','当前月窗、计数、成熟性或分组证据与首次保存不同，即使百分比相同也需核对；保存进度保留首次证据。'));
  }
  else if(evidenceId===54&&(current.baseline||draft?.baseline)){
    if(!qualityBaselineSaved||!baselineAt.startsWith('质量完整日v1'))form.append(element('p','action-baseline-note quality-legacy-note','旧登记未保存完整UTC日和独立质量计数；保留原编号、范围、基线、周期与草稿，不补写历史或当作同口径比较。'));
    else if(baseline!==currentBaseline||baselineAt!==currentWindow)form.append(element('p','action-baseline-note quality-evidence-change','当前日窗、计数或事件类型证据与首次保存不同，即使百分比相同也需核对。保存处理进度保留首次证据。'));
  }
  else if(evidenceId===53&&(current.baseline||draft?.baseline)){
    if(!anomalyBaselineSaved||!baselineAt.startsWith('异常24小时v1'))form.append(element('p','action-baseline-note anomaly-legacy-note','旧登记未保存24小时窗和事件明细；保留原编号、范围、基线、周期与草稿，不补写历史或当作同口径比较。'));
    else if(baseline!==currentBaseline||baselineAt!==currentWindow)form.append(element('p','action-baseline-note anomaly-evidence-change','当前事件窗口或记录证据与首次保存不同，即使条数相同也需核对。保存处理进度保留首次事件证据。'));
  }
  else if(evidenceId===50&&current.baseline&&!current.baseline.startsWith('设备状态计数：'))form.append(element('p','action-baseline-note device-state-legacy-note','原登记只保存摘要，未记录五项设备状态计数，不能据摘要相同断言共享构成未变。原编号、范围、基线、窗口和草稿保留，请对照当前完整状态表；保存进度不补写历史。'));
  else if(evidenceId===5&&current.baseline&&!current.baseline.startsWith('状态人数：'))form.append(element('p','action-baseline-note status-legacy-note','原登记只保存状态名称，未保存完整人数；不能自动判断状态是否变化。原编号、基线和草稿保留，不补写历史人数。'));
  else if(evidenceId===26&&(current.baseline||draft?.baseline)){
    if(!sessionBaseline||!baselineAt.startsWith('会话日口径v1'))form.append(element('p','action-baseline-note session-legacy-note','原登记未保存完整UTC日及分布频数，不能自动当作同口径比较；原编号、范围、基线、周期和草稿保留，不反推历史。'));
    else if(baseline!==currentBaseline||baselineAt!==currentWindow)form.append(element('p','action-baseline-note session-evidence-change','当前会话日窗、人数或分布证据与首次保存不同，即使三项主值相同也需核对。请展开原证据并对照当前完整频数；保存进度保留首次证据。'));
  }
  else if(baseline!==currentBaseline||baselineAt!==currentWindow)form.append(element('p',`action-baseline-note${evidenceId===5?' status-count-change':''}`,
    evidenceId===5?'当前状态人数与登记时不同，请展开基线人数并核对当前完整数据；保存进度保留原基线。':`当前指标：${currentBaseline} · ${currentWindow}。当前数据与登记基线不同，请核对；保存会保留原基线，不会更新指标数据。`));
  if(evidenceId===24&&current.baseline&&!current.baseline.includes('→'))form.append(element('p','action-baseline-note',
    '原登记未保存留存人数与基期月份；保留原文字基线，不补写或反推历史人数。'));
  if(evidenceId===16&&(current.baselineAt||draft?.baselineAt)&&!baselineAt.startsWith('首次内容完整周v1'))form.append(element('p','action-baseline-note activation-legacy-note','原汇总未注明首次内容统计期；本场景为新建的完整周模拟数据，不能把相同2,450台当作同口径历史。原编号、范围、基线、周期及草稿保留，不补写历史。'));
  if(evidenceId===23&&current.baselineAt&&!current.baselineAt.startsWith('月度续订观察期末'))form.append(element('p','action-baseline-note renewal-legacy-note','原登记为周度口径；当前为完整月口径，不能直接比较。原编号、基线、周期和草稿保留，不补写历史。'));
  if([4,25,30].includes(evidenceId)&&current.baselineAt&&!current.baselineAt.includes('活跃窗口v1'))form.append(element('p','action-baseline-note activity-legacy-note','旧登记未明确UTC零时及近1／7／30天窗口；原编号、基线、周期和草稿保留，不自动当作同窗口比较。'));
  if(evidenceId===38&&current.baseline&&!current.baseline.includes('分母'))form.append(element('p','action-baseline-note','原登记只保存结构摘要，未保存三类对象的完整人数与分母；原编号、基线和草稿保留，不补写历史。'));
  if(evidenceId===43&&current.baseline&&!current.baseline.includes('激活批次'))form.append(element('p','action-baseline-note','原登记未保存完整激活批次与D7／D30计数；旧编号、基线、日期和草稿保留，不反推或补写历史。'));
  if([41,44].includes(evidenceId)&&!baselineAt.includes('设备行为口径v1'))form.append(element('p','action-baseline-note device-definition-warning',
    '原登记未记录设备行为口径v1；旧观察窗口或来源不同，不能自动作同口径比较。即使百分比相同也不表示未变化。原编号、范围、基线和草稿保留，更新进度不改写原口径。'));
  const stages=element('ol','action-stages');stages.setAttribute('aria-label','问题单处理进度');
  ['待处理','核查中','待复查','人工确认'].forEach(label=>stages.append(element('li','',label)));form.append(stages);
  const registration=element('fieldset','action-registration');registration.append(element('legend','','核查登记'));
  const fields=element('div','action-record-fields');
  const ownerLabel=element('label','','负责人');const owner=element('input','');owner.name='owner';owner.placeholder='填写负责人';owner.value=initial.owner??'';ownerLabel.append(owner);
  const statusLabel=element('label','','处理状态');const status=element('select','');status.name='status';
  [['pending','待处理'],['reviewing','核查中'],['resolved','已处理，待复查'],['verified','复查通过（人工确认）']].forEach(([value,label])=>{const option=element('option','',label);option.value=value;status.append(option);});
  const statusValues=['pending','reviewing','resolved','verified'];status.value=statusValues.includes(initial.status)?initial.status:'pending';statusLabel.append(status);
  const dueLabel=element('label','','计划复查日');const due=element('input','');due.type='date';due.name='due';due.value=initial.due??'';dueLabel.append(due);
  const sampleLabel=element('label','','关联演示记录');const linkedSample=element('input','');linkedSample.name='linkedSample';linkedSample.placeholder='从上方记录关联或手动填写';linkedSample.value=initial.linkedSample??'';sampleLabel.append(linkedSample);
  const noteLabel=element('label','action-note-field','处理说明');const note=element('textarea','');note.name='note';note.placeholder='记录核查过程、发现和处理动作';note.value=initial.note??'';note.rows=2;noteLabel.append(note);
  fields.append(ownerLabel,statusLabel,dueLabel,sampleLabel,noteLabel);registration.append(fields);form.append(registration);
  const reviewDetails=element('details','action-review');reviewDetails.append(element('summary','','复查与验收'));
  const reviewFields=element('div','action-record-fields action-review-fields');
  const targetLabel=element('label','action-note-field','验收条件');const target=element('textarea','review-text');target.name='target';target.rows=3;target.placeholder='填写业务确认的目标';target.value=initial.target??'';targetLabel.append(target);
  const reviewLabel=element('label','action-note-field','复查实测值');const reviewValue=element('textarea','review-text');reviewValue.name='reviewValue';reviewValue.rows=3;reviewValue.placeholder='如 45.2% 或 434/1000';reviewValue.value=initial.reviewValue??'';reviewLabel.append(reviewValue);
  const reviewedLabel=element('label','','实际复查日');const reviewedAt=element('input','');reviewedAt.type='date';reviewedAt.name='reviewedAt';reviewedAt.value=initial.reviewedAt??'';
  const today=new Date();reviewedAt.max=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;reviewedLabel.append(reviewedAt);
  const baselineEnd=baselineWindowEnd(baselineAt);
  if(baselineEnd)reviewedAt.min=baselineEnd;
  const dateGuidance=element('p','table-note action-review-date-note',baselineEnd?
    `实际复查日不得早于原登记基线统计期末 ${baselineEnd}，且不能晚于今天。`:
    '原登记基线的统计期末无法核实，未推定最早复查日；请人工核对先后关系。实际复查日仍不能晚于今天。');
  dateGuidance.id=`review-date-guidance-${issueId}`;reviewedAt.setAttribute('aria-describedby',dateGuidance.id);
  reviewFields.append(targetLabel,reviewLabel,reviewedLabel);reviewDetails.append(element('p','table-note',
    '登记“复查通过”时，这三项必填。结果由人工确认，系统不自动验算目标是否达成。'),reviewFields,dateGuidance);form.append(reviewDetails);
  let savedDateWarning;
  if(current.reviewedAt&&(!draft||draft.reviewedAt===current.reviewedAt)&&reviewedAt.validity.rangeUnderflow) {
    savedDateWarning=element('p','action-baseline-note','原保存的实际复查日早于登记基线统计期末；原记录仍保留，再次保存前请核对并更正日期。');
    reviewDetails.append(savedDateWarning);
  }
  reviewDetails.open=['resolved','verified'].includes(status.value)||Boolean(target.value||reviewValue.value||reviewedAt.value);
  const save=element('button','action-toggle','保存本地记录');save.type='submit';
  const receipt=element('p','action-receipt');receipt.id=`receipt-${issueId}`;receipt.setAttribute('role','status');
  const footer=element('div','action-record-footer');footer.append(receipt,save);form.append(footer);
  const review=element('a','insight-link','复查关联指标 ↗');review.href=routeHref(page,evidenceId);form.append(review);
  const controls=[owner,status,due,target,note,linkedSample,reviewValue,reviewedAt];
  const fieldErrors=new Map();
  for(const control of controls) {
    const label=control.closest('label'),field=element('div',`action-field${label.classList.contains('action-note-field')?' action-note-field':''}`);
    control.id=`field-${issueId}-${control.name}`;label.htmlFor=control.id;
    const error=element('span','action-field-error');error.id=`error-${issueId}-${control.name}`;error.hidden=true;
    label.replaceWith(field);field.append(label,error);fieldErrors.set(control,error);
  }
  const clearFieldError=control=>{
    const error=fieldErrors.get(control);
    if(error){error.hidden=true;error.textContent='';}
    control.removeAttribute('aria-invalid');
    if(control===reviewedAt)control.setAttribute('aria-describedby',dateGuidance.id);
    else control.removeAttribute('aria-describedby');
  };
  const fieldErrorText=control=>{
    const labels={owner:'负责人',status:'处理状态',due:'计划复查日',target:'验收条件',note:'处理说明',
      linkedSample:'关联演示记录',reviewValue:'复查实测值',reviewedAt:'实际复查日'};
    const label=labels[control.name]??'有效信息';
    return control.validity.rangeUnderflow?`${label}不能早于原登记基线统计期末 ${baselineEnd}`:
      control.validity.rangeOverflow?`${label}不能晚于今天`:
      control.validity.badInput?`请填写有效的${label}`:`请填写${label}`;
  };
  const readFields=()=>Object.fromEntries(controls.map(control=>[control.name,control.value]));
  const savedFields=Object.fromEntries(controls.map(control=>{
    const value=current[control.name]??(control===status?'pending':'');
    // Native textareas normalize line endings; compare the same representation
    // without rewriting the original saved record on read.
    return [control.name,control.tagName==='TEXTAREA'&&typeof value==='string'?value.replace(/\r\n?/g,'\n'):value];
  }));
  let savedFingerprint=JSON.stringify(savedFields);
  const showReceipt=(text,state)=>{
    if(receipt.textContent!==text)receipt.textContent=text;
    receipt.dataset.state=state;receipt.setAttribute('role',state==='error'?'alert':'status');
  };
  const updateStage=()=>{
    const dirty=JSON.stringify(readFields())!==savedFingerprint;form.dataset.dirty=String(dirty);
    badge.textContent=`${dirty?'未保存 · ':''}${status.selectedOptions[0].textContent}`;
    badge.dataset.state=dirty?'draft':status.value;
    [...stages.children].forEach((stage,index)=>{
      const active=index===statusValues.indexOf(status.value);stage.toggleAttribute('data-active',active);
      if(active)stage.setAttribute('aria-current','step');else stage.removeAttribute('aria-current');
    });
    [target,reviewValue,reviewedAt].forEach(control=>{
      control.required=status.value==='verified';
      if(!control.required)control.setCustomValidity('');
      if(control.getAttribute('aria-invalid')==='true'&&control.validity.valid)clearFieldError(control);
    });
    return dirty;
  };
  function trackChanges() {
    const dirty=updateStage();
    if(dirty)actionDrafts.set(key,{...readFields(),baseline,baselineAt});else actionDrafts.delete(key);
    updateIssueLabels();updateActionDraftWarning();
    showReceipt(dirty?'更改尚未保存；切页暂存，刷新后会丢失。':simulatedActionState[key]?.updatedAt?
      `已保存至此浏览器：${simulatedActionState[key].updatedAt}`:'尚未记录；保存后仅在此浏览器保留。',dirty?'draft':'saved');
  }
  form.addEventListener('input',event=>{event.target.setCustomValidity('');clearFieldError(event.target);trackChanges();});
  status.addEventListener('change',()=>{if(['resolved','verified'].includes(status.value))reviewDetails.open=true;trackChanges();});
  updateStage();
  showReceipt(draft?'更改尚未保存；切页暂存，刷新后会丢失。':current.updatedAt?`已保存至此浏览器：${current.updatedAt}`:'尚未记录；保存后仅在此浏览器保留。',draft?'draft':'saved');
  form.addEventListener('submit',event=>{
    event.preventDefault();
    updateStage();
    if(!simulatedActionState[key]&&!hasRegistrationBaseline(evidenceId)) {
      showReceipt('当前指标没有可用登记基线，暂不能新建问题单；请先核对样本与适用范围。填写内容仍暂存在本次页面会话。','error');
      return;
    }
    [target,reviewValue].forEach(control=>control.setCustomValidity(control.required&&!control.value.trim()?'请填写此项复查信息':''));
    const invalid=controls.filter(control=>!control.checkValidity());
    if(invalid.length) {
      reviewDetails.open=true;
      showReceipt(invalid.map(fieldErrorText).join('；'),'error');
      invalid.forEach(control=>{
        const error=fieldErrors.get(control);error.textContent=fieldErrorText(control);error.hidden=false;
        control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',error.id);
      });
      invalid[0].focus();
      return;
    }
    const updatedAt=new Date().toLocaleString('zh-CN',{hour12:false});
    const record={issueId,owner:owner.value.trim()||'待指派',status:status.value,note:note.value.trim(),
      due:due.value,target:target.value.trim(),linkedSample:linkedSample.value.trim(),reviewValue:reviewValue.value.trim(),reviewedAt:reviewedAt.value,
      updatedAt,page,evidenceId,scope,filters:issueFilters(page,evidenceId),baseline,baselineAt,reviewMetric:evidenceId};
    const previous=simulatedActionState[key];
    if(previous&&Object.hasOwn(previous,'comparisonEvidence'))record.comparisonEvidence=previous.comparisonEvidence;
    else if(!previous&&comparisonEvidenceIds.has(evidenceId))record.comparisonEvidence=currentComparisonEvidence(evidenceId);
    if(!saveActionState(key,record)) {
      actionDrafts.set(key,{...readFields(),baseline,baselineAt});updateIssueLabels();updateActionDraftWarning();
      showReceipt('浏览器存储不可用，未保存；内容仍暂存在当前页面会话，刷新会丢失。','error');return;
    }
    controls.forEach(control=>{control.value=record[control.name];control.setCustomValidity('');clearFieldError(control);});
    savedFingerprint=JSON.stringify(readFields());actionDrafts.delete(key);updateIssueLabels();updateActionDraftWarning();updateStage();
    const nextComparison=comparisonEvidenceSection(evidenceId,record);
    const nextDisclosure=nextComparison.querySelector('details');
    if(nextDisclosure)nextDisclosure.open=Boolean(comparisonSection.querySelector('details')?.open);
    comparisonSection.replaceWith(nextComparison);comparisonSection=nextComparison;
    savedDateWarning?.remove();
    showReceipt(`已保存至此浏览器：${updatedAt} · ${status.selectedOptions[0].textContent}`,'saved');
  });
  return form;
}
function actionQueue(page,defaultMetric) {
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
    const metricNext={8:'核对累计激活与当前绑定的交叉状态；分别统计已激活未绑定设备，不用两个存量相减解释解绑。',
      41:'按设备活跃口径核对有效设备与活跃设备数，再按型号、固件比较。',
      42:'核对触发事件与有效内容次数，按型号、固件和安装场景排查；变化不直接证明算法或安装原因。',
      46:'分别核对上传、直播、推送失败次数和请求数，再按型号、固件查看错误码与失败记录。'};
    const summaries=ids.map(id=>metricCardSummary(id));
    const checks=dataTable({title:'所选范围的核对对象',columns:['指标','筛后信号','建议下一步'],rows:ids.map((id,index)=>[
      summaries[index].label,`${summaries[index].text}${summaries[index].unit}`,
      metric(id).kind==='na'?metric(id).reason:metricNext[id]??next[page]]),
      note:'点击指标查看同范围证据；卡片与本表共用指标摘要。当前为演示数据，阈值需业务确认。'},'action-checks');
    checks.querySelectorAll('tbody tr').forEach((row,index)=>{
      const id=ids[index],summary=summaries[index];row.dataset.metricId=String(id);
      const link=element('a','action-metric-link',summary.label);link.href=routeHref(page,id);
      link.setAttribute('aria-label',`查看${summary.label}的数据依据`);row.firstElementChild.replaceChildren(link);
      summary.fields.forEach(([label,value])=>row.children[1].append(element('p','metric-table-context',`${label}：${value}`)));
      if(summary.context)row.children[1].append(element('p','metric-table-context',summary.context));
    });
    section.append(checks);
    section.append(actionRecord(page,defaultMetric??findingId??info.heroIds[0]));
    return section;
  }
  section.append(sectionTitle('05  /  ACTION QUEUE','模拟行动出口','演示样本，处理记录保存在此浏览器；不会触达用户或连接外部系统'));
  const wrap=element('div','data-table-scroll');const table=element('table','diagnostic-table action-table');
  table.append(element('caption','visually-hidden',`${pages[page].title}模拟行动清单`));
  const head=element('thead','');const row=element('tr','');
  ['对象','触发信号','建议核对','责任角色','处理状态','更新时间','核对与研判'].forEach(label=>row.append(element('th','',label)));
  head.append(row);table.append(head);
  const body=element('tbody','');
  const feedback=element('p','action-operation-feedback');feedback.setAttribute('role','status');
  info.actions.forEach(item=>{
    const tr=element('tr','');
    tr.append(element('th','',item.object),element('td','',item.trigger),element('td','',item.suggestion),element('td','',item.owner));
    const key=`${page}:${item.id}`;
    const status=element('td','');const time=element('td','');
    const cell=element('td','');
    const button=element('button','action-toggle');button.type='button';
    button.dataset.actionId=item.id;
    const evidenceId=item.evidenceMetric??defaultFindingMetric[page];
    const evidenceLink=element('a','action-evidence-link','查看指标依据 ↗');evidenceLink.href=routeHref(contractFor(evidenceId).page,evidenceId);
    evidenceLink.setAttribute('aria-label',`${item.id}，查看${catalogItem(evidenceId).name}指标依据`);
    const update=()=>{const state=simulatedActionState[key];const complete=Boolean(state?.complete);status.textContent=complete?'演示已研判':item.status;time.textContent=state?.updatedAt??item.updatedAt;button.textContent=complete?'撤销本地标记':'模拟标记已研判';button.setAttribute('aria-pressed',String(complete));};
    update();
    button.addEventListener('click',()=>{
      const complete=!simulatedActionState[key]?.complete;
      const record={complete,updatedAt:`${new Date().toLocaleString('zh-CN',{hour12:false})}（本地演示）`,owner:item.owner,evidenceMetric:evidenceId};
      if(!saveActionState(key,record)) {
        feedback.setAttribute('role','alert');feedback.dataset.state='error';feedback.textContent=`${item.id} 未保存：浏览器存储不可用，研判标记保持原状态。`;return;
      }
      update();feedback.setAttribute('role','status');feedback.dataset.state='saved';feedback.textContent=`${item.id}${complete?'已保存研判标记':'已撤销本地标记'}。研判标记不表示问题已解决或复查通过。`;
    });
    cell.append(evidenceLink,button);tr.append(status,time,cell);body.append(tr);
  });
  table.append(body);wrap.append(table);section.append(wrap,element('p','table-note','指标依据用于核对同类信号；演示样本不参与总体聚合。清单标记与问题单的处理、复查进度分别登记。'),feedback,actionRecord(page,defaultMetric??defaultFindingMetric[page]));
  return section;
}
function filteredFinding(page,requestedId) {
  const m=id=>metric(id),isTarget=id=>requestedId===undefined||requestedId===id;
  const recentChange=id=>{
    const history=metricHistory(id);
    if(!history)return null;
    const index=history.selectedPeriod?history.labels.indexOf(history.selectedPeriod):filterState.week&&history.labels[0]?.startsWith('W')?
      history.labels.indexOf(`W${filterState.week}`):history.values.length-1;
    const now=history.values[index],before=history.values[index-1];
    return index>0&&Number.isFinite(now)&&Number.isFinite(before)?
      {delta:now-before,previous:history.labels[index-1],current:history.labels[index],unit:history.unit}:null;
  };
  const changeText=(change,digits=1)=>!change?'':
    `；${change.current}较${change.previous}${change.unit==='美元/人'?arppuChangeLabel(change.delta):trendMovement(change.delta,' '+(change.unit==='%'?'个百分点':change.unit),digits)}`;
  if(page==='A'&&isTarget(13)&&m(13).kind==='rate') {
    const t=weeklyRateComparison(13),week=filterState.week??sourceData.weekly.at(-1).week;
    return {id:13,comparison:t,text:`W${week}观鸟7日价值激活率 ${percent(m(13).value)}。${t?'按比较周期的合格注册人数合并计算。该变化不证明设备问题是原因。':'前期无可比样本，暂不生成变化判断。'}`};
  }
  if(page==='B'&&isTarget(27)&&filterState.functionType&&m(27).kind==='rate')
    return {id:27,text:`查看${optionLabel('functionType',filterState.functionType)}的活跃主账号 ${number(m(27).numerator)}/${number(m(27).denominator)}（${percent(m(27).value)}）。功能人数可能重叠，不与其他功能相加。`};
  if(page==='B'&&isTarget(29)&&filterState.season&&m(29).kind==='rate')
    return {id:29,text:`按${optionLabel('season',filterState.season)}${m(29).thresholdDays}天规则，${number(m(29).numerator)}/${number(m(29).denominator)}名可观察主账号未使用（${percent(m(29).value)}）。这是判定阈值变化，不是切换季节人群。`};
  if(page==='B'&&isTarget(25)&&m(25).kind==='group') {
    const p=activeWindowProjection(),w=activityWindows[activityWindowView],v=p.current.counts,b=p.rows.at(-2).counts;
    const change=key=>`${v[key]-b[key]>=0?'+':''}${number(v[key]-b[key])}人`;
    const ratio=v.MAU>=30?`近1天／近30天窗口规模比 ${(v.DAU/v.MAU*100).toFixed(1)}%，不是留存率。`:'当前样本不足30人，不展示窗口规模比。';
    return {id:25,rule:'active-windows-2026-10-18-v1',text:`${w.name}复合活跃 ${number(v[w.composite])} 人；App主动活跃 ${number(v[w.app])} 人。${activeWindowPeriod(w.days)}。分别较前日快照 ${change(w.composite)}／${change(w.app)}；${w.days===1?'相邻1天窗口不重叠，但变化不是新增主账号数':'窗口重叠，变化不是当日新增人数'}。${ratio}App为复合子集，窗口人数与每日快照不可相加；84日合成频数，不提供跨日账号轨迹。`};
  }
  if(page==='B'&&isTarget(29)&&m(29).kind==='rate')
    return {id:29,text:`按当前${m(29).thresholdDays}天阈值，${number(m(29).numerator)}/${number(m(29).denominator)}名可观察主账号未使用（${percent(m(29).value)}）。迁徙季与淡季规则不可当作两个互斥人群相加。`};
  if(page==='C'&&isTarget(42)&&m(42).kind==='rate') {
    const t=weeklyRateComparison(42),week=filterState.week??sourceData.weekly.at(-1).week;
    const parts=deviceEventGroupChanges(t);
    const contributions=parts.groups?`互斥分组贡献：${parts.groups.map((group,i)=>`${group.name} ${chartValue(parts.changes[i],'个百分点')}`).join('；')}。`:'';
    const basis=!t?'前期无可比样本，暂不生成变化判断。':parts.groups?
      '这是合成计数的算术分解，尚不能据此认定设备或固件是原因。':`${parts.reason}未据此生成分组变化判断。`;
    return {id:42,comparison:t,evidencePanel:parts.groups?'groups':undefined,text:`W${week}空触发率 ${percent(m(42).value)}。${t?'按比较周期的触发次数合并计算。':''}${contributions}${basis}`};
  }
  if(page==='C'&&isTarget(41)&&m(41).kind==='rate') {
    const part=deviceActivitySummary(41),change=recentChange(41);
    return {id:41,text:`近30天设备活跃率 ${percent(m(41).value)}（${number(part.active30)}/${number(part.denominator)} 台）${changeText(change)}。近24小时 ${number(part.active1)} 台、近7天 ${number(part.active7)} 台；窗口嵌套，不相加。纯心跳不计活跃；同一设备池30天未使用 ${number(part.unused30)} 台（${percent(part.unused30/part.denominator)}），两者互补。`};
  }
  if(page==='C'&&isTarget(44)&&m(44).kind==='rate') {
    const part=deviceActivitySummary(44),days=m(44).thresholdDays,returns=deviceReturnSummary();
    const history=returns.reason?'独立7天回流日期或计数待核验。':returns.denominator>=30?
      `独立历史${days}天未使用入组后7天回流 ${number(returns.numerator)}/${number(returns.denominator)} 台（${percent(returns.numerator/returns.denominator)}），入组 ${returns.entryAt.slice(0,10)}、观察至 ${returns.observedThrough.slice(0,10)}。`:
      `独立历史回流入组 ${number(returns.denominator)} 台，${returns.denominator?'少于30台，不生成可靠回流率':'无历史入组设备'}。`;
    return {id:44,text:`连续${days}天未使用 ${number(m(44).numerator)}/${number(part.denominator)} 台（${percent(m(44).value)}）${changeText(recentChange(44))}。${history}当前池与历史入组不同，不能相减或解读为召回效果。`};
  }
  if(page==='D'&&isTarget(22)&&filterState.plan==='Free'&&m(22).kind==='group') {
    const part=m(22).value.anyExhausted;
    return {id:22,text:`观鸟Free主账号中，任一权益用满 ${number(part.numerator)} / ${number(part.denominator)}（${percent(part.value)}）。付费试用与续费指标在Free筛选下不适用。`};
  }
  if(page==='D'&&isTarget(18)&&m(18).kind==='na')
    return {id:18,text:`试用转正率当前${m(18).availability==='pending'?'待补数据':'不适用'}：${m(18).reason}。请查看指标口径与可用明细。`};
  if(page==='D'&&isTarget(18)&&m(18).kind==='rate') {
    const comparison=weeklyRateComparison(18);
    if(filterState.week) {
      const currentWeek=Number(filterState.week);
      return {id:18,comparison,text:`W${currentWeek}成熟试用转正率 ${percent(m(18).value)}。转正 ${number(m(18).numerator)}/${number(m(18).denominator)}${comparison?'':'；前一周无可比样本'}。`};
    }
    const current=trialRows({...trialState(),week:undefined},'current');
    const previous=trialRows({...trialState(),week:undefined},'previous');
    if(current.rows&&previous.rows) {
      const now=trialAggregate(current.rows),before=trialAggregate(previous.rows);
      if(now.denominator>=30&&before.denominator>=30) {
        const targetNow=trialAggregate(current.rows.filter(isBirdPlusMonthlyAndroid));
        const targetBefore=trialAggregate(previous.rows.filter(isBirdPlusMonthlyAndroid));
        let text=`W12成熟试用转正率 ${percent(m(18).value)}。W12转正 ${number(m(18).numerator)}/${number(m(18).denominator)}。`;
        if(targetNow.denominator>=30&&targetBefore.denominator>=30)
          text+=`观鸟 Android Plus月付组周均转正 ${Math.round(targetBefore.numerator/9)}→${Math.round(targetNow.numerator/3)} 人，周均支付失败 ${Math.round(targetBefore.failed/9)}→${Math.round(targetNow.failed/3)} 人；两项变化同步，尚不能据此确认因果。`;
        return {id:18,comparison,text};
      }
    }
    return {id:18,text:`当前试用转正 ${number(m(18).numerator)}/${number(m(18).denominator)}（${percent(m(18).value)}）；可比批次样本不足，暂不生成变化判断。`};
  }
  if(page==='B'&&requestedId===26&&m(26).kind==='group'){const r=sessionDepthProjection().current;return {id:26,text:`最近完整UTC日 ${r.start.slice(0,10)} → ${r.end.slice(0,10)}，${number(r.accounts)}名App活跃主账号产生${number(r.sessions)}次有效前台会话；人均 ${sessionDepthNumber(r.frequency,2)}次。时长合格样本${number(r.timedSessions)}次，P50 ${sessionDepthDuration(r.p50,r.timedSessions)}、P90 ${sessionDepthDuration(r.p90,r.timedSessions)}。使用次数与时长上升不直接表示留存改善；请结合日期分布核对，版本、用户类型和逐用户来源待补。`};}
  if(requestedId===7&&m(7).kind==='group'){const v=m(7).value;return {id:7,text:`当前累计注册 ${number(v.registered)} 人，其中当前绑定 ${number(v.boundOwners)} 人，当前无主设备绑定 ${number(v.registered-v.boundOwners)} 人。${v.registered>=30?`绑定占比 ${percent(v.boundOwners/v.registered)}。`:'绑定占比分母不足30人。'}月末与当前是存量快照，差值不代表新增注册批次的转化或流失；国家×App固定归属为合成设定。`};}
  if(page==='E'&&requestedId===36&&m(36).kind==='group') {
    const part=packPenetrationFacts();
    return {id:36,text:`${sourceData.snapshot.asOf} 当前有效Pack持有人 ${number(part.anyPack.numerator)} / ${number(part.anyPack.denominator)} 人（${percent(m(36).value.anyPack.value)}）。五类持有合计 ${number(part.membershipSum)} 主账号次，超出去重人数 ${number(part.duplicateMemberships)} 次，不能据此确定多Pack人数。历史趋势与具体重叠组合待补；当前国家、App与订阅平台仍为模拟分片估算。`};
  }
  if(page==='E'&&isTarget(35)&&m(35).kind==='group') {
    const v=m(35).value;
    const incomeChange=subscriptionIncomeChange();
    if(incomeChange) {
      const direction=incomeChange.delta>0?'增加':incomeChange.delta<0?'减少':'持平';
      const signed=value=>`${value>=0?'+':'−'}$${number(Math.abs(value))}`;
      return {id:35,incomeChange,text:`${incomeChange.afterLabel}较${incomeChange.beforeLabel}订阅净收入${direction}${incomeChange.delta?` $${number(Math.abs(incomeChange.delta))}`:''}（$${number(incomeChange.before.numerator)} → $${number(incomeChange.after.numerator)}）。付款人数项 ${signed(incomeChange.payersContribution)}，ARPPU项 ${signed(incomeChange.arppuContribution)}。${incomeChange.source}；算术拆分不代表价格或经营原因。`};
    }
    return {id:35,text:`所选范围的月度订阅付款主账号 ${number(v.monthlySubscriptionPayers)} 人，订阅净收入 $${number(v.subscriptionNetIncome)}，ARPPU $${v.ARPPU.toFixed(2)}${changeText(recentChange(35),2)}。付款人数与ARPPU的月度趋势分别见下方图表。`};
  }
  if(page==='E'&&isTarget(39)&&m(39).kind==='group') {
    const entries=Object.entries(m(39).value),prefix=filterState.country?`${optionLabel('country',filterState.country)} · `:'';
    const boundary='仅覆盖可归属主型号的合成样本；不代表全部合资格主账号，也不能据此判断型号差异的原因。';
    if(entries.length===1) {
      const [name,part]=entries[0];
      return {id:39,text:`${prefix}${name}主型号样本 ${number(part.owners)} 位主账号，其中有效订阅 ${number(part.subscribedOwners)} 位，订阅率 ${percent(part.subscriptionRate)}。${boundary}`};
    }
    const owners=entries.reduce((sum,[,part])=>sum+part.owners,0),subscribed=entries.reduce((sum,[,part])=>sum+part.subscribedOwners,0);
    const rates=entries.map(([,part])=>part.subscriptionRate),low=Math.min(...rates),high=Math.max(...rates);
    const range=percent(low)===percent(high)?`各型号订阅率按一位小数显示均为 ${percent(low)}，精确人数见数据表`:
      `各型号订阅率范围 ${percent(low)}–${percent(high)}`;
    return {id:39,text:`${prefix}${entries.length}种主型号样本，合计 ${number(owners)} 位主账号。其中有效订阅 ${number(subscribed)} 位，合并订阅率 ${percent(subscribed/owners)}（按主账号人数计算）；${range}。${boundary}`};
  }
  if(page==='E'&&isTarget(40)&&m(40).kind==='group') {
    const entries=Object.entries(m(40).value).sort(([a],[b])=>a.localeCompare(b,'en'));
    const facts=entries.map(([channel,part])=>`${channel} ${number(part.owners)} 位主账号，订阅率 ${percent(part.subscriptionRate)}`).join('；');
    return {id:40,text:`当前 ${entries.length} 个自报渠道演示样本。${facts}。各渠道分别核对，不将分组人数相加作为总用户；渠道为用户自报，不能直接解释购买归因。`};
  }
  if(page==='F'&&requestedId===50&&m(50).kind==='group'){const part=deviceStateProjection(),v=part.value;return {id:50,text:`当前绑定 ${number(v.boundActivated)}＋${number(v.boundNotActivated)}＝${number(part.boundCurrent)} 台；累计激活 ${number(v.boundActivated)}＋${number(v.activatedUnbound)}＝${number(part.activatedCumulative)} 台。其中共享 ${number(v.sharedBoundActivated)}＋${number(v.sharedBoundNotActivated)}＝${number(part.shared)} 台，与同范围设备共享指标分子一致。当前是合成状态快照，不能用存量差推断解绑或迁移。`};}
  if(page==='F'&&isTarget(48)&&m(48).kind==='rate'&&m(49).kind==='rate')
    return {id:48,text:`多设备主账号占比 ${percent(m(48).value)}${changeText(recentChange(48))}；设备共享率 ${percent(m(49).value)}。前者以主账号为分母，后者以当前绑定设备为分母。`};
  if(page==='G'&&isTarget(53)&&m(53).kind==='count')return {id:53,text:`最新完整24小时有 ${number(m(53).value)} 条合成异常发现${changeText(recentChange(53),0)}；截至9/24 12:00 UTC。事件条数不表示严重程度或影响人数；先查看同源清单，关联指标另按自身窗口核对。`};
  if(page==='G'&&isTarget(54)&&m(54).kind==='group') {
    const value=m(54),quality=dataQualityState(value);
    const rates=quality.label==='演示预警'||quality.label==='演示正常'?
      `事件丢失率 ${qualityPercent(value.value.eventLoss.value)}（${value.value.eventLoss.numerator===null?'丢失数待核验':number(value.value.eventLoss.numerator)+' / '+number(value.value.eventLoss.denominator)+' 事件'}）；ID映射覆盖率 ${qualityPercent(value.value.idMapping.value)}（${number(value.value.idMapping.numerator)} / ${number(value.value.idMapping.denominator)}）。`:'';
    return {id:54,text:`数据质量：${quality.label}。${rates}${quality.reason}`};
  }
  if(requestedId!==undefined)return null;
  const fallback=dataset.diagnostics[page].heroIds.find(id=>m(id).kind!=='na')??
    sourceData.catalog.find(item=>item.page===page&&m(item.id).kind!=='na')?.id;
  return fallback?{id:fallback,text:`${catalogItem(fallback).name}为 ${displayValue(fallback)}。当前筛选下缺少可核验的趋势比较；请查看本项分子、分母和来源。`}:null;
}
function findingComparison(comparison) {
  const wrap=element('div','finding-comparison');wrap.dataset.metricId=comparison.id;
  const values=element('dl','finding-comparison-values');
  [['before',comparison.beforeLabel,comparison.beforeRate],['after',comparison.afterLabel,comparison.afterRate]].forEach(([period,label,rate])=>{
    const cell=element('div','');cell.dataset.period=period;
    cell.append(element('dt','',label),element('dd','',`${rate.toFixed(1)}%`));values.append(cell);
  });
  const delta=comparison.delta,steady=Math.abs(delta)<.05;
  const adverse=comparison.id===42?delta>0:delta<0;
  const change=element('p','finding-comparison-change',trendMovement(delta,' 个百分点'));
  change.dataset.direction=steady?'neutral':adverse?'adverse':'improving';wrap.append(values,change);
  return wrap;
}
function findingCalculation(comparison) {
  const table=element('table','finding-calculation');
  table.append(element('caption','visually-hidden','本条观察的比率计算依据'));
  const head=element('thead',''),headRow=element('tr','');
  ['周期','分子 / 分母','比率'].forEach(text=>headRow.append(element('th','',text)));head.append(headRow);table.append(head);
  const body=element('tbody','');
  [['before',comparison.beforeLabel,comparison.before,comparison.beforeRate],['after',comparison.afterLabel,comparison.after,comparison.afterRate]].forEach(([period,label,counts,rate])=>{
    const row=element('tr','');row.dataset.period=period;
    const heading=element('th','',label);heading.scope='row';
    row.append(heading,element('td','',`${number(counts.numerator)} / ${number(counts.denominator)}`),element('td','',`${rate.toFixed(1)}%`));body.append(row);
  });
  table.append(body);
  const names={13:'价值激活人数 / 合格观鸟注册人数',18:'转正人数 / 成熟试用人数',42:'空触发次数 / 总触发次数'};
  const wrap=element('div','finding-calculation-basis');
  wrap.append(element('p','finding-calculation-window',`${comparison.beforeWindow} → ${comparison.afterWindow}`),table,
    element('p','finding-calculation-note',`${names[comparison.id]}，单位：${comparison.unit}。先合并各周分子、分母，再计算比率；变化为后期比率减前期比率。`));
  if(comparison.series.some(value=>!Number.isFinite(value)))wrap.append(element('p','finding-calculation-note','样本少于30的周在折线上留空；合并率按整个比较周期的合格人数计算。'));
  return wrap;
}
function metricInspector(id,page) {
  const item=catalogItem(id),contract=contractFor(id),value=metric(id);
  const summary=metricCardSummary(id);
  const panel=element('div','metric-inspector-content');
  panel.append(element('p','inspector-kicker',`指标摘要 / #${String(id).padStart(2,'0')}`),
    element('h3','',item.name),element('strong','inspector-value',`${summary.text}${summary.unit}`));
  const rows=element('dl','inspector-facts');
  const fact=(label,text)=>{
    const row=element('div','');row.append(element('dt','',label),element('dd','',text));rows.append(row);
  };
  if(summary.label!==item.name)fact('当前主值',summary.label);
  if(id===38&&value.kind==='group'){const source=structureMetricViews();if(source.views){fact('国家／App平台分母',`${number(source.views[0].denominator)} 全部注册用户`);fact('型号分母',`${number(source.views[2].denominator)} 当前绑定设备`);fact('历史覆盖','仅当前快照；没有12个月结构历史，不生成趋势');}}
  summary.fields.forEach(([label,text])=>fact(label,text));
  fact('统计对象',metricEntityLabel(contract.entity));
  fact('时间窗口',id===17?trialOpeningWindow():id===16?activationDeviceWindow():contract.window);
  if([9,10,12].includes(id)&&value.kind!=='na'){const p=registrationProjection(id);fact('注册批次',`W${p.current.week} · ${p.current.start}—${p.current.end}`);if(id===10)fact('7天绑定',`${p.current.registered>=30?percent(p.current.bound7/p.current.registered):'无可靠比例'} · ${number(p.current.bound7)} / ${number(p.current.registered)}人`);if(id===12)fact('30日参照',`W${p.d30.week} · 观察至${p.d30.observed30Through}${p.d30.mature30?'':'，观察中'}`);}
  if(id===28&&value.kind==='group'){const p=userRetentionProjection();fact('入组方式',userRetentionTypeLabels[p.type]);fact('同批人数／批次',`${number(p.current.denominator)}人 · ${p.current.start}—${p.current.end}`);fact('观察截至',p.source.asOf+' UTC零时');}
  if(id===27&&value.kind==='rate'){const p=featureUsageProjection(),r=p.current;fact('同期App活跃',`${number(r.app)}人（功能使用者的上界）`);fact('通知开／关／未知',`${number(r.config.on)} / ${number(r.config.off)} / ${number(r.config.unknown)}人`);}
  if(id===17&&value.kind==='rate'){const p=trialOpeningComposition();fact('已开启者构成',`${number(p.count)} / ${number(p.total)}人；产品线／套餐／周期／订阅平台不作用于总体开启率`);}
  if(id===17&&metricFilterContext(17).composition.length)fact('仅开启构成筛选',metricFilterContext(17).composition.map(([key,value])=>`${filterLabels[key]} ${optionLabel(key,value)}`).join('、'));
  if(id===37&&value.kind==='group')fact('数据覆盖','原模拟汇总未明确月份；暂不计算月度变化或结构占比');
  if(id===23){const part=renewalProjection();if(!part.reason){const r=part.current;fact('到期月 / 最晚观察日',`${part.month} / ${new Date(Date.parse(r.renewalObservationEndExclusive)-86400000).toISOString().slice(0,10)}`);fact('发生权益流失 / 期初',`${number(r.lostDuring)} / ${number(r.opening)}人`);fact('主动取消 / 期初',`${number(r.cancelled)} / ${number(r.opening)}人`);}}
  if([11,13,18].includes(id)){const c=cohortObservation(id);fact('本批次 / 观察截止',c.reason?c.reason:`W${c.week} · ${c.start}—${c.end} / ${c.observedThrough}（UTC）`);}
  if(id===24){const part=retentionProjection(),row=part.rows?.find(r=>r.observedMonth===part.month);if(row)fact('基期 → 观察期',`${row.baseMonth} → ${row.observedMonth}`);}
  if(id===52&&value.kind==='count'){const p=riskProjection(),w=p.current;fact('风险快照',w.at);fact('意图／行为叠加',`${w.intent} / ${w.qualified}人，交集${w.both}人`);fact('互斥人数验算',`${w.intentOnly}＋${w.behaviorOnly}＋${w.both}＝${w.count}人`);fact('有记录演示群',`${w.eligible}人，非全站分母`);}
  if(id===51&&value.kind==='group'){const p=unbindingProjection();fact('解绑设备率',unbindingDevicePercent(p.rate));fact('30日回绑计数',unbindingBasis(p.D30));fact('30日成熟性',p.D30.status);}
  if(id===43&&value.kind==='group'){const c=deviceRetentionCurrent();fact('激活批次',`${c.start}—${c.end}`);fact('观察截至',`${sourceData.deviceRetentionFacts.asOf} UTC`);for(const key of ['D7','D30'])fact(`${key}留存设备`,`${deviceRetentionText(c.measures[key])} · ${c.measures[key].numerator===null?'批次观察未结束':`${number(c.measures[key].numerator)} / ${number(c.denominator)} 台`}`);}
  if(id===54&&value.kind==='group') {
    const quality=dataQualityState(value);fact('演示判定',quality.label);fact('判定依据',quality.reason);
  }
  if(value.kind==='rate')fact('本期分子 / 分母',`${number(value.numerator)} / ${number(value.denominator)}`);
  else if(value.kind==='na')fact('当前状态',value.reason);
  else if(id===46&&value.kind==='group') {
    Object.entries(value.value).forEach(([name,part])=>fact(`${groupLabels[name]}请求`,
      `${number(part.numerator)} / ${number(part.denominator)} 次成功；失败 ${number(part.denominator-part.numerator)} 次`));
    const history=technicalHistoryProjection();
    if(history.reason)fact('7天／30日历史',history.reason);
    else fact('最近7天加权成功率',history.names.map(name=>{const r=history.week[name];return `${groupLabels[name]} ${r.denominator>=30?percent(r.numerator/r.denominator):'分母不足30次'}`;}).join('；'));
  } else if(id===21&&value.kind==='group') {
    fact('期初 / 期末',`${number(value.value.opening)} / ${number(value.value.closing)}`);
    fact('本期净增',`${value.value.closing-value.value.opening>=0?'+':''}${number(value.value.closing-value.value.opening)} 人`);
  }
  const history=metricHistory(id);
  if(history) {
    const index=history.selectedPeriod?history.labels.indexOf(history.selectedPeriod):filterState.week&&history.labels[0]?.startsWith('W')?
      history.labels.indexOf(`W${filterState.week}`):history.values.length-1;
    const current=history.values[index],previous=history.values[index-1];
    if(index>0&&Number.isFinite(current)&&Number.isFinite(previous)) {
      const delta=current-previous;
      const amount=history.unit==='%'?`${Math.abs(delta).toFixed(1)} 个百分点`:
        history.unit==='美元/人'?`$${Math.abs(delta).toFixed(2)}`:
          `${number(Math.abs(Math.round(delta)))} ${history.unit}`;
      const change=history.unit==='次/人'?sessionDepthChange(current,previous,'次/人',2):history.unit==='美元/人'?arppuChangeLabel(delta):
        history.unit==='%'?trendMovement(delta,' 个百分点'):Math.abs(delta)<1e-10?'持平':`${delta>0?'上升':'下降'} ${amount}`;
      fact('较上一期',`${change} · ${history.labels[index-1]} → ${history.labels[index]}`);
    }
  }
  const scope=metricFilterContext(id);
  if(selectedFilters().length)fact('筛选范围',`${scope.applied.length?scope.applied.map(([key,option])=>`${filterLabels[key]} ${optionLabel(key,option)}`).join('、'):'本项仍为总体范围'}${scope.ignored.length?`；未应用：${scope.ignoredText}`:''}`);
  panel.append(rows);
  panel.append(element('p','inspector-source',value.kind==='na'?'当前条件没有可用结果。':
    id===17?trialOpeningNote:[9,10,12].includes(id)?'按同一注册批次、国家×注册App合成频数重算，计数、趋势与观察窗同源；不使用独立维度分片，不代表真实事件日志。':id===52?riskSourceCoverage:id===51?'月初绑定群与关系事件来自同一合成台账，按首次解绑锚定观察期；型号、原因与设备记录可逐层核对，未回绑不等于已流失。':id===7?'同一国家×App互斥合成存量逐行汇总；较上月末是月内存量变化，不是新增注册批次转化率或逐账号历史。':id===38?'现有总体人数、分母与底表比例已逐项核对；不代表付费人群，当前没有12个月历史。':
    id===43?'按首图激活周、国家、型号与自报渠道合成频数重算；状态按入组时冻结，后续停用不剔除。D30不是D7子集，不能解释为连续使用率。':
    id===23?'按完整到期月的合成频数重算，7天为演示观察窗；取消与发生权益流失可重叠，不等于离开产品。':[4,25,30].includes(id)?'按84日同源窗口频数及当前七类互斥构成核对；国家×平台固定归属，1／7／30天与App子集不相加。':id===24?'按所选完整自然月、国家与基期App平台汇总同一合成分组；人数重算留存率，不平均分组率。不是逐账号事件日志或真实经营历史。':
    [11,13].includes(id)?'按当前批次与筛选交集汇总同一合成频数；成功率与耗时同源，不是独立分片估算，仍非真实经营日志。':
    id===4?'同一国家×平台合成活跃窗口计数。':id===16?activationDeviceNote:id===15?'按同一合成设备台账逐台筛选和回算历史；不是独立分片估算，仍不代表真实运营数据。':
    id===42?'周×型号×固件合成触发计数重算；缺少维度明细时显示待补数据。':id===18?'合成试用明细按当前条件交集重算；完整批次见下方证据。':
      id===46?`${technicalRequestSource(id)}按当前条件重算；各链路使用自身请求数。`:
      scope.applied.length?'当前适用筛选结果含模拟分片估算；请结合左侧数据核对。':'结果来自演示底表；趋势中的构造数据在图注中说明。'));
  const link=element('a','inspector-link','查看图表与完整数据 ↓');
  link.href=routeHref(page,id);panel.append(link);
  if(value.kind!=='na')panel.append(registerIssueButton(page,id));
  return panel;
}
function qualityCheckSummary() {
  const quality=dataQualityState(metric(54));
  if(!quality.checks)return null;
  const list=element('dl','quality-checks');list.setAttribute('aria-label','当前数据质量检查');
  quality.checks.forEach(check=>{
    const row=element('div','quality-check');row.dataset.check=check.key;row.dataset.state=!check.available?'unavailable':check.warning?'warning':'normal';
    const result=element('dd','quality-check-result');
    result.append(element('strong','',check.available?percent(check.value):'待核验'),element('span','quality-check-status',
      !check.available?'无可核验比例':check.warning?check.upper?'高于演示上限':'低于演示下限':'演示范围内'));
    row.append(element('dt','',check.name),result,element('dd','quality-check-basis',
      `${check.available?number(check.numerator)+' / '+number(check.denominator):check.reason??'无合格分母'} ${check.unit} · 演示${check.upper?'上限 ≤':'下限 ≥'}${percent(check.limit)}`));
    list.append(row);
  });
  return list;
}
function diagnosticFinding(page,id,observation,{current=true}={}) {
  const finding=element(current?'aside':'div',current?'detail-finding':'page-observation-body');
  finding.dataset.metricId=String(id);
  const name=`#${String(id).padStart(2,'0')} ${catalogItem(id).name}`;
  if(current)finding.append(element('span','insight-tag',`当前指标 · ${name}`));
  if(observation) {
    const text=observation.text,end=text.indexOf('。');
    finding.append(element('h3',current?'finding-title':'page-finding-title',end>=0?text.slice(0,end):text));
    if(observation.comparison)finding.append(findingComparison(observation.comparison));
    if(observation.incomeChange)finding.append(incomeDriverSummary(observation.incomeChange));
    const qualitySummary=id===54?qualityCheckSummary():null;
    if(qualitySummary)finding.append(qualitySummary,element('p','finding-context',
      '最近完整UTC日；丢失率与ID映射覆盖率分别使用独立计数，均保留30日合成历史。按演示阈值判断，尚未确认生产达标标准。'));
    else if(end>=0&&text.slice(end+1))finding.append(element('p','finding-context',text.slice(end+1)));
    const basis=element('details','finding-basis');
    basis.append(element('summary','','合成数据 · 查看观察依据'));
    if(observation.comparison)basis.append(findingCalculation(observation.comparison));
    if(observation.incomeChange)basis.append(subscriptionIncomeCalculation(observation.incomeChange));
    basis.append(element('p','finding-meta',
      `演示文案规则 ${observation.rule??findingRuleVersion} · 证据指标 ${name} · ${observation.incomeChange?.source??observation.comparison?.source??(id===54?'事件及ID映射合成汇总':findingSource(id))}。不作因果归因。`));
    finding.append(basis);
  } else {
    const facts=metricInspector(id,page);
    facts.querySelectorAll('.inspector-kicker,.inspector-link,.issue-register').forEach(node=>node.remove());
    facts.querySelector('h3').className='finding-title';
    const status=element('p','finding-summary-status',metric(id).kind==='na'?'当前无可用结果 · 不生成诊断结论':'事实摘要 · 暂无该指标的诊断结论');
    facts.querySelector('.inspector-value').after(status);
    finding.append(facts);
  }
  const cross=element('a','insight-link',current?(observation?.evidencePanel==='groups'?'查看分组变化证据 ↓':'查看本条指标证据 ↓'):`查看 ${name} 证据 →`);
  if(observation?.evidencePanel)cross.dataset.evidencePanel=observation.evidencePanel;
  cross.href=routeHref(page,id,observation?.evidencePanel);finding.append(cross);
  // Other-page links belong to an authored observation, never to an unrelated factual summary.
  if(observation) {
    const info=dataset.diagnostics[page];
    const related=element('a','insight-link related-link',`${info.crossLabel} ↗`);
    related.href=routeHref(info.crossLink);finding.append(related);
    if(selectedFilters().some(([key])=>!relevantFilters(info.crossLink).includes(key)))
      finding.append(element('p','finding-meta','跨页时仅保留目标页支持的筛选条件。'));
  }
  if(current) {
    if(metric(id).kind!=='na')finding.append(registerIssueButton(page,id));
    else finding.append(element('p','table-note','当前证据待补数据或不适用；补齐可核验数据后再登记。'));
  }
  return finding;
}
function currentMetricObservation(page,id) {
  const wrap=element('div','workspace-observation');
  wrap.append(diagnosticFinding(page,id,filteredFinding(page,id)));
  const priority=filteredFinding(page);
  if(priority&&priority.id!==id) {
    const disclosure=element('details','page-observation');disclosure.dataset.metricId=String(priority.id);
    disclosure.append(element('summary','',`本页重点观察 · #${String(priority.id).padStart(2,'0')} ${catalogItem(priority.id).name}`),
      diagnosticFinding(page,priority.id,priority,{current:false}));
    wrap.append(disclosure);
  }
  return wrap;
}
function entitySamplesPanel(page) {
  if(page==='G')return anomalyEventExplorer();
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
  function select(record,index,announce=false) {
    const viewport={left:scrollX,top:scrollY,behavior:'instant'};
    buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    const header=[element('p','inspector-kicker',`${page==='C'?'设备':'事件'}样本 / ${record.id}`),
      element('h4','',record.signal),element('p','entity-sample-disclosure','模拟记录 · 不代表分组总体')];
    const facts=element('dl','inspector-facts');
    const fact=(label,value)=>{const row=element('div','');row.append(element('dt','',label),element('dd','',value));facts.append(row);};
    fact('观测时间',record.observedAt);fact('研判状态',record.status);
    if(page==='C') {
      for(const key of ['deviceModel','firmware','country','appPlatform','functionType'])
        fact(filterLabels[key],optionLabels[record.dimensions[key]]??record.dimensions[key]);
    } else {fact('所属领域',record.domain);fact('关联范围',record.scope);}
    const link=element('a','inspector-link','查看关联指标证据 ↗');
    link.href=routeHref(record.evidence.page,record.evidence.metricId);
    // Build the complete detail before replacing the sticky panel's content.
    detail.replaceChildren(...header,facts,
      element('p','entity-sample-context',record.detail??'该条是演示异常信号，不能替代原始事件或总体数据。'),
      element('p','entity-sample-review',`建议核对：${record.review}`),link);
    if(announce) {
      // Safari can move the viewport when sticky content is replaced (as with issue forms).
      scrollTo(viewport);
      document.querySelector('#announcement').textContent=`已选择 ${record.id}：${record.signal}；详情已更新。`;
    }
  }
  records.forEach((record,index)=>{
    const button=element('button','entity-sample-item');button.type='button';
    button.setAttribute('aria-controls',detail.id);
    button.append(element('span','entity-sample-id',record.id),element('strong','',record.signal),
      element('span','entity-sample-meta',`${record.observedAt} · ${record.status}`));
    button.addEventListener('click',()=>select(record,index,true));
    buttons.push(button);list.append(button);
  });
  grid.append(list,detail);panel.append(grid);select(records[0],0);
  return panel;
}
function updateSectionNavigation() {
  const navigation=document.querySelector('.section-navigation');
  if(!navigation)return;
  const entries=[...navigation.querySelectorAll('.section-navigation-item')].map(button=>({
    button,rect:document.getElementById(button.dataset.target)?.getBoundingClientRect()
  })).filter(item=>item.rect);
  if(!entries.length)return;
  const visibleTop=Math.max(0,navigation.getBoundingClientRect().bottom);
  const readingLine=visibleTop+Math.max(16,Math.min(160,(innerHeight-visibleTop)*0.15));
  let current=entries[0];
  for(const item of entries)if(item.rect.top<=readingLine&&(!navigation.classList.contains('topic-navigation')||item.rect.top>current.rect.top+1))current=item;
  if(scrollY>0&&(current.rect.top<visibleTop||innerHeight+scrollY>=document.documentElement.scrollHeight-2)) {
    // After a heading has passed the navigation, follow the main visible content.
    // This also avoids treating a short collapsed catalog as the section at the page bottom.
    const visibleHeight=item=>Math.max(0,Math.min(innerHeight,item.rect.bottom)-Math.max(visibleTop,item.rect.top));
    current=entries.reduce((best,item)=>visibleHeight(item)>visibleHeight(best)?item:best);
  }
  if(navigation.classList.contains('topic-navigation')) {
    const focusedId=document.activeElement?.closest('.topic-group')?.id;
    const focused=entries.find(item=>item.button.dataset.target===focusedId);
    // Paired sections share a scroll position; retain the section explicitly focused by the reader.
    if(focused&&Math.abs(focused.rect.top-current.rect.top)<1&&focused.rect.bottom>visibleTop)current=focused;
  }
  for(const {button} of entries)if(button===current.button)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
}
function renderDiagnosticWorkspace(page,top,body,overview,finding,selectedMetric,legacy) {
  body.classList.add('income-page');
  const evidence=legacy?.selectedEvidence??metricEvidence(selectedMetric,page),specs=[...evidence.specs,...(legacy?.specs??[])];
  body.replaceChildren(body.querySelector('.filter-bar'));
  const workspace=element('section','income-workspace');workspace.id=`${page}-diagnosis`;
  const layout=element('div','income-workspace-grid');
  const left=evidence.node;left.classList.add('income-evidence');
  const original=[...left.children];
  const availability=metric(selectedMetric).kind==='na'?original.find(node=>node.matches('.na-note')):null;
  if(availability)availability.id=`${page}-metric-availability-${selectedMetric}`;
  const heading=original[0];heading.querySelector('.section-kicker')?.remove();
  const metricHeading=heading.firstElementChild;metricHeading.classList.add('workspace-metric-heading');
  metricHeading.append(definition(selectedMetric,catalogItem(selectedMetric).name));
  const register=original.find(node=>node.matches('.issue-register'));if(register)heading.append(register);
  const tabs=element('div','income-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',`${pages[page].title}证据`);
  const panels=new Map(),buttons=new Map();
  for(const [key,label] of [['change',page==='E'?'变化拆分':'趋势与变化'],['groups','分组证据'],['data','完整数据']]) {
    const button=element('button','income-tab',label);button.type='button';button.id=`${page}-tab-${key}`;
    button.setAttribute('role','tab');button.setAttribute('aria-controls',`${page}-panel-${key}`);
    const panel=element('div','income-panel');panel.id=`${page}-panel-${key}`;panel.tabIndex=0;
    panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
    if(availability)panel.setAttribute('aria-describedby',availability.id);
    tabs.append(button);panels.set(key,panel);buttons.set(key,button);
  }
  const localControl=original.find(node=>node.matches('.retention-month-control'));
  left.replaceChildren(heading,original[1],...(localControl?[localControl]:[]),...(availability?[availability]:[]),tabs,...panels.values());
  let previousKind='data';
  for(const node of original.slice(2)) {
    if(node===availability||node===localControl||node.matches('.issue-register'))continue;
    const kind=node.dataset.evidenceKind??(node.matches('.na-note')?'change':node.matches('.detail-chart')?'groups':
      node.matches('.table-note')?previousKind:'data');
    previousKind=kind;
    if(node.matches('.detail-chart')) {
      const spec=specs.find(([box])=>box===node)?.[1];
      const chartPanel=element('section','detail-chart-panel workspace-chart-panel');
      chartPanel.dataset.evidenceMetric=String(selectedMetric);
      if(spec?.comparisonGroup)chartPanel.dataset.comparisonGroup=spec.comparisonGroup;
      if(spec?.kind==='periodComparison')chartPanel.classList.add('period-comparison');
      if(spec)chartPanel.append(element('h3','workspace-chart-title',spec.title));
      chartPanel.append(node);
      const scale=spec&&chartScaleNote(spec);if(scale)chartPanel.append(element('p','chart-scale-note',scale));
      if(spec)chartPanel.append(chartTable(spec));
      panels.get(kind).append(chartPanel);
      continue;
    }
    const preceding=panels.get(kind).lastElementChild;
    if(node.matches('.table-note')&&preceding?.matches('.workspace-chart-panel'))preceding.append(node);
    else panels.get(kind).append(node);
  }
  // Keep the full calculation adjacent but reveal it on demand at desktop widths.
  for(const pair of left.querySelectorAll('.evidence-pair')) {
    const table=pair.querySelector(':scope > .data-table-scroll');
    const disclosure=element('details','workspace-calculation');
    disclosure.append(element('summary','','查看计算依据与完整数值'),table);pair.append(disclosure);
  }
  const addChart=(container,spec)=>{
    spec=diagnosticChartFacts(page,spec);
    const panel=element('div','detail-chart-panel workspace-chart-panel');
    if(spec.metricId)panel.dataset.evidenceMetric=String(spec.metricId);
    panel.append(element('h3','workspace-chart-title',spec.title));
    if(spec.unavailableReason){panel.classList.add('paid-rights-unavailable');panel.append(element('p','na-note',spec.unavailableReason));container.append(panel);return;}
    const box=element('div','detail-chart');box.setAttribute('role','img');
    box.setAttribute('aria-label',`${spec.title}；${chartNote(spec)}`);
    panel.append(box);
    const scale=chartScaleNote(spec);if(scale)panel.append(element('p','chart-scale-note',scale));
    panel.append(element('p','table-note',spec.note),chartTable(spec));
    container.append(panel);specs.push([box,spec]);
  };
  if(page==='E'&&selectedMetric===35) {
    const histories=[paidPayersHistory(),metricHistory(35)].filter(Boolean);
    if(histories.length) {
      const trends=element('details','workspace-context monthly-comparison');
      trends.append(element('summary','','查看12个月付款人数与ARPPU趋势'));
      trends.append(element('p','table-note','按同一完整自然月对照：付款人数（人）与订阅ARPPU（美元/人）。两图纵轴独立取值，不能直接比较线条高低或斜率。'));
      const pair=element('div','monthly-trend-pair');
      for(const history of histories)addChart(pair,{title:`${history.title} · 最近${history.labels.length}个完整月`,unit:history.unit,
        labels:history.labels,details:history.details,series:[{name:history.title,values:history.values}],note:history.note});
      trends.append(pair);
      panels.get('change').append(trends);
    }
  }
  const info=dataset.diagnostics[page];
  let selectedStatusExplorer;
  if(selectedMetric===5) {
    selectedStatusExplorer=subscriptionStatusHistory();panels.get('change').prepend(selectedStatusExplorer.node);
    const historyData=element('details','workspace-context status-history-complete');
    historyData.append(element('summary','','查看12期全部订阅状态人数'),dataTable(subscriptionStatusHistoryTable(),'status-history-full'));
    panels.get('data').append(historyData);
  }
  let selectedActivityExplorer;
  if(page==='B'&&[4,25].includes(selectedMetric)&&metric(selectedMetric).kind!=='na'){
    selectedActivityExplorer=activityExplorer(selectedMetric===25?()=>{const old=finding.querySelector('.detail-finding[data-metric-id="25"]');if(old)old.replaceWith(diagnosticFinding('B',25,filteredFinding('B',25)));}:undefined,{metricId:selectedMetric,fixedDays:selectedMetric===4?30:null});
    panels.get('change').prepend(selectedActivityExplorer.node);
  }
  let selectedStructureExplorer;
  if(page==='E'&&selectedMetric===38&&metric(38).kind==='group'){
    const source=structureMetricViews(),wrapper=element('section','detail-chart-panel workspace-chart-panel structure-metric-evidence');wrapper.dataset.evidenceMetric='38';
    wrapper.append(element('p','table-note',`${sourceData.snapshot.asOf} · 总体演示快照；国家与App平台按注册用户，型号按绑定设备。仅当前结构，尚无12个月历史。`));
    selectedStructureExplorer=structureExplorer(source.views,{idPrefix:'metric38-structure',onSelect:view=>structureMetricContext(view,finding.querySelector('.metric-inspector-content'))});
    wrapper.append(selectedStructureExplorer.node);panels.get('groups').prepend(wrapper);
  }
  if(page==='E') {
    const context=element('details','workspace-context');context.append(element('summary','','其他付费结构与型号对照'));
    const ranking=modelSubscriptionRanking();
    if(ranking){addChart(context,ranking.spec);context.append(dataTable(ranking.table));}
    if(!hasDataFilters('E')) {
      info.extraCharts.slice(1).forEach(spec=>{
        if(spec.kind==='heatmap'&&metric(39).kind!=='group') {
          const unavailable=element('section','detail-chart-panel model-context-unavailable');
          unavailable.append(element('h3','',spec.title),element('p','na-note',`型号表现暂不可用：${metric(39).reason}。`));context.append(unavailable);
        }else addChart(context,spec);
      });
      if(selectedMetric!==38) {
        const source=structureMetricViews();
        if(source.reason)context.append(element('p','na-note structure-context-unavailable',`用户与设备构成暂不可用：${source.reason}`));
        else {
          const explorer=structureExplorer(source.views);context.append(explorer.node);
          context.addEventListener('toggle',()=>{if(context.open&&!explorer.node.dataset.initialized){explorer.init();explorer.node.dataset.initialized='true';}});
        }
      }
      const tables=element('details','workspace-context');tables.append(element('summary','','查看付费专题其他完整数据'));
      info.tables.filter(spec=>!(selectedMetric===35&&spec.title==='完整月付款与人均收入')).forEach(spec=>{
        const table=spec.title==='完整月付款与人均收入'?paymentMonthTable():
          spec.title==='设备型号订阅表现 · 主账号可跨型号'?modelContextTable():paidContextTable(spec);
        tables.append(dataTable(table,spec.title==='设备型号订阅表现 · 主账号可跨型号'?'model-context-calculation':''));
      });panels.get('data').append(tables);
    }
    if(context.children.length>1)panels.get('groups').append(context);
  }
  if(legacy) {
    const currentAvailable=metric(selectedMetric).kind!=='na';
    const contextual=(node,key,label)=>{
      const disclosure=element('details','workspace-context');
      const ownsSelectedChart=[node,...node.querySelectorAll('.detail-chart-panel')]
        .some(panel=>panel.dataset.evidenceMetric===String(selectedMetric));
      if(ownsSelectedChart&&!currentAvailable)return;
      if(ownsSelectedChart)disclosure.open=true;
      disclosure.append(element('summary','',label),node);panels.get(key).append(disclosure);
    };
    const hasSelectedHistory=[4,25].includes(selectedMetric)||Boolean(panels.get('change').querySelector('.detail-chart,.na-note'));
    const mainIsTrend=legacy.specs.some(([box,spec])=>legacy.analysisMain.contains(box)&&isTimelineSpec(spec));
    if(currentAvailable&&!hasSelectedHistory&&mainIsTrend&&[primaryTrendMetric[page],defaultFindingMetric[page]].includes(selectedMetric))
      panels.get('change').prepend(legacy.analysisMain);
    else if(![4,25,50].includes(selectedMetric))contextual(legacy.analysisMain,mainIsTrend?'change':'groups',currentAvailable?'专题概况与主线对照':`其他指标对照 · ${legacy.specs.find(([box])=>legacy.analysisMain.contains(box))?.[1]?.title??'专题证据'}`);
    const referenceData=element('details','workspace-context topic-reference-data');
    referenceData.append(element('summary','',`查看${pages[page].title}专题补充参考数据`),element('p','table-note','以下为专题补充对照；各表按自身统计对象、周期和分母解释。与当前指标不同的表格不作为本项计算依据。'));
    const supplemental=node=>{
      if(node.matches('.section-top'))return;
      if(node.matches('.trial-readiness')){
        if(selectedMetric===18)panels.get('change').append(node);
        else contextual(node,'change','其他指标核对 · #18 试用批次数据可用性');
        return;
      }
      if(node.matches('.anomaly-event-workspace')&&selectedMetric!==53){contextual(node,'groups','其他指标清单 · #53 异常发现');return;}
      if(selectedMetric!==18&&node.matches('.trial-samples')){contextual(node,'groups','其他指标样本 · #18 试用支付失败');return;}
      if(node.matches('.entity-workspace,.structure-explorer')){panels.get('groups').append(node);return;}
      if(node.matches('.evidence-charts-grid')){[...node.children].forEach(supplemental);return;}
      if(node.matches('.detail-chart-panel')) {
        const spec=legacy.specs.find(([box])=>node.contains(box))?.[1];
        if(spec&&(selectedMetric===50||selectedMetric===52&&spec.metricId!==52||spec.metricId&&spec.metricId!==selectedMetric))contextual(node,'groups',`其他指标对照 · ${spec.title}`);
        else if(spec&&isTimelineSpec(spec))contextual(node,'change',`补充趋势 · ${spec.title}`);
        else panels.get('groups').append(node);
        return;
      }
      referenceData.append(node);
    };
    [...legacy.evidence.children].forEach(supplemental);
    if(referenceData.children.length>2)panels.get('data').append(referenceData);
  }
  const queue=actionQueue(page,selectedMetric);
  let form=queue.querySelector('.action-record');
  const queueDetails=element('details','workspace-context');queueDetails.append(element('summary','','查看核查对象与演示行动清单'));
  queueDetails.append(queue);panels.get('data').append(queueDetails);
  const right=element('aside','income-context');right.setAttribute('aria-label','当前观察与问题登记');
  const rightControls=element('div','income-context-controls');
  const observationButton=element('button','','当前指标'),recordButton=element('button','','问题登记');
  observationButton.type=recordButton.type='button';
  observationButton.setAttribute('aria-controls',`${page}-workspace-observation`);recordButton.setAttribute('aria-controls',`${page}-workspace-record`);
  rightControls.append(observationButton,recordButton);
  finding.id=`${page}-workspace-observation`;
  const record=element('div','income-record');record.id=`${page}-workspace-record`;
  record.append(element('p','workspace-record-hint','本地问题单 · 保存仅保留在此浏览器'),form);
  right.append(rightControls,finding,record);
  const device=[15,43,52].includes(selectedMetric)?element('div',selectedMetric===52?'risk-account-rail':selectedMetric===15?'binding-device-detail':'retention-device-rail'):null;
  const deviceButton=device?element('button','',selectedMetric===52?'当前账号':'当前设备'):null;
  let currentRightMode='observation';
  if(device){device.id=`${page}-workspace-device`;deviceButton.type='button';deviceButton.disabled=true;deviceButton.setAttribute('aria-controls',device.id);rightControls.append(deviceButton);right.append(device);}
  const showRight=mode=>{
    currentRightMode=mode;finding.hidden=mode!=='observation';record.hidden=mode!=='record';
    if(device){device.hidden=mode!=='device';deviceButton.setAttribute('aria-pressed',String(mode==='device'));}
    observationButton.setAttribute('aria-pressed',String(mode==='observation'));
    recordButton.setAttribute('aria-pressed',String(mode==='record'));
  };
  if(device) {
    deviceButton.addEventListener('click',()=>showRight('device'));
    if(selectedMetric===52){workspace.addEventListener('risk-account-select',event=>{const {record:r,at,trigger}=event.detail,viewport={left:scrollX,top:scrollY,behavior:'instant'};deviceButton.disabled=false;device.replaceChildren(riskAccountDetail(r,at,()=>{const target=trigger?.isConnected?trigger:left.querySelector('.risk-account-list input');target?.focus({preventScroll:true});scrollTo(viewport);}));showRight('device');requestAnimationFrame(()=>{if(!workspace.isConnected||currentRightMode!=='device')return;const bounds=device.getBoundingClientRect();if(bounds.top>=innerHeight-80||bounds.bottom<=0){right.scrollIntoView({block:'start',behavior:'instant'});device.querySelector('.binding-device-back')?.focus({preventScroll:true});}});});workspace.addEventListener('risk-account-clear',()=>{deviceButton.disabled=true;if(currentRightMode==='device')showRight('observation');});}
    if(selectedMetric===43)workspace.addEventListener('device-retention-select',event=>{
      const {record:row,trigger}=event.detail,viewport={left:scrollX,top:scrollY,behavior:'instant'};deviceButton.disabled=false;
      device.replaceChildren(deviceRetentionDetail(row,()=>{const target=trigger?.isConnected?trigger:left.querySelector('.device-retention-list input');target?.focus({preventScroll:true});scrollTo(viewport);}));showRight('device');
      requestAnimationFrame(()=>{if(!workspace.isConnected||currentRightMode!=='device')return;const bounds=device.getBoundingClientRect();if(bounds.top>=innerHeight-80||bounds.bottom<=0){right.scrollIntoView({block:'start',behavior:'instant'});device.querySelector('.binding-device-back').focus({preventScroll:true});}});
    });
    workspace.addEventListener('binding-device-select',event=>{
      const row=event.detail?.record,trigger=event.detail?.trigger,viewport={left:scrollX,top:scrollY,behavior:'instant'};deviceButton.disabled=!row;
      if(!row){device.replaceChildren();if(currentRightMode==='device')showRight('observation');return;}
      device.replaceChildren(bindingDeviceDetail(row,chosen=>{
        const subject=form.querySelector('[name="issueMetric"]'),sample=form.querySelector('[name="linkedSample"]');
        if(subject.value!=='15')return '当前问题单属于其他指标，已保留其草稿；请先点击“登记#15”再关联设备。';
        if(sample.value.trim()&&sample.value.trim()!==chosen.id)return '已有其他关联样本，未覆盖；可在问题登记中人工核对后修改。';
        if(sample.value!==chosen.id){sample.value=chosen.id;sample.dispatchEvent(new Event('input',{bubbles:true}));}
        showRight('record');sample.focus({preventScroll:true});return '设备编号已填入草稿，尚未保存；原基线和源设备状态保持不变。';
      },()=>{
        const target=trigger?.isConnected?trigger:left.querySelector('.binding-list-controls input');
        target?.focus({preventScroll:true});scrollTo(viewport);
      }));showRight('device');
      requestAnimationFrame(()=>{
        const bounds=device.getBoundingClientRect();
        if(bounds.top>=innerHeight-80||bounds.bottom<=0){right.scrollIntoView({block:'start',behavior:'instant'});device.querySelector('.binding-device-back').focus({preventScroll:true});}
      });
    });
  }
  observationButton.addEventListener('click',()=>showRight('observation'));
  recordButton.disabled=!hasRegistrationBaseline(selectedMetric)&&!activeIssueMetrics.get(issueScopeKey(page));
  recordButton.addEventListener('click',()=>{
    const id=Number(form.querySelector('[name="issueMetric"]').value);
    activeIssueMetrics.set(issueScopeKey(page),id);
    const params=new URLSearchParams(location.hash.split('?')[1]??'');params.set('issue',String(id));
    history.replaceState(history.state,'',`#/${page}?${params}`);lastRenderedHash=location.hash;
    syncWorkspaceLinks();showRight('record');
  });
  right.addEventListener('register-issue',()=>{
    const replacement=actionRecord(page,selectedMetric);
    if(form.contains(document.activeElement))document.activeElement.blur();
    form.replaceWith(replacement);form=replacement;
    recordButton.disabled=false;
    syncWorkspaceLinks();showRight('record');
  });
  const routeParams=new URLSearchParams(location.hash.split('?')[1]??'');
  showRight(routeParams.has('issue')?'record':'observation');
  const hasSelectedGroupChart=[...panels.get('groups').querySelectorAll(
    `.evidence-pair[data-evidence-metric="${selectedMetric}"],.detail-chart-panel[data-evidence-metric="${selectedMetric}"]`)]
    .some(node=>!node.closest('details:not([open])'));
  const initialView=routeParams.has('panel')?diagnosticWorkspaceView:selectedMetric===15?'data':[4,25].includes(selectedMetric)?'change':
    panels.get('change').querySelector(':scope > .evidence-pair,:scope > .na-note,:scope > .analysis-main,:scope > .onboarding-duration')?'change':
      hasSelectedGroupChart?'groups':'data';
  function syncWorkspaceLinks() {
    for(const link of document.querySelectorAll('a[href]')) {
      const href=link.getAttribute('href');if(link.classList.contains('topic-return')||link.classList.contains('nav-link')||href.split('?')[0]!==`#/${page}`)continue;
      const params=new URLSearchParams(href.split('?')[1]??'');
      const issue=activeIssueMetrics.get(issueScopeKey(page));
      if(issue)params.set('issue',String(issue));else params.delete('issue');
      if(['change','groups','data'].includes(link.dataset.evidencePanel))params.set('panel',link.dataset.evidencePanel);
      else if(params.has('metric')||diagnosticWorkspaceView==='change')params.delete('panel');else params.set('panel',diagnosticWorkspaceView);
      link.href=`#/${page}${params.size?`?${params}`:''}`;
    }
  }
  const drawVisible=()=>{
    for(const [box,spec] of specs) {
      let closed=false;
      for(let ancestor=box.parentElement;ancestor&&ancestor!==workspace;ancestor=ancestor.parentElement)
        if(ancestor.hidden||ancestor.tagName==='DETAILS'&&!ancestor.open){closed=true;break;}
      if(closed||!box.isConnected||!box.getClientRects().length||!box.clientWidth)continue;
      drawEvidenceChart(box,spec);
    }
    const explorer=selectedActivityExplorer??selectedStatusExplorer??selectedStructureExplorer??evidence.explorer??legacy?.explorer;
    if(explorer&&!explorer.node.dataset.initialized&&explorer.node.getClientRects().length) {
      let visible=true;
      for(let node=explorer.node;node&&node!==workspace;node=node.parentElement)
        if(node.hidden||node.tagName==='DETAILS'&&!node.open){visible=false;break;}
      if(visible){explorer.init();explorer.node.dataset.initialized='true';}
    }
    explorer?.refresh?.();
    updateScrollableTables();
    updateSectionNavigation();
  };
  let evidenceNavigationRevision=0;
  const activate=(key,{focus=false,push=false}={})=>{
    const navigationRevision=++evidenceNavigationRevision;
    const viewport=push?{left:scrollX,top:scrollY,behavior:'instant'}:null;
    diagnosticWorkspaceView=key;
    for(const [name,panel] of panels) {
      panel.hidden=name!==key;buttons.get(name).setAttribute('aria-selected',String(name===key));
      buttons.get(name).tabIndex=name===key?0:-1;
    }
    if(push) {
      const params=new URLSearchParams(location.hash.split('?')[1]??'');
      if(key==='change'&&![5,15].includes(selectedMetric))params.delete('panel');else params.set('panel',key);
      pushRoute(`#/${page}${params.size?`?${params}`:''}`);lastRenderedHash=location.hash;
    }
    if(focus)buttons.get(key).focus({preventScroll:true});
    syncWorkspaceLinks();
    requestAnimationFrame(()=>{
      if(!workspace.isConnected||diagnosticWorkspaceView!==key)return;
      drawVisible();
      // Safari can move the viewport when the focused tab's panel changes height.
      if(viewport&&navigationRevision===evidenceNavigationRevision){scrollTo(viewport);updateSectionNavigation();}
    });
  };
  workspace.addEventListener('anomaly-window-select',event=>{const explorer=workspace.querySelector('.anomaly-event-workspace');if(!explorer?.selectAnomalyWindow)return;activate('groups',{push:true});explorer.selectAnomalyWindow(event.detail);document.querySelector('#announcement').textContent='已打开所选24小时窗清单；顶部主值和问题单保持不变。';});
  for(const [key,button] of buttons) {
    button.addEventListener('click',()=>activate(key,{push:true}));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const keys=[...buttons.keys()],index=keys.indexOf(key);
      const next=event.key==='Home'?keys[0]:event.key==='End'?keys.at(-1):keys[(index+(event.key==='ArrowRight'?1:keys.length-1))%keys.length];
      activate(next,{focus:true,push:true});
    });
  }
  for(const [key,panel] of panels)if(!panel.children.length&&!availability)
    panel.append(element('p','na-note',key==='change'?'当前指标没有可比历史；分组和完整值可在其他标签核对。':'当前筛选下没有可核验的分组数据。'));
  const groupPanel=panels.get('groups');
  const destinations=[...groupPanel.children].filter(node=>node.matches('.evidence-pair,.detail-chart-panel,.entity-workspace,.workspace-context'));
  if(destinations.length>1) {
    const navigation=element('nav','workspace-locations');navigation.setAttribute('aria-label','分组证据定位');
    navigation.append(element('span','workspace-location-label','定位证据'));
    const list=element('ul','workspace-location-list');
    destinations.forEach((target,index)=>{
      target.id=`${page}-group-evidence-${index}`;
      const heading=target.tagName==='DETAILS'?target.querySelector('summary'):target.querySelector('h3');
      const title=heading?.textContent??`证据 ${index+1}`;
      const button=element('button','workspace-location',title);button.type='button';
      button.title=title;button.setAttribute('aria-controls',target.id);
      button.addEventListener('click',()=>{
        evidenceNavigationRevision++;
        if(target.tagName==='DETAILS')target.open=true;
        const focus=heading??target;focus.tabIndex=-1;focus.focus({preventScroll:true});
        const offset=navigation.offsetHeight+parseFloat(getComputedStyle(navigation).top)+16;
        target.style.scrollMarginTop=`${offset}px`;
        target.scrollIntoView({block:'start',behavior:'instant'});
        if(getComputedStyle(right).position==='sticky') {
          const top=parseFloat(getComputedStyle(right).top),position=right.getBoundingClientRect().top;
          if(position<top)scrollBy({top:position-top,behavior:'instant'});
        }
        requestAnimationFrame(drawVisible);
      });
      const item=element('li','');item.append(button);list.append(item);
    });
    navigation.append(list);groupPanel.prepend(navigation);
  }
  // Pair the two views of the same mature cohorts; each keeps its own scale and calculation.
  const trialComparisons=[...groupPanel.children].filter(node=>node.dataset.comparisonGroup==='trial-periods');
  if(trialComparisons.length===2) {
    const comparison=element('div','trial-period-comparisons');
    trialComparisons[0].before(comparison);comparison.append(...trialComparisons);
  }
  workspace.addEventListener('toggle',()=>requestAnimationFrame(drawVisible),true);
  layout.append(left,right);workspace.append(layout);body.append(workspace);
  main.append(top,body);activate(initialView);
  document.querySelectorAll('.headline-sparkline').forEach(box=>{
    const id=Number(box.dataset.metricId),history=metricHistory(id);
    if(history)drawSparkline(box,history.values,id,history.labels,history.unit);
  });
}
function renderDetail(page,selectedMetric,showSelected=false) {
  disposeCharts();
  const detail=pages[page];
  const info=dataset.diagnostics[page];
  const week=sourceData.weekly.find(item=>String(item.week)===filterState.week);
  const period=page==='A'&&selectedMetric===16?`${activationDeviceWindow()}；其他指标按各自统计窗口`:week?`所选完整周 W${week.week} · ${week.weekEnd}；快照/月度指标不适用`:
    page==='D'?`试用明细最新成熟周截至 ${sourceData.weekly.at(-1).weekEnd}；其他指标按各自统计窗口`:info.period;
  main.replaceChildren();
  const top=element('div','detail-heading');
  const back=topicReturnLink(page,selectedMetric);
  top.append(back,element('p','eyebrow',`OPERATIONS / ${page} · 专题诊断`),
             element('h1','',detail.title),element('p','heading-sub',detail.question),element('p','detail-period',period));
  const body=element('div','detail-shell');
  body.append(filterBar(page));
  const overview=element('section','detail-section signal-overview');
  const finding=currentMetricObservation(page,selectedMetric);

  if(page==='E'){renderDiagnosticWorkspace(page,top,body,overview,finding,selectedMetric);return;}
  const drawSpecs=[];
  const addChart=(container,spec)=>{
    spec=diagnosticChartFacts(page,spec);
    if(spec.unavailableReason){const panel=element('section','detail-chart-panel');panel.append(element('h3','',spec.title),element('p','na-note',spec.unavailableReason));container.append(panel);return;}
    if(spec.kind==='heatmap'&&!spec.sampleSizes&&metric(39).kind==='group')
      spec={...spec,sampleSizes:spec.labels.map(name=>metric(39).value[name]?.owners)};
    const chartPanel=element('div','detail-chart-panel');
    if(spec.metricId)chartPanel.dataset.evidenceMetric=String(spec.metricId);
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
  const historySpec=history=>({nearestLinePoint:history.nearestLinePoint,title:`${history.title} · ${history.labels.length}期趋势`,unit:history.unit,
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
    const extraCharts=(info.extraCharts??[]).filter((_,index)=>!(page==='G'&&selectedMetric===54&&index===0));
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
    info.tables.forEach((spec,index)=>{if(page!=='G'||index!==0)grids.append(dataTable(page==='C'?(index===0?deviceEventContributionTable():deviceContextTable(spec)):page==='B'?retentionContextTable(spec):page==='A'?registrationContextTable(spec):page==='D'?renewalContextTable(spec):page==='F'?relationshipContextTable(spec):page==='G'?(spec.title==='异常事件样本'?anomalyContextTable(spec):qualityContextTable(spec)):spec));});
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
    const hasSameGroup=breakdown?.metricId===selectedMetric&&evidenceFor.specs.some(([,spec])=>spec.groupDimension===breakdown.dimension);
    if(breakdown&&!hasSameGroup) {
      const chartGrid=element('div','evidence-charts-grid');
      addChart(chartGrid,breakdown.spec);evidence.append(chartGrid,dataTable(breakdown.table));
    }
    const samplePanel=entitySamplesPanel(page);if(samplePanel)evidence.append(samplePanel);
    const trialSamples=page==='D'?trialSamplesPanel():null;if(trialSamples)evidence.append(trialSamples);
    if(!evidence.querySelector('.detail-chart-panel,.entity-workspace'))
      evidence.append(element('p','table-note','当前条件下没有额外的可比趋势；完整指标值与适用性见上方数据核对。'));
  }
  if(page==='D')evidence.insertBefore(trialReadinessPanel(),evidence.children[1]??null);
  renderDiagnosticWorkspace(page,top,body,overview,finding,selectedMetric,{
    selectedEvidence:evidenceFor,analysisMain,evidence,specs:drawSpecs,explorer
  });
}
function disposeCharts() {
  chartSizeObserver?.disconnect();
  if (chart) {destroyChart(chart);chart=undefined;}
  if (statusChart) {destroyChart(statusChart);statusChart=undefined;}
  while (sparklines.length) destroyChart(sparklines.pop());
  while (detailCharts.length) destroyChart(detailCharts.pop());
}
function renderInvalidFilters(page) {
  disposeCharts();
  const top=element('div','detail-heading');
  top.append(element('p','eyebrow','OPERATIONS / SCOPE CHECK'),
    element('h1','',pages[page]?.title??'经营简报'),
    element('p','heading-sub','筛选条件需要修正，经营数据暂停展示。'));
  const body=element('div','detail-shell invalid-filter-page');
  const notice=element('section','filter-error-notice');notice.setAttribute('role','alert');
  notice.setAttribute('aria-labelledby','invalid-filter-title');
  const title=element('h2','','请修正筛选条件');title.id='invalid-filter-title';
  notice.append(title,element('p','','以下条件无法用于当前页面。为避免把总体数据误当成所选范围，指标、图表、分析结论和问题登记已暂停；已有本地问题记录不改写，当前会话草稿保留。'));
  const list=element('ul','filter-error-list');
  for(const error of filterErrors) {
    const item=element('li','filter-error-item'),copy=element('div','');
    copy.append(element('strong','',`${filterLabels[error.key]}：${error.values.map(value=>value||'空值').join(' / ')}`),
      element('p','',error.reason));
    const actions=element('div','filter-error-actions');
    const correct=element('button','filter-reset',`修正${filterLabels[error.key]}`);correct.type='button';
    correct.addEventListener('click',()=>{
      const bar=body.querySelector('.filter-bar');bar.open=true;
      bar.querySelector(`select[name="${error.key}"]`).focus();
    });
    const clear=element('button','filter-reset','清除此条件');clear.type='button';
    clear.setAttribute('aria-label',`清除${filterLabels[error.key]}条件`);
    clear.addEventListener('click',()=>changeFilter(page,error.key,'All'));
    actions.append(correct,clear);item.append(copy,actions);list.append(item);
  }
  notice.append(list);body.append(notice,filterBar(page));main.replaceChildren(top,body);
}
function showMetricEvidence(id,{focus=true,behavior='auto'}={}) {
  const target=document.getElementById(`metric-evidence-${id}`);
  if(!target)return;
  const heading=target.querySelector('h2');
  if(focus&&heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  target.scrollIntoView({block:'start',behavior});
}
function renderRoute(options={}) {
  if(!routeCore)return;
  document.querySelector('#metric-search')?.close();
  const page=currentRoutePage();
  if(preparedRoutes.has(page)&&(page&&isTopicOverviewRequest()||window.echarts||chartLibrarySettled||dataFirstRequested)) {
    loadingRouteHash=undefined;routeLoadRevision++;
    activateRouteData(page);
    renderRouteNow(options);
    main.setAttribute('aria-busy','false');
    return;
  }
  return prepareRoute(options);
}
function renderRouteNow({preserveScroll=false,focusEvidence=true}={}) {
  selectReadingEntry();readingRevision++;
  const {page:route,metricId}=readRoute();
  projectDataset();
  closeDefinitionPopover();
  if(filterErrors.length) {
    renderInvalidFilters(route);document.title=`筛选待修正 · ${pages[route]?.title??'经营总览'} · Parallens`;
  } else if (route && pages[route]) {
    const requested=supportsPageMetric(route,metricId)?
      metricId:null;
    const observed=selectedFilters().length?filteredFinding(route)?.id:null;
    const selected=requested??(observed&&metric(observed).kind!=='na'?observed:route==='E'?35:route==='F'?48:defaultFindingMetric[route]);
    if(isTopicOverviewRequest())renderTopicOverview(route);else renderDetail(route,selected,Boolean(metricId));
    document.title=`${pages[route].title} · ${isTopicOverviewRequest()?'专题概览':'指标诊断'} · Parallens`;
  } else {
    renderHome(); document.title='用户与设备经营总览 · Parallens';
  }
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link=>{
    const code=link.dataset.page;
    link.href=topicOverviewHref(code);
    link.classList.toggle('active',code===route);
    if(code===route)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  updateScrollableTables();
  if(!preserveScroll)main.focus({preventScroll:true});
  if(metricId&&route&&!preserveScroll) {
    const entry=currentReadingEntry,hash=location.hash;
    requestAnimationFrame(()=>{
      if(entry!==currentReadingEntry||hash!==location.hash||document.activeElement!==main||document.querySelector('dialog:modal'))return;
      showMetricEvidence(metricId,{focus:focusEvidence});
    });
  }
  else if(!preserveScroll)scrollTo({top:0,behavior:'instant'});
  requestAnimationFrame(updateSectionNavigation);
  if(!document.querySelector('dialog:modal'))document.querySelector('#announcement').textContent=filterErrors.length?'筛选条件无效，经营数据暂停展示。请修正或主动清除。':route && pages[route] ? `已打开${pages[route].title}${isTopicOverviewRequest()?'专题概览':'指标诊断'}` : '已返回经营总览';
  lastRenderedHash=location.hash;
}
function handleRouteChange(event) {
  // A traversal can emit both events; only popstate restores an existing reading entry.
  const traversal=event?.type==='popstate',changed=location.hash!==lastRenderedHash;
  if(loadingRouteHash===location.hash)return;
  if(!changed&&!traversal)return;
  const view=traversal?readingViews.get(history.state?.parallensReadingEntry):null;
  rememberReadingView();selectReadingEntry();
  const restore=view?.hash===location.hash?view:null;
  if(restore?.homeSelection) {
    homeTrendFocus=restore.homeSelection.focus;homeSelectionMode=restore.homeSelection.mode;
  }
  const pending=changed?renderRoute({preserveScroll:Boolean(restore)}):null;
  if(restore) {
    if(pending)pending.then(()=>{if(restore.hash===location.hash&&lastRenderedHash===location.hash)restoreReadingView(restore);});
    else restoreReadingView(restore);
  }
}
let chartLibraryReady;
let chartLibrarySettled=false;
function waitForChartLibrary() {
  if(window.echarts)return Promise.resolve(true);
  if(chartLibraryReady)return chartLibraryReady;
  const script=document.querySelector('#chart-library');
  if(!script){chartLibrarySettled=true;return Promise.resolve(false);}
  chartLibraryReady=new Promise(resolve=>{
    const complete=ok=>{chartLibrarySettled=true;resolve(ok);};
    script.addEventListener('load',()=>complete(Boolean(window.echarts)),{once:true});
    script.addEventListener('error',()=>complete(false),{once:true});
    if(!script.hasAttribute('src')){script.async=true;script.src=script.dataset.src;}
  });
  return chartLibraryReady;
}
function showLoadingState(page=currentRoutePage(),total=1) {
  disposeCharts();closeDefinitionPopover();
  const panel=element('section','load-panel');panel.setAttribute('aria-labelledby','load-title');
  const heading=element('h1','',page?`正在准备${pages[page].title}`:'正在准备经营数据');heading.id='load-title';
  const status=element('p','load-status',`已准备 0 / ${total} 组数据`);status.id='load-status';
  const meter=element('progress','load-meter');meter.id='load-meter';meter.max=total;meter.value=0;
  meter.setAttribute('aria-label','数据准备进度');meter.setAttribute('aria-describedby','load-status');
  panel.append(element('p','section-kicker','PARALLENS / OPERATIONS REVIEW'),heading,status,meter,
    element('p','load-hint','正在准备当前页面的数据；完成核验后显示指标与证据。'));
  main.replaceChildren(panel);main.setAttribute('aria-busy','true');
}
async function fetchDataPart(name) {
  for(let attempt=0;attempt<2;attempt++) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(`./data/${name}.json?v=20261020-189`,{cache:'no-cache',signal:controller.signal});
      if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
      return await response.json();
    } catch(error) {if(attempt===1)throw error;}
    finally {clearTimeout(timeout);}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
}
function requestRouteData(page) {
  if(preparedRoutes.has(page))return Promise.resolve(preparedRoutes.get(page));
  if(routeRequests.has(page))return routeRequests.get(page);
  const request=fetchDataPart(`route-${page||'home'}`).then(payload=>{
    if(payload.version!==1||payload.revision!==routeCore.revision||payload.page!==page)
      throw new Error('当前页数据版本不一致，请重新加载。');
    preparedRoutes.set(page,payload);return payload;
  }).finally(()=>routeRequests.delete(page));
  routeRequests.set(page,request);return request;
}
function activateRouteData(page) {
  if(activeDataPage===page)return;
  activeDataPage=page;
  const payload=preparedRoutes.get(page);
  if(page===''&&!homeReadModel)homeReadModel={...payload,scopes:Object.fromEntries(Object.entries(payload.scopes).map(([key,scope])=>[key,
    Object.fromEntries(Object.entries(scope).map(([field,value])=>[field,['trialEvidence','deviceChanges'].includes(field)?payload.pool[value]:Object.fromEntries(Object.entries(value).map(([id,index])=>[id,payload.pool[index]]))]))]))};
  else {
    Object.assign(sourceData,payload.sources);
    Object.assign(sourceData.diagnostics,payload.diagnostics);
  }
  routeProjectionIds=page?routeCore.metricIds[page]:null;
}
function showLoadError(error,page,options,revision) {
  if(revision!==routeLoadRevision)return;
  const panel=element('section','load-panel load-error');panel.setAttribute('role','alert');
  panel.append(element('h1','',page?`${pages[page].title}暂时无法显示`:'数据未能完整加载'),
    element('p','','请检查网络后重试。当前地址、筛选条件和已登记问题均已保留。'));
  const retry=element('button','load-retry','重新加载');retry.type='button';
  retry.addEventListener('click',()=>routeCore?prepareRoute(options):start());panel.append(retry);
  main.replaceChildren(panel);main.setAttribute('aria-busy','false');
  document.querySelector('#announcement').textContent='当前页面数据加载失败，可重试或切换专题。';
  console.error(error);
}
async function prepareRoute(options={}) {
  const page=currentRoutePage(),revision=++routeLoadRevision;
  loadingRouteHash=location.hash;
  readRoute();
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link=>{
    const code=link.dataset.page;link.href=topicOverviewHref(code);
    link.classList.toggle('active',code===page);
    if(code===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  selectReadingEntry();readingRevision++;
  showLoadingState(page);
  if(!page||!isTopicOverviewRequest())waitForChartLibrary();
  if(!document.querySelector('dialog:modal')){main.focus({preventScroll:true});if(!options.preserveScroll)scrollTo({top:0,behavior:'instant'});}
  const loadingFocus=document.activeElement;
  document.querySelector('#announcement').textContent=page?`正在准备${pages[page].title}数据`:'正在准备经营数据';
  try {
    await requestRouteData(page);
    if(revision!==routeLoadRevision)return;
    activateRouteData(page);
    document.querySelector('#load-meter').value=1;
    document.querySelector('#load-status').textContent='当前页数据已齐，正在准备图表…';
    const viewDataFirst=await chooseDataFirst();
    if(revision!==routeLoadRevision)return;
    const newerInteraction=document.querySelector('dialog:modal')||document.activeElement!==loadingFocus&&!main.contains(document.activeElement);
    renderRouteNow({...options,preserveScroll:options.preserveScroll||Boolean(newerInteraction)});main.setAttribute('aria-busy','false');
    if(viewDataFirst)openInitialDataTable();
  } catch(error){showLoadError(error,page,options,revision);}
  finally{if(revision===routeLoadRevision)loadingRouteHash=undefined;}
}
async function chooseDataFirst() {
  if(currentRoutePage()&&isTopicOverviewRequest())return false;
  if(window.echarts||dataFirstRequested)return false;
  document.querySelector('#load-title').textContent='经营数据已准备好';
  document.querySelector('.load-hint').textContent='可以继续等待图表，或先用完整数据表核对指标。';
  const viewData=element('button','load-retry','先查看数据表');viewData.type='button';
  const dataRequested=new Promise(resolve=>viewData.addEventListener('click',()=>resolve('data'),{once:true}));
  document.querySelector('.load-panel').append(viewData);
  const requested=await Promise.race([waitForChartLibrary(),dataRequested])==='data';
  if(requested)dataFirstRequested=true;return requested;
}
function openInitialDataTable() {
  const dataTab=main.querySelector('.income-tabs [aria-controls$="-panel-data"]');
  if(dataTab)dataTab.click();
  else {
    const trendTable=main.querySelector('.trend-table-wrap');
    if(trendTable) {
      trendTable.open=true;const summary=trendTable.querySelector('summary');
      summary?.focus({preventScroll:true});summary?.scrollIntoView({block:'center',behavior:'instant'});
      document.querySelector('#announcement').textContent='已打开近12周趋势数据表，可继续核对过程指标。';
    }
  }
}
function bindAppEvents() {
  if(appEventsBound)return;
  appEventsBound=true;
  const search=document.querySelector('#metric-search');
  const input=document.querySelector('#metric-search-input');
  const trigger=document.querySelector('#open-metric-search');
  const savedIssues=document.querySelector('#saved-issues'),savedTrigger=document.querySelector('#open-saved-issues');
  definitionSizeObserver?.observe(document.querySelector('#metric-definition-popover'));
  savedTrigger.disabled=false;updateSavedIssueSummary();
  savedTrigger.addEventListener('click',()=>{
    if(savedIssues.open)return;
    closeDefinitionPopover();savedTrigger.focus({preventScroll:true});
    savedIssues.returnValue='';document.querySelector('#saved-issues-query').value='';renderSavedIssues();savedIssues.showModal();
    updateScrollableTables();
    document.querySelector('#saved-issues-query').focus();
  });
  document.querySelector('#close-saved-issues').addEventListener('click',()=>savedIssues.close());
  savedIssues.addEventListener('close',()=>{
    if(savedIssues.returnValue==='record')return;
    const viewport={left:scrollX,top:scrollY,behavior:'instant'};
    savedTrigger.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});scrollTo(viewport);
  });
  document.querySelector('#saved-issues-query').addEventListener('input',renderSavedIssues);
  const updateSearch=()=>{
    const records=metricSearchMatches(input.value);
    const results=document.querySelector('#metric-search-results');
    results.replaceChildren();
    document.querySelector('#metric-search-count').textContent=`${records.length} 项指标`;
    for(const {item,alias} of records) {
      const row=element('li','');
      const link=element('a','metric-search-result');link.href=routeHref(item.page,item.id);
      const copy=element('span','metric-search-copy');copy.append(element('span','metric-search-name',item.name));
      if(alias)copy.append(element('span','metric-search-alias',`匹配项：${alias}`));
      link.append(element('span','metric-search-id',`#${String(item.id).padStart(2,'0')}`),
        copy,element('span','metric-search-page',pages[item.page].title));
      link.addEventListener('click',()=>search.close());row.append(link);results.append(row);
    }
    if(!records.length)results.append(element('li','metric-search-empty','没有匹配的指标。换一个业务关键词试试。'));
  };
  const openSearch=()=>{if(search.open||savedIssues.open)return;closeDefinitionPopover();input.value='';updateSearch();search.showModal();input.focus();};
  trigger.disabled=false;trigger.addEventListener('click',()=>{trigger.focus({preventScroll:true});openSearch();});
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
      updateSectionNavigation();
    });
  },{passive:true});
    window.addEventListener('hashchange',handleRouteChange);
    window.addEventListener('popstate',handleRouteChange);
    document.addEventListener('keydown',event=>{
      const table=event.target.matches?.('.data-table-scroll[data-scrollable]')?event.target:null;
      if(table&&!event.defaultPrevented&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&
        ['ArrowLeft','ArrowRight'].includes(event.key)) {
        event.preventDefault();
        table.scrollLeft+=event.key==='ArrowRight'?80:-80;
        return;
      }
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k') {event.preventDefault();openSearch();return;}
      if(event.key==='Escape') {
        // Dismiss hover content without moving the pointer, focus or reading position.
        for(const instance of [chart,statusChart,...sparklines,...detailCharts]) {
          if(!instance||instance.isDisposed())continue;
          // ECharts keeps enterable content open while it is hovered. Clear that
          // guard through its public option API, then restore the reading behavior.
          const hovered=instance.getDom().querySelector('.chart-tooltip:hover');
          const hideDelay=instance.getOption().tooltip?.[0]?.hideDelay??100;
          if(hovered)instance.setOption({tooltip:{enterable:false,hideDelay:0}});
          instance.dispatchAction({type:'hideTip'});
          if(hovered)instance.setOption({tooltip:{enterable:true,hideDelay}});
        }
      }
      if(event.key==='Escape'&&savedIssues.open) {event.preventDefault();savedIssues.close();return;}
      if(event.key==='Escape'&&search.open) {event.preventDefault();search.close();return;}
      if(event.key==='Escape'&&definitionPopoverIsOpen()) {
        event.preventDefault();closeDefinitionPopover();
      }
    });
    document.addEventListener('click',event=>{
      if(event.defaultPrevented)return;
      const link=event.target.closest?.('a[href^="#/"]');
      if(!link||link.getAttribute('href')!==location.hash)return;
      const id=Number(new URLSearchParams(location.hash.split('?')[1]??'').get('metric'));
      if(id){event.preventDefault();showMetricEvidence(id,{behavior:chartAnimationDuration(1)?'smooth':'instant'});}
    });
}
async function start() {
  if(startupInProgress)return;
  startupInProgress=true;
  const revision=++routeLoadRevision,page=currentRoutePage();
  showLoadingState(page,2);if(!page||!isTopicOverviewRequest())waitForChartLibrary();
  // Both requests start together; no event-level topic data blocks the overview.
  let ready=0;
  const progress=()=>{if(revision!==routeLoadRevision)return;ready++;
    document.querySelector('#load-meter').value=ready;
    document.querySelector('#load-status').textContent=`已准备 ${ready} / 2 组数据`;};
  try {
    const parts=await Promise.allSettled([
      fetchDataPart('route-core').then(value=>{progress();return value;}),
      fetchDataPart(`route-${page||'home'}`).then(value=>{progress();return value;}),
    ]);
    const failed=parts.find(part=>part.status==='rejected');if(failed)throw failed.reason;
    const core=parts[0].value,payload=parts[1].value;
    if(core.version!==1||payload.version!==1||payload.revision!==core.revision||payload.page!==page)
      throw new Error('当前页面数据版本不一致，请重新加载。');
    routeCore=core;sourceData=core.sources;preparedRoutes.set(page,payload);activateRouteData(page);
    bindAppEvents();
    if(currentRoutePage()!==page){await prepareRoute();return;}
    document.querySelector('#load-status').textContent='当前页数据已齐，正在准备图表…';
    const viewDataFirst=await chooseDataFirst();
    if(revision!==routeLoadRevision)return;
    renderRouteNow();main.setAttribute('aria-busy','false');
    if(viewDataFirst)openInitialDataTable();
  } catch(error){showLoadError(error,page,{},revision);}
  finally {startupInProgress=false;}
}
start();
