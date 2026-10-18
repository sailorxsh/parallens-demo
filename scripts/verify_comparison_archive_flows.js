// First-save comparison facts survive current data backfills, progress edits and legacy records.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),states=[],errors=[];
 const c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage();
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const source=async name=>(await(await parent.request.get(`${base}data/${name}.json`)).json());
 const [weekly,trial,diagnostics]=await Promise.all(['weekly','trial-facts','diagnostics'].map(source));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(id,query='')=>{await p.goto(`${base}#/${{13:'A',18:'D',35:'E',42:'C'}[id]}?metric=${id}&issue=${id}${query?'&'+query:''}`);await ready();};
 const form=()=>p.locator('.action-record'),input=name=>form().locator(`[name="${name}"]`),save=()=>form().getByRole('button',{name:'保存本地记录',exact:true});
 const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const record=async id=>Object.values(JSON.parse(await stored())).find(r=>r.evidenceId===id);
 const fresh=async id=>{await p.goto('about:blank');await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.goto('about:blank');await open(id);};
 const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
 const expected=id=>{
  if(id===35)return diagnostics.E.paymentMonths.rows.slice(-2).map(r=>[r.netIncome,r.payers]);
  const sets=id===18?['previous','current'].map(period=>trial.records.filter(r=>r.period===period)):[weekly.slice(0,8),weekly.slice(8)];
  return sets.map(rows=>id===18?[rows.filter(r=>r.converted).length,rows.length]:id===13?
   [rows.reduce((n,w)=>n+w.registrationCohort.valueActivated7dBird,0),rows.reduce((n,w)=>n+w.registrationCohort.birdEligible,0)]:
   [sum(rows.flatMap(w=>w.deviceEventsBird.records),'empty'),sum(rows.flatMap(w=>w.deviceEventsBird.records),'triggers')]);
 };
 try{
  for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]])for(const id of [13,18,35,42]){
   await p.setViewportSize({width,height:1000});await fresh(id);await p.evaluate(s=>document.documentElement.style.fontSize=`${s}px`,size);await ready();
   const details=form().locator('.saved-comparison-evidence');check(!await details.evaluate(n=>n.open),'Archive clutters initial registration');
   await details.locator('summary').focus();await details.locator('summary').press('Enter');
   await input('owner').fill('比较证据隔离验收');await save().click();
   const saved=await record(id),snapshot=saved.comparisonEvidence;
   check(snapshot?.version===1&&snapshot.metricId===id,'First successful save omitted typed evidence');
   check(JSON.stringify(snapshot.periods.map(r=>[r.numerator,r.denominator]))===JSON.stringify(expected(id)),`Archive disagrees with independent source counts #${id}`);
   check(await details.evaluate(n=>n.open),'First save loses open evidence disclosure');
   for(const part of snapshot.periods)check((await details.innerText()).includes(part.numerator.toLocaleString('zh-CN'))&&(await details.innerText()).includes(part.denominator.toLocaleString('zh-CN')),'Exact archived counts are not readable');
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Archive overflows desktop/text enlargement');
   check(!await details.evaluate(n=>n.scrollWidth>n.clientWidth+2),'Archive content is clipped');
   await input('note').fill('保留证据的跨页草稿');await p.locator('.sidebar-nav [data-page="F"]').click();await ready();
   await p.goBack();await ready();check(await input('note').inputValue()==='保留证据的跨页草稿','Archive loses private draft');
   await save().click();await p.reload();await ready();
   check(JSON.stringify((await record(id)).comparisonEvidence)===JSON.stringify(snapshot),'Progress save/reload overwrites first evidence');
   check((await form().locator('> .table-note').innerText()).includes(saved.baseline),'Original single-point baseline was changed');
   states.push({id,width,size,periods:snapshot.periods});
  }
  // Each data backfill changes earlier evidence while leaving the newest baseline unchanged.
  await p.setViewportSize({width:1600,height:1000});
  for(const id of [13,18,35,42]){
   await fresh(id);await input('owner').fill('回填对照');await save().click();const before=await record(id),bytes=await stored();
   let path,data;
   if(id===35){path='diagnostics';data=structuredClone(diagnostics);data.E.paymentMonths.rows.at(-2).netIncome=47040;}
   else if(id===18){path='trial-facts';data=structuredClone(trial);let left=36;for(const row of data.records)if(left&&row.period==='previous'&&row.converted){row.converted=false;left--;}}
   else {path='weekly';data=structuredClone(weekly);data.slice(0,8).forEach(w=>{
    if(id===13)w.registrationCohort.valueActivated7dBird-=10;
    else {w.deviceEventsBird.records.forEach(r=>r.empty=r.triggers/2);w.deviceEventsBird.empty=w.deviceEventsBird.records.reduce((n,r)=>n+r.empty,0);}
   });}
   await p.route(`**/data/${path}.json`,r=>r.fulfill({json:data}));await p.reload();await ready();
   check((await form().locator('> .table-note').innerText()).includes(before.baseline),'Controlled historical backfill changed the latest single-point baseline');
   const warning=form().locator('.comparison-evidence-warning');check(await warning.isVisible()&&(await warning.innerText()).includes('比较证据已变化'),'Unchanged latest value hides changed historical evidence');
   check(await stored()===bytes,'Reading changed evidence rewrites saved record');
   await form().locator('.saved-comparison-evidence > summary').click();
   check((await form().locator('.saved-comparison-evidence').innerText()).includes(before.comparisonEvidence.periods[0].numerator.toLocaleString('zh-CN')),'Archived prior counts replaced with current data');
   await input('status').selectOption('reviewing');await save().click();
   check(JSON.stringify((await record(id)).comparisonEvidence)===JSON.stringify(before.comparisonEvidence),'Progress edit rebases evidence to refreshed data');
   if(id===42){
    await p.getByRole('tab',{name:'分组证据',exact:true}).click();await ready();
    for(const width of [1366,1600,1920])for(const size of [16,32]){
     await p.setViewportSize({width,height:1000});await p.evaluate(s=>document.documentElement.style.fontSize=`${s}px`,size);await ready();
     const summary=form().locator('.saved-comparison-evidence > summary');await summary.scrollIntoViewIfNeeded();await summary.focus();await ready();
     const focus=await summary.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {active:n===document.activeElement,hit:hit?.outerHTML.slice(0,400),top:r.top,bottom:r.bottom,visible:hit===n||n.contains(hit)};});
     if(!focus.active||!focus.visible)await p.screenshot({path:`output/playwright/v120-audit/archive-focus-failure-${browser.browserType().name()}.png`,scale:'css'});
     check(focus.active&&focus.visible,`Archive disclosure focus is covered ${width}/${size}: ${JSON.stringify(focus)}`);
     check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||[...document.querySelectorAll('.comparison-evidence')].some(n=>n.scrollWidth>n.clientWidth+2)),'Changed-evidence warning clips enlarged text');
     if(width===1366&&size===32)await p.screenshot({path:`output/playwright/v120-audit/09-archive-warning-enlarged-${browser.browserType().name()}.png`,scale:'css'});
    }
    await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});await ready();
    await p.screenshot({path:`output/playwright/v120-audit/06-archive-backfill-${browser.browserType().name()}.png`,scale:'css'});
   }
   await p.unroute(`**/data/${path}.json`);await p.reload();await ready();
   check(await form().locator('.comparison-evidence-warning').count()===0,'Restored data retains stale discrepancy warning');
   states.push({id,kind:'historical-backfill',baseline:before.baseline});
  }
  await fresh(42);await save().click();const original=await record(42),bytes=await stored();
  const changedGroups=structuredClone(weekly);changedGroups.slice(8).forEach(w=>{
   const rows=w.deviceEventsBird.records,target=rows.find(r=>r.model==='K6'&&r.firmware==='2.8'),other=rows.find(r=>r!==target&&r.empty+100<=r.triggers);
   target.empty-=100;other.empty+=100;
  });
  await p.route('**/data/weekly.json',r=>r.fulfill({json:changedGroups}));await p.reload();await ready();
  check(await form().locator('.comparison-evidence-warning').isVisible()&&
   (await form().locator('.comparison-evidence-warning').innerText()).includes('分组贡献或计数'),'Changed group contribution with identical overall periods is missed');
  check(await stored()===bytes,'Group refresh alters the saved archive');await p.unroute('**/data/weekly.json');
  await p.reload();await ready();
  // Failed writes remain transactional, including the comparison archive.
  await p.evaluate(()=>{window.archiveSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('archive test storage failure');};});
  await input('note').fill('应保存失败的草稿');await save().click();check(await stored()===bytes,'Failed save partially overwrites archive');
  check((await form().locator('.action-receipt').innerText()).includes('未保存'),'Failed save claims success');
  await p.evaluate(()=>Storage.prototype.setItem=window.archiveSetItem);
  await p.reload();await ready();
  const unavailable=structuredClone(weekly);unavailable.forEach(w=>w.deviceEventsBird.records=[]);
  await p.route('**/data/weekly.json',r=>r.fulfill({json:unavailable}));await p.reload();await ready();
  check((await form().locator('.comparison-evidence-warning').innerText()).includes('当前缺少可比证据'),'Missing current data is reported as unchanged');
  await input('owner').fill('当前缺数仍保留原证据');await save().click();
  check(JSON.stringify((await record(42)).comparisonEvidence)===JSON.stringify(original.comparisonEvidence),'Missing current data overwrites saved evidence');
  await p.unroute('**/data/weekly.json');await p.reload();await ready();
  // Old records and unknown/corrupt archives keep their original bytes on read and metadata on edit.
  for(const kind of ['legacy','unknown-version','bad-contribution']){
   await p.evaluate(kind=>{const data=JSON.parse(localStorage.getItem('parallens-demo-actions-v1')),r=Object.values(data)[0];
    if(kind==='legacy')delete r.comparisonEvidence;else if(kind==='unknown-version')r.comparisonEvidence={version:99,untouched:'旧内容'};
    else r.comparisonEvidence={...currentComparisonEvidence(42),groups:currentComparisonEvidence(42).groups.map((g,i)=>({...g,contribution:i?g.contribution:999}))};
    localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(data));},kind);
   const oldBytes=await stored(),old=await record(42);await p.reload();await ready();
   check(await stored()===oldBytes&&await form().locator('.saved-comparison-evidence').count()===0,'Old/corrupt archive was rewritten or rendered as trusted');
   check((await form().locator('.comparison-evidence-status').innerText()).includes(kind==='legacy'?'旧记录未保存':'无法核对'),'Old archive lacks honest status');
   await input('owner').fill(`保留原内容-${kind}`);await save().click();const after=await record(42);
   check(after.baseline===old.baseline&&after.baselineAt===old.baselineAt,'Legacy edit changes the baseline');
   check(JSON.stringify(after.comparisonEvidence)===JSON.stringify(old.comparisonEvidence),'Legacy/corrupt edit fills or replaces historical evidence');
   states.push({kind});
  }
  await fresh(42);await p.goto(`${base}#/C?metric=42&issue=42&week=1`);await ready();await save().click();
  check((await record(42)).comparisonEvidence===null,'First week invents a predecessor archive');
  check((await form().locator('.comparison-evidence-status').innerText()).includes('首次保存时无可比数据'),'Unavailable first save is mislabelled as a historical comparison');
  const small=structuredClone(weekly);small.forEach(w=>{w.deviceEventsBird.records=[{model:'K6',firmware:'2.8',empty:3,triggers:7},
   {model:'Bird Pro',firmware:'Other',empty:50,triggers:100}];w.deviceEventsBird.empty=53;w.deviceEventsBird.triggers=107;});
  await p.route('**/data/weekly.json',r=>r.fulfill({json:small}));await fresh(42);await save().click();
  const low=await record(42);check(low.comparisonEvidence.groups.length===0&&low.comparisonEvidence.groupNote.includes('少于30次'),'Small groups create archived contributions');
  await p.unroute('**/data/weekly.json');
  await fresh(42);await open(42,'deviceModel=K6&firmware=2.8');await save().click();
  const scoped=await record(42);check(JSON.stringify(scoped.comparisonEvidence.filters)===JSON.stringify([['deviceModel','K6'],['firmware','2.8']]),'Archive loses applied device scope');
  await fresh(42);await input('owner').fill('首次保存失败核验');
  await p.evaluate(()=>{window.archiveSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('archive first save failure');};});
  await save().click();check(await stored()===null&&(await form().locator('.saved-comparison-evidence > summary').innerText()).includes('将记录'),'Failed first save claims a frozen archive');
  await p.evaluate(()=>Storage.prototype.setItem=window.archiveSetItem);await save().click();
  check((await record(42)).comparisonEvidence.version===1,'Retry after failed first save does not create evidence');
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['four metrics and independently summed aggregates','16 desktop and enlarged layouts',
   'native disclosure preserves open state','all four historical backfills with same latest baseline','group-only change detection','no archive overwrite on progress save',
   'transactional storage failure','legacy/unknown/corrupt archive preservation','first-week no invented comparison','cross-page draft and original baseline'],errors};
 }finally{await c.close();}
}
