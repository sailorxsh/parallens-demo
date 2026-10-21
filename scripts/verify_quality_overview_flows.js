// Quality rules must be discoverable before diagnosis and never label missing evidence normal.
async parent=>{
 const base=new URL('.',parent.url()).href,c=await parent.context().browser().newContext({reducedMotion:'reduce'}),p=await c.newPage(),results=[],errors=[];
 const check=(v,m)=>{if(!v)throw Error(m);},ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 const open=async q=>{await p.goto(base+'#/G'+q);await ready();};p.on('pageerror',e=>errors.push(e.message));
 try{
  for(const width of [1366,1600,1920])for(const font of [16,32])for(const q of ['', '?appPlatform=Android']){
   await p.setViewportSize({width,height:1000});await open(q);await p.evaluate(f=>document.documentElement.style.fontSize=f+'px',font);
   const card=p.locator('#topic-G-metric-54'),expected=q?'演示预警':'演示正常';
   check(await p.locator('#topic-highlight-G-54 .topic-quality-status').textContent()==='数据质量 · '+expected,'Summary omits current quality state');
   check(await card.locator('.topic-quality-status').textContent()===(q?'数据质量 · ':'当前范围整体 · ')+expected,'Card status differs from the overall judgement');
   check(await card.locator('li[data-state=warning]').count()===(q?2:0),'Warning count differs from loss and mapping threshold checks');
   const text=await card.innerText();check(text.includes('≤3.0%')&&text.includes('≥95.0%')&&text.includes('尚未确认生产达标标准'),'Threshold basis or demo boundary hidden');
   check(text.includes(q?'3.7%':'2.2%')&&text.includes(q?'94.6%':'96.5%'),'Original rates altered');
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overview overflows');
   check(await card.locator('.topic-quality-checks').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Quality status clips');results.push({width,font,scope:q||'overall'});
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});await open('');
  await p.locator('.filter-bar > summary').click();await p.locator('select[name=appPlatform]').selectOption('Android');await ready();
  check(await p.locator('#topic-highlight-G-54 .topic-quality-status').textContent()==='数据质量 · 演示预警','Native filter retains old normal badge');
  await p.locator('.filter-bar > summary').click();await p.screenshot({path:'output/playwright/v235-quality-overview.png'});
  await p.locator('#topic-open-G-54').focus();await p.keyboard.press('Enter');await ready();
  check(await p.locator('.workspace-observation .quality-check[data-state=warning]').count()===2,'Diagnosis disagrees with overview');
  await p.goBack();await ready();check(await p.locator('#topic-highlight-G-54 .topic-quality-status').textContent()==='数据质量 · 演示预警','Back loses filtered warning');
  let intercepted=0;
  await p.route('**/data/route-G.json*',async r=>{const response=await r.fetch(),json=await response.json();json.diagnostics.G.qualityFacts.days.at(-1).eventGroups.forEach(g=>g.expectedReliable=false);intercepted++;await r.fulfill({response,json});});
  await p.goto('about:blank');await open('');
  check(intercepted===1,'Missing-data fixture missed current route source');
  check(await p.locator('#topic-highlight-G-54 .topic-quality-status').textContent()==='数据质量 · 待核验','Unknown expected events shown as normal');
  check((await p.locator('#topic-G-metric-54').innerText()).includes('事件丢失率：待核验'),'Unavailable numerator not explained');
  check(await p.evaluate(()=>localStorage.length)===0,'Reading quality writes stored records');
  check(!errors.length,errors.join(';'));return {status:'PASS',results,checks:['known overall and Android values','both threshold directions','native filter and keyboard diagnosis','missing reliable expected count','browser back and no storage writes']};
 }finally{await c.close();}
}
