// Isolated business journey: signal → grouped evidence → sample → saved action.
async(page)=>{
 const base=new URL('.',page.url()).href;
 const context=await page.context().browser().newContext({locale:'zh-CN',reducedMotion:'reduce'}),p=await context.newPage();
 const errors=[],results=[],check=(ok,message)=>{if(!ok)throw new Error(message);};
 p.on('pageerror',error=>errors.push(error.message));
 const contribution=()=>p.locator('#D-panel-groups .evidence-pair').filter({has:p.getByRole('heading',{name:'转正率变化 · 互斥分组贡献',exact:true})});
 const verifyNumbers=async()=>{
  const actual=await contribution().locator('.detail-chart').evaluate(node=>{
   const option=echarts.getInstanceByDom(node).getOption();
   const rows=sourceData.trialFacts.records.filter(row=>(!filterState.country||row.country===filterState.country)&&
    (!filterState.productLine||row.product_line===filterState.productLine));
   const previous=rows.filter(row=>row.period==='previous'),current=rows.filter(row=>row.period==='current');
   const target=row=>row.product_line==='Bird'&&row.app_platform==='Android'&&row.plan==='Plus'&&row.billing_cycle==='monthly';
   const groups=[target,row=>!target(row)].filter(matches=>rows.some(matches));
   const converted=list=>list.filter(row=>row.converted).length;
   const expected=groups.map(matches=>(converted(current.filter(matches))/current.length-converted(previous.filter(matches))/previous.length)*100);
   return {values:option.series[0].data.map(item=>typeof item==='number'?item:item.value),expected,
    overall:(converted(current)/current.length-converted(previous)/previous.length)*100,
    min:option.yAxis[0].min,max:option.yAxis[0].max,labels:option.xAxis[0].data,
    text:node.getAttribute('aria-label'),rect:node.getBoundingClientRect().toJSON()};
  });
  check(actual.values.length===actual.expected.length&&actual.values.every((value,i)=>Math.abs(value-actual.expected[i])<1e-9),'Chart contribution disagrees with raw trial records');
  check(Math.abs(actual.values.reduce((sum,value)=>sum+value,0)-actual.overall)<1e-9,'Disjoint groups do not reconcile to the overall rate change');
  check(actual.min<0&&actual.max===-actual.min,'Contribution axis excludes zero or uses unequal positive/negative scales');
  check(actual.text.includes('个百分点')&&actual.text.includes('pp表示百分点'),'Chart omits contribution units');
  return actual;
 };
 try{
  for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]){
   await p.setViewportSize({width,height});
   for(const [id,code] of [[13,'A'],[18,'D']]){
    await p.goto(base);await p.locator('#trendChart svg').waitFor();
    const signal=p.locator(`.home-signal[data-metric-id="${id}"]`);await signal.focus();await signal.press('Enter');
    const link=p.locator('.home-comparison-context .insight-link');
    check((await link.getAttribute('href')).includes('panel=groups'),'Grouped evidence CTA lacks its panel destination');
    await link.focus();await link.press('Enter');await p.locator(`#${code}-panel-groups`).waitFor();
    check(await p.locator(`#${code}-tab-groups`).getAttribute('aria-selected')==='true','Grouped evidence CTA opens the wrong tab');
    check(p.url().includes(`metric=${id}`)&&await p.locator(`#metric-evidence-${id}`).isVisible(),'CTA loses the selected metric');
    if(code==='D'){
     await contribution().locator('svg').waitFor();const values=await verifyNumbers();
     check(Math.abs(values.values[0]+1.6)<1e-9&&Math.abs(values.values[1])<1e-9,'Default story does not reconcile to −1.6pp and 0pp');
     const table=p.locator('#trial-contribution');
     check(await table.isVisible()&&(await table.locator('caption').innerText()).includes('观鸟'),'Observation group calculation remains hidden or mixes product lines');
     const text=await table.innerText();check(text.includes('1,746')&&text.includes('534')&&text.includes('54')&&text.includes('66'),'Observation group does not match 194→178 converted and 6→22 failures per week');
     check((await p.locator('.detail-finding').innerText()).includes('观鸟 Android Plus月付组'),'Observation omits product-line scope');
     check(values.rect.width>400&&values.rect.height>140,'Contribution chart is too small to read');
    }
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Journey introduces desktop overflow');
    results.push({id,width,height,url:p.url()});
   }
  }
  await p.locator('.filter-bar summary').click();await p.getByLabel('国家/市场',{exact:true}).selectOption('US');
  await contribution().locator('svg').waitFor();await verifyNumbers();
  await p.getByLabel('产品线',{exact:true}).selectOption('Hunting');await contribution().locator('svg').waitFor();
  const hunting=await verifyNumbers();check(hunting.labels.length===1&&!hunting.labels[0].includes('观鸟'),'Hunting scope fabricates an absent Bird group');
  await p.goto(`${base}#/D?metric=18&panel=groups&week=12`);await p.locator('#D-panel-groups').waitFor();
  check(await contribution().count()===0,'Selected week retains a stale multi-period contribution');
  const selectedWeek=p.locator('#D-panel-groups .workspace-chart-panel').filter({has:p.getByRole('heading',{name:'成熟试用转正率 · 所选W12',exact:true})});
  check(await selectedWeek.count()===1&&(await selectedWeek.innerText()).includes('所选完整周的转正人数')&&!(await selectedWeek.innerText()).includes('前9周与近3周'),'Selected-week evidence retains an unrelated period description');
  await p.goto(`${base}#/D?metric=18&panel=groups`);await contribution().locator('svg').waitFor();
  await p.locator('.workspace-locations').getByRole('button',{name:'成熟试用记录 · 支付失败样本',exact:true}).click();
  await p.locator('.trial-sample-item').first().click();
  const form=p.locator('.action-record'),note=form.locator('[name=note]');
  check((await form.locator('[name=linkedSample]').inputValue()).includes('SIM-W12-0178'),'Selected payment failure does not link its source record');
  await form.locator('[name=owner]').fill('经营核查');
  await note.fill('核对支付回执与重试结果；分组贡献不作因果结论');
  const baseline=await form.locator(':scope > .table-note').first().innerText();
  await p.locator('#D-tab-data').click();await p.locator('#D-tab-groups').click();
  check((await note.inputValue()).includes('不作因果结论'),'Evidence tab changes discard the draft');
  await form.getByRole('button',{name:'保存本地记录',exact:true}).click();await p.reload();await form.waitFor();
  check((await note.inputValue()).includes('不作因果结论')&&p.url().includes('panel=groups')&&p.url().includes('issue=18'),'Reload loses saved action or evidence context');
  check(await form.locator(':scope > .table-note').first().innerText()===baseline,'Registration loses its historical metric baseline');
  for(const code of ['A','B','C','D','E','F','G']){
   const id=await p.evaluate(code=>sourceData.diagnostics[code].heroIds[0],code);
   for(const panel of ['groups','data']){
    await p.goto(`${base}#/${code}?metric=${id}&panel=${panel}`);await p.locator(`#${code}-panel-${panel}`).waitFor();
    if(!await p.getByLabel('国家/市场',{exact:true}).isVisible())await p.locator('.filter-bar summary').click();
    await p.getByLabel('国家/市场',{exact:true}).selectOption('US');
    check(await p.locator(`#${code}-tab-${panel}`).getAttribute('aria-selected')==='true'&&p.url().includes(`metric=${id}`)&&p.url().includes(`panel=${panel}`),`${code} filter resets explicit metric or evidence panel`);
    check(await p.getByLabel('国家/市场',{exact:true}).evaluate(node=>node===document.activeElement),`${code} filter loses focus`);
    await p.goBack();await p.locator(`#${code}-panel-${panel}`).waitFor();
    check(await p.getByLabel('国家/市场',{exact:true}).inputValue()==='All',`${code} back loses the prior filter`);
    await p.goForward();await p.locator(`#${code}-panel-${panel}`).waitFor();
    check(await p.getByLabel('国家/市场',{exact:true}).inputValue()==='US'&&await p.locator(`#${code}-tab-${panel}`).getAttribute('aria-selected')==='true',`${code} forward loses filter or panel`);
   }
  }
  // Keep overall counts intact but make one current group too small for publication.
  await p.evaluate(()=>{
   let retained=0;
   sourceData.trialFacts.records=sourceData.trialFacts.records.map(row=>row.period==='current'&&row.product_line==='Bird'&&row.app_platform==='Android'&&row.plan==='Plus'&&row.billing_cycle==='monthly'&&++retained>10?{...row,app_platform:'iOS'}:row);
  });
  await p.goto(`${base}#/D?metric=18&panel=groups&probe=sparse`);await p.locator('#D-panel-groups').waitFor();
  check(await contribution().count()===0&&(await p.locator('#D-panel-groups').innerText()).includes('成熟样本不足30人'),'Sparse group fabricates a reliable contribution or a zero');
  check(errors.length===0,errors.join('; '));
  return {status:'PASS',results,checks:['keyboard signal and grouped destination at 3 desktop sizes','correct metric and panel URL','raw-record contribution closure','zero-centered signed axis and units','Bird scope matches observation and payment table','desktop readability','country recomputation','absent group omitted','selected-week comparison suppressed','linked sample and draft','saved action and baseline reload','all 7 pages retain explicit metric and group/data panel through filter, focus, back/forward','sparse group withheld'],baseline};
 }finally{await context.close();}
}
