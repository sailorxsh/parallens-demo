// Regression for layout containment and unobscured keyboard evidence destinations.
async parent=>{
const context=await parent.context().browser().newContext({reducedMotion:'reduce'}),p=await context.newPage();try{
const out='output/playwright/v247-design-system/',rows=[];await p.setViewportSize({width:1600,height:1000});
for(const width of [1366,1600,1920])for(const size of [16,32])for(const page of ['A','B','C','D','E','F','G']){
await p.setViewportSize({width,height:1000});await p.goto('http://127.0.0.1:8765/#/'+page);await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(async size=>{document.documentElement.style.fontSize=size+'px';await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},size);
const state=await p.evaluate(()=>{const bad=[];for(const c of document.querySelectorAll('.topic-metric,.evidence-card')){const cr=c.getBoundingClientRect();for(const n of c.querySelectorAll('.metric-heading,.card-core,.metric-secondary-values,.headline-trend,.topic-visual-summary,.topic-composition,.topic-diagnose')){const r=n.getBoundingClientRect();if(r.width&&(r.right>cr.right+1||r.left<cr.left-1))bad.push({id:c.dataset.metricId||c.dataset.evidenceMetric,cls:n.className,why:'bounds'});if(n.clientWidth&&n.scrollWidth>n.clientWidth+1&&!n.closest('details:not([open])'))bad.push({id:c.dataset.metricId,cls:n.className,why:'overflow'})}}return{overflow:document.documentElement.scrollWidth>innerWidth+1,bad,metrics:document.querySelectorAll('.topic-metric').length}});
rows.push({page,width,size,...state});if(state.overflow||state.bad.length)throw Error(JSON.stringify(rows.at(-1)));
const route=p.url(),destinations=[];
for(const link of await p.locator('.evidence-jump').all()){
  await link.focus();await link.press('Enter');
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const result=await p.evaluate(()=>{
    const target=document.activeElement,heading=target.querySelector('.evidence-title');
    if(!target.classList.contains('evidence-card')||!heading)return{visible:false,reason:'missing evidence focus'};
    const r=heading.getBoundingClientRect(),hit=document.elementFromPoint(r.left+Math.min(20,r.width/2),r.top+r.height/2);
    return{id:target.dataset.evidenceMetric,visible:r.top>=0&&r.bottom<=innerHeight&&heading.contains(hit),top:r.top,bottom:r.bottom};
  });
  if(!result.visible||p.url()!==route)throw Error(JSON.stringify({page,width,size,destination:result,routeChanged:p.url()!==route}));
  destinations.push(result);
}
rows.at(-1).destinations=destinations;
}
await p.goto('http://127.0.0.1:8765/#/G');await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.locator('.evidence-jump').first().focus();await p.keyboard.press('Enter');if(!await p.evaluate(()=>document.activeElement.classList.contains('evidence-card')&&location.hash==='#/G'))throw Error('Evidence focus loses overview route');return {status:'PASS',states:rows};
}finally{await context.close()}
}
