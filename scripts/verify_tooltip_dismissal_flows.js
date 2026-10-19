// Actual pointer/keyboard checks: read hover content, dismiss it, preserve evidence.
async parent=>{
 const browser=parent.context().browser(),base=new URL('.',parent.url()).href,c=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],results=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);};
 const tip=()=>p.locator('.chart-tooltip').filter({visible:true}).last();
 const open=async route=>{await p.goto(base+'#/'+route);await ready();};
 async function hover(box){await box.scrollIntoViewIfNeeded();const point=await box.evaluate(n=>{const instance=echarts.getInstanceByDom(n),o=instance.getOption(),r=n.getBoundingClientRect();const s=o.series.find(s=>s.type==='line'||s.type==='bar'||s.type==='heatmap');if(!s)throw Error('Unsupported test chart');let coord;if(s.type==='heatmap')coord=s.data.map(d=>Array.isArray(d)?d:d.value).find(d=>Number.isFinite(d?.[2])).slice(0,2);else{const i=Math.floor(s.data.length/2),raw=s.data[i],value=raw&&typeof raw==='object'?raw.value:raw;coord=s.type==='bar'&&o.xAxis[0].type==='value'?[value/2,i]:[i,value];}const point=instance.convertToPixel({gridIndex:0},coord);return {x:r.x+point[0],y:r.y+point[1]};});await p.mouse.move(185,50);await p.mouse.move(point.x,point.y);await p.waitForFunction(()=>[...document.querySelectorAll('.chart-tooltip')].some(n=>getComputedStyle(n).visibility==='visible'&&Number(getComputedStyle(n).opacity)>.9));return point;}
 async function evidence(){return p.evaluate(()=>({hash:location.hash,stored:localStorage.getItem(ACTION_STORAGE_KEY),focus:document.activeElement.id||document.activeElement.name||document.activeElement.tagName,top:scrollY,tables:[...document.querySelectorAll('#main table')].map(t=>t.innerText),charts:[chart,statusChart,...sparklines,...detailCharts].filter(i=>i&&!i.isDisposed()).map(i=>{const o=i.getOption();return {series:o.series.map(s=>({name:s.name,data:s.data})),selected:o.legend?.[0]?.selected,tooltip:(o.tooltip??[]).map(t=>({enterable:t.enterable,hideDelay:t.hideDelay})),axes:[o.xAxis?.map(a=>({data:a.data,min:a.min,max:a.max})),o.yAxis?.map(a=>({min:a.min,max:a.max,interval:a.interval}))]};}),draft:document.querySelector('.action-record [name=note]')?.value,baseline:document.querySelector('.action-record > .table-note')?.innerText}));}
 try{
  const cases=[['','#trendChart'],['','#statusChart'],['','.node-sparkline'],['A?metric=13','#A-panel-change .detail-chart'],['B?metric=25','#B-panel-change .detail-chart'],['C?metric=42','#C-panel-change .detail-chart'],['C?metric=43','.device-retention-heatmap'],['D?metric=18&issue=18','#D-panel-change .detail-chart'],['E?metric=35','#E-panel-change .detail-chart'],['F?metric=48','#F-panel-change .detail-chart'],['G?metric=54','#G-panel-change .detail-chart']];
  for(const[route,selector]of cases){
   await open(route);if(route.startsWith('D'))await p.locator('.action-record [name=note]').fill('关闭提示时保留原问题草稿');
   const box=p.locator(selector).first(),point=await hover(box),text=await tip().innerText();check(text.trim(),'Empty hover content');
   const bounds=await tip().boundingBox();await p.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await p.waitForTimeout(200);
   check(await tip().innerText()===text,'Moving onto hover content changes or hides its evidence: '+route);
   const before=await evidence();await p.keyboard.press('Escape');await p.waitForFunction(()=>[...document.querySelectorAll('.chart-tooltip')].every(n=>!n.textContent.trim()||getComputedStyle(n).visibility==='hidden'||Number(getComputedStyle(n).opacity)===0));
   check(JSON.stringify(await evidence())===JSON.stringify(before),'Escape changes evidence, scope, focus or draft: '+route);
   // Without any pointer movement, the dismissed content must stay dismissed.
   await p.waitForTimeout(250);check(await tip().count()===0,'Dismissed content reopens under a stationary pointer');
   await p.mouse.move(185,50);await p.mouse.move(point.x,point.y);await p.waitForFunction(()=>[...document.querySelectorAll('.chart-tooltip')].some(n=>getComputedStyle(n).visibility==='visible'&&Number(getComputedStyle(n).opacity)>.9));
   check(await tip().innerText()===text,'Pointer cannot reopen the same evidence after dismissal: '+route+' '+selector+' '+JSON.stringify({before:text,after:await tip().innerText()}));await p.keyboard.press('Escape');await p.waitForFunction(()=>[...document.querySelectorAll('.chart-tooltip')].every(n=>!n.textContent.trim()||getComputedStyle(n).visibility==='hidden'||Number(getComputedStyle(n).opacity)===0));results.push({route,hoverable:true,dismissible:true,preserved:true});
  }
  for(const[width,font]of[[1366,16],[1920,16],[1366,32]]){await p.setViewportSize({width,height:1000});await open('C?metric=42');await p.evaluate(s=>document.documentElement.style.fontSize=s+'px',font);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await hover(p.locator('#C-panel-change .detail-chart').first());await p.keyboard.press('Escape');await p.waitForFunction(()=>[...document.querySelectorAll('.chart-tooltip')].every(n=>!n.textContent.trim()||getComputedStyle(n).visibility==='hidden'||Number(getComputedStyle(n).opacity)===0));check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Enlarged tooltip repair causes overflow');results.push({width,font});}
  await p.evaluate(()=>document.documentElement.style.fontSize='');await open('C?metric=42');
  const motionBox=p.locator('#C-panel-change .detail-chart').first();await hover(motionBox);const motionBaseline=await evidence(),motionResults=[];
  for(const preference of ['reduce','no-preference','reduce']) {
   await p.emulateMedia({reducedMotion:preference});
   await p.waitForFunction(reduced=>{const n=document.querySelector('#C-panel-change .detail-chart');return echarts.getInstanceByDom(n).getOption().tooltip[0].transitionDuration===(reduced?0:.4);},preference==='reduce');
   await hover(motionBox);await p.waitForTimeout(450);
   const target=await motionBox.evaluate(n=>{const i=echarts.getInstanceByDom(n),r=n.getBoundingClientRect(),xy=i.convertToPixel({gridIndex:0},[10,82]);return{x:r.x+xy[0],y:r.y+xy[1]};});
   await p.mouse.move(target.x,target.y);await p.waitForTimeout(80);
   const motion=await tip().evaluate(n=>({transition:getComputedStyle(n).transitionDuration,active:n.getAnimations().filter(a=>a.playState==='running'&&a.transitionProperty==='transform').map(a=>a.effect.getTiming().duration)}));
   check(preference==='reduce'?motion.transition==='0s'&&!motion.active.length:motion.transition.split(',').some(value=>parseFloat(value)===.4),'Tooltip ignores the current motion preference: '+JSON.stringify({preference,...motion}));
   await p.keyboard.press('Escape');await p.waitForFunction(()=>[...document.querySelectorAll('.chart-tooltip')].every(n=>!n.textContent.trim()||getComputedStyle(n).visibility==='hidden'||Number(getComputedStyle(n).opacity)===0));
   motionResults.push({preference,...motion});
  }
  check(JSON.stringify(await evidence())===JSON.stringify(motionBaseline),'Motion preference changes source evidence, focus or scope');
  results.push({motionResults});
  await p.locator('.workspace-metric-heading .definition-trigger').click();await p.keyboard.press('Escape');check(!await p.locator('#metric-definition-popover').isVisible(),'Definition Escape precedence broken');
  await p.locator('#open-metric-search').click();await p.keyboard.press('Escape');check(!await p.locator('#metric-search').isVisible(),'Search Escape precedence broken');
  await p.locator('#open-saved-issues').click();await p.keyboard.press('Escape');check(!await p.locator('#saved-issues').isVisible(),'Saved issues Escape precedence broken');
  await p.route('**/vendor/echarts.min.js*',r=>r.abort());await p.goto('about:blank');await open('');await p.keyboard.press('Escape');check(await p.locator('.home-results').count()===1,'Escape requires an available chart library');
  check(!errors.length,errors.join(';'));return{status:'PASS',engine:browser.browserType().name(),results,checks:['pointer enters hover content without changing it','Escape dismisses without pointer motion','same pointer target reopens after dismissal','source values, tables, scope, stored records, draft, baseline, focus and scroll preserved','existing Escape dialog precedence','three desktop widths and 200% text','chart library unavailable']};
 }finally{await c.close();}
}
