// Changes must identify their actual measure; current DAU does not inherit MAU history.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name(),c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],states=[];
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async q=>{await p.goto(`${base}#/B?metric=25${q?'&'+q:''}`);await ready();};
 try{
  for(const query of ['', 'country=US','country=Other&appPlatform=iOS']){
   await open(query);const value=await p.evaluate(()=>metric(25).value),text=await p.locator('.detail-finding').innerText();
   check(text.includes(`近1天复合活跃 ${value.DAU.toLocaleString('en-US')} 人`)&&text.includes(`App主动活跃 ${value.appDAU.toLocaleString('en-US')} 人`),'Current composite or App window missing');
   check(text.includes('较前日快照')&&text.includes('相邻1天窗口不重叠')&&text.includes('不是留存率'),'Activity change has an unidentified comparison or false retention claim');
   check((await p.locator('.detail-finding .finding-basis').textContent()).includes('active-windows-2026-10-18-v1'),'Source rule is not identified');
   check(await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===null,'Reading activity facts writes a saved issue');states.push({query,value,text});
  }
  check(!errors.length,errors.join(';'));return {status:'PASS',states,checks:['current rolling window and matching App subset','named previous-day comparison','window overlap and ratio meaning','own rule version','no storage changes'],errors};
 }finally{await c.close();}
}
