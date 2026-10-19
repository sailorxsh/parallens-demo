// Keyboard pagination keeps its place at both ends, without changing evidence or issue drafts.
async parent=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),engine=browser.browserType().name();
 const c=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],results=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 const cases=[
  {id:52,route:'D?metric=52&panel=groups&plan=Plus&issue=52',list:'.risk-account-list'},
  {id:51,route:'F?metric=51&panel=groups&country=UK',list:'.unbinding-device-list'},
  {id:43,route:'C?metric=43&panel=data',list:'.device-retention-list'},
  {id:15,route:'A?metric=15&panel=data&productLine=Hunting',list:'.binding-device-list'}
 ];
 try{
  for(const [width,size]of [[1366,16],[1600,16],[1920,16],[1366,32]])for(const item of cases){
   await p.setViewportSize({width,height:1000});await p.goto(base+'#/'+item.route);await ready();await p.evaluate(n=>document.documentElement.style.fontSize=n+'px',size);
   await p.evaluate(()=>document.fonts.ready);const list=p.locator(item.list);await list.waitFor({state:'visible'});
   if(item.id===43){const first=await list.locator('tbody button').first().innerText();await list.getByRole('searchbox').fill(first.slice(0,-2));}
   const before=await p.evaluate(id=>({value:JSON.stringify(metric(id)),saved:localStorage.getItem(ACTION_STORAGE_KEY)}),item.id);
   let baseline;if(item.id===52){const form=p.locator('.action-record');await form.locator('[name=note]').fill('翻页保持原问题草稿');baseline=await form.locator('> .table-note').innerText();}
   const paging=list.locator('.binding-list-pagination'),previous=()=>paging.getByRole('button',{name:'上一页',exact:true}),next=()=>paging.getByRole('button',{name:'下一页',exact:true});
   const focused=async name=>{const control=paging.getByRole('button',{name,exact:true});check(await control.isEnabled(),'Focus target is disabled');check(await control.evaluate(n=>document.activeElement===n),'Focus escaped the list at '+item.id+' '+width+'/'+size+' '+await paging.innerText());const state=await control.evaluate(n=>{const r=n.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;return{visible:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&n.contains(document.elementFromPoint(x,y)),overflow:document.documentElement.scrollWidth>innerWidth+1};});check(state.visible&&!state.overflow,'Pagination focus is obscured or offscreen: '+JSON.stringify({item:item.id,width,size,state}));};
   const seen=async()=>list.locator('tbody tr > :first-child button').allTextContents();
   const all=[...await seen()],labels=[await paging.locator('span').innerText()];check(await previous().isDisabled()&&await next().isEnabled(),'Test requires multiple pages');await next().focus();
   let count=0;while(await next().isEnabled()){
    await p.keyboard.press('Enter');await focused(await next().isEnabled()?'下一页':'上一页');all.push(...await seen());labels.push(await paging.locator('span').innerText());check(++count<15,'Unexpected page loop');
    const announcement=await(item.id===15?paging.locator('[aria-live]'):p.locator('#announcement')).innerText();check(announcement.includes(await paging.locator('span').innerText()),'New page is not announced');
   }
   check(new Set(all).size===all.length&&all.length>20,'Pagination skipped or duplicated records');
   if(width===1600&&size===16||item.id===52&&size===32)await p.screenshot({path:`output/playwright/v175-pagination-${engine}-${item.id}-${width}-${size}.png`});
   let reverse=0;while(await previous().isEnabled()){
    await p.keyboard.press('Enter');await focused(await previous().isEnabled()?'上一页':'下一页');check(++reverse<15,'Unexpected reverse page loop');
   }
   check(JSON.stringify(await seen())===JSON.stringify(all.slice(0,Math.min(item.id===15?10:20,all.length))),'Returning to page one changes its records');
   check(count===reverse&&await paging.locator('span').innerText()===labels[0],'Page one is not restored');
   check(await p.evaluate(({id,value,saved})=>JSON.stringify(metric(id))===value&&localStorage.getItem(ACTION_STORAGE_KEY)===saved,{id:item.id,...before}),'Pagination changes metric evidence or saved records');
   if(item.id===52){const form=p.locator('.action-record');check(await form.locator('[name=note]').inputValue()==='翻页保持原问题草稿'&&await form.locator('> .table-note').innerText()===baseline,'Pagination changes issue baseline or draft');}
   const search=list.getByRole('searchbox');await search.fill('NO-SUCH-SYNTHETIC-RECORD');check(await previous().isDisabled()&&await next().isDisabled()&&await search.evaluate(n=>n===document.activeElement),'Empty search loses focus or enables pagination');
   check(await p.evaluate(id=>JSON.stringify(metric(id)),item.id)===before.value,'Empty list turns the metric into zero');
   await search.fill('');check(await previous().isDisabled()&&await next().isEnabled()&&await search.evaluate(n=>n===document.activeElement),'Clearing search loses focus or page-one state');
   results.push({metric:item.id,width,font:size,pages:labels.length,uniqueRecords:all.length,boundaryFocus:true,visible:true,draftAndCounts:true});
  }
  check(!errors.length,errors.join('; '));return{status:'PASS',engine,results};
 }finally{await c.close();}
}
