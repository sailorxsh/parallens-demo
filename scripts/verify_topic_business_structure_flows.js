// Compare visible composition against independently read source counts; missing scopes must not leak totals.
async parent=>{
 const base=new URL('.',parent.url()).href,b=parent.context().browser(),c=await b.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],results=[];
 const check=(ok,m)=>{if(!ok)throw Error(m);},read=async name=>(await parent.request.get(base+'data/'+name+'.json')).json();
 const [snapshot,diagnostics,pageData]=await Promise.all(['snapshot','diagnostics','page-data'].map(read));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);},open=async(code,query='')=>{await p.goto(base+'#/'+code+query);await ready();};
 const n=x=>x.toLocaleString('zh-CN'),rows=async id=>p.locator(`[id$="metric-${id}"] .topic-mini-table tbody tr`).allTextContents();
 p.on('pageerror',e=>errors.push(e.message));
 try{
  for(const code of ['D','E']){await open(code);const r=await rows(3);check(r.length===2&&r[0].includes('$'+n(snapshot.baseMRR))&&r[1].includes('$'+n(snapshot.packMRR)),'MRR components missing '+code);check(snapshot.baseMRR+snapshot.packMRR===snapshot.totalMRR,'Raw MRR does not close');await open(code,'?country=US');check(!(await rows(3)).length&&await p.locator(`#topic-${code}-metric-3`).getByText('MRR分项待补当前筛选范围的来源；不沿用总体组成。').count()===1,'Filtered MRR leaks overall');results.push('MRR '+code);}
  await open('E');const packs=pageData.E.find(r=>r.metricId===36).value.value.anyPack.numerator,total=snapshot.paidUsersIncludingPackOnly,counts=[total-packs,snapshot.packOnlyUsers,packs-snapshot.packOnlyUsers],rights=await rows(34);
  check(counts.reduce((a,b)=>a+b,0)===total,'Raw rights do not close');for(let i=0;i<3;i++)check(rights[i]?.includes(n(counts[i])+'人'),'Missing rights category '+i);results.push({rights:counts});
  await open('E','?country=US');const filtered=await p.locator('#topic-E-metric-34 .topic-mini-table tbody tr td:nth-child(2)').allTextContents(),filteredTotal=filtered.reduce((n,v)=>n+Number(v.replace(/[^0-9]/g,'')),0);check(filtered.length===3&&filteredTotal<total&&filteredTotal===await p.evaluate(()=>metric(34).value),'Supported rights composition does not close');
  await open('E','?productLine=Bird');check(!(await rows(34)).length,'Unsupported rights projection leaks overall composition');
  await open('F');const source=diagnostics.F.tables.find(t=>t.title==='每主账号绑定设备数分层').rows,owners=source.reduce((n,r)=>n+r[1],0),devices=source.reduce((n,r)=>n+r[2],0),actual=await rows(48);
  check(actual.length===4,'Device ownership groups missing');for(let i=0;i<4;i++)check(actual[i].includes(source[i][0])&&actual[i].includes(n(source[i][1])+'人'),'Ownership count mismatch');check((await p.locator('#topic-F-metric-48').innerText()).includes((devices/owners).toFixed(2)+'台/主账号'),'Average missing');
  const shared=diagnostics.F.tables.find(t=>t.title==='主账号、共享与回绑').rows.find(r=>r[0]==='通过共享获得访问权限的用户')[1];check((await rows(49))[0].includes(n(shared)+'人'),'Shared-user count missing');check((await p.locator('#topic-F-metric-49').innerText()).includes('每台设备共享人数分布待补'),'Missing relation distribution hidden');
  await open('F','?country=US');for(const id of [48,49])check(!(await rows(id)).length,'Filtered device summary retains total '+id);
  await open('F');await p.evaluate(()=>{sourceData.diagnostics.F.tables.find(t=>t.title==='每主账号绑定设备数分层').rows[0][1]+=1;renderRoute();});await ready();check(!(await rows(48)).length&&(await p.locator('#topic-F-metric-48').innerText()).includes('不闭合'),'Broken owner counts presented as reliable');results.push({owners,devices,shared,corruptSourceRejected:true});
  await p.goto('about:blank');await open('D');await p.evaluate(()=>{sourceData.snapshot.baseMRR+=1;renderRoute();});await ready();check(!(await rows(3)).length&&(await p.locator('#topic-D-metric-3').innerText()).includes('MRR分项与总额待核验'),'Broken MRR composition presented as reliable');
  check(!errors.length,errors.join('; '));return {status:'PASS',results,errors};
 }finally{await c.close();}
}
