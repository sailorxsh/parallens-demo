// Secondary evidence must use the same validated source as its own metric, even while another metric is selected.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name(),c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),states=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const model=await(await parent.request.get(`${base}data/model-market.json`)).json(),diagnostics=await(await parent.request.get(`${base}data/diagnostics.json`)).json();
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(query='metric=35&panel=groups')=>{await p.goto(`${base}#/E?${query}`);await ready();};
 const stored=()=>p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY)),form=()=>p.locator('.action-record');
 const group=()=>p.locator('#E-panel-groups > .workspace-context').filter({has:p.locator('summary',{hasText:'其他付费结构与型号对照'})});
 const reveal=async locator=>{if(!await locator.evaluate(n=>n.open)){await locator.locator(':scope > summary').focus();await p.keyboard.press('Enter');}await ready();};
 const countTable=()=>p.locator('#E-panel-data table').filter({has:p.locator('caption',{hasText:/^设备型号订阅表现/})});
 const expected=data=>{const rows=new Map();for(const r of data.records){const row=rows.get(r.model)??{name:r.model,n:0,a:0,s:0};row.n+=r.owners;row.a+=r.activeOwners;row.s+=r.subscribedOwners;rows.set(r.model,row);}return [...rows.values()].sort((a,b)=>b.n-a.n||(a.name<b.name?-1:a.name>b.name?1:0)).map(r=>[r.name,r.n.toLocaleString('zh-CN'),r.a.toLocaleString('zh-CN'),(r.a/r.n*100).toFixed(1)+'%',r.s.toLocaleString('zh-CN'),(r.s/r.n*100).toFixed(1)+'%']);};
 const inspect=async({badModel=false,badStructure=false,data=model,label='valid',saved,noLibrary=false})=>{
  check(await p.evaluate(()=>metric(35).kind==='group'&&metric(35).value.ARPPU===5.2),'Bad secondary source disables reliable monthly income');
  check(await p.evaluate(()=>Number(document.querySelector('.metric-evidence').id.replace('metric-evidence-','')))===35,'Source guard changes the current metric');
  await p.locator('#E-tab-groups').click();await ready();await reveal(group());
  if(badModel){
   check(await p.evaluate(()=>metric(39).kind==='na'),'Corrupt model source remains measured');
   check(await group().locator('.model-context-unavailable').count()===1&&(await group().locator('.model-context-unavailable').innerText()).includes('型号表现暂不可用'),'Unavailable model lacks an explicit explanation');
   check(await group().locator('.detail-chart[aria-label^="设备型号表现矩阵"],.detail-chart[aria-label^="设备型号订阅率排序"]').count()===0,'Supplementary chart falls back to the independent old model percentages');
  }else{
   const matrix=group().locator('.detail-chart[aria-label^="设备型号表现矩阵"]');await matrix.scrollIntoViewIfNeeded();if(noLibrary)check(await matrix.locator('.chart-fallback-message').count()>0||await matrix.evaluate(n=>n.classList.contains('chart-fallback')),'No-library matrix has no honest fallback');else {await matrix.locator('svg').waitFor();
   const chart=await matrix.evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {labels:o.yAxis[0].data,cells:o.series[0].data.map(x=>x.value)};});
   const rows=expected(data);check(JSON.stringify(chart.labels)===JSON.stringify(rows.map(r=>r[0])),'Reliable supplementary model loses its source order');
   rows.forEach((r,y)=>{for(const [x,i]of[[0,3],[1,5]])check(Math.abs(chart.cells.find(v=>v[0]===x&&v[1]===y)[2]-parseFloat(r[i]))<.051,'Supplementary matrix does not follow source count changes');});}
  }
  if(badStructure){
   check(await p.evaluate(()=>metric(38).availability==='pending')&&await group().locator('.structure-context-unavailable').count()===1,'Invalid structure has no pending state in the other-metric context');
   check(await group().locator('.structure-explorer').count()===0,'Unvalidated structure still has a chart, table or actionable tab');
  }else{
   check(await p.evaluate(()=>metric(38).kind==='group'),'Model fault disables independent reliable structure');
   const structure=group().locator('.structure-explorer');await structure.scrollIntoViewIfNeeded();await structure.locator('table').waitFor();
   const first=await structure.locator('tbody tr').first().innerText();check(first.includes('83,590')&&first.includes('65.0%'),'Independent valid structure changes with an unrelated model fault');
  }
  await p.locator('#E-tab-data').click();await ready();const details=p.locator('#E-panel-data > .workspace-context').filter({has:p.locator('summary',{hasText:'查看付费专题其他完整数据'})});await reveal(details);
  const table=countTable(),columns=await table.locator('thead th').allTextContents(),rows=await table.locator('tbody tr').evaluateAll(ns=>ns.map(n=>[...n.children].map(c=>c.textContent)));
  if(badModel){check(columns.join('|')==='状态'&&rows.length===1&&rows[0][0].includes(await p.evaluate(()=>metric(39).reason))&&!rows[0][0].includes('%'),'Supplementary full table retains old source counts or rates');}
  else check(JSON.stringify(rows)===JSON.stringify(expected(data))&&columns.join('|')==='型号|主账号（人）|活跃（人）|活跃率|订阅（人）|订阅率','Supplementary full model table is detached from current validated counts');
  check(!(await table.locator('caption').innerText()).includes('可跨型号'),'Primary-model attribution is labeled as overlapping owners');
  if(saved)check(await stored()===saved,'Inspecting secondary source writes registered issue baselines');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Context source message overflows the desktop');states.push({label,badModel,badStructure,columns});
 };
 const setSource=async(name,data)=>{await c.route(`**/data/${name}.json`,r=>r.fulfill({json:data}));await p.reload();await ready();};
 try{
  await open('metric=39&panel=groups');await p.locator('#metric-evidence-39 .issue-register').click();await form().locator('[name=owner]').fill('型号原基线核查');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  await open('metric=35&panel=groups');await p.locator('#metric-evidence-35 .issue-register').click();await form().locator('[name=owner]').fill('付费上下文核查');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const saved=await stored();
  const cases=[
   ['missing-active','model-market',d=>delete d.records[0].activeOwners,true,false],
   ['negative-count','model-market',d=>d.records[0].subscribedOwners=-1,true,false],
   ['over-denominator','model-market',d=>d.records[0].activeOwners=d.records[0].owners+1,true,false],
   ['missing-records','model-market',d=>delete d.records,true,false],
   ['nonarray-records','model-market',d=>d.records={},true,false],
   ['null-row','model-market',d=>d.records.push(null),true,false],
   ['duplicate-grain','model-market',d=>d.records.push({...d.records[0]}),true,false],
   ['unknown-country','model-market',d=>d.records[0].country='Unknown',true,false],
   ['unknown-model','model-market',d=>d.records[0].model='Unknown',true,false],
   ['wrong-product','model-market',d=>d.records[0].productLine='Hunting',true,false],
   ['empty-observed-pool','model-market',d=>d.records=[],true,false],
   ['structure-count','diagnostics',d=>d.E.structureViews[0].rows[0][1]++,false,true],
   ['structure-denominator','diagnostics',d=>d.E.structureViews[1].denominator--,false,true],
   ['structure-unit','diagnostics',d=>d.E.structureViews[2].unit='人',false,true],
   ['structure-duplicate','diagnostics',d=>d.E.structureViews[0].rows[1][0]='美国',false,true],
   ['missing-structure','diagnostics',d=>delete d.E.structureViews,false,true],
   ['missing-structure-view','diagnostics',d=>d.E.structureViews.pop(),false,true],
  ];
  await inspect({saved});
  for(const [label,name,fault,badModel,badStructure]of cases){const data=structuredClone(name==='model-market'?model:diagnostics);fault(data);await setSource(name,data);await inspect({label,badModel,badStructure,saved});await c.unroute(`**/data/${name}.json`);}
  const changed=structuredClone(model),a=changed.records.find(r=>r.country==='US'&&r.model==='K6'),b=changed.records.find(r=>r.country==='US'&&r.model==='Bird Lite');for(const [key,n]of[['owners',10],['activeOwners',3],['subscribedOwners',2]]){a[key]+=n;b[key]-=n;}await setSource('model-market',changed);await inspect({label:'changed-valid-counts',data:changed,saved});await c.unroute('**/data/model-market.json');
  for(const [width,font]of[[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});await p.evaluate(font=>document.documentElement.style.fontSize=font+'px',font);const m=structuredClone(model),d=structuredClone(diagnostics);delete m.records[0].activeOwners;d.E.structureViews[0].rows[0][1]++;await c.route('**/data/model-market.json',r=>r.fulfill({json:m}));await c.route('**/data/diagnostics.json',r=>r.fulfill({json:d}));await p.reload();await ready();await p.evaluate(font=>document.documentElement.style.fontSize=font+'px',font);await ready();await inspect({label:`both-${width}-${font}`,badModel:true,badStructure:true,saved});await p.locator('#E-tab-groups').click();await reveal(group());await group().scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/v156-audit/${engine}-source-guards-${width}-${font}.png`});
   await form().locator('[name=note]').fill('查看补充证据不会覆盖的未保存草稿');const baseline=await form().locator('> .table-note').innerText();await p.locator('#E-tab-data').click();await ready();await p.locator('#E-tab-groups').click();await ready();check(await form().locator('[name=note]').inputValue()==='查看补充证据不会覆盖的未保存草稿'&&await form().locator('> .table-note').innerText()===baseline&&await stored()===saved,'Source guards overwrite the active draft or old record');await c.unroute('**/data/model-market.json');await c.unroute('**/data/diagnostics.json');
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});await p.reload();await ready();await inspect({label:'sources-restored',saved});
  await p.setViewportSize({width:1366,height:1000});await p.evaluate(()=>document.documentElement.style.fontSize='32px');await p.locator('#E-tab-groups').click();await p.locator('#E-tab-data').click();await ready();
  const wide=countTable().locator('..');await wide.scrollIntoViewIfNeeded();check(await wide.locator('.table-scroll-hint').isVisible(),'Enlarged supplementary table has no discoverable horizontal scroll');await wide.focus();for(let i=0;i<5;i++)await p.keyboard.press('ArrowRight');await ready();const reach=await wide.evaluate(n=>{const b=n.getBoundingClientRect(),row=n.querySelector('tbody tr'),h=row.querySelector('th').getBoundingClientRect(),v=row.lastElementChild.getBoundingClientRect();return {scroll:n.scrollLeft,last:row.lastElementChild.textContent,visible:v.right<=b.right+1&&v.left>=h.right-1,pinnedAtEdge:h.left<=b.left+2};});check(reach.scroll>0&&reach.visible&&reach.pinnedAtEdge&&reach.last==='14.0%'&&await stored()===saved,'Keyboard cannot reach the exact last model percentage without losing source scope');states.push({label:'enlarged-table-last-column',...reach});await p.screenshot({path:`output/playwright/v156-audit/${engine}-model-table-keyboard-32.png`});await open('metric=39&panel=data');await p.evaluate(()=>document.documentElement.style.fontSize='32px');await ready();const primary=p.locator('.model-calculation');await primary.scrollIntoViewIfNeeded();await primary.focus();for(let i=0;i<5;i++)await p.keyboard.press('ArrowRight');await ready();const pin=await primary.evaluate(n=>{const b=n.getBoundingClientRect(),r=n.querySelector('tbody tr'),h=r.querySelector('th').getBoundingClientRect(),last=r.lastElementChild.getBoundingClientRect();return {scroll:n.scrollLeft,pinnedAtEdge:h.left<=b.left+2,lastVisible:last.right<=b.right+1&&last.left>=h.right-1};});check(pin.scroll>0&&pin.pinnedAtEdge&&pin.lastVisible,'Primary model table exposes clipped counts outside its pinned row label');states.push({label:'primary-table-pinned-edge',...pin});await p.screenshot({path:`output/playwright/v156-audit/${engine}-primary-model-table-keyboard-32.png`});await open('metric=35&panel=groups');await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});
  // Every E metric reuses the same guarded secondary workspace, including #38/#39 themselves.
  const badM=structuredClone(model),badD=structuredClone(diagnostics);delete badM.records[0].activeOwners;badD.E.structureViews[0].rows[0][1]++;await c.route('**/data/model-market.json',r=>r.fulfill({json:badM}));await c.route('**/data/diagnostics.json',r=>r.fulfill({json:badD}));await p.reload();await ready();
  const catalog=await(await parent.request.get(`${base}data/metric-catalog.json`)).json();
  for(const item of catalog.filter(r=>r.page==='E'&&r.id!==1)){await open(`metric=${item.id}&panel=groups`);await reveal(group());check(await group().locator('.model-context-unavailable').count()===1&&await group().locator('.detail-chart[aria-label^="设备型号表现矩阵"]').count()===0,`#${item.id} retains invalid model context`);check(await group().locator('.structure-explorer').count()===0,`#${item.id} retains invalid structure context`);check(await stored()===saved,'Changing the selected E metric rewrites stored evidence');states.push({label:`metric-${item.id}-guarded`});}
  await c.unroute('**/data/model-market.json');await c.unroute('**/data/diagnostics.json');await p.reload();await ready();
  // An invalid US count does not suppress a valid UK model slice.
  const localized=structuredClone(model);delete localized.records[0].activeOwners;await setSource('model-market',localized);await open('metric=39&panel=groups&country=UK');check(await p.evaluate(()=>metric(39).kind==='group'&&metric(35).kind==='group'),'Count fault in US disables unrelated UK counts');await c.unroute('**/data/model-market.json');
  // Missing chart resources cannot remove the guarded explanations or complete table.
  await c.route('**/vendor/echarts.min.js*',r=>r.abort());await p.goto('about:blank');await open();await inspect({label:'no-library-valid',saved,noLibrary:true});
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['17 malformed or empty sources do not render old facts','current independent income remains reliable','same-source supplementary counts and changed-value case','structure errors isolated from valid model facts','model errors isolated from valid structure','duplicate grain and malformed source guarded','keyboard disclosures, reachable last table column, three desktop widths plus 200% text','saved #39/#35 baselines and active draft unchanged','valid source recovery and localized counts','library fallback'],errors};
 }finally{await c.close();}
}
