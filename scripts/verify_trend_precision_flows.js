async page=>{
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};
 await page.goto('http://127.0.0.1:8765/#/B');await page.locator('#topic-B-metric-27 .headline-trend').waitFor();
 const real=await page.evaluate(()=>{const h=metricHistory(27);return {delta:h.values.at(-1)-h.values.at(-2),text:document.querySelector('#topic-B-metric-27 .headline-trend-label').textContent,aria:document.querySelector('#topic-B-metric-27 .headline-sparkline').getAttribute('aria-label')};});
 check(real.delta!==0&&Math.abs(real.delta)<.05,'Expected source-backed small movement fixture');
 check(real.text.includes(real.delta>0?'上升不足':'下降不足')&&!real.text.includes('持平'),'Nonzero source movement hidden');
 check(real.aria.includes('不足'),'Chart accessible summary disagrees');
 const boundary=await page.evaluate(()=>{
  const original=metricHistory;const results=[];
  try{for(const delta of [0,.0001,-.0001,.049,-.049,.051,-.051,1,-1]){
   metricHistory=()=>({title:'回归用率',labels:['W1','W2'],values:[50,50+delta],unit:'%',note:'隔离测试'});
   results.push({delta,headline:headlineTrend(11).textContent,journey:nodeTrendDetails(11).textContent});
  }}finally{metricHistory=original;}return results;
 });
 for(const row of boundary)for(const kind of ['headline','journey']){
  const text=row[kind];if(row.delta===0)check(text.includes('持平'),'Zero lost equality');
  else if(Math.abs(row.delta)<.05)check(text.includes(row.delta>0?'上升不足':'下降不足')&&!text.includes('持平'),'Small movement lost '+JSON.stringify(row));
  else check(text.includes(row.delta.toFixed(1)),'Ordinary change altered');
 }
 await page.reload();await page.locator('#topic-B-metric-27 .headline-trend').waitFor();
 for(const width of [1366,1600,1920]){await page.setViewportSize({width,height:1000});for(const font of [16,32]){await page.evaluate(v=>document.documentElement.style.fontSize=v+'px',font);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Trend text causes overflow');}}
 return {status:'PASS',real,boundary};
}
