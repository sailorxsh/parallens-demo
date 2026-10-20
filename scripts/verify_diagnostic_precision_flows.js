async page=>{
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};
 await page.goto('http://127.0.0.1:8765/#/B');await page.locator('#topic-B-metric-27').waitFor();
 const actual=await page.evaluate(()=>({headline:headlineTrend(27).textContent,details:metricInspector(27,'B').textContent}));
 check(actual.headline.includes('下降不足')&&actual.details.includes('下降不足'),'Overview and details disagree on actual #27 movement');
 await page.goto('http://127.0.0.1:8765/#/A');await page.locator('#topic-A-metric-13').waitFor();
 const cases=await page.evaluate(()=>{
  const history=metricHistory,compare=weeklyRateComparison;
  const rows=[];
  try{for(const delta of [0,.001,-.001,.049,-.049,.1,-.1]){
   const comparison={id:13,delta,beforeLabel:'前期',afterLabel:'本期',beforeRate:50,afterRate:50+delta};
   weeklyRateComparison=()=>comparison;
   const card=findingComparison(comparison),status=journeyStatus(13);
   rows.push({delta,home:homeComparisonChange(comparison),finding:card.querySelector('.finding-comparison-change').textContent,direction:card.querySelector('.finding-comparison-change').dataset.direction,status});
  }
  }finally{metricHistory=history;weeklyRateComparison=compare;}return rows;
 });
 await page.goto('http://127.0.0.1:8765/#/E');await page.locator('#topic-E-metric-35').waitFor();
 cases.push(await page.evaluate(()=>{const history=metricHistory;try{metricHistory=()=>({labels:['2026-07','2026-08'],values:[4,4.01],details:[],unit:'美元/人'});return {money:filteredFinding('E',35).text};}finally{metricHistory=history;}}));
 for(const row of cases){if(row.money){check(row.money.includes('+$0.01/人')&&!row.money.includes('持平'),'One cent change hidden');continue;}
  for(const text of [row.home,row.finding,row.status.status]){if(row.delta===0)check(text.includes('持平'),'Zero no longer equal');else if(Math.abs(row.delta)<.05)check(text.includes(row.delta>0?'上升不足':'下降不足')&&!text.includes('持平'),'Small movement hidden');}
  if(Math.abs(row.delta)<.05)check(row.direction==='neutral'&&row.status.severity==='neutral','Display correction changed warning threshold');
 }
 return {status:'PASS',actual,cases};
}
