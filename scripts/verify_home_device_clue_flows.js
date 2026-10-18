// Independent event counts -> folded home clue -> C evidence, without changing the active issue.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser();
 const c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage();
 const states=[],errors=[],check=(ok,message)=>{if(!ok)throw Error(message);};
 p.on('pageerror',e=>errors.push(e.message));
 const weeks=await(await parent.request.get(`${base}data/weekly.json`)).json();
 const clue=()=>p.locator('#home-device-clue'),summary=()=>clue().locator('> summary');
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));};
 const open=async(query='')=>{await p.goto('about:blank');await p.goto(`${base}#/${query?'?'+query:''}`);await ready();};
 const num=n=>n.toLocaleString('zh-CN'),pp=n=>`${Math.abs(n)<.005?'':n>0?'+':'−'}${Math.abs(n).toFixed(2)} 个百分点`;
 const raw=ws=>{
  const periods=[ws.slice(0,8),ws.slice(8)].map(part=>part.flatMap(w=>w.deviceEventsBird.records));
  const count=rows=>[rows.reduce((s,r)=>s+r.empty,0),rows.reduce((s,r)=>s+r.triggers,0)];
  const overall=periods.map(count),rates=overall.map(([n,d])=>100*n/d);
  const groups=[true,false].map(target=>periods.map(rows=>count(rows.filter(r=>(r.model==='K6'&&r.firmware==='2.8')===target))));
  return {overall,rates,changes:groups.map(parts=>100*(parts[1][0]/overall[1][1]-parts[0][0]/overall[0][1]))};
 };
 const expected=raw(weeks);
 const verify=async(expected)=>{
  const title=await summary().innerText(),text=await clue().innerText();
  check(title===`设备线索 · 空触发 ${expected.rates[0].toFixed(1)}% → ${expected.rates[1].toFixed(1)}%`,'Home clue disagrees with raw event rates');
  for(const [n,d] of expected.overall)check(text.includes(`${num(n)}／${num(d)} 次`),'Missing exact period counts');
  check(text.includes('W1–W8 · 6/22–8/16')&&text.includes('W9–W12 · 8/17–9/13'),'Device periods are missing or inherited from trial');
  for(const value of expected.changes)check(text.includes(pp(value)),'Contribution differs from raw event counts');
  check(text.includes('不与用户过程率排序')&&text.includes('不证明设备导致'),'Missing cross-object and causal boundaries');
 };
 try{
  const cases=['','productLine=Bird','appPlatform=Android','appPlatform=iOS','productLine=Bird&appPlatform=Android','country=US','country=UK&appPlatform=iOS','productLine=Hunting','country=INVALID'];
  for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});
   for(const query of cases){
    await open(query);await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await ready();
    if(query.includes('INVALID')){
     check(await clue().count()===0&&(await p.locator('#main').innerText()).includes('筛选条件无效'),'Invalid filter retains device facts');
     states.push({width,size,query,title:'invalid-filter guard'});continue;
    }
    check(!await clue().evaluate(n=>n.open),'New visit opens supplementary device clue by default');
    const initial=await p.evaluate(()=>({focus:homeTrendFocus,mode:homeSelectionMode,heading:document.querySelector('.trend-heading h3').textContent}));
    await summary().focus();await summary().press('Enter');check(await clue().evaluate(n=>n.open),'Keyboard cannot expand native disclosure');
    const title=await summary().innerText(),text=await clue().innerText();
    if(query.includes('Hunting'))check(title.includes('不适用')&&text.includes('只定义观鸟线')&&!text.includes('42.0%'),'Hunting fabricates device rate');
    else if(query.includes('country='))check(title.includes('待补数据')&&text.includes('缺少')&&text.includes('明细')&&!text.includes('42.0%'),'Missing market details retain overall facts');
    else await verify(expected);
    if(query.includes('appPlatform=')&&!query.includes('INVALID'))check(text.includes('未应用：App平台')&&(query.includes('productLine=Bird')?text.includes('本项应用：产品线 观鸟'):text.includes('本项仍为总体范围')||query.includes('country=')),'Ignored platform filter appears applied');
    const after=await p.evaluate(()=>({focus:homeTrendFocus,mode:homeSelectionMode,heading:document.querySelector('.trend-heading h3').textContent}));
    check(JSON.stringify(initial)===JSON.stringify(after),'Device expansion changes trial/activation selection');
    check(await p.locator('.home-signals .home-signal').count()<=2,'Device clue participates in process-rate ranking');
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Desktop/text enlargement overflows page');
    check(!await clue().evaluate(n=>[...n.querySelectorAll('p,summary,a')].some(e=>e.scrollWidth>e.clientWidth+2)),'Device clue clips readable content');
    const href=await clue().locator('a').getAttribute('href'),params=new URLSearchParams(href.split('?')[1]);
    check(href.startsWith('#/C?')&&params.get('metric')==='42'&&params.get('panel')==='groups','Wrong evidence destination');
    for(const [key,value] of new URLSearchParams(query)){
     if(key==='appPlatform')check(!params.has(key),'Device evidence applies an irrelevant platform filter');
     else check(params.get(key)===value,`Evidence loses supported filter ${query}: ${href}`);
    }
    states.push({width,size,query,title});
   }
  }
  await p.setViewportSize({width:1600,height:1000});await open();
  check(await p.evaluate(()=>homeTrendFocus===18&&homeSelectionMode==='auto'),'Device entry changed default investigative priority');
  await p.screenshot({path:`output/playwright/v118-audit/06-device-clue-collapsed-${browser.browserType().name()}.png`,scale:'css'});
  await p.locator('.home-signal[data-metric-id="13"]').click();await summary().press('Enter');await ready();
  await p.screenshot({path:`output/playwright/v118-audit/07-device-clue-expanded-${browser.browserType().name()}.png`,scale:'css'});
  await clue().locator('a').click();await ready();
  await p.locator('.evidence-pair[data-comparison-group="device-periods"] svg').waitFor();
  check(p.url().includes('metric=42')&&p.url().includes('panel=groups'),'Native link fails to open C42 contributions');
  check(await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===null,'Reading link registers an issue');
  await p.goBack();await ready();
  check(await clue().evaluate(n=>n.open)&&await p.evaluate(()=>homeTrendFocus===13),'Back loses disclosure or manual chart selection');
  await p.goForward();await ready();
  // A saved C41 issue and its unsaved note must survive the new C42 evidence link.
  await p.locator('.detail-kpi[data-metric-id="41"] .detail-evidence-link').click();await ready();
  await p.locator('.detail-finding .issue-register').click();await ready();
  const form=()=>p.locator('.action-record'),input=name=>form().locator(`[name="${name}"]`);
  await input('owner').fill('设备线索回归');await input('note').fill('原C41保存记录');
  await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  const stored=await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1')),baseline=await form().locator('> .table-note').innerText();
  await input('note').fill('保留C41未保存草稿');
  await p.locator('.sidebar-nav [data-page=""]').click();await ready();await summary().press('Enter');
  await clue().locator('a').click();await ready();
  check(await input('issueMetric').inputValue()==='41'&&await input('note').inputValue()==='保留C41未保存草稿','Device link replaces original issue or its draft');
  check(await form().locator('> .table-note').innerText()===baseline&&await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===stored,'Device clue rewrites original baseline or storage');
  // Isolated source fixtures: signed contributions and withheld small-group evidence.
  const event=(empty,triggers,target)=>({model:target?'K6':'Bird Pro',firmware:target?'2.8':'Other',empty,triggers});
  for(const fixture of [
   {name:'stable',before:[event(1680,4000,true),event(2520,6000,false)],after:[event(1680,4000,true),event(2520,6000,false)]},
   {name:'improving',before:[event(3280,4000,true),event(2520,6000,false)],after:[event(1680,4000,true),event(2520,6000,false)]},
   {name:'small-group',before:[event(3,7,true),event(50,100,false)],after:[event(3,7,true),event(50,100,false)],suppressed:true}
  ]){
   const copy=JSON.parse(JSON.stringify(weeks));copy.forEach((w,i)=>{w.deviceEventsBird.records=i<8?fixture.before:fixture.after;
    w.deviceEventsBird.empty=w.deviceEventsBird.records.reduce((s,r)=>s+r.empty,0);w.deviceEventsBird.triggers=w.deviceEventsBird.records.reduce((s,r)=>s+r.triggers,0);});
   await p.route('**/data/weekly.json',route=>route.fulfill({json:copy}));await open();await summary().press('Enter');
   if(fixture.suppressed)check((await clue().innerText()).includes('少于30次')&&!(await clue().innerText()).includes('贡献 +'),'Small group fabricates a contribution');
   else await verify(raw(copy));
   check(!(await summary().innerText()).includes('异常'),'Stable/improving fixture is labelled an anomaly');
   states.push({fixture:fixture.name});await p.unroute('**/data/weekly.json');
  }
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['raw counts and matched periods','36 desktop/filter/text-size states','native keyboard disclosure and C42 link',
   'no process-rate selection or priority change','history disclosure/manual selection','saved C41 issue, baseline, JSON and private draft retained','stable/improving/small-group source fixtures'],errors};
 }finally{await c.close();}
}
