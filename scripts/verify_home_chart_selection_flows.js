// Native chart clicks select exact homepage evidence without changing scope.
async(parent)=>{
 const base=new URL('.',parent.url()).href;
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage();
 const weekly=JSON.parse(fs.readFileSync('data/weekly.json','utf8'));
 const trials=JSON.parse(fs.readFileSync('data/trial-facts.json','utf8')).records;
 const states=JSON.parse(fs.readFileSync('data/metric-values.json','utf8')).m05.value;
 const engine=p.context().browser().browserType().name();
 const results=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
 const open=async(query='')=>{
  await p.goto(`${base}#/${query?'?'+query:''}`);
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
  await p.locator('#trendChart svg').waitFor();await settle();
 };
 const point=async(plot,seriesIndex,index,stacked=false)=>{
  await plot.scrollIntoViewIfNeeded();await settle();
  const xy=await plot.evaluate((n,{seriesIndex,index,stacked})=>{
   const e=echarts.getInstanceByDom(n),o=e.getOption(),r=n.getBoundingClientRect(),v=o.series[seriesIndex].data[index];
   const value=stacked?o.series.slice(0,seriesIndex).reduce((sum,s)=>sum+s.data[index],0)+v/2:v;
   const [x,y]=e.convertToPixel({seriesIndex},stacked?[value,index]:[index,value]);
   return {x:r.left+x,y:r.top+y,value:v};
  },{seriesIndex,index,stacked});
  check(Number.isFinite(xy.value)&&(!stacked||xy.value>0),'Cannot click a missing or zero-width plotted value');
  await p.mouse.click(xy.x,xy.y);await settle();return xy;
 };
 const trend=p.locator('#trendChart'),table=p.locator('.trend-table-wrap');
 const trendFeedback=()=>table.locator('xpath=preceding-sibling::p[contains(@class,"chart-selection")][1]');
 const clearTrend=async()=>{
  check(await table.locator('.chart-selected,.chart-selected-cell').count()===0,'A changed trend retains an old selection');
  check(await trendFeedback().count()===1&&await trendFeedback().innerText()==='','Trend redraw duplicates or retains stale feedback');
 };
 try{
  for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]){
   await p.setViewportSize({width,height});
   for(const query of ['','country=US','productLine=Bird','productLine=Hunting','country=US&appPlatform=iOS']){
    await open(query);
    const params=new URLSearchParams(query);
    for(const id of [13,18]){
     const signal=p.locator(`.home-signal[data-metric-id="${id}"]`);
     if(!await signal.count())continue;
     await signal.click();await settle();await clearTrend();
     for(const index of [0,5,11]){
      const before=p.url(),xy=await point(trend,0,index);
      check(await table.evaluate(n=>n.open),'A trend point does not reveal its table on first click');
      const row=table.locator('tbody tr.chart-selected');
      check(await row.count()===1&&await row.evaluate(n=>[...n.parentElement.children].indexOf(n))===index,'Trend selects the wrong week');
      const cells=await row.locator('th,td').allTextContents(),column=id===13?1:2;
      check(await row.locator('.chart-selected-cell').count()===1&&await row.locator('.chart-selected-cell').innerText()===cells[column],'Trend marks the wrong metric column');
      check(cells[column]===`${xy.value.toFixed(1)}%`,'Selected table value differs from the rendered plot');
      if(id===18){
       const rows=trials.filter(r=>r.week===index+1&&(!params.get('country')||r.country===params.get('country'))&&
        (!params.get('productLine')||r.product_line===params.get('productLine'))&&(!params.get('appPlatform')||r.app_platform===params.get('appPlatform')));
       check(rows.length>=30&&cells[column]===`${(rows.filter(r=>r.converted).length/rows.length*100).toFixed(1)}%`,'Trial percentage does not match independent filtered records');
      }else if(!query||query==='productLine=Bird'){
       const raw=weekly[index].registrationCohort;
       check(cells[column]===`${(raw.valueActivated7dBird/raw.birdEligible*100).toFixed(1)}%`,'Activation percentage differs from independent source counts');
      }
      const feedback=await trendFeedback().innerText();
      check(feedback.includes(cells[column])&&feedback.includes(id===13?'7日价值激活率':'试用→转正率')&&feedback.includes('全局筛选保持不变')&&p.url()===before,'Trend feedback or scope is incorrect');
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Point selection overflows the desktop');
      results.push({kind:'trend',width,query,id,index,value:cells[column]});
     }
    }
    await p.locator('.trend-overview').click();await settle();await clearTrend();
    const lines=await trend.evaluate(n=>echarts.getInstanceByDom(n).getOption().series.map(s=>s.name));
    for(const [seriesIndex,name] of lines.entries()){
     const before=p.url(),xy=await point(trend,seriesIndex,5);
     const column=name.includes('7日')?1:2;
     check(await table.locator('tr.chart-selected').locator('th,td').nth(column).innerText()===`${xy.value.toFixed(1)}%`&&
      await table.locator('tr.chart-selected .chart-selected-cell').innerText()===`${xy.value.toFixed(1)}%`&&p.url()===before,'Parallel chart selects the wrong series column');
    }
    const legends=p.locator('.trend-panel .chart-legend-button');
    if(await legends.count()){
     await legends.first().click();await settle();await clearTrend();
     check(await table.evaluate(n=>n.open),'Legend toggle closes user-opened evidence');
     await legends.first().click();await settle();await clearTrend();
    }
    const status=p.locator('#statusChart');await status.locator('svg').waitFor();
    const composition=await status.evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {labels:o.yAxis[0].data,series:o.series.map(s=>({name:s.name,values:s.data}))};});
    for(const [index,label] of composition.labels.entries()){
     for(const [seriesIndex,s] of composition.series.entries()){
      if(!s.values[index])continue;
      const before=p.url();await point(status,seriesIndex,index,true);
      const row=p.locator('.status-table tr.chart-selected'),cells=await row.locator('th,td').allTextContents();
      check(await row.count()===1&&cells[0]===label&&await row.locator('.chart-selected-cell').count()===1&&
       await row.locator('.chart-selected-cell').innerText()===cells[seriesIndex+1],`Subscription band selects the wrong product line or state column: ${JSON.stringify({width,query,index,label,seriesIndex,state:s.name,cells,selected:await row.count(),highlight:await row.locator('.chart-selected-cell').allTextContents()})}`);
      const count=Number(cells[seriesIndex+1].replaceAll(',','')),total=Number(cells.at(-1).replaceAll(',',''));
      check(Math.abs(s.values[index]-count/total*100)<1e-9,'State counts disagree with exact stacked shares');
      if(!query||query.startsWith('productLine=')){
       const source=states[label==='观鸟'?'bird':'hunting'];
       const expected=[source.free??source.noEntitlement,source.trialEarly+source.trialNearExpiry,source.paidCurrent,source.cancelledButEntitled,source.paymentFailed,source.expired??0];
       check(count===expected[seriesIndex],'State selection does not match independent source counts');
      }
      const feedback=await p.locator('.status-details .chart-selection').innerText();
      check(feedback.includes(label)&&feedback.includes(s.name)&&feedback.includes(`${count.toLocaleString('zh-CN')}人`)&&
       feedback.includes('已标亮')&&feedback.includes('全局筛选保持不变')&&p.url()===before,'Status feedback lacks exact count, label or stable scope');
      results.push({kind:'status',width,query,label,state:s.name,count});
     }
    }
    check(await table.locator('thead th[scope="col"]').count()===3&&await table.locator('tbody th[scope="row"]').count()===12,'Trend evidence loses semantic table headers');
    await table.locator('summary').focus();await p.keyboard.press('Enter');
    check(!await table.evaluate(n=>n.open),'Keyboard cannot collapse trend evidence');
    await p.keyboard.press('Enter');check(await table.evaluate(n=>n.open),'Keyboard cannot reopen trend evidence');
   }
  }
  await open();check(await p.locator('.chart-selection').filter({hasText:'图中临时选中'}).count()===0,'Filter reset retains selections from prior scopes');
  await point(trend,0,5);await p.screenshot({path:`output/playwright/v89-home-trend-selected-${engine}.png`,scale:'css'});
  await point(p.locator('#statusChart'),2,1,true);await p.screenshot({path:`output/playwright/v89-home-status-selected-${engine}.png`,scale:'css'});
  // The shared stacked-band resolver also applies to diagnostic composition.
  await p.goto(`${base}#/D?metric=5`);
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
  const diagnostic=p.locator('#D-panel-groups .detail-chart-panel[data-evidence-metric="5"]');
  const plot=diagnostic.locator('.detail-chart');await plot.locator('svg').waitFor();
  const mix=await plot.evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {labels:o.yAxis[0].data,series:o.series.map(s=>({name:s.name,values:s.data}))};});
  for(const [index,label] of mix.labels.entries())for(const [seriesIndex,line] of mix.series.entries()){
   if(!line.values[index])continue;
   const before=p.url();await point(plot,seriesIndex,index,true);
   check((await diagnostic.locator('.chart-selection').innerText()).includes(`${label} · ${line.name}`)&&
    await diagnostic.locator('tr.chart-selected').count()===1&&p.url()===before,'Diagnostic composition selects an adjacent state');
   results.push({kind:'diagnostic-status',label,state:line.name});
  }
  await open();await p.setViewportSize({width:1366,height:768});
  await p.evaluate(()=>document.documentElement.style.fontSize='24px');await settle();
  await point(trend,0,5);
  check(await table.locator('tr.chart-selected').count()===1&&!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Enlarged evidence cannot select its row or overflows the page');
  await p.evaluate(()=>document.documentElement.style.fontSize='');
  // A failed chart library must still leave the same source data available with a keyboard.
  await p.route('**/vendor/echarts.min.js*',route=>route.abort());await p.reload();
  await p.locator('#trendChart.chart-fallback').waitFor();
  check(await p.locator('.chart-selection').count()===0&&await p.locator('.status-table tbody tr').count()===2,'Unavailable charts retain stale feedback or remove table evidence');
  await table.locator('summary').focus();await p.keyboard.press('Enter');
  check(await table.evaluate(n=>n.open)&&await table.locator('tbody tr').count()===12,'Library fallback loses keyboard-readable trend values');
  check(!errors.length,errors.join('; '));
  return {status:'PASS',checks:['first native click selects exact week and metric column','independent trial records and source counts',
   'focused and parallel trends','six state bands and both product lines','three desktop widths and five scopes','legend and scope cleanup',
   'semantic headers and keyboard disclosure','library failure keeps readable evidence','no runtime errors'],results};
 }catch(error){await p.screenshot({path:`output/playwright/v89-home-chart-failure-${p.context().browser().browserType().name()}.png`,scale:'css'});throw error;}finally{await c.close();}
}
