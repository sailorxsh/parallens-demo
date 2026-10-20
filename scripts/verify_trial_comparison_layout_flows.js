// Approved D18 flow: select a group locally, inspect its own denominators, retain overall evidence and issue state.
async(parent)=>{
 const base=new URL('.',parent.url()).href,records=JSON.parse(fs.readFileSync('data/trial-facts.json','utf8')).records;
 const context=await parent.context().browser().newContext({reducedMotion:'reduce'}),p=await context.newPage(),results=[],errors=[];
 p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);},count=n=>n.toLocaleString('en-US'),pct=(n,d)=>(n/d*100).toFixed(1)+'%';
 const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 const settle=()=>p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 const open=async(query='')=>{await p.goto(`${base}#/D?metric=18&panel=groups${query?'&'+query:''}`);await p.reload();await ready();await settle();};
 const independent=query=>{const params=new URLSearchParams(query),fields={country:'country',appPlatform:'app_platform'};
  const rows=records.filter(r=>Object.entries(fields).every(([key,field])=>!params.get(key)||r[field]===params.get(key)));
  const periods=['previous','current'].map(period=>rows.filter(r=>r.period===period));
  const target=r=>r.product_line==='Bird'&&r.app_platform==='Android'&&r.plan==='Plus'&&r.billing_cycle==='monthly';
  const aggregate=rows=>({n:rows.filter(r=>r.converted).length,d:rows.length,f:rows.filter(r=>r.payment_status==='failed').length,a:rows.filter(r=>r.payment_attempted).length});
  return{overall:periods.map(aggregate),groups:[true,false].map(match=>periods.map(rows=>aggregate(rows.filter(r=>target(r)===match)))).filter(group=>group.some(r=>r.d))};};
 try{
  for(const width of [1366,1600,1920])for(const font of [16,32])for(const query of font===16?['','country=US','country=UK','appPlatform=iOS']:['']){
   await p.setViewportSize({width,height:1000});await open(query);
   await p.evaluate(size=>{document.documentElement.style.fontSize=`${size}px`;window.dispatchEvent(new Event('resize'));},font);await settle();
   const pair=p.locator('.trial-group-evidence'),expected=independent(query),choices=pair.locator('.trial-group-choice');
   check(await choices.count()===expected.groups.length,'Group controls disagree with source membership');
   const initialUrl=p.url(),observation=await p.locator('.workspace-observation').innerText(),storage=await p.evaluate(()=>JSON.stringify(localStorage));
   for(let index=0;index<expected.groups.length;index++){
    await choices.nth(index).focus();await p.keyboard.press('Enter');const group=expected.groups[index];
    const rates=await pair.locator('.trial-group-rate').allTextContents(),counts=await pair.locator('.trial-group-counts').allTextContents();
    check(rates[0]===group.map(r=>pct(r.n,r.d)).join(' → '),'Group conversion rate has the wrong denominator');
    check(rates[1]===group.map(r=>r.a>=30?pct(r.f,r.a):r.a?'样本不足30次':'无支付尝试').join(' → '),'Payment denominator or small sample rule lost');
    check(rates[2]===group.map((r,i)=>pct(r.d,expected.overall[i].d)).join(' → '),'Population weight diverges');
    check(counts[0]===group.map(r=>`${count(r.n)} 转正 / ${count(r.d)} 成熟试用`).join(' → '),'Displayed conversion counts diverge');
    check(counts[1]===group.map(r=>`${count(r.f)} 失败 / ${count(r.a)} 支付尝试`).join(' → '),'Displayed payment counts diverge');
    check(await choices.nth(index).getAttribute('aria-pressed')==='true'&&await choices.nth(index).evaluate(n=>document.activeElement===n),'Keyboard selection/focus lost');
    check(!await pair.locator('.workspace-calculation').evaluate(n=>n.open),'Selection unexpectedly opens a full table');
   }
   check(p.url()===initialUrl&&(await p.locator('.workspace-observation').innerText())===observation&&await p.evaluate(()=>JSON.stringify(localStorage))===storage,'Local inspection changed route, overall reading or records');
   const columns=await pair.locator('.trial-group-grid').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);
   check(font===16?columns===2:columns===1||await pair.locator('.trial-group-grid').evaluate(n=>[...n.children].every(c=>c.getBoundingClientRect().width>=19*parseFloat(getComputedStyle(document.documentElement).fontSize))),`Unusable reading width ${width}/${font}: ${columns}`);
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Page overflow');
   check(await pair.locator('.trial-group-detail').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Group summary overflow');
   const plotBounds=await pair.locator('.detail-chart').evaluate(n=>{const r=n.getBoundingClientRect();return [...n.querySelectorAll('svg text')].map(t=>{const b=t.getBoundingClientRect();return {text:t.textContent,inside:b.left>=r.left-2&&b.right<=r.right+2&&b.bottom<=r.bottom+2};});});
   check(plotBounds.length>0&&plotBounds.every(t=>t.inside),`Chart labels clipped: ${JSON.stringify(plotBounds.filter(t=>!t.inside))}`);
   // Existing full calculations and cohort chart remain accessible, including keyboard navigation.
   await pair.getByRole('button',{name:'查看该组贡献计算',exact:true}).click();
   check(await pair.locator('.workspace-calculation').evaluate(n=>n.open)&&await pair.locator('tr.chart-selected').count()===1,'Explicit calculation lost its selected row');
   const nav=p.getByRole('navigation',{name:'分组证据定位'}).getByRole('button',{name:'查看总体成熟批次对照',exact:true});
   await nav.focus();await p.keyboard.press('Enter');const overall=p.locator('.trial-overall-comparison');
   check(await overall.evaluate(n=>n.open&&n.contains(document.activeElement)),'Overall comparison is not keyboard reachable');
   await p.waitForFunction(()=>!!echarts.getInstanceByDom(document.querySelector('.trial-overall-comparison .detail-chart')));
   await overall.locator('.chart-data > summary').click();
   const table=await overall.locator('table').innerText();for(const r of expected.overall)check(table.includes(pct(r.n,r.d))&&table.includes(count(r.n))&&table.includes(count(r.d)),'Overall counts or ratio lost');
   results.push({width,font,query,columns,groups:expected.groups.length});
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');
  for(const query of ['week=12','country=Other&plan=Plus','plan=Free','country=US&appPlatform=iOS&productLine=Bird&plan=Plus']){
   await open(query);check(!await p.locator('.trial-group-evidence').count(),`Unavailable scope renders invented groups: ${query}`);
  }
  await open('plan=Starter');check((await p.locator('.trial-group-rate').nth(1).innerText())==='0.0% → 0.0%','A measured zero is treated as missing');
  await open('country=US&plan=Starter&appPlatform=Android');check((await p.locator('.trial-group-rate').nth(1).innerText())==='0.0% → 样本不足30次','Small payment sample is reported as a reliable zero');
  await open('country=US');
  if(!await p.locator('.filter-bar').evaluate(n=>n.open))await p.locator('.filter-bar > summary').click();
  await p.locator('select[name=country]').selectOption('UK');await ready();
  const uk=independent('country=UK').groups[0];
  check((await p.locator('.trial-group-rate').first().innerText())===uk.map(r=>pct(r.n,r.d)).join(' → '),'Interactive country filter does not update selected group');
  await p.reload();await ready();check((await p.locator('.trial-group-rate').first().innerText())===uk.map(r=>pct(r.n,r.d)).join(' → '),'Reload loses group scope');
  // A different issue can stay open while #18 evidence is explored.
  await open('issue=52');const form=p.locator('.action-record');await form.locator('[name=owner]').fill('分组核对保留负责人');await form.locator('[name=note]').fill('未保存草稿，不随组切换');
  const baseline=await form.locator('> .table-note').first().innerText(),url=p.url();
  await p.locator('.trial-group-choice').last().click();await p.locator('.trial-group-calculation').click();
  check(p.url()===url&&await form.locator('[name=owner]').inputValue()==='分组核对保留负责人'&&await form.locator('[name=note]').inputValue()==='未保存草稿，不随组切换'&&(await form.locator('> .table-note').first().innerText())===baseline,'Group inspection overwrote another issue or draft');
  await p.goto(`${base}#/E?metric=35&panel=groups`);await ready();check(!await p.locator('.trial-group-evidence').count(),'D18 UI leaked to another metric');
  await p.goBack();await ready();check(await p.locator('.action-record [name=note]').inputValue()==='未保存草稿，不随组切换','Returning to evidence lost the issue draft');
  check(!errors.length,errors.join('\n'));return{status:'PASS',results,checks:['independent source counts','keyboard group selection','explicit calculation landing','retained overall chart','three desktop widths and 200% text','small/empty/inapplicable/zero/weekly states','different issue and draft preserved','other metrics unchanged'],errors};
 }finally{await context.close();}
}
