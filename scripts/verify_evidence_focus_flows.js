// Search/jump focus must follow the metric, while saved issues keep their form destination.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),states=[],steps=[],errors=[];
 const c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage();
 p.on('pageerror',e=>errors.push(e.message));const check=(ok,message)=>{if(!ok)throw Error(message);};
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const fresh=async(hash='',size=16)=>{await p.goto('about:blank');await p.goto(`${base}#/${hash}`);await ready();
  await p.evaluate(s=>document.documentElement.style.fontSize=`${s}px`,size);await ready();};
 const geometry=()=>p.evaluate(()=>{const n=document.activeElement,r=n.getBoundingClientRect();
  const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),nav=document.querySelector('.section-navigation')?.getBoundingClientRect();
  return {tag:n.tagName,name:n.name,id:n.id,classes:n.className,text:n.textContent?.slice(0,90),top:r.top,bottom:r.bottom,height:r.height,
   visible:r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight,hit:hit===n||n.contains(hit),navBottom:nav?.top<=0?nav.bottom:0};});
 const usable=async(label)=>{const g=await geometry();check(g.visible&&g.hit,`${label}: focus is outside the visible controls or covered: ${JSON.stringify(g)}`);return g;};
 const search=async id=>{await p.keyboard.press('Control+k');await p.keyboard.type(`#${id}`);await p.keyboard.press('Enter');
  await p.waitForFunction(id=>!document.querySelector('#metric-search').open&&new URLSearchParams(location.hash.split('?')[1]).get('metric')===String(id),id);await ready();};
 const seek=async(selector,direction='Tab',limit=70)=>{
  for(let i=0;i<limit;i++){
   await p.keyboard.press(direction);const matches=await p.evaluate(s=>document.activeElement.matches(s),selector);
   const g=await geometry();
   if(g.tag!=='BODY'&&g.height<700)check(g.visible&&g.hit,`Native ${direction} passes a covered control: ${JSON.stringify(g)}`);
   if(matches){steps.push({selector,tabs:i+1,direction});return;}
  }throw Error(`Keyboard could not reach ${selector}`);
 };
 try{
  for(const [width,height,size] of [[1366,768,16],[1600,900,16],[1920,1080,16],[1366,1000,32]]){
   await p.setViewportSize({width,height});
   for(const [id,scope] of [[13,''],[25,''],[42,''],[18,''],[35,''],[48,''],[54,''],[54,'D?country=US']]){
    await fresh(scope,size);await search(id);
    await p.waitForFunction(id=>document.activeElement===document.querySelector(`#metric-evidence-${id} h2`),id);
    const g=await usable(`${id} ${width}/${size}`);check(g.top>=g.navBottom,'Metric heading is behind sticky navigation');
    if(width===1600&&id===18)await p.screenshot({path:`output/playwright/v124-audit/03-evidence-focus-${browser.browserType().name()}.png`});
    if(size===32&&id===18)await p.screenshot({path:`output/playwright/v124-audit/09-evidence-focus-enlarged-${browser.browserType().name()}.png`});
    await p.keyboard.press('Tab');check(await p.evaluate(()=>document.activeElement.classList.contains('definition-trigger')),'Tab starts over at the page header instead of metric definition');
    await usable('Definition after the metric heading');
    states.push({id,scope,width,height,size,heading:g});
   }
  }
  // A native keyboard task, including registration, save and cross-page lookup.
  await p.setViewportSize({width:1600,height:1000});await fresh();await search(18);
  await p.keyboard.press('Tab');await p.keyboard.press('Enter');
  check(await p.locator('#metric-definition-popover').evaluate(n=>definitionPopoverIsOpen(n)),'Keyboard definition does not open');
  await p.keyboard.press('Escape');await p.keyboard.press('Tab');
  check(await p.evaluate(()=>document.activeElement.classList.contains('issue-register')),'Registration needs a return through the page header');
  await p.keyboard.press('Enter');await ready();check(await p.evaluate(()=>document.activeElement.name==='owner'),'Registration loses the owner destination');
  await p.screenshot({path:`output/playwright/v124-audit/04-keyboard-registration-${browser.browserType().name()}.png`});
  await usable('Owner destination');await p.keyboard.type('键盘完整任务');
  await seek('[name=note]');await p.keyboard.type('仅使用键盘核对、登记并找回原证据。');
  await seek('.action-record button[type=submit]');await p.keyboard.press('Enter');
  check(await p.locator('.action-record').getAttribute('data-dirty')==='false','Keyboard save failed');
  check(await p.locator('[name=status]').inputValue()==='pending'&&await p.locator('[name=due]').inputValue()==='',
   'Traversing optional fields changes the untouched status or planned date');
  await p.screenshot({path:`output/playwright/v124-audit/05-keyboard-saved-${browser.browserType().name()}.png`});
  const original=await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY)),baseline=await p.locator('.action-record > .table-note').innerText();
  await p.reload();await ready();check(await p.locator('[name=owner]').inputValue()==='键盘完整任务','Reload loses the saved task');
  await search(3);await seek('#open-saved-issues','Shift+Tab');await p.keyboard.press('Enter');
  check(await p.evaluate(()=>document.activeElement.id==='saved-issues-query'),'Saved issue lookup lacks its keyboard destination');
  await p.keyboard.type('键盘完整任务');
  await p.screenshot({path:`output/playwright/v124-audit/06-keyboard-lookup-${browser.browserType().name()}.png`});
  await seek('.saved-issue-open');await p.keyboard.press('Enter');await ready();
  await p.waitForFunction(()=>document.activeElement.name==='owner');
  check(p.url().includes('/D?')&&await p.locator('[name=issueMetric]').inputValue()==='18'&&
   await p.locator('.action-record > .table-note').innerText()===baseline&&await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===original,
   'Saved issue focus restoration changes its original identity, scope or evidence');
  await usable('Reopened saved owner');
  await p.screenshot({path:`output/playwright/v124-audit/07-keyboard-reopened-${browser.browserType().name()}.png`});
  await p.locator('[name=note]').fill('返回证据时保留的会话草稿');
  await p.locator('.income-context-controls').getByRole('button',{name:'当前指标',exact:true}).click();
  const same=p.locator('.detail-finding').getByRole('link',{name:'查看本条指标证据 ↓',exact:true});await same.focus();await p.keyboard.press('Enter');await ready();
  check(await p.evaluate(()=>document.activeElement===document.querySelector('#metric-evidence-18 h2')),'An already-current evidence link scrolls without moving focus');
  check(await p.locator('[name=note]').inputValue()==='返回证据时保留的会话草稿'&&await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===original,'Same-evidence inspection changes the record or draft');
  await fresh('D?country=not-a-market');await search(18);
  check(await p.locator('.filter-error-notice').count()===1&&await p.locator('.detail-chart').count()===0,'Invalid filter bypasses validation when focusing search results');
  for(const id of ['1.2','Infinity','999']){
   await fresh(`D?metric=${id}`);check(await p.evaluate(()=>document.activeElement.id==='main')&&
    await p.locator('#metric-evidence-18').count()===1,'Unknown metric link moves focus to an invented target');
  }
  check(!errors.length,errors.join('; '));return {status:'PASS',states,steps,checks:['32 metric/scope/layout entries','heading visible and not covered','Tab continues at the requested metric',
   'keyboard definition, registration, save and lookup; reload is browser-driven','saved owner destination','same-hash evidence, immutable baseline and draft','invalid filter remains blocked'],errors};
 }finally{await c.close();}
}
