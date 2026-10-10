// Weekly date labels must retain cohort identities, evidence and keyboard legends.
async(parent)=>{
 const base=new URL('.',parent.url()).href;
 const context=await parent.context().browser().newContext({locale:'zh-CN',reducedMotion:'reduce'}),p=await context.newPage();
 const results=[],errors=[],check=(ok,message)=>{if(!ok)throw new Error(message);};
 p.on('pageerror',e=>errors.push(e.message));
 try{
  for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]){
   await p.setViewportSize({width,height});
   for(const code of ['', 'A','C','D']){
    await p.goto(`${base}#/${code}`);
    const box=p.locator(code?'.income-panel:not([hidden]) .detail-chart':'#trendChart').first();
    await box.locator('svg').waitFor();await p.evaluate(()=>document.fonts.ready);
    await p.waitForFunction(selector=>{
     const n=document.querySelector(selector),option=n&&echarts.getInstanceByDom(n)?.getOption();
     return option?.xAxis[0].axisLabel.rich?.date;
    },code?'.income-panel:not([hidden]) .detail-chart':'#trendChart');
    const state=await box.evaluate(n=>{
     const option=echarts.getInstanceByDom(n).getOption(),bounds=n.getBoundingClientRect();
     const labels=option.xAxis[0].data,format=option.xAxis[0].axisLabel.formatter;
     const texts=[...n.querySelectorAll('svg text')].map(t=>({text:t.textContent,rect:t.getBoundingClientRect().toJSON()}));
     const weeks=sourceData.weekly.map(w=>({label:`W${w.week}`,end:w.weekEnd}));
     const tooltip=option.tooltip[0].formatter([{dataIndex:labels.length-1,seriesIndex:0,seriesName:option.series[0].name,value:option.series[0].data.at(-1),marker:''}]);
     return {labels,formatted:labels.map(format),weeks,texts,bounds:bounds.toJSON(),tooltip,
       note:n.closest('.signal-chart,.detail-chart-panel,.evidence-plot')?.textContent??n.parentElement.textContent};
    });
    check(state.labels.length===12&&state.labels[0]==='W1'&&state.labels.at(-1)==='W12','Weekly identity or point count changed');
    for(const [i,label] of state.labels.entries()){
     const end=new Date(state.weeks.find(w=>w.label===label).end+'T00:00:00Z');
     check(state.formatted[i]===`{week|${label}}\n{date|${end.getUTCMonth()+1}/${end.getUTCDate()}}`,'Axis date does not match source week end');
    }
    check(state.texts.some(t=>t.text==='6/28')&&state.texts.some(t=>t.text==='9/13'),'First/last dates are missing');
    check(state.tooltip.includes('W12 · 9/7–9/13'),'Tooltip loses complete cohort period');
    check(state.texts.every(t=>t.rect.left>=state.bounds.left-2&&t.rect.right<=state.bounds.right+2&&t.rect.bottom<=state.bounds.bottom+2),'Date or value labels escape plot');
    const dates=state.texts.filter(t=>/^\d+\/\d+$/.test(t.text));
    check(dates.every((t,i)=>!i||t.rect.left>=dates[i-1].rect.right-1),'Date labels overlap each other');
    results.push({page:code||'HOME',width,dates:dates.map(t=>t.text)});
   }
  }
  await p.goto(`${base}#/D?metric=18&week=12`);await p.locator('.income-panel:not([hidden]) .detail-chart svg').first().waitFor();
  check(await p.locator('.income-panel:not([hidden]) .detail-chart svg text').getByText('9/13',{exact:true}).count()>0,'Selected week lacks its own date');
  await p.goto(`${base}#/G?metric=54`);await p.locator('.income-panel:not([hidden]) .detail-chart svg').first().waitFor();
  const daily=await p.locator('.income-panel:not([hidden]) .detail-chart').first().evaluate(n=>echarts.getInstanceByDom(n).getOption().xAxis[0]);
  check(daily.data[0]==='9/18'&&daily.data.at(-1)==='9/24'&&!daily.axisLabel.rich?.date,'Daily dates were remapped as weeks');
  check(!errors.length,`Page errors: ${errors.join('; ')}`);
  return {status:'PASS',checks:7,results};
 }finally{await context.close();}
}
