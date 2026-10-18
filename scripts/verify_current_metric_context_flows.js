// Current evidence is the subject of the analysis; saved issues keep their own subject.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),results=[],errors=[];
 const context=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await context.newPage();
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const ready=async()=>{
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 };
 const open=async route=>{await p.goto(`${base}#/${route}`);await ready();};
 const current=()=>p.locator('.detail-finding'),form=()=>p.locator('.action-record'),input=name=>form().locator(`[name="${name}"]`);
 const control=name=>p.locator('.income-context-controls').getByRole('button',{name,exact:true});
 const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const read=async file=>{const response=await parent.request.get(`${base}data/${file}.json`);check(response.ok(),file);return response.json();};
 try{
  const [catalog,contract,diagnostics]=await Promise.all(['metric-catalog','filter-contract','diagnostics'].map(read));
  const cases=new Map(catalog.filter(r=>r.id!==1).map(r=>[`${r.page}:${r.id}`,[r.page,r.id]]));
  for(const [code,info] of Object.entries(diagnostics))for(const id of info.heroIds)cases.set(`${code}:${id}`,[code,id]);
  let visited=0;
  for(const [code,id] of cases.values()){
   // Independent metric visits are not a rapid History API stress test on WebKit.
   if(visited++%12===0)await p.goto('about:blank');
   await open(`${code}?metric=${id}`);
   const item=catalog.find(r=>r.id===id),name=`#${String(id).padStart(2,'0')} ${item.name}`;
   check((await p.locator('.workspace-metric-heading h2').innerText()).startsWith(name),`Wrong evidence heading ${code}:${id}`);
   check(await current().getAttribute('data-metric-id')===String(id)&&(await current().locator('.insight-tag').innerText()).includes(name),`Analysis subject mismatch ${code}:${id}`);
   check(await p.locator('.finding-title').count()===1,`Competing primary titles ${code}:${id}`);
   check((await current().locator('.issue-register').innerText()).includes(`#${id} ${item.name}`),`Ambiguous registration ${code}:${id}`);
   check((await current().locator('.issue-register').getAttribute('aria-label')).includes(`#${id} ${item.name}`),`Wrong accessible action ${code}:${id}`);
   const factual=await current().locator('.finding-summary-status').count();
   if(factual){
    check((await current().locator('.finding-summary-status').innerText()).includes('暂无该指标的诊断结论'),`Facts imply an invented diagnosis ${id}`);
    const window=current().locator('.inspector-facts > div').filter({has:p.locator('dt',{hasText:'时间窗口'})}).locator('dd');
    check(await window.innerText()===contract.find(r=>r.id===id).window,`Factual window drift ${id}`);
   }
   const priority=p.locator('.page-observation');
   if(await priority.count()){
    check(!await priority.evaluate(n=>n.open),'Other-metric observation starts expanded');
    check(await priority.getAttribute('data-metric-id')!==String(id),'Duplicated current observation');
    check(await priority.locator('.issue-register').count()===0,'Other observation offers an ambiguous registration');
   }
   check(await stored()===null,'Reading evidence writes a saved issue');
   results.push({kind:'metric-placement',code,id,factual:Boolean(factual)});
  }
  // Actual quality-header entry now registers quality, while #53 remains available explicitly.
  await open('');await p.locator('.quality-status').click();await ready();
  check(p.url().includes('/G?metric=54')&&(await current().locator('[data-check=eventLoss]').innerText()).includes('2.2%')&&
   (await current().locator('[data-check=idMapping]').innerText()).includes('96.5%'),'Quality entry loses its own measured facts');
  await current().locator('.issue-register').click();await ready();
  check(await input('issueMetric').inputValue()==='54'&&p.url().includes('issue=54'),'Quality entry registers abnormal-event metric');
  await input('owner').fill('质量核查演示');await input('note').fill('质量指标草稿，切换事件证据不更改');
  const baseline54=await form().locator('> .table-note').innerText();
  await control('当前指标').click();
  const priority=p.locator('.page-observation');await priority.locator('> summary').focus();await p.keyboard.press('Enter');
  check(await priority.evaluate(n=>n.open),'Page observation is not keyboard operable');
  check((await priority.innerText()).includes('7 条模拟异常事件'),'Page priority lost its authored event evidence');
  await priority.locator('.insight-link').first().click();await ready();
  check(await current().getAttribute('data-metric-id')==='53'&&await input('issueMetric').inputValue()==='54','Reading event evidence changes the active quality issue');
  await p.goBack();await ready();
  check(await p.locator('.page-observation').evaluate(n=>n.open),'History loses the explicitly opened page observation');
  await control('问题登记').click();
  check(await input('note').inputValue()==='质量指标草稿，切换事件证据不更改'&&await form().locator('> .table-note').innerText()===baseline54,'History changes the quality draft or baseline');
  // MRR and full-month income remain separate, as do the two registration drafts.
  await open('E?metric=35');await current().locator('.issue-register').click();await ready();
  await input('owner').fill('收入核查演示');await input('note').fill('完整月收入原草稿');
  await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  const saved35=await stored(),baseline35=await form().locator('> .table-note').innerText();
  await input('note').fill('完整月收入未保存补充');
  await p.locator('.detail-kpi[data-metric-id="3"] .detail-evidence-link').click();await ready();await control('当前指标').click();
  check(await current().getAttribute('data-metric-id')==='3'&&(await current().innerText()).includes('$56,000')&&
   (await current().innerText()).includes('暂无该指标的诊断结论'),'MRR borrows income diagnosis or loses its own snapshot');
  check(await input('issueMetric').inputValue()==='35'&&await input('note').inputValue()==='完整月收入未保存补充'&&await stored()===saved35,'Viewing MRR changes the saved income issue');
  await p.locator('.page-observation > summary').click();
  check((await p.locator('.page-observation').innerText()).includes('增加 $2,020'),'Original full-month income analysis is not available');
  await current().locator('.issue-register').click();await ready();
  check(await input('issueMetric').inputValue()==='3'&&await input('note').inputValue()==='','Explicit MRR registration reuses another issue draft');
  await input('note').fill('MRR独立草稿');await input('issueMetric').selectOption('35');await ready();
  check(await input('note').inputValue()==='完整月收入未保存补充'&&await form().locator('> .table-note').innerText()===baseline35,'Returning to income replaces its historical baseline or draft');
  await input('issueMetric').selectOption('3');await ready();
  check(await input('note').inputValue()==='MRR独立草稿'&&await stored()===saved35,'Returning to MRR loses its draft or writes storage');
  // Controls update the current metric; unsupported data stays explicit, never zero or old analysis.
  for(const [route,key,value,id,expected] of [
   ['E?metric=3','country','US',3,'事实摘要'],['B?metric=27','functionType','Live',27,'功能人数可能重叠'],
   ['B?metric=29','season','Migration',29,'判定阈值变化'],['D?metric=18','plan','Free',18,'不适用'],
   ['C?metric=42','country','US',42,'无可用结果']
  ]){
   await open(route);const filter=p.locator('.filter-bar');
   if(!await filter.evaluate(n=>n.open))await filter.locator('> summary').click();
   const select=filter.locator(`select[name="${key}"]`);await select.selectOption(value);await ready();
   check(await current().getAttribute('data-metric-id')===String(id)&&(await current().innerText()).includes(expected),`Filter leaves wrong analysis ${route}:${key}`);
   if(id===18||id===42)check(await current().locator('.issue-register').count()===0,'Unavailable scope creates a new issue baseline');
   results.push({kind:'filter',route,key,value});
  }
  // A follow-up task must not mistake the unchanged demo baseline for a post-action result.
  await open('');await p.locator('.home-signal[data-metric-id="18"]').click();
  await p.locator('.home-comparison-context .insight-link').click();await ready();
  check(await current().getAttribute('data-metric-id')==='18'&&(await current().innerText()).includes('43.4%'),'Trial task loses its signal subject or rate');
  await current().locator('.issue-register').click();await ready();
  await input('owner').fill('运营复查任务演示');await input('status').selectOption('reviewing');
  await input('note').fill('仅流程演示：核对成熟试用批次，尚未执行真实支付修复。');
  const save=()=>form().getByRole('button',{name:'保存本地记录',exact:true});
  await save().click();const beforeReview=await stored();
  await input('status').selectOption('verified');await save().click();
  check(await stored()===beforeReview&&await form().locator('[aria-invalid="true"]').count()===3&&
   await input('target').evaluate(n=>document.activeElement===n),'Incomplete review is saved as verified or loses error focus');
  await input('status').selectOption('reviewing');
  await input('target').fill('待有处理后的新成熟批次，再核对转正率是否达到45%；非生产承诺。');
  await input('reviewValue').fill('当前演示43.4%（434/1000）；没有处理后新批次，不能判断恢复。');
  await input('reviewedAt').fill('');
  await input('due').fill(await p.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}));
  await save().click();
  const original=await p.evaluate(()=>Object.entries(simulatedActionState).find(([key,r])=>r.page==='D'&&r.evidenceId===18&&r.scope==='默认演示范围'));
  check(original&&original[1].status==='reviewing'&&original[1].reviewedAt===''&&original[1].baseline.includes('43.4%'),'Review fabricates an achieved target or changes baseline');
  await open('E?country=US&metric=39');await p.locator('#open-saved-issues').click();
  await p.locator('#saved-issues-query').fill(original[1].issueId);
  await p.locator('#saved-issues .saved-issue-open').click();await ready();
  check(await input('issueMetric').inputValue()==='18'&&await input('status').inputValue()==='reviewing'&&
   await input('reviewValue').inputValue()===original[1].reviewValue&&await input('reviewedAt').inputValue()===''&&
   (await form().locator('> .table-note').innerText()).includes(original[1].baseline),'Cross-range follow-up loses original review state');
  check(await p.evaluate(()=>Object.keys(filterState).length)===0,'Cross-range reopen merges current US filters into original issue');
  results.push({kind:'follow-up-task',key:original[0],status:original[1].status,baseline:original[1].baseline,newPostActionData:false});
  for(const [width,height] of [[1366,768],[1600,900],[1920,1080]])for(const size of [16,24,32])for(const route of ['E?metric=3','G?metric=54','E?metric=39','D?metric=18']){
   if(route==='E?metric=3')await p.goto('about:blank');
   await p.setViewportSize({width,height});await open(route);await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await ready();
   const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||
    [...document.querySelectorAll('.detail-finding,.page-observation,.issue-register,.finding-title')].some(n=>n.getBoundingClientRect().width&&n.scrollWidth>n.clientWidth+1));
   check(!overflow,`Current analysis overflows ${route} ${width} ${size}`);
   const register=current().locator('.issue-register');await register.scrollIntoViewIfNeeded();await register.focus();
   check(await register.evaluate(n=>{const r=n.getBoundingClientRect(),at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return document.activeElement===n&&r.top>=0&&r.bottom<=innerHeight+1&&(at===n||n.contains(at));}),`Action covered/unreachable ${route} ${width} ${size}`);
   if(width===1600&&size===16){await p.getByRole('button',{name:'诊断工作区',exact:true}).click();await ready();
    await p.screenshot({path:`output/playwright/v113-audit/after-${route.replace(/\W/g,'-')}-${browser.browserType().name()}.png`,scale:'css'});}
   results.push({kind:'layout',route,width,height,fontSize:size});
  }
  check(!errors.length,errors.join('; '));
  return {status:'PASS',placements:cases.size,checks:['current subject and explicit registration across all metrics and shared placements','facts use original window without invented diagnosis',
   'quality entry and independent page observation','native disclosure and reading history','income/MRR distinct analysis, saved baseline and drafts',
   'filters and missing-data registration boundary','3 desktop widths and 150%/200% text','keyboard action reachability and overlay checks'],results,errors};
 }catch(error){error.message+=`\nRoute: ${p.url()}\nBrowser errors: ${JSON.stringify(errors)}`;throw error;}
 finally{await context.close();}
}
