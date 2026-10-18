// Run with playwright-cli run-code --filename=scripts/verify_metric_card_flows.js.
async (page) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const card=id=>p.locator(`.detail-kpi[data-metric-id="${id}"]`);
  const inspect=async(topic,filters='')=>{
    await p.goto(`${base}#/${topic}${filters?`?${filters}`:''}`);
    await p.locator('.detail-kpi').first().waitFor();await p.evaluate(()=>document.fonts.ready);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const items=await p.locator('.detail-kpi').evaluateAll(nodes=>nodes.map(node=>{
      const value=node.querySelector('.detail-select');
      const footer=node.querySelector('.headline-trend,.metric-compare-unavailable,.net-add-flow'),rect=node.getBoundingClientRect();
      const style=getComputedStyle(node),delta=node.querySelector('.metric-delta'),link=node.querySelector('.detail-evidence-link');
      return {id:Number(node.dataset.metricId),label:node.querySelector('h3').textContent,value:value.textContent,
        name:value.getAttribute('aria-label'),fields:[...node.querySelectorAll('.metric-secondary-values>div')].map(row=>[...row.children].map(cell=>cell.textContent)),
        footerGap:footer?rect.bottom-footer.getBoundingClientRect().bottom:null,footerInset:parseFloat(style.paddingBottom)+parseFloat(style.borderBottomWidth),
        delta:delta?{text:delta.textContent,tone:delta.classList.contains('improving')?'improving':delta.classList.contains('adverse')?'adverse':'neutral',
          color:getComputedStyle(delta).color,background:getComputedStyle(delta).backgroundColor}:null,
        linkWidth:link.getBoundingClientRect().width,contentWidth:node.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),
        overflow:node.scrollWidth>node.clientWidth+1};
    }));
    for(const item of items) {
      check(item.name.includes(item.value),`Visible value is missing from the button name: ${JSON.stringify(item)}`);
      check(!item.overflow,`Card content is clipped: ${JSON.stringify(item)}`);
      check(item.footerGap===null||Math.abs(item.footerGap-item.footerInset)<1.5,
        `Card footer does not share the row's reading baseline: ${JSON.stringify(item)}`);
      check(item.linkWidth<item.contentWidth-8,'The evidence underline expands across the entire card');
      check(!/undefined|NaN/.test(JSON.stringify(item)),`Card shows an invalid value: ${JSON.stringify(item)}`);
    }
    results.push({topic,filters,width:await p.evaluate(()=>innerWidth),items});return items;
  };
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});
      for(const topic of ['A','B','C','D','E','F','G']) {
        await inspect(topic);
        for(const selector of ['h1','.filter-bar summary','.detail-kpis','.finding-title',
          ...(['A','C','D'].includes(topic)?['.finding-comparison-values','.finding-comparison-change']:[])]) {
          const bounds=await p.locator(selector).first().boundingBox();
          check(bounds&&bounds.y>=0&&bounds.y+bounds.height<=height,
            `${topic} hides its first-view ${selector} at ${width}x${height}: ${JSON.stringify(bounds)}`);
        }
      }
    }
    await p.setViewportSize({width:1440,height:1000});
    const structural=await inspect('F');
    const structuralTone=structural.find(item=>item.id===48).delta;
    await inspect('A');
    const tones=await p.locator('.detail-kpi .metric-delta').evaluateAll(nodes=>nodes.map(n=>({
      tone:n.classList.contains('improving')?'improving':n.classList.contains('adverse')?'adverse':'neutral',
      text:n.textContent,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor})));
    const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
    const luminance=s=>rgb(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const neutral=tones.find(item=>item.tone==='neutral');
    check(neutral?.text.includes('持平')&&structuralTone.background===neutral.background,
      'Stable and unclassified structural changes do not share a neutral appearance');
    check(new Set(tones.map(item=>item.background)).size===3,'Stable, improving and adverse changes share a visual state');
    for(const item of tones){const a=luminance(item.color),b=luminance(item.background);
      check((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`Change label has insufficient text contrast: ${JSON.stringify(item)}`);}
    await inspect('F');
    check(await card(48).locator('h3').innerText()==='多设备主账号占比','Device share is presented as an average device count');
    check(await card(7).locator('.detail-select').innerText()==='128,600人','Registered user count is ambiguous');
    check((await card(7).locator('.metric-secondary-values').innerText()).includes('82,400人'),'Bound owners are missing their own label');
    check(await card(8).locator('.detail-select').innerText()==='176,200台','Cumulative activated devices are presented as a ratio');
    check((await card(8).locator('.metric-secondary-values').innerText()).includes('143,800台'),'Current bound devices were lost');
    check(await card(48).locator('.metric-delta.improving').count()===0&&await card(49).locator('.metric-delta.improving').count()===0,
      'A structural share increase is automatically classified as an improvement');
    await card(48).locator('.detail-select').click();
    check((await p.locator('.metric-inspector').innerText()).includes('当前主值\n多设备主账号占比'),'Inspector does not identify the displayed rate');
    await card(48).locator('.detail-evidence-link').click();await p.locator('#metric-evidence-48 svg').first().waitFor();
    const history=await p.locator('#metric-evidence-48 .evidence-pair').first().evaluate(node=>{
      const option=echarts.getInstanceByDom(node.querySelector('.detail-chart')).getOption();
      return {title:node.querySelector('h3').textContent,periods:option.series[0].data.length,
        last:option.series[0].data.at(-1),min:option.yAxis[0].min,max:option.yAxis[0].max,
        rows:node.querySelectorAll('tbody tr').length};
    });
    check(history.title.includes('多设备主账号占比')&&history.periods===12&&history.rows===12&&history.last===22&&history.max-history.min<10,
      `A device-share evidence link lacks its readable history: ${JSON.stringify(history)}`);
    await inspect('E');
    check(await card(35).locator('.detail-select').innerText()==='$5.20/人','ARPPU is presented without a per-payer unit');
    check((await card(35).locator('.metric-secondary-values').innerText()).includes('10,000人'),'Monthly subscription payers were hidden');
    check((await card(35).locator('.metric-value-context').innerText()).startsWith('2026-08'),'ARPPU comparison month is missing');
    await card(35).locator('.detail-select').click();
    check((await p.locator('.metric-inspector').innerText()).includes('月内订阅付款主账号\n10,000人'),'Inspector and payment card disagree');
    await inspect('E','country=US');
    const payment=await p.evaluate(()=>metric(35).value);
    check((await card(35).locator('.metric-secondary-values').innerText()).includes(`${payment.monthlySubscriptionPayers.toLocaleString('zh-CN')}人`),
      'Payer context did not follow the selected market');
    check(await card(35).locator('.detail-select').innerText()===`$${payment.ARPPU.toFixed(2)}/人`,'Filtered ARPPU label is stale');
    await inspect('B');
    check(await card(25).locator('.detail-select').innerText()==='12,600人','DAU is not identified');
    check((await card(25).locator('.metric-secondary-values').innerText()).includes('29,800人')&&
      (await card(25).locator('.metric-secondary-values').innerText()).includes('68,000人'),'Separate WAU/MAU values were lost');
    await inspect('G');
    check(await card(54).locator('.detail-select').innerText()==='2.2%','Loss and coverage are still presented as a quotient');
    check((await card(54).locator('.metric-secondary-values').innerText()).includes('96.5%'),'ID coverage is not independently labelled');
    await inspect('A','week=2');
    check(await card(9).locator('.detail-select').innerText()===await p.evaluate(()=>`${metric(9).value.toLocaleString('zh-CN')}人`),
      'Registration summary is stale after selecting a week');
    await inspect('C');
    check(await card(46).locator('h3').innerText()==='关键功能最低成功率'&&
      await card(46).locator('.detail-select').innerText()==='直播 · 97.0%',
      'A healthy upload rate hides the lower live success rate');
    const otherRates=await card(46).locator('.metric-secondary-values').innerText();
    check(otherRates.includes('上传成功率')&&otherRates.includes('99.0%')&&otherRates.includes('推送成功率')&&otherRates.includes('98.5%'),
      'Independent upload and push success rates are missing');
    check((await card(46).locator('.metric-value-context').innerText()).includes('最近24小时'),'Request sample period is missing');
    await card(46).locator('.detail-select').click();
    const requestSummary=await p.locator('.metric-inspector').innerText();
    check(requestSummary.includes('9,700 / 10,000 次成功；失败 300 次')&&!requestSummary.includes('统计期未注明'),
      'Live request counts or the actual synthetic period are absent from the inspector');
    await card(46).locator('.detail-evidence-link').click();await p.locator('#metric-evidence-46 svg').first().waitFor();
    for(const details of await p.locator('#metric-evidence-46 .evidence-pair:visible .workspace-calculation').all())
      if(!await details.evaluate(node=>node.open))await details.locator('summary').click();
    const requestEvidence=await p.locator('#metric-evidence-46 .evidence-pair').first().evaluate(node=>{
      const option=echarts.getInstanceByDom(node.querySelector('.detail-chart')).getOption();
      return {labels:option.xAxis[0].data,values:option.series[0].data,min:option.yAxis[0].min,max:option.yAxis[0].max,
        rows:[...node.querySelectorAll('tbody tr')].map(row=>[...row.children].map(cell=>cell.textContent))};
    });
    check(requestEvidence.labels.join(',')==='直播,推送,上传'&&requestEvidence.values.join(',')==='3,1.5,1'&&
      requestEvidence.min===0&&requestEvidence.max===5&&requestEvidence.rows[0].join(',')==='直播,10,000,9,700,300,3.0%',
      `Request failure evidence cannot be reconciled: ${JSON.stringify(requestEvidence)}`);
    await inspect('C','deviceModel=K6&firmware=2.8&functionType=Live');
    check(await card(46).locator('h3').innerText()==='直播成功率'&&await card(46).locator('.detail-select').innerText()==='91.3%'&&
      await card(46).locator('.metric-secondary-values').count()===0,'A selected live chain still includes other chains');
    await card(46).locator('.detail-evidence-link').click();await p.locator('#metric-evidence-46 svg').first().waitFor();
    for(const details of await p.locator('#metric-evidence-46 .evidence-pair:visible .workspace-calculation').all())
      if(!await details.evaluate(node=>node.open))await details.locator('summary').click();
    check((await p.locator('#metric-evidence-46 .evidence-pair tbody tr').first().innerText()).replace(/\s+/g,' ')===
      '直播 400 365 35 8.8%','Selected model, firmware and chain do not share the same request evidence');
    check(!(await p.locator('#metric-evidence-46 .evidence-pair').innerText()).includes('分片估算'),
      'Model and firmware request facts are incorrectly labelled as an independent slice estimate');
    await inspect('C','deviceStatus=Effective&functionType=Live');
    await card(46).locator('.detail-select').click();
    check((await p.locator('.inspector-source').innerText()).includes('分片估算'),'Device-state estimates are presented as direct request facts');
    await inspect('C','deviceStatus=Inactive');
    check((await card(8).locator('.detail-select').innerText()).match(/不适用|待补数据/)&&await card(8).locator('.metric-value-unit').count()===0&&
      await card(8).locator('.metric-secondary-values').count()===0,'Unavailable device data is shown as a real count');
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['precise metric names and units','independent composite measures','visible values in accessible names',
      'seven pages at three specified desktop sizes','first-view observations and rate comparisons','aligned trend and availability footers','compact evidence link underlines',
      'distinct stable, improving and adverse states with readable contrast','neutral structural changes','device-share evidence history','inspector consistency',
      'all independent technical rates and request failures','single-chain model and firmware evidence','filtered payment and weekly values','unavailable data without fabricated counts'],results};
  } finally {await context.close();}
}
