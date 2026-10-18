// A real enumerable queue, current counts and historical counts share device-level facts.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),results=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const response=await parent.request.get(`${base}data/binding-device-facts.json`);check(response.ok(),'Missing device facts');const source=await response.json();
 const expected=(filters={},at=Date.parse(source.asOf))=>source.records.filter(r=>Date.parse(r.boundAt)<at-72*3600000&&
  (!r.firstImageAt||Date.parse(r.firstImageAt)>at)&&Object.entries(filters).every(([key,value])=>r[key]===value)).sort((a,b)=>a.boundAt.localeCompare(b.boundAt)||a.id.localeCompare(b.id));
 const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(filters={},extra='')=>{await p.goto(`${base}#/A?metric=15&${new URLSearchParams(filters)}${extra}`);await ready();};
 const list=()=>p.locator('.binding-device-list'),search=()=>p.getByRole('searchbox',{name:'查找清单中的设备'}),detail=()=>p.locator('.binding-device-detail');
 const form=()=>p.locator('.action-record'),stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const scopes=[{}, {productLine:'Bird'},{productLine:'Hunting'},{productLine:'Hunting',deviceModel:'Hunt Pro'},{country:'US',productLine:'Bird',deviceModel:'K6'}];
 try{
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.goto('about:blank');await p.setViewportSize({width,height:1000});
   for(const filters of scopes){
    await open(filters);await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const rows=expected(filters);
    check(await p.locator('#A-tab-data').getAttribute('aria-selected')==='true'&&await list().isVisible(),'Device metric does not land on its actual queue');
    check(await p.evaluate(()=>metric(15).value)===rows.length,'Current count differs from eligible device records');
    const visible=await list().locator('tbody tr').evaluateAll(nodes=>nodes.map(n=>[...n.children].map(c=>c.textContent)));
    check(visible.length===Math.min(10,rows.length),'Device pagination loses or duplicates records');
    visible.forEach((cells,i)=>check(cells[0]===rows[i].id&&cells[1]===rows[i].deviceModel&&cells[2]===rows[i].boundAt.slice(0,10)&&
     Number(cells[3])===Math.floor((Date.parse(source.asOf)-Date.parse(rows[i].boundAt))/86400000)&&cells[4]===rows[i].appVersion&&cells[6]===rows[i].handlingStatus,'Rendered device fields differ from their source record'));
    const first=list().locator('.binding-device-link').first();await first.scrollIntoViewIfNeeded();await first.focus();await first.press('Enter');
    check(await detail().isVisible()&&(await detail().innerText()).includes(rows[0].id)&&
     (await detail().innerText()).includes(rows[0].appVersion),'Keyboard selection does not show the chosen device');
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const deviceHeading=await detail().locator('h3').boundingBox();
    check(deviceHeading&&deviceHeading.y>=0&&deviceHeading.y+deviceHeading.height<1000,'Chosen detail is multiple screens away after text reflow');
    await detail().getByRole('button',{name:'返回设备清单',exact:true}).click();
    check(await first.evaluate(n=>n===document.activeElement),'Returning from detail loses the selected record focus');
    const returned=await first.boundingBox();check(returned&&returned.y>=0&&returned.y+returned.height<1000,'Return focus is outside the visible queue');
    check(await stored()===null,'Reading a device writes an issue');
    await p.locator('#A-tab-change').click();
    const chart=p.locator('#A-panel-change .evidence-pair[data-evidence-metric="15"] .detail-chart');await chart.locator('svg').waitFor();
    const points=await chart.evaluate(n=>echarts.getInstanceByDom(n).getOption().series[0].data);
    check(JSON.stringify(points)===JSON.stringify(source.snapshots.map(point=>expected(filters,Date.parse(point.at)).length)), 'Plotted device history is still an independent slice');
    check(points.at(-1)===rows.length,'History endpoint does not match the queue');
    await p.locator('#A-tab-data').click();
    check(await p.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))===font,'Text size changed unexpectedly');
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Device queue overflows the desktop page');
    if(!Object.keys(filters).length)await p.screenshot({path:`output/playwright/binding-devices-${browser.browserType().name()}-${width}-${font}.png`});
    results.push({width,font,filters,count:rows.length,history:points});
   }
  }
  await p.goto('about:blank');await p.setViewportSize({width:1600,height:1000});await open();
  const ids=[];
  for(let page=1;page<=13;page++){
   ids.push(...await list().locator('.binding-device-link').allTextContents());
   check((await list().locator('.binding-list-pagination').innerText()).includes(`第 ${page} / 13 页`),'Pagination label is stale');
   if(page<13)await list().getByRole('button',{name:'下一页',exact:true}).click();
  }
  check(ids.length===128&&new Set(ids).size===128&&JSON.stringify(ids)===JSON.stringify(expected().map(r=>r.id)),'The full 128-device queue is incomplete or reordered');
  check(await list().getByRole('button',{name:'下一页',exact:true}).isDisabled(),'Last page can advance to missing records');
  await search().fill('NO-SUCH-DEVICE');check(await list().locator('tbody tr').count()===0&&await p.evaluate(()=>metric(15).value)===128,'An empty local search becomes a zero business total');
  const chosen=expected()[0];await search().fill(chosen.id);check(await list().locator('tbody tr').count()===1,'Device ID search is not exact enough to find the record');
  await list().locator('.binding-device-link').click();await detail().getByRole('button',{name:'将编号填入#15关联样本',exact:true}).click();
  check(await form().locator('[name=linkedSample]').inputValue()===chosen.id&&await stored()===null,'Explicit association saves automatically or chooses another device');
  await form().locator('[name=owner]').fill('设备核查');await form().locator('[name=note]').fill('检查绑定与首图链路');
  await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  const saved=await stored(),savedRecord=Object.values(JSON.parse(saved)).find(r=>r.evidenceId===15);
  check(savedRecord?.baseline==='128台'&&savedRecord.linkedSample===chosen.id,'Device association changes the aggregate issue baseline');
  await form().locator('[name=note]').fill('未保存设备核查草稿');
  await search().fill(expected()[1].id);await list().locator('.binding-device-link').click();
  await detail().getByRole('button',{name:'将编号填入#15关联样本',exact:true}).click();
  check((await detail().innerText()).includes('已有其他关联样本，未覆盖')&&await form().locator('[name=linkedSample]').inputValue()===chosen.id&&
   await form().locator('[name=note]').inputValue()==='未保存设备核查草稿'&&await stored()===saved,'Viewing another device overwrites existing linked sample, draft or saved record');
  await search().fill('NOT-IN-LIST');check(await detail().isHidden()&&await p.getByRole('button',{name:'当前设备',exact:true}).isDisabled(),'Filtered-out device details remain as if still selected');
  await search().fill('');await list().getByLabel('等待分层（仅清单）',{exact:true}).selectOption('14天及以上');
  const high=expected().filter(r=>Date.parse(source.asOf)-Date.parse(r.boundAt)>=14*86400000);
  check((await list().locator('.binding-list-status').innerText()).includes(`匹配 ${high.length} 台`)&&await p.evaluate(()=>metric(15).value)===128,'Local waiting band changes the global metric');
  await p.locator('#A-tab-change').click();check(p.url().includes('panel=change'),'Explicit trend is not encoded after changing the default landing');
  await p.reload();await ready();check(await p.locator('#A-tab-change').getAttribute('aria-selected')==='true','Reload silently replaces an explicit trend with the default queue');
  await p.locator('#A-tab-data').click();await p.goBack();await ready();check(await p.locator('#A-tab-change').getAttribute('aria-selected')==='true','Back loses the explicit trend');
  await p.goForward();await ready();check(await list().isVisible(),'Forward cannot restore the queue');
  // A historical Hunting baseline remains 38 even though the new coherent current count is 29.
  await open({productLine:'Hunting'});
  const legacy=await p.evaluate(record=>{
   const scope=activeFilterDescription(),key=`record:A:${scope}:15`;
   return{key,record:{...record,issueId:issueIdForKey(key,'A',15),scope,filters:{productLine:'Hunting'},baseline:'38台'}};
  },savedRecord);
  await p.evaluate(({key,record})=>localStorage.setItem('parallens-demo-actions-v1',JSON.stringify({[key]:record})),legacy);
  await p.reload();await ready();await p.locator('#metric-evidence-15 .issue-register').click();
  check((await form().locator('> .table-note').innerText()).includes('38台')&&(await form().locator('.action-baseline-note').innerText()).includes('29台'),'Legacy issue is silently migrated or its changed current value is hidden');
  await form().locator('[name=note]').fill('仅更新核查进度');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  check(JSON.parse(await stored())[legacy.key].baseline==='38台','Saving progress overwrites the historical device baseline');
  await p.goto(`${base}#/A?metric=13&country=UK`);await ready();await p.locator('#metric-evidence-13 .issue-register').click();
  await form().locator('[name=note]').fill('保留另一指标的核查草稿');
  await open({country:'UK'},'&issue=13');await list().locator('.binding-device-link').first().click();
  await detail().getByRole('button',{name:'将编号填入#15关联样本',exact:true}).click();
  check((await detail().innerText()).includes('当前问题单属于其他指标')&&await form().locator('[name=issueMetric]').inputValue()==='13'&&
   await form().locator('[name=note]').inputValue()==='保留另一指标的核查草稿','Device association switches another metric issue or overwrites its draft');
  await p.goto(`${base}#/G?metric=15`);await ready();
  const shared=list().locator('.binding-device-link').first();
  check(await shared.getAttribute('aria-controls')==='G-workspace-device','Shared G entry points at an absent A detail panel');
  await shared.click();check(await p.locator('#G-workspace-device').isVisible()&&(await detail().innerText()).includes(chosen.id),'Shared device entry shows different facts');
  results.push({page:'G',id:15,sharedQueue:true});
  for(const mode of ['duplicate','missing-row','wrong-product','bad-date','null-row']){
   const fixture=JSON.parse(JSON.stringify(source));
   if(mode==='duplicate')fixture.records[0].id=fixture.records[1].id;
   if(mode==='missing-row')fixture.records.pop();
   if(mode==='wrong-product')fixture.records[0].productLine='Hunting';
   if(mode==='bad-date')fixture.records[0].boundAt='2026-02-30T00:00:00Z';
   if(mode==='null-row')fixture.records[0]=null;
   const isolated=await browser.newContext({viewport:{width:1600,height:1000}}),q=await isolated.newPage();
   try{
    q.on('pageerror',e=>errors.push(e.message));await q.route('**/data/binding-device-facts.json',r=>r.fulfill({json:fixture}));
    await q.goto(`${base}#/A?metric=15`);await q.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
    check(await q.evaluate(()=>metric(15).availability)==='pending'&&await q.locator('.binding-device-list').count()===0,'Invalid facts show an aggregate-backed pretend queue');
   }finally{await isolated.close();}
   results.push({fixture:mode});
  }
  await open({deviceStatus:'Inactive'});check(await p.evaluate(()=>metric(15).kind)==='na'&&await list().count()===0,'An inapplicable device state is presented as zero eligible devices');
  check(!errors.length,errors.join('; '));
  return{status:'PASS',checks:['same-source current queue, model/product partitions and 12-point history','three desktop widths and actual 200% text',
   'all 128 rows reachable exactly once','search, waiting band and paging do not change global totals','keyboard selection and fixed right detail',
   'explicit device association, no automatic save or overwrite','draft, original saved baseline and changed-scope warning',
   'default queue, explicit trend reload and browser history','five malformed data fixtures and inapplicable device state'],results};
 }finally{await context.close();}
}
