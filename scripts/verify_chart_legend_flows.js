// Keep interactive chart legends keyboard accessible without changing source evidence.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({reducedMotion:'reduce',locale:'zh-CN'}),p=await context.newPage();
  const check=(ok,message)=>{if(!ok)throw new Error(message);},results=[],errors=[];
  p.on('pageerror',error=>errors.push(error.message));
  const state=frame=>frame.evaluate(n=>{
    const box=n.querySelector('#trendChart,.detail-chart'),option=echarts.getInstanceByDom(box).getOption();
    return {selected:option.legend[0].selected??{},series:option.series.map(s=>({name:s.name,data:s.data})),
      axis:[option.yAxis[0].min,option.yAxis[0].max],label:box.getAttribute('aria-label'),
      styles:option.series.map(s=>[s.symbol,s.lineStyle?.type]),scrollY};
  });
  try{
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]){
      await p.setViewportSize({width,height});
      for(const [code,panel] of [['','change'],['A','change'],['B','groups'],['C','groups'],['D','groups'],['E','groups'],['F','groups'],['G','groups']]){
        await p.goto(`${base}#/${code}${code?`?panel=${panel}`:''}`);await p.locator('#main h1').waitFor();
        if(!code)await p.getByRole('button',{name:'并列对照',exact:true}).click();
        await p.evaluate(()=>document.fonts.ready);
        let baseline=null;
        if(code==='A'&&width===1366){
          await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
          await p.locator('.action-record [name="note"]').fill('图例核对中的原问题草稿');
          baseline=await p.locator('.action-record > .table-note').first().innerText();
        }
        const tables=await p.locator('#main table').allTextContents(),route=p.url();
        let legends=0;
        for(const frame of await p.locator('.chart-legend-frame').all()){
          if(!await frame.isVisible()||!await frame.locator('.chart-legend').count())continue;
          legends++;
          const original=await state(frame),buttons=await frame.locator('.chart-legend-button').all();
          check(buttons.length===original.series.length,'Legend loses a data series');
          const geometry=await frame.evaluate(n=>{
            const bounds=n.getBoundingClientRect(),controls=n.querySelector('.chart-legend').getBoundingClientRect();
            return {inside:controls.left>=bounds.left-1&&controls.right<=bounds.right+1&&controls.bottom<=bounds.bottom+1,
              buttons:[...n.querySelectorAll('button')].map(b=>({width:b.offsetWidth,height:b.offsetHeight,insideImage:!!b.closest('[role="img"]')})),
              clipped:[...n.querySelectorAll('svg text')].filter(t=>{const r=t.getBoundingClientRect();return r.width&&r.height&&(r.right>bounds.right+2||r.left<bounds.left-2||r.bottom>controls.top+1);}).map(t=>t.textContent)};
          });
          check(geometry.inside&&geometry.buttons.every(b=>b.width>=24&&b.height>=24&&!b.insideImage),'Legend controls are clipped, too small, or hidden inside the image role');
          check(geometry.clipped.length===0,`Legend overlaps chart labels: ${JSON.stringify(geometry.clipped)}`);
          for(const [index,button] of buttons.entries()){
            await button.focus();const before=await p.evaluate(()=>scrollY);await button.press(index%2?'Space':'Enter');
            const current=await state(frame),name=original.series[index].name;
            check(current.selected[name]===false&&await button.getAttribute('aria-pressed')==='false','Keyboard toggle did not change chart visibility and button state');
            check(await button.evaluate(n=>n===document.activeElement),'Legend toggle loses keyboard focus');
            check(Math.abs(current.scrollY-before)<1,'Legend toggle jumps the document');
          }
          check(await frame.locator('.chart-legend-empty').isVisible(),'All hidden series look like zero values instead of an explicit empty selection');
          const empty=await state(frame);
          check(empty.label.includes('无系列')&&(await p.locator('#announcement').textContent()).includes('无系列'),'Empty selection is not announced');
          check(JSON.stringify(empty.series)===JSON.stringify(original.series)&&JSON.stringify(empty.axis)===JSON.stringify(original.axis),'Display toggles change source values or comparison scale');
          for(const button of buttons)await button.click();
          check(!await frame.locator('.chart-legend-empty').isVisible(),'Mouse toggle cannot restore the graph');
          check((await state(frame)).series.every(s=>(s.name in empty.selected)),'A series lacks its own selection');
        }
        check(JSON.stringify(await p.locator('#main table').allTextContents())===JSON.stringify(tables)&&p.url()===route,'Legend filtering changes complete evidence or business scope');
        if(baseline!==null)check(await p.locator('.action-record [name="note"]').inputValue()==='图例核对中的原问题草稿'&&
          await p.locator('.action-record > .table-note').first().innerText()===baseline,'Legend toggle replaces the issue draft or baseline');
        check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Legend introduces page-wide overflow');
        results.push({code:code||'home',width,height,legends});
      }
    }
    await p.goto(base);await p.getByRole('button',{name:'并列对照',exact:true}).click();
    const first=p.locator('.chart-legend-button').first();await first.click();
    await p.locator('.home-signal[data-metric-id="13"]').click();
    check(await p.locator('.chart-legend-button').count()===0,'Single focused series leaves stale interactive controls');
    await p.getByRole('button',{name:'并列对照',exact:true}).click();
    check(await p.locator('.chart-legend-button[aria-pressed=true]').count()===2,'Rebuilt comparison keeps obsolete hidden-series state');
    await p.setViewportSize({width:900,height:900});
    await p.evaluate(()=>document.documentElement.style.fontSize='24px');await p.setViewportSize({width:901,height:900});
    // Viewport changes return before Chromium's resize handler has updated each SVG.
    // Wait for the application's own chart sizes; do not resize charts from the test.
    await p.waitForFunction(()=>[...document.querySelectorAll('#trendChart,#statusChart,.node-sparkline')]
      .filter(n=>n.clientWidth&&n.clientHeight).every(n=>{
        const instance=echarts.getInstanceByDom(n);
        return !instance||(Math.abs(instance.getWidth()-n.clientWidth)<1.1&&Math.abs(instance.getHeight()-n.clientHeight)<1.1);
      }),null,{timeout:10000});
    const frame=p.locator('#trendChart').locator('..');
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Larger desktop text overflows the page');
    check(await p.locator('.app-sidebar .brand').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Larger desktop text clips the brand into content');
    const legend=await frame.locator('.chart-legend').boundingBox(),axisText=await p.locator('#trendChart svg text').filter({hasText:'W12'}).boundingBox();
    check(legend&&axisText&&axisText.y+axisText.height<=legend.y+1,'Wrapped legend covers the time axis at larger desktop text');
    await p.evaluate(()=>document.documentElement.style.fontSize='16px');
    await p.goto(`${base}#/A?panel=change`);await p.locator('.chart-legend-button').first().waitFor();
    await p.locator('#A-tab-data').click();await p.setViewportSize({width:1600,height:900});await p.locator('#A-tab-change').click();
    const reopened=await p.locator('.chart-legend-frame:visible').first().evaluate(n=>{
      const controls=n.querySelector('.chart-legend').getBoundingClientRect();
      return [...n.querySelectorAll('svg text')].every(t=>t.getBoundingClientRect().bottom<=controls.top+1);
    });
    check(reopened,'A hidden chart loses its legend spacing when reopened after resize');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:['native button semantics outside chart image','mouse, Enter and Space selection','pressed state and live feedback',
      'explicit empty selection','stable source data and scale','complete table and business scope preserved','focus and scroll stability','draft and baseline preservation',
      'three desktop sizes and larger text','no stale controls after redraw','hidden chart resize and reopen','no runtime errors'],results};
  }finally{await context.close()}
}
