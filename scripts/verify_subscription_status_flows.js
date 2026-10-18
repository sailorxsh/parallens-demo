// Subscription composition is computed from disjoint source counts, with an exact table fallback.
async (parent) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',e=>errors.push(e.message));
  const open=async route=>{
    await p.goto(`${base}#/${route}`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const chart=()=>p.locator('#D-panel-groups .detail-chart-panel[data-evidence-metric="5"] .detail-chart');
  try {
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:1000});
      for(const query of ['','productLine=Bird','productLine=Hunting','country=US&appPlatform=iOS']) {
        await open(`D?metric=5${query?`&${query}`:''}`);await chart().locator('svg').waitFor();
        const state=await chart().evaluate(node=>{
          const option=echarts.getInstanceByDom(node).getOption(),r=node.getBoundingClientRect();
          return {keys:option.yAxis[0].data,values:option.series.map(s=>s.data),colors:option.series.map(s=>s.itemStyle.color),
            axes:[option.xAxis[0].min,option.xAxis[0].max],legendSelected:option.legend[0].selectedMode,
            labels:[...node.querySelectorAll('svg text')].map(n=>n.textContent),
            clipped:[...node.querySelectorAll('svg text')].filter(n=>{const b=n.getBoundingClientRect();return b.width&&(b.left<r.left-2||b.right>r.right+2||b.top<r.top-2||b.bottom>r.bottom+2)}).map(n=>n.textContent),
            tips:option.yAxis[0].data.map((_,index)=>option.tooltip[0].formatter(option.series.map((s,seriesIndex)=>({dataIndex:index,seriesIndex,value:s.data[index],seriesName:s.name,marker:''})))),
            source:metric(5).value};
        });
        const rows=Object.values(state.source),expected=rows.map(row=>[row.free??row.noEntitlement??0,
          row.trialEarly+row.trialNearExpiry,row.paidCurrent,row.cancelledButEntitled,row.paymentFailed,row.expired??0]);
        for(const [index,counts] of expected.entries()) {
          const total=Object.values(rows[index]).reduce((n,v)=>n+v,0);
          check(Math.abs(state.values.reduce((sum,series)=>sum+series[index],0)-100)<1e-9,'Status stack is not a complete partition');
          counts.forEach((count,series)=>{
            check(Math.abs(state.values[series][index]-count/total*100)<1e-9,'Status percentage disagrees with disjoint counts');
            check(state.tips[index].includes(`${count.toLocaleString('zh-CN')}人 / ${total.toLocaleString('zh-CN')}人`),'Tooltip lacks exact state/line counts');
          });
        }
        check(JSON.stringify(state.axes)==='[0,100]'&&state.legendSelected===false,'Composition legend changes its denominator or axis');
        check(!state.clipped.length&&!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),`Status labels are clipped at ${width}: ${state.clipped}`);
        if(!query)check(state.labels.includes('83.0%')&&state.labels.includes('73.3%'),'Large status bands lack directly readable percentages');
        results.push({width,query,labels:state.keys,values:state.values});
      }
      // Clicking a real band must reveal that product line's exact table row.
      await open('D?metric=5');await chart().scrollIntoViewIfNeeded();
      const point=await chart().evaluate(node=>{const e=echarts.getInstanceByDom(node),r=node.getBoundingClientRect(),xy=e.convertToPixel({seriesIndex:0},[40,0]);return {x:r.left+xy[0],y:r.top+xy[1]};});
      await p.mouse.click(point.x,point.y);
      await p.waitForFunction(()=>document.querySelector('#D-panel-groups .detail-chart-panel[data-evidence-metric="5"] .chart-data')?.open);
      const row=await p.locator('#D-panel-groups .chart-selected').innerText();
      check(row.includes('观鸟')&&row.includes('47,880人 / 57,680人'),'Band click selects a wrong product or rounded source counts');
      await p.locator('#D-tab-data').click();
      const table=p.locator('#D-panel-data > .data-table-scroll').first();
      check(await table.locator('thead th').count()===2&&await table.locator('tbody tr').count()===13,'Status detail retains redundant empty columns or loses a state');
      check((await table.locator('thead').innerText()).includes('主账号人数（人）'),'Subscription counts lose their explicit entity or unit');
    }
    for(const [page,id,columns,expect] of [['D',2,2,'12,400'],['A',14,2,'1,440'],['B',26,2,'2.1'],
      ['E',40,3,'$5.10/人'],['A',12,4,'2,670'],['G',54,4,'9,650']]) {
      await open(`${page}?metric=${id}&panel=data`);
      const table=p.locator(`#${page}-panel-data > .data-table-scroll`).filter({has:p.getByText('当前筛选完整值',{exact:false})}).first();
      check(await table.locator('thead th').count()===columns&&(await table.innerText()).includes(expect),`Compaction removes a meaningful value for #${id}`);
      if(id===40)check((await table.innerText()).includes('未提供同口径分子、分母明细'),'Compaction conceals missing ratio components');
      if(id===12)check((await table.innerText()).includes('W7')&&(await table.innerText()).includes('80.1%'),'Mature cohort or result disappears from mixed rows');
    }
    // #38 now has reviewed counts for three distinct populations, rather than the old two-column summary.
    await open('E?metric=38&panel=data');
    const structure=p.locator('#E-panel-data > .data-table-scroll').filter({has:p.getByText('用户与设备结构 · 三类对象完整验算',{exact:true})});
    check(await structure.locator('thead th').count()===5&&await structure.locator('tbody tr').count()===10,'Structure detail loses its count/denominator/share columns or any reviewed group');
    const structureText=await structure.innerText();for(const value of ['83,590人','128,600人','65.0%','57,870人','16,000台','143,800台','11.1%'])check(structureText.includes(value),'Structure table loses reviewed evidence '+value);
    check(!structureText.includes('未提供同口径分子、分母明细'),'Known structure counts are labelled as missing');
    await open('D?metric=5&plan=Plus');
    check(await chart().count()===0&&(await p.locator('#metric-evidence-5').innerText()).includes('待补数据'),'Unsupported plan fabricates a subscription mix');
    // A true zero population must not become a plotted 0% or 100% composition.
    await p.route('**/data/metric-values.json',async route=>{
      const response=await route.fetch(),json=await response.json();
      for(const states of Object.values(json.m05.value))for(const key of Object.keys(states))states[key]=0;
      await route.fulfill({response,json});
    });
    await open('D?metric=5');await p.reload();await p.locator('#D-metric-availability-5').waitFor();
    check(await chart().count()===0,'Zero status population is plotted as a known percentage');
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['source counts and six state shares','three widths and product/platform/market scopes',
      'fixed 100% denominator and non-toggling legend','direct labels and clip bounds','real band to exact table row',
      'compact tables preserve counts, ratios and cohort text','missing ratio components remain explicit','unsupported plan and zero population'],results};
  } finally {await context.close();}
}
