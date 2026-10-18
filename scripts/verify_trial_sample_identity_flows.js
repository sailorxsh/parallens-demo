// A failure sample's business identity stays visible; association never replaces evidence silently.
async(parent)=>{
 const base=new URL('.',parent.url()).href,states=[],errors=[];
 const legacy=JSON.parse(fs.readFileSync('scripts/fixtures/trial-sample-before-guard.json','utf8'));
 const source=await(await parent.request.get(`${base}data/trial-facts.json`)).json();
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage();
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
 const open=async(query='')=>{await p.goto(`${base}#/D?metric=18&panel=groups${query?'&'+query:''}`);await ready();};
 const panel=()=>p.locator('.trial-samples'),form=()=>p.locator('.action-record'),field=name=>form().locator(`[name=${name}]`);
 const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const clickSample=async index=>{const b=panel().locator('button.trial-sample-item').nth(index);await b.focus();await b.press('Enter');};
 const save=()=>form().getByRole('button',{name:'保存本地记录',exact:true}).click();
 const scopeCases=[{}, {week:'1'}, {country:'US',appPlatform:'Android',subscriptionPlatform:'Web'},
  {appPlatform:'iOS',subscriptionPlatform:'Web'}, {subscriptionPlatform:'Web'}, {productLine:'Hunting'}];
 try{
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});
   for(const scope of scopeCases){
    await open(new URLSearchParams(scope).toString());await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
    const names={appPlatform:'app_platform',subscriptionPlatform:'subscription_platform',productLine:'product_line'};
    const records=source.records.filter(r=>r.week===Number(scope.week??12)&&r.payment_status==='failed'&&
     Object.entries(scope).every(([k,v])=>k==='week'||r[names[k]??k]===v)).slice(0,5);
    const buttons=panel().locator('.trial-sample-item');check(await buttons.count()===records.length,'Failure samples differ from the selected source');
    for(let i=0;i<records.length;i++){
     const r=records[i],b=buttons.nth(i),text=await b.innerText();
     for(const part of [r.trial_id,r.app_platform,r.subscription_platform,r.plan,r.billing_cycle==='monthly'?'月付':'年付',r.outcome_observed_through,
      {US:'美国',UK:'英国',DE:'德国',Other:'其他'}[r.country],{Bird:'观鸟',Hunting:'狩猎'}[r.product_line]])
      check(text.includes(part),`Sample ${r.trial_id} conceals or invents ${part}`);
     check(await b.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Sample business identity is clipped');
    }
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sample metadata overflows the desktop');
    if(!Object.keys(scope).length&&(width===1600||font===32)){
     await p.getByRole('navigation',{name:'分组证据定位',exact:true}).getByRole('button',{name:'成熟试用记录 · 支付失败样本',exact:true}).click();
     await p.screenshot({path:`output/playwright/v138-sample-identity-${font}.png`});
    }
    states.push({width,font,scope,ids:records.map(r=>r.trial_id)});
   }
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});
  await p.evaluate(records=>localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(records)),legacy.records);
  await p.reload();await ready();await open();const before=await stored();
  const old=Object.values(legacy.records)[0],first=old.linkedSample;
  await clickSample(1);
  check(await field('linkedSample').inputValue()===first&&await field('note').inputValue()===old.note,'Another sample silently replaces an existing association or its note');
  check(await stored()===before,'Selecting a conflicting sample mutates the saved record');
  check((await panel().locator('.trial-sample-feedback').innerText()).includes('未覆盖')&&
   (await p.locator('#announcement').textContent()).includes('未覆盖'),'Rejected association lacks visible and announced feedback');
  check(await field('linkedSample').evaluate(n=>n===document.activeElement),'Protected association loses its review field focus');
  check(!(await form().locator('.action-stage-badge').innerText()).includes('未保存'),'Blocked association creates a fake unsaved change');
  await clickSample(0);
  check((await panel().locator('.trial-sample-feedback').innerText()).includes('再次选择未修改记录')&&await stored()===before,'Repeated selection mutates an already linked record');
  check(!(await form().locator('.action-stage-badge').innerText()).includes('未保存'),'Repeated association dirties a saved record');
  await field('note').fill('核查草稿保留原支付记录');await clickSample(1);
  check(await field('note').inputValue()==='核查草稿保留原支付记录'&&await field('linkedSample').inputValue()===first,'Conflict discards an unsaved draft');
  await p.locator('#D-tab-data').click();await p.locator('#D-tab-groups').click();
  check(await field('note').inputValue()==='核查草稿保留原支付记录','Evidence navigation loses a protected draft');
  await save();
  await form().scrollIntoViewIfNeeded();await p.screenshot({path:'output/playwright/v138-sample-protected-record.png'});
  // The user can deliberately clear the field and associate another row, without auto-saving.
  await field('linkedSample').fill('');await field('note').fill('人工核对后改查Web支付样本');
  const previous=await stored();await clickSample(2);
  check((await field('linkedSample').inputValue()).startsWith('SIM-W12-0180')&&await stored()===previous,'Explicit empty-field association fails or auto-saves');
  check(await field('note').inputValue()==='人工核对后改查Web支付样本','New association overwrites user-authored notes');
  await save();await p.reload();await ready();
  check((await field('linkedSample').inputValue()).startsWith('SIM-W12-0180'),'Intentional saved association is lost on reload');
  const saved=Object.values(JSON.parse(await stored()))[0];
  for(const key of ['issueId','scope','filters','baseline','baselineAt','comparisonEvidence'])
   check(JSON.stringify(saved[key])===JSON.stringify(old[key]),`Association changes historical ${key}`);
  // Selecting a payment sample cannot discard another metric's draft.
  await p.goto(`${base}#/D?metric=52&issue=52&panel=groups`);await ready();
  await field('note').fill('风险指标草稿保持独立');await clickSample(0);
  check(await field('issueMetric').inputValue()==='18'&&(await field('linkedSample').inputValue()).startsWith('SIM-W12-0180'),'Existing trial association overwritten while switching from another issue');
  await field('issueMetric').selectOption('52');check(await field('note').inputValue()==='风险指标草稿保持独立','Sample linkage destroys another metric draft');
  await clickSample(0);
  await p.setViewportSize({width:1366,height:1000});await p.evaluate(()=>document.documentElement.style.fontSize='32px');
  await clickSample(0);
  const enlarged=await field('linkedSample').boundingBox();
  check(enlarged.y>=0&&enlarged.y+enlarged.height<=1000,'Enlarged sample association does not reveal the focused field');
  check(await p.locator('.income-context').evaluate(n=>getComputedStyle(n).position==='static'&&getComputedStyle(n).maxHeight==='none'),'Two-column height limit clips the enlarged stacked form');
  check((await field('linkedSample').inputValue()).startsWith('SIM-W12-0180'),'Enlarged selection bypasses association protection');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Enlarged association creates page overflow');
  await p.screenshot({path:'output/playwright/v138-sample-enlarged-association.png'});
  check(!errors.length,`Runtime errors: ${errors.join('; ')}`);
  return {status:'PASS',states,checks:['source-backed product and subscription identity','24 desktop and 200% states','legacy association conflict','idempotent repeat selection','manual replacement stays a draft','original baseline and comparison snapshot','cross-metric draft preservation']};
 }finally{await c.close();}
}
