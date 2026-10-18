// Source observation deadlines govern new reviews; historical records stay self-contained.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),engine=browser.browserType().name();
 const c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage(),states=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const source=async name=>(await(await parent.request.get(`${base}data/${name}.json`)).json());
 const [weekly,onboarding,trial]=await Promise.all(['weekly','onboarding-duration-facts','trial-facts'].map(source));
 const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/observation-before-windows.json','utf8'));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(id,state={})=>{const q=new URLSearchParams({metric:String(id),issue:String(id),...state});await p.goto(`${base}#/${id===18?'D':'A'}?${q}`);await ready();};
 const form=()=>p.locator('.action-record'),field=name=>form().locator(`[name="${name}"]`),save=()=>form().getByRole('button',{name:'保存本地记录',exact:true}).click();
 const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const record=async id=>p.evaluate(id=>Object.values(simulatedActionState).find(r=>r.issueId===document.querySelector('.action-record-header strong')?.textContent.replace('问题单 ','')),id);
 const previous=date=>new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const expected=(id,state)=>{
  const w=weekly.find(r=>r.week===Number(state.week??12));
  const through=id===18?trial.records.filter(r=>r.maturity_week_end===w.weekEnd&&(!state.country||r.country===state.country)&&(!state.appPlatform||r.app_platform===state.appPlatform)).map(r=>r.outcome_observed_through).sort().at(-1):onboarding[id===11?'binding':'activation'].cohorts.find(r=>r.week===w.week).observedThrough;
  const start=new Date(Date.parse(w.weekEnd+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);
  return {through,label:`完整周 W${w.week} · ${start}—${w.weekEnd} · 观察截至 ${through}（UTC）`};
 };
 try{
  for(const [width,size]of[[1366,16],[1600,16],[1920,16],[1366,32]])for(const id of[11,13,18])for(const state of[{}, {week:'2'},id===11?{appPlatform:'iOS'}:{country:'US'}]){
   await p.setViewportSize({width,height:1000});await open(id,state);await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await ready();
   const want=expected(id,state);check(await field('reviewedAt').getAttribute('min')===want.through,`Wrong observation #${id} ${JSON.stringify(state)}`);
   check((await form().locator('> .table-note').innerText()).includes(want.label),'Saved window omits exact cohort/observation');
   check((await p.locator('.evidence-meta').first().innerText()).includes(want.through),'Evidence omits actual observation date');
   await field('status').selectOption('reviewing');await field('note').fill('观察截止与保存事务隔离验收');await save();const bytes=await stored(),original=await record(id);
   await field('status').selectOption('verified');await field('target').fill('人工核对观察已经完成');await field('reviewValue').fill('模拟复查结果');await field('reviewedAt').fill(previous(want.through));await save();
   check(await stored()===bytes,'Early review modifies saved bytes');check(await field('reviewedAt').getAttribute('aria-invalid')==='true'&&await field('reviewedAt').evaluate(n=>n===document.activeElement),'Early date lacks invalid state/focus');
   check((await form().locator('.action-receipt').innerText()).includes(want.through),'Rejected review omits correct bound');
   await field('reviewedAt').fill(want.through);await save();check(await form().locator('.action-receipt').getAttribute('data-state')==='saved','Exact observation date rejected');
   const after=await record(id);check(after.issueId===original.issueId&&after.baselineAt===want.label,'Save changes identity/window');await p.reload();await ready();await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await ready();
   check(await field('reviewedAt').inputValue()===want.through,'Endpoint review lost on reload');check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Observation text overflows desktop');
   if(id===13&&!Object.keys(state).length&&width===1366){await field('reviewedAt').scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/v151-audit/${engine}-observation-${size}.png`,scale:'css'});}
   states.push({id,width,size,state,through:want.through});
  }
  // Switching metric/period returns to its own draft, without rebasing the saved observation.
  await open(13);await field('note').fill('独立批次草稿');const original=await record(13);await open(13,{week:'2'});await open(13);
  check(await field('note').inputValue()==='独立批次草稿'&&(await record(13)).baselineAt===original.baselineAt,'Period switch loses draft or window');
  // True records captured by the previous UI remain byte-identical on read.
  await p.evaluate(records=>{localStorage.clear();localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(records));},fixture.records);await p.reload();await ready();
  for(const old of Object.values(fixture.records)){
   await open(old.evidenceId,old.filters);const bytes=await stored();
   check(await form().locator('.observation-legacy-note').isVisible(),'Legacy cutoff omission is hidden');
   check(await field('reviewedAt').getAttribute('min')===old.baselineAt.slice(-10),'Current observation replaces original bound');
   check(await field('reviewedAt').inputValue()===old.reviewedAt&&await stored()===bytes,'Read migrates old review');
   await field('owner').fill('保留原观察证据');await save();const after=await record(old.evidenceId);
   for(const key of['issueId','baseline','baselineAt','reviewedAt','filters','comparisonEvidence'])check(JSON.stringify(after[key])===JSON.stringify(old[key]),`Legacy edit changes ${key}`);
   states.push({kind:'legacy',id:old.evidenceId,week:old.filters.week,min:old.baselineAt.slice(-10)});
  }
  // A valid current deadline changes without counts changing: show discrepancy, preserve the saved deadline.
  await p.evaluate(()=>localStorage.clear());await p.reload();await ready();await open(18);await save();const saved=await record(18),bytes=await stored();
  const later=structuredClone(trial);later.records.find(r=>r.week===12&&r.country==='US').outcome_observed_through='2026-09-17';
  await p.route('**/data/trial-facts.json',r=>r.fulfill({json:later}));await p.reload();await ready();
  check((await form().locator('.action-baseline-note').innerText()).includes('2026-09-17'),'Changed observation with same rate lacks warning');
  check(await field('reviewedAt').getAttribute('min')==='2026-09-16'&&await stored()===bytes,'Current cutoff rebases saved record');
  await field('owner').fill('保留原观察日');await save();check((await record(18)).baselineAt===saved.baselineAt,'Progress save rebases observation');await p.unroute('**/data/trial-facts.json');
  // Invalid current metadata cannot create a fresh record; other country and earlier week stay usable.
  const bad=structuredClone(trial);bad.records.find(r=>r.week===12&&r.country==='US').outcome_observed_through='2026-09-25';
  await p.route('**/data/trial-facts.json',r=>r.fulfill({json:bad}));await p.reload();await ready();await open(18,{country:'US'});
  check(await p.evaluate(()=>metric(18).availability)==='pending','Invalid observation is shown as a reliable rate');const before=await stored();await save();check(await stored()===before,'Invalid current source creates a new issue');
  await open(18,{country:'UK'});check(await field('reviewedAt').getAttribute('min')==='2026-09-16','US metadata disables valid UK');
  await open(18,{week:'2',country:'US'});check(await field('reviewedAt').getAttribute('min')==='2026-07-08','Latest metadata disables earlier week');
  await open(18);await field('owner').fill('当前缺数仍保留原记录');await save();check((await record(18)).baselineAt===saved.baselineAt,'Invalid current source prevents existing maintenance');
  await p.unroute('**/data/trial-facts.json');check(!errors.length,errors.join('; '));
  return {status:'PASS',states,checks:['36 source-derived desktop/200% text states','transactional early review with focused accessible error','inclusive observation endpoint and reload','separate period draft','six captured legacy records preserved','changed observation with unchanged count warns without rebase','invalid current observation isolated by country/week','existing issue maintenance during missing current data'],errors};
 }finally{await c.close();}
}
