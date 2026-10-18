// Approved rates and timing share frequencies; legacy issues keep their original evidence.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),states=[],errors=[];
 const c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage();
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const read=async n=>(await(await parent.request.get(`${base}data/${n}.json`)).json());
 const [source,weekly,metrics]=await Promise.all(['onboarding-duration-facts','weekly','metric-values'].map(read));
 const legacy=JSON.parse(fs.readFileSync('scripts/fixtures/activation-k6-before-onboarding.json','utf8'));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(id,query='')=>{await p.goto(`${base}#/A?metric=${id}${query?'&'+query:''}`);await ready();};
 const module=()=>p.locator('.onboarding-duration'),active=()=>module().locator('.onboarding-plot:not([hidden])'),plot=()=>active().locator('.detail-chart');
 const expected=(id,query)=>{
  const filters=Object.fromEntries(new URLSearchParams(query)),section=source[id===11?'binding':'activation'];
  const cohort=section.cohorts.find(c=>String(c.week)===String(filters.week??12));
  const keys=id===11?['appPlatform','deviceModel','deviceStatus']:['country','appPlatform','deviceModel','productLine'];
  const rows=cohort.records.filter(r=>keys.every(k=>!filters[k]||r[k]===filters[k]));
  const values=rows.flatMap(r=>r.durationCounts.flatMap(([v,n])=>Array(n).fill(v))).sort((a,b)=>a-b);
  const q=p=>{if(values.length<30)return null;const h=(values.length-1)*p;return values[Math.floor(h)]+(values[Math.ceil(h)]-values[Math.floor(h)])*(h-Math.floor(h));};
  return {n:values.length,d:rows.reduce((n,r)=>n+r.eligible,0),p50:q(.5),p90:q(.9)};
 };
 try{
  for(const width of [1366,1600,1920])for(const size of [16,32])for(const id of [11,13])for(const query of ['', 'appPlatform=Android','deviceModel=K6&country=US']){
   await p.setViewportSize({width,height:1000});await open(id,query);await p.evaluate(s=>document.documentElement.style.fontSize=`${s}px`,size);await ready();
   check(await p.locator('.detail-kpi').count()===4,'A top four cards changed');
   const want=expected(id,query),unit=id===11?'分钟':'小时',scale=id===11?60:3600;
   const text=await module().locator('.onboarding-stats').innerText();
   check(text.includes(`${want.n.toLocaleString('zh-CN')} / ${want.d.toLocaleString('zh-CN')}`)&&text.includes(`${(want.p50/scale).toFixed(1)}${unit}`)&&text.includes(`${(want.p90/scale).toFixed(1)}${unit}`),'Timing summary disagrees with independently expanded samples');
   const current=await p.evaluate(id=>metric(id),id);check(current.numerator===want.n&&current.denominator===want.d,'Rate and timing use different denominators');
   const trend=module().getByRole('tab',{name:'耗时趋势',exact:true});await trend.focus();await trend.press('Home');await plot().locator('svg').waitFor();await ready();
   const observed=await plot().evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption(),r=n.getBoundingClientRect();return {types:o.series.map(s=>s.type),data:o.series.map(s=>s.data),labels:o.xAxis[0].data,
    clipped:[...n.querySelectorAll('svg text')].filter(t=>t.textContent.trim()).filter(t=>{const b=t.getBoundingClientRect();return b.left<r.left-2||b.right>r.right+2||b.top<r.top-2||b.bottom>r.bottom+2;}).map(t=>t.textContent)};});
   check(observed.types.every(t=>t==='line')&&observed.labels.length===12&&observed.data[0].at(-1)===want.p50/scale&&observed.data[1].at(-1)===want.p90/scale,'Timing curves lose cohorts, units or percentiles');
   check(!observed.clipped.length,`Timing labels clipped ${width}/${size}/${id}: ${observed.clipped}`);
   const url=p.url();await trend.press('ArrowRight');await plot().locator('svg').waitFor();await ready();
   check(await module().getByRole('tab',{name:'耗时分布',exact:true}).evaluate(n=>document.activeElement===n&&n.getAttribute('aria-selected')==='true'),'Timing tabs lose visible keyboard focus');
   const bars=await plot().evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {type:o.series[0].type,values:o.series[0].data,min:o.yAxis[0].min};});
   check(bars.type==='bar'&&bars.min===0&&bars.values.reduce((n,x)=>n+x,0)===want.n,'Distribution includes failures, drops successes or truncates bar baseline');
   check(p.url()===url&&await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===null,'Timing view changes scope or silently saves an issue');
   if(width===1600&&size===16&&!query){
    await plot().scrollIntoViewIfNeeded();await ready();
    const point=await plot().evaluate(n=>{const e=echarts.getInstanceByDom(n),r=n.getBoundingClientRect(),v=e.getOption().series[0].data[2];const [x,y]=e.convertToPixel({seriesIndex:0},[2,v/2]);return {x:r.x+x,y:r.y+y};});
    await p.mouse.click(point.x,point.y);await ready();check(await active().locator('tr.chart-selected').count()===1,'Distribution native click does not reveal exact bin');
    await module().screenshot({path:`output/playwright/onboarding-${id}-${browser.browserType().name()}.png`});
   }
   if(width===1366&&size===32&&!query){await module().scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/onboarding-${id}-enlarged-${browser.browserType().name()}.png`});}
   await p.locator('#A-tab-groups').click();await ready();check(await p.locator('.onboarding-group-table').count()===2,'Version/model/country timing comparison missing');
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Onboarding evidence overflows desktop or 200% text');
   await p.locator('#A-tab-data').click();await ready();
   const timing=await p.locator('.onboarding-current-table').innerText();
   check(timing.includes(`${(want.p50/scale).toFixed(1)}${unit}`)&&timing.includes(`${(want.p90/scale).toFixed(1)}${unit}`),'Full data view only shows another metric’s duration');
   states.push({width,size,id,query,n:want.n,d:want.d,p50:want.p50,p90:want.p90});
  }
  await p.setViewportSize({width:1600,height:1000});await open(13,'week=2');check((await module().innerText()).includes('W2'),'Selected cohort ignored');
  await p.evaluate(records=>localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(records)),legacy.records);
  await open(13,'deviceModel=K6&issue=13');await p.reload();await ready();await p.getByRole('button',{name:'问题登记',exact:true}).click();
  const form=p.locator('.action-record'),before=Object.values(legacy.records).find(r=>r.evidenceId===13),stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('parallens-demo-actions-v1')));
  check((await form.innerText()).includes('43.0%')&&await p.evaluate(()=>metric(13).numerator===111&&metric(13).denominator===283),'Legacy K6 issue is silently rebased to the new 39.2% sample');
  check(await form.locator('.comparison-evidence-warning').isVisible(),'Changed source/counts are not disclosed to the original issue');
  await form.locator('[name=note]').fill('保留原43%证据的未保存草稿');await p.getByRole('button',{name:'当前指标',exact:true}).click();
  await module().getByRole('tab',{name:'耗时趋势',exact:true}).click();await module().getByRole('tab',{name:'耗时分布',exact:true}).click();
  await p.locator('#A-tab-groups').click();await p.locator('#A-tab-change').click();await p.getByRole('button',{name:'问题登记',exact:true}).click();
  check(await form.locator('[name=note]').inputValue()==='保留原43%证据的未保存草稿','Timing navigation loses legacy draft');
  await form.locator('[name=status]').selectOption('reviewing');await form.getByRole('button',{name:'保存本地记录',exact:true}).click();await p.reload();await ready();
  const after=Object.values(await stored()).find(r=>r.evidenceId===13);for(const k of ['issueId','scope','filters','baseline','baselineAt','comparisonEvidence'])check(JSON.stringify(after[k])===JSON.stringify(before[k]),`Legacy ${k} changed`);
  states.push({kind:'legacy-k6',original:'43.0%',current:'111/283',baselineAndEvidencePreserved:true});
  await p.evaluate(()=>localStorage.clear());
  for(const n of [0,29]){
   const data=structuredClone(source),weeks=structuredClone(weekly),values=structuredClone(metrics);let remaining=n;
   data.activation.cohorts.at(-1).records.forEach(r=>{let count=0;r.durationCounts.forEach(cell=>{const take=Math.min(cell[1],remaining);cell[1]=take;remaining-=take;count+=take;});r.notActivatedWithin7d=r.eligible-count;});
   weeks.at(-1).registrationCohort.valueActivated7dBird=n;Object.assign(values.m13,{numerator:n,value:n/1925});
   for(const [name,json] of [['onboarding-duration-facts',data],['weekly',weeks],['metric-values',values]])await p.route(`**/data/${name}.json`,r=>r.fulfill({json}));
   await open(13);await p.reload();await ready();await module().getByRole('tab',{name:'耗时趋势',exact:true}).click();await ready();
   check((await module().locator('.onboarding-stats').innerText()).includes('成功样本不足30'),'No/small successful sample invents a percentile');
   check(await plot().evaluate(node=>echarts.getInstanceByDom(node).getOption().series.every(s=>s.data.at(-1)===null)),'Unavailable timing becomes a zero-duration endpoint');
   for(const name of ['onboarding-duration-facts','weekly','metric-values'])await p.unroute(`**/data/${name}.json`);states.push({kind:'small-success-sample',n});
  }
  const invalid=structuredClone(source);invalid.activation.cohorts.at(-1).observedThrough='2026-09-25';await p.route('**/data/onboarding-duration-facts.json',r=>r.fulfill({json:invalid}));
  await open(13);await p.reload();await ready();check(await module().count()===0&&(await p.locator('#metric-evidence-13').innerText()).includes('待核对'),'Unobserved source still presents a reliable rate or timing');
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['36 metric/scope/desktop/text states','independent expanded samples','rate/timing same source','12-cohort trend','distribution sum and native bin selection','keyboard tabs','version/model/country tables','legacy K6 source change without record migration','zero/small success gaps','unobserved source rejected']};
 }catch(e){await p.screenshot({path:`output/playwright/onboarding-failure-${browser.browserType().name()}.png`});throw e;}finally{await c.close();}
}
