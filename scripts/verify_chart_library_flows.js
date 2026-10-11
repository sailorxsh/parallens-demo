// Exercise every retained chart type through real dashboard evidence, not isolated options.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],states=[],types=new Set();
  p.on('pageerror',error=>errors.push(error.message));
  p.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const routes=['','A?metric=11&panel=groups','B?metric=25',
    'C?metric=42&panel=groups','C?metric=46&panel=groups','D?metric=18&panel=groups',
    'D?metric=21&panel=groups','D?metric=5&panel=groups','E?metric=35',
    'E?metric=39&panel=groups','F?metric=49&country=US&panel=groups','G?metric=54'];
  try {
    for(const route of routes) {
      await p.goto(`${base}#/${route}`);
      await p.waitForFunction(()=>typeof lastRenderedHash!=='undefined'&&lastRenderedHash===location.hash&&
        document.querySelector('#main')?.getAttribute('aria-busy')==='false');
      await p.evaluate(()=>document.fonts.ready);
      for(const summary of await p.locator('.workspace-context > summary').all())await summary.evaluate(n=>n.parentElement.open=true);
      for(const box of await p.locator('#trendChart,#statusChart,.detail-chart').all()) {
        if(await box.isVisible())await box.scrollIntoViewIfNeeded();
      }
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const state=await p.evaluate(()=>({version:echarts.version,
        charts:[...document.querySelectorAll('#trendChart,#statusChart,.detail-chart')].filter(n=>n.checkVisibility()).map(n=>{
          const instance=echarts.getInstanceByDom(n),option=instance?.getOption();
          return {label:n.getAttribute('aria-label'),types:option?.series.map(s=>s.type),
            shapeCount:n.querySelectorAll('svg path,svg rect,svg polyline,svg circle').length,
            data:option?.series.map(s=>s.data),marked:option?.series.some(s=>s.markLine?.data?.length||s.markArea?.data?.length)};
        }),overflow:document.documentElement.scrollWidth>innerWidth+1}));
      check(state.version==='5.5.1','The bundle unexpectedly changes the ECharts version');
      check(!state.overflow&&state.charts.length&&state.charts.every(c=>c.types?.length&&c.shapeCount>0),`A visible evidence chart is missing or unrendered: ${route} ${JSON.stringify(state)}`);
      state.charts.forEach(c=>c.types.forEach(type=>types.add(type)));
      check(!await p.locator('.income-panel:not([hidden]) .chart-fallback').count(),'Required evidence fell back instead of drawing');
      states.push({route,...state});
    }
    check(['line','bar','scatter','boxplot','heatmap'].every(type=>types.has(type)),'A required chart type was not exercised');
    check(states[0].charts.some(c=>c.marked),'Homepage comparison marks were not retained');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:['same library version','five chart types in real evidence','SVG shapes visible',
      'homepage marks retained','expanded supplementary evidence','no fallback, overflow or runtime errors'],states};
  } finally {await context.close();}
}
