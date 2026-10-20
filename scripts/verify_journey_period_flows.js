async parent=>{
 const context=await parent.context().browser().newContext({reducedMotion:'reduce',viewport:{width:1600,height:1000}}),page=await context.newPage();
 const results=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 try{
  for(const query of ['', 'country=US','productLine=Bird','appPlatform=Android']){
   await page.goto(`http://127.0.0.1:8765/#/${query?'?'+query:''}`);
   await page.waitForFunction(()=>document.querySelector('#main[aria-busy=false] .node-sparkline[data-metric-id="23"]')?.dataset.drawn==='1');
   const state=await page.evaluate(()=>[9,11,13,18,23,34].map(id=>{
    const box=document.querySelector(`.node-sparkline[data-metric-id="${id}"]:not(.headline-sparkline)`);
    if(!box)return {id,missing:true};
    const option=echarts.getInstanceByDom(box).getOption();
    return {id,text:box.parentElement.textContent,aria:box.getAttribute('aria-label'),labels:option.xAxis[0].data,values:option.series[0].data};
   }));
   const monthly=state.find(s=>s.id===23),snapshot=state.find(s=>s.id===34);
   check(monthly.labels.length===12&&monthly.labels.every(s=>/^\d{4}-\d{2}$/.test(s)),`Monthly axis became weeks: ${query}`);
   check(monthly.text.includes('上月')&&!monthly.text.includes('上周')&&monthly.text.includes('2026-08'),'Renewal comparison is not monthly');
   const delta=monthly.values.at(-1)-monthly.values.at(-2);
   check(monthly.text.includes(Math.abs(delta)<.05?'持平':`${delta>0?'+':''}${delta.toFixed(1)}个百分点`),'Renewal change disagrees with plotted values');
   if(!snapshot.missing)check(snapshot.labels.every(s=>!/^W\d+$/.test(s))&&snapshot.text.includes('上期'),'Rights snapshots mislabeled as weeks');
   else check(query==='productLine=Bird','Unexpected missing rights history');
   check(state.filter(s=>[9,11,13,18].includes(s.id)&&!s.missing).every(s=>s.labels.every(l=>/^W\d+$/.test(l))&&s.text.includes('上周')),'Weekly nodes lost weekly comparison');
   if(!query){check(monthly.values.at(-1)===95&&monthly.values.at(-2)===95.5,'Default monthly source baseline changed');await page.screenshot({path:'output/playwright/v191-review/home-periods.png',fullPage:true});}
   results.push({query,state});
  }
  check(!errors.length,errors.join('\n'));return {status:'PASS',results,errors};
 }finally{await context.close();}
}
