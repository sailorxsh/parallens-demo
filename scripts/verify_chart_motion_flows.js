// Verify rendered whiskers, rather than only the initial-duration option.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),states=[],errors=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const frame=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const geometry=()=>p.evaluate(()=>{
    const node=[...document.querySelectorAll('.detail-chart')].find(n=>echarts.getInstanceByDom(n)?.getOption().series?.[0]?.type==='boxplot');
    const instance=echarts.getInstanceByDom(node),option=instance.getOption(),values=option.series[0].data[0];
    const expected=Math.abs(instance.convertToPixel({yAxisIndex:0},values[4])-instance.convertToPixel({yAxisIndex:0},values[0]));
    const actual=Math.max(...[...node.querySelectorAll('svg path')].filter(n=>getComputedStyle(n).stroke==='rgb(167, 98, 34)').map(n=>n.getBoundingClientRect().height));
    return {values,expected,actual,animation:option.animation,duration:option.animationDuration,update:option.animationDurationUpdate};
  });
  const complete=async(label,layoutChanged=false)=>{
    if(layoutChanged)await p.waitForFunction(()=>{
      const n=[...document.querySelectorAll('.detail-chart')].find(n=>echarts.getInstanceByDom(n)?.getOption().series?.[0]?.type==='boxplot');
      const c=n&&echarts.getInstanceByDom(n);
      return c&&Math.abs(c.getHeight()-n.clientHeight)<1&&Math.abs(c.getWidth()-n.clientWidth)<1;
    });
    await frame();const state=await geometry();states.push({label,...state});
    check(!state.animation&&state.duration===0&&state.update===0,'Reduced motion still permits initial or update animation');
    check(Math.abs(state.actual-state.expected)<1,`Whiskers are still moving or collapsed: ${JSON.stringify(state)}`);
    check(JSON.stringify(state.values)==='[20,70,170,480,2400]','Reduced motion changes distribution values');
  };
  try{
    await p.goto(`${base}#/A?panel=groups`);
    await p.waitForFunction(()=>[...document.querySelectorAll('.detail-chart')].some(n=>echarts.getInstanceByDom(n)?.getOption().series?.[0]?.type==='boxplot'));
    await complete('first visible frames');
    const tables=await p.locator('#main table').allTextContents();
    await p.setViewportSize({width:1366,height:900});await complete('desktop resize',true);
    await p.evaluate(()=>document.documentElement.style.fontSize='24px');await complete('text enlargement',true);
    await p.emulateMedia({reducedMotion:'no-preference'});await frame();
    check((await geometry()).animation,'Normal motion preference is not restored');
    await p.emulateMedia({reducedMotion:'reduce'});await complete('live preference change');
    check(JSON.stringify(await p.locator('#main table').allTextContents())===JSON.stringify(tables),'Motion preference changes table evidence');
    await p.evaluate(()=>document.documentElement.style.fontSize='');
    await p.goto(`${base}#/A`);await p.locator('.chart-legend-button').first().click();
    const selection=()=>p.locator('.detail-chart').first().evaluate(n=>echarts.getInstanceByDom(n).getOption().legend[0].selected);
    const selected=await selection();
    await p.emulateMedia({reducedMotion:'no-preference'});await frame();
    await p.emulateMedia({reducedMotion:'reduce'});await frame();
    check(JSON.stringify(await selection())===JSON.stringify(selected),'Motion preference resets a hidden series');
    check(await p.locator('.chart-legend-button').first().getAttribute('aria-pressed')==='false','Motion preference resets legend controls');
    await p.goto(`${base}#/`);await p.locator('#trendChart svg').waitFor();
    await p.emulateMedia({reducedMotion:'no-preference'});await frame();
    check(await p.locator('.node-sparkline').evaluateAll(nodes=>{
      const options=nodes.map(n=>echarts.getInstanceByDom(n)?.getOption()).filter(Boolean);
      return options.length>0&&options.every(option=>!option.animation);
    }),'Authored static sparklines become animated');
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['complete whiskers on first visible frames','resize and text enlargement','live motion preference','unchanged distribution and tables','hidden legend selection preserved','static sparklines remain static','no runtime errors'],states};
  }finally{await context.close();}
}
