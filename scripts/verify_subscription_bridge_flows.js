// Validate the visible accounting bridge against independent source totals.
async(page)=>{
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),results=[],errors=[];
  p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const chart=()=>p.getByRole('img',{name:/^有效订阅人数流转/});
  const open=async query=>{
    await p.goto(`${base}#/D?metric=18&issue=18&panel=groups${query?`&${query}`:''}`);
    await chart().locator('svg').waitFor();await p.evaluate(()=>document.fonts.ready);
    await p.getByRole('navigation',{name:'分组证据定位'}).getByRole('button',{name:/有效订阅人数流转/}).click();
  };
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});
      for(const productLine of ['', 'Bird','Hunting']) {
        await open(productLine?`productLine=${productLine}`:'');
        await p.locator('.action-record [name="note"]').fill('核对订阅流转，保留原问题草稿');
        const url=p.url();
        const actual=await chart().evaluate(node=>{
          const spec=subscriptionBridgeSpec(),o=echarts.getInstanceByDom(node).getOption(),box=node.getBoundingClientRect();
          return {flow:spec.flow,steps:spec.series[0].values,types:o.series.map(s=>s.type),
            stocks:o.series[3].data.map(d=>Array.isArray(d)?d:d.value),
            positive:o.series[1].data,negative:o.series[2].data,base:o.series[0].data,
            axis:[o.yAxis[0].min,o.yAxis[0].max],texts:[...node.querySelectorAll('svg text')].map(t=>t.textContent),
            clipped:[...node.querySelectorAll('svg text')].filter(t=>{const r=t.getBoundingClientRect();return r.width&&(r.left<box.left-2||r.right>box.right+2||r.top<box.top-2||r.bottom>box.bottom+2);}).map(t=>t.textContent),
            tip:o.tooltip[0].formatter([{dataIndex:4}])};
        });
        const expected=await p.evaluate(async line=>{
          const [metrics,flows]=await Promise.all(['metric-values','subscription-flow'].map(async name=>(await fetch(`./data/${name}.json`)).json()));
          return line?flows.byProductLine[line]:metrics.m21.value;
        },productLine);
        check(JSON.stringify(actual.flow)===JSON.stringify(expected),'Bridge and independent source totals differ');
        const f=expected,net=f.trialPaid+f.directPaid+f.recovered-f.lost;
        check(f.closing-f.opening===net,'Source net additions do not reconcile');
        check(actual.types.join(',')==='bar,bar,bar,scatter','Opening and closing stock are not independent markers');
        check(actual.positive[0]===0&&actual.positive[5]===0&&actual.negative[0]===0&&actual.negative[5]===0,'Stock is drawn as cropped bars');
        check(actual.stocks[0][1]===f.opening&&actual.stocks[5][1]===f.closing,'Stock markers have wrong levels');
        check(actual.positive.slice(1,4).join(',')===[f.trialPaid,f.directPaid,f.recovered].join(',')&&actual.negative[4]===f.lost,'Change bars do not match their own flow counts');
        check(actual.texts.includes(f.opening.toLocaleString('zh-CN'))&&actual.texts.includes(f.closing.toLocaleString('zh-CN'))&&
          actual.texts.includes(`+${f.trialPaid.toLocaleString('zh-CN')}`)&&actual.texts.includes(`−${f.lost.toLocaleString('zh-CN')}`),'Visible stock or signed changes are absent');
        check(actual.clipped.length===0,`Flow labels clipped at ${width}: ${actual.clipped.join(', ')}`);
        check(actual.tip.includes(`-${f.lost.toLocaleString('zh-CN')}`)&&actual.tip.includes(f.closing.toLocaleString('zh-CN')),'Loss tooltip omits sign or resulting stock');
        const panel=chart().locator('..');
        check((await panel.locator('.chart-scale-note').innerText()).includes('点表示期初/期末存量'),'Stock/change encoding is not explained');
        check((await panel.locator(':scope > .table-note').innerText()).includes(`${net>=0?'+':''}${net.toLocaleString('zh-CN')} 人`),'Visible accounting equation omits reconciled net additions');
        await panel.locator('.chart-data summary').click();
        const rows=await panel.locator('.chart-data tbody tr').allTextContents();
        check(rows.length===6&&rows[0].includes(f.opening.toLocaleString('zh-CN'))&&rows[5].includes(f.closing.toLocaleString('zh-CN')),'Complete flow table loses stocks');
        check(rows[4].includes(`-${f.lost.toLocaleString('zh-CN')}`)&&rows[4].includes(f.closing.toLocaleString('zh-CN')),'Loss row differs from plotted change or closing total');
        await panel.locator('.chart-data summary').click();
        await p.getByRole('navigation',{name:'分组证据定位'}).getByRole('button',{name:/有效订阅人数流转/}).click();
        const point=await chart().evaluate(node=>{const e=echarts.getInstanceByDom(node),r=node.getBoundingClientRect(),xy=e.convertToPixel({seriesIndex:3},[5,subscriptionBridgeSpec().flow.closing]);return {x:r.x+xy[0],y:r.y+xy[1]};});
        await p.mouse.click(point.x,point.y);
        await p.waitForFunction(()=>[...document.querySelectorAll('.chart-selected')].some(row=>row.firstElementChild.textContent==='期末'));
        check(p.url()===url&&await p.locator('.action-record [name="note"]').inputValue()==='核对订阅流转，保留原问题草稿','Chart selection changes issue, scope, or draft');
        await panel.locator('.chart-data summary').click();
        await p.getByRole('navigation',{name:'分组证据定位'}).getByRole('button',{name:/有效订阅人数流转/}).click();
        if(width===1600&&!productLine){await p.mouse.move(210,40);await p.screenshot({path:'output/playwright/v60-02-flow-after.png'});}
        results.push({width,productLine:productLine||'all',opening:f.opening,closing:f.closing,net,axis:actual.axis});
      }
    }
    // Verify zero change and identical stocks without invented positive movement.
    await p.route('**/data/metric-values.json',async route=>{
      const response=await route.fetch(),json=await response.json();
      json.m21.value={opening:12400,trialPaid:0,directPaid:0,recovered:0,lost:0,closing:12400};
      await route.fulfill({response,json});
    });
    await p.goto(`${base}?fixture=zero-flow#/D?metric=18&issue=18&panel=groups`);await chart().locator('svg').waitFor();
    const zero=await chart().evaluate(node=>({text:node.textContent,o:echarts.getInstanceByDom(node).getOption()}));
    check(zero.o.series[1].data.every(v=>v===0)&&zero.o.series[2].data.every(v=>v===0)&&zero.text.includes('12,400')&&!zero.text.includes('+530'),'Zero-flow fixture fabricates movement or loses the stock');
    await p.unroute('**/data/metric-values.json');
    await p.route('**/data/metric-values.json',async route=>{
      const response=await route.fetch(),json=await response.json();
      json.m21.value={opening:12020,trialPaid:0,directPaid:0,recovered:0,lost:0,closing:12020};
      await route.fulfill({response,json});
    });
    await p.goto(`${base}?fixture=conflicting-flow#/D?metric=21&panel=groups`);await p.locator('#D-tab-groups').waitFor();
    const invalid=await p.evaluate(()=>({value:metric(21),bridge:subscriptionBridgeSpec()}));
    check(invalid.value.kind==='na'&&invalid.bridge===null&&invalid.value.reason.includes('不闭合'),'Contradictory stocks become fabricated net additions or negative exits');
    check((await p.locator('.detail-kpi[data-metric-id="21"]').innerText()).includes('不闭合'),'Source conflict is hidden from the headline metric');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:['independent source reconciliation','stock dots and signed change bars','visible exact labels','no clipped labels','explicit axis and encoding','tooltip and table consistency','real stock click reveals matching row','issue and draft retention','zero-change rendering','source conflicts are explicit'],results};
  } catch(error) {
    const state=await p.evaluate(()=>({url:location.href,text:document.querySelector('main')?.innerText.slice(0,1400),error:document.querySelector('.load-error')?.textContent}));
    await p.screenshot({path:'output/playwright/v60-flow-failure.png'});
    throw new Error(`${error.message}; ${JSON.stringify(state)}`);
  } finally {await context.close();}
}
