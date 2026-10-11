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
    ['C',41,'','快照 2026-09-24'],['D',23,'country=US','完整周 W12'],['G',53,'','快照 2026-09-24']];
  try{
    for(const width of [1366,1600,1920]){
      await p.setViewportSize({width,height:900});
      for(const [page,id,query,period] of cases){
        await p.goto(`${base}#/${page}?metric=${id}&panel=groups${query?`&${query}`:''}`);
        const evidence=p.locator(`#metric-evidence-${id}`);
        await evidence.locator('.group-evidence-context:visible').waitFor();
        const note=evidence.locator('.group-evidence-context:visible').first();
        const text=await note.innerText();
        check(text.includes(period)&&text.includes('不表示跨期变化贡献'),`Wrong group meaning or period: ${text}`);
        check(text.includes(id===42?'型号分配为构造样本':'独立分布假设'),`Hidden source boundary for #${id}`);
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
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['24 desktop group states','selected and default periods','source boundaries visible with calculations closed',
      'accessible descriptions','graph/table values preserved','no overlap or overflow','actual change decompositions preserved'],results};
  }finally{await context.close();}
}
