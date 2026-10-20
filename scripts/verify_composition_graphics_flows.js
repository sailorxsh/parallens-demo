async parent=>{
 const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),results=[],errors=[];
 const check=(ok,m)=>{if(!ok)throw Error(m);};page.on('pageerror',e=>errors.push(e.message));
 try{for(const code of ['B','D'])for(const query of ['', '?country=US','?appPlatform=Android']){
 await page.goto('http://127.0.0.1:8765/#/'+code+query);await page.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 if(query.includes('appPlatform'))check(await page.evaluate(()=>filterState.appPlatform==='Android'),'Platform filter not applied');
 const facts=await page.evaluate(()=>{const ids=location.hash.startsWith('#/B')?[27,30]:[5,52];return ids.map(id=>{const card=document.querySelector(`[id$="metric-${id}"]`);const chart=[...card.querySelectorAll('.topic-bar-row')].map(r=>({name:r.querySelector('.topic-bar-label').textContent.replace(/[●○]/g,''),n:+r.dataset.value}));const tables=[...card.querySelectorAll('.topic-mini-table tbody tr')].map(r=>({name:r.querySelector('th').textContent,n:Number(r.querySelector('td').textContent.replace(/[^0-9]/g,''))}));const matrix=[...card.querySelectorAll('.topic-source-matrix')].map(r=>r.textContent);return {id,chart,tables,matrix};});});
 for(const f of facts){check(f.chart.length===f.tables.length&&f.chart.length>0,'Missing chart '+f.id);for(const r of f.chart)check(f.tables.some(t=>t.name===r.name&&t.n===r.n),'Chart/table mismatch '+f.id+' '+r.name);if(f.id===30)check(new Set(f.matrix).size===7&&!f.matrix.includes('○○○'),'Exclusive source matrix');}
 check(!await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('echarts'))),'Loads chart library');results.push({code,query,metrics:facts.map(f=>({id:f.id,rows:f.chart.length}))});
 }
 for(const width of [1366,1600,1920])for(const zoom of [1,2])for(const code of ['B','D']){await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:8765/#/'+code);await page.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await page.evaluate(z=>document.documentElement.style.fontSize=z*100+'%',zoom);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');
 for(const id of code==='B'?[27,30]:[5,52]){const card=page.locator(`[id$="metric-${id}"]`);const collision=await card.evaluate(c=>[...c.querySelectorAll('.topic-bar-row')].some(r=>r.querySelector('.topic-bar-label').getBoundingClientRect().right>r.querySelector('.topic-bar-value').getBoundingClientRect().left+.5));check(!collision,'Labels collide '+id+'/'+width+'/'+zoom);if(width===1600&&zoom===1)await card.screenshot({path:`output/playwright/v205-composition/${id}.png`});}
 }
 check(!errors.length,errors.join(';'));return {status:'PASS',results,errors};}finally{await context.close();}
}
