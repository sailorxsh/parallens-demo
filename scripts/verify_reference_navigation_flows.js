// Reference destinations must open on demand without changing the current metric.
async(page)=>{
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),rows=[],errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  try{
    for(const [code,id,owner]of[['A',11,14],['F',51,48],['E',35,39],['C',43,46]])
    for(const width of[1366,1600,1920])for(const scale of[100,200]){
      // A same-hash goto can retain the previous disclosure and chart instance.
      await p.goto('about:blank');await p.setViewportSize({width,height:1000});
      await p.goto(`${base}#/${code}?metric=${id}&panel=groups`);
      await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
      await p.evaluate(async n=>{document.documentElement.style.fontSize=n+'%';await document.fonts.ready;},scale);
      await settle();
      const target=p.locator(`#${code}-panel-groups > details`).filter({has:p.locator(`[data-evidence-metric="${owner}"]`)});
      const tid=await target.getAttribute('id'),url=p.url();
      check(!await target.evaluate(n=>n.open),'Reference unexpectedly starts open');
      check(await target.locator('[_echarts_instance_]').count()===0,'Closed reference draws before first use');
      const button=p.locator(`.workspace-location[aria-controls="${tid}"]`);
      await button.focus();await button.press('Enter');
      await target.locator(`[data-evidence-metric="${owner}"] .detail-chart svg`).first().waitFor();await settle();
      const position=await target.evaluate(n=>{
        const heading=n.querySelector('summary'),rect=heading.getBoundingClientRect();
        return{open:n.open,focus:document.activeElement===heading,top:rect.top,bottom:rect.bottom,
          navBottom:document.querySelector('.workspace-locations').getBoundingClientRect().bottom,
          overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      check(position.open&&position.focus&&position.top>=position.navBottom-1&&position.bottom<=1000&&!position.overflow,
        `Reference heading obscured: ${JSON.stringify({code,width,scale,...position})}`);
      check(p.url()===url,'Reference navigation changes selected metric or scope');
      const instances=await target.locator('[_echarts_instance_]').count();
      await target.locator(':scope > summary').press('Enter');
      check(!await target.evaluate(n=>n.open),'Reference cannot be closed by keyboard');
      await p.locator(`#${code}-tab-change`).click();
      check(new URL(p.url()).hash.includes(`metric=${id}`),'Returning to trends changes metric');
      await p.locator(`#${code}-tab-groups`).click();await settle();
      check(!await target.evaluate(n=>n.open),'Returning to groups unexpectedly opens reference');
      await button.focus();await button.press('Enter');await settle();
      check(await target.locator('[_echarts_instance_]').count()===instances,'Reopening duplicates chart instances');
      rows.push({code,id,reference:owner,width,textPercent:scale,instances,keyboardReturn:true});
    }
    check(!errors.length,errors.join('\n'));
    return{status:'PASS',cases:rows.length,rows,errors};
  }finally{await context.close();}
}
