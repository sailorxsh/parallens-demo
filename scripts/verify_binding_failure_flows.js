// Exact failure attempts must be discoverable without borrowing another week or scope.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),results=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const fetchSource=async file=>{const r=await parent.request.get(`${base}data/${file}.json`);check(r.ok(),file);return r.json();};
 const [diagnostics,weekly]=await Promise.all(['diagnostics','weekly'].map(fetchSource));
 const source=diagnostics.A.tables.find(t=>t.title==='首次绑定失败原因 · W12');
 const rows=source.rows.filter(r=>r[0]!=='合计').sort((a,b)=>b[1]-a[1]),attempts=weekly.find(w=>w.week===12).bindingAttempts;
 const failed=attempts.total-attempts.successful;
 check(rows.reduce((n,row)=>n+row[1],0)===failed,'Original failure counts do not reconcile');
 const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 };
 const open=async query=>{await p.goto(`${base}#/A?metric=11&panel=groups${query?'&'+query:''}`);await ready();};
 const pair=()=>p.locator('.evidence-pair[data-evidence-metric="11"]').filter({has:p.getByRole('heading',{name:'首次绑定失败原因 · W12',exact:true})});
 const cases=[['',true],['week=12',true],['country=US',true],['country=US&week=12',true],
  ['week=11',false],['appPlatform=iOS',false],['deviceModel=K6',false],['deviceStatus=Effective',false],['week=12&appPlatform=Android',false]];
 try{
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.goto('about:blank');await p.setViewportSize({width,height:1000});
   for(const [query,available] of cases){
    await open(query);await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    check(await p.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))===font,'Actual text size was lost');
    check(await p.locator('#A-tab-groups').getAttribute('aria-selected')==='true','Explicit group view was discarded');
    if(available){
     const chart=pair().locator('.detail-chart');await chart.locator('svg').waitFor();
     const state=await pair().evaluate(node=>{
      const box=node.querySelector('.detail-chart'),chart=echarts.getInstanceByDom(box),o=chart.getOption(),r=box.querySelector('svg').getBoundingClientRect();
      return{labels:o.xAxis[0].data,values:o.series[0].data,extent:chart.getModel().getComponent('yAxis',0).axis.scale.getExtent(),
       table:[...node.querySelectorAll('tbody tr')].map(n=>[...n.children].map(c=>c.textContent)),text:node.textContent,
       tooltip:o.tooltip[0].formatter([{dataIndex:0,seriesIndex:0,value:o.series[0].data[0],marker:'',seriesName:o.series[0].name}]),
       clipped:[...box.querySelectorAll('svg text')].filter(n=>n.textContent.trim()).filter(n=>{const b=n.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1;}).map(n=>n.textContent)};
     });
     check(JSON.stringify(state.labels)===JSON.stringify(rows.map(r=>r[0]))&&JSON.stringify(state.values)===JSON.stringify(rows.map(r=>r[1])),'Failure plot differs from exact source counts');
     check(state.extent[0]===0&&state.extent[1]>=Math.max(...state.values),'Failure counts omit zero or data');
     check(!state.clipped.length,`Failure labels clipped at ${width}/${font}: ${state.clipped}`);
     check(state.tooltip.includes('85次')&&!state.tooltip.includes('人'),'Failure tooltip changes the statistical object');
     const numeric=s=>Number(s.replaceAll(',',''));
     check(state.table.length===rows.length+1,'Failure table loses a category or total');
     rows.forEach((r,i)=>check(state.table[i][0]===r[0]&&numeric(state.table[i][1])===r[1]&&numeric(state.table[i][2])===failed&&
      state.table[i][3]===`${(100*r[1]/failed).toFixed(1)}%`&&state.table[i][4]===r[3],'Failure numerator, denominator, share or next action changed'));
     check(numeric(state.table.at(-1)[1])===failed&&state.text.includes('2,000')&&state.text.includes('1,800')&&
      state.text.includes('9/7–9/13')&&state.text.includes('不是全部绑定尝试或设备人数'),'Failure count lacks its period, volume or denominator boundary');
     if(!query){
      const disclosure=pair().locator('.workspace-calculation');
      for(let index=0;index<rows.length;index++){
       await chart.scrollIntoViewIfNeeded();
       const point=await chart.evaluate((node,index)=>{const c=echarts.getInstanceByDom(node),r=node.getBoundingClientRect(),[x,y]=c.convertToPixel({seriesIndex:0},[index,c.getOption().series[0].data[index]/2]);return{x:r.x+x,y:r.y+y};},index);
       const url=p.url();
       if(index===0&&font===32){
        await p.mouse.move(point.x,point.y);
        await p.waitForFunction(()=>[...document.querySelectorAll('.evidence-pair[data-evidence-metric="11"] .detail-chart div')].some(n=>
         n.style.position==='absolute'&&!n.querySelector('svg')&&n.textContent.includes('失败尝试')&&getComputedStyle(n).visibility!=='hidden'&&getComputedStyle(n).opacity!=='0'));
       }
       await p.mouse.click(point.x,point.y);
       check(await disclosure.evaluate(n=>n.open)&&await disclosure.locator('tr.chart-selected').count()===1&&
        (await disclosure.locator('tr.chart-selected').locator('th,td').first().innerText())===rows[index][0],'Native failure bar does not open its exact cause');
       check(p.url()===url&&(await pair().locator('.chart-selection').innerText()).includes('全局筛选保持不变'),'Cause inspection changes the scope');
       await p.waitForFunction(()=>![...document.querySelectorAll('.evidence-pair[data-evidence-metric="11"] .detail-chart div')].some(n=>
        n.style.position==='absolute'&&!n.querySelector('svg')&&n.textContent.includes('失败尝试')&&getComputedStyle(n).visibility!=='hidden'&&getComputedStyle(n).opacity!=='0'));
      }
      await disclosure.locator('summary').focus();await p.keyboard.press('Enter');check(!await disclosure.evaluate(n=>n.open),'Keyboard cannot close cause evidence');
      await p.keyboard.press('Enter');check(await disclosure.evaluate(n=>n.open),'Keyboard cannot reopen cause evidence');
      await p.screenshot({path:`output/playwright/binding-failure-${browser.browserType().name()}-${width}-${font}.png`});
     }
    }else{
     check(await pair().count()===0&&await p.locator('.binding-failure-unavailable').isVisible()&&
      (await p.locator('.binding-failure-unavailable').innerText()).includes('不沿用总体分布'),'Another scope borrows W12 failure causes');
     check(await p.evaluate(()=>metric(11).kind)==='rate','Missing causes erase an available success rate');
    }
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Binding evidence introduces page overflow');
    results.push({width,font,query,available});
   }
  }
  await p.goto('about:blank');await p.setViewportSize({width:1600,height:1000});await open('');
  await p.locator('#A-tab-change').click();
  check(await p.locator('.binding-timing-unavailable').isVisible()&&(await p.locator('.binding-timing-unavailable').innerText()).includes('不能替代'),'Missing binding time is implied by another metric');
  await p.locator('#A-tab-groups').click();await p.goBack();await ready();
  check(await p.locator('#A-tab-change').getAttribute('aria-selected')==='true','History loses the selected evidence');
  await p.goForward();await ready();check(await pair().isVisible(),'Forward cannot restore failure evidence');
  await p.keyboard.press('Control+k');await p.getByRole('searchbox').fill('蓝牙配对');await p.keyboard.press('Enter');await ready();
  check(p.url().includes('metric=11'),'Failure category search does not find its parent metric');
  await p.locator('#metric-evidence-11 .issue-register').click();
  const form=p.locator('.action-record');await form.locator('[name=owner]').fill('首次绑定核查');await form.locator('[name=note]').fill('核对蓝牙配对错误码');
  await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
  const saved=await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
  check(saved&&Object.values(JSON.parse(saved)).some(r=>r.evidenceId===11&&r.baseline==='90.0%'),'Cause viewing changed the success-rate issue baseline');
  const baseline=await form.locator('> .table-note').innerText();await form.locator('[name=note]').fill('未保存的原因核查草稿');
  await p.locator('#A-tab-groups').click();await pair().locator('.workspace-calculation > summary').click();await p.locator('#A-tab-data').click();
  check(await form.locator('[name=note]').inputValue()==='未保存的原因核查草稿'&&await form.locator('> .table-note').innerText()===baseline&&
   await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===saved,'Checking causes replaces a draft or saved baseline');
  for(const mode of ['missing','mismatch','duplicate','zero','small']){
   const fixture=JSON.parse(JSON.stringify(diagnostics)),weeks=JSON.parse(JSON.stringify(weekly));
   const table=fixture.A.tables.find(t=>t.title==='首次绑定失败原因 · W12');
   if(mode==='missing')fixture.A.tables=fixture.A.tables.filter(t=>t!==table);
   if(mode==='mismatch')table.rows[0][1]++;
   if(mode==='duplicate')table.rows[1][0]=table.rows[0][0];
   if(mode==='zero'||mode==='small'){
    const total=mode==='zero'?0:20,counts=mode==='zero'?[0,0,0]:[10,6,4];
    table.rows.forEach((r,i)=>{r[1]=i<3?counts[i]:total;});
    weeks.find(w=>w.week===12).bindingAttempts.successful=2000-total;
   }
   const isolated=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),q=await isolated.newPage();
   try{
    q.on('pageerror',e=>errors.push(e.message));
    await q.route('**/data/diagnostics.json',r=>r.fulfill({json:fixture}));
    await q.route('**/data/weekly.json',r=>r.fulfill({json:weeks}));
    await q.goto(`${base}#/A?metric=11&week=12&panel=groups`);await q.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
    const own=q.locator('.evidence-pair[data-evidence-metric="11"]').filter({has:q.getByRole('heading',{name:'首次绑定失败原因 · W12',exact:true})});
    if(['zero','small'].includes(mode)){
     await own.locator('.workspace-calculation > summary').click();
     const text=await own.innerText();check(text.includes(mode==='zero'?'无失败尝试':'样本不足（少于30次）')&&!text.includes('NaN'),'A zero or small failure sample fabricates a proportion');
    }else check(await own.count()===0&&(await q.locator('.binding-failure-unavailable').innerText()).includes('待核对'),'Invalid failure source still plots reliable causes');
   }finally{await isolated.close();}
   results.push({fixture:mode});
  }
  check(!errors.length,errors.join('; '));
  return{status:'PASS',checks:['W12 exact counts, failure denominator, source next actions and period','no borrowed causes for another week/platform/model/status',
   'three desktop widths and actual 200% text','all three bars open exact rows without stale tooltip, native keyboard table','history, search, original issue baseline and draft',
   'missing, mismatched, duplicate, zero and small-sample source responses'],results};
 }finally{await context.close();}
}
