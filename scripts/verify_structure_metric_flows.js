// The existing #38 count source must be the direct evidence, with distinct populations and old records intact.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name(),c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],states=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());const check=(ok,message)=>{if(!ok)throw Error(message);};
 const source=JSON.parse(fs.readFileSync('data/diagnostics.json','utf8')).E.structureViews,originalValue=JSON.parse(fs.readFileSync('data/metric-values.json','utf8')).m38;
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async q=>{await p.goto(`${base}#/E?metric=38${q?'&'+q:''}`);await ready();};
 const explorer=()=>p.locator('.structure-metric-evidence .structure-explorer'),tabs=()=>explorer().getByRole('tab'),form=()=>p.locator('.action-record'),stored=()=>p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
 const select=async i=>{await tabs().nth(i).click();await ready();};
 try{
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});await open('');await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);await ready();
   check(await p.getByRole('tab',{name:'分组证据',exact:true}).getAttribute('aria-selected')==='true','Selecting #38 still lands on a generic percentage table');
   check(await p.locator('.structure-explorer').count()===1,'Hidden duplicate structure widget remains');
   for(let i=0;i<3;i++){
    await select(i);const view=source[i],panel=explorer().getByRole('tabpanel');await panel.locator('svg').waitFor();
    const actual=await panel.locator('.detail-chart').evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {values:o.series[0].data,labels:o.xAxis[0].data,min:o.yAxis[0].min,
     tooltip:o.tooltip[0].formatter([{dataIndex:0,seriesIndex:0,seriesName:'数量',value:o.series[0].data[0],marker:''}]),text:[...n.querySelectorAll('text')].map(n=>n.textContent)};});
    check(JSON.stringify(actual.values)===JSON.stringify(view.rows.map(r=>r[1]))&&actual.min===0,'Rendered counts differ from existing structure rows or bars do not start at zero');
    check(actual.tooltip.includes((view.rows[0][1]/view.denominator*100).toFixed(1)+'%')&&actual.tooltip.includes(view.denominator.toLocaleString('en-US')),'Tooltip omits the share or the correct denominator');
    const text=await panel.innerText();for(const [name,n] of view.rows)check(text.includes(name)&&text.includes(n.toLocaleString('en-US'))&&text.includes((n/view.denominator*100).toFixed(1)+'%'),'Visible counts and percentages do not reconcile');
    const summary=await p.locator('.workspace-observation .structure-current-view').innerText();check(summary.includes(view.label)&&summary.includes(view.denominator.toLocaleString('en-US')),'Right facts do not follow the structure view');
    check(await tabs().nth(i).getAttribute('aria-selected')==='true'&&await tabs().nth(i).evaluate(n=>n===document.activeElement),'Selected structure tab loses selection or focus');
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Structure view overflows desktop or enlarged text');
    check(!await explorer().evaluate(n=>n.scrollWidth>n.clientWidth+1),'Structure widget clips its content');
    states.push({width,font,view:view.label,denominator:view.denominator,values:actual.values});
    if(width===1600||font===32){await explorer().scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/v144-audit/${engine}-structure-${i}-${width}-${font}.png`});}
   }
   await tabs().nth(2).focus();await p.keyboard.press('Home');check(await tabs().nth(0).getAttribute('aria-selected')==='true','Home cannot reach first structure tab');
   await p.keyboard.press('ArrowRight');check(await tabs().nth(1).getAttribute('aria-selected')==='true','Arrow keys cannot change structure');
   await p.keyboard.press('End');check(await tabs().nth(2).getAttribute('aria-selected')==='true','End cannot reach final structure tab');
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});await open('');await select(2);
  const chart=explorer().locator('.detail-chart');await chart.scrollIntoViewIfNeeded();const point=await chart.evaluate(n=>{const r=n.getBoundingClientRect(),v=echarts.getInstanceByDom(n).convertToPixel({seriesIndex:0},[0,8000]);return {x:r.x+v[0],y:r.y+v[1]};});await p.mouse.click(point.x,point.y);
  check((await explorer().locator('tr.chart-selected').innerText()).includes('K6'),'Chart point does not reveal its matching model row');
  await p.locator('.nav-link[data-page=A]').click();await ready();await p.goBack();await ready();check(await tabs().nth(2).getAttribute('aria-selected')==='true','Browser back loses the current structure view');
  await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();const full=p.locator('.structure-calculation');check(await full.locator('tbody tr').count()===10&&(await full.innerText()).includes('128,600人')&&(await full.innerText()).includes('143,800台'),'Full calculation table omits a population or its exact denominator');
  await p.getByRole('tab',{name:'分组证据',exact:true}).click();await ready();check(await tabs().nth(2).getAttribute('aria-selected')==='true','Evidence tabs reset the local structure selection');
  await open('issue=38');await form().locator('[name=owner]').fill('结构新基线验收');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  const record=await p.evaluate(()=>JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY))['record:E:默认演示范围:38']);check(record.baseline.includes('128,600人')&&record.baseline.includes('143,800台')&&record.baseline.includes('50,000台')&&record.baselineAt==='快照 2026-09-24','New structure record lacks count/denominator evidence');
  await form().locator('[name=note]').fill('结构核对未保存草稿');const before=await stored();await select(1);check(await form().locator('[name=note]').inputValue()==='结构核对未保存草稿'&&await stored()===before&&await p.locator('.income-record').isVisible(),'Viewing structure changes the active issue, draft, or saved baseline');
  const legacy=JSON.parse(fs.readFileSync('scripts/fixtures/structure-before-default-charts.json','utf8'));await p.evaluate(rows=>localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(rows)),legacy.records);await p.reload();await ready();
  const old=legacy.records['record:E:默认演示范围:38'],oldStored=await stored();check((await form().innerText()).includes(old.issueId)&&(await form().innerText()).includes('原登记只保存结构摘要')&&await stored()===oldStored,'Reading silently migrates the old structure record');
  await form().locator('[name=note]').fill('只更新处理进度');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const saved=JSON.parse(await stored())['record:E:默认演示范围:38'];for(const key of ['issueId','scope','filters','baseline','baselineAt','reviewMetric'])check(JSON.stringify(saved[key])===JSON.stringify(old[key]),`Progress save rewrites old ${key}`);
  for(const query of ['country=US','appPlatform=iOS','deviceModel=K6','productLine=Bird']){await open(query);check(await p.evaluate(()=>metric(38).availability)==='pending'&&await p.locator('.structure-metric-evidence').count()===0,'Unsupported cross-section reuses overall composition as filtered facts');}
  // Existing source contradictions must not be plotted or back-filled from the standalone percentages.
  const faults=[d=>d.E.structureViews[0].rows[0][1]++,d=>d.E.structureViews[1].denominator--,d=>d.E.structureViews[2].rows[0][1]=-1,d=>d.E.structureViews.pop(),d=>d.E.structureViews[0].rows[1][0]='美国'];
  for(const fault of faults){await p.route('**/data/diagnostics.json',async r=>{const response=await r.fetch(),d=await response.json();fault(d);await r.fulfill({response,json:d});});await open('');await p.reload();await ready();check(await p.evaluate(()=>metric(38).availability==='pending'&&metric(35).kind==='group'),'Broken structure counts fall back to percentages or disable unrelated income');check(await p.locator('.structure-metric-evidence').count()===0&&(await p.locator('#metric-evidence-38').innerText()).includes('待核验'),'Unverified structure is still shown as reliable');await p.unroute('**/data/diagnostics.json');}
  await open('');await p.reload();await ready();check(JSON.stringify(await p.evaluate(()=>metric(38)))===JSON.stringify(originalValue),'Structure display changed the source proportions');
  // Render failure stays local; retry recovers and the next view disposes the recovered instance.
  await p.evaluate(()=>{const original=window.echarts,test=Object.create(original);Object.defineProperty(test,'init',{value:function(...args){const instance=original.init.apply(original,args);if(args[0].closest('.structure-metric-evidence')){const set=instance.setOption;instance.setOption=function(){throw Error('Synthetic structure render failure');};}return instance;}});window.echarts=test;window.__restoreStructureInit=()=>window.echarts=original;});
  await select(1);await explorer().locator('.chart-render-error').waitFor();check(await explorer().locator('table').isVisible(),'Chart fault removes the readable structure data');await p.evaluate(()=>__restoreStructureInit());await explorer().getByRole('button',{name:/^重试.*图表$/}).click();await explorer().locator('svg').waitFor();await select(2);check(await p.evaluate(()=>detailCharts.every(chart=>!chart.isDisposed()&&chart.getDom().isConnected)),'Recovered chart leaks an orphan instance after changing view');
  await p.route('**/vendor/echarts.min.js*',r=>r.abort());await p.goto('about:blank');await open('');check(await explorer().locator('.chart-fallback').count()===1,'Library failure does not provide a table fallback');await select(1);check(await explorer().locator('tbody tr').count()===2&&(await explorer().innerText()).includes('70,730'),'App structure table unavailable without charts');await select(2);check(await explorer().locator('tbody tr').count()===4,'Model structure unavailable without charts');await p.unroute('**/vendor/echarts.min.js*');
  check(!errors.length,`Page errors: ${errors.join('; ')}`);return {status:'PASS',states,legacy:{issueId:old.issueId,baseline:old.baseline},newBaseline:record.baseline,checks:['owned default chart','three original populations and source shares','hover counts and denominator','keyboard and desktop text sizes','point to table','view restored on history','source scope and five contradictions','old records and current drafts','library fallback and render recovery'],errors};
 }finally{await c.close();}
}
