// Check actual chart coordinates and data preservation, including explicit/structural axes.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),states=[],errors=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const open=async route=>{
    await p.goto(`${base}#/${route}`);await p.locator('#main[aria-busy=false] h1').waitFor();
    await p.evaluate(()=>document.fonts.ready);await settle();
  };
  const charts=()=>p.locator('.detail-chart').evaluateAll(nodes=>nodes.filter(n=>n.checkVisibility()).flatMap(n=>{
    const instance=echarts.getInstanceByDom(n),option=instance?.getOption();if(!option)return [];
    return [{label:n.getAttribute('aria-label'),types:option.series.map(s=>s.type),
      y:option.yAxis.map(a=>({min:a.min,max:a.max,interval:a.interval})),series:option.series.map(s=>({name:s.name,data:s.data}))}];
  }));
  try{
    for(const width of [1366,1600,1920]){
      await p.setViewportSize({width,height:1000});await open('F?metric=49&country=US&panel=groups');
      await p.locator('.income-workspace').scrollIntoViewIfNeeded();await settle();
      const plots=(await charts()).filter(c=>c.types.every(t=>t==='bar'));
      check(plots.length===2,'Sharing and device-count comparisons are not both visible');
      for(const plot of plots){
        const values=plot.series.flatMap(s=>s.data),max=Math.max(...values),axis=plot.y[0];
        check(axis.min===0&&axis.max>=max&&axis.max<=35&&max/axis.max>.5,'A percentage bar is truncated or still compressed by a 100% axis');
      }
      check((await p.locator('.income-evidence .chart-scale-note').allTextContents()).filter(t=>t.includes('柱形从零比较')).length===2,'The adaptive scale is not disclosed for both comparisons');
      check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Comparison page overflows');
      states.push({route:'sharing',width,plots});
    }
    await open('C?metric=46&panel=groups');
    const technical=(await charts()).filter(c=>c.types.every(t=>t==='bar'));
    check(technical.length===2&&technical.every(c=>c.y[0].min===0&&c.y[0].max===5),'An explicit technical-failure range is replaced');
    check(JSON.stringify(technical[0].series[0].data)==='[3,1.5,1]','Technical failure values change');
    await open('D?metric=18');const trend=(await charts())[0];
    check(trend.types[0]==='line'&&trend.y[0].min===43&&trend.y[0].max===46,'Focused line axes change');
    await open('E?metric=39&panel=groups');
    check(await p.locator('.detail-chart').evaluateAll(nodes=>nodes.some(n=>{
      const o=echarts.getInstanceByDom(n)?.getOption();return o?.series?.[0]?.type==='heatmap'&&o.visualMap[0].min===0&&o.visualMap[0].max===100;
    })),'Heatmap comparison loses the common 0–100% color scale');
    await open('');await p.locator('#statusChart svg').waitFor();
    check(await p.locator('#statusChart').evaluate(n=>{
      const o=echarts.getInstanceByDom(n).getOption();return o.xAxis[0].max===100&&o.series.every(s=>s.stack==='status')&&
        [0,1].every(index=>Math.abs(o.series.reduce((sum,s)=>sum+s.data[index],0)-100)<.00001);
    }),'Subscription 100% structure axis changes');
    // Visible component fixtures cover zero, constant, fractional ticks and near-100 rates.
    const fixtures=[{name:'low',values:[.2,.4]}, {name:'constant',values:[.8,.8]},
      {name:'zero',values:[0,0,null]}, {name:'fractional ticks',values:[0,8,10]},
      {name:'near 100',values:[96,99.6,100]}, {name:'explicit',values:[1,1.5],maxY:5},
      {name:'two series',values:[1,2,3],second:[2,1,4]}];
    for(const fixture of fixtures){
      const state=await p.evaluate(fixture=>{
        const panel=document.createElement('section');panel.className='detail-chart-panel';
        const box=document.createElement('div');box.className='detail-chart';panel.append(box);main.append(panel);
        const spec={title:fixture.name,unit:'%',labels:fixture.values.map((_,i)=>`组${i+1}`),
          ...(fixture.maxY!==undefined?{maxY:fixture.maxY}:{}),series:[{name:'前期',values:fixture.values},...(fixture.second?[{name:'本期',values:fixture.second}]:[])]};
        const instance=drawDetailChart(box,spec),option=instance.getOption(),axis=option.yAxis[0];
        const zero=instance.convertToPixel({yAxisIndex:0},0),maximum=instance.convertToPixel({yAxisIndex:0},axis.max);
        const normalized=spec.series.flatMap(s=>s.values.filter(Number.isFinite).map(v=>({value:v,
          heightRatio:(zero-instance.convertToPixel({yAxisIndex:0},v))/(zero-maximum)})));
        return {name:fixture.name,axis:{min:axis.min,max:axis.max,interval:axis.interval},
          values:option.series.map(s=>s.data),normalized,plotHeight:zero-maximum};
      },fixture);
      await settle();
      check(state.axis.min===0&&state.axis.max>0&&state.axis.max<=100,'A fixture has a nonzero baseline or invalid percentage extent');
      check(JSON.stringify(state.values)===JSON.stringify([fixture.values,...(fixture.second?[fixture.second]:[])]),'Adaptive range changes source values or nulls');
      check(state.normalized.every(n=>Math.abs(n.heightRatio-n.value/state.axis.max)<.00001),'Bars are not proportional to their values from zero');
      const drawnHeights=await p.locator('.detail-chart-panel').last().locator('.detail-chart').evaluate(n=>
        [...n.querySelectorAll('svg path,svg rect')].filter(shape=>['rgb(191, 118, 43)','rgb(53, 109, 81)'].includes(getComputedStyle(shape).fill))
          .map(shape=>shape.getBoundingClientRect()).filter(rect=>rect.width>1&&rect.height>.001).map(rect=>rect.height).sort((a,b)=>a-b));
      const expectedHeights=state.normalized.filter(n=>n.value>0).map(n=>n.heightRatio*state.plotHeight).sort((a,b)=>a-b);
      check(drawnHeights.length===expectedHeights.length&&drawnHeights.every((height,index)=>Math.abs(height-expectedHeights[index])<1),
        `Rendered SVG bar geometry differs: ${fixture.name} ${JSON.stringify({drawnHeights,expectedHeights})}`);
      if(fixture.maxY!==undefined)check(state.axis.max===fixture.maxY,'Explicit fixture bounds are ignored');
      const tickLabels=await p.locator('.detail-chart-panel').last().locator('svg text').allTextContents();
      if(fixture.name==='fractional ticks')check(tickLabels.includes('2.5%')&&tickLabels.includes('12.5%'),'Fractional tick spacing is rounded into misleading labels');
      if(fixture.name==='two series'){
        const buttons=p.locator('.detail-chart-panel').last().locator('.chart-legend-button');
        await buttons.last().click();await settle();
        const after=await p.locator('.detail-chart-panel').last().locator('.detail-chart').evaluate(n=>echarts.getInstanceByDom(n).getOption());
        check(after.yAxis[0].max===state.axis.max&&JSON.stringify(after.series.map(s=>s.data))===JSON.stringify(state.values),'Hiding a series changes bounds or evidence');
      }
      states.push({fixture:fixture.name,...state,tickLabels,drawnHeights});
    }
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['three desktop widths','percentage bars use zero and a useful upper bound','scale explanation visible','explicit technical axes retained','line axes retained',
      '100% structure and heatmap retained','zero/constant/fractional/near-100 fixtures','unchanged values and nulls','actual SVG heights proportional from zero','fractional tick precision','hidden-series scale stable','no runtime errors'],states};
  }finally{await context.close();}
}
