// A summary must disclose its own time basis, including when adjacent KPIs use different windows.
async parent => {
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),results=[];
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);};
 const check=(v,m)=>{if(!v)throw Error(m);};
 try {
  for(const code of 'ABCDEFG') {
   await p.goto('http://127.0.0.1:8765/#/'+code);await ready();
   for(const width of [1366,1600,1920])for(const text of [100,200]) {
    await p.setViewportSize({width,height:1000});await p.evaluate(n=>document.documentElement.style.fontSize=n+'%',text);
    const windows=await p.locator('.topic-highlight').evaluateAll(nodes=>nodes.map(n=>{
     const id=n.id.split('-').at(-1),page=n.id.split('-')[2],note=n.querySelector('.topic-highlight-window'),r=note.getBoundingClientRect(),box=n.getBoundingClientRect(),value=n.querySelector('strong').getBoundingClientRect();
     return {id,text:note.textContent,matching:note.textContent===document.querySelector(`#topic-${page}-metric-${id} .topic-window`).textContent,fits:r.left>=box.left&&r.right<=box.right&&r.top>=value.bottom&&note.scrollWidth<=note.clientWidth+1};
    }));
    check(windows.length&&windows.every(w=>w.text&&w.matching&&w.fits),'Invalid summary windows '+JSON.stringify({code,width,text,windows}));
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');
    results.push({code,width,text,windows});
    if(width===1600&&text===100)await p.screenshot({path:`output/playwright/v213-audit/after-${code}.png`});
   }
   await p.evaluate(()=>document.documentElement.style.fontSize='100%');
  }
  for(const [route,id,required]of [
   ['A?week=9',9,['W9']],['A?week=9',16,['2026-09-14','2026-09-20']],
   ['B?retentionMonth=2026-07',24,['2026-07']],['D?renewalMonth=2026-07',23,['2026-07']],
   ['G',53,['2026-09-23 12:00 UTC','2026-09-24 12:00 UTC']],
   ['G',54,['2026-09-23 00:00 UTC','2026-09-24 00:00 UTC']]
  ]) {
   await p.goto('http://127.0.0.1:8765/#/'+route);await ready();
   const link=p.locator(`#topic-highlight-${route[0]}-${id}`),window=await link.locator('.topic-highlight-window').innerText();
   check(required.every(text=>window.includes(text)),'Incorrect time basis '+route+': '+window);
   await link.focus();await p.keyboard.press('Enter');await ready();
   check(await p.locator(`#metric-evidence-${id}`).count()===1,'Summary diagnosis link broken');
   results.push({route,id,window,diagnosis:true});
  }
  return {status:'PASS',results};
 }finally{await c.close();}
}
