// Regression: sticky evidence navigation must remain legible and drill-down focus must be visible.
async parent=>{
 const assert=require('assert'),base=new URL('.',parent.url()).href;
 const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage(),states=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]')&&pendingReadingRestore===null);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 try{
 for(const width of [1366,1600,1920])for(const font of [16,32]){
  await p.setViewportSize({width,height:1000});
  for(const [topic,id]of [['A',14],['B',30],['C',42],['D',18],['E',39],['F',51],['G',54]]){
   await p.goto(base+`#/${topic}?metric=${id}&panel=groups`);await ready();await p.evaluate(f=>document.documentElement.style.fontSize=f+'px',font);
   const contextStyle=await p.locator('.income-context').evaluate(n=>({surface:getComputedStyle(n).backgroundColor,controls:getComputedStyle(n.querySelector('.income-context-controls')).backgroundColor}));
   assert.equal(contextStyle.controls,contextStyle.surface,`${topic}${id}: sticky context controls must mask scrolling records`);
   const nav=p.locator('.workspace-locations');
   if(await nav.count()){
    await nav.evaluate(n=>scrollTo({top:scrollY+n.getBoundingClientRect().top+200,behavior:'instant'}));
    const style=await nav.evaluate(n=>({background:getComputedStyle(n).backgroundColor,position:getComputedStyle(n).position}));
    assert(!/rgba\(.*,[\s]*0\)$|transparent/.test(style.background),`${topic}${id}: transparent evidence navigation`);
    states.push({topic,id,width,font,...style});
   }
  }
  await p.goto(base+'#/G?metric=54&panel=groups&appPlatform=Android');await ready();await p.evaluate(f=>document.documentElement.style.fontSize=f+'px',font);
  const original=await p.evaluate(()=>({hash:location.hash,metric:metric(54),stored:localStorage.getItem(ACTION_STORAGE_KEY)}));
  for(const [label,key]of [['内容互动','Content'],['账号与绑定','Account'],['消息触达','Notification']]){
   await p.getByRole('button',{name:label,exact:true}).press('Enter');
   const state=await p.evaluate(()=>{const select=document.querySelector('.quality-event-type'),chart=document.querySelector('.quality-explorer .detail-chart-panel'),nav=document.querySelector('.workspace-locations');return {value:select.value,focus:document.activeElement===select,top:select.getBoundingClientRect().top,bottom:select.getBoundingClientRect().bottom,chartTop:chart.getBoundingClientRect().top,navBottom:nav.getBoundingClientRect().bottom,values:echarts.getInstanceByDom(chart.querySelector('.detail-chart')).getOption().series[0].data,want:qualityHistory('loss',filterState,select.value).values,height:innerHeight};});
   assert.equal(state.value,key);assert(state.focus);assert(state.top>state.navBottom&&state.bottom<state.height);assert(state.chartTop>state.navBottom&&state.chartTop<state.height);assert.deepEqual(state.values,state.want);
  }
  assert.deepEqual(await p.evaluate(()=>({hash:location.hash,metric:metric(54),stored:localStorage.getItem(ACTION_STORAGE_KEY)})),original);
 }
 assert.deepEqual(errors,[]);return {status:'PASS',states,drilldowns:18,errors};
 }finally{await context.close();}
}
