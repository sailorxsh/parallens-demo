// Size comparisons use the filtered owner population and the same top-to-bottom graph/table order.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),engine=browser.browserType().name(),c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage(),states=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));const check=(ok,m)=>{if(!ok)throw Error(m);};
 const source=await(await parent.request.get(`${base}data/model-market.json`)).json();
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(query='')=>{await p.goto(`${base}#/E?metric=39&panel=groups${query?'&'+query:''}`);await ready();};
 const typography=async plot=>{const state=await plot.evaluate(n=>{const b=n.getBoundingClientRect(),min=12*parseFloat(getComputedStyle(document.documentElement).fontSize)/16,texts=[...n.querySelectorAll('svg text')].filter(t=>t.textContent&&t.getBoundingClientRect().width);return {count:texts.length,small:texts.filter(t=>parseFloat(getComputedStyle(t).fontSize)<min-.1).map(t=>t.textContent),clipped:texts.filter(t=>{const r=t.getBoundingClientRect();return r.left<b.left-2||r.right>b.right+2||r.top<b.top-2||r.bottom>b.bottom+2;}).map(t=>t.textContent)};});check(state.count>0&&!state.small.length&&!state.clipped.length,`Model matrix typography: ${JSON.stringify(state)}`);};
 const chart=()=>p.locator('#E-panel-groups > .workspace-chart-panel[data-evidence-metric="39"] .detail-chart'),stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const expected=(data,query)=>{const q=new URLSearchParams(query),grouped=new Map();for(const r of data.records){if(['country','productLine'].some(k=>q.has(k)&&r[k]!==q.get(k))||q.has('deviceModel')&&r.model!==q.get('deviceModel'))continue;const g=grouped.get(r.model)??{model:r.model,owners:0,active:0,subscribed:0};g.owners+=r.owners;g.active+=r.activeOwners;g.subscribed+=r.subscribedOwners;grouped.set(r.model,g);}return [...grouped.values()].sort((a,b)=>b.owners-a.owners||(a.model<b.model?-1:a.model>b.model?1:0));};
 const inspect=async(data,query)=>{
  const want=expected(data,query);await chart().locator('svg').waitFor();
  const graph=await chart().evaluate(n=>{const instance=echarts.getInstanceByDom(n),o=instance.getOption();return{labels:o.yAxis[0].data,inverse:o.yAxis[0].inverse,positions:o.yAxis[0].data.map((_,i)=>instance.convertToPixel({yAxisIndex:0},i)),cells:o.series[0].data.map(x=>x.value),tips:o.series[0].data.map(x=>o.tooltip[0].formatter({value:x.value})),min:o.visualMap[0].min,max:o.visualMap[0].max,text:n.textContent};});
  await typography(chart());
  check(JSON.stringify(graph.labels)===JSON.stringify(want.map(r=>r.model)),'Heatmap follows source/percentage order instead of filtered size');check(graph.inverse&&graph.positions.every((v,i,a)=>!i||v>a[i-1]),'Physical row order runs bottom to top');check(graph.min===0&&graph.max===100,'Sorting changes the fixed percentage color scale');
  for(const [y,r]of want.entries()){
   check(graph.text.includes(r.owners.toLocaleString('zh-CN')+'人'),`Visible row label omits ${r.model}/${r.owners}: ${graph.text}`);
   for(const [x,n]of[[0,r.active],[1,r.subscribed]]){const index=graph.cells.findIndex(v=>v[0]===x&&v[1]===y),cell=graph.cells[index],tip=graph.tips[index];check(Math.abs(cell[2]-n/r.owners*100)<1e-9&&tip.includes(r.model)&&tip.includes(n.toLocaleString('zh-CN'))&&tip.includes(r.owners.toLocaleString('zh-CN')),'Sorting separates a label from its cell/count/tooltip');}
  }
  await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();const rows=await p.locator('.model-calculation tbody tr').evaluateAll(ns=>ns.map(n=>[...n.children].map(c=>c.textContent)));
  check(JSON.stringify(rows.map(r=>r[0]))===JSON.stringify(want.map(r=>r.model)),'Full table disagrees with physical heatmap order');for(const [i,r]of want.entries())check(JSON.stringify(rows[i])===JSON.stringify([r.model,r.owners.toLocaleString('zh-CN'),r.active.toLocaleString('zh-CN'),(r.active/r.owners*100).toFixed(1)+'%',r.subscribed.toLocaleString('zh-CN'),(r.subscribed/r.owners*100).toFixed(1)+'%']),'Sorting alters full source counts');
  check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Size labels overflow the page');await p.getByRole('tab',{name:'分组证据',exact:true}).click();await ready();return {models:want.map(r=>[r.model,r.owners]),graph};
 };
 try{
  const queries=['','country=US','country=UK','country=DE','country=Other','productLine=Bird','productLine=Hunting','country=US&deviceModel=Bird%20Pro'];
  for(const [width,size]of[[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});for(const query of queries){await open(query);await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await ready();const result=await inspect(source,query);states.push({width,size,query,models:result.models});
    if(!query&&(width===1600||size===32)){await p.locator('#metric-evidence-39').scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/v155-audit/${engine}-size-order-${size}.png`,scale:'css'});}
   }
  }
  await p.setViewportSize({width:1600,height:1000});await p.evaluate(()=>document.documentElement.style.fontSize='16px');
  // Supplementary matrix uses the same rows and keeps every label at enlarged text.
  for(const size of [16,24,32]){await open();await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);const summary=p.locator('.workspace-context > summary').filter({hasText:'其他付费结构与型号对照'});if(!await summary.evaluate(n=>n.parentElement.open))await summary.click();await ready();const plots=p.locator('#E-panel-groups .detail-chart');let heatmaps=0;for(const plot of await plots.all()){if(!await plot.isVisible())continue;await plot.scrollIntoViewIfNeeded();await ready();if(await plot.evaluate(n=>echarts.getInstanceByDom(n)?.getOption().series[0].type==='heatmap')){heatmaps++;await typography(plot);const text=await plot.textContent();for(const r of expected(source,''))check(text.includes(r.model)&&text.includes(r.owners.toLocaleString('zh-CN')+'人'),'Supplementary matrix hides a model/denominator');}}check(heatmaps===2,`Main and supplementary matrices checked: ${heatmaps} at ${size}px`);}
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');
  // Real cell clicks open the exact matching calculation row, not the former row position.
  for(const query of['','country=US']){
   await open(query);const want=expected(source,query);for(let y=0;y<want.length;y++)for(const x of[0,1]){
    await chart().scrollIntoViewIfNeeded();const pixel=await chart().evaluate((n,point)=>echarts.getInstanceByDom(n).convertToPixel({seriesIndex:0},point),[x,y]),bounds=await chart().boundingBox();await p.mouse.click(bounds.x+pixel[0],bounds.y+pixel[1]);
    const details=chart().locator('..').locator('.chart-data');await details.locator('.chart-selected').waitFor();
    const cells=await details.locator('.chart-selected').locator('th,td').allTextContents();check(cells[0]===want[y].model&&cells[1]===want[y].owners.toLocaleString('zh-CN'),`Clicked ${query}/${y}/${x}: expected ${want[y].model}/${want[y].owners}, got ${JSON.stringify(cells)} at ${JSON.stringify(pixel)} in ${JSON.stringify(bounds)}`);
    check(await p.evaluate(()=>Object.keys(filterState).join(','))===(query?'country':''),'Cell click changes global filters');
   }
  }
  // Source ordering is presentation-neutral; current count changes still reorder the comparison.
  for(const kind of['reversed','swapped-sizes','tied-sizes']){
   const data=structuredClone(source);
   if(kind==='swapped-sizes')for(const country of['US','UK','DE','Other']){const a=data.records.find(r=>r.country===country&&r.model==='K6'),b=data.records.find(r=>r.country===country&&r.model==='Bird Lite');for(const k of['owners','activeOwners','subscribedOwners'])[a[k],b[k]]=[b[k],a[k]];}
   if(kind==='tied-sizes')for(const r of data.records){r.owners={US:10725,UK:2970,DE:1650,Other:1155}[r.country];r.activeOwners=Math.floor(r.owners*.6);r.subscribedOwners=Math.floor(r.owners*.1);}
   data.records.reverse();await p.route('**/data/model-market.json',r=>r.fulfill({json:data}));await p.reload();await ready();await open('');const result=await inspect(data,'');states.push({kind,models:result.models});await p.unroute('**/data/model-market.json');
  }
  await p.reload();await ready();await open('country=US');await p.locator('#metric-evidence-39 .issue-register').click();await ready();const form=p.locator('.action-record');await form.locator('[name=owner]').fill('排序回归演示');await form.getByRole('button',{name:'保存本地记录',exact:true}).click();const bytes=await stored(),baseline=await form.locator('> .table-note').innerText();await form.locator('[name=note]').fill('顺序变化不覆盖原草稿');
  await p.getByRole('tab',{name:'完整数据',exact:true}).click();await p.getByRole('tab',{name:'分组证据',exact:true}).click();await ready();await inspect(source,'country=US');check(await stored()===bytes&&await form.locator('[name=note]').inputValue()==='顺序变化不覆盖原草稿'&&await form.locator('> .table-note').innerText()===baseline,'Reading reordered comparisons changes saved evidence or draft');
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['32 scoped desktop and 200% text layouts','owner counts from raw source','same physical top-to-bottom chart/table order','main/supplementary SVG labels contained at 100/150/200% text','visible population sizes and fixed 0–100% scale','16 real heatmap cell clicks preserve identity','source reorder and count/tie scenarios','saved record/baseline/draft unchanged'],errors};
 }finally{await c.close();}
}
