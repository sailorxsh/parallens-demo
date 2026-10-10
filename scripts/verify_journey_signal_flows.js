// Directional signals must follow usable evidence, without inventing a health target.
async(parent)=>{
 const base=new URL('.',parent.url()).href,context=await parent.context().browser().newContext({reducedMotion:'reduce'}),p=await context.newPage();
 const check=(ok,msg)=>{if(!ok)throw new Error(msg);},states=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const open=async query=>{await p.goto(`${base}#/${query?'?'+query:''}`);await p.locator('#trendChart svg').waitFor();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const nodes=()=>p.locator('.journey-card').evaluateAll(ns=>ns.map(n=>({label:n.querySelector('.metric-label').textContent,status:n.querySelector('.node-status').textContent,
  severity:n.querySelector('.status-dot').classList[1],change:n.querySelector('.node-change').textContent,overflow:n.scrollWidth>n.clientWidth+1})));
 const trialEvidence=()=>p.evaluate(()=>{
  const fields={country:'country',appPlatform:'app_platform',productLine:'product_line',subscriptionPlatform:'subscription_platform',plan:'plan',billingCycle:'billing_cycle'};
  const rows=sourceData.trialFacts.records.filter(r=>Object.entries(fields).every(([key,field])=>!filterState[key]||r[field]===filterState[key]));
  const ratio=rows=>rows.length>=30?rows.filter(r=>r.converted).length/rows.length:null;
  const previous=ratio(rows.filter(r=>r.week<=9)),current=ratio(rows.filter(r=>r.week>9));
  return {previous,current,latestCount:rows.filter(r=>r.week===12).length,delta:previous===null||current===null?null:current-previous};
 });
 const assertTrial=async()=>{
  const facts=await trialEvidence(),node=(await nodes())[3];
  const direction=facts.delta===null?null:Math.abs(facts.delta)<.0005?0:Math.sign(facts.delta);
  check(node.severity===(direction<0?'warn':direction>0?'ok':'neutral'),`Trial signal contradicts independently counted records: ${JSON.stringify({node,facts})}`);
  check(node.status===(direction===null?(facts.latestCount<30?'不适用':'缺少可比批次'):direction<0?'近3周低于前9周':direction>0?'近3周高于前9周':'近3周与前9周持平'),`Trial signal omits or changes its comparison windows: ${JSON.stringify({node,facts})}`);
  return facts;
 };
 try{
  for(const width of [1366,1600,1920]){
   await p.setViewportSize({width,height:1000});
   for(const query of ['', 'productLine=Hunting','country=US','country=US&productLine=Hunting','appPlatform=Android&productLine=Bird','country=Other']){
    await open(query);const snapshot=await nodes();check(snapshot.length===6&&snapshot.every(n=>!n.overflow),'Signal text or cards overflow');
    check(snapshot.every(n=>n.status!=='筛后模拟值'&&!n.status.includes('阈值')),'A static health assertion replaces the actual signal');
    check(snapshot[1].severity==='neutral'&&snapshot[4].severity==='neutral'&&snapshot[5].severity==='neutral','An informational denominator claims good health');
    if(query.includes('productLine=Hunting'))check(snapshot[2].status==='不适用'&&snapshot[2].severity==='neutral','Inapplicable activation still displays a warning');
    if(!query){
     const expected=await p.evaluate(()=>{
      const sum=(rows,key)=>rows.reduce((total,w)=>total+w.registrationCohort[key],0),weeks=sourceData.weekly;
      return sum(weeks.slice(8),'valueActivated7dBird')/sum(weeks.slice(8),'birdEligible')-sum(weeks.slice(0,8),'valueActivated7dBird')/sum(weeks.slice(0,8),'birdEligible');
     });
     check(expected<0&&snapshot[2].status==='近4周低于前8周'&&snapshot[2].severity==='warn','Activation signal does not follow weighted cohort counts');
    }
    states.push({width,query,nodes:snapshot,trial:await assertTrial()});
   }
  }
  // Isolated request fixtures exercise a rise, a true tie, and insufficient cohorts.
  await open('');const original=await p.evaluate(()=>structuredClone(sourceData.trialFacts));let fixture;
  await p.route('**/data/trial-facts.json',route=>route.fulfill({json:fixture}));
  for(const scenario of ['rise','tie','small']){
   fixture=structuredClone(original);
   if(scenario==='rise')fixture.records.forEach(r=>{if(r.week>9)r.converted=true;});
   if(scenario==='tie')for(let week=1;week<=12;week++)fixture.records.filter(r=>r.week===week).forEach((r,i)=>r.converted=i<500);
   if(scenario==='small')fixture.records=[...fixture.records.filter(r=>r.week===1).slice(0,29),...fixture.records.filter(r=>r.week===12).slice(0,29)];
   await open('');const facts=await assertTrial();states.push({fixture:scenario,trial:facts,nodes:await nodes()});
  }
  await p.unroute('**/data/trial-facts.json');await open('');
  const contrast=async selector=>p.locator(selector).evaluate(node=>{
   const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number),lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
   let ancestor=node,background;
   while(ancestor){const color=getComputedStyle(ancestor).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'){background=rgb(color);break;}ancestor=ancestor.parentElement;}
   return [...node.querySelectorAll('svg text')].filter(n=>n.getBoundingClientRect().width).map(n=>({text:n.textContent,contrast:ratio(rgb(getComputedStyle(n).fill),background)}));
  });
  const axis=await contrast('#statusChart');
  check(axis.some(n=>n.text==='观鸟')&&axis.some(n=>n.text==='0%')&&axis.every(n=>n.contrast>=4.5),'Subscription chart text lacks sufficient contrast');
  await p.goto(`${base}#/D?panel=groups`);await p.locator('#main[aria-busy=false] .income-workspace').waitFor();
  await p.waitForFunction(()=>[...document.querySelectorAll('.detail-chart')].some(n=>echarts.getInstanceByDom(n)?.getOption().series?.some(s=>s.type==='scatter'&&s.name==='转正率')));
  const points=await p.locator('.detail-chart').evaluateAll(ns=>ns.flatMap(n=>{
   const option=echarts.getInstanceByDom(n)?.getOption();return (option?.series??[]).filter(s=>s.type==='scatter'&&s.name==='转正率').map(s=>s.data);
  }));
  check(points.length===1&&points[0][0].value[0]===45&&points[0][1].value[0]===43.4,`Cohort point values changed: ${JSON.stringify(points)}`);
  const marks=await p.locator('.detail-chart').evaluateAll(ns=>ns.flatMap(node=>{
   const chart=echarts.getInstanceByDom(node),series=chart?.getOption().series?.[0];if(series?.type!=='scatter'||series.name!=='转正率')return [];
   const bounds=node.getBoundingClientRect();
   return series.data.map(point=>{
    const pixel=chart.convertToPixel({seriesIndex:0},point.value),path=[...node.querySelectorAll('svg path')].find(n=>{
     const r=n.getBoundingClientRect();return r.width>5&&r.height>5&&Math.abs((r.left+r.right)/2-bounds.left-pixel[0])<1&&Math.abs((r.top+r.bottom)/2-bounds.top-pixel[1])<1;
    });
    if(!path)return null;
    const css=getComputedStyle(path),rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number),lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const background=[255,254,250],stroke=rgb(css.stroke),ratio=(Math.max(lum(stroke),lum(background))+.05)/(Math.min(lum(stroke),lum(background))+.05);
    return {fill:css.fill,stroke:css.stroke,strokeOpacity:Number(css.strokeOpacity),fillOpacity:Number(css.fillOpacity),contrast:ratio};
   });
  }));
  check(marks.length===2&&marks.every(n=>n&&n.contrast>=3&&n.strokeOpacity===1&&n.fillOpacity===1)&&marks[0].fill!==marks[0].stroke&&marks[1].fill===marks[1].stroke,'Rendered cohort points lack visible contrast and hollow/filled distinction');
  check(!errors.length,errors.join('; '));return {status:'PASS',checks:['signals at three desktop widths','weighted activation comparison','trial direction independently counted from source records',
   'inapplicable metrics stay neutral','informational denominators do not claim health','rise/tie/insufficient-cohort fixtures','readable status axes','hollow/filled cohort points preserve values','no runtime errors'],states,axis,marks};
 }finally{await context.close();}
}
