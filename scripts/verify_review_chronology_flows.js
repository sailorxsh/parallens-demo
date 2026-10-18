// Review dates follow the original saved statistical window, never the current one.
async(parent)=>{
 const base=new URL('.',parent.url()).href;
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'});
 const p=await c.newPage(),errors=[],states=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const form=()=>p.locator('.action-record'),field=name=>form().locator(`[name=${name}]`);
 const save=()=>form().getByRole('button',{name:'保存本地记录',exact:true}).click();
 const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const open=async(page,id,query='')=>{
  await p.goto(`${base}#/${page}?metric=${id}&issue=${id}${query?'&'+query:''}`);
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
  await form().waitFor();
 };
 const previous=date=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
 const record=async()=>Object.values(JSON.parse(await stored())).find(r=>r.page==='D'&&r.evidenceId===18&&!Object.keys(r.filters).length);
 try{
  for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});
   for(const [page,id,query,end] of [['D',18,'','2026-09-16'],['D',18,'week=2','2026-07-08'],
    ['E',35,'','2026-08-31'],['B',4,'','2026-09-24']]){
    await open(page,id,query);await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);
    check(await field('reviewedAt').getAttribute('min')===end,`Wrong end for ${page}${id} ${query}`);
    await field('status').selectOption('reviewing');
    if(!await form().locator('.action-review').evaluate(n=>n.open))await form().locator('.action-review summary').click();
    await field('reviewedAt').fill('');
    await field('note').fill(`时间校验演示 ${width} ${page}${id}`);await save();
    const before=await stored();
    await field('status').selectOption('verified');await field('target').fill('演示验收条件，非生产目标');
    await field('reviewValue').fill('演示复查值，非实际处理结果');await field('reviewedAt').fill(previous(end));await save();
    const input=field('reviewedAt');
    check(await stored()===before,'Rejected date alters the saved record');
    check(await input.getAttribute('aria-invalid')==='true'&&await input.evaluate(n=>n===document.activeElement),'Early-date error lacks focus or invalid state');
    const description=await input.evaluate(n=>document.getElementById(n.getAttribute('aria-describedby'))?.textContent);
    check(description===`实际复查日不能早于原登记基线统计期末 ${end}`,'Date error does not identify the original bound');
    check(await form().locator('.action-receipt').getAttribute('role')==='alert','Rejected save lacks an alert');
    await field('status').selectOption('pending');
    check(await input.getAttribute('aria-invalid')==='true','Optional state hides an invalid filled date');
    await field('status').selectOption('verified');await input.fill(end);await save();
    check(await form().locator('.action-receipt').getAttribute('data-state')==='saved'&&await input.getAttribute('aria-invalid')===null,'Valid endpoint is rejected or retains error');
    const hint=await input.evaluate(n=>document.getElementById(n.getAttribute('aria-describedby'))?.textContent);
    check(hint.includes(end)&&hint.includes('不能晚于今天'),'Correcting date loses accessible date guidance');
    await p.reload();await form().waitFor();
    check(await field('reviewedAt').inputValue()===end&&await field('status').inputValue()==='verified','Valid review does not survive reload');
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Chronology guidance causes page overflow');
    states.push({width,size,page,id,query,end,description});
   }
  }
  // An earlier historical window controls the bound even when current data is newer.
  await open('D',18);
  await p.evaluate(()=>{
   const rows=JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY));
   const entry=Object.values(rows).find(r=>r.page==='D'&&r.evidenceId===18&&!Object.keys(r.filters).length);
   entry.baseline='45.0%';entry.baselineAt='完整周 W9 · 2026-08-23';entry.reviewedAt='2026-08-24';
   localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(rows));
  });
  await p.reload();await form().waitFor();
  check(await field('reviewedAt').getAttribute('min')==='2026-08-23','Current W12 replaces the historical bound');
  await save();check((await record()).baselineAt==='完整周 W9 · 2026-08-23'&&(await record()).reviewedAt==='2026-08-24','Saving rewrites history or rejects a valid historical review');
  // Existing contradictory records stay untouched on read and failed save.
  await p.evaluate(()=>{
   const rows=JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY));
   Object.values(rows).find(r=>r.page==='D'&&r.evidenceId===18&&!Object.keys(r.filters).length).reviewedAt='2026-08-01';
   localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(rows));
  });
  await p.reload();await form().waitFor();const old=await stored();
  check((await form().innerText()).includes('原记录仍保留')&&await field('status').inputValue()==='verified','Historical contradiction is silently corrected or hidden');
  check(await stored()===old,'Opening an old record mutates it');await save();
  check(await stored()===old&&await field('reviewedAt').getAttribute('aria-invalid')==='true','Invalid old date saves or destroys the original');
  await field('reviewedAt').fill('2026-08-23');await save();
  check(!(await form().innerText()).includes('原保存的实际复查日早于')&&(await record()).baselineAt==='完整周 W9 · 2026-08-23',
   'Correcting the old date leaves a stale warning or rewrites its baseline');
  // Unknown old prose is not parsed heuristically or replaced by today's window.
  await p.evaluate(()=>{
   const rows=JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY));
   const old=Object.values(rows).find(r=>r.page==='D'&&r.evidenceId===18&&!Object.keys(r.filters).length);
   old.baselineAt='旧版未注明统计窗口';old.reviewedAt='2026-08-01';
   localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(rows));
  });
  await p.reload();await form().waitFor();
  check(await field('reviewedAt').getAttribute('min')===null&&(await form().innerText()).includes('请人工核对先后关系'),'Unknown history invents an earliest date');
  await field('owner').fill('旧窗口人工核对');await save();
  check((await record()).baselineAt==='旧版未注明统计窗口'&&(await record()).reviewedAt==='2026-08-01','Manual handling rewrites unknown history');
  check(!errors.length,errors.join('; '));
  return {status:'PASS',states,checks:['weekly, selected-week, month-end and snapshot bounds','16 desktop and 200% text states',
   'blocked save is transactional','specific error and focused date input','invalid optional date remains invalid',
   'inclusive valid endpoint and reload','accessible hint restored after correction','historical window controls the minimum',
   'old contradictory records retained without automatic rewrite','unknown legacy windows prompt manual review','no runtime errors']};
 }finally{await c.close();}
}
