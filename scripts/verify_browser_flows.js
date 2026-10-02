// Run with playwright-cli run-code --filename=scripts/verify_browser_flows.js.
async (page) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',page.url()).href;
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.locator('.home-signal').first().waitFor();
  const conversionSignal=page.locator('.home-signal[data-metric-id="18"]');
  await conversionSignal.focus();
  await page.keyboard.press('Enter');
  check(await conversionSignal.getAttribute('aria-pressed')==='true','Signal selection did not follow keyboard action');
  check(await conversionSignal.evaluate(node=>document.activeElement===node),'Signal selection lost keyboard focus');
  const focused=await page.locator('#trendChart').evaluate(node=>{
    const option=window.echarts.getInstanceByDom(node).getOption();
    return {count:option.series.length,last:option.series[0].data.at(-1),baseline:option.series[0].markLine.data[0].yAxis,span:option.yAxis[0].max-option.yAxis[0].min};
  });
  check(focused.count===1&&focused.last===43.4&&focused.baseline===45&&focused.span<5,'Conversion story chart is inconsistent or flattened');
  await page.getByRole('button',{name:'并列对照',exact:true}).click();
  check(await page.locator('#trendChart').evaluate(node=>window.echarts.getInstanceByDom(node).getOption().series.length)===2,'Overview lost one trend');
  await conversionSignal.click();
  await page.locator('.home-comparison-context .insight-link').click();
  await page.locator('#metric-evidence-18').waitFor();
  check(page.url().includes('#/D'),'Signal evidence did not open the corresponding topic');
  await page.goto(`${base}#/?productLine=Hunting`);
  await page.locator('.home-signal').first().waitFor();
  check(await page.locator('.home-signal').count()===1,'Unavailable Bird activation remained in Hunting scope');
  check(await page.locator('.home-signal').getAttribute('data-metric-id')==='18','Available trial story disappeared');
  await page.locator('.home-comparison-context .insight-link').click();
  await page.locator('#metric-evidence-18').waitFor();
  check(page.url().includes('productLine=Hunting'),'Signal evidence dropped supported product filter');
  await page.goto(`${base}#/D`);
  await page.reload();
  await page.getByRole('heading',{name:'订阅转化',exact:true}).waitFor();
  const initialURL=page.url();
  await page.getByRole('link',{name:'跳到主要内容',exact:true}).focus();
  await page.keyboard.press('Enter');
  check(page.url()===initialURL,'Skip link changed dashboard route');
  check(await page.evaluate(()=>document.activeElement.id==='main'),'Skip link did not focus content');
  await page.locator('.filter-bar summary').click();
  await page.getByLabel('国家/市场',{exact:true}).selectOption('US');
  check(await page.locator('.filter-bar').evaluate(node=>node.open),'Filter collapsed after change');
  check(await page.evaluate(()=>document.activeElement.name==='country'),'Country focus lost');
  await page.getByLabel('产品线',{exact:true}).selectOption('Hunting');
  await page.getByLabel('套餐',{exact:true}).selectOption('Starter');
  await page.getByLabel('产品线',{exact:true}).selectOption('Bird');
  check(!new URLSearchParams(new URL(page.url()).hash.split('?')[1]).has('plan'),'Invalid plan persisted');
  check(await page.evaluate(()=>document.activeElement.name==='productLine'),'Product focus lost');
  await page.keyboard.press('Control+k');
  await page.getByRole('searchbox').fill('MRR');
  check(await page.locator('.metric-search-result').count()===1,'MRR search is not unique');
  await page.keyboard.press('Enter');
  await page.locator('#metric-evidence-3').waitFor();
  check(page.url().includes('country=US')&&page.url().includes('productLine=Bird'),'Search dropped supported filters');
  check(!await page.locator('#metric-search').evaluate(node=>node.open),'Search remained open after selection');
  await page.keyboard.press('Control+k');
  await page.getByRole('searchbox').fill('没有这个指标xyz');
  check(await page.locator('.metric-search-result').count()===0,'Empty search incorrect');
  await page.keyboard.press('Escape');
  check(!await page.locator('#metric-search').evaluate(node=>node.open),'Escape did not close dialog');
  await page.getByRole('button',{name:'重置全部',exact:true}).click();
  check(await page.evaluate(()=>document.activeElement.classList.contains('filter-reset')),'Reset focus lost');
  await page.goBack();
  check(page.url().includes('country=US')&&page.url().includes('productLine=Bird'),'Back did not restore filters');
  await page.getByRole('button',{name:'重置全部',exact:true}).click();
  await page.locator('.filter-bar summary').click();
  await page.getByRole('button',{name:'全部指标',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.metric-inventory').getBoundingClientRect().top<110||innerHeight+scrollY>=document.documentElement.scrollHeight-2);
  await page.waitForFunction(()=>document.querySelector('.section-navigation-item[aria-current]')?.textContent==='全部指标');
  check(await page.locator('.section-navigation-item[aria-current]').innerText()==='全部指标','Section location incorrect');
  const priorFocus=await page.locator(':focus').elementHandle();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  check(await page.evaluate(node=>document.activeElement===node,priorFocus),'Dialog did not restore prior focus');
  const pages=[];
  for(const width of [1440,1920]) {
    await page.setViewportSize({width,height:1000});
    for(const code of ['','A','B','C','D','E','F','G']) {
      await page.locator(`.nav-link[data-page="${code}"]`).click();
      await page.waitForTimeout(600);
      await page.mouse.move(0,0);
      const state=await page.evaluate(()=>({
        overflow:document.documentElement.scrollWidth>innerWidth,
        headings:document.querySelectorAll('h1').length,
        charts:[...document.querySelectorAll('.detail-chart,#trendChart,.headline-sparkline')].filter(node=>{
          const rect=node.getBoundingClientRect();return rect.width>0&&rect.height>0;
        }).length,
      }));
      check(!state.overflow,`${code||'home'} overflows at ${width}`);
      check(state.headings===1,`${code||'home'} missing primary heading`);
      await page.screenshot({path:`output/playwright/final-${code||'home'}-${width}.png`,scale:'css'});
      pages.push({page:code||'home',width,...state});
    }
  }
  const probe=await page.context().newPage();
  try {
    await probe.emulateMedia({reducedMotion:'reduce'});
    await probe.route('**/data/trial-facts.json',async route=>{
      await new Promise(resolve=>setTimeout(resolve,800));await route.continue();
    });
    await probe.goto(`${base}#/D?country=US`,{waitUntil:'domcontentloaded'});
    await probe.locator('#load-meter').waitFor();
    check(await probe.locator('#main').getAttribute('aria-busy')==='true','Missing busy state');
    await probe.screenshot({path:'output/playwright/loading.png',scale:'css'});
    await probe.getByRole('heading',{name:'订阅转化',exact:true}).waitFor();
    check(await probe.locator('#main').getAttribute('aria-busy')==='false','Busy state not cleared');
    check(await probe.evaluate(()=>performance.getEntriesByType('resource').every(entry=>new URL(entry.name).origin===location.origin)),'External resource dependency remains');
    check(await probe.locator('.detail-chart').first().evaluate(node=>echarts.getInstanceByDom(node).getOption().animationDuration)===0,'Reduced motion ignored');
    await probe.unroute('**/data/trial-facts.json');
    await probe.route('**/data/weekly.json',route=>route.abort());
    await probe.reload({waitUntil:'domcontentloaded'});
    await probe.getByRole('button',{name:'重新加载',exact:true}).waitFor();
    check(probe.url().includes('country=US'),'Error changed route');
    await probe.screenshot({path:'output/playwright/load-error.png',scale:'css'});
    await probe.unroute('**/data/weekly.json');
    await probe.getByRole('button',{name:'重新加载',exact:true}).click();
    await probe.getByRole('heading',{name:'订阅转化',exact:true}).waitFor();
    check(probe.url().includes('country=US'),'Retry changed route');
    check(await probe.locator('.detail-kpi').count()===4,'Retry did not restore complete dashboard');
  } finally {await probe.close();}
  check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
  await page.locator('.nav-link[data-page=""]').click();
  return {status:'PASS',checks:['weighted story selection and focused scales','linked evidence keeps filters','continuous filters and focus','dependent options','search and keyboard dismissal','history','section navigation','8 pages at 2 desktop widths','loading feedback','failed fetch and retry','local assets','reduced motion'],pages};
}
