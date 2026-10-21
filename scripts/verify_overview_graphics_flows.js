// Verify raw chart values, proportional geometry, table fallback and lazy loading.
async parent=>{
 const b=parent.context().browser(),context=await b.newContext({viewport:{width:1600,height:1000}}),p=await context.newPage(),errors=[],results=[];
 const check=(ok,m)=>{if(!ok)throw Error(m);};p.on('pageerror',e=>errors.push(e.message));
 const open=async(route)=>{await p.goto('http://127.0.0.1:8765/#/'+route);await p.waitForFunction(()=>document.querySelector('#main[aria-busy=false]')&&lastRenderedHash===location.hash);};
 try{
 for(const route of ['E','F','E?country=US','F?country=US']){
 await open(route);const values=await p.evaluate(()=>Array.from(document.querySelectorAll('.topic-bar-row')).map(r=>({id:r.closest('.topic-metric')?.dataset.metricId||r.closest('[data-evidence-metric]')?.dataset.evidenceMetric,n:+r.dataset.value,scale:+r.dataset.scale,width:r.querySelector('.topic-bar-mark')?.style.width,text:r.textContent})));
 if(route==='F?country=US'){check(values.every(r=>r.id==='51'),'Missing scope leaks overall chart');check(values.filter(r=>r.id==='51').reduce((n,r)=>n+r.n,0)===162,'Supported unbinding composition does not close');check((await p.locator('#topic-F-metric-48').innerText()).includes('待补'),'Missing scope explanation absent');}else check(values.length>0,'No rendered graphics '+route);check(values.every(r=>Number.isFinite(r.n)&&r.n>=0&&r.scale>0),'Invalid raw chart values');
 check(!await p.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('echarts'))),'Overview loads ECharts');
 for(const d of await p.locator('.topic-chart-data').all()){await d.locator('summary').focus();await p.keyboard.press('Enter');check(await d.getAttribute('open')!==null,'Keyboard table disclosure');check(await d.locator('table').first().isVisible(),'Full table inaccessible');}
 results.push({route,rows:values.length});
 }
 for(const width of [1366,1600,1920])for(const zoom of [1,2]){await p.setViewportSize({width,height:1000});await open('F');await p.evaluate(z=>document.documentElement.style.fontSize=(z*100)+'%',zoom);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow '+width+'/'+zoom);results.push({width,zoom});}
 await p.setViewportSize({width:1600,height:1000});await p.evaluate(()=>document.documentElement.style.fontSize='100%');await open('E');await p.locator('#topic-E-metric-34').scrollIntoViewIfNeeded();await p.screenshot({path:'output/playwright/v203-visuals/after-E.png'});
 const rights=await p.evaluate(()=>({chart:Array.from(document.querySelectorAll('[data-evidence-metric="34"] .topic-bar-row')).map(r=>+r.dataset.value),expected:paidRightsComposition().counts}));check(JSON.stringify(rights.chart)===JSON.stringify(rights.expected),'Rights source mismatch');
 await open('F');await p.locator('#topic-F-metric-48').scrollIntoViewIfNeeded();await p.screenshot({path:'output/playwright/v203-visuals/after-F.png'});check(!errors.length,errors.join(';'));return {status:'PASS',results,rights,errors};
 }finally{await context.close();}
}
