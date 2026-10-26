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
 const section=()=>p.locator('.trial-comparison-contributions');
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
  await p.route('**/data/route-D.json*',async route=>{const payload=JSON.parse(fs.readFileSync('data/route-D.json','utf8'));payload.sources.trialFacts=fixture;await route.fulfill({json:payload});});
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]])for(const item of cases){
   await p.setViewportSize({width,height:1000});fixture=recordsFor(item);const values=expected(fixture);
   await p.goto('about:blank');await p.goto(`${base}#/D?metric=18&panel=groups`);await section().waitFor();
   await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
   await section().scrollIntoViewIfNeeded();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const state=await section().evaluate(n=>{
    const min=Number(n.dataset.min),max=Number(n.dataset.max),rows=[...n.querySelectorAll('[data-contribution]')];
    return {min,max,values:rows.map(b=>Number(b.dataset.contribution)),text:n.textContent,tracks:rows.map(b=>({value:Number(b.dataset.contribution),left:parseFloat(b.querySelector('.trial-comparison-bar').style.left),width:parseFloat(b.querySelector('.trial-comparison-bar').style.width),overflow:b.scrollWidth>b.clientWidth+1}))};
   });
   check(state.values.every((v,i)=>Math.abs(v-values[i])<1e-8),`Plotted contribution differs from raw outcome records (${item.name}: ${state.values} versus ${values})`);
   const significant=values.map(v=>Math.abs(v)<1e-10?0:v);
   check(state.min<=Math.min(0,...significant)&&state.max>=Math.max(0,...significant)&&state.max>state.min,'Axis excludes zero or clips a contribution');
   if(significant.every(v=>v<=0)&&significant.some(v=>v<0))check(state.max===0,'Negative-only data reserves an unused positive range');
   if(significant.every(v=>v>=0))check(state.min===0,'Nonnegative data reserves an unused negative range');
   if(significant.some(v=>v<0)&&significant.some(v=>v>0))check(state.min<0&&state.max>0,'Mixed data hides one direction');
   for(const t of state.tracks){const origin=(0-state.min)/(state.max-state.min)*100,pos=(t.value-state.min)/(state.max-state.min)*100;
    // CSSOM serializes percentage values to limited decimal precision; 0.0001% is below 0.002px at desktop widths.
    check(Math.abs(t.left-Math.min(origin,pos))<1e-4&&Math.abs(t.width-Math.abs(pos-origin))<1e-4,`Signed contribution uses nonuniform distance or wrong direction (${item.name}: ${JSON.stringify(t)} expected ${Math.min(origin,pos)},${Math.abs(pos-origin)})`);
    check(!t.overflow,'Contribution label overflows');}
   if(['small-increase','small-decline'].includes(item.name))check(values.filter(v=>Math.abs(v)>1e-10).every(v=>state.text.includes(`${v.toFixed(2)} pp`)),'Small contribution rounded away');
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Contribution introduces page overflow');
   if(item.name==='unchanged')check(state.tracks.every(t=>t.width<1e-8),'Stable contribution has a nonzero bar');
   if(width===1600&&['decline','mixed','small-increase'].includes(item.name))await p.screenshot({path:`output/playwright/trial-axis-${browser.browserType().name()}-${item.name}.png`});
   states.push({fixture:item.name,width,font,...state});
  }
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['32 valid source fixtures/layout states','independent contribution values','zero retained and one-sided data uses its own direction','mixed positive/negative values preserved','uniform distance per unit','small contribution labels retain precision','stable outcome has zero-length bar','contribution row and page overflow']};
 }finally{await context.close();}
}
