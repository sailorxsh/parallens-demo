// Counts retain their business unit across cards, plotted labels and tooltips.
async (parent) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const counts=[['D',2,'人'],['B',4,'人'],['A',9,'人'],['A',15,'台'],
    ['A',16,'台'],['E',34,'人'],['D',52,'人'],['G',53,'条']];
  const open=async(route)=>{
    await p.goto(`${base}#/${route}`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  try {
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:1000});
      for(const [page,id,unit] of counts) {
        await open(`${page}?metric=${id}&panel=groups`);
        const plot=p.locator(`#metric-evidence-${id} .evidence-pair[data-evidence-kind="groups"] .detail-chart`).first();
        await plot.locator('svg').waitFor();
        const state=await plot.evaluate((node,{id,unit})=>{
          const option=echarts.getInstanceByDom(node).getOption(),values=option.series[0].data;
          const labels=[...node.querySelectorAll('svg text')].map(node=>node.textContent);
          const tooltip=option.tooltip[0].formatter([{dataIndex:0,seriesIndex:0,value:values[0],marker:'',seriesName:option.series[0].name}]);
          const summary=metricCardSummary(id);
          return {values,labels,tooltip,unit:summary.unit,count:metric(id).value,
            completeLabels:values.every(value=>labels.includes(`${number(value)}${unit}`)),
            overflow:document.documentElement.scrollWidth>innerWidth+1};
        },{id,unit});
        check(state.unit===unit&&state.completeLabels&&state.tooltip.includes(unit),`Unit mismatch for #${id} at ${width}: ${JSON.stringify(state)}`);
        check(!state.overflow,`Unit labels cause page overflow for #${id} at ${width}`);
        if(id===53)check(state.count===7&&JSON.stringify(state.values)==='[5,1,1,0]'&&!/\d人/.test(state.tooltip),'Anomaly events are being treated as people or source counts changed');
        if(id===16) {
          await p.getByRole('button',{name:'全部指标',exact:true}).click();
          const row=p.locator('.metric-inventory tbody tr').filter({has:p.locator('.metric-inventory-link',{hasText:'新增激活设备'})});
          check((await row.innerText()).includes('2,450台'),'Newly activated devices lack their unit in the metric catalog');
        }
        results.push({width,page,id,unit,values:state.values});
      }
      await open('F?metric=48');
      const metadata=await p.locator('#metric-evidence-48 .evidence-meta').innerText();
      check(metadata.includes('2026-09-24 主账号当前绑定关系快照')&&!metadata.includes('最近完整月'),'Binding snapshot is mislabeled as a complete-month observation');
      const value=await p.evaluate(()=>metric(48));
      check(value.numerator===18128&&value.denominator===82400,'Snapshot wording changed the underlying multi-device counts');
      await p.locator('#metric-evidence-48 .issue-register').click();
      check((await p.locator('.action-record').innerText()).includes('快照 2026-09-24'),'New issue baseline lost its snapshot date');
      results.push({width,id:48,metadata});
    }
    for(const query of ['country=US','anomalyType=Business']) {
      await open(`G?metric=53&panel=groups&${query}`);
      const plot=p.locator('#metric-evidence-53 .evidence-pair[data-evidence-kind="groups"] .detail-chart').first();
      const state=await plot.evaluate(node=>{
        const option=echarts.getInstanceByDom(node).getOption(),values=option.series[0].data;
        const labels=[...node.querySelectorAll('svg text')].map(node=>node.textContent);
        return {values,labels,tooltip:option.tooltip[0].formatter([{dataIndex:0,seriesIndex:0,value:values[0],marker:'',seriesName:option.series[0].name}])};
      });
      check(state.values.filter(Number.isFinite).every(value=>state.labels.includes(`${value}条`))&&state.tooltip.includes('条')&&!/\d人/.test(state.tooltip),'Filtered event count lost its unit');
      check((await p.locator('#metric-evidence-53 .evidence-meta').innerText()).includes('统计对象：异常事件'),'Time grain is still described as the statistical entity');
      results.push({query,id:53,...state});
    }
    check(!errors.length,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['eight business count units at three widths','plotted labels and hover units',
      'new-device catalog unit','anomaly source counts unchanged','binding snapshot metadata and registration baseline',
      'filtered event units and statistical entity'],results};
  } finally {await context.close();}
}
