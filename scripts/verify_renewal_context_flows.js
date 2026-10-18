// Context tables follow the approved monthly renewal source, never the old weekly sample.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),engine=browser.browserType().name(),c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage(),states=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));const check=(ok,m)=>{if(!ok)throw Error(m);};
 const source=async name=>(await(await parent.request.get(`${base}data/${name}.json`)).json());
 const [facts,diagnostics,snapshot,catalog]=await Promise.all(['monthly-renewal-facts','diagnostics','snapshot','metric-catalog'].map(source));
 const original=diagnostics.D.tables.find(t=>t.title==='转化与续费环节');
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(id,month='2026-08',extra='')=>{await p.goto(`${base}#/D?metric=${id}&panel=data&renewalMonth=${month}${extra?'&'+extra:''}`);await ready();};
 const table=()=>p.getByRole('table',{name:'转化与续费环节',exact:true}),renewal=()=>table().locator('tbody tr').filter({hasText:'月度到期续订'});
 const expected=month=>{const rows=facts.months.find(m=>m.month===month).records;return rows.reduce((a,r)=>{for(const o of r.outcomeCounts){if(o.due)a.due+=o.count;if(o.renewed)a.renewed+=o.count;}return a;},{due:0,renewed:0});};
 const inspect=async(id,month)=>{
  const want=expected(month),cells=await renewal().locator('th,td').allTextContents();
  check(JSON.stringify(cells)===JSON.stringify([`月度到期续订（${month}）`,want.renewed.toLocaleString('zh-CN'),want.due.toLocaleString('zh-CN'),(want.renewed/want.due*100).toFixed(1)+'%']),`Wrong monthly context #${id} ${month}: ${JSON.stringify(cells)}`);
  const flow=table().locator('tbody tr').filter({hasText:'本期权益退出（#21）'});check(JSON.stringify(await flow.locator('th,td').allTextContents())===JSON.stringify(['本期权益退出（#21）',snapshot.subscriptionLost.toLocaleString('zh-CN'),snapshot.subscribersOpening.toLocaleString('zh-CN'),(snapshot.subscriptionLost/snapshot.subscribersOpening*100).toFixed(1)+'%']),'Current September flow was replaced by monthly loss');
  const text=await table().locator('..').innerText(),raw=facts.months.find(m=>m.month===month),end=new Date(Date.parse(raw.renewalObservationEndExclusive)-86400000).toISOString().slice(0,10);
  check(text.includes(`${month}到期人群，观察至${end}（UTC）`)&&text.includes('2026-09-01—2026-09-24')&&text.includes('不等于同月到期未续订'),'Context loses separate period/observation bounds');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Monthly labels cause page overflow');
  const current=await p.evaluate(()=>sourceData.diagnostics.D.tables.find(t=>t.title==='转化与续费环节'));
  check(JSON.stringify(current)===JSON.stringify(original),'Rendering mutates the preserved raw legacy sample');
  return {id,month,numerator:want.renewed,denominator:want.due,end};
 };
 try{
  for(const [width,size]of[[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});for(const id of[3,18,23])for(const month of['2026-07','2026-08']){
    await open(id,month);await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await ready();states.push({width,size,...await inspect(id,month)});
    if(id===23&&month==='2026-08'&&width===1600){await table().locator('..').scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/v154-audit/${engine}-renewal-context-after.png`,scale:'css'});}
    if(id===23&&month==='2026-08'&&size===32){await table().locator('..').scrollIntoViewIfNeeded();check(await renewal().evaluate(row=>{const range=document.createRange();range.selectNodeContents(row.children[1]);return range.getBoundingClientRect().left>=row.children[0].getBoundingClientRect().right;}),'Default enlarged numerator is covered by row header');await p.screenshot({path:`output/playwright/v154-audit/${engine}-renewal-context-enlarged.png`,scale:'css'});}
   }
  }
  await p.setViewportSize({width:1600,height:1000});await p.evaluate(()=>document.documentElement.style.fontSize='16px');
  for(const item of catalog.filter(r=>r.page==='D'&&![3,18,23].includes(r.id))){await open(item.id);states.push({kind:'other-D-metric',...await inspect(item.id,'2026-08')});}
  for(const m of facts.months.filter(m=>!['2026-07','2026-08'].includes(m.month))){await open(23,m.month);states.push({kind:'other-month',...await inspect(23,m.month)});}
  await open(23);const control=p.getByRole('combobox',{name:'续订观察月（仅#23）',exact:true});await control.selectOption('2026-07');await ready();await inspect(23,'2026-07');await p.reload();await ready();await inspect(23,'2026-07');await control.selectOption('2026-06');await ready();await p.goBack();await ready();await inspect(23,'2026-07');
  // Old issue bytes/window stay unchanged while the current context correctly shows August.
  const legacy=JSON.parse(fs.readFileSync('scripts/fixtures/renewal-before-months.json','utf8'));await p.evaluate(rows=>{localStorage.clear();localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(rows));},legacy.records);await p.reload();await ready();await open(23,'2026-08','issue=23');
  const old=legacy.records['record:D:默认演示范围:23'],stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1')),bytes=await stored(),form=p.locator('.action-record');await inspect(23,'2026-08');
  check((await form.locator('> .table-note').innerText()).includes('86.0%')&&(await form.innerText()).includes('原登记为周度口径')&&await stored()===bytes,'Current monthly context silently migrates the old issue');
  await form.locator('[name=owner]').fill('保留原周度基线');await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
  const after=JSON.parse(await stored())['record:D:默认演示范围:23'];for(const k of['issueId','scope','filters','baseline','baselineAt','reviewMetric'])check(JSON.stringify(after[k])===JSON.stringify(old[k]),'Context edit rewrites historical '+k);
  await form.locator('[name=note]').fill('月度对照不覆盖原草稿');await p.getByRole('tab',{name:'趋势与变化',exact:true}).click();await ready();await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();check(await form.locator('[name=note]').inputValue()==='月度对照不覆盖原草稿','Evidence tab loses original draft');
  for(const kind of['missing','bad-count']){
   const bad=structuredClone(facts);if(kind==='missing')delete bad.months;else bad.months.at(-1).records[0].opening++;
   await p.route('**/data/monthly-renewal-facts.json',r=>r.fulfill({json:bad}));await p.reload();await ready();const cells=await renewal().locator('th,td').allTextContents();check(cells[1]==='—'&&cells[2]==='—'&&!cells[3].includes('%'),'Bad monthly source falls back to reliable weekly numbers');check(await p.evaluate(()=>metric(18).kind)==='rate','Bad monthly context disables valid trial data');states.push({kind,cells});await p.unroute('**/data/monthly-renewal-facts.json');
  }
  await p.reload();await ready();await open(23,'2026-09');check((await renewal().innerText()).includes('无效')&&!(await renewal().innerText()).includes('86.0%'),'Invalid local month retains the old weekly sample');
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['all 14 D metric placements','all 12 months from independently summed frequency counts','same monthly row and exact observation deadline','separate September flow counts preserved','raw old weekly sample not mutated','three desktop widths and actual 200% text','month interaction/reload/history','old saved issue baseline and draft preserved','missing/corrupt/invalid monthly source never falls back to weekly rate'],errors};
 }finally{await c.close();}
}
