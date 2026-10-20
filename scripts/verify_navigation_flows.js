// Run with playwright-cli run-code --filename=scripts/verify_navigation_flows.js.
async (page) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  try {
    await p.goto(`${base}#/G`);
    await p.waitForFunction(()=>document.querySelector('#main[aria-busy="false"] .detail-shell'));
    await p.evaluate(()=>{
      const original=renderRoute;
      window.__navigationRenders=[];
      renderRoute=function(...args){window.__navigationRenders.push(location.hash);return original(...args);};
    });
    const reset=()=>p.evaluate(()=>{window.__navigationRenders=[];});
    const verify=async(label,hash,count=1)=>{
      await p.waitForFunction(expected=>location.hash===expected&&lastRenderedHash===expected,hash);
      await p.waitForTimeout(100);
      const renders=await p.evaluate(()=>window.__navigationRenders);
      if(count!==null)check(renders.length===count,`${label} rendered ${renders.length} times: ${renders.join(', ')}`);
      check(await p.locator('h1').count()===1,`${label} lost the visible page`);
      results.push({label,hash,renders:renders.length});
    };
    for(const code of ['D','A','C','D']) {
      await reset();await p.locator(`.sidebar-nav a[data-page="${code}"]`).click();
      await verify(`Navigate ${code}`,`#/${code}`);
    }
    await reset();await p.locator('.sidebar-nav a[data-page="D"]').click();
    await verify('Repeat current navigation','#/D',0);
    await p.locator('.filter-bar summary').click();
    await reset();await p.getByLabel('国家/市场',{exact:true}).selectOption('US');
    await verify('Country filter','#/D?country=US');
    check(await p.evaluate(()=>document.activeElement.name==='country'),'Filter lost focus');
    await reset();await p.getByLabel('产品线',{exact:true}).selectOption('Bird');
    const filtered=p.url().split('#')[1];
    await verify('Product filter',`#${filtered}`);
    await reset();await p.goBack();
    await verify('Back to previous filter','#/D?country=US');
    check(await p.getByLabel('产品线',{exact:true}).inputValue()==='All','Back retained a stale product filter');
    await reset();await p.goForward();
    await verify('Forward restores filters',`#${filtered}`);
    check(await p.getByLabel('产品线',{exact:true}).inputValue()==='Bird','Forward discarded the product filter');
    await reset();await p.getByRole('button',{name:'重置全部',exact:true}).click();
    await verify('Reset filters','#/D');
    check(await p.evaluate(()=>document.activeElement.classList.contains('filter-reset')),'Reset lost focus');
    await reset();await p.goto(`${base}#/C?metric=42`);
    await verify('Direct metric URL','#/C?metric=42');
    await p.waitForFunction(()=>{const r=document.querySelector('#metric-evidence-42').getBoundingClientRect(),max=document.documentElement.scrollHeight-innerHeight;return r.top<innerHeight/2&&(r.top<120||scrollY>=max-1)&&document.activeElement===document.querySelector('#metric-evidence-42 h2');});
    await reset();await p.evaluate(()=>{location.hash='#/A';location.hash='#/G';location.hash='#/D?week=2';});
    await verify('Rapid route changes settle on the final view','#/D?week=2',null);
    const rapid=await p.evaluate(()=>window.__navigationRenders);
    check(rapid.length>=1&&rapid.length<=3&&new Set(rapid).size===rapid.length&&rapid.at(-1)==='#/D?week=2',
      `Rapid navigation repeated a view or failed to reach its final state: ${rapid.join(', ')}`);
    check(await p.locator('.topic-metric').count()===14&&(await p.locator('#topic-D-metric-17 .topic-window').innerText()).includes('W2'),'Rapid navigation rendered a stale overview');
    const qualitySource=(await (await parent.request.get(base+'data/diagnostics.json')).json()).G.qualityFacts;
    for(const width of [1366,1920]) {
      await p.setViewportSize({width,height:1000});
      await p.goto(`${base}#/`);await p.locator('.quality-status').waitFor();
      check(await p.locator('.quality-status').innerText()==='数据质量：演示正常 ↗','Overall quality lacks its demo qualification');
      await p.locator('.quality-status').focus();await p.keyboard.press('Enter');
      await p.locator('#metric-evidence-54').waitFor();
      check(p.url().endsWith('#/G?metric=54'),'Quality badge opens a different evidence metric');
      const threshold=await p.locator('.quality-threshold-note').innerText();
      check(threshold.includes('≤3.0%')&&threshold.includes('≥95.0%')&&threshold.includes('生产达标标准'),
        'Quality evidence does not explain its demonstration thresholds');
      for(const filters of ['country=US','appPlatform=iOS','appPlatform=Android','productLine=Bird']) {
        await p.goto(`${base}#/?${filters}`);await p.locator('.quality-status').waitFor();
        const pending=filters==='productLine=Bird';
        if(pending){
          check(await p.locator('.quality-status').innerText()==='数据质量：待补数据 ↗','Unavailable quality is shown as measured');
          check((await p.locator('#quality-status-description').innerText()).includes('缺少同范围明细'),'Missing quality data lacks its explanation');
          await p.locator('.quality-status').click();await p.locator('#metric-evidence-54 .na-note:visible').waitFor();
          check((await p.locator('#metric-evidence-54 .na-note:visible').innerText()).startsWith('待补数据：'),'Filtered quality evidence is presented as a measured result');
          check(await p.locator('#metric-evidence-54 .detail-chart[aria-label*="事件丢失率"]').count()===0,'Missing quality data retained the overall trend');
        }else{
          const [key,value]=filters.split('='),day=qualitySource.days.at(-1),events=day.eventGroups.filter(r=>r[key]===value),maps=day.mappingGroups.filter(r=>r[key]===value),sum=(rs,k)=>rs.reduce((n,r)=>n+r[k],0),lost=sum(events,'expected')-sum(events,'ingested'),expected=sum(events,'expected'),mapped=sum(maps,'mapped'),records=sum(maps,'records'),warning=lost/expected>qualitySource.thresholds.eventLossMax||mapped/records<qualitySource.thresholds.idMappingMin;
          check(await p.locator('.quality-status').innerText()===`数据质量：演示${warning?'预警':'正常'} ↗`,'Quality badge disagrees with independent source counts');
          await p.locator('.quality-status').click();await p.locator('#metric-evidence-54').waitFor();
          const got=await p.evaluate(()=>metric(54).value);check(got.eventLoss.numerator===lost&&got.eventLoss.denominator===expected&&got.idMapping.numerator===mapped&&got.idMapping.denominator===records,'Quality link loses independently counted scope');
        }
        check(p.url().includes(filters)&&p.url().includes('metric=54'),'Quality evidence lost filter scope');
        await p.locator('.sidebar-nav a[data-page=""]').click();await p.locator('.quality-status').waitFor();
        if(!await p.locator('.filter-bar').evaluate(node=>node.open))await p.locator('.filter-bar summary').click();
        await p.getByRole('button',{name:'重置全部',exact:true}).click();
        check(await p.locator('.quality-status').innerText()==='数据质量：演示正常 ↗','Reset did not restore overall quality');
      }
      check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Quality header overflows at desktop width');
    }
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['one render per navigation','same-view preservation','filter and reset focus','back and forward','direct evidence URL','rapid navigation final state',
      'quality badge matches available filter scope','keyboard quality evidence with demo thresholds','quality filter reset at two desktop widths'],results};
  } finally {await context.close();}
}
