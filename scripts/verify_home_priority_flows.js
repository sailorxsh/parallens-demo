// Default investigative priority, independently checked against scoped trial records.
async(parent)=>{
 const base=new URL('.',parent.url()).href;
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'});
 const p=await c.newPage(),errors=[],states=[];
 p.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const records=JSON.parse(fs.readFileSync('data/trial-facts.json','utf8')).records;
 const open=async(query='')=>{
  // Full reload tests a fresh automatic selection, rather than a retained manual view.
  await p.goto('about:blank');await p.goto(`${base}#/${query?'?'+query:''}`);
  await p.locator('.home-selection-reason').waitFor();
  await p.evaluate(()=>document.fonts.ready);
 };
 const state=()=>p.evaluate(()=>({focus:homeTrendFocus,mode:homeSelectionMode,
  kind:homeStartingPoint(homeComparisons()).kind,reason:document.querySelector('.home-selection-reason').textContent,
  pressed:[...document.querySelectorAll('.home-signal[aria-pressed=true]')].map(n=>Number(n.dataset.metricId)),
  heading:document.querySelector('.trend-heading h3').textContent,
  overflow:document.documentElement.scrollWidth>innerWidth+1}));
 const rawSupport=filters=>{
  const fields={country:'country',appPlatform:'app_platform',productLine:'product_line'};
  if(filters.week)return false;
  const rows=records.filter(row=>Object.entries(filters).every(([k,v])=>row[fields[k]]===v));
  const periods=['previous','current'].map(period=>rows.filter(row=>row.period===period));
  const matches=row=>row.product_line==='Bird'&&row.app_platform==='Android'&&row.plan==='Plus'&&row.billing_cycle==='monthly';
  const groups=[matches,row=>!matches(row)].map(match=>periods.map(rows=>rows.filter(match))).filter(periods=>periods.some(rows=>rows.length));
  if(groups.length<2||groups.some(periods=>periods.some(rows=>rows.length<30)))return false;
  const rate=rows=>rows.filter(row=>row.converted).length/rows.length;
  return (rate(periods[1])-rate(periods[0]))*100<=-.05;
 };
 try{
  const cases=[{}, {country:'US'},{country:'UK'},{country:'DE'},{country:'Other'},
   {appPlatform:'Android'},{appPlatform:'iOS'},{productLine:'Bird'},{productLine:'Hunting'}];
  for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});
   for(const filters of cases){
    await open(new URLSearchParams(filters).toString());
    await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);
    const s=await state(),supported=rawSupport(filters);
    check((s.kind==='supported')===supported,`Priority disagrees with independent records: ${JSON.stringify(filters)} ${JSON.stringify(s)}`);
    if(supported)check(s.focus===18&&s.reason.includes('分组贡献可验算')&&s.reason.includes('不代表业务损失最大'),'Supported decline has wrong default or misleading basis');
    else check(!s.reason.includes('分组贡献可验算'),'Fallback claims unavailable evidence');
    check(s.mode==='auto'&&!s.overflow&&s.pressed.length<=1,'Automatic selection or desktop layout is invalid');
    check(await p.locator('.home-selection-reset').isHidden(),'Automatic view shows redundant reset');
    states.push({width,size,filters,...s});
   }
  }
  await p.setViewportSize({width:1600,height:1000});await open();
  const activation=p.locator('.home-signal[data-metric-id="13"]');
  await activation.focus();await activation.press('Enter');
  check((await state()).focus===13&&await activation.evaluate(n=>n===document.activeElement),'Manual activation selection loses keyboard focus');
  await p.locator('.filter-bar summary').click();
  await p.getByLabel('国家/市场',{exact:true}).selectOption('US');
  check((await state()).focus===13&&(await state()).mode==='manual','Filter overrides an available manual signal');
  await p.locator('.trend-overview').click();
  await p.getByLabel('产品线',{exact:true}).selectOption('Bird');
  check((await state()).focus===null&&(await state()).mode==='manual','Filter overrides explicit parallel view');
  await p.goBack();await p.locator('.home-results').waitFor();
  check((await state()).focus===null&&!(p.url().includes('productLine=Bird')),'Back loses the saved parallel view');
  await p.goBack();await p.locator('.home-results').waitFor();
  check((await state()).focus===13&&(await state()).mode==='manual'&&!p.url().includes('country=US'),'Back loses prior manual signal');
  await p.goForward();await p.locator('.home-results').waitFor();
  check((await state()).focus===null&&p.url().includes('country=US'),'Forward loses recorded parallel view');
  const reset=p.getByRole('button',{name:'恢复建议起点',exact:true});await reset.focus();await reset.press('Enter');
  const resetState=await state(),focused=await p.evaluate(()=>document.activeElement.outerHTML.slice(0,300));
  check(resetState.focus===18&&resetState.mode==='auto'&&
   await p.locator('.home-signal[data-metric-id="18"]').evaluate(n=>n===document.activeElement),
   `Restoring recommendation loses selection or focus: ${JSON.stringify(resetState)} active=${focused}`);
  await p.locator('.home-comparison-context .insight-link').click();
  await p.locator('#D-panel-groups .detail-chart svg').first().waitFor();
  check(p.url().includes('country=US')&&p.url().includes('metric=18'),'Default evidence entry loses scope or metric');
  await p.goBack();await p.locator('.home-results').waitFor();
  check((await state()).focus===18&&(await state()).mode==='auto','Evidence return loses automatic starting point');
  await p.locator('.home-signal[data-metric-id="13"]').click();
  await p.getByLabel('产品线',{exact:true}).selectOption('Hunting');
  check((await state()).focus===18&&(await state()).mode==='auto'&&(await state()).kind==='unsegmented',
   'Unavailable manual activation must fall back honestly without inventing a Hunting segment');
  await open();
  await p.locator('.home-signal[data-metric-id="13"]').click();
  // Hold only the reading-restoration frame to reproduce a quick action after Back.
  // Release it after the native keyboard action: stale restoration must not steal focus.
  await p.evaluate(()=>{
   const raf=window.requestAnimationFrame;window.heldPriorityFrames=[];
   window.requestAnimationFrame=callback=>{window.heldPriorityFrames.push(callback);return 0;};
   try{restoreReadingView({hash:location.hash,left:scrollX,top:scrollY,disclosures:[],legends:[]});}
   finally{window.requestAnimationFrame=raf;}
  });
  await reset.focus();await reset.press('Enter');
  await p.evaluate(async()=>{
   window.heldPriorityFrames.forEach(callback=>callback());
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  check(await p.locator('.home-signal[data-metric-id="18"]').evaluate(n=>n===document.activeElement),
   'Queued reading restoration steals focus from the newer keyboard choice');
  // Inject into this isolated document only: rendering must not turn stable / improving
  // comparisons or an unavailable source into an adverse-priority recommendation.
  for(const [kind,delta] of [['no-decline',0],['no-decline',1],['unavailable',null]]){
   await p.evaluate(delta=>{
    if(!window.priorityOriginal)window.priorityOriginal=homeComparisons;
    homeComparisons=()=>delta===null?[]:window.priorityOriginal().map(item=>({...item,delta}));
    homeSelectionMode='auto';renderHome();
   },delta);
   const s=await state();check(s.kind===kind&&!s.reason.includes('先看试用转正'),'Non-adverse boundary generates a priority claim');
   states.push({fixture:delta,...s});
  }
  check(!errors.length,errors.join('; '));
  return {status:'PASS',states,checks:['36 desktop/filter/text-size states against raw records',
   'no cross-metric magnitude ranking','single residual group not diagnostic support',
   'manual signal and parallel persist through filters','back/forward restores each reading entry',
   'keyboard reset and queued-restoration focus','group destination preserves scope','unavailable manual signal fallback',
   'stable, improving and unavailable comparisons do not claim adverse priority','no runtime errors']};
 }finally{await c.close();}
}
