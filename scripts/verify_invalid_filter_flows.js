// Isolated records: invalid shared conditions cannot become unfiltered business evidence.
async (parent) => {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.setDefaultTimeout(8000);
  p.on('pageerror',error=>errors.push(error.message));
  p.on('dialog',dialog=>dialog.accept());
  const settle=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
  const open=async route=>{await p.goto(`${base}#/${route}`);await settle();};
  const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
  const blocked=async(expected)=>{
    await p.locator('.filter-error-notice').waitFor();
    const state=await p.evaluate(()=>({errors:filterErrors.map(e=>e.key),
      allBlocked:Object.values(dataset.metrics).every(m=>m.kind==='na'&&m.availability==='invalid-filter'),
      evidence:document.querySelectorAll('.home-results,.detail-kpis,.detail-chart,.detail-finding,.income-workspace,.action-record,.issue-register').length,
      open:document.querySelector('.filter-bar').open,
      overflow:document.documentElement.scrollWidth>innerWidth}));
    check(state.errors.sort().join(',')===[...expected].sort().join(','),`Wrong invalid conditions: ${JSON.stringify(state)}`);
    check(state.allBlocked&&state.evidence===0&&state.open&&!state.overflow,`Invalid range exposes evidence: ${JSON.stringify(state)}`);
    const notice=await p.locator('.filter-error-notice').innerText();
    check(notice.includes('本地问题记录不改写')&&notice.includes('当前会话草稿保留'),'Recovery notice omits record preservation');
  };
  try {
    await open('E?country=FR');await blocked(['country']);
    check(new URL(p.url()).hash.includes('country=FR'),'Invalid shared condition was removed');
    check(await p.locator('select[name="country"]').inputValue()==='FR','Invalid country is presented as All');
    await p.locator('.filter-error-notice').getByRole('button',{name:'修正国家/市场',exact:true}).click();
    check(await p.locator('select[name="country"]').evaluate(n=>n===document.activeElement),'Correction has no keyboard destination');
    await p.screenshot({path:'output/playwright/v94-invalid-scope-'+process.argv[2]+'.png'});
    await p.locator('select[name="country"]').selectOption('US');await settle();
    check(await p.evaluate(()=>metric(35).value.monthlySubscriptionPayers)===6500,'Correction does not calculate the selected market');
    check(await p.locator('.filter-error-notice').count()===0,'Correction leaves a stale block');
    await p.screenshot({path:'output/playwright/v94-corrected-us-'+process.argv[2]+'.png'});
    await p.goBack();await settle();await blocked(['country']);
    await p.goForward();await settle();
    check(await p.evaluate(()=>metric(35).value.monthlySubscriptionPayers)===6500,'Forward loses corrected scope');
    await p.reload();await settle();
    check(await p.locator('select[name="country"]').inputValue()==='US','Refresh drops corrected scope');
    results.push('direct invalid scope, keyboard correction, history and refresh');

    await open('E?country=FR&productLine=Bird&appPlatform=Windows&metric=35&panel=data');await blocked(['country','appPlatform']);
    await p.getByRole('button',{name:'清除国家/市场条件',exact:true}).click();await settle();await blocked(['appPlatform']);
    check(new URL(p.url()).hash.includes('appPlatform=Windows')&&new URL(p.url()).hash.includes('productLine=Bird'),'Partial clearing drops another condition');
    await p.locator('select[name="appPlatform"]').selectOption('Android');await settle();
    check(await p.evaluate(()=>filterState.productLine==='Bird'&&filterState.appPlatform==='Android'&&!filterErrors.length),'Compound recovery uses another range');
    check(await p.locator('#E-tab-data').getAttribute('aria-selected')==='true','Recovery drops selected evidence view');
    check(await stored()===null,'Recovery silently saves a new issue');
    results.push('compound errors, partial clearing, corrected evidence view and no implicit record');

    const controls=await p.evaluate(()=>Object.entries(sourceData.filterPolicy.controls).map(([key,c])=>[key,c.pages[0]]));
    for(const [key,page] of controls) {
      await open(`${page}?${key}=not-a-business-value`);await blocked([key]);
    }
    await open('?country=FR');await blocked(['country']);
    await p.reload();await settle();await blocked(['country']);
    results.push(`all ${controls.length} business controls and homepage invalid scope`);

    for(const query of ['country=','country=US&country=FR']) {
      await open(`E?${query}`);await blocked(['country']);
      check((await p.locator('select[name="country"] option:checked').innerText()).startsWith('无效：'),'Invalid requested value looks selected and valid');
      await p.getByRole('button',{name:'清除国家/市场条件',exact:true}).click();await settle();
      check(await p.evaluate(()=>metric(35).value.monthlySubscriptionPayers)===10000,'Explicit clearing does not restore default market');
    }
    await open('D?plan=Free&productLine=Hunting&metric=18');await blocked(['plan']);
    await p.locator('select[name="country"]').selectOption('US');await settle();await blocked(['plan']);
    check(new URL(p.url()).hash.includes('plan=Free'),'Unrelated correction silently drops incompatible plan');
    await p.locator('select[name="productLine"]').selectOption('Bird');await settle();
    check(await p.evaluate(()=>filterState.plan==='Free'&&!filterErrors.length),'Parent correction cannot make requested child valid');
    await open('D?plan=Free&productLine=Bird');
    if(!await p.locator('.filter-bar').evaluate(n=>n.open))await p.locator('.filter-bar summary').click();
    await p.locator('select[name="productLine"]').selectOption('Hunting');await settle();
    check(!await p.evaluate(()=>filterState.plan||filterErrors.length),'Normal dependent reset changed');
    await open('D?productLine=Wrong&deviceModel=Hunt%20Pro');await blocked(['productLine']);
    results.push('empty and repeated values, order-independent combinations and existing valid dependency reset');

    await open('E?country=FR&appPlatform=Windows');await blocked(['country','appPlatform']);
    await p.locator('.sidebar-nav [data-page="D"]').click();await settle();await blocked(['country','appPlatform']);
    await p.locator('#open-metric-search').click();
    await p.locator('#metric-search-input').fill('MRR');
    await p.locator('.metric-search-result').click();await settle();await blocked(['country','appPlatform']);
    check(new URL(p.url()).hash.includes('metric=3'),'Blocked scope makes metric lookup unusable');
    await p.getByRole('button',{name:'重置全部',exact:true}).click();await settle();
    check(await p.locator('.filter-error-notice').count()===0&&!await p.evaluate(()=>Object.keys(filterState).length),'Explicit reset does not recover');
    check(await stored()===null,'Blocked navigation created a local issue');
    results.push('supported conditions survive topic navigation and metric search; explicit reset');

    await open('E?country=US&metric=35&issue=35');
    const form=p.locator('.action-record');await form.waitFor();
    const baseline=await form.locator(':scope > .table-note').first().innerText();
    await form.locator('[name="owner"]').fill('筛选验收演示');
    await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
    const saved=await stored();check(saved,'Test record was not saved');
    await form.locator('[name="note"]').fill('未保存核查草稿');
    await p.evaluate(()=>{location.hash='#/E?country=FR&metric=35&issue=35';});await settle();await blocked(['country']);
    check(await stored()===saved,'Invalid range changes saved records');
    await p.goBack();await settle();await form.waitFor();
    check(await form.locator('[name="note"]').inputValue()==='未保存核查草稿','Invalid scope discards an existing draft');
    check(await form.locator(':scope > .table-note').first().innerText()===baseline,'Invalid scope rewrites historical baseline');
    check(await stored()===saved,'History restoration silently saves the draft');
    results.push('saved records, immutable baseline and unsaved draft survive blocked history');

    // Valid conditions can legitimately lack data; they must not become invalid-scope errors.
    await open('C?country=US');
    check(await p.locator('.filter-error-notice').count()===0&&await p.evaluate(()=>metric(42).availability==='pending'),'Pending facts are mistaken for invalid filtering');
    await open('E?country=All&tracking=unknown');
    check(await p.evaluate(()=>!filterErrors.length&&metric(35).value.monthlySubscriptionPayers===10000),'Neutral All or non-filter parameters are blocked');
    await open('E?country=US&firmware=unknown');
    check(await p.evaluate(()=>!filterErrors.length&&metric(35).value.monthlySubscriptionPayers===6500),'Another topic field changed existing applicability');
    results.push('valid pending data, neutral All, unrelated parameters and page-only fields');

    for(const width of [1100,1366,1600,1920]) {
      await p.setViewportSize({width,height:900});await open('E?country=FR&appPlatform=Windows');await blocked(['country','appPlatform']);
    }
    await p.evaluate(()=>document.documentElement.style.fontSize='24px');
    await blocked(['country','appPlatform']);
    const long='x'.repeat(300);await open(`E?country=${long}`);await blocked(['country']);
    results.push('four desktop widths, enlarged text and long invalid values');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:results};
  } finally {await context.close();}
}
