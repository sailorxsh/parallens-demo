// Verify income attribution and evidence navigation without touching user records.
async(page)=>{
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1366,height:768},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],sizes=[],axisStates=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const open=async hash=>{await p.goto(`${base}#/${hash}`);await p.locator('.income-workspace').waitFor();};
  const pair=()=>p.locator('#metric-evidence-35 .evidence-pair').filter({has:p.getByRole('heading',{name:/订阅净收入变化拆分/})});
  const checkAxis=async name=>{
    const axis=await pair().locator('.detail-chart').evaluate(node=>{
      const chart=echarts.getInstanceByDom(node),options=chart.getOption(),axis=options.yAxis[0],box=node.getBoundingClientRect();
      const ticks=Array.from({length:Math.round((axis.max-axis.min)/axis.interval)+1},(_,i)=>
        Number((axis.min+i*axis.interval).toPrecision(12)));
      const labels=[...node.querySelectorAll('svg text')].filter(label=>{
        const r=label.getBoundingClientRect();return r.width&&r.right<=box.left+options.grid[0].left-2;
      }).map(label=>{const r=label.getBoundingClientRect();return {text:label.textContent,top:r.top,bottom:r.bottom,left:r.left};});
      return {min:axis.min,max:axis.max,interval:axis.interval,ticks,expected:ticks.map(axis.axisLabel.formatter),labels,
        values:options.series[0].data.map(point=>typeof point==='object'?point.value:point),boxLeft:box.left,boxHeight:box.height,chartHeight:chart.getHeight(),grid:options.grid[0],
        visibleTop:document.querySelector('.section-navigation')?.getBoundingClientRect().bottom??0,visibleBottom:innerHeight};
    });
    check(axis.min<=0&&axis.max>=0&&axis.interval>=.01,`${name}: zero baseline or cent precision is lost`);
    check(axis.expected.length===axis.labels.length&&axis.expected.every(value=>axis.labels.some(label=>label.text===value)),
      `${name}: actual axis omits, duplicates or rounds ticks: ${JSON.stringify(axis)}`);
    const labels=[...axis.labels].sort((a,b)=>a.top-b.top);
    check(labels.every((label,i)=>label.left>=axis.boxLeft-1&&(!i||label.top-labels[i-1].bottom>=2)),
      `${name}: amount ticks overlap or clip: ${JSON.stringify(axis)}`);
    if(name.includes('200%'))check(labels.every(label=>label.top>=axis.visibleTop&&label.bottom<=axis.visibleBottom),
      `${name}: enlarged amount ticks are behind navigation or outside the viewport`);
    for(let i=2;i<labels.length;i++)check(Math.abs((labels[i].top-labels[i-1].top)-(labels[1].top-labels[0].top))<1,
      `${name}: endpoint tick spacing differs from the other ticks`);
    check(axis.values.every(value=>value>=axis.min&&value<=axis.max),`${name}: signed contribution is clipped`);
    axisStates.push({name,...axis});
  };
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});await open('E');
      const finding=p.locator('.detail-finding');
      const text=await finding.innerText();
      for(const value of ['$2,020','$49,980','$52,000','$1,030','$990','算术拆分不代表价格或经营原因'])check(text.includes(value),`Observation omits ${value}`);
      const drivers=finding.locator('.finding-income-drivers');
      check(await drivers.isVisible(),'Income drivers require opening a disclosure');
      check((await drivers.locator('[data-driver="payers"]').innerText()).includes('9,800 → 10,000 人')&&
        (await drivers.locator('[data-driver="payers"]').innerText()).includes('+200 人'),'Payer change is confused with its dollar contribution');
      check((await drivers.locator('[data-driver="arppu"]').innerText()).includes('$5.10 → $5.20/人')&&
        (await drivers.locator('[data-driver="arppu"]').innerText()).includes('+$0.10/人'),'ARPPU change is confused with its dollar contribution');
      check(await drivers.evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Income driver summary overflows the observation rail');
      check((await finding.boundingBox()).y<height-60,'Priority income observation falls below first viewport');
      await finding.locator('.finding-basis summary').click();
      const rows=finding.getByRole('table').getByRole('row');
      check((await rows.nth(1).innerText()).includes('9,800人'),'Previous-month payer count wrong');
      check((await rows.nth(2).innerText()).includes('$52,000'),'Current revenue missing from calculation');
      await finding.getByRole('link',{name:'查看本条指标证据 ↓',exact:true}).click();
      await pair().waitFor();await pair().locator('svg').waitFor();
      const plotText=await pair().locator('svg').textContent();
      check(plotText.includes('$1,030')&&plotText.includes('$990'),'Chart hides contribution values');
      await checkAxis(`${width}px default`);
      await p.evaluate(()=>document.documentElement.style.fontSize='32px');
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      // Enlarging the header moves this plot below the viewport. Inspect the
      // visible, painted chart rather than stale off-screen SVG coordinates.
      await pair().evaluate(node=>scrollTo({top:node.getBoundingClientRect().top+scrollY-
        document.querySelector('.section-navigation').getBoundingClientRect().height-16,behavior:'instant'}));
      await p.screenshot({path:`output/playwright/v106-income-axis-enlarged-${width}.png`});
      await checkAxis(`${width}px 200% text`);
      await p.evaluate(()=>document.documentElement.style.fontSize='16px');
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await pair().locator('.workspace-calculation > summary').click();
      check((await pair().innerText()).includes('合计 +$2,020'),'Calculation does not reconcile revenue change');
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Income evidence causes page overflow');
      if(width===1600) {
        await pair().evaluate(node=>scrollTo({top:node.getBoundingClientRect().top+scrollY-80,behavior:'instant'}));
        await pair().screenshot({path:'output/playwright/v55-income-evidence.png'});
      }
      sizes.push(width);
    }
    await open('E?metric=35&issue=35');
    const form=()=>p.locator('.action-record');
    const baseline=()=>form().locator('> .table-note').first();
    const expected='订阅ARPPU：$5.20/人；月内订阅付款主账号：10,000人；订阅净收入：$52,000';
    check((await baseline().innerText()).includes(expected),'Issue registration loses payer or income baseline');
    await form().locator('[name="owner"]').fill('收入核查');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('parallens-demo-actions-v1')));
    const key=Object.keys(saved).find(key=>key.startsWith('record:E:')&&key.endsWith(':35'));
    check(saved[key].baseline===expected&&saved[key].baselineAt==='完整月 2026-08','Saved income baseline is incomplete or uses another window');
    await p.reload();await form().waitFor();
    check((await baseline().innerText()).includes(expected),'Reload loses the full saved income baseline');
    await form().scrollIntoViewIfNeeded();
    await form().screenshot({path:'output/playwright/v56-04-complete-record.png'});
    await p.evaluate(key=>{
      const records=JSON.parse(localStorage.getItem('parallens-demo-actions-v1'));
      records[key].baseline='$5.20';
      localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(records));
    },key);
    await p.reload();await form().waitFor();
    check(!(await baseline().innerText()).includes('订阅净收入：'),'Old income baseline was silently expanded');
    await form().locator('[name="note"]').fill('沿用历史登记值继续核查');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check(await p.evaluate(key=>JSON.parse(localStorage.getItem('parallens-demo-actions-v1'))[key].baseline,key)==='$5.20',
      'Editing an old issue rewrites its historical baseline');
    await open('E?country=US&metric=35&issue=35');
    check((await p.locator('.detail-finding').innerText()).includes('模拟分片估算'),'Filtered attribution masquerades as observed facts');
    check(!((await p.locator('.detail-finding').innerText()).includes('增加 $2,020')),'Country selection retains total income change');
    check(!(await p.locator('.finding-income-drivers').innerText()).includes('9,800 → 10,000 人'),'Filtered drivers retain overall payer counts');
    check((await baseline().innerText()).includes('订阅净收入：')&&!(await baseline().innerText()).includes('$52,000'),
      'Filtered issue records overall revenue instead of its current scope');
    await pair().waitFor();check(await pair().locator('svg').count()===1,'Filtered contribution chart missing');
    await checkAxis('US recomputed income');
    await p.reload();await pair().waitFor();
    check(p.url().includes('country=US'),'Refresh loses income scope');
    await open('E?deviceModel=K6&metric=35');
    check(await pair().count()===0,'Unsupported metric scope invents an income attribution');
    check(await p.locator('.finding-income-drivers').count()===0,'Missing income facts retain driver comparisons');
    check((await p.locator('#metric-evidence-35').innerText()).includes('待补数据'),'Missing model income facts lack explanation');
    await p.route('**/data/diagnostics.json',async route=>{
      const response=await route.fetch(),json=await response.json();
      // A same-size payer cohort with a falling ARPPU must draw a negative effect.
      json.E.chart.series[0].values[1]=10000;
      json.E.extraCharts[0].series[0].values[1]=5.4;
      json.E.tables[1].rows[1]=['2026-07',10000,'$54,000','$5.40'];
      await route.fulfill({response,json});
    });
    await open('E?metric=35');await p.reload();await pair().locator('svg').waitFor();
    const negative=await pair().locator('.detail-chart').evaluate(node=>{
      const options=echarts.getInstanceByDom(node).getOption(),box=node.getBoundingClientRect();
      return {min:options.yAxis[0].min,values:options.series[0].data.map(point=>typeof point==='object'?point.value:point),
        colors:options.series[0].data.map(point=>point.itemStyle?.color),text:node.textContent,
        clipped:[...node.querySelectorAll('svg text')].filter(label=>{
          const r=label.getBoundingClientRect();return r.width&&r.height&&(r.left<box.left-2||r.right>box.right+2||r.top<box.top-2||r.bottom>box.bottom+2);
        }).map(label=>label.textContent)};
    });
    check(negative.values[1]===-2000&&negative.min<=-2000,'Negative income contribution clipped to zero');
    check(negative.colors[0]==='#718078'&&negative.colors[1]==='#bc6a20','Zero or negative income contribution has a misleading semantic color');
    await checkAxis('negative ARPPU contribution');
    await pair().screenshot({path:'output/playwright/v55-income-negative.png'});
    check(!negative.clipped.length&&negative.text.includes('$-2,000'),`Negative contribution label is missing or clipped: ${JSON.stringify(negative)}`);
    check((await p.locator('.detail-finding').innerText()).includes('减少 $2,000'),'Income decrease reported as improvement');
    check((await p.locator('[data-driver="payers"]').innerText()).includes('持平')&&
      (await p.locator('[data-driver="arppu"]').innerText()).includes('−$0.20/人'),'Negative ARPPU or unchanged payer count is mislabeled');
    await p.unroute('**/data/diagnostics.json');
    for(const [previousPayers,previousARPPU] of [[10200,5.2],[10000,5.2],[10000,5.201]]) {
      await p.route('**/data/diagnostics.json',async route=>{
        const response=await route.fetch(),json=await response.json();
        json.E.chart.series[0].values[1]=previousPayers;
        json.E.extraCharts[0].series[0].values[1]=previousARPPU;
        json.E.tables[1].rows[1]=['2026-07',previousPayers,`$${previousPayers*previousARPPU}`,`$${previousARPPU.toFixed(2)}`];
        await route.fulfill({response,json});
      });
      await open('E?metric=35');await p.reload();await pair().locator('svg').waitFor();
      check((await p.locator('[data-driver="payers"]').innerText()).includes(previousPayers===10200?'−200 人':'持平'),'Payer decline or unchanged count is mislabeled');
      check((await p.locator('[data-driver="arppu"]').innerText()).includes(previousARPPU===5.2?'持平':`${previousARPPU>5.2?'下降':'上升'}不足 $0.01/人`),'Rounded ARPPU hides a real small change or invents a movement');
      await checkAxis(`previous payers ${previousPayers}, ARPPU ${previousARPPU}`);
      await p.unroute('**/data/diagnostics.json');
    }
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',sizes,axisStates,checks:['visible income comparison and driver values','positive negative and unchanged drivers','symmetric amounts reconcile','calculation disclosure','observation to income chart','complete issue baseline saved and reloaded','historical baseline preserved on edit','filtered issue baseline','country recomputation and reload','missing scope suppressed','negative contribution and labels','actual evenly spaced signed amount ticks including zero','no browser errors or page overflow']};
  } finally {await context.close();}
}
