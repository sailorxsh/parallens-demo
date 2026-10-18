// Reconcile rendered signed scales against independent, valid trial-outcome fixtures.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser();
 const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage(),errors=[],states=[];
 p.on('pageerror',e=>errors.push(e.message));const check=(ok,message)=>{if(!ok)throw Error(message);};
 const original=JSON.parse(fs.readFileSync('data/trial-facts.json','utf8'));
 const target=r=>r.product_line==='Bird'&&r.app_platform==='Android'&&r.plan==='Plus'&&r.billing_cycle==='monthly';
 const cases=[{name:'decline',counts:[178,256]},{name:'increase',counts:[200,256]},{name:'both-decline',counts:[178,226]},
  {name:'mixed',counts:[200,236]},{name:'unchanged',counts:[194,256]},{name:'small-opposing',counts:[195,255]},
  {name:'small-increase',counts:[195,256]},{name:'small-decline',counts:[194,255]}];
 let fixture;
 const section=()=>p.locator('#D-panel-groups .evidence-pair').filter({has:p.getByRole('heading',{name:'转正率变化 · 互斥分组贡献',exact:true})});
 const recordsFor=item=>{
  const data=structuredClone(original);
  for(const week of [10,11,12])for(const [group,matches] of [target,r=>!target(r)].entries()){
   const candidates=data.records.filter(r=>r.week===week&&matches(r)&&r.payment_attempted);
   check(candidates.length>=item.counts[group],'Fixture exceeds observed payment attempts');
   candidates.forEach((r,i)=>{r.converted=i<item.counts[group];r.payment_status=r.converted?'succeeded':'failed';});
  }
  return data;
 };
 const expected=data=>{
  const periods=['previous','current'].map(period=>data.records.filter(r=>r.period===period));
  const count=rows=>rows.filter(r=>r.converted).length;
  return [target,r=>!target(r)].map(matches=>(count(periods[1].filter(matches))/periods[1].length-count(periods[0].filter(matches))/periods[0].length)*100);
 };
 try{
  await p.route('**/data/trial-facts.json',route=>route.fulfill({json:fixture}));
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]])for(const item of cases){
   await p.setViewportSize({width,height:1000});fixture=recordsFor(item);const values=expected(fixture);
   await p.goto('about:blank');await p.goto(`${base}#/D?metric=18&panel=groups`);await section().locator('svg').waitFor();
   await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
   await section().scrollIntoViewIfNeeded();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const state=await section().locator('.detail-chart').evaluate(n=>{
    const c=echarts.getInstanceByDom(n),o=c.getOption(),axis=o.yAxis[0],r=n.getBoundingClientRect();
    const tickValues=Array.from({length:Math.round((axis.max-axis.min)/axis.interval)+1},(_,i)=>axis.min+i*axis.interval);
    const ticks=tickValues.map(v=>axis.axisLabel.formatter(v)),pixels=tickValues.map(v=>c.convertToPixel({yAxisIndex:0},v));
    return {values:o.series[0].data.map(d=>d.value),colors:o.series[0].data.map(d=>d.itemStyle.color),min:axis.min,max:axis.max,step:axis.interval,ticks,pixels,
     text:n.textContent,clipped:[...n.querySelectorAll('svg text')].filter(t=>{const b=t.getBoundingClientRect();return b.x<r.x-1||b.right>r.right+1||b.y<r.y-1||b.bottom>r.bottom+1;}).map(t=>t.textContent)};
   });
   check(state.values.every((v,i)=>Math.abs(v-values[i])<1e-8),'Plotted contribution differs from raw outcome records');
   const significant=values.map(v=>Math.abs(v)<1e-10?0:v);
   check(state.min<=Math.min(0,...significant)&&state.max>=Math.max(0,...significant)&&state.max>state.min,'Axis excludes zero or clips a contribution');
   if(significant.every(v=>v<=0)&&significant.some(v=>v<0))check(state.max===0,'Negative-only data reserves an unused positive range');
   if(significant.every(v=>v>=0))check(state.min===0,'Nonnegative data reserves an unused negative range');
   if(significant.some(v=>v<0)&&significant.some(v=>v>0))check(state.min<0&&state.max>0,'Mixed data hides one direction');
   check(new Set(state.ticks).size===state.ticks.length,'Distinct tick values have identical rounded labels');
   if(['small-increase','small-decline'].includes(item.name))check(state.text.includes('0.05pp'),'Actual SVG omits the distinct 0.05-point tick');
   check(state.pixels.slice(2).every((value,i)=>Math.abs((value-state.pixels[i+1])-(state.pixels[1]-state.pixels[0]))<1e-6),'Positive and negative values use unequal distance per unit');
   check(!state.clipped.length,'Actual SVG labels are clipped: '+state.clipped.join(','));
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Contribution introduces page overflow');
   if(item.name==='unchanged')check(state.colors.every(color=>color==='#718078'),'Stable contributions acquire an increase/decrease encoding');
   if(width===1600&&['decline','mixed','small-increase'].includes(item.name))await p.screenshot({path:`output/playwright/trial-axis-${browser.browserType().name()}-${item.name}.png`});
   states.push({fixture:item.name,width,font,...state});
  }
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['32 valid source fixtures/layout states','independent contribution values','zero retained and one-sided data uses its own direction','mixed positive/negative values preserved','uniform distance per unit','distinct tick precision including actual 0.05-point SVG tick','neutral stable outcome','actual SVG bounds and page overflow']};
 }finally{await context.close();}
}
