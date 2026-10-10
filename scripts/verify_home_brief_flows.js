// Isolated browser probe: approved homepage composition and comparison behavior.
async (parent) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1487,height:1060},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const open=async(query='')=>{
    await p.goto(`${base}#/${query?`?${query}`:''}`);
    await p.locator('#trendChart svg').waitFor();
  };
  try {
    for(const size of [{width:1366,height:768},{width:1600,height:900},{width:1920,height:1080}]) {
      await p.setViewportSize(size);await open();
      const layout=await p.evaluate(()=>{
        const box=n=>n.getBoundingClientRect();
        return {overflow:document.documentElement.scrollWidth>innerWidth,
          headings:[...document.querySelectorAll('h1,.home-result-head h2,.signal-heading,.story-panel+.section-top h2')].map(n=>n.textContent),
          resultRows:[...document.querySelectorAll('.home-result-comparison')].map(n=>{
            const a=box(n.children[0]),b=box(n.children[1]);
            return {text:n.textContent,sameLine:Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2)<1,overflow:n.scrollWidth>n.clientWidth+1};
          }),
          ordered:box(document.querySelector('.home-results')).bottom<=box(document.querySelector('.story-panel')).top&&
            box(document.querySelector('.story-panel')).bottom<=box(document.querySelector('.journey-rail')).top,
          sixColumns:[...document.querySelectorAll('.journey-card')].every(n=>Math.abs(box(n).top-box(document.querySelector('.journey-card')).top)<1),
          nodes:[...document.querySelectorAll('.journey-card')].map(n=>({trend:!!n.querySelector('.node-sparkline svg'),change:!!n.querySelector('.node-change')?.textContent,
            overflow:n.scrollWidth>n.clientWidth+1})),
          changeVisible:[...document.querySelectorAll('.home-signal-values .signal-delta')].every(n=>box(n).right<=box(n.parentElement).right+1),
        };
      });
      check(!layout.overflow&&layout.ordered,'Homepage order or desktop width is broken');
      check(layout.headings.join('|')==='经营简报|经营结果|变化解读与行动建议|六节点经营主线','Approved module titles disappeared');
      check(layout.resultRows.length===4&&layout.resultRows.every(r=>r.sameLine&&!r.overflow),'Result change and comparison period do not share a readable single line');
      check(layout.sixColumns&&layout.nodes.length===6&&layout.nodes.every(n=>n.trend&&n.change&&!n.overflow),'Six default journey trends or comparisons are missing or clipped');
      check(layout.changeVisible,'Analysis comparison delta escapes its surface');
      check(layout.resultRows[0].text==='+50人9/24 较 9/17'&&layout.resultRows[1].text==='+3.2%9/24 较 9/1'&&
        layout.resultRows[2].text==='+302美元9/24 较 9/17'&&layout.resultRows[3].text==='+320人9/24 较 9/17','Result comparisons contradict their source periods');
      await p.screenshot({path:`output/playwright/v62-home-${size.width}.png`,scale:'css'});
      results.push({width:size.width,...layout});
    }
    await p.setViewportSize({width:1487,height:1060});await open();
    await p.screenshot({path:'output/playwright/v62-home-final.png',scale:'css'});
    for(const id of [13,18]) {
      const button=p.locator(`.home-signal[data-metric-id="${id}"]`);
      await button.focus();await p.keyboard.press('Enter');
      check(await button.getAttribute('aria-pressed')==='true'&&await button.evaluate(n=>n===document.activeElement),'Keyboard selection or focus is broken');
      const evidence=await p.evaluate(id=>{
        const selected=homeComparisons().find(c=>c.id===id),node=document.querySelector('#trendChart'),option=echarts.getInstanceByDom(node).getOption();
        return {count:option.series.length,last:option.series[0].data.at(-1),baseline:option.series[0].markLine.data[0].yAxis,
          before:selected.beforeRate,after:selected.afterRate,windows:document.querySelector(`.home-signal[data-metric-id="${id}"] .home-signal-windows`).textContent,
          expectedWindows:selected.beforeLabel+selected.beforeWindow+selected.afterLabel+selected.afterWindow,
          context:document.querySelector('.home-comparison-context').textContent};
      },id);
      check(evidence.count===1&&evidence.last===Number(evidence.after.toFixed(1))&&evidence.baseline===evidence.before&&evidence.windows===evidence.expectedWindows,
        `Selected chart, analysis rates and date windows disagree: ${JSON.stringify(evidence)}`);
      check(evidence.context.includes('观察')&&evidence.context.includes('建议优先行动')&&evidence.context.includes('核对分组证据'),'Actionable analysis is missing');
      const basis=p.locator('.home-comparison-basis');await basis.locator('summary').click();
      check(await basis.evaluate(n=>n.open)&&await basis.locator('p').count()>0,'Comparison basis no longer opens inline');
      await p.locator('.home-comparison-basis summary').click();
    }
    await p.getByRole('button',{name:'并列对照',exact:true}).click();
    check(await p.locator('#trendChart').evaluate(n=>echarts.getInstanceByDom(n).getOption().series.length)===2,'Parallel comparison lost a series');
    await p.locator('.home-signal[data-metric-id="13"]').click();
    const definition=p.locator('.home-result[data-metric-id="2"] .definition-trigger');
    await definition.click();
    check(await p.locator('#metric-definition-popover').isVisible(),'Result definition is no longer visible');
    await p.keyboard.press('Escape');
    check(await definition.evaluate(n=>n===document.activeElement),'Definition dismissal lost focus');
    await p.locator('.filter-bar summary').click();
    await p.getByLabel('国家/市场',{exact:true}).selectOption('US');
    const filtered=await p.evaluate(()=>[2,3,4].map(id=>({id,value:metric(id).value,history:metricHistory(id)})));
    for(const item of filtered) {
      const row=p.locator(`.home-result[data-metric-id="${item.id}"]`);
      const delta=item.history.values.at(-1)-item.history.values.at(-2);
      check((await row.innerText()).includes(`${delta>=0?'+':'−'}${Math.abs(Math.round(delta)).toLocaleString('zh-CN')}${item.history.unit}`),'Filtered comparison retains the unfiltered change');
    }
    await p.getByLabel('产品线',{exact:true}).selectOption('Hunting');
    check(await p.locator('.home-signal').count()===1&&await p.locator('.home-signal').getAttribute('data-metric-id')==='18','Unsupported activation still appears in Hunting scope');
    await p.locator('.home-comparison-context .insight-link').click();
    await p.locator('#metric-evidence-18').waitFor();
    check(p.url().includes('#/D')&&p.url().includes('country=US')&&p.url().includes('productLine=Hunting'),'Evidence navigation dropped supported filters');
    await p.goBack();await p.locator('.home-results').waitFor();
    check(await p.getByLabel('国家/市场',{exact:true}).inputValue()==='US','Back lost filter selection');
    // Inject inconsistent upstream stock counts in this isolated browser only.
    await p.route('**/data/metric-values.json',async route=>{
      const response=await route.fetch(),data=await response.json();data.m05.value.bird.paidCurrent+=5000;
      await route.fulfill({response,json:data});
    });
    await open();await p.reload();await p.locator('#trendChart svg').waitFor();
    const unavailable=await p.locator('.home-result[data-metric-id="21"]').innerText();
    check(await p.evaluate(()=>metric(21).kind)==='na'&&unavailable.includes('当前范围不适用')&&
      unavailable.includes('不闭合')&&!unavailable.includes('+0')&&await p.locator('.home-result .net-add-flow').count()===0,
      'Inconsistent stock facts fabricated a net-add comparison');
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['four modules in approved order','single-line result comparisons at three desktop widths','six default journey trends',
      'source values and periods','keyboard signal and focus','in-place comparison basis','parallel comparison','definition top-layer and focus',
      'filtered comparison recomputation','unsupported activation suppressed','evidence keeps supported filters','back preserves filters','NA comparison'],results};
  } finally {await context.close();}
}
