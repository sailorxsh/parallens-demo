// Compare all published metric descriptions to real page controls and source contracts.
async(parent)=>{
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:900},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const read=async name=>{const response=await parent.request.get(`${base}data/${name}.json`);check(response.ok(),`Source unavailable: ${name}`);return response.json();};
  const [contract,policy,diagnostics]=await Promise.all(['filter-contract','filter-policy','diagnostics'].map(read));
  const entityNames={'用户Cohort':'新注册用户批次','试用Cohort':'试用用户批次','Eligible用户Cohort':'符合条件的主账号批次',
    'Owner用户':'主账号','设备Cohort':'新激活设备批次','Session':'会话'};
  const cases=new Map(contract.map(item=>[`${item.page}:${item.id}`,[item.page,item.id]]));
  for(const [page,data] of Object.entries(diagnostics))for(const id of data.heroIds)cases.set(`${page}:${id}`,[page,id]);
  try{
    for(const [page,id] of cases.values()){
      await p.goto(`${base}#/${page}?metric=${id}&panel=data`);
      const evidence=p.locator(`#metric-evidence-${id}`);await evidence.waitFor();
      const bar=p.locator('.filter-bar');if(!await bar.evaluate(node=>node.open))await bar.locator('summary').click();
      const controlLabels=await bar.locator('select').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.name,node.getAttribute('aria-label')])));
      const controls=Object.keys(controlLabels);
      const source=contract.find(item=>item.id===id),capabilities=policy.metrics.find(item=>item.id===id);
      const expected=capabilities.demonstrableDimensions.filter(key=>controls.includes(key)).map(key=>controlLabels[key]).sort();
      const text=await evidence.locator('> .evidence-meta').innerText();
      const match=text.match(/本指标可演示筛选：([^。]*)。/);
      check(!!match,`Missing current-metric capability description #${id} on ${page}`);
      const actual=match[1]==='无'?[]:match[1].split('、').sort();
      check(JSON.stringify(actual)===JSON.stringify(expected),`Unavailable controls advertised #${id} on ${page}: ${JSON.stringify({actual,expected})}`);
      check(text.includes(`统计对象：${entityNames[source.entity]??source.entity} · 窗口：${source.window}`),`Entity or observation window changed incorrectly #${id}`);
      results.push({page,id,actual,controls});
    }
    for(const [page,id,missing,demonstrable] of [['A',13,'season',false],['B',27,'deviceStatus',true],['G',53,'season',true]]){
      await p.goto(`${base}#/${page}?metric=${id}&panel=data`);
      await p.locator(`#metric-evidence-${id}`).waitFor();
      const raw=await p.evaluate(({id,missing})=>policyFor(id).demonstrableDimensions.includes(missing),{id,missing});
      check(raw===demonstrable,'Capability contradicts the source: natural-season attribution is absent from onboarding facts; the other hidden page controls retain their source slices');
      check(!await p.locator('.filter-bar').locator(`select[name="${missing}"]`).count(),'Fix silently expanded filter behavior');
    }
    // A page control with missing data remains a business filter, not a usable measured scope.
    await p.goto(`${base}#/C?metric=42&country=US&panel=data`);
    await p.locator('#metric-evidence-42').waitFor();
    check(await p.evaluate(()=>metric(42).availability)==='pending','Missing device geography became a measured number');
    check((await p.locator('#metric-evidence-42 > .evidence-meta').innerText()).includes('本指标可演示筛选：设备型号'),'Supported device dimensions disappeared in a pending scope');
    for(const width of [1366,1600,1920])for(const [page,id] of [['A',13],['B',27],['G',53],['F',48]]){
      await p.setViewportSize({width,height:900});
      await p.goto(`${base}#/${page}?metric=${id}`);await p.locator(`#metric-evidence-${id}`).waitFor();
      check(!await p.locator(`#metric-evidence-${id} > .evidence-meta`).evaluate(node=>node.scrollWidth>node.clientWidth+1),'Capability description overflows');
      check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Page overflows after localization');
      if(width===1600){await p.locator(`#metric-evidence-${id}`).scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/v96-capability-${page}.png`});}
    }
    await p.goto(`${base}#/F?metric=48`);await p.locator('#metric-evidence-48').waitFor();
    await p.locator('.detail-kpi[data-metric-id="48"] .detail-select').click();
    check((await p.locator('.metric-inspector-content').innerText()).includes('主账号'),'Metric summary retains untranslated entity');
    check(!(await p.locator('.metric-inspector-content').innerText()).includes('Owner用户'),'Metric summary contradicts localized evidence');
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['all 53 metric owners and shared page placements','capabilities match actual page controls',
      'source contracts and observation windows preserved','business filters and missing-data states preserved',
      'three desktop widths','Chinese entities consistent in summary and evidence'],results};
  }finally{await context.close();}
}
