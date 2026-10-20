async parent=>{
 const browser=parent.context().browser(),c=await browser.newContext({reducedMotion:'reduce'}),p=await c.newPage(),requests=[],errors=[],results=[];
 p.on('request',r=>{if(r.url().includes('echarts.min.js'))requests.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
 const check=(ok,msg)=>{if(!ok)throw Error(msg);},ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 let release;try{
  for(const code of 'ABCDEFG'){await p.goto('http://127.0.0.1:8765/#/'+code);await ready();check(await p.locator('.topic-overview').count()===1&&requests.length===0,'Overview fetched chart library '+code);}
  const gate=new Promise(r=>release=r);await p.route('**/vendor/echarts.min.js*',async route=>{await gate;await route.continue();});
  await p.locator('#topic-open-G-54').click();await p.getByRole('button',{name:'先查看数据表',exact:true}).waitFor();
  check(requests.length===1,'Diagnosis did not request exactly one library');await p.getByRole('button',{name:'先查看数据表',exact:true}).click();await ready();
  check(await p.locator('#G-tab-data').getAttribute('aria-selected')==='true','Data-first choice missing');
  const table=await p.locator('#metric-evidence-54').innerText();release();await p.waitForFunction(()=>!!window.echarts);check(await p.locator('#metric-evidence-54').innerText()===table,'Late chart load replaced working evidence');
  await p.locator('.topic-return').click();await ready();await p.locator('#topic-open-G-54').click();await ready();check(requests.length===1,'Library downloaded twice');
  await p.goto('http://127.0.0.1:8765/#/D?metric=18');await ready();check(await p.locator('#metric-evidence-18 svg').count()>0,'Direct diagnosis has no chart');results.push('seven overview routes without chart fetch; first diagnosis, delayed success, data-first, repeated diagnosis, direct link');
  check(!errors.length,errors.join(';'));return {status:'PASS',results,errors};
 }finally{release?.();await c.close();}
}
