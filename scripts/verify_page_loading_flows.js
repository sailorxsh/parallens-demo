// Cold route boundaries, out-of-order requests, modals and existing issue snapshots.
async parent=>{
 const base=new URL('.',parent.url()).href,b=parent.context().browser(),c=await b.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],requests=[];
 const check=(ok,m)=>{if(!ok)throw Error(m);},ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('/data/'))requests.push(new URL(r.url()).pathname.split('/').at(-1));});
 const nav=code=>p.locator(`.nav-link[data-page="${code}"]`).click();
 let releaseD,releaseB;
 try{
  await p.goto(base);await ready();await p.locator('#trendChart svg').waitFor();
  check(requests.length===2&&requests.includes('route-core.json')&&requests.includes('route-home.json'),'Home downloads unrelated topic facts');
  check(await p.evaluate(()=>[2,3,4,9,13,18,23].map(id=>metric(id).kind).every(k=>k!=='na')),'Home primary metrics unavailable');
  // Save a real nondefault dated scope, then reopen from a cold overview.
  await p.goto(base+'#/D?metric=52&issue=52');await ready();
  const date=await p.evaluate(()=>riskIndex().rows.at(-2).date);
  await p.goto(base+'#/D?metric=52&issue=52&riskSnapshot='+date);await ready();
  await p.locator('.action-record [name=owner]').fill('按页加载验收');
  await p.locator('.action-record').getByRole('button',{name:'保存本地记录',exact:true}).click();
  const original=await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
  // Fresh documents avoid starting an unused home fetch and immediately reloading it;
  // WebKit can report those canceled old-document requests as page errors.
  await p.goto('about:blank');await p.goto(base);await ready();
  check(await p.evaluate(()=>!preparedRoutes.has('D')),'Cold overview eagerly prepares D');
  const gateD=new Promise(r=>releaseD=r);await p.route('**/data/route-D.json*',async r=>{await gateD;await r.continue();});
  await p.locator('#open-saved-issues').click();await p.locator('#saved-issues-query').fill('按页加载验收');
  check(await p.locator('.saved-issue-open').count()===1,'Unloaded dated scope is falsely read-only');
  await p.locator('.saved-issue-open').click();await p.locator('#load-meter').waitFor();
  check(p.url().includes('riskSnapshot='+date)&&await p.locator('.action-record').count()===0&&await p.locator('.home-results').count()===0,'Pending saved scope displays previous page evidence');
  await p.locator('#open-metric-search').click();await p.locator('#metric-search-input').fill('首图');
  releaseD();await ready();
  check(await p.locator('#metric-search').evaluate(n=>n.matches(':modal'))&&await p.locator('#metric-search-input').inputValue()==='首图'&&await p.locator('#metric-search-input').evaluate(n=>document.activeElement===n),'Late topic readiness steals a newer search');
  await p.keyboard.press('Escape');
  check(await p.locator('.action-record [name=owner]').inputValue()==='按页加载验收'&&await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===original,'Opening a lazy topic rewrites original issue scope/baseline');
  await p.locator('.action-record [name=note]').fill('延迟载入后的未保存草稿');await nav('E');await ready();await p.goBack();await ready();
  check(await p.locator('.action-record [name=note]').inputValue()==='延迟载入后的未保存草稿','Cached navigation loses the session draft');
  await p.unroute('**/data/route-D.json*');
  // A late B payload may be cached, but must never replace the newer E view.
  await p.goto('about:blank');await p.goto(base);await ready();
  const gateB=new Promise(r=>releaseB=r);await p.route('**/data/route-B.json*',async r=>{await gateB;await r.continue();});
  await nav('B');await p.locator('#load-meter').waitFor();await nav('E');await ready();
  const before=await p.evaluate(()=>({hash:location.hash,title:document.title,announcement:document.querySelector('#announcement').textContent,focus:document.activeElement.id}));
  releaseB();await p.waitForFunction(()=>preparedRoutes.has('B'));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  check(JSON.stringify(await p.evaluate(()=>({hash:location.hash,title:document.title,announcement:document.querySelector('#announcement').textContent,focus:document.activeElement.id})))===JSON.stringify(before)&&await p.evaluate(()=>activeDataPage)==='E','An obsolete route overwrites the newest page');
  check(await p.evaluate(()=>{
    const filters={userCohort:'2026-08-10'},scope=formatIssueScope(Object.entries(filters)),key=`record:B:${scope}:28`;
    return !sourceData.diagnostics.B.userRetentionFacts&&availableOptions('B','userCohort').includes(filters.userCohort)&&
      savedIssueTarget(key,{page:'B',evidenceId:28,filters,scope,issueId:issueIdForKey(key,'B',28)}).href?.includes('userCohort=2026-08-10');
  }),'Cached but inactive topic makes a saved dated scope read-only');
  await p.unroute('**/data/route-B.json*');
  // Failure removes old evidence, keeps the direct URL, and retries only the failed topic.
  await p.route('**/data/route-C.json*',r=>r.abort());
  await p.evaluate(()=>{pushRoute('#/C?country=US&metric=43');renderRoute();});
  await p.getByRole('button',{name:'重新加载',exact:true}).waitFor();
  check(await p.locator('.detail-kpi').count()===0&&p.url().includes('country=US')&&p.url().includes('metric=43'),'Failed topic retains stale cards or loses scope');
  await p.unroute('**/data/route-C.json*');const count=requests.length;
  await p.getByRole('button',{name:'重新加载',exact:true}).click();await ready();
  check(requests.length===count+1&&requests.at(-1)==='route-C.json'&&await p.evaluate(()=>activeDataPage)==='C','Retry refetches unrelated facts or fails to commit C');
  // A deployment-version mismatch must not be mistaken for valid empty data.
  await p.route('**/data/route-F.json*',async r=>{const response=await r.fetch(),payload=await response.json();payload.revision='stale-deploy';await r.fulfill({json:payload});});
  await nav('F');await p.getByRole('button',{name:'刷新整个页面',exact:true}).waitFor();
  check(await p.locator('.detail-kpi').count()===0,'Mismatched route data displays values');
  await p.unroute('**/data/route-F.json*');p.once('dialog',dialog=>dialog.accept());await p.getByRole('button',{name:'刷新整个页面',exact:true}).click();await ready();
  check(await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===original,'Loading, retry or route changes modify stored issue JSON');
  check(!errors.length,errors.join(';'));return {status:'PASS',engine:b.browserType().name(),initialRequests:requests.slice(0,2),datedScope:date,checks:['two overview requests only','cold saved-scope restoration','atomic source readiness','new modal and focus survive late completion','session draft retained','out-of-order route payload ignored','isolated failure and one-topic retry','deployment revision mismatch rejected','stored issue JSON unchanged']};
 }finally{releaseD?.();releaseB?.();await c.close();}
}
