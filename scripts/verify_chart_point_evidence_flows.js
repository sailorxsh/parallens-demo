// Real pointer clicks must reveal the matching row without changing business scope.
async(parent)=>{
 const base=new URL('.',parent.url()).href,c=await parent.context().browser().newContext({viewport:{width:1366,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),results=[],errors=[];
 const catalog=JSON.parse(fs.readFileSync('data/metric-catalog.json','utf8'));
 const records=JSON.parse(fs.readFileSync('data/model-market.json','utf8')).records;
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 p.on('pageerror',e=>errors.push(e.message));
 const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
 const open=async(page,id,query='')=>{
  await p.goto(`${base}#/${page}?metric=${id}${query?'&'+query:''}`);
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');await settle();
 };
 const clickPoint=async(plot,dimension)=>{
  await plot.scrollIntoViewIfNeeded();await settle();
  const point=await plot.evaluate((n,dimension)=>{
   const e=echarts.getInstanceByDom(n),o=e.getOption(),r=n.getBoundingClientRect();
   const finite=v=>Array.isArray(v)?v.slice(0,2).every(Number.isFinite):Number.isFinite(v);
   const usable=s=>!s.silent&&s.data.some(d=>finite(d&&typeof d==='object'&&!Array.isArray(d)?d.value:d));
   const scatter=o.series.findIndex(s=>s.type==='scatter'&&usable(s));
   const seriesIndex=scatter>=0?scatter:o.series.findIndex(usable);
   if(seriesIndex<0)return null;
   const series=o.series[seriesIndex],type=series.type;
   const values=series.data.map(d=>d&&typeof d==='object'&&!Array.isArray(d)?d.value:d);
   let index=values.findIndex(v=>finite(v)&&(type!=='bar'||v!==0));
   if(index<0)return null;
   let coordinate;
   if(type==='heatmap') {index=0;coordinate=[dimension??1,0];}
   else if(Array.isArray(values[index]))coordinate=values[index].slice(0,2);
   else coordinate=o.yAxis[0].type==='category'?[values[index]/2,index]:[index,type==='bar'?values[index]/2:values[index]];
   const [x,y]=e.convertToPixel({seriesIndex},coordinate);
   return {x:r.left+x,y:r.top+y,index,type};
  },dimension);
  check(point&&Number.isFinite(point.x)&&Number.isFinite(point.y),`No finite native chart point in ${await plot.getAttribute('aria-label')}`);
  await p.mouse.click(point.x,point.y);await settle();return point;
 };
 try{
  const rows=Array.isArray(catalog)?catalog:catalog.metrics??catalog.records;
  check(rows.filter(r=>r.id!==1).length===53,'The source catalog is incomplete');
  for(const item of rows.filter(r=>r.id!==1)){
   await open(item.page,item.id);
   for(const view of ['change','groups','data']){
   await p.locator(`#${item.page}-tab-${view}`).click();await settle();
   const plots=p.locator('.income-panel:not([hidden]) [data-evidence-metric="'+item.id+'"] .detail-chart');
   for(const plot of await plots.all()){
   if(!await plot.isVisible())continue;
   await plot.locator('svg').waitFor();
   const panel=plot.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," evidence-pair ") or contains(concat(" ",normalize-space(@class)," ")," detail-chart-panel ")][1]');
   const details=panel.locator(':scope > .chart-data,:scope > .workspace-calculation');
   check(await details.count()===1,`#${item.id} has no adjacent data disclosure`);
   check(!await details.evaluate(n=>n.open),`#${item.id} expands data before selection`);
   const before=p.url(),point=await clickPoint(plot);
   check(await details.evaluate(n=>n.open),`#${item.id} ${point.type} pointer click does not open its table`);
   const selected=details.locator('tbody tr.chart-selected');
   check(await selected.count()===1,`#${item.id} has no unique selected row`);
   check(await selected.evaluate(n=>[...n.parentElement.children].indexOf(n))===point.index,`#${item.id} highlights a different row`);
   check((await panel.locator('.chart-selection').innerText()).includes('全局筛选保持不变')&&p.url()===before,`#${item.id} selection changes scope or lacks feedback`);
   results.push({metric:item.id,page:item.page,view,type:point.type,row:point.index});
   }
   }
  }
  for(const [width,height] of [[1366,768],[1920,1080]]){
   await p.setViewportSize({width,height});
   for(const query of ['', 'country=US','productLine=Hunting','country=UK&productLine=Bird&deviceModel=K6']){
    await open('E',39,query);
    const panel=p.locator('.workspace-chart-panel[data-evidence-metric="39"]').first(),plot=panel.locator('.detail-chart');
    await plot.locator('svg').waitFor();
    const details=panel.locator('.chart-data');
    const params=new URLSearchParams(query),source=records.filter(r=>(!params.get('country')||r.country===params.get('country'))&&(!params.get('productLine')||r.productLine===params.get('productLine'))&&(!params.get('deviceModel')||r.model===params.get('deviceModel')));
    for(const dimension of [0,1]){
     const before=p.url();await clickPoint(plot,dimension);
     const row=await details.locator('tr.chart-selected').locator('th,td').allTextContents(),model=row[0],subset=source.filter(r=>r.model===model);
     const [owners,active,subscribed]=['owners','activeOwners','subscribedOwners'].map(k=>subset.reduce((sum,r)=>sum+r[k],0));
     const parse=text=>Number(text.replaceAll(',',''));
     check(parse(row[1])===owners&&parse(row[2])===active&&parse(row[3])===subscribed,`Heatmap ${query} counts do not match source records`);
     check(row[4]===`${(active/owners*100).toFixed(1)}%`&&row[5]===`${(subscribed/owners*100).toFixed(1)}%`,'Heatmap selected row rates disagree');
     check((await panel.locator('.chart-selection').innerText()).includes(dimension===0?'30天活跃率':'主账号订阅率')&&p.url()===before,'Heatmap loses the selected dimension or scope');
     check((await details.locator('thead th').allTextContents()).slice(1,4).every(t=>t.includes('（人）')),'Heatmap counts lack units');
     check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Chart selection overflows the page');
     results.push({metric:39,width,query,dimension,model,owners,active,subscribed});
    }
    // The same exact evidence is available without a pointer or SVG keyboard support.
    await details.locator('summary').evaluate(n=>n.focus({preventScroll:true}));await p.keyboard.press('Enter');
    check(!await details.evaluate(n=>n.open),'Keyboard cannot collapse the point evidence');
    await p.keyboard.press('Enter');check(await details.evaluate(n=>n.open),'Keyboard cannot reopen the point evidence');
   }
  }
  check(errors.length===0,errors.join('; '));
  check(['bar','boxplot','heatmap','line','scatter'].every(type=>results.some(row=>row.type===type)),'A required rendered chart family was not exercised');
  return {status:'PASS',visitedMetrics:53,checks:['actual pointer clicks for all available selected metric charts','correct row and scope','source model counts and rates','both heatmap dimensions','two desktop widths','keyboard disclosure','no runtime errors'],results};
 }finally{await c.close();}
}
