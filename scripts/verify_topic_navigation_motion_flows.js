// One explicit topic navigation must not bubble into a second smooth evidence jump.
async parent=>{
 const base=new URL('.',parent.url()).href,b=parent.context().browser(),results=[],errors=[];
 const check=(ok,m)=>{if(!ok)throw Error(m);};
 for(const motion of ['reduce','no-preference']){
  const c=await b.newContext({viewport:{width:1600,height:1000},reducedMotion:motion}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  try{
   for(const width of [1366,1600,1920])for(const [kind,id]of[['card',19],['highlight',18]]){
    await p.setViewportSize({width,height:1000});await p.goto('about:blank');await p.goto(base+'#/D');await ready();
    await p.evaluate(()=>{const original=showMetricEvidence;window.__evidenceJumps=[];showMetricEvidence=function(id,options={}){__evidenceJumps.push({id,...options});return original(id,options);};});
    const trigger=p.locator(`#topic-${kind==='card'?'open':'highlight'}-D-${id}`);await trigger.focus();await p.keyboard.press('Enter');await ready();
    const calls=await p.evaluate(()=>__evidenceJumps);check(calls.length===1&&calls[0].id===id&&calls[0].behavior!=='smooth','Handled topic click triggers a second delegated jump');
    if(motion==='reduce')check(await p.evaluate(id=>{const h=document.querySelector(`#metric-evidence-${id} h2`),r=h.getBoundingClientRect();return document.activeElement===h&&r.top>=0&&r.bottom<=innerHeight;},id),'Reduced-motion destination is still moving or outside viewport');
    else await p.waitForFunction(id=>{const h=document.querySelector(`#metric-evidence-${id} h2`),r=h.getBoundingClientRect();return document.activeElement===h&&r.top>=0&&r.bottom<=innerHeight;},id);
    const self=p.locator('.workspace-observation a.insight-link').filter({hasText:'查看本条指标证据'});check(await self.getAttribute('href')===new URL(p.url()).hash,'Fixture does not exercise a real same-route link');
    await p.evaluate(()=>{__evidenceJumps=[];window.__historyLength=history.length;window.__workingEvidence=document.querySelector('.income-workspace');});
    await self.click();await ready();const repeated=await p.evaluate(()=>({jumps:__evidenceJumps,same:__workingEvidence===document.querySelector('.income-workspace'),history:history.length===__historyLength}));
    check(repeated.jumps.length===1&&repeated.jumps[0].id===id&&repeated.jumps[0].behavior===(motion==='reduce'?'instant':'smooth'),'Same-route navigation ignores reduced motion or duplicates its action');
    check(repeated.same&&repeated.history,'Same-route evidence link recreates the working view or history');
    if(motion==='reduce')check(await p.evaluate(id=>{const r=document.querySelector(`#metric-evidence-${id} h2`).getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;},id),'Same-route reduced-motion jump is not immediately visible');
    await p.locator('.topic-return').click();await ready();check(await p.evaluate(key=>document.activeElement.id===key,`topic-${kind==='card'?'open':'highlight'}-D-${id}`),'Return loses its original card/highlight focus');
    results.push({motion,width,kind,id,firstJumps:calls.length,repeatedJumps:repeated.jumps.length});
   }
  }finally{await c.close();}
 }
 check(!errors.length,errors.join('; '));return{status:'PASS',cases:results.length,checks:['handled link is acted on once','card and highlight keyboard entry','reduced motion immediately reveals heading','same-route jump respects motion without rerender/history writes','original trigger focus restored'],results,errors};
}
