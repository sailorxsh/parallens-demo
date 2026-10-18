// Monthly stocks are distinct from register-month cohorts and current issue baselines.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name(),c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],results=[];
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};p.on('pageerror',e=>errors.push(e.message));
 const diagnostics=await(await parent.request.get(base+'data/diagnostics.json')).json(),old=JSON.parse(fs.readFileSync('scripts/fixtures/accounts-before-history.json','utf8')).records;
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(query='metric=7',page='A')=>{await p.goto(`${base}#/${page}?${query}`);await ready();};
 const pair=()=>p.locator('.evidence-pair[data-evidence-metric="7"]'),chart=()=>pair().locator('.detail-chart'),form=()=>p.locator('.action-record'),stored=()=>p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
 const reveal=async d=>{if(!await d.evaluate(n=>n.open))await d.locator(':scope > summary').click();await ready();};
 const setSource=async d=>{await c.route('**/data/diagnostics.json',r=>r.fulfill({json:d}));await p.reload();await ready();};
 const inspect=async(label)=>{
  check(await p.locator('[role=tab][aria-selected=true]').innerText()==='趋势与变化','Account evidence is not default history');await chart().scrollIntoViewIfNeeded();await chart().locator('svg').waitFor();
  const info=await p.evaluate(()=>({m:metric(7).value,history:accountStockHistory()}));
  const plot=await chart().evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {dates:o.xAxis[0].data,lines:o.series.map(s=>s.data)};});
  check(plot.dates.length===13&&plot.dates[0]==='2025-09-30'&&plot.dates.at(-2)==='2026-08-31'&&plot.dates.at(-1)==='2026-09-24','Missing completed month ends or current point mislabeled a completed month');
  for(let i=0;i<13;i++)check(plot.lines[0][i]===info.history.rows[i].registered&&plot.lines[1][i]===info.history.rows[i].boundOwners,'Rendered population differs from the month table');
  check((await pair().innerText()).includes('不是完整月新增'),'Partial month is described as full-month change');results.push({label,current:info.m,points:plot.dates.length});
 };
 try{
  await open();await p.evaluate(r=>localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(r)),old);await p.reload();await ready();const initial=await stored();await inspect('overall');
  await p.getByRole('button',{name:'查看累计用户与绑定用户口径',exact:true}).last().click();check((await p.locator('#metric-definition-popover').innerText()).includes('绑定占比＝当前绑定主账号数÷累计注册正式用户数'),'Binding ratio definition omits its denominator');await p.keyboard.press('Escape');
  await reveal(pair().locator('.workspace-calculation'));const pos=await chart().evaluate(n=>{const e=echarts.getInstanceByDom(n),r=n.getBoundingClientRect(),o=e.getOption(),[x,y]=e.convertToPixel({seriesIndex:1},[10,o.series[1].data[10]]);return {x:r.left+x,y:r.top+y};});
  await p.mouse.click(pos.x,pos.y);await ready();check((await pair().locator('.chart-selected').innerText()).startsWith('2026-07-31'),'Bound-owner native point selects the wrong monthly row');check(await stored()===initial,'Viewing history replaces old issues');
  for(const q of ['country=US','appPlatform=iOS','country=US&appPlatform=iOS','country=Other&appPlatform=Android']){await open('metric=7&'+q);await inspect(q);}
  await open('metric=7','F');await inspect('F-shared-metric');const card=p.locator('.detail-kpi[data-metric-id="7"]');check((await card.locator('.metric-secondary-values').innerText()).includes('64.1%'),'Current binding ratio is missing from its KPI');check((await card.locator('.metric-value-context').innerText()).includes('较8月末'),'Monthly stock comparison hides the period');
  const delta=card.locator('.metric-delta');check((await delta.getAttribute('title')).includes('2026-09-24 较 2026-08-31')&&await delta.getAttribute('aria-label')===await delta.getAttribute('title'),'Compact count delta loses full comparison dates');
  for(const[key,record]of Object.entries(old)){
   await open('metric=7&issue=7&'+new URLSearchParams(record.filters));check((await form().locator('> .table-note').innerText()).includes(record.baseline),'Original registration baseline is not displayed');
   if(!record.filters.country)check(await form().locator('.action-baseline-note').count()===0,'Adding derived binding ratio creates a false overall baseline-change warning');
   else check((await form().locator('.action-baseline-note').innerText()).includes('37,615'),'Corrected one-person cross-cell is not explained against old baseline');
   await form().locator('[name=note]').fill('只更新进度，保留原始账号基线');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const saved=JSON.parse(await stored())[key];for(const field of ['issueId','scope','filters','baseline','baselineAt','reviewMetric'])check(JSON.stringify(saved[field])===JSON.stringify(record[field]),`Source correction silently migrates ${field}`);
   await form().locator('[name=note]').fill('不应被历史页签覆盖的草稿');await p.locator('#A-tab-groups').click();await p.locator('#A-tab-change').click();check(await form().locator('[name=note]').inputValue()==='不应被历史页签覆盖的草稿','History navigation loses draft');
  }
  const saved=await stored();await open();
  for(const[label,mutate,currentBad]of [['missing-month',s=>s.months.pop(),false],['bad-month-count',s=>s.months[0].records[0].registered=-1,false],['bridge-mismatch',s=>s.registrationBridge.days[0].registered++,false],['current-negative',s=>s.current.records[0].registered=-1,true],['cross-margin',s=>{s.current.records[0].registered++;s.current.records[2].registered--;},true]]){
   const d=structuredClone(diagnostics);mutate(d.A.accountHistory);await setSource(d);await open();check(await p.evaluate(bad=>metric(7).kind===(bad?'na':'group'),currentBad),'History and current source availability are conflated');check(await pair().count()===0&&await p.evaluate(()=>metricHistory(7)===null),'Invalid stock source has an old standalone trend');
   if(!currentBad){await p.locator('#A-tab-groups').click();check(await p.locator('.account-stock-group table').count()===2,'Missing monthly history hides reliable current group counts');}
   check(await stored()===saved,'Source fault overwrites old issues');results.push({label,currentBad});await c.unroute('**/data/diagnostics.json');await p.reload();await ready();
  }
  // A legitimate historical geographical redistribution keeps month totals and current stock.
  const changed=structuredClone(diagnostics),cells=changed.A.accountHistory.months[5].records;cells[0].registered++;cells[2].registered--;await setSource(changed);await open('metric=7&country=US&appPlatform=iOS');await inspect('changed-historical-cell');check(await p.evaluate(()=>metric(7).value.registered===37615),'Past source update changes current stock');await c.unroute('**/data/diagnostics.json');await p.reload();await ready();
  const zero=structuredClone(diagnostics);for(const r of zero.A.accountHistory.months[0].records){r.registered=0;r.boundOwners=0;}await setSource(zero);await open();await inspect('known-zero-month');await reveal(pair().locator('.workspace-calculation'));
  check((await pair().locator('tbody tr').first().innerText()).includes('无合格分母')&&await chart().evaluate(n=>echarts.getInstanceByDom(n).getOption().series.every(s=>s.data[0]===0)),'Known zero stock is missing or assigned a fake zero binding rate');await c.unroute('**/data/diagnostics.json');await p.reload();await ready();
  for(const[width,font]of[[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});await open();await p.evaluate(f=>document.documentElement.style.fontSize=f+'px',font);await chart().scrollIntoViewIfNeeded();await ready();await chart().locator('svg').waitFor();
   const bounds=await chart().boundingBox(),texts=await chart().locator('svg text').evaluateAll(ns=>ns.map(n=>({text:n.textContent,b:n.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(n).fontSize)})));
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Account history overflows the desktop');for(const t of texts)check(t.font>=12*font/16-.1&&t.b.x>=bounds.x-1&&t.b.right<=bounds.x+bounds.width+1,`Clipped or undersized stock text ${t.text}`);
   await p.screenshot({path:`output/playwright/v163-audit/${engine}-accounts-${width}-${font}.png`});results.push({label:`layout-${width}-${font}`});
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});await c.route('**/vendor/echarts.min.js*',r=>r.abort());await p.reload();await ready();await reveal(pair().locator('.workspace-calculation'));check(await pair().locator('tbody tr').count()===13&&(await pair().locator('tbody').innerText()).includes('82,400'),'Missing chart library loses current or completed-month exact counts');check(await stored()===saved,'Fallback or layout changes original issue baselines');check(errors.length===0,errors.join('\n'));return {status:'PASS',engine,results,oldRecordsPreserved:2,errors};
 }finally{await c.close();}
}
