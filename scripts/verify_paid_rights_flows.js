// Current entitlement counts, rendered evidence and old issue baselines must agree.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name(),c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],results=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const metrics=await(await parent.request.get(`${base}data/metric-values.json`)).json();
 const core=await(await parent.request.get(`${base}data/route-core.json`)).json();
 const old=JSON.parse(fs.readFileSync('scripts/fixtures/paid-rights-before-source.json','utf8')).records;
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(query='metric=36')=>{await p.goto(`${base}#/E?${query}`);await ready();};
 const reveal=async d=>{if(!await d.evaluate(n=>n.open))await d.locator(':scope > summary').click();await ready();};
 const chart=()=>p.locator('#metric-evidence-36 .detail-chart[aria-label^="五类Pack"]');
 const stored=()=>p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
 const setSource=async data=>{let injectionHits=0;await c.route('**/data/route-core.json*',r=>{injectionHits++;return r.fulfill({json:{...core,sources:{...core.sources,metrics:data}}});});await p.reload();await ready();check(injectionHits>0,'Fault injection did not reach the current route source');};
 const sourceContext=()=>p.locator('#E-panel-groups > .workspace-context').filter({has:p.locator('summary',{hasText:'其他付费结构与型号对照'})});
 try{
  await open();await p.evaluate(records=>localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(records)),old);await p.reload();await ready();const saved=await stored();
  check(await p.locator('#E-tab-groups').getAttribute('aria-selected')==='true','Current Pack graph is not the default evidence');
  check(await p.evaluate(()=>metric(34).value===12550&&metric(36).value.anyPack.numerator===3150),'Current approved headline anchors changed');
  check((await p.locator('#metric-evidence-36').innerText()).includes('有效增值Pack权益快照'),'Pack current snapshot is still labeled a full month');
  await chart().scrollIntoViewIfNeeded();await chart().locator('svg').waitFor();const o=await chart().evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {labels:o.xAxis[0].data,values:o.series[0].data,max:o.yAxis[0].max,min:o.yAxis[0].min};});
  check(o.labels.length===5&&o.values.every((v,i)=>Math.abs(v-[1200,1000,800,600,450][i]/12550*100)<1e-9)&&o.min===0&&o.max<=15,'Pack bars do not use exact source counts and a readable zero-based scale');
  await p.locator('#E-tab-data').click();await ready();const full=p.locator('#E-panel-data > .pack-penetration-calculation');
  check(await full.count()===1&&await full.isVisible(),'Complete data omits the selected Pack metric');
  const rows=await full.locator('tbody tr').allTextContents();check(rows.length===6&&rows.at(-1).includes('3,150')&&[1200,1000,800,600,450].every((n,i)=>rows[i].includes(n.toLocaleString('en-US'))),'Complete Pack data loses union, product counts or denominator');
  check(rows.every(r=>r.includes('12,550')),'Complete Pack data uses another metric denominator');check(await stored()===saved,'Viewing full Pack counts changes issue records');await p.locator('#E-tab-groups').click();await ready();
  // Real pointer click opens matching numeric evidence, retaining business scope.
  const pos=await chart().evaluate(n=>{const e=echarts.getInstanceByDom(n),r=n.getBoundingClientRect(),b=e.getModel().getSeriesByIndex(0).getData().getItemLayout(2);return {x:r.left+b.x+b.width/2,y:r.top+b.y+b.height/2};});
  await p.mouse.click(pos.x,pos.y);await ready();check(await p.locator('#metric-evidence-36 .workspace-calculation').evaluate(n=>n.open),'Pack pointer does not reveal its numeric evidence');
  check(await p.locator('#metric-evidence-36 .evidence-pair .chart-selected').innerText().then(t=>t.includes('观鸟 AI Agent Pack')&&t.includes('800')),'Clicked Pack highlights a different count row');check(await stored()===saved,'Chart inspection overwrites old issue records');
  for(const [query,id]of[['productLine=Hunting',34],['productLine=Bird',36],['plan=Plus',36],['plan=Free',34]]){
   await open(`metric=${id}&${query}`);check(await p.evaluate(id=>metric(id).availability==='pending',id),'Broken plan/product source remains measured');
   check(await p.locator(`#metric-evidence-${id} .na-note`).count()===1&&await p.locator(`#metric-evidence-${id} > .section-top .issue-register`).count()===0,'Missing source can create a reliable new issue baseline');
   const field=query.split('=')[0];check(await p.locator(`select[name=${field}] option:checked`).count()===1,'Business-applicable filter was removed');results.push({label:query,id,status:'pending'});
  }
  await open('metric=36&billingCycle=monthly');check(await p.evaluate(()=>metric(34).availability==='pending'&&metric(36).value.anyPack.denominator===12550),'Ignored billing filter contaminates Pack denominator');
  // Old records retain exactly the old scope and evidence when only progress changes.
  for(const key of Object.keys(old)){
   const record=old[key];await open(`metric=${record.evidenceId}&issue=${record.evidenceId}&${new URLSearchParams(record.filters)}`);const form=p.locator('.action-record');
   await form.locator('[name=note]').fill('旧证据保留；仅更新处理进度');await form.getByRole('button',{name:'保存本地记录',exact:true}).click();await ready();
   const current=JSON.parse(await stored())[key];for(const field of ['issueId','scope','baseline','baselineAt','reviewMetric','filters'])check(JSON.stringify(current[field])===JSON.stringify(record[field]),`Old ${field} silently migrated`);
   await form.locator('[name=note]').fill('切换证据仍保留的草稿');await p.locator('#E-tab-groups').click();await p.locator('#E-tab-data').click();await ready();check(await form.locator('[name=note]').inputValue()==='切换证据仍保留的草稿','Evidence navigation loses unsaved draft');
  }
  const updated=await stored();
  // Faults in current Pack source must also remove the secondary structure and table.
  for(const [label,fault]of[['missing-pack',d=>delete d.m36.value.byPack['Device Pack']],['wrong-denominator',d=>d.m36.value.anyPack.denominator++],['invalid-union',d=>d.m36.value.anyPack.numerator=5000],['invalid-rights',d=>d.m34.value++]]){
   const d=structuredClone(metrics);fault(d);await setSource(d);await open('metric=35&panel=groups');check(await p.evaluate(()=>metric(35).value.ARPPU===5.2&&metric(36).availability==='pending'),'Pack fault damages independent monthly income');
   await reveal(sourceContext());check(await sourceContext().locator('.paid-rights-unavailable').count()===1&&await sourceContext().locator('.detail-chart[aria-label^="付费权益互斥结构"]').count()===0,'Secondary chart falls back to stale entitlement percentages');
   await p.locator('#E-tab-data').click();const tables=p.locator('#E-panel-data > .workspace-context').filter({has:p.locator('summary',{hasText:'查看付费专题其他完整数据'})});await reveal(tables);
   const rights=tables.locator('table').filter({has:p.locator('caption',{hasText:'权益与Pack持有结构'})});const head=await rights.locator('thead').textContent(),body=await rights.locator('tbody').textContent();check(head==='状态'&&!body.includes('9,400'),`Secondary table retains unvalidated old counts: ${label} ${head} ${body}`);
   check(await stored()===updated,'Invalid source inspection writes old records');results.push({label,status:'guarded'});await c.unroute('**/data/route-core.json*');
  }
  const changed=structuredClone(metrics);changed.m36.value.byPack['Extra Memory Pack'].numerator=1250;await setSource(changed);await open();await chart().scrollIntoViewIfNeeded();await chart().locator('svg').waitFor();
  check(await chart().evaluate(n=>Math.abs(echarts.getInstanceByDom(n).getOption().series[0].data[0]-1250/12550*100)<1e-9),'Chart ignores changed valid count');check((await p.locator('.detail-finding[data-metric-id="36"]').innerText()).includes('4,100'),'Observation ignores changed Pack membership sum');await c.unroute('**/data/route-core.json*');await p.reload();await ready();check(await p.evaluate(()=>packPenetrationFacts().membershipSum===4050),'Restoring source does not restore original Pack counts');
  for(const[width,font]of[[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});await open();await p.evaluate(font=>document.documentElement.style.fontSize=font+'px',font);await chart().scrollIntoViewIfNeeded();await ready();await chart().locator('svg').waitFor();
   const text=await chart().locator('svg text').evaluateAll(ns=>ns.map(n=>({text:n.textContent,b:n.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(n).fontSize)}))),bounds=await chart().boundingBox();
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Desktop viewport overflows');
   for(const name of o.labels){const label=text.find(t=>t.text===name.replace(/ Pack$/,'')||t.text===name);check(label&&label.font>=12*font/16-.1&&label.b.x>=bounds.x-1&&label.b.right<=bounds.x+bounds.width+1,`Pack label clipped or fails text enlargement: ${name} ${JSON.stringify(label)}`);}
   await p.screenshot({path:`output/playwright/v161-audit/${engine}-pack-${width}-${font}.png`});results.push({label:`layout-${width}-${font}`,status:'PASS'});
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});await c.route('**/vendor/echarts.min.js*',r=>r.abort());await open();await p.reload();await ready();await chart().scrollIntoViewIfNeeded();check(await chart().locator('.chart-fallback-message').count()>0||await chart().evaluate(n=>n.classList.contains('chart-fallback')),'Missing chart library has no truthful fallback');
  await reveal(p.locator('#metric-evidence-36 .workspace-calculation'));check((await p.locator('#metric-evidence-36 .evidence-pair table').innerText()).includes('1,200'),'No-library exact count evidence missing');
  check(await stored()===updated,'Layout/no-library checks overwrite saved issues');check(errors.length===0,errors.join('\n'));
  return {status:'PASS',engine,results,oldRecordsPreserved:Object.keys(old).length,headlineCounts:[12550,3150],membershipCounts:[4050,900],axes:o,errors};
 }finally{await c.close();}
}
