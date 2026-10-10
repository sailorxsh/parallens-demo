// Isolated local records: actual metric scope, UI grouping, and immutable historical baselines.
async (parent) => {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const form=()=>p.locator('.action-record');
  const open=async(route)=>{
    await p.goto(`${base}#/${route}`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
    if(!await form().isVisible())await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
    await form().waitFor();
  };
  const records=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('parallens-demo-actions-v1')||'{}'));
  const baseline=()=>form().locator(':scope > .table-note').first().innerText();
  const scope=()=>form().locator('.action-scope').innerText();
  try {
    await open('E?metric=39&issue=39&appPlatform=iOS&panel=groups');
    check((await scope()).includes('总体 · 默认业务对象')&&(await scope()).includes('未参与计算：App平台 iOS'),'Ignored platform is presented as a cohort');
    check(!(await baseline()).includes('iOS'),'UI condition still contaminates historical baseline label');
    check(await form().getAttribute('aria-describedby')===await form().locator('.action-scope').getAttribute('id'),'Form lacks accessible range context');
    await form().locator('[name="owner"]').fill('总体型号核查');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    const saved=await records(),key=Object.keys(saved)[0],original=saved[key],originalText=await baseline();
    check(key==='record:E:App平台：iOS:39'&&original.scope==='App平台：iOS'&&original.filters.appPlatform==='iOS','Existing record identity or filter metadata changed');
    await p.reload();await form().waitFor();
    check(await baseline()===originalText&&JSON.stringify(await records())===JSON.stringify(saved),'Reload rewrites the saved baseline or record');
    check((await scope()).includes('未参与计算：App平台 iOS'),'Reload loses actual range');
    await p.locator('.income-workspace').screenshot({path:'output/playwright/v74-after-01-ignored-scope.png'});
    results.push('ignored platform, semantic scope, existing key and reload');
    await open('E?metric=39&issue=39&country=US&appPlatform=iOS&panel=groups');
    check((await scope()).includes('国家/市场：美国')&&(await scope()).includes('未参与计算：App平台 iOS'),'Applied and ignored dimensions are mixed');
    await form().locator('[name="owner"]').fill('美国型号核查');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    await open('E?metric=39&issue=39&appPlatform=iOS&panel=groups');
    check(await form().locator('[name="owner"]').inputValue()==='总体型号核查','Applied cohort overwrote another record');
    await open('E?metric=39&issue=39');
    check(await form().locator('[name="owner"]').inputValue()==='','Different UI grouping silently merges existing records');
    check(await form().locator('.action-scope-ignored').count()===0,'Default scope displays a spurious ignored dimension');
    await open('E?metric=39&issue=39&appPlatform=iOS&panel=groups');
    results.push('mixed applied/ignored dimensions and preserved record separation');
    await p.evaluate(()=>{
      sourceData.modelMarket.records.filter(row=>row.model==='Bird Pro').forEach(row=>row.subscribedOwners=0);
      renderRoute({preserveScroll:true});
    });
    await form().waitFor();
    check((await baseline())===originalText,'Same-period source update silently replaces history');
    const samePeriod=await form().locator('.action-baseline-note').innerText();
    check(samePeriod.includes('当前数据与登记基线不同')&&samePeriod.includes('K6')&&samePeriod.includes('17.0%'),'Same-period value change has no current-data comparison');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check((await records())[key].baseline===original.baseline&&(await records())[key].baselineAt===original.baselineAt,'Save replaces immutable historical baseline');
    await p.locator('.income-workspace').screenshot({path:'output/playwright/v74-after-02-history-comparison.png'});
    results.push('changed current value without changed period, save retains history');
    await p.evaluate(()=>{sourceData.snapshot.asOf='2026-09-25';renderRoute({preserveScroll:true});});
    check((await form().locator('.action-baseline-note').innerText()).includes('快照 2026-09-25'),'New snapshot lacks explicit current period');
    check((await baseline()).includes('2026-09-24'),'New period overwrites recorded date');
    await p.reload();await form().waitFor();
    check(await form().locator('.action-baseline-note').count()===0,'Restored data retains an obsolete difference warning');
    results.push('changed period and restored same baseline');
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:1000});
      check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Scope context causes desktop overflow');
      await form().getByRole('button',{name:'保存本地记录',exact:true}).focus();await p.keyboard.press('Enter');
      check(await form().locator('.action-receipt').getAttribute('data-state')==='saved','Keyboard save is blocked');
    }
    results.push('three desktop widths and keyboard save');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:results};
  } finally {await context.close();}
}
