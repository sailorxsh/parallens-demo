// Adjacent compact groups preserve reading order, accessible navigation and natural card height.
async parent=>{
 const b=parent.context().browser(),c=await b.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),results=[];
 const check=(v,m)=>{if(!v)throw Error(m);},ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 try{
  for(const width of [1366,1600,1920])for(const size of [16,32]){
   await p.setViewportSize({width,height:1000});await p.goto(new URL('.',parent.url()).href+'#/G');await ready();await p.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);await ready();
   const geometry=await p.evaluate(()=>{const nodes=[...document.querySelectorAll('.topic-group')],cards=[...document.querySelectorAll('.topic-metric')];return{groups:nodes.map(n=>({top:n.getBoundingClientRect().top,left:n.getBoundingClientRect().left,width:n.clientWidth})),ids:cards.map(n=>Number(n.dataset.metricId)),heights:cards.map(n=>n.clientHeight),overflow:document.documentElement.scrollWidth>innerWidth+1};});
   check(!geometry.overflow,'Page overflow');check(JSON.stringify(geometry.ids)==='[53,54,15,29,42,52]','Reading order changed');
   if(size===16)check(Math.abs(geometry.groups[0].top-geometry.groups[1].top)<1&&geometry.groups[1].left>geometry.groups[0].left,'Compact groups not paired');
   else check(geometry.groups[1].top>geometry.groups[0].top,'Text enlargement should stack compact groups');
   check(geometry.heights[3]<geometry.heights[2],'Short card still stretched to long neighbor');
   for(const index of [0,1,2,1,0]){
    const nav=p.locator('.topic-navigation button').nth(index);await nav.focus();await p.keyboard.press('Enter');await ready();
    const current=await p.evaluate(()=>({focus:document.activeElement?.closest('.topic-group')?.id,active:document.querySelector('.topic-navigation [aria-current]')?.dataset.target}));
    check(current.focus===`topic-G-group-${index}`&&current.active===current.focus,'Focused group and navigation disagree '+JSON.stringify({width,size,index,current}));
   }
   if(width===1600&&size===16)await p.screenshot({path:`output/playwright/v188-spacing/${b.browserType().name()}-G.png`,fullPage:true});results.push({width,size,geometry});
  }
  return {status:'PASS',results};
 }finally{await c.close();}
}
