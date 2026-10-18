// Real pointer clicks must reveal the matching row without changing business scope.
async(parent)=>{
 const base=new URL('.',parent.url()).href,c=await parent.context().browser().newContext({viewport:{width:1366,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),results=[],errors=[];
 const catalog=JSON.parse(fs.readFileSync('data/metric-catalog.json','utf8'));
 const records=JSON.parse(fs.readFileSync('data/model-market.json','utf8')).records;
 const structureViews=JSON.parse(fs.readFileSync('data/diagnostics.json','utf8')).E.structureViews;
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 p.on('pageerror',e=>errors.push(e.message));
 const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
 const open=async(page,id,query='')=>{
  await p.goto(`${base}#/${page}?metric=${id}${query?'&'+query:''}`);
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');await settle();
 };
 const clickPoint=async(plot,dimension)=>{
  await plot.scrollIntoViewIfNeeded();await settle();
  const point=await plot.evaluate((n,dimension)=>{
   const e=echarts.getInstanceByDom(n),o=e.getOption(),r=n.getBoundingClientRect();
   const finite=v=>Array.isArray(v)?v.slice(0,2).every(Number.isFinite):Number.isFinite(v);
   const usable=s=>!s.silent&&s.data.some(d=>finite(d&&typeof d==='object'&&!Array.isArray(d)?d.value:d));
   const scatter=o.series.findIndex(s=>s.type==='scatter'&&usable(s));
   const seriesIndex=scatter>=0?scatter:o.series.findIndex(usable);
   if(seriesIndex<0)return null;
   const series=o.series[seriesIndex],type=series.type;
   const values=series.data.map(d=>d&&typeof d==='object'&&!Array.isArray(d)?d.value:d);
   let index=values.findIndex(v=>finite(v)&&(type!=='bar'||v!==0));
   if(index<0)return null;
   let coordinate;
   if(type==='heatmap') {index=0;coordinate=[dimension??1,0];}
   else if(Array.isArray(values[index]))coordinate=values[index].slice(0,2);
   else coordinate=o.yAxis[0].type==='category'?[values[index]/2,index]:[index,type==='bar'?values[index]/2:values[index]];
   const layout=type==='bar'?e.getModel().getSeriesByIndex(seriesIndex).getData().getItemLayout(index):null;
   const [x,y]=layout&&[layout.x,layout.y,layout.width,layout.height].every(Number.isFinite)?[layout.x+layout.width/2,layout.y+layout.height/2]:e.convertToPixel({seriesIndex},coordinate);
   return {x:r.left+x,y:r.top+y,index,type};
  },dimension);
  check(point&&Number.isFinite(point.x)&&Number.isFinite(point.y),`No finite native chart point in ${await plot.getAttribute('aria-label')}`);
  await p.mouse.click(point.x,point.y);await settle();return point;
 };
 try{
  const rows=Array.isArray(catalog)?catalog:catalog.metrics??catalog.records;
  check(rows.filter(r=>r.id!==1).length===53,'The source catalog is incomplete');
  for(const item of rows.filter(r=>r.id!==1)){
   await open(item.page,item.id);
   for(const view of ['change','groups','data']){
   await p.locator(`#${item.page}-tab-${view}`).click();await settle();
   const plots=p.locator('.income-panel:not([hidden]) [data-evidence-metric="'+item.id+'"] .detail-chart');
   for(const plot of await plots.all()){
   if(!await plot.isVisible())continue;
   await plot.locator('svg').waitFor();
   const panel=plot.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," evidence-pair ") or contains(concat(" ",normalize-space(@class)," ")," detail-chart-panel ")][1]');
   if(await plot.evaluate(n=>!!n.closest('.structure-panel'))) {
    const sourcePanel=plot.locator('..'),table=sourcePanel.locator('table'),before=p.url();
    check(await table.isVisible(),'Owned structure table is not directly readable');
    const point=await clickPoint(plot),selected=table.locator('tr.chart-selected');
    check(await selected.count()===1&&await selected.evaluate(n=>[...n.parentElement.children].indexOf(n))===point.index,'Owned structure selects the wrong data row');
    check((await sourcePanel.locator('.chart-selection').innerText()).includes('全局筛选保持不变')&&p.url()===before,'Owned structure changes scope or lacks feedback');
    results.push({metric:item.id,page:item.page,view,type:point.type,row:point.index,table:'always-visible'});continue;
   }
   if(await plot.evaluate(n=>n.classList.contains('device-retention-heatmap'))) {
    const scale=await plot.evaluate(n=>echarts.getInstanceByDom(n).getOption().visualMap[0]);check(scale.min===0&&scale.max===100,'Cohort matrix changes its colour scale');
    const before=p.url();await plot.scrollIntoViewIfNeeded();await settle();const point=await plot.evaluate(n=>{const r=n.getBoundingClientRect(),v=echarts.getInstanceByDom(n).convertToPixel({seriesIndex:0},[1,6]);return {x:r.x+v[0],y:r.y+v[1]};});await p.mouse.click(point.x,point.y);await p.waitForFunction(()=>lastRenderedHash===location.hash);await settle();
    check(await p.locator('[name=activationCohort]').inputValue()==='2026-08-10','Cohort matrix does not select its pointed batch');
    await p.goto(before);await p.waitForFunction(()=>lastRenderedHash===location.hash);await settle();
    results.push({metric:item.id,page:item.page,view,type:'heatmap',interaction:'select-activation-cohort'});continue;
   }
   const details=panel.locator(':scope > .chart-data,:scope > .workspace-calculation');
   check(await details.count()===1,`#${item.id} has no adjacent data disclosure`);
   check(!await details.evaluate(n=>n.open),`#${item.id} expands data before selection`);
   const before=p.url(),point=await clickPoint(plot);
   check(await details.evaluate(n=>n.open),`#${item.id} ${point.type} pointer click does not open its table`);
   const selected=details.locator('tbody tr.chart-selected');
   check(await selected.count()===1,`#${item.id} has no unique selected row`);
   check(await selected.evaluate(n=>[...n.parentElement.children].indexOf(n))===point.index,`#${item.id} highlights a different row`);
   check((await panel.locator('.chart-selection').innerText()).includes('全局筛选保持不变')&&p.url()===before,`#${item.id} selection changes scope or lacks feedback`);
   results.push({metric:item.id,page:item.page,view,type:point.type,row:point.index});
   }
   }
  }
  for(const [width,height] of [[1366,768],[1920,1080]]){
   await p.setViewportSize({width,height});
   for(const query of ['', 'country=US','productLine=Hunting','country=UK&productLine=Bird&deviceModel=K6']){
    await open('E',39,query);
    const panel=p.locator('.workspace-chart-panel[data-evidence-metric="39"]').first(),plot=panel.locator('.detail-chart');
    await plot.locator('svg').waitFor();
    const details=panel.locator('.chart-data');
    const params=new URLSearchParams(query),source=records.filter(r=>(!params.get('country')||r.country===params.get('country'))&&(!params.get('productLine')||r.productLine===params.get('productLine'))&&(!params.get('deviceModel')||r.model===params.get('deviceModel')));
    for(const dimension of [0,1]){
     const before=p.url();await clickPoint(plot,dimension);
     const row=await details.locator('tr.chart-selected').locator('th,td').allTextContents(),model=row[0],subset=source.filter(r=>r.model===model);
     const [owners,active,subscribed]=['owners','activeOwners','subscribedOwners'].map(k=>subset.reduce((sum,r)=>sum+r[k],0));
     const parse=text=>Number(text.replaceAll(',',''));
     check(parse(row[1])===owners&&parse(row[2])===active&&parse(row[3])===subscribed,`Heatmap ${query} counts do not match source records`);
     check(row[4]===`${(active/owners*100).toFixed(1)}%`&&row[5]===`${(subscribed/owners*100).toFixed(1)}%`,'Heatmap selected row rates disagree');
     check((await panel.locator('.chart-selection').innerText()).includes(dimension===0?'30天活跃率':'主账号订阅率')&&p.url()===before,'Heatmap loses the selected dimension or scope');
     check((await details.locator('thead th').allTextContents()).slice(1,4).every(t=>t.includes('（人）')),'Heatmap counts lack units');
     check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Chart selection overflows the page');
     results.push({metric:39,width,query,dimension,model,owners,active,subscribed});
    }
    // The same exact evidence is available without a pointer or SVG keyboard support.
    await details.locator('summary').evaluate(n=>n.focus({preventScroll:true}));await p.keyboard.press('Enter');
    check(!await details.evaluate(n=>n.open),'Keyboard cannot collapse the point evidence');
    await p.keyboard.press('Enter');check(await details.evaluate(n=>n.open),'Keyboard cannot reopen the point evidence');
   }
  }
  for(const width of [1366,1600,1920])for(const font of [16,32]){
   await p.goto('about:blank');await p.setViewportSize({width,height:1000});
   await open('E',35,'issue=35');
   const form=p.locator('.action-record');
   await form.locator('[name=owner]').fill('结构核对验收');
   await form.locator('[name=note]').fill('结构图登记原基线');
   await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
   await form.locator('[name=note]').fill('结构核对未保存草稿');
   const stored=await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
   const baseline=await form.locator('>p').first().innerText();
   if(font!==16)await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
   await p.locator('#E-tab-groups').click();
   const context=p.locator('details.workspace-context').filter({has:p.getByText('其他付费结构与型号对照',{exact:true})});
   await context.locator(':scope > summary').click();await settle();
   const explorer=p.locator('.structure-explorer'),panel=explorer.getByRole('tabpanel');
   const url=p.url(),contextCount=await context.locator('details[open]').count();
   for(const [index,view] of structureViews.entries()){
    const tab=explorer.getByRole('tab').nth(index);await tab.click();await panel.locator('svg').waitFor();await settle();
    check(await tab.getAttribute('aria-selected')==='true'&&await panel.getAttribute('aria-labelledby')===await tab.getAttribute('id'),
      'Structure tab and panel identity disagree');
    check(await panel.locator('tr.chart-selected').count()===0&&await panel.locator('.chart-selection').innerText()==='',
      'Changing the statistical object retains an old selected row');
    const table=panel.locator('table'),plot=panel.locator('.detail-chart');
    check(await table.isVisible(),'Structure table is hidden before a pointer selection');
    check((await panel.locator(':scope > .table-note').innerText()).includes(`${view.denominator.toLocaleString('zh-CN')}${view.unit}`),
      'Structure denominator or unit changed');
    const values=await plot.evaluate(n=>echarts.getInstanceByDom(n).getOption().series[0].data);
    check(JSON.stringify(values)===JSON.stringify(view.rows.map(row=>row[1])),'Structure graph differs from its source rows');
    const point=await clickPoint(plot),row=table.locator('tr.chart-selected');
    const expected=view.rows[point.index],cells=await row.locator('th,td').allTextContents();
    check(await row.count()===1&&cells[0]===expected[0]&&cells[1]===expected[1].toLocaleString('zh-CN')&&
      cells[2]===`${(expected[1]/view.denominator*100).toFixed(1)}%`,'Structure point highlights the wrong row, count or share');
    const feedback=panel.locator('.chart-selection');
    check(await feedback.count()===1&&await feedback.getAttribute('aria-live')==='polite'&&
      (await feedback.innerText()).includes(`图中临时选中：${expected[0]}`),'Structure selection lacks adjacent accessible feedback');
    check(await context.locator('details[open]').count()===contextCount&&await context.evaluate(n=>n.open)&&p.url()===url,
      'Structure selection changes surrounding disclosures or business scope');
    const bounds=await row.boundingBox(),nav=await p.locator('.section-navigation').boundingBox();
    check(bounds&&bounds.y>=nav.y+nav.height-1&&bounds.y+bounds.height<=1001,'Selected structure row is hidden behind navigation or below the viewport');
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Structure selection causes page overflow');
    if(width===1366&&index===0)await p.screenshot({path:`output/playwright/v112-audit/07-${parent.context().browser().browserType().name()}-structure-${font}.png`});
    results.push({structure:view.label,width,font,row:point.index,values,cells});
   }
   const tabs=explorer.getByRole('tab');await tabs.last().focus();await p.keyboard.press('ArrowRight');await settle();
   check(await tabs.first().getAttribute('aria-selected')==='true'&&await tabs.first().evaluate(n=>n===document.activeElement)&&
    await panel.locator('tr.chart-selected').count()===0,'Keyboard tab wrap leaves stale selection or loses focus');
   check(await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===stored&&
    await form.locator('[name=note]').inputValue()==='结构核对未保存草稿'&&await form.locator('>p').first().innerText()===baseline,
    'Structure selections modify saved records, drafts or historical baselines');
  }
  check(errors.length===0,errors.join('; '));
  check(['bar','boxplot','heatmap','line','scatter'].every(type=>results.some(row=>row.type===type)),'A required rendered chart family was not exercised');
  return {status:'PASS',visitedMetrics:53,checks:['actual pointer clicks for all available selected metric charts','correct row and scope','source model counts and rates','both heatmap dimensions','two desktop widths','keyboard disclosure',
    'three supplemental statistical objects at three widths and 200% text','adjacent live selection and visible source table','keyboard object switching clears old selection','unchanged saved records, draft and baseline','no runtime errors'],results};
 }finally{await c.close();}
}
