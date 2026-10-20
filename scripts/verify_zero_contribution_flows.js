// A zero contribution remains zero, visible and clickable without changing scope.
async(parent)=>{
 const base=new URL('.',parent.url()).href;
 const context=await parent.context().browser().newContext({reducedMotion:'reduce'}),p=await context.newPage();
 const results=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 try{
  for(const width of [1366,1600,1920])for(const font of [16,32]){
   await p.setViewportSize({width,height:1000});
   await p.goto(`${base}#/D?metric=18&panel=groups`);await p.reload();
   await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
   await p.evaluate(size=>{document.documentElement.style.fontSize=`${size}px`;detailCharts.forEach(c=>{refreshChartTypography(c);c.resize();});},font);
   const box=p.locator('#D-panel-groups .detail-chart').first();await box.locator('svg').waitFor();
   await p.locator('.workspace-locations button').first().click();await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const state=await box.evaluate(n=>{
    const c=echarts.getInstanceByDom(n),o=c.getOption(),r=n.getBoundingClientRect(),xy=c.convertToPixel({seriesIndex:0},[1,0]);
    const tooltip=o.tooltip[0].formatter([0,1].map(seriesIndex=>({dataIndex:1,seriesIndex,seriesName:o.series[seriesIndex].name,value:0,marker:''})));
    return {x:r.x+xy[0],y:r.y+xy[1],values:o.series[0].data.map(d=>d.value),zeros:o.series[1].data,tooltip,scope:JSON.stringify(filterState),storage:JSON.stringify(localStorage)};
   });
   check(state.values[1]===0&&state.zeros[0]===null&&state.zeros[1]===0,'Zero or nonzero value was distorted');
   check((state.tooltip.match(/对总体变化的贡献/g)||[]).length===1,'Tooltip duplicates the zero marker');
   check(state.y>=0&&state.y<1000,`Point outside viewport: ${width}/${font} ${state.y}`);await p.mouse.click(state.x,state.y);
   check((await p.locator('.trial-group-detail h3').innerText()).includes('其他成熟试用'),'Zero point did not select its group');await p.getByRole('button',{name:'查看该组贡献计算',exact:true}).click();
   try{await p.locator('#D-panel-groups .chart-selected').filter({hasText:'其他成熟试用'}).waitFor({timeout:3000});}catch(error){await p.screenshot({path:'/tmp/parallens-zero-fail.png'});throw new Error(`${width}/${font} at ${state.x},${state.y}: ${error.message}`);}
   const after=await p.evaluate(()=>({scope:JSON.stringify(filterState),storage:JSON.stringify(localStorage),text:document.querySelector('#D-panel-groups .chart-selected')?.textContent}));
   check(after.scope===state.scope&&after.storage===state.storage,'Chart inspection changed filters or saved issues');
   check(after.text.includes('2,304 / 9,000')&&after.text.includes('768 / 3,000')&&after.text.endsWith('0.00'),'Wrong evidence row selected');
   await p.locator('.workspace-locations button').first().click();
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const nonzero=await box.evaluate(n=>{const c=echarts.getInstanceByDom(n),r=n.getBoundingClientRect(),v=c.getOption().series[0].data[0].value,xy=c.convertToPixel({seriesIndex:0},[0,v/2]);return {x:r.x+xy[0],y:r.y+xy[1]};});
   await p.mouse.click(nonzero.x,nonzero.y);
   check((await p.locator('.trial-group-detail h3').innerText()).includes('观鸟 Android Plus月付'),`Nonzero bar did not select its group ${width}/${font} at ${nonzero.x},${nonzero.y}`);
   check(!await p.locator('#D-panel-groups .chart-selected').count(),'Group switch retains a misleading selected calculation row');
   check(await box.evaluate(n=>echarts.getInstanceByDom(n).getOption().tooltip[0].enterable===true),'Navigation permanently disabled hover reading');
   results.push({width,font,row:after.text});
  }
  check(!errors.length,errors.join('\n'));
  return {status:'PASS',results,errors};
 }finally{await context.close();}
}
