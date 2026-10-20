// Do not record a half-restored page as its original reading location during rapid traversal.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name();
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1100},reducedMotion:'reduce'});
 const p=await c.newPage(),states=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));};
 const state=()=>p.evaluate(()=>({hash:location.hash,top:scrollY,note:document.querySelector('.action-record [name=note]')?.value,
  issue:document.querySelector('.action-record [name=issueMetric]')?.value,
  baseline:document.querySelector('.action-record > .table-note')?.textContent,
  disclosures:[...document.querySelectorAll('#main details[open]')].map(n=>n.querySelector(':scope > summary')?.textContent),
  legends:[...document.querySelectorAll('.chart-legend-button')].map(n=>[n.textContent,n.getAttribute('aria-pressed')])}));
 const same=(before,after)=>{
  check(before.hash===after.hash&&Math.abs(before.top-after.top)<=2,`Reading position lost: ${JSON.stringify({before,after})}`);
  for(const key of ['note','issue','baseline','disclosures','legends'])check(JSON.stringify(before[key])===JSON.stringify(after[key]),`Reading history changed ${key}`);
 };
 try{
  for(const [width,height,size] of [[1366,768,16],[1600,1100,16],[1920,1080,16],[1366,1000,32]]){
   await p.setViewportSize({width,height});await p.goto(`${base}#/A?metric=13&issue=13`);await ready();
   await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await ready();
   await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
   await p.locator('.action-record [name=note]').fill('激活证据私人草稿，未保存');
   const calculation=p.locator('#A-panel-change .workspace-calculation > summary').first();await calculation.click();
   await p.evaluate(()=>scrollTo({top:Math.min(850,document.documentElement.scrollHeight-innerHeight),behavior:'instant'}));await ready();
   const a=await state();
   await p.evaluate(()=>{location.hash=routeHref('C',42);});await ready();
   await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
   await p.locator('.action-record [name=note]').fill('设备证据私人草稿，未保存');
   await p.evaluate(()=>scrollTo({top:Math.min(500,document.documentElement.scrollHeight-innerHeight),behavior:'instant'}));await ready();
   const b=await state();
   for(const frames of [0,1,2]){
    await p.evaluate(frames=>new Promise(resolve=>{
     let count=0;
     const traverse=()=>{
      if(++count===1){
       if(!frames)setTimeout(()=>history.forward(),0);
       else{let pending=frames;const next=()=>--pending?requestAnimationFrame(next):history.forward();requestAnimationFrame(next);}
      }else{removeEventListener('popstate',traverse);resolve();}
     };
     addEventListener('popstate',traverse);history.back();
    }),frames);
    await ready();same(b,await state());await p.goBack();await ready();same(a,await state());
    if(width===1600&&frames===0)await p.screenshot({path:`output/playwright/v140-audit/${engine}-restored-reading.png`});
    await p.goForward();await ready();same(b,await state());
    states.push({width,height,size,frames,a,b});
   }
   // Once restoration finishes, deliberate new reading positions must still be remembered.
   await p.goBack();await ready();await p.evaluate(()=>scrollBy({top:scrollY>100?-80:80,behavior:'instant'}));await ready();
   const moved=await state();check(Math.abs(moved.top-a.top)>20,'Fixture did not exercise a deliberate new reading position');
   await p.goForward();await ready();same(b,await state());await p.goBack();await ready();same(moved,await state());
   check(await p.evaluate(()=>!localStorage.getItem('parallens-demo-actions-v1')),'History silently persists private issue drafts');
   check(await p.evaluate(()=>!JSON.stringify(history.state).includes('私人草稿')),'Private draft leaked to browser history state');
  }
  check(!errors.length,errors.join('; '));
  return {status:'PASS',states,errors};
 }finally{await c.close();}
}
