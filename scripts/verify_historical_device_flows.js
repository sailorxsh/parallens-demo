// Historical populations must not be selected by their current device status.
async(parent)=>{
 const base=new URL('.',parent.url()).href,states=[],errors=[];
 const legacy=JSON.parse(fs.readFileSync('scripts/fixtures/historical-device-before-scope-fix.json','utf8'));
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage();
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 p.on('pageerror',e=>errors.push(e.message));
 const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
 const open=async(id,query='',issue=false)=>{
  await p.goto(`${base}#/${id===43?'C':'F'}?metric=${id}&panel=data${issue?`&issue=${id}`:''}${query?'&'+query:''}`);await ready();
 };
 const form=()=>p.locator('.action-record'),field=name=>form().locator(`[name=${name}]`);
 const save=()=>form().getByRole('button',{name:'保存本地记录',exact:true}).click();
 const record=id=>p.evaluate(id=>Object.values(JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY))).find(r=>r.evidenceId===id&&!Object.keys(r.filters).length),id);
 try{
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});
   for(const id of [43,51])for(const query of ['', 'deviceStatus=Effective','deviceStatus=Inactive','country=US&deviceStatus=Effective']){
    await open(id,query);await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
    const state=await p.evaluate(id=>({value:metric(id),window:actionBaselineWindow(id),history:metricHistory(id),policy:policyFor(id)}),id);
    check(state.policy.businessDimensions.includes('deviceStatus')&&!state.policy.demonstrableDimensions.includes('deviceStatus'),'Historical status removed from business applicability or still calculable without entry status');
    const evidence=p.locator(`#metric-evidence-${id}`),text=await evidence.innerText();
    check(!/本指标可演示筛选：[^。]*设备状态/.test(text),'Evidence advertises current status as a historical slice');
    if(query){
     check(state.value.availability==='pending'&&state.value.reason.includes('入组时设备状态'),'Historical flow is filtered by current status, zeroed, or declared inapplicable');
     check(text.includes('不能用当前状态排除未留存或已解绑设备'),'Missing entry-state explanation is not visible');
    }else{
     const v=state.value.value;
     check(state.history===null,'Undated aggregates acquired a fabricated trend');
     check(id===43?v.D7.numerator===1600&&v.D30.numerator===1450&&v.D30.denominator===2000:
      v.unboundEvents===300&&v.observedUnboundDevices===250&&v.reboundWithin30d.numerator===180&&v.reboundWithin30d.denominator===250,'Unfiltered source counts changed');
     check(id===43?text.includes('入组日期与观察截止待补'):text.includes('2026-07解绑批次'),'Source period boundary is hidden');
     check(state.window===(id===43?'新设备留存批次日期待补':'完整月 2026-07'),'Registration silently substitutes the current snapshot');
    }
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Historical metadata or missing-state explanation overflows desktop');
    states.push({id,query,width,font,value:state.value,window:state.window});
    if(!query&&(width===1600||font===32)){
     await evidence.scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/v137-historical-${id}-${font}.png`});
    }
   }
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});
  await open(51,'',true);
  check(await field('reviewedAt').getAttribute('min')==='2026-07-31','July unbinding review still starts at September snapshot');
  await field('owner').fill('合成解绑核查');await field('status').selectOption('verified');
  await field('target').fill('演示验收，不代表实际业务目标');await field('reviewValue').fill('180/250，演示复查');
  await field('reviewedAt').fill('2026-07-30');await save();
  check(await field('reviewedAt').getAttribute('aria-invalid')==='true'&&await field('reviewedAt').evaluate(n=>n===document.activeElement),'Early review date is saved or lacks a focused error');
  await field('reviewedAt').fill('2026-08-31');await save();
  check((await record(51)).baselineAt==='完整月 2026-07','New unbinding record saved the wrong period');
  await p.reload();await ready();check(await field('reviewedAt').inputValue()==='2026-08-31','Valid monthly review does not survive reload');
  await form().scrollIntoViewIfNeeded();await p.screenshot({path:'output/playwright/v137-historical-new-record.png'});
  await open(43,'',true);
  await form().locator('.action-review summary').click();
  check(await field('reviewedAt').getAttribute('min')===null&&(await form().innerText()).includes('统计期末无法核实'),'Undated retention acquires an invented date floor');
  await field('owner').fill('合成留存核查');await save();
  check((await record(43)).baselineAt==='新设备留存批次日期待补','Unknown cohort was stored as a snapshot');
  // Open and update real records captured from the previous app, including a now-pending scope.
  await p.evaluate(records=>localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(records)),legacy.records);
  await p.reload();await ready();
  for(const [key,old] of Object.entries(legacy.records)){
   await open(old.evidenceId,new URLSearchParams(old.filters).toString(),true);
   const before=await p.evaluate(key=>JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY))[key],key);
   check(JSON.stringify(before)===JSON.stringify(old),'Reading migrates historical evidence');
   check(await field('reviewedAt').getAttribute('min')==='2026-09-24','New period silently rebases an old record');
   check((await form().innerText()).includes('当前数据与登记基线不同'),'Old-versus-current boundary is concealed');
   await field('note').fill('旧问题保留基线后的会话草稿');
   await p.locator(`#${old.page}-tab-groups`).click();await p.locator(`#${old.page}-tab-data`).click();
   check(await field('note').inputValue()==='旧问题保留基线后的会话草稿','Evidence navigation discards the draft');
   await save();
   const saved=await p.evaluate(key=>JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY))[key],key);
   for(const name of ['issueId','page','evidenceId','scope','filters','baseline','baselineAt','reviewMetric'])
    check(JSON.stringify(saved[name])===JSON.stringify(old[name]),`Saving progress rewrites historical ${name}`);
   await p.reload();await ready();check(await field('note').inputValue()==='旧问题保留基线后的会话草稿','Legacy update lost on reload');
  }
  // Today's status still applies to an actual snapshot metric.
  await open(50,'deviceStatus=Effective');check(await p.evaluate(()=>metric(50).kind)==='group','Historical repair disables valid snapshot filtering');
  check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
  return {status:'PASS',states,legacyRecords:Object.keys(legacy.records).length,checks:['unchanged source counts','historical entry-state boundary','known and unknown cohort periods','monthly chronology','legacy records and drafts','three desktops and 200% text']};
 }finally{await c.close();}
}
