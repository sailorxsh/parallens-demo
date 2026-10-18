// Independent fact reconciliation for the approved trend + contribution composition.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],states=[];
  const records=JSON.parse(fs.readFileSync('data/trial-facts.json','utf8')).records;
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const fields={country:'country',appPlatform:'app_platform',productLine:'product_line'};
  function expected(filters){
    const periods=['previous','current'].map(period=>records.filter(row=>row.period===period&&Object.entries(filters).every(([key,value])=>row[fields[key]]===value)));
    const target=row=>row.product_line==='Bird'&&row.app_platform==='Android'&&row.plan==='Plus'&&row.billing_cycle==='monthly';
    const converted=rows=>rows.filter(row=>row.converted).length;
    const groups=[['观鸟 Android Plus月付',target],['其他成熟试用',row=>!target(row)]]
      .map(([name,matches])=>({name,rows:periods.map(rows=>rows.filter(matches))})).filter(group=>group.rows.some(rows=>rows.length));
    const delta=periods.every(rows=>rows.length)?(converted(periods[1])/periods[1].length-converted(periods[0])/periods[0].length)*100:0;
    if(periods.some(rows=>rows.length<30)||groups.some(group=>group.rows.some(rows=>rows.length<30))||Math.abs(delta)<.05)return null;
    return {delta,groups:groups.map(group=>({name:group.name,
      ratios:group.rows.map((rows,i)=>`${converted(rows).toLocaleString('en-US')} / ${periods[i].length.toLocaleString('en-US')}`),
      value:(converted(group.rows[1])/periods[1].length-converted(group.rows[0])/periods[0].length)*100}))};
  }
  const open=async(filters={})=>{
    await p.goto(`${base}#/${Object.keys(filters).length?'?'+new URLSearchParams(filters):''}`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main').getAttribute('aria-busy')==='false');
    const signal=p.locator('.home-signal[data-metric-id="18"]');if(await signal.count())await signal.click();
  };
  try{
    for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
      await p.setViewportSize({width,height:1000});await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,font);
      for(const filters of [{},{country:'US'},{country:'UK'},{country:'DE'},{country:'Other'},{appPlatform:'Android'},{appPlatform:'iOS'},{productLine:'Bird'},{productLine:'Hunting'},{appPlatform:'Android',productLine:'Bird'},{country:'Other',appPlatform:'Android',productLine:'Bird'}]){
        await open(filters);
        await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,font);
        await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        check(await p.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))===font,'Text enlargement was lost during navigation');
        const exp=expected(filters),section=p.locator('.home-contribution');
        check(await section.isVisible()===!!exp,`Contribution visibility ${JSON.stringify(filters)}`);
        if(exp){
          await section.locator('svg').waitFor();
          const chart=await section.locator('.home-contribution-chart').evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {labels:o.yAxis[0].data,values:o.series[0].data.map(v=>v.value),min:o.xAxis[0].min,max:o.xAxis[0].max,rect:n.getBoundingClientRect().toJSON()};});
          check(JSON.stringify(chart.labels)===JSON.stringify(exp.groups.map(g=>g.name))&&chart.values.every((v,i)=>Math.abs(v-exp.groups[i].value)<1e-8),'Chart differs from independent fact aggregation');
          check(chart.min<=0&&chart.max>=0,'Contribution omits zero');
          await section.locator('summary').focus();await p.keyboard.press('Enter');
          const rows=await section.locator('tbody tr').allTextContents();
          check(rows.length===exp.groups.length+1&&exp.groups.every((g,i)=>g.ratios.every(r=>rows[i].includes(r))),'Contribution table loses same-period overall denominators');
          check(await section.locator('.chart-data').evaluate(n=>n.open),'Keyboard cannot open contribution data');
          await p.keyboard.press('Enter');
          check(!(await section.locator('.chart-data').evaluate(n=>n.open)),'Keyboard cannot close contribution data');
          check((await section.innerText()).includes('数学分解，不证明因果'),'Contribution overclaims causality');
          // A plotted point opens its exact native table, without navigation or persistent writes.
          await section.locator('.home-contribution-chart').scrollIntoViewIfNeeded();
          const point=await section.locator('.home-contribution-chart').evaluate(n=>{
            const c=echarts.getInstanceByDom(n),values=c.getOption().series[0].data,index=values.findIndex(v=>Math.abs(v.value)>.005);
            const pixel=c.convertToPixel({seriesIndex:0},[values[index].value/2,index]),rect=n.getBoundingClientRect();
            return {x:rect.left+pixel[0],y:rect.top+pixel[1]};
          });
          await p.mouse.click(point.x,point.y);
          check(await section.locator('tbody tr.chart-selected').count()===1,'Chart point does not reveal its calculation row');
          await section.locator('summary').click();
          const storage=await p.evaluate(()=>JSON.stringify({...localStorage}));
          await section.locator('a').click();await p.locator('#D-panel-groups').waitFor();
          check(p.url().includes('metric=18')&&p.url().includes('panel=groups'),'Contribution link misses its evidence destination');
          for(const [key,value] of Object.entries(filters))check(new URLSearchParams(p.url().split('?')[1]).get(key)===value,'Contribution link loses scope');
          await p.goBack();await p.locator('.home-contribution svg').waitFor();
          check(await p.evaluate(()=>JSON.stringify({...localStorage}))===storage,'Evidence browsing rewrites saved issues');
        }
        check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Contribution layout causes document overflow');
        check(await p.locator('.home-contribution h4,.home-contribution-note').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1)),'Contribution copy is clipped');
        states.push({width,font,filters,shown:!!exp});
      }
      await open();await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,font);
      await p.locator('.home-contribution').scrollIntoViewIfNeeded();
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await p.screenshot({path:`output/playwright/home-contribution-${width}-${font}.png`,fullPage:false});
    }
    await p.evaluate(()=>document.documentElement.style.fontSize='');await open();
    for(const selector of ['.home-signal[data-metric-id="13"]','.trend-overview']){
      await p.locator(selector).click();check(!(await p.locator('.home-contribution').isVisible()),'Unrelated view keeps stale contribution');
      check(await p.evaluate(()=>detailCharts.every(c=>!c.isDisposed())),'Disposed contribution remains in chart registry');
    }
    // Homepage intentionally exposes no week control; exercise the shared capability gate directly.
    await open();const weekGuard=await p.evaluate(()=>{
      const comparison=homeComparisons().find(c=>c.id===18);filterState.week='12';
      const evidence=homeTrialEvidence(comparison);updateHomeContribution(document.querySelector('.home-contribution'),comparison,evidence);
      return evidence===null&&document.querySelector('.home-contribution').hidden;
    });check(weekGuard,'Single-week capability gate retains a cross-period contribution');
    await open({country:'FR'});check(await p.locator('.home-contribution').count()===0,'Invalid filter fabricates a contribution');
    await open();
    const fixture=await p.evaluate(()=>{
      const comparison={...homeComparisons().find(c=>c.id===18),delta:1.6};
      const parts=homeTrialEvidence(homeComparisons().find(c=>c.id===18)).parts;
      updateHomeContribution(document.querySelector('.home-contribution'),comparison,{parts:{...parts,changes:[2,-.4]}});
      const instance=echarts.getInstanceByDom(document.querySelector('.home-contribution-chart')),o=instance.getOption();
      return {colors:o.series[0].data.map(p=>p.itemStyle.color),values:o.series[0].data.map(p=>p.value),axis:[o.xAxis[0].min,o.xAxis[0].max]};
    });
    check(JSON.stringify(fixture.colors)===JSON.stringify(['#356d51','#ad551f'])&&fixture.axis[0]<-.4&&fixture.axis[1]>2,'Positive and negative fixture directions are misleading');
    await open();await p.evaluate(()=>{
      window.restoreContributionChart=createChart;createChart=(node,...args)=>{if(node.classList.contains('home-contribution-chart'))throw new Error('injected chart fault');return window.restoreContributionChart(node,...args);};
    });
    await p.locator('.home-signal[data-metric-id="18"]').click();
    check(await p.locator('.home-contribution .chart-render-error').count()===1,'Contribution render fault lacks recovery state');
    await p.locator('.home-contribution button[aria-label^="查看"]').click();
    check(await p.locator('.home-contribution .chart-data').evaluate(n=>n.open),'Render failure hides contribution facts');
    await p.evaluate(()=>createChart=window.restoreContributionChart);
    await p.locator('.home-contribution button[aria-label^="重试"]').click();
    check(await p.locator('.home-contribution svg').count()===1&&await p.locator('.home-contribution .chart-render-error').count()===0,'Contribution cannot recover after retry');
    await p.evaluate(()=>window.echarts=undefined);await p.locator('.home-signal[data-metric-id="18"]').click();
    check(await p.locator('.home-contribution .chart-fallback').count()===1&&await p.locator('.home-contribution tbody tr').count()===3,'Missing library hides contribution facts');
    check(await p.locator('.home-contribution .chart-fallback').evaluate(n=>n.clientHeight<100),'Missing library leaves a large empty contribution plot');
    // Deliberate renderer exception is logged; pageerror must still remain empty.
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['44 independent filtered desktop/font cases','same-period counts and contribution closure','keyboard table and chart-point selection','scope-preserving drill and history','no persisted issue writes','unrelated/invalid/week capability suppression','positive and negative fixture','renderer failure and retry','missing library retains compact facts'],states,fixture};
  }finally{await context.close();}
}
