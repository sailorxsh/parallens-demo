// Run through playwright-cli run-code --filename; isolated records protect user data.
async (page) => {
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1366,height:1000},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  p.on('dialog',dialog=>dialog.accept());
  const form=()=>p.locator('.action-record');
  const field=name=>form().locator(`[name="${name}"]`);
  const open=async hash=>{await p.goto(`${base}#/${hash}`);await form().waitFor();};
  const register=async id=>{
    await p.locator(`#metric-evidence-${id} .issue-register`).click();
    await p.waitForFunction(id=>document.querySelector('.action-record-header strong')?.textContent.startsWith(`问题单 DEMO-D-${id}-`),id);
  };
  const stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('parallens-demo-actions-v1')||'{}'));
  try {
    await open('D');await field('note').fill('保留原转正核查草稿');
    const original=await form().locator('strong').first().innerText();
    await p.locator('.action-evidence-link[aria-label^="D-02，"]').click();
    await p.locator('#metric-evidence-52').waitFor();
    check(await form().locator('strong').first().innerText()===original,'Auxiliary evidence changed current issue');
    await register(52);
    check((await form().innerText()).includes('168'),'Risk issue does not capture risk metric baseline');
    check(await field('note').inputValue()==='','Trial draft leaked into risk issue');
    check(await field('owner').evaluate(node=>document.activeElement===node),'Registration does not focus owner');
    await field('note').fill('风险用户核查');await field('owner').fill('风险运营');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    let records=await stored();
    const riskKey=Object.keys(records).find(key=>key.endsWith(':52'));
    check(records[riskKey]?.evidenceId===52&&records[riskKey].reviewMetric===52&&records[riskKey].baseline==='168','Risk record saved trial metric or baseline');
    await p.goBack();await p.waitForFunction(()=>!location.hash.includes('issue='));
    check(await field('note').inputValue()==='保留原转正核查草稿','Browser back lost trial draft');
    await p.goForward();await p.waitForFunction(()=>location.hash.includes('issue=52'));
    check(await field('owner').inputValue()==='风险运营','Browser forward lost risk issue');
    await field('issueMetric').selectOption('18');
    check(await field('note').inputValue()==='保留原转正核查草稿','Issue switching lost old draft');
    await field('owner').fill('转正运营');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    records=await stored();check(Object.keys(records).filter(key=>key.startsWith('record:D:')).length===2,'Same-page records overwrite each other');
    const trialKey=Object.keys(records).find(key=>key.endsWith(':18'));
    check(records[trialKey].baseline==='43.4%','Trial baseline changed');
    await field('issueMetric').selectOption('52');await p.reload();await form().waitFor();
    check(await field('owner').inputValue()==='风险运营','Explicit issue does not survive refresh');
    await p.evaluate(()=>{window.__write=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('test');};});
    await field('note').fill('风险草稿保存失败');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check((await form().locator('.action-receipt').innerText()).includes('未保存'),'Storage failure reported success');
    await field('issueMetric').selectOption('18');await field('issueMetric').selectOption('52');
    check(await field('note').inputValue()==='风险草稿保存失败','Failed-save draft lost when switching issues');
    check((await stored())[riskKey].note==='风险用户核查','Failed save overwrote committed risk record');
    await p.evaluate(()=>{Storage.prototype.setItem=window.__write;});
    await p.locator('.trial-sample-item').first().click();
    check(await field('issueMetric').inputValue()==='18','Trial sample attached to risk metric issue');
    check(Boolean(await field('linkedSample').inputValue()),'Trial sample missing');
    await field('issueMetric').selectOption('52');
    check(await field('note').inputValue()==='风险草稿保存失败','Sample registration destroyed risk draft');
    await open('D?country=US&metric=52');await register(52);
    check(await field('owner').inputValue()==='','Risk issue leaked between scopes');
    await field('owner').fill('美国风险运营');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check(Object.keys(await stored()).filter(key=>key.endsWith(':52')).length===2,'Filtered risk overwrote default risk');
    await form().screenshot({path:'output/playwright/v51-risk-issue.png'});
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:1000});
      await open('C?deviceModel=K6&firmware=2.8&metric=42');
      const card=p.locator('.detail-kpi[data-metric-id="42"]');
      check((await card.innerText()).includes('82.0%'),'Filtered card disagrees with original K6 group');
      const evidence=p.locator('#metric-evidence-42');
      check((await evidence.innerText()).includes('3,280')&&(await evidence.innerText()).includes('4,000'),'Filtered evidence uses independent slices');
      const points=await p.locator('.analysis-main .detail-chart').first().evaluate(node=>window.echarts.getInstanceByDom(node).getOption().series[0].data);
      check(points.at(-1)===82&&points[0]===42,'Filtered trend contradicts card');
      check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Desktop page overflow');
      if(width===1366)await evidence.screenshot({path:'output/playwright/v51-event-evidence.png'});
    }
    await open('C?country=US&deviceModel=K6&firmware=2.8&metric=42');
    check((await p.locator('#metric-evidence-42').innerText()).includes('待补数据'),'Missing country facts invent a number');
    check(await p.locator('#metric-evidence-42 .detail-chart').count()===0,'Missing data uses total trend');
    check(await p.locator('#metric-evidence-42 .issue-register').count()===0,'Missing baseline permits registration');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:['single event facts across filters and 3 desktop widths','unsupported intersections pending','explicit risk registration baseline 168','trial draft preservation','back and forward','multiple saved metric issues','scope isolation','reload','failed save draft','trial sample stays on trial issue','focus and overflow'],screenshots:['v51-risk-issue.png','v51-event-evidence.png']};
  } finally {await context.close();}
}
