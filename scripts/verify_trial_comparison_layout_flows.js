// Real browser probe: related cohort views remain readable, independently verifiable and operable.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:900},reducedMotion:'reduce'});
  const p=await context.newPage(),results=[],errors=[];
  p.setDefaultTimeout(5000);
  p.on('pageerror',error=>errors.push(error.message));
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const open=async(query='')=>{
    await p.goto(`${base}#/D?metric=18&panel=groups${query?'&'+query:''}`);
    await p.locator('#main[aria-busy="false"] h1').waitFor();
    await p.locator('.income-workspace').evaluate(n=>scrollTo({top:n.getBoundingClientRect().top+scrollY-70,behavior:'instant'}));
    await settle();
  };
  const chartState=()=>p.locator('.trial-period-comparisons').evaluate(grid=>{
    const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,charts:[...grid.querySelectorAll('.detail-chart')].map(box=>({
      rect:rect(box),labels:[...box.querySelectorAll('svg text')].map(n=>({text:n.textContent,rect:rect(n)}))
    }))};
  });
  try{
    for(const width of [1366,1600,1920]){
      await p.setViewportSize({width,height:900});
      for(const query of ['', 'country=US', 'country=UK', 'appPlatform=iOS']){
        await open(query);
        check(await p.locator('.trial-period-comparisons > [data-comparison-group="trial-periods"]').count()===2,'Cohort comparison views are missing');
        const state=await chartState();
        check(state.columns===(width===1366?1:2),'Comparison layout does not follow available evidence width');
        check(state.charts.length===2,'A comparison chart was dropped');
        for(const {rect,labels} of state.charts)for(const label of labels){
          check(label.rect.x>=rect.x-2&&label.rect.x+label.rect.width<=rect.x+rect.width+2,`Clipped chart label: ${label.text}`);
        }
        const expected=await p.evaluate(()=>{
          const params=new URLSearchParams(location.hash.split('?')[1]),fields={country:'country',appPlatform:'app_platform'};
          const rows=sourceData.trialFacts.records.filter(r=>Object.entries(fields).every(([key,field])=>!params.get(key)||r[field]===params.get(key)));
          return ['previous','current'].map(period=>{const cohort=rows.filter(r=>r.period===period);return {n:cohort.filter(r=>r.converted).length,d:cohort.length};});
        });
        const pair=p.locator('.trial-period-comparisons .evidence-pair'),period=p.locator('.trial-period-comparisons .period-comparison');
        await pair.locator('summary').click();await period.locator('summary').click();await settle();
        const periodText=await period.locator('table').innerText();
        expected.forEach(({n,d})=>check(periodText.includes(`${(n/d*100).toFixed(1)}%`)&&periodText.includes(n.toLocaleString('en-US'))&&periodText.includes(d.toLocaleString('en-US')),'Period chart/table diverges from raw mature facts'));
        check((await pair.locator('table').innerText()).includes('互斥分组'),'Contribution calculation was removed');
        check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Page overflows after opening both calculations');
        check(await pair.evaluate(n=>n.scrollWidth<=n.clientWidth+1)&&await period.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Calculation escapes its comparison card');
        for(const label of ['转正率变化 · 互斥分组贡献','成熟试用转正率 · 可比批次']){
          const button=p.getByRole('navigation',{name:'分组证据定位'}).getByRole('button',{name:label,exact:true});
          await button.focus();await button.press('Enter');await settle();
          const target=await button.getAttribute('aria-controls');
          check(await p.evaluate(id=>document.getElementById(id).contains(document.activeElement),target),'Evidence location no longer focuses its own chart');
          const heading=await p.locator(`[id="${target}"] h3`).first().boundingBox();
          const navigation=await p.getByRole('navigation',{name:'分组证据定位'}).boundingBox();
          check(heading.y>=navigation.y+navigation.height-2&&heading.y<880,'Evidence heading is covered by sticky navigation');
        }
        // Selecting a real contribution bar still opens its own calculation, not its neighbour.
        await pair.locator('summary').click();
        const plot=pair.locator('.detail-chart');
        const point=await plot.evaluate(box=>{
          const chart=echarts.getInstanceByDom(box),datum=chart.getOption().series[0].data[0];
          const value=typeof datum==='number'?datum:datum.value;
          const [x,y]=chart.convertToPixel({gridIndex:0},[0,value/2]);return {x,y,value};
        });
        check(Number.isFinite(point.x)&&Number.isFinite(point.y),'Contribution click is not inside the plotted coordinate system');
        if(point.value!==0)await plot.click({position:{x:point.x,y:point.y}});
        else {
          // A zero contribution has no clickable bar area; select the nonzero period point instead.
          await period.locator('summary').click();
          const periodPlot=period.locator('.detail-chart');
          const coordinates=await periodPlot.evaluate(box=>{
            const chart=echarts.getInstanceByDom(box),datum=chart.getOption().series[0].data[0];
            const [x,y]=chart.convertToPixel({gridIndex:0},Array.isArray(datum)?datum:datum.value);return {x,y};
          });
          check(Number.isFinite(coordinates.x)&&Number.isFinite(coordinates.y),'Period click has no finite coordinates');
          await periodPlot.click({position:coordinates});
          check(await period.locator('details').evaluate(n=>n.open)&&await period.locator('tr.chart-selected').count()===1,'Period point selection loses its table landing');
          await pair.locator('summary').click();
        }
        if(point.value!==0){
          check(await pair.locator('details').evaluate(n=>n.open)&&await pair.locator('tr.chart-selected').count()===1,'Contribution selection loses its table landing');
          check((await pair.locator('.chart-selection').innerText()).includes('全局筛选保持不变'),'Selection loses scope feedback');
        }
        results.push({width,query,columns:state.columns,expected});
      }
    }
    await p.setViewportSize({width:1600,height:900});await open();
    await p.evaluate(()=>document.documentElement.style.fontSize='24px');await settle();
    check((await chartState()).columns===1,'Text zoom forces unreadable side-by-side plots');
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Text zoom overflows');
    await p.evaluate(()=>document.documentElement.style.fontSize='');
    for(const query of ['week=12','country=Other&plan=Plus','plan=Free']){
      await open(query);check(await p.locator('.trial-period-comparisons').count()===0,'Unavailable contribution creates a misleading paired comparison');
    }
    await p.goto(`${base}#/E?metric=35&panel=groups`);await p.locator('#main[aria-busy="false"] h1').waitFor();
    check(await p.locator('.trial-period-comparisons').count()===0,'Trial-specific layout leaked into another metric');
    check(!errors.length,errors.join('; '));
    return {status:'PASS',results,checks:['three desktop widths','independent raw cohort counts','both calculations readable','keyboard evidence destinations','real chart selection landing','150% text zoom reflow','selected week, small and unavailable scopes','other metrics unchanged','no runtime errors']};
  }finally{await context.close();}
}
