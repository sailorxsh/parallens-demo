// Matched-period device event contributions, from raw weekly counts to the visible chart and saved issue.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),results=[],errors=[];
 const context=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await context.newPage();
 const check=(ok,text)=>{if(!ok)throw Error(text);};p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const response=await parent.request.get(`${base}data/weekly.json`),weeks=await response.json();
 const core=await(await parent.request.get(`${base}data/route-core.json`)).json();
 const ready=async()=>{
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 };
 const open=async query=>{await p.goto(`${base}#/C?metric=42&panel=groups${query?'&'+query:''}`);await ready();};
 const pair=()=>p.locator('.evidence-pair[data-comparison-group="device-periods"]');
 const current=()=>p.locator('.detail-finding'),form=()=>p.locator('.action-record'),input=name=>form().locator(`[name="${name}"]`);
 const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const expected=query=>{
  const params=new URLSearchParams(query),index=params.has('week')?Number(params.get('week'))-1:null;
  const periods=index===null?[weeks.slice(0,8),weeks.slice(8)]:[[weeks[index-1]],[weeks[index]]];
  const populations=periods.map(ws=>ws.flatMap(w=>w.deviceEventsBird.records).filter(r=>
   (!params.has('deviceModel')||r.model===params.get('deviceModel'))&&(!params.has('firmware')||r.firmware===params.get('firmware'))));
  const count=rows=>[rows.reduce((s,r)=>s+r.empty,0),rows.reduce((s,r)=>s+r.triggers,0)];
  const overall=populations.map(count);
  const groups=[true,false].map(target=>({name:target?'K6 · 固件2.8':'其他型号／固件',counts:populations.map(rows=>count(rows.filter(r=>(r.model==='K6'&&r.firmware==='2.8')===target)))}))
   .filter(g=>g.counts.some(c=>c[1]>0));
  return {groups,overall,changes:groups.map(g=>(g.counts[1][0]/overall[1][1]-g.counts[0][0]/overall[0][1])*100)};
 };
 const num=n=>n.toLocaleString('zh-CN'),pp=n=>`${Math.abs(n)<.005?'':n>0?'+':'−'}${Math.abs(n).toFixed(2)} 个百分点`;
 try{
  const queries=['','deviceModel=K6','firmware=2.8','deviceModel=K6&firmware=2.8','firmware=Other','deviceModel=Bird Lite','week=2','week=9','week=12'];
  for(const width of [1366,1600,1920]){
   await p.goto('about:blank');await p.setViewportSize({width,height:1000});
   for(const query of queries){
    await open(query);await pair().locator('svg').waitFor();
    const source=expected(query),chart=pair().locator('.detail-chart');
    const option=await chart.evaluate(n=>echarts.getInstanceByDom(n).getOption());
    check(JSON.stringify(option.xAxis[0].data)===JSON.stringify(source.groups.map(g=>g.name)),`Wrong partition ${query}`);
    check(option.series[0].data.every((point,i)=>Math.abs(point.value-source.changes[i])<1e-9),`Contribution differs from raw weekly counts ${query}`);
    check(option.yAxis[0].min<=Math.min(0,...source.changes)&&option.yAxis[0].max>=Math.max(0,...source.changes),'Axis hides a contribution or the zero baseline');
    option.series[0].data.forEach(point=>check(point.itemStyle.color===(point.value===0?'#718078':point.value>0?'#bc6a20':'#356d51'),'Empty-trigger deterioration is shown as improvement'));
    const details=pair().locator('.workspace-calculation');await details.locator('summary').focus();await p.keyboard.press('Enter');
    const rows=await details.locator('tbody tr').evaluateAll(ns=>ns.map(n=>[...n.children].map(c=>c.textContent)));
    source.groups.forEach((g,i)=>check(rows[i][0]===g.name&&rows[i][1]===`${num(g.counts[0][0])} / ${num(source.overall[0][1])}`&&
     rows[i][2]===`${num(g.counts[1][0])} / ${num(source.overall[1][1])}`&&rows[i][3]===pp(source.changes[i]),`Wrong contribution denominator ${query}`));
    const note=await pair().innerText();check(note.includes('不证明固件导致异常')&&note.includes('同期总体触发数'),'Missing calculation/cause boundary');
    const before=p.url();await details.locator('summary').press('Enter');
    if(source.changes.some(v=>Math.abs(v)>.005)){
     await chart.scrollIntoViewIfNeeded();await ready();
     const point=await chart.evaluate(n=>{const e=echarts.getInstanceByDom(n),o=e.getOption(),i=o.series[0].data.findIndex(v=>Math.abs(v.value)>.005),r=n.getBoundingClientRect();
      const [x,y]=e.convertToPixel({seriesIndex:0},[i,o.series[0].data[i].value/2]);return {x:r.x+x,y:r.y+y,i};});
     await p.mouse.click(point.x,point.y);await ready();
     check(await details.evaluate(n=>n.open)&&await details.locator('tr.chart-selected').count()===1,'Native point does not reveal its exact evidence');
     check(await details.locator('tr.chart-selected').evaluate(n=>[...n.parentElement.children].indexOf(n))===point.i,'Native point selects a different group');
    }
    check(p.url()===before&&await stored()===null,'Reading contributions changes scope or saves an issue');
    const breakdown=p.locator('.device-rate-decomposition');await breakdown.locator('> summary').click();
    const withinRows=await breakdown.locator('tbody tr').evaluateAll(ns=>ns.map(n=>[...n.children].map(c=>c.textContent)));
    source.groups.forEach((g,i)=>check(withinRows[i][1].startsWith(`${num(g.counts[0][0])} / ${num(g.counts[0][1])}`)&&
     withinRows[i][2].startsWith(`${num(g.counts[1][0])} / ${num(g.counts[1][1])}`),'Group-rate and contribution denominators are confused'));
    await breakdown.locator('> summary').click();
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Contribution evidence overflows the page');
    if(width===1600&&query===''){
     await p.getByRole('button',{name:'空触发率变化 · 互斥分组贡献',exact:true}).click();
     await p.screenshot({path:`output/playwright/v114-audit/07-contribution-${browser.browserType().name()}.png`,scale:'css'});
    }
    results.push({kind:'source-and-render',width,query,values:source.changes});
   }
   for(const query of ['week=1','country=US','productLine=Hunting']){
    await open(query);check(await pair().count()===0,'Unsupported period or missing source fabricates a contribution');
    if(query==='week=1')check((await p.locator('#C-panel-groups').innerText()).includes('没有前一完整周'),'First week lacks a missing-comparison explanation');
   }
   for(const size of [24,32]){
    await p.goto('about:blank');await open('');await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await ready();
    await p.getByRole('button',{name:'空触发率变化 · 互斥分组贡献',exact:true}).click();await pair().locator('svg').waitFor();
    const clipping=await chartLabelBounds();check(!clipping.length,`Enlarged labels clipped ${width}/${size}: ${JSON.stringify(clipping)}`);
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Enlarged contribution overflows');
    results.push({kind:'enlarged-reading',width,fontSize:size});
    if(width===1366&&size===32)await p.screenshot({path:`output/playwright/v114-audit/08-contribution-zoom-${browser.browserType().name()}.png`,scale:'css'});
   }
  }
  // Counterfactual samples verify negative/mixed marks and suppression in actual SVG output.
  const event=(empty,triggers,target)=>({model:target?'K6':'Bird Pro',firmware:target?'2.8':'Other',empty,triggers});
  for(const fixture of [
   {name:'decrease',before:[event(3280,4000,true),event(2520,6000,false)],after:[event(1680,4000,true),event(2520,6000,false)],changes:[-16,0]},
   {name:'composition-reversal',before:[event(54,90,true),event(6,30,false)],after:[event(21,30,true),event(27,90,false)],changes:[-27.5,17.5]},
   {name:'small-group',before:[event(3,7,true),event(50,100,false)],after:[event(3,7,true),event(50,100,false)],suppressed:true}
  ]){
   await p.goto('about:blank');await p.setViewportSize({width:1600,height:1000});
   let injectionHits=0;
   await p.route('**/data/route-core.json*',async route=>{
    injectionHits++;
    const copy=JSON.parse(JSON.stringify(weeks));copy.forEach((w,i)=>{const rows=i<8?fixture.before:fixture.after;
     w.deviceEventsBird.records=rows;w.deviceEventsBird.empty=rows.reduce((s,r)=>s+r.empty,0);w.deviceEventsBird.triggers=rows.reduce((s,r)=>s+r.triggers,0);
    });await route.fulfill({json:{...core,sources:{...core.sources,weekly:copy}}});
   });
   await open('');
   check(injectionHits>0,'Fixture did not reach the current route source');
   if(fixture.suppressed){check(await pair().count()===0&&(await p.locator('#C-panel-groups').innerText()).includes('少于30次')&&
    (await current().innerText()).includes('未据此生成分组变化判断'),'Small group fabricates a reliable contribution');}
   else{
    await pair().locator('svg').waitFor();const option=await pair().locator('.detail-chart').evaluate(n=>echarts.getInstanceByDom(n).getOption());
    fixture.changes.forEach((v,i)=>check(Math.abs(option.series[0].data[i].value-v)<1e-9&&option.series[0].data[i].itemStyle.color===(v<0?'#356d51':v>0?'#bc6a20':'#718078'),'Signed contribution or adverse colors disagree'));
    check(option.yAxis[0].min<=Math.min(0,...fixture.changes)&&option.yAxis[0].max>=Math.max(0,...fixture.changes),'Mixed contributions are clipped');
    check((await pair().locator('svg').textContent()).includes(pp(fixture.changes[0])),'Visible signed label is missing');
   }
   await p.unroute('**/data/route-core.json*');results.push({kind:'counterfactual-fixture',name:fixture.name});
  }
  // Current observation leads to this comparison, then the issue retains its original baseline and private draft.
  await p.goto('about:blank');await p.setViewportSize({width:1600,height:1000});
  await p.goto(base);await ready();await p.locator('.foundation-grid a[href*="metric=42"]').click();await ready();
  await current().getByRole('link',{name:'查看分组变化证据 ↓',exact:true}).click();await ready();
  check(p.url().includes('panel=groups')&&await pair().isVisible(),'Observation link does not open its change evidence');
  await p.screenshot({path:`output/playwright/v114-audit/09-observation-destination-${browser.browserType().name()}.png`,scale:'css'});
  await current().locator('.issue-register').click();await ready();
  await input('owner').fill('设备诊断任务演示');await input('note').fill('K6固件2.8对总体变化贡献16pp；待日志核验，不确认因果。');
  await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  const saved=await stored(),baseline=await form().locator('> .table-note').innerText();
  await p.screenshot({path:`output/playwright/v114-audit/10-device-registration-${browser.browserType().name()}.png`,scale:'css'});
  await input('note').fill('查看其他专题时保留的未保存草稿');
  // The former diagnostic KPI strip no longer exists. Exercise current cross-page navigation.
  await p.locator('.nav-link[href="#/E"]').click();await ready();await p.goBack();await ready();
  check(await input('issueMetric').inputValue()==='42'&&await input('note').inputValue()==='查看其他专题时保留的未保存草稿'&&await form().locator('> .table-note').innerText()===baseline&&await stored()===saved,'Cross-page return changes issue, draft or baseline');
  await p.reload();await ready();
  check(await input('note').inputValue()==='K6固件2.8对总体变化贡献16pp；待日志核验，不确认因果。'&&await form().locator('> .table-note').innerText()===baseline,'Reload loses saved evidence or baseline');
  await p.screenshot({path:`output/playwright/v114-audit/12-reopened-issue-${browser.browserType().name()}.png`,scale:'css'});
  check(!errors.length,errors.join('; '));return {status:'PASS',checks:['raw event denominators and matched periods','scope recomputation','zero and signed adverse colors',
   'native point-to-row and keyboard evidence','three desktop widths and 150/200 text','unsupported source boundaries','home → observation → exact evidence → registration → another topic → back/reload'],results,errors};
 }catch(error){error.message+=`\nRoute: ${p.url()}\nBrowser errors: ${JSON.stringify(errors)}`;throw error;}
 finally{await context.close();}
 async function chartLabelBounds(){return pair().locator('.detail-chart').evaluate(n=>{
  const box=n.getBoundingClientRect();return [...n.querySelectorAll('svg text')].filter(t=>{const r=t.getBoundingClientRect();return r.width&&r.height&&(r.left<box.left-2||r.right>box.right+2||r.top<box.top-2||r.bottom>box.bottom+2);}).map(t=>t.textContent);
 });}
}
