// Run with playwright-cli run-code --filename=scripts/verify_evidence_flows.js.
// The isolated context leaves the user's local issue records untouched.
async (page) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const cases=[['D',52,''],['A',11,''],['B',24,''],['C',41,''],['C',46,''],
    ['C',46,'deviceModel=K6&firmware=2.8&functionType=Live'],['E',3,''],['G',53,''],['G',54,''],['D',23,'country=US']];
  try {
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:1000});
      await p.goto(base);
      await p.locator('#statusChart svg').waitFor();await p.evaluate(()=>document.fonts.ready);
      const status=await p.locator('#statusChart').evaluate(node=>{
        const outer=node.getBoundingClientRect();
        const tick=[...node.querySelectorAll('svg text')].find(text=>text.textContent==='100%');
        const bounds=tick?.getBoundingClientRect();
        return {found:!!tick,inside:!!bounds&&bounds.left>=outer.left-1&&bounds.right<=outer.right+1};
      });
      check(status.found&&status.inside,`Homepage 100% tick is clipped at ${width}px`);
      for(const [topic,id,filters] of cases) {
        await p.goto(`${base}#/${topic}?metric=${id}${filters?`&${filters}`:''}`);
        const evidence=p.locator(`#metric-evidence-${id}`);await evidence.waitFor();
        await p.evaluate(()=>document.fonts.ready);
        const panels=await evidence.locator('.evidence-pair').evaluateAll(nodes=>nodes.map(pair=>{
          const plot=pair.querySelector('.detail-chart'),table=pair.querySelector('.data-table-scroll');
          const plotBox=plot.getBoundingClientRect(),tableBox=table.getBoundingClientRect(),outer=pair.getBoundingClientRect();
          const option=window.echarts.getInstanceByDom(plot).getOption();
          const rows=[...table.querySelectorAll('tbody tr')].map(row=>[...row.children].map(cell=>cell.textContent));
          const x=option.xAxis[0];
          const timeline=x.data.some(label=>/^(W\d+|\d+\/\d+|\d+月)$/.test(label));
          const parse=value=>value==='不适用'?null:Number(value.replace(/[^\d.\-]/g,''));
          const values=option.series[0].data;
          const exact=values.length===rows.length&&values.every((value,index)=>{
            const actual=parse(rows[index][timeline?1:rows[index].length-1]);
            return value==null?actual===null:Number.isFinite(actual)&&Math.abs(value-actual)<.051;
          });
          const finalLabel=!timeline||!Number.isFinite(values.at(-1))||
            [...plot.querySelectorAll('svg text')].some(text=>text.textContent===rows.at(-1)[1]);
          const clipped=[...plot.querySelectorAll('svg text')].filter(text=>{
            const box=text.getBoundingClientRect();
            return box.width&&box.height&&(box.left<plotBox.left-2||box.right>plotBox.right+2||box.top<plotBox.top-2||box.bottom>plotBox.bottom+2);
          }).map(text=>text.textContent);
          return {title:table.querySelector('caption').textContent,rows:rows.length,
            sideBySide:plotBox.right<tableBox.left&&Math.abs(pair.querySelector('.evidence-plot').getBoundingClientRect().top-tableBox.top)<2,
            contained:plotBox.left>=outer.left-1&&tableBox.right<=outer.right+1,
            tableFits:table.scrollWidth<=table.clientWidth+1,exact,finalLabel,clipped,
            axis:{min:option.yAxis[0].min,max:option.yAxis[0].max}};
        }));
        check(panels.length>0,`Missing paired evidence for #${id} at ${width}px`);
        if(id===54) {
          const quality=await evidence.locator('.evidence-pair').evaluate(node=>{
            const option=echarts.getInstanceByDom(node.querySelector('.detail-chart')).getOption();
            return {values:option.series[0].data,rows:[...node.querySelectorAll('tbody tr')].map(row=>[...row.children].map(cell=>cell.textContent)),
              tip:option.tooltip[0].formatter([{dataIndex:6,seriesIndex:0,value:option.series[0].data[6],marker:''}])};
          });
          check(quality.rows.length===7&&Math.abs(quality.values.at(-1)-2.2)<1e-9,'Quality evidence lost its seven-day history or current value');
          for(const [index,row] of quality.rows.entries()) {
            const loss=Number(row[2].replaceAll(',','')),expected=Number(row[3].replaceAll(',',''));
            check(Math.abs(loss/expected*100-quality.values[index])<.001,'Quality history and daily event evidence disagree');
          }
          check(quality.tip.includes('220次 / 10,000次'),'Quality tooltip lacks the daily event denominator');
          check((await evidence.innerText()).includes('ID映射覆盖率仅有当前快照'),'Quality evidence fabricates mapping coverage history');
          const qualityCharts=await p.locator('.detail-chart').evaluateAll(nodes=>nodes.filter(node=>
            echarts.getInstanceByDom(node)?.getOption().series.some(series=>series.name==='事件丢失率')).length);
          check(qualityCharts===1,'Quality evidence duplicates the same daily trend elsewhere on the page');
        }
        for(const panel of panels) {
          check(panel.sideBySide&&panel.contained,`Evidence blocks overlap or escape at ${width}px: ${JSON.stringify(panel)}`);
          check(panel.tableFits,`Narrow evidence table loses columns at ${width}px: ${panel.title}`);
          check(panel.exact,`Chart and adjacent table disagree at ${width}px: ${panel.title}`);
          check(panel.finalLabel,`The latest chart value is truncated at ${width}px: ${panel.title}`);
          check(panel.clipped.length===0,`Chart labels are clipped at ${width}px: ${panel.clipped.join(', ')}`);
          if(/趋势数据/.test(panel.title)&&/率/.test(panel.title))check(panel.axis.max-panel.axis.min<100,`Rate trend was flattened to 0–100%: ${panel.title}`);
        }
        check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Evidence introduces page-wide horizontal scrolling at ${width}px`);
        results.push({width,topic,id,filters,panels});
      }
    }
    // A 1440px desktop at 200% browser zoom has an effective 720px layout viewport.
    await p.setViewportSize({width:720,height:1000});
    await p.goto(`${base}#/D?metric=52`);await p.locator('#metric-evidence-52 svg').first().waitFor();
    const enlarged=await p.locator('#metric-evidence-52 .evidence-pair').evaluateAll(nodes=>nodes.map(pair=>{
      const plot=pair.querySelector('.evidence-plot').getBoundingClientRect(),table=pair.querySelector('.data-table-scroll').getBoundingClientRect();
      return {stacked:table.top>=plot.bottom-1,chartWidth:pair.querySelector('.detail-chart').clientWidth,
        inside:table.right<=pair.getBoundingClientRect().right+1};
    }));
    check(enlarged.length===2&&enlarged.every(panel=>panel.stacked&&panel.chartWidth>=400&&panel.inside),
      `Enlarged desktop view compresses the chart: ${JSON.stringify(enlarged)}`);
    results.push({effectiveWidth:720,enlarged});
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['complete 100% tick','paired evidence at three desktop widths','complete tables','chart/table agreement','complete latest-value labels','visible chart labels','focused rate trend scales','enlarged desktop reading'],results};
  } finally {await context.close();}
}
