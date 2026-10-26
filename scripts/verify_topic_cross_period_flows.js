// Approved A/D cross-period discovery: scope, unavailable states and navigation.
async parent=>{
 const base=new URL('.',parent.url()).href,c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),results=[],errors=[];
 const check=(ok,m)=>{if(!ok)throw Error(m)},ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready)};
 const open=async hash=>{await p.goto(base+'#/'+hash);await ready()};p.on('pageerror',e=>errors.push(e.message));
 try{
  for(const [page,id]of [['A',13],['D',18]])for(const q of ['', 'country=US','appPlatform=Android']){
   await open(page+(q?'?'+q:''));const note=p.locator('.topic-cross-period');check(await note.count()===1,`Missing observation ${page} ${q}`);
   const raw=await p.evaluate(id=>{const x=weeklyRateComparison(id);return {before:x.before.numerator/x.before.denominator*100,after:x.after.numerator/x.after.denominator*100,beforeLabel:x.beforeLabel,afterLabel:x.afterLabel}},id);
   const text=await note.innerText();check(text.includes(raw.before.toFixed(1)+'%')&&text.includes(raw.after.toFixed(1)+'%')&&text.includes(raw.beforeLabel)&&text.includes(raw.afterLabel),'Observation differs from aggregated counts');
   const before=await p.locator(`#topic-highlight-${page}-${id}`).innerText();await note.locator('a').focus();await p.keyboard.press('Enter');await ready();check(p.url().includes(`metric=${id}`)&&(!q||p.url().includes(q)),'Keyboard entry lost scope');check((await p.locator('.income-context').innerText()).includes(raw.after.toFixed(1)+'%'),'Diagnosis differs');await p.goBack();await ready();check(await p.locator('.topic-cross-period').isVisible()&&(await p.locator(`#topic-highlight-${page}-${id}`).innerText())===before,'Back lost overview');results.push({page,q,...raw});
  }
  for(const hash of ['A?week=1','A?week=12','D?week=1','D?week=12','D?country=DE&appPlatform=iOS&plan=Pro','A?country=INVALID']){await open(hash);check(await p.locator('.topic-cross-period').count()===0,'Stale cross-period observation '+hash)}
  for(const key of 'BCEFG'){await open(key);check(await p.locator('.topic-cross-period').count()===0,'Unapproved observation '+key)}
  const layouts=[];for(const page of ['A','D'])for(const width of [1366,1600,1920])for(const zoom of [1,2]){await p.setViewportSize({width,height:1000});await open(page);await p.evaluate(z=>document.documentElement.style.fontSize=`${16*z}px`,zoom);const box=await p.locator('.topic-cross-period').evaluate(el=>({height:el.getBoundingClientRect().height,overflow:el.scrollWidth>el.clientWidth}));check(!box.overflow,`Overflow ${page}/${width}/${zoom}`);layouts.push({page,width,zoom,...box})}
  check(!errors.length,errors.join(';'));return {status:'PASS',results,layouts,unavailableCases:6,unchangedPages:5};
 }finally{await c.close()}
}
