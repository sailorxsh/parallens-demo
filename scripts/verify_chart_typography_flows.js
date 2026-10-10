// Exercise rendered SVG text, enlargement, and preservation of evidence/legend state.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),states=[],errors=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',e=>errors.push(e.message));
  const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const open=async route=>{
    await p.goto(`${base}#/${route}`);
    await p.waitForFunction(()=>typeof lastRenderedHash!=='undefined'&&lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
    if(route==='E?metric=39&panel=groups')await p.locator('.workspace-context > summary').filter({hasText:'其他付费结构与型号对照'}).click();
    if(route==='E')await p.locator('.workspace-context > summary').filter({hasText:'查看付款人数与ARPPU趋势'}).click();
    await settle();
  };
  const reveal=async()=>{
    for(const box of await p.locator('#trendChart,#statusChart,.detail-chart').all()) {
      if(!await box.isVisible())continue;
      await box.scrollIntoViewIfNeeded();
      await p.waitForFunction(n=>!!echarts.getInstanceByDom(n),await box.elementHandle());
    }
    await settle();
  };
  const evidence=()=>p.evaluate(()=>[...document.querySelectorAll('#trendChart,#statusChart,.detail-chart')]
    .filter(n=>n.checkVisibility()&&getComputedStyle(n).visibility!=='hidden')
    .map(n=>{
      const o=echarts.getInstanceByDom(n).getOption();
      return {label:n.getAttribute('aria-label'),series:o.series.map(s=>({name:s.name,data:s.data})),
        x:o.xAxis.map(a=>({data:a.data,min:a.min,max:a.max,interval:a.interval})),
        y:o.yAxis.map(a=>({data:a.data,min:a.min,max:a.max,interval:a.interval})),selected:o.legend?.[0]?.selected};
    }));
  const typography=()=>p.evaluate(()=>{
    const min=12*Math.max(1,parseFloat(getComputedStyle(document.documentElement).fontSize)/16),charts=[];
    for(const box of document.querySelectorAll('#trendChart,#statusChart,.detail-chart')) {
      const b=box.getBoundingClientRect();if(!box.checkVisibility()||getComputedStyle(box).visibility==='hidden')continue;
      const texts=[...box.querySelectorAll('svg text')].filter(t=>t.textContent&&t.getBoundingClientRect().width);
      const legend=box.parentElement.querySelector('.chart-legend')?.getBoundingClientRect();
      charts.push({label:box.getAttribute('aria-label'),types:echarts.getInstanceByDom(box)?.getOption().series.map(s=>s.type)??['NOT_INITIALIZED'],count:texts.length,
        minSize:texts.length?Math.min(...texts.map(t=>parseFloat(getComputedStyle(t).fontSize))):null,
        small:texts.filter(t=>parseFloat(getComputedStyle(t).fontSize)<min-.1).map(t=>t.textContent),
        clipped:texts.filter(t=>{const r=t.getBoundingClientRect();return r.left<b.left-2||r.right>b.right+2||r.top<b.top-2||r.bottom>b.bottom+2||(legend&&r.bottom>legend.top+1);}).map(t=>t.textContent)});
    }
    return {min,charts,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  try{
    const routes=['','A','B','C','D','E','F','G','E?metric=39&panel=groups','A?metric=11&panel=groups','D?metric=5&panel=groups','D?metric=18&panel=groups'];
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:1000});
      for(const route of routes) {
        await p.evaluate(()=>document.documentElement.style.fontSize='');await open(route);await reveal();
        const state=await typography();
        check(!state.overflow&&state.charts.length>0&&state.charts.every(c=>!c.types.includes('NOT_INITIALIZED')&&!c.small.length&&!c.clipped.length),`Normal chart text: ${route} ${width} ${JSON.stringify(state)}`);
        states.push({route,width,scale:1,...state});
      }
    }
    await p.setViewportSize({width:1366,height:1000});
    for(const route of routes) {
      await p.evaluate(()=>document.documentElement.style.fontSize='');await open(route);await reveal();
      const before=await evidence(),tables=await p.locator('#main table').allTextContents();
      for(const size of [24,32,16]) {
        await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await settle();await reveal();
        const state=await typography(),after=await evidence();
        check(!state.overflow&&state.charts.length>0&&state.charts.every(c=>!c.types.includes('NOT_INITIALIZED')&&!c.small.length&&!c.clipped.length),`Enlarged chart text: ${route} ${size} ${JSON.stringify(state)}`);
        check(JSON.stringify(after)===JSON.stringify(before),'Text scale changes source values, axes, selections or chart identity');
        check(JSON.stringify(await p.locator('#main table').allTextContents())===JSON.stringify(tables),'Text enlargement changes full data tables');
        states.push({route,width:1366,scale:size/16,...state});
      }
    }
    await open('A');await reveal();
    const button=p.locator('.chart-legend-button').first();await button.click();
    const before=await evidence();
    await p.evaluate(()=>document.documentElement.style.fontSize='32px');await settle();await reveal();
    check(JSON.stringify(await evidence())===JSON.stringify(before),'Enlargement resets a user-hidden series');
    check(await button.getAttribute('aria-pressed')==='false','Enlargement resets legend button state');
    const tooltip=await p.locator('.detail-chart').first().evaluate(box=>{
      const instance=echarts.getInstanceByDom(box);instance.dispatchAction({type:'showTip',seriesIndex:1,dataIndex:11});
      return instance.getOption().tooltip[0].textStyle.fontSize;
    });
    check(tooltip===26,'Tooltip does not honor enlarged reading size');
    await settle();
    const tip=await p.locator('.detail-chart').first().evaluate(box=>{
      const node=[...box.querySelectorAll('div')].find(n=>getComputedStyle(n).position==='absolute'&&getComputedStyle(n).visibility==='visible'&&n.textContent.includes('W12'));
      if(!node)return null;
      const r=node.getBoundingClientRect(),b=box.getBoundingClientRect();
      return {size:parseFloat(getComputedStyle(node).fontSize),inside:r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1};
    });
    check(tip?.size===26&&tip.inside,`Actual tooltip is small or escapes its chart: ${JSON.stringify(tip)}`);
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['rendered SVG minimum 12px','three desktop widths','150% and 200% text and restoration',
      'chart/legend containment','unchanged series, axes and tables','hidden series survives enlargement','tooltip follows text scale','no runtime errors'],states};
  }finally{await context.close();}
}
