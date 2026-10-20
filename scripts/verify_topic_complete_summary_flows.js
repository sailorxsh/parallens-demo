async parent=>{
 const context=await parent.context().browser().newContext({reducedMotion:'reduce'}),p=await context.newPage(),results=[],errors=[];
 const read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json','utf8')),renewal=read('monthly-renewal-facts'),feature=read('function-usage').facts.rows.at(-1);
 const check=(ok,msg)=>{if(!ok)throw Error(msg);},num=n=>n.toLocaleString('zh-CN'),pct=n=>(n*100).toFixed(1)+'%';p.on('pageerror',e=>errors.push(e.message));
 const open=async(code,query='')=>{await p.goto('http://127.0.0.1:8765/#/'+code+(query?'?'+query:''));await p.locator('.topic-overview').waitFor();};
 try{
  for(const query of ['', 'country=US','appPlatform=Android']){
   const filters=Object.fromEntries(new URLSearchParams(query));
   await open('D',query);const raw=renewal.months.at(-1).records.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v));
   const counts={opening:0,loss:0,cancel:0};for(const r of raw)for(const o of r.outcomeCounts){counts.opening+=o.count;if(o.lossReason!==null)counts.loss+=o.count;if(o.cancelled)counts.cancel+=o.count;}
   const text=await p.locator('#topic-D-metric-23').innerText();for(const key of ['loss','cancel'])check(text.includes(pct(counts[key]/counts.opening)+' · '+num(counts[key])+' / '+num(counts.opening)+'人'),'Renewal counts differ from raw outcomes '+query);
   check(text.includes('人数可重叠')&&text.includes('取消不等于立即失去权益'),'Missing renewal interpretation');
   await open('B',query);const rows=feature.records.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)),den=rows.reduce((n,r)=>n+Object.values(r.notification).reduce((a,b)=>a+b,0),0);
   const body=await p.locator('#topic-B-metric-27').innerText();for(let i=0;i<3;i++){const n=rows.reduce((n,r)=>n+r.functionMasks.reduce((s,v,mask)=>s+((mask&(1<<i))?v:0),0),0);check(body.includes(pct(n/den)+' · '+num(n)+' / '+num(den)+'人'),'Function counts differ from bitmask '+query+' '+i);}
   check((await p.locator('#topic-B-metric-27 .topic-trend-title').innerText()).includes('直播'),'Function trend identity missing');results.push({query,counts,den});
  }
  await open('B','functionType=Playback');check((await p.locator('#topic-B-metric-27 .topic-trend-title').innerText()).includes('事件回看'),'Selected function trend label stale');
  await open('B','productLine=Bird');check(await p.locator('#topic-B-metric-27 .metric-secondary-values').count()===0&&(await p.locator('#topic-B-metric-27').innerText()).includes('缺少'),'Unsupported feature scope leaks results');
  for(const code of ['B','D','G'])for(const width of [1366,1600,1920])for(const size of [16,32]){
   await p.setViewportSize({width,height:1000});await open(code);await p.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow '+code+width+size);
   if(width===1600&&size===16)await p.screenshot({path:`output/playwright/v192-summary/${code}.png`,fullPage:true});
  }
  check((await p.locator('#topic-G-metric-54 .topic-trend-title').innerText()).includes('丢失'),'Quality trend identity missing');check(!errors.length,errors.join(';'));return {status:'PASS',results,errors};
 }finally{await context.close();}
}
