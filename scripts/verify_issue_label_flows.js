// Save/draft labels must agree with persisted records without replacing the selector.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),results=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const cases=[['A',13],['B',25],['C',42],['D',18],['E',35],['F',48],['G',54]];
 for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]){
  const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),p=await c.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  const form=()=>p.locator('.action-record'),input=name=>form().locator(`[name="${name}"]`);
  const open=async(page,id,query='')=>{
   await p.goto(`${base}#/${page}?metric=${id}&issue=${id}${query?'&'+query:''}`);
   await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
   await form().waitFor();
  };
  const label=()=>input('issueMetric').evaluate(n=>n.selectedOptions[0].textContent);
  const storage=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
  const record=async id=>Object.values(JSON.parse(await storage())).find(r=>r.evidenceId===id);
  try{
   for(const [page,id] of cases){
    await open(page,id);const before=p.url();
    check((await label()).startsWith(`#${id} `),'An untouched form falsely claims a saved record or draft');
    await input('owner').fill(`QA-${page}-${width}`);
    check((await label()).startsWith(`未保存草稿 · #${id} `)&&await input('issueMetric').getAttribute('title')===await label(),'Editing does not update the visible and hover draft label');
    check(await input('owner').evaluate(n=>document.activeElement===n),'State refresh steals input focus');
    await p.keyboard.press('Enter');
    check((await label()).startsWith(`已保存 · #${id} `)&&await form().locator('.action-receipt').getAttribute('data-state')==='saved','Keyboard save leaves the selector stale');
    const saved=await storage(),baseline=(await record(id)).baseline,baselineAt=(await record(id)).baselineAt;
    await input('note').fill('A temporary, unsaved review note');
    check((await label()).startsWith('未保存草稿 · ')&&await storage()===saved,'Draft feedback is missing or changes saved records');
    await input('note').fill('');
    check((await label()).startsWith('已保存 · ')&&await storage()===saved,'Reverting a draft does not restore its saved label');
    await input('note').fill('A saved review note');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check((await label()).startsWith('已保存 · ')&&(await record(id)).note==='A saved review note','Pointer save does not synchronize its marker and record');
    check((await record(id)).baseline===baseline&&(await record(id)).baselineAt===baselineAt&&p.url()===before,'Label refresh changes baseline, period or navigation');
    await p.reload();await form().waitFor();
    check((await label()).startsWith('已保存 · ')&&await input('note').inputValue()==='A saved review note','Reload loses record state or its saved marker');
    check(await input('issueMetric').inputValue()===String(id)&&!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Selected metric or desktop width changed');
    results.push({kind:'record-state',page,id,width});
   }
   // Mixed saved/draft issues retain their own state while the select is used.
   await open('E',39);await input('note').fill('Keep model diagnosis as an unsaved draft');
   const options=await input('issueMetric').locator('option').allTextContents();
   check(options.some(t=>t.startsWith('已保存 · #35 '))&&options.some(t=>t.startsWith('未保存草稿 · #39 ')),'Issue list loses per-record saved/draft state');
   await input('issueMetric').selectOption('35');await form().waitFor();
   check(await input('note').inputValue()==='A saved review note','Switching issue overwrites an existing saved note');
   await input('issueMetric').selectOption('39');await form().waitFor();
   check((await label()).startsWith('未保存草稿 · #39 ')&&await input('note').inputValue()==='Keep model diagnosis as an unsaved draft','Switching issue loses its draft or state');
   results.push({kind:'mixed-issues',page:'E',width});
   // A distinct market has a different record and marker, without changing the original.
   await open('D',18,'country=US');check((await label()).startsWith('#18 '),'Market scope inherits another scope’s saved marker');
   await input('owner').fill('Scoped QA');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
   const us=Object.values(JSON.parse(await storage())).find(r=>r.evidenceId===18&&r.filters.country==='US');
   check((await label()).startsWith('已保存 · ')&&us?.owner==='Scoped QA','Scoped save has no matching state');
   await open('D',18);check((await label()).startsWith('已保存 · ')&&await input('owner').inputValue()===`QA-D-${width}`,'Returning to the original scope mixes record state');
   results.push({kind:'scoped-records',page:'D',width});
  }catch(e){await p.screenshot({path:`output/playwright/v90-issue-label-failure-${browser.browserType().name()}-${width}.png`});throw e;}finally{await c.close();}
 }
 const c=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),p=await c.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(`${base}#/D?metric=18&issue=18`);const form=p.locator('.action-record');await form.waitFor();
  await form.locator('[name="owner"]').fill('Storage failure QA');
  await p.evaluate(()=>Storage.prototype.setItem=function(){throw Error('Simulated storage failure');});
  await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
  const state=await form.locator('[name="issueMetric"]').evaluate(n=>n.selectedOptions[0].textContent);
  check(state.startsWith('未保存草稿 · ')&&await form.locator('.action-receipt').getAttribute('data-state')==='error'&&
   await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===null,'A failed write fabricates a saved marker or record');
  results.push({kind:'storage-failure'});
 }finally{await c.close();}
 check(!errors.length,errors.join('; '));
 return {status:'PASS',checks:['all seven topics at three desktop widths','native keyboard and pointer saves','draft and exact reversion',
  'saved data and historical baseline unchanged by draft edits','per-issue mixed states','scope separation and reload','storage failure remains a draft',
  'focus, selection and hover label preserved','no runtime errors'],results};
}
