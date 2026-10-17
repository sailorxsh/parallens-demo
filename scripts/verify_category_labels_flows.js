// Inspect real category labels after navigation, text enlargement, and component resizing.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),states=[],errors=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const open=async route=>{
    await p.goto(`${base}#/${route}`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
    await p.evaluate(()=>document.fonts.ready);await settle();
  };
  try{
    await open('A');
    const routes=await p.evaluate(()=>[...new Set(dataset.catalog.filter(item=>Object.hasOwn(pages,item.page)).flatMap(item=>{
      const evidence=metricEvidence(item.id,item.page);
      return evidence.specs.some(([,spec])=>!spec.kind&&!isTimelineSpec(spec))?[`${item.page}?metric=${item.id}&panel=groups`]:[];
    }))]);
    routes.push('C?metric=46&panel=groups&deviceModel=K6','F?metric=49&panel=groups&country=US');
    for(const [width,size] of [[1600,16],[1366,32]]){
      await p.setViewportSize({width,height:1000});
      await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);
      for(const route of routes){
        await open(route);
        for(const box of await p.locator('.detail-chart:visible').all())await box.scrollIntoViewIfNeeded();
        await settle();
        const plots=await p.locator('.detail-chart').evaluateAll(nodes=>nodes.filter(n=>n.checkVisibility()).flatMap(box=>{
          const instance=echarts.getInstanceByDom(box),o=instance?.getOption();
          if(!o||o.xAxis[0].type!=='category'||!o.series.every(s=>s.type==='bar'&&!s.stack))return [];
          const bounds=box.getBoundingClientRect(),legend=box.parentElement.querySelector('.chart-legend')?.getBoundingClientRect();
          const labels=o.xAxis[0].data.map(text=>{
            const matches=[...box.querySelectorAll('svg text')].filter(t=>t.textContent===text&&t.getBoundingClientRect().width);
            const r=matches[0]?.getBoundingClientRect();
            return {text,count:matches.length,size:matches[0]?parseFloat(getComputedStyle(matches[0]).fontSize):0,
              inside:!!r&&r.left>=bounds.left-1&&r.right<=bounds.right+1&&r.bottom<=(legend?.top??bounds.bottom)+1,
              left:r?.left,right:r?.right,top:r?.top,bottom:r?.bottom};
          });
          return [{title:box.getAttribute('aria-label'),rotate:o.xAxis[0].axisLabel.rotate,labels,
            overlap:labels.some((a,i)=>labels.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))}];
        }));
        check(plots.length>0,`No category evidence: ${route}`);
        check(plots.every(plot=>plot.rotate===0&&!plot.overlap&&plot.labels.every(l=>l.count===1&&l.inside&&l.size>=12*size/16-.1)),
          `Unreadable category labels: ${route} ${size} ${JSON.stringify(plots)}`);
        states.push({route,width,size,plots});
      }
    }
    // An authored long-label angle remains intact and receives measured vertical space.
    await p.evaluate(()=>document.documentElement.style.fontSize='16px');await open('C?metric=46&panel=groups');
    await p.evaluate(()=>{
      const host=document.createElement('section');host.className='detail-chart-panel';host.id='category-resize-fixture';
      const box=document.createElement('div');box.className='detail-chart';host.append(box);main.append(host);
      drawDetailChart(box,{title:'长标签角度兼容检查',unit:'%',labelRotation:30,
        labels:['观鸟 Android Plus月付','狩猎 Google Play年付'],series:[{name:'前期',values:[1,2]},{name:'本期',values:[2,3]}]});
    });
    const fixture=p.locator('#category-resize-fixture'),box=fixture.locator('.detail-chart');
    await fixture.scrollIntoViewIfNeeded();await fixture.locator('.chart-legend-button').first().click();
    const baseline=await box.evaluate(n=>{
      const o=echarts.getInstanceByDom(n).getOption();
      return {series:o.series.map(s=>({name:s.name,data:s.data})),selected:o.legend[0].selected,axis:o.yAxis.map(a=>[a.min,a.max,a.interval])};
    });
    for(const width of [600,800,600]){
      await fixture.evaluate((n,width)=>n.style.width=`${width}px`,width);await settle();
      const current=await box.evaluate(n=>{
        const instance=echarts.getInstanceByDom(n),o=instance.getOption(),bounds=n.getBoundingClientRect(),legend=n.parentElement.querySelector('.chart-legend').getBoundingClientRect();
        return {series:o.series.map(s=>({name:s.name,data:s.data})),selected:o.legend[0].selected,axis:o.yAxis.map(a=>[a.min,a.max,a.interval]),
          rotate:o.xAxis[0].axisLabel.rotate,sized:Math.abs(instance.getWidth()-n.clientWidth)<1,
          clipped:[...n.querySelectorAll('svg text')].filter(t=>{const r=t.getBoundingClientRect();return r.width&&(r.left<bounds.left-1||r.right>bounds.right+1||r.bottom>legend.top+1);}).map(t=>t.textContent)};
      });
      const {rotate,sized,clipped,...source}=current;
      check(rotate===30&&sized&&!clipped.length,`Long labels/legend clipped after resize: ${JSON.stringify(current)}`);
      check(JSON.stringify(source)===JSON.stringify(baseline),'Component resizing changes evidence or hidden-series state');
    }
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['all default category evidence','filtered technical and sharing comparisons','horizontal short labels',
      'every category visible without overlap','200% text with readable type','authored long-label rotation and legend clearance',
      'component resize preserves data, axes and hidden series','no runtime errors'],states};
  }finally{await context.close();}
}
