// Historical return cohorts have their own dates, denominators and sample-size guard.
async(parent)=>{
 const base=new URL('.',parent.url()).href;
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage();
 const errors=[],results=[],check=(ok,message)=>{if(!ok)throw Error(message);};
 p.on('pageerror',e=>errors.push(e.message));
 const open=async(query='')=>{
  await p.goto(`${base}#/B?metric=29&panel=data${query?`&${query}`:''}`);
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
 };
 const table=()=>p.locator('#B-panel-data > .data-table-scroll').first();
 const rows=()=>table().locator('tbody tr').evaluateAll(nodes=>nodes.map(n=>[...n.children].map(c=>c.textContent)));
 try{
  await open();
  const source=await p.evaluate(async()=>({age:await(await fetch('./data/inactivity-cohorts.json')).json(),slices:await(await fetch('./data/filter-slices.json')).json()}));
  for(const width of [1366,1600,1920]){
   await p.setViewportSize({width,height:1000});
   for(const [query,threshold] of [['',21],['season=Other',30]]){
    await open(query);const actual=await rows(),age=source.age;
    const inactive=threshold===21?age.lastActiveDays['21to29']+age.lastActiveDays['30plus']:age.lastActiveDays['30plus'];
    const key=`${threshold}days`,cohort=age.historicalReturnCohort[key],returned=age.returnsAfterThreshold[key];
    check(actual[0][1]===inactive.toLocaleString('zh-CN')&&actual[0][2]===age.eligibleOwners.toLocaleString('zh-CN')&&actual[0][3]===`${(inactive/age.eligibleOwners*100).toFixed(1)}%`,'Current inactivity does not reproduce source intervals');
    check(actual[1][1]===String(returned)&&actual[1][2]===cohort.toLocaleString('zh-CN')&&actual[1][3]===`${(returned/cohort*100).toFixed(1)}%`,'Historical returns use a different source population');
    check(actual[0][4]===`${age.asOf} 快照`&&actual[1][4]==='入组后7天；入组日期未提供','Missing historical dates appear as a current snapshot');
    check((await table().innerText()).includes('不同人群')&&(await table().innerText()).includes('不作跨期比较或召回效果归因'),'Population and comparison limits are missing');
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Cohort dates introduce page overflow');
    results.push({width,query,rows:actual});
   }
  }
  // Independently recompute the intersection from the fixture weights, not the app helper.
  const query='country=Other&appPlatform=iOS&deviceModel=K6';
  const share=[['country','Other'],['appPlatform','iOS'],['deviceModel','K6']].reduce((n,[k,v])=>n*source.slices[k][v].numeratorShare,1);
  for(const [season,key] of [['','21days'],['&season=Other','30days']]){
   await open(query+season);const actual=await rows(),cohort=Math.round(source.age.historicalReturnCohort[key]*share),returned=Math.round(source.age.returnsAfterThreshold[key]*share);
   check(actual[1][1]===String(returned)&&actual[1][2]===String(cohort)&&actual[1][3]==='样本不足（少于30人）','A small return cohort is treated as reliable because the current population is large');
   check((await p.evaluate(()=>metric(29))).kind==='rate','Historical small sample incorrectly suppresses current inactivity');
   results.push({query:query+season,rows:actual});
  }
  await open('country=US');const us=await rows();await open('country=US&week=1');
  check(JSON.stringify(await rows())===JSON.stringify(us),'An unrelated weekly control changes the historical cohort allocation');
  await open();
  const legacy=p.locator('#B-panel-data .data-table-scroll').filter({hasText:'独立历史回流样例 · 日期未提供'}).first();
  const legacyText=await legacy.innerText();
  check(legacyText.includes('600')&&legacyText.includes('5,000')&&legacyText.includes('12.0%')&&legacyText.includes('入组日期及回流观察窗未提供')&&legacyText.includes('不能与#29'),'Legacy return counts are merged with the seven-day cohort or lack date limits');
  await p.locator('.detail-kpi[data-metric-id="29"] .definition-trigger').click();
  check((await p.locator('#metric-definition-popover').innerText()).includes('独立历史入组')&&(await p.locator('#metric-definition-popover').innerText()).includes('历史入组日期未提供'),'Definition describes historical return as a subset of the current pool');
  await p.keyboard.press('Escape');
  await open();await p.locator('.income-evidence > .section-top .issue-register').click();
  const form=p.locator('.action-record');
  check(await form.locator('[name=issueMetric]').inputValue()==='29','Issue registration moves to another metric');
  await form.locator('[name=owner]').fill('未使用规模核查');await form.locator('[name=note]').fill('核对当前未使用池；历史回流样例单独查入组日期。');
  await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
  const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('parallens-demo-actions-v1')));
  const record=Object.values(saved).find(r=>r.evidenceId===29);
  check(record?.baseline==='5.1%'&&record.baselineAt.includes('2026-09-24')&&record.reviewMetric===29,'Historical return replaces the current inactivity baseline');
  await p.reload();await p.locator('.action-record [name=owner]').waitFor();
  check(await p.locator('.action-record [name=owner]').inputValue()==='未使用规模核查'&&JSON.stringify(await p.evaluate(()=>JSON.parse(localStorage.getItem('parallens-demo-actions-v1'))))===JSON.stringify(saved),'Refresh changes the saved current baseline');
  for(const size of [24,32]){
   await open();await p.setViewportSize({width:1366,height:1000});await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);
   await table().scrollIntoViewIfNeeded();await p.evaluate(()=>updateScrollableTables());
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Enlarged cohort table overflows the page');
   if(await table().evaluate(n=>n.scrollWidth>n.clientWidth+1)){
    check(await table().getAttribute('tabindex')==='0'&&await table().locator('.table-scroll-hint').isVisible(),'Last-column date is hidden without keyboard scroll access');
    await table().focus();for(let i=0;i<20;i++)await table().press('ArrowRight');
    await p.waitForFunction(()=>{const n=document.querySelector('#B-panel-data > .data-table-scroll');return n.scrollLeft>=n.scrollWidth-n.clientWidth-2;});
    check(await table().evaluate(n=>{const r=n.getBoundingClientRect(),cell=n.querySelector('tbody tr:last-child td:last-child').getBoundingClientRect();return cell.right<=r.right+1;}),'Cohort date column remains clipped at the keyboard scroll limit');
    check(await table().evaluate(n=>{const r=n.getBoundingClientRect();return ['caption','.table-note','.table-scroll-hint'].every(selector=>{const b=n.querySelector(selector).getBoundingClientRect();return b.left>=r.left&&b.right<=r.right+1;});}),'Reading the date column scrolls the title or comparison caveats out of view');
    check(await table().evaluate(n=>Math.abs(n.querySelector('thead th').getBoundingClientRect().left-n.querySelector('tbody th').getBoundingClientRect().left)<1),'Pinned row labels lose their matching column header');
   }
   await p.evaluate(()=>document.documentElement.style.fontSize='16px');
  }
  // Keep the current pool populated; only the independent history changes.
  let history={cohort:0,returned:0};
  await p.route('**/data/inactivity-cohorts.json',async route=>{
   const response=await route.fetch(),json=await response.json();
   json.historicalReturnCohort['21days']=history.cohort;json.returnsAfterThreshold['21days']=history.returned;
   await route.fulfill({response,json});
  });
  for(const [cohort,returned,expected] of [[0,0,'无历史样本'],[29,3,'样本不足（少于30人）'],[30,0,'0.0%']]){
   history={cohort,returned};await open();await p.reload();await table().waitFor();const actual=await rows();
   check(actual[0][3]==='5.1%'&&actual[1][3]===expected&&!/NaN|Infinity/.test(await table().innerText()),`Invalid history handling at ${cohort} people`);
   results.push({cohort,returned,expected});
  }
  check(!errors.length,errors.join('; '));
  return {status:'PASS',checks:['source populations at three desktop widths','snapshot versus undated seven-day history','independent small-sample denominator',
   'ignored weekly scope','separate legacy cohort and definition','current issue baseline and reload','enlarged keyboard-accessible date column','empty, 29 and 30 person boundaries'],results};
 }finally{await c.close();}
}
