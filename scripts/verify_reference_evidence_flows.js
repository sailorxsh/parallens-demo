// Current evidence stays primary; topic references remain accessible without changing issue context.
async parent=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),engine=browser.browserType().name(),c=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],results=[];
 const check=(ok,m)=>{if(!ok)throw Error(m);};p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async q=>{await p.goto(base+'#/'+q);await ready();},current=()=>p.locator('.workspace-observation>.detail-finding'),form=()=>p.locator('.action-record'),stored=()=>p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
 try{
 // #18 retains its approved default readiness workflow and its exact counts.
 for(const q of ['D?metric=18','D?metric=18&country=US','D?metric=18&week=1']){
  await open(q);const node=p.locator('.trial-readiness');check(await node.isVisible()&&!await node.evaluate(n=>Boolean(n.closest('details.workspace-context'))),'Primary trial readiness was demoted');check((await node.innerText()).includes(q.includes('country=US')?'已齐 131 / 应齐 160':'已齐 248 / 应齐 300'),'Primary readiness counts changed');
 }
 for(const q of ['D?metric=52','D?metric=52&country=US','D?metric=22&panel=change']){
  await open(q);const ref=p.locator('#D-panel-change > .workspace-context').filter({hasText:'其他指标核对 · #18 试用批次数据可用性'}),node=ref.locator('.trial-readiness');
  check(await ref.count()===1&&!await ref.evaluate(n=>n.open)&&!await node.isVisible(),'Unrelated trial readiness is presented as the selected metric');
  const metricId=await current().getAttribute('data-metric-id'),before=await p.evaluate(()=>JSON.stringify(metric(Number(new URLSearchParams(location.hash.split('?')[1]).get('metric'))))),snapshot=await stored();
  const summary=ref.locator('> summary');await summary.focus();await summary.press('Enter');check(await node.isVisible()&&await summary.evaluate(n=>document.activeElement===n),'Reference cannot be expanded by keyboard or loses focus');
  check(!(await node.innerText()).includes('上方 W1')&&(await node.innerText()).includes('#18'),'Reference still mislabels the current chart as trial evidence');check(await current().getAttribute('data-metric-id')===metricId&&await p.evaluate(()=>JSON.stringify(metric(Number(new URLSearchParams(location.hash.split('?')[1]).get('metric')))))===before&&await stored()===snapshot,'Reference disclosure changes current metric or saved records');
  results.push({kind:'trial-reference',q});
 }
 // Own complete data stays directly readable; only supplementary topic tables are closed.
 for(const [code,id]of [['A',9],['B',24],['C',43],['D',22],['F',51],['G',54]]){
  await open(`${code}?metric=${id}&panel=data`);const panel=p.locator(`#${code}-panel-data`),own=panel.locator(':scope > .data-table-scroll'),ref=panel.locator(':scope > .topic-reference-data');
  check(await own.count()>0&&await own.first().isVisible(),'Own complete data is hidden with references #'+id);check(await ref.count()===1&&!await ref.evaluate(n=>n.open),'Other topic tables are not a distinct closed reference #'+id);
  const sourceCaptions=await ref.locator('caption').allTextContents();check(sourceCaptions.length>0,'Reference tables were removed #'+id);check(await ref.locator('table:visible').count()===0,'Reference leaks table content while closed');
  const summary=ref.locator('> summary');await summary.focus();await summary.press('Enter');check(await ref.locator('table:visible').count()===sourceCaptions.length,'Opening the reference loses retained tables #'+id);check((await ref.innerText()).includes('各表按自身统计对象、周期和分母'),'Reference ownership and population boundary are missing');
  await summary.press('Enter');check(!await ref.evaluate(n=>n.open)&&await own.first().isVisible(),'Closing reference hides current data #'+id);results.push({kind:'own-data',code,id,referenceTables:sourceCaptions.length});
 }
 // A reading task must not change a saved issue or an unsaved draft.
 await open('D?metric=52&issue=52');await form().locator('[name=owner]').fill('高危范围核查');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const original=await stored(),baseline=await form().locator('> .table-note').innerText();await form().locator('[name=note]').fill('保留高危指标草稿');await p.getByRole('button',{name:'当前指标',exact:true}).click();
 const readiness=p.locator('#D-panel-change > .workspace-context').filter({hasText:'其他指标核对 · #18'});await readiness.locator('> summary').click();await p.locator('#D-tab-data').click();await p.locator('.topic-reference-data > summary').click();await p.getByRole('button',{name:'问题登记',exact:true}).click();check(await form().locator('[name=issueMetric]').inputValue()==='52'&&await form().locator('[name=note]').inputValue()==='保留高危指标草稿'&&await form().locator('> .table-note').innerText()===baseline&&await stored()===original,'Reference exploration replaces issue, baseline or draft');
 // The anomaly list is a separate metric when inspecting quality, but it still initializes and searches on demand.
 await open('G?metric=54&panel=groups');const events=p.locator('#G-panel-groups > .workspace-context').filter({hasText:'其他指标清单 · #53 异常发现'});check(await events.count()===1&&!await events.evaluate(n=>n.open)&&await p.locator('.quality-explorer').isVisible(),'Quality groups promote an unrelated anomaly ledger');await events.locator('> summary').focus();await p.keyboard.press('Enter');const list=events.locator('.anomaly-event-workspace');check(await list.isVisible()&&await list.locator('tbody tr').count()===7,'On-demand anomaly ledger loses its original records');await list.getByRole('searchbox').fill('EX-06');check(await list.locator('tbody tr').count()===1&&await current().getAttribute('data-metric-id')==='54','Anomaly search changes the quality subject');
 await open('G?metric=53&panel=groups');check(await p.locator('#G-panel-groups > .anomaly-event-workspace').isVisible(),'Own anomaly ledger was hidden');
 await open('E?metric=37');const summary=await p.evaluate(()=>metricCardSummary(37)),text=await current().innerText();check(summary.text==='首购 400人 · 复购/续购 2,750人'&&summary.unit==='','Pack summary loses named counts or person units');check(text.includes('首购 400人')&&text.includes('复购/续购 2,750人')&&!text.includes('400 / 2,750'),'Pack counts remain an ambiguous numerator/denominator pair');check(text.includes('原模拟汇总未明确月份')&&!(await p.locator('#E-panel-data').innerText()).includes('12个月'),'Unprovided monthly history was invented');
 // Measured desktop density without removing the source evidence; native disclosure remains usable at enlarged text.
 for(const [width,size]of[[1366,16],[1600,16],[1920,16],[1366,32]]){
  await p.setViewportSize({width,height:1000});for(const [code,id,panel]of[['D',52,'change'],['D',22,'data'],['F',51,'data'],['G',54,'groups'],['E',37,'data']]){
   await open(`${code}?metric=${id}&panel=${panel}`);await p.evaluate(s=>document.documentElement.style.fontSize=s+'px',size);await ready();check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),`Page overflows ${code} #${id} ${width}/${size}`);
   const ref=p.locator(`#${code}-panel-${panel} > .workspace-context`).filter({hasText:code==='D'&&id===52?'其他指标核对 · #18':code==='G'?'其他指标清单 · #53':code==='E'?'查看付费专题其他完整数据':'专题补充参考数据'}).first();
   check(!await ref.evaluate(n=>n.open),'A closed topic reference is opened automatically');const handle=ref.locator('> summary');await handle.focus();await handle.press('Enter');check(await ref.evaluate(n=>n.open)&&await handle.evaluate(n=>document.activeElement===n),'Enlarged disclosure cannot be operated');await handle.press('Enter');
   if(width===1600&&size===16||width===1366&&size===32)await p.screenshot({path:`output/playwright/v171-${engine}-${code}-${id}-${width}-${size}.png`,fullPage:true});results.push({kind:'layout',code,id,width,size});
  }
 }
 check(!errors.length,errors.join('; '));return {status:'PASS',engine,results,currentTrialPreserved:true,referenceDataRetained:true,originalIssueAndDraft:true,explicitAnomalyReference:true,namedPackCounts:true};
 }finally{await c.close();}
}
