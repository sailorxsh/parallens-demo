// Isolated startup checks: geometry, CLS where supported, progress and retry.
async(page)=>{
 const base=new URL('.',page.url()).href;
 const context=await page.context().browser().newContext({viewport:{width:1366,height:768},locale:'zh-CN',reducedMotion:'reduce'});
 const p=await context.newPage(),errors=[],results=[];
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 p.on('pageerror',error=>errors.push(error.message));
 await p.addInitScript(()=>{
  window.__startup={cls:0,supported:PerformanceObserver.supportedEntryTypes.includes('layout-shift')};
  if(window.__startup.supported)new PerformanceObserver(list=>list.getEntries().forEach(entry=>{
   if(!entry.hadRecentInput)window.__startup.cls+=entry.value;
  })).observe({type:'layout-shift',buffered:true});
 });
 const rect=()=>p.locator('#main').boundingBox();
 try {
  await p.route('**/data/*.json',async route=>{await new Promise(resolve=>setTimeout(resolve,250));await route.continue();});
  for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
   await p.setViewportSize({width,height});
   await p.goto(base,{waitUntil:'domcontentloaded'});await p.locator('#load-meter').waitFor();
   await p.evaluate(()=>document.fonts.ready);
   const before=await rect();
   check(before.y===0,`Loading margins push main down at ${width}`);
   check(await p.locator('#main').getAttribute('aria-busy')==='true','Loading omitted busy state');
   check(await p.locator('.site-foot').evaluate(node=>node.getBoundingClientRect().top>=innerHeight),'Footer appears before dashboard is ready');
   if(width===1366)await p.screenshot({path:'output/playwright/v53-loading-stable.png'});
   await p.locator('#statusChart svg').waitFor();await p.waitForTimeout(100);
   const after=await rect(),startup=await p.evaluate(()=>window.__startup);
   check(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1,`Main jumps when loaded at ${width}`);
   check(!startup.supported||startup.cls<.05,`Startup layout shifts ${startup.cls} at ${width}`);
   check(await p.locator('#main').getAttribute('aria-busy')==='false','Ready did not clear busy state');
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Startup causes horizontal overflow');
   results.push({width,height,...startup});
  }
  await p.unroute('**/data/*.json');
  await p.route('**/data/weekly.json',route=>route.abort());
  await p.goto(`${base}#/D?country=US&metric=18&issue=18`,{waitUntil:'domcontentloaded'});
  await p.reload({waitUntil:'domcontentloaded'});
  await p.getByRole('button',{name:'重新加载',exact:true}).waitFor();
  check(await p.locator('#main').getAttribute('aria-busy')==='false','Error leaves the main busy');
  check(p.url().includes('country=US')&&p.url().includes('issue=18'),'Failure discarded direct scope and issue');
  await p.unroute('**/data/weekly.json');
  const progress=[];let active=0,peak=0;
  await p.route('**/data/*.json',async route=>{
   active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,100));
   await route.continue();active--;
  });
  await p.evaluate(()=>new MutationObserver(()=>{
   const meter=document.querySelector('#load-meter');if(meter)(window.__progress??=[]).push(meter.value);
  }).observe(document.querySelector('#main'),{subtree:true,attributes:true,childList:true}));
  await p.getByRole('button',{name:'重新加载',exact:true}).click();
  await p.locator('#metric-evidence-18').waitFor();
  progress.push(...await p.evaluate(()=>window.__progress??[]));
  check(progress.includes(17),'Retry progress does not reach all 17 datasets');
  check(progress.every((value,index)=>!index||value>=progress[index-1]),'Retry progress goes backwards');
  check(peak===6,'Startup does not use the intended bounded request batch');
  check((await p.locator('.action-record-header').innerText()).includes('DEMO-D-18-'),'Retry opens another issue');
  check(p.url().includes('country=US')&&p.url().includes('metric=18')&&p.url().includes('issue=18'),'Retry loses direct URL');
  check(errors.length===0,errors.join('; '));
  return {status:'PASS',results,peakRequests:peak,progress,checks:['stable main and footer at 3 desktop sizes','CLS below .05 where observable','busy state','bounded concurrency','failed fetch and retry','monotonic progress','direct filter, metric and issue URL preserved']};
 }finally{await context.close();}
}
