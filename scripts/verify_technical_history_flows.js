// Exercise actual request windows, source faults, chart selection and immutable old issues.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name(),c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),results=[],errors=[];
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};p.on('pageerror',e=>errors.push(e.message));
 const metrics=await(await parent.request.get(base+'data/metric-values.json')).json();
 const source=await(await parent.request.get(base+'data/technical-facts.json')).json(),fixture=JSON.parse(fs.readFileSync('scripts/fixtures/technical-before-history.json','utf8')).records;
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(query='metric=46')=>{await p.goto(`${base}#/C?${query}`);await ready();};
 const own=()=>p.locator('#C-panel-change .evidence-pair[data-evidence-metric="46"]'),chart=()=>own().locator('.detail-chart'),form=()=>p.locator('.action-record');
 const stored=()=>p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
 const reveal=async d=>{if(!await d.evaluate(n=>n.open))await d.locator(':scope > summary').click();await ready();};
 const setSource=async data=>{await c.route('**/data/technical-facts.json',r=>r.fulfill({json:data}));await p.reload();await ready();};
 const inspect=async(label)=>{
  check(await p.locator('#C-tab-change').getAttribute('aria-selected')==='true','Required 30-day evidence is not the default');
  await chart().scrollIntoViewIfNeeded();await chart().locator('svg').waitFor();
  const facts=await p.evaluate(()=>({part:technicalHistoryProjection(),headline:metricHistory(46),current:metric(46)}));
  const option=await chart().evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {labels:o.xAxis[0].data,lines:o.series.map(s=>({name:s.name,values:s.data})),min:o.yAxis[0].min,max:o.yAxis[0].max};});
  check(option.labels.length===30&&option.labels[0]==='2026-08-25'&&option.labels.at(-1)==='2026-09-23','UTC day boundaries or full history length wrong');
  for(const [i,name]of facts.part.names.entries())for(const [j,row]of facts.part.rows.entries())check(Math.abs(option.lines[i].values[j]-row.counts[name].numerator/row.counts[name].denominator*100)<1e-9,'Rendered history differs from daily counts');
  check(option.min>0&&option.max<=100,'Success trends use an unhelpful zero or impossible upper endpoint');
  const summary=await p.locator('.technical-window-summary').innerText();for(const name of facts.part.names){const w=facts.part.week[name];check(summary.includes(w.numerator.toLocaleString('zh-CN'))&&summary.includes(w.denominator.toLocaleString('zh-CN')),'7-day display not linked to summed counts');}
  check(summary.includes('2026-09-17 → 2026-09-24')&&summary.includes('不平均日率')&&summary.includes('生产目标线'),'Window comparison hides scope or invents a production target');
  results.push({label,lines:option.lines.length,range:[option.min,option.max]});return facts;
 };
 try{
  await open();await p.evaluate(r=>localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(r)),fixture);await p.reload();await ready();const initial=await stored();
  let facts=await inspect('overall');check(facts.current.value.live.numerator===9700&&facts.current.value.upload.numerator===9900&&facts.current.value.push.numerator===9850,'Existing current successful counts changed');
  await reveal(own().locator('.workspace-calculation'));
  const target=await chart().evaluate(n=>{const e=echarts.getInstanceByDom(n),r=n.getBoundingClientRect(),s=e.getOption().series[1],i=14,[x,y]=e.convertToPixel({seriesIndex:1},[i,s.data[i]]);return {x:r.left+x,y:r.top+y};});
  await p.mouse.click(target.x,target.y);await ready();check((await own().locator('.chart-selected').innerText()).startsWith('2026-09-08'),'Native live point highlights a different date');check(await stored()===initial,'Inspecting a trend writes old issue baselines');
  for(const q of ['productLine=Bird','productLine=Hunting','deviceModel=K6&firmware=2.8&functionType=Live','deviceModel=Bird%20Lite&firmware=Other&functionType=Push','deviceStatus=Effective&functionType=Upload']){await open('metric=46&'+q);await inspect(q);}
  for(const q of ['country=US','deviceStatus=Inactive']){await open('metric=46&'+q);check(await p.evaluate(()=>metric(46).kind==='na')&&await own().count()===0,'Unsupported request population shows a synthetic reliable history');}
  for(const [key,record]of Object.entries(fixture)){
   await open('metric=46&issue=46&'+new URLSearchParams(record.filters));await form().locator('[name=note]').fill('仅更新处理进度；旧24小时基线保留');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();await ready();const saved=JSON.parse(await stored())[key];
   for(const field of ['issueId','scope','filters','baseline','baselineAt','reviewMetric'])check(JSON.stringify(saved[field])===JSON.stringify(record[field]),`New history rewrites old ${field}`);
   await form().locator('[name=note]').fill('浏览历史仍保留的草稿');await p.locator('#C-tab-groups').click();await p.locator('#C-tab-change').click();await ready();check(await form().locator('[name=note]').inputValue()==='浏览历史仍保留的草稿','Historical view loses draft');
  }
  const saved=await stored();await open();
  for(const [label,mutate,currentBad]of [['missing-history',d=>delete d.dailyHistory,false],['bad-old-count',d=>d.dailyHistory.rows[0].records[0].liveFailures=-1,false],['last-anchor',d=>d.dailyHistory.rows.at(-1).records[0].liveFailures++,false],['duplicate-grain',d=>d.dailyHistory.rows[1].records[0]=d.dailyHistory.rows[1].records[1],false],['bad-current',d=>d.records[0].liveFailures=-1,true]]){
   const d=structuredClone(source);mutate(d);await setSource(d);check(await p.evaluate(bad=>metric(46).kind===(bad?'na':'group'),currentBad),'Historical fault disables reliable current metric or preserves bad current rate');
   check(await own().count()===0&&await p.evaluate(()=>metricHistory(46)===null),'Invalid history silently falls back to unrelated trends');
   if(!currentBad){check(await p.locator('.technical-history-unavailable').count()===1,'Missing optional history has no explicit availability');await p.locator('#C-tab-groups').click();await reveal(p.locator('#C-panel-groups .evidence-pair').first().locator('.workspace-calculation'));check((await p.locator('#C-panel-groups .evidence-pair').first().innerText()).includes('300'),'History fault hides reliable current request evidence');}
   check(await stored()===saved,'Fault inspection changes old saved evidence');results.push({label,currentBad});await c.unroute('**/data/technical-facts.json');
  }
  const changed=structuredClone(source);changed.dailyHistory.rows[26].records[0].liveFailures+=2;await setSource(changed);check(await p.evaluate(()=>metric(46).value.live.numerator===9700&&technicalHistoryProjection().week.live.failed===1806),'Changed historical count does not update weighted week while preserving current value');await c.unroute('**/data/technical-facts.json');await p.reload();await ready();
  const zero=structuredClone(source);for(const r of zero.dailyHistory.rows[20].records)r.liveFailures=0;await setSource(zero);check(await p.evaluate(()=>technicalHistoryProjection().rows[20].counts.live.numerator===technicalHistoryProjection().rows[20].counts.live.denominator),'Known zero failures is treated as missing');await open();await inspect('known-zero-failures');await c.unroute('**/data/technical-facts.json');await p.reload();await ready();
  // Controlled current-count boundaries; unrelated network anchors are not asserted.
  for(const total of [0,20]) {
   const d=structuredClone(source),m=structuredClone(metrics);d.records.forEach((r,i)=>{r.attempts=i===0?total:0;for(const k of ['networkFailures','uploadFailures','liveFailures','pushFailures'])r[k]=0;});
   d.dailyHistory.rows.at(-1).records=structuredClone(d.records);for(const r of Object.values(m.m46.value)){r.numerator=total;r.denominator=total;r.value=total?1:0;}
   await c.route('**/data/metric-values.json',r=>r.fulfill({json:m}));await setSource(d);await open();
   check(await p.evaluate(()=>metric(46).kind==='na'&&technicalHistoryProjection().rows.at(-1).counts.live.numerator===technicalHistoryProjection().rows.at(-1).counts.live.denominator),'Known current denominator boundary loses counts');
   const summary=await p.locator('.technical-window-summary').innerText();check(summary.includes(total?'样本不足30次':'无合格分母'),'Small/zero current count is formatted as a measured percentage');
   check(await p.locator('#metric-evidence-46 > .section-top .issue-register').count()===0,'Unknown current ratio can save a reliable new baseline');
   await chart().scrollIntoViewIfNeeded();await chart().locator('svg').waitFor();check(await chart().evaluate(n=>echarts.getInstanceByDom(n).getOption().series.every(s=>s.data.at(-1)===null)),'Small/zero current request ratio is rendered as zero');
   results.push({label:'current-count-boundary',total});await c.unroute('**/data/technical-facts.json');await c.unroute('**/data/metric-values.json');await p.reload();await ready();
  }
  for(const[width,font]of[[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});await open();await p.evaluate(f=>document.documentElement.style.fontSize=f+'px',font);await chart().scrollIntoViewIfNeeded();await ready();await chart().locator('svg').waitFor();
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Technical workspace overflows desktop');
   const bounds=await chart().boundingBox(),texts=await chart().locator('svg text').evaluateAll(ns=>ns.map(n=>({text:n.textContent,b:n.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(n).fontSize)})));
   for(const t of texts)check(t.font>=12*font/16-.1&&t.b.x>=bounds.x-1&&t.b.right<=bounds.x+bounds.width+1,`Clipped or undersized chart label ${t.text}`);
   await p.screenshot({path:`output/playwright/v162-audit/${engine}-technical-${width}-${font}.png`});results.push({label:`layout-${width}-${font}`,svgTexts:texts.length});
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});await c.route('**/vendor/echarts.min.js*',r=>r.abort());await p.reload();await ready();await reveal(own().locator('.workspace-calculation'));check(await own().locator('tbody tr').count()===30,'Without chart library exact 30-day table is missing');check((await p.locator('.technical-window-summary').innerText()).includes('63,398'),'Without chart library weighted seven-day results are missing');
  check(await stored()===saved,'Layout or fallback writes old issue records');check(errors.length===0,errors.join('\n'));return {status:'PASS',engine,results,oldRecordsPreserved:2,errors};
 }finally{await c.close();}
}
