// A hunting model must never acquire a bird activation rate from aggregate slices.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage(),results=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);};
 const open=async(filters={},extra='')=>{await p.goto(`${base}#/A?metric=13&${new URLSearchParams(filters)}${extra}`);await ready();};
 const scopes=[{deviceModel:'Hunt Pro'},{deviceModel:'Hunt Pro',country:'US',appPlatform:'Android',week:'12'},{productLine:'Hunting',deviceModel:'Hunt Pro'}];
 try{
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]])for(const filters of scopes){
   await p.setViewportSize({width,height:1000});await open(filters);await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
   check(await p.evaluate(()=>metric(13).kind)==='na','Hunting model still has bird activation numerator and denominator');
   check(await p.evaluate(()=>metricHistory(13)===null&&trendValues(13)===null&&weeklyRateComparison(13)===null),'A fake hunting activation curve or comparison remains');
   check((await p.locator('.income-evidence > .section-top .section-note').innerText())==='当前范围不适用','Unavailable evidence claims a computed slice source');
   check((await p.locator('.workspace-observation').innerText()).includes('不适用'),'Unavailable hunting cohort lacks an explicit explanation');
   check(await p.locator('.income-evidence > .section-top .issue-register').count()===0,'A hunting rate can still create a new issue baseline');
   check(await p.locator('.detail-kpi[data-metric-id="13"] .detail-select').innerText()==='不适用','Top card still claims a hunting activation rate');
   for(const tab of ['change','groups','data']){await p.locator(`#A-tab-${tab}`).click();check(await p.locator(`.income-panel:not([hidden]) [data-evidence-metric="13"] .detail-chart`).count()===0,'A hidden tab retains hunting activation evidence');}
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Scope explanation overflows the desktop page');
   check(await p.evaluate(()=>metric(11).kind)==='rate','Bird-only guard suppresses valid first-binding attempts for a hunting model');
   if(width===1600){await p.locator('.income-workspace').scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/activation-hunting-${browser.browserType().name()}-${Object.keys(filters).length}.png`});}
   results.push({width,font,filters});
  }
  // Existing records stay historical and editable for progress, while the current metric is NA.
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});
  const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/activation-hunting-legacy-record.json','utf8'));
  check(fixture.sourceCommit==='6b0fd13a2dd236ba131959f7ed91a44e73a6174f','Historical fixture lacks its shipped source provenance');
  const state=fixture.records,[key,record]=Object.entries(state).find(([,r])=>r.evidenceId===13);
  check(record.baseline==='46.2%'&&record.filters.deviceModel==='Hunt Pro','Historical fixture no longer covers the original wrong scope');
  await p.evaluate(state=>localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(state)),state);await open({deviceModel:'Hunt Pro'},'&issue=13');await p.reload();await ready();
  const original=await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));await p.getByRole('button',{name:'问题登记',exact:true}).click();
  check((await form().innerText()).includes('46.2%')&&await p.evaluate(()=>metric(13).kind)==='na','Scope repair silently rewrites the legacy baseline');
  await form().locator('[name=note]').fill('旧范围的新核查草稿');await p.goto(base+await p.evaluate(()=>routeHref('A',11)));await ready();
  await p.goBack();await ready();await p.getByRole('button',{name:'问题登记',exact:true}).click();
  check(await form().locator('[name=note]').inputValue()==='旧范围的新核查草稿'&&await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===original,'Reading valid binding evidence loses the old issue draft or changes saved data');
  await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const saved=await p.evaluate(key=>JSON.parse(localStorage.getItem('parallens-demo-actions-v1'))[key],key);
  check(saved.issueId===record.issueId&&saved.baseline==='46.2%'&&saved.baselineAt===record.baselineAt&&saved.filters.deviceModel==='Hunt Pro','Progress saving replaces the original hunting scope or baseline');
  // The new-issue path, without a historical record, is blocked by normal availability rules.
  await p.evaluate(()=>localStorage.removeItem('parallens-demo-actions-v1'));await p.reload();await ready();await p.getByRole('button',{name:'问题登记',exact:true}).click();
  await form().locator('[name=owner]').fill('不适用范围测试');await form().locator('[name=note]').fill('不应生成新基线');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  check((await form().locator('.action-receipt').innerText()).includes('暂不能新建问题单')&&await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===null,'A new issue was saved with an inapplicable activation baseline');
  await open({deviceModel:'K6'});check(await p.evaluate(()=>metric(13).kind)==='rate','Valid bird activation does not recover');await p.goBack();await ready();check(await p.evaluate(()=>metric(13).kind)==='na','Back navigation revives a fake hunting value');
  check(!errors.length,errors.join('; '));return{status:'PASS',results,legacyBaselineAndDraft:true,newIssueBlocked:true,validBindingAndBirdActivation:true};
 }finally{await context.close();}
}
