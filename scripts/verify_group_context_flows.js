// Isolated desktop probe: current group levels must not imply change contributions.
async(parent)=>{
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:900},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const cases=[['A',13,'','完整周 W12 · 2026-09-13'],
    ['A',13,'week=2&country=US','完整周 W2'],['C',42,'','完整周 W12 · 2026-09-13'],
    ['C',42,'week=2&firmware=2.8','完整周 W2'],['B',24,'','完整月 2026-08'],
    ['C',41,'','快照 2026-09-24'],['D',23,'country=US','月度续订观察期末'],['G',53,'','快照 2026-09-24']];
  cases.push(['C',42,'deviceModel=K6&firmware=2.8','完整周 W12 · 2026-09-13'],
    ['A',13,'country=US','完整周 W12 · 2026-09-13'],['F',48,'country=US','快照 2026-09-24']);
  try{
    for(const width of [1366,1600,1920]){
      await p.setViewportSize({width,height:900});
      for(const [page,id,query,period] of cases){
        await p.goto(`${base}#/${page}?metric=${id}&panel=groups${query?`&${query}`:''}`);
        const evidence=p.locator(`#metric-evidence-${id}`);
        await evidence.locator('.evidence-pair:not([data-comparison-group="device-periods"]) .group-evidence-context:visible').waitFor();
        const note=evidence.locator('.evidence-pair:not([data-comparison-group="device-periods"]) .group-evidence-context:visible').first();
        const text=await note.innerText();
        check(text.includes(period)&&text.includes('不表示跨期变化贡献'),`Wrong group meaning or period: ${text}`);
        check(text.includes(({13:'同一合成频数',23:'互斥合成频数',24:'互斥合成分组',41:'同一行为间隔聚合事实',42:'型号分配为构造样本'})[id]??'独立分布假设'),`Hidden source boundary for #${id}`);
        const pair=note.locator('..').locator('..');
        const disclosure=pair.locator('.workspace-calculation');
        check(await disclosure.count()===1&&!await disclosure.evaluate(node=>node.open),'Source note requires an open calculation table');
        const chart=pair.locator('.detail-chart');await chart.locator('svg').waitFor();
        check((await chart.getAttribute('aria-label')).includes(text),'Accessible graph description omits its scope');
        await disclosure.locator('summary').click();
        const agreement=await pair.evaluate(node=>{
          const option=echarts.getInstanceByDom(node.querySelector('.detail-chart')).getOption();
          const rows=[...node.querySelectorAll('tbody tr')].map(row=>[...row.children].map(cell=>cell.textContent));
          return option.series[0].data.every((value,index)=>{
            const cell=rows[index]?.at(-1);
            return value===null?cell==='不适用':Math.abs(value-Number(cell?.replace(/[^\d.\-]/g,'')))<.051;
          });
        });
        check(agreement,`Graph/table disagreement #${id}`);
        if(query.includes('deviceModel=K6')) {
          const headings=await evidence.locator('h3').allTextContents();
          check(headings.filter(title=>title==='设备型号 · 模拟分组对比').length===1&&
            !headings.includes('设备型号 · 空触发率分组对照'),'The same model metric is plotted twice');
          check(text.includes('当前选择：K6')&&text.includes('未绘制：Hunt Pro'),
            'Removing the repeated comparison loses current or omitted scope');
          const facts=await p.evaluate(async()=>{
            const week=(await (await fetch('./data/weekly.json')).json()).at(-1);
            return ['K6','Bird Lite','Bird Pro'].map(model=>{
              const rows=week.deviceEventsBird.records.filter(row=>row.model===model&&row.firmware==='2.8');
              return rows.reduce((sum,row)=>sum+row.empty,0)/rows.reduce((sum,row)=>sum+row.triggers,0)*100;
            });
          });
          const plotted=await chart.evaluate(node=>echarts.getInstanceByDom(node).getOption().series[0].data);
          check(plotted.length===facts.length&&plotted.every((value,i)=>Math.abs(value-facts[i])<1e-9),
            'Merged evidence changes the model/firmware source counts');
        }
        if(query==='country=US'&&['A','F'].includes(page)) {
          check(!await evidence.getByRole('heading',{name:new RegExp(`^国家/市场 · .*分组对照$`)}).count(),
            'The same country metric is plotted twice');
          check(text.includes('当前选择：美国'),'Merged evidence loses the selected country');
        }
        await disclosure.locator('summary').click();
        const layout=await note.evaluate(node=>{const a=node.getBoundingClientRect(),b=node.nextElementSibling.getBoundingClientRect();
          return {contained:node.scrollWidth<=node.clientWidth+1,separated:a.bottom<=b.top+1,overflow:document.documentElement.scrollWidth>innerWidth};});
        check(layout.contained&&layout.separated&&!layout.overflow,`Context overlap/clipping #${id} at ${width}`);
        if(width===1600&&query===''&&[13,42].includes(id)){
          await evidence.scrollIntoViewIfNeeded();
          await p.screenshot({path:`output/playwright/v95-group-context-${page}.png`});
        }
        results.push({width,page,id,query,period: text,agreement});
      }
    }
    for(const [page,id] of [['D',18],['E',35]]){
      await p.goto(`${base}#/${page}?metric=${id}&panel=change`);
      await p.locator(`#metric-evidence-${id}`).waitFor();
      check(await p.locator(`#metric-evidence-${id} .group-evidence-context`).count()===0,'Actual change decomposition receives a current-level warning');
    }
    for(const [query,title] of [['metric=41&deviceModel=K6','设备型号 · 空触发率分组对照'],
      ['metric=42&firmware=2.8','固件版本 · 空触发率分组对照']]) {
      await p.goto(`${base}#/C?${query}&panel=groups`);
      await p.getByRole('heading',{name:title,exact:true}).waitFor();
      check(await p.getByRole('heading',{name:title,exact:true}).count()===1,
        'Different metric or different grouping dimension was removed as a duplicate');
    }
    await p.goto(`${base}#/G?metric=54&panel=data`);
    const baseline=p.getByRole('table',{name:'异常信号与前期基线',exact:true});await baseline.waitFor();
    const row=baseline.locator('tbody tr').filter({hasText:'埋点丢失率'});
    const first=await p.evaluate(async()=>{
      const h=(await (await fetch('./data/metric-trends.json')).json()).m54;
      return `${h.labels[0]} ${(h.points[0].numerator/h.points[0].denominator*100).toFixed(1)}%`;
    });
    check(await row.locator('td').first().innerText()===first,'Quality comparison names a different date from its source point');
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:[`${cases.length*3} desktop group states`,'selected and default periods','source boundaries visible with calculations closed',
      'accessible descriptions','graph/table values preserved','no overlap or overflow','actual change decompositions preserved',
      'same metric/dimension shown once with current and omitted scope','other metrics and dimensions remain available','quality comparison date matches the source point'],results};
  }finally{await context.close();}
}
