// Run with playwright-cli run-code --filename=scripts/verify_observation_flows.js.
async (page) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const idByPage={A:13,C:42,D:18};
  const open=async(code,query='')=>{
    await p.goto(`${base}#/${code}${query?`?${query}`:''}`);
    const week=new URLSearchParams(query).get('week')??'12';
    await p.waitForFunction(({code,week})=>document.querySelector('.finding-title')?.textContent.startsWith(`W${week}`)&&
      document.querySelector('h1')?.textContent===({A:'新客与激活',C:'设备健康',D:'订阅转化'}[code]),{code,week});
  };
  const counts=(week,code)=>code==='A'?{n:week.registrationCohort.valueActivated7dBird,d:week.registrationCohort.birdEligible}:
    code==='C'?{n:week.deviceEventsBird.empty,d:week.deviceEventsBird.triggers}:{n:week.trialMaturity.converted,d:week.trialMaturity.completed};
  const sum=(weeks,code)=>weeks.reduce((total,week)=>{const value=counts(week,code);return {n:total.n+value.n,d:total.d+value.d};},{n:0,d:0});
  const number=value=>value.toLocaleString('zh-CN');
  const verifyRows=async(before,after)=>{
    for(const [period,value] of [['before',before],['after',after]]) {
      const row=p.locator(`.finding-calculation tr[data-period="${period}"]`);
      check(await row.locator('td').nth(0).innerText()===`${number(value.n)} / ${number(value.d)}`,'Observation evidence differs from the independent cohort aggregate');
      check(await row.locator('td').nth(1).innerText()===`${(value.n/value.d*100).toFixed(1)}%`,'Observation ratio contradicts its displayed numerator/denominator');
      check(await p.locator(`.finding-comparison [data-period="${period}"] dd`).innerText()===`${(value.n/value.d*100).toFixed(1)}%`,'Observation graphic differs from its evidence');
    }
  };
  try {
    await open('A');
    const weeks=await p.evaluate(async()=>{const response=await fetch('./data/weekly.json');return response.json();});
    for(const size of [{width:1366,height:768},{width:1600,height:900},{width:1920,height:1080}]) {
      await p.setViewportSize(size);
      for(const code of ['A','C','D']) {
        await open(code);
        check(await p.locator('.finding-comparison').getAttribute('data-metric-id')===String(idByPage[code]),'Observation uses another metric');
        check(await p.locator('.finding-comparison-change').getAttribute('data-direction')==='adverse','A deteriorating rate is shown as improving');
        const basis=p.locator('.finding-basis');
        await basis.locator('summary').focus();await p.keyboard.press('Enter');
        check(await basis.evaluate(node=>node.open),'Observation basis cannot be opened from the keyboard');
        const split=code==='D'?9:8;
        await verifyRows(sum(weeks.slice(0,split),code),sum(weeks.slice(split),code));
        const layout=await p.locator('.detail-finding').evaluate(node=>({
          pageOverflow:document.documentElement.scrollWidth>innerWidth,
          panelOverflow:node.scrollWidth>node.clientWidth,
          overflowingCells:[...node.querySelectorAll('td,th')].filter(cell=>cell.scrollWidth>cell.clientWidth+1).map(cell=>cell.textContent),
        }));
        check(!layout.pageOverflow&&!layout.panelOverflow&&!layout.overflowingCells.length,`Comparison evidence clipped at ${size.width}: ${JSON.stringify(layout)}`);
        await p.locator('.detail-finding').evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
        await p.screenshot({path:`output/playwright/observation-${code}-${size.width}.png`});
        results.push({page:code,...size,...layout});
      }
    }
    for(const code of ['A','C','D']) {
      await open(code,'week=2');
      await p.locator('.finding-basis summary').click();
      await verifyRows(counts(weeks[0],code),counts(weeks[1],code));
      check((await p.locator('.finding-calculation-window').innerText()).includes('W1')&&(await p.locator('.finding-calculation-window').innerText()).includes('W2'),'Selected week evidence retains a different period');
      await open(code,'week=1');
      check(await p.locator('.finding-comparison').count()===0,'First observation week fabricated a preceding period');
      check((await p.locator('.detail-finding').innerText()).includes(code==='D'?'前一周无可比样本':'前期无可比样本'),'Missing predecessor lacks an explicit reason');
    }
    await open('D','country=US&productLine=Bird');
    const rows=await p.evaluate(async()=>{const response=await fetch('./data/trial-facts.json');return (await response.json()).records;});
    const group=rows.filter(row=>row.country==='US'&&row.product_line==='Bird');
    const aggregate=items=>({n:items.filter(row=>row.converted).length,d:items.length});
    await p.locator('.finding-basis summary').click();
    await verifyRows(aggregate(group.filter(row=>row.period==='previous')),aggregate(group.filter(row=>row.period==='current')));
    await p.locator('.detail-finding .insight-link').first().click();
    await p.locator('#metric-evidence-18').waitFor();
    check(p.url().includes('country=US')&&p.url().includes('productLine=Bird'),'Observation evidence discarded supported filters');
    await p.goto(`${base}#/D?country=UK&productLine=Bird&subscriptionPlatform=Web&plan=Plus&billingCycle=monthly`);
    await p.waitForFunction(()=>document.querySelector('.finding-title')?.textContent.includes('试用转正率当前'));
    check(await p.locator('.finding-comparison').count()===0,'Suppressed trial samples produced a strong comparison graphic');
    check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['independently aggregated period ratios','graphic/evidence consistency','adjacent selected weeks','first-week guard','filtered trial facts','evidence link retains filters','small-sample suppression','keyboard disclosure','3 desktop sizes'],results};
  } finally {await context.close();}
}
