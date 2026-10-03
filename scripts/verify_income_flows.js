// Verify income attribution and evidence navigation without touching user records.
async(page)=>{
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1366,height:768},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],sizes=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const open=async hash=>{await p.goto(`${base}#/${hash}`);await p.locator('.detail-finding').waitFor();};
  const pair=()=>p.locator('#metric-evidence-35 .evidence-pair').filter({has:p.getByRole('heading',{name:/订阅净收入变化拆分/})});
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});await open('E');
      const finding=p.locator('.detail-finding');
      const text=await finding.innerText();
      for(const value of ['$2,020','$49,980','$52,000','$1,030','$990','算术拆分不代表价格或经营原因'])check(text.includes(value),`Observation omits ${value}`);
      check((await finding.boundingBox()).y<height-60,'Priority income observation falls below first viewport');
      await finding.locator('.finding-basis summary').click();
      const rows=finding.getByRole('table').getByRole('row');
      check((await rows.nth(1).innerText()).includes('9,800人'),'Previous-month payer count wrong');
      check((await rows.nth(2).innerText()).includes('$52,000'),'Current revenue missing from calculation');
      await finding.getByRole('link',{name:'查看本条指标证据 ↓',exact:true}).click();
      await pair().waitFor();await pair().locator('svg').waitFor();
      const plotText=await pair().locator('svg').textContent();
      check(plotText.includes('$1,030')&&plotText.includes('$990'),'Chart hides contribution values');
      check((await pair().innerText()).includes('合计 +$2,020'),'Calculation does not reconcile revenue change');
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Income evidence causes page overflow');
      if(width===1600) {
        await pair().evaluate(node=>scrollTo({top:node.getBoundingClientRect().top+scrollY-80,behavior:'instant'}));
        await pair().screenshot({path:'output/playwright/v55-income-evidence.png'});
      }
      sizes.push(width);
    }
    await open('E?country=US&metric=35');
    check((await p.locator('.detail-finding').innerText()).includes('模拟分片估算'),'Filtered attribution masquerades as observed facts');
    check(!((await p.locator('.detail-finding').innerText()).includes('增加 $2,020')),'Country selection retains total income change');
    await pair().waitFor();check(await pair().locator('svg').count()===1,'Filtered contribution chart missing');
    await p.reload();await pair().waitFor();
    check(p.url().includes('country=US'),'Refresh loses income scope');
    await open('E?deviceModel=K6&metric=35');
    check(await pair().count()===0,'Unsupported metric scope invents an income attribution');
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
      return {min:options.yAxis[0].min,values:options.series[0].data,text:node.textContent,
        clipped:[...node.querySelectorAll('svg text')].filter(label=>{
          const r=label.getBoundingClientRect();return r.width&&r.height&&(r.left<box.left-2||r.right>box.right+2||r.top<box.top-2||r.bottom>box.bottom+2);
        }).map(label=>label.textContent)};
    });
    check(negative.values[1]===-2000&&negative.min<=-2000,'Negative income contribution clipped to zero');
    await pair().screenshot({path:'output/playwright/v55-income-negative.png'});
    check(!negative.clipped.length&&negative.text.includes('$-2,000'),`Negative contribution label is missing or clipped: ${JSON.stringify(negative)}`);
    check((await p.locator('.detail-finding').innerText()).includes('减少 $2,000'),'Income decrease reported as improvement');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',sizes,checks:['visible income comparison','symmetric amounts reconcile','calculation disclosure','observation to income chart','country recomputation and reload','missing scope suppressed','negative contribution and labels','no browser errors or page overflow']};
  } finally {await context.close();}
}
