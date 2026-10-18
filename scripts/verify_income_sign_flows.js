// Income drivers with opposing signs must not share an improvement encoding.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),states=[],errors=[];
 const c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage();
 p.on('pageerror',e=>errors.push(e.message));const check=(ok,message)=>{if(!ok)throw Error(message);};
 const [metrics,diagnostics]=await Promise.all(['metric-values','diagnostics'].map(async name=>{
  const response=await parent.request.get(`${base}data/${name}.json`);return response.json();
 }));
 const cases=[
  {name:'increase',before:[49980,9800],after:[52000,10000],effects:[1030,990]},
  {name:'opposing',before:[49980,9800],after:[50000,10000],effects:[1010,-990]},
  {name:'decrease',before:[54000,10000],after:[52000,10000],effects:[0,-2000]},
  {name:'both-decrease',before:[54000,10000],after:[48000,9600],effects:[-2080,-3920]},
  {name:'opposing-reverse',before:[49980,9800],after:[52000,9600],effects:[-1051.67,3071.67]},
  {name:'unchanged',before:[52000,10000],after:[52000,10000],effects:[0,0]},
  {name:'cents',before:[52000,10000],after:[52001,10001],effects:[5.2,-4.2]}
 ];
 let fixture=cases[0];
 const pair=()=>p.locator('.evidence-pair').filter({has:p.getByRole('heading',{name:/订阅净收入变化拆分/})});
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);await pair().locator('svg').waitFor();await pair().scrollIntoViewIfNeeded();
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 try{
  await p.route('**/data/metric-values.json',r=>{const data=structuredClone(metrics),v=data.m35.value;
   v.subscriptionNetIncome=fixture.after[0];v.monthlySubscriptionPayers=fixture.after[1];v.ARPPU=fixture.after[0]/fixture.after[1];return r.fulfill({json:data});});
  await p.route('**/data/diagnostics.json',r=>{const data=structuredClone(diagnostics);
   data.E.chart.series[0].values[1]=fixture.before[1];data.E.chart.series[0].values[2]=fixture.after[1];
   data.E.extraCharts[0].series[0].values[1]=fixture.before[0]/fixture.before[1];data.E.extraCharts[0].series[0].values[2]=fixture.after[0]/fixture.after[1];return r.fulfill({json:data});});
  for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});
   for(fixture of cases){
    await p.goto('about:blank');await p.goto(`${base}#/E?metric=35`);await ready();
    await p.evaluate(s=>document.documentElement.style.fontSize=`${s}px`,size);await ready();
    const observed=await pair().locator('.detail-chart').evaluate(n=>{
     const e=echarts.getInstanceByDom(n),o=e.getOption(),r=n.getBoundingClientRect();
     const texts=[...n.querySelectorAll('svg text')];
     return {data:o.series[0].data,axis:[o.yAxis[0].min,o.yAxis[0].max],
      colors:[...n.querySelectorAll('svg path')].map(n=>n.getAttribute('fill')),
      labels:texts.map(t=>{const b=t.getBoundingClientRect();return {text:t.textContent,color:t.getAttribute('fill'),top:b.top,bottom:b.bottom,left:b.left,right:b.right};}),
      endpoints:o.series[0].data.map((d,i)=>{const [x,y]=e.convertToPixel({seriesIndex:0},[i,d.value]);return {x:r.x+x,y:r.y+y};}),
      box:{left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
    });
    check(Math.abs(fixture.effects.reduce((s,n)=>s+n,0)-(fixture.after[0]-fixture.before[0]))<1e-8,'Independent fixture does not reconcile');
    fixture.effects.forEach((value,i)=>{
     const point=observed.data[i],color=value===0?'#718078':value<0?'#bc6a20':'#356d51',labelColor=value===0?'#58695b':value<0?'#97541c':'#315e41';
     check(Math.abs(point.value-value)<1e-8&&point.itemStyle.color===color&&point.label.color===labelColor,'Signed value has wrong visual meaning');
     check(observed.axis[0]<=Math.min(0,value)&&observed.axis[1]>=Math.max(0,value),'Signed axis clips contribution or zero');
     const label=observed.labels.find(n=>n.text===`$${value.toLocaleString('zh-CN')}`&&n.color===labelColor);
     check(label&&label.left>=observed.box.left-2&&label.right<=observed.box.right+2&&label.top>=observed.box.top-2&&label.bottom<=observed.box.bottom+2,'Signed amount label is missing or clipped');
     if(value!==0){check(observed.colors.includes(color),'Actual SVG mark has the wrong sign color');
      check(value<0?label.top>=observed.endpoints[i].y:label.bottom<=observed.endpoints[i].y,'Amount label is at the zero baseline rather than the value endpoint');}
    });
    check((await pair().innerText()).includes('正值增加收入，负值抵减收入'),'Direction relies on color alone');
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Signed chart overflows at enlarged text');
    if(width===1600&&fixture.name==='opposing')await p.screenshot({path:`output/playwright/v121-audit/03-income-sign-${browser.browserType().name()}.png`,scale:'css'});
    states.push({width,size,fixture:fixture.name,values:observed.data.map(d=>d.value),axis:observed.axis});
   }
  }
  await p.setViewportSize({width:1600,height:1000});fixture=cases[1];await p.goto('about:blank');await p.goto(`${base}#/E?metric=35&issue=35`);await ready();
  const form=p.locator('.action-record');await form.locator('[name=owner]').fill('收入贡献核对');await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
  const original=await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1')),baseline=await form.locator('> .table-note').innerText();
  await form.locator('[name=note]').fill('核对负贡献时保留的未保存草稿');
  await pair().locator('.detail-chart').scrollIntoViewIfNeeded();await ready();
  const point=await pair().locator('.detail-chart').evaluate(n=>{const e=echarts.getInstanceByDom(n),r=n.getBoundingClientRect(),[x,y]=e.convertToPixel({seriesIndex:0},[1,-990/2]);return {x:r.x+x,y:r.y+y};});
  await p.mouse.click(point.x,point.y);await p.locator('.workspace-calculation[open] tr.chart-selected').waitFor();
  check((await pair().locator('tr.chart-selected').innerText()).includes('8月'),'Negative bar links to the wrong income period');
  check(await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===original&&await form.locator('> .table-note').innerText()===baseline&&
   await form.locator('[name=note]').inputValue()==='核对负贡献时保留的未保存草稿','Reading negative contribution changes saved evidence or draft');
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['7 fixed reconciled source fixtures at 4 desktop/text layouts','positive/negative/zero mark colors',
   'actual SVG amount at each value endpoint','zero remains visible','no clipping or overflow','native negative mark to source row','original baseline, comparison archive, JSON and draft preserved'],errors};
 }finally{await c.close();}
}
