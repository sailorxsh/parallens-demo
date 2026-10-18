// Complete review prose must be readable and editable without horizontal caret scrolling.
async(parent)=>{
 const base=new URL('.',parent.url()).href;
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'});
 const p=await c.newPage(),errors=[],states=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const form=()=>p.locator('.action-record'),field=name=>form().locator(`[name=${name}]`);
 const target='演示验收：以同口径的新成熟批次复查转正率，并同时核对支付回执；目标值由业务负责人确认，尚不能判定恢复。';
 const result='演示记录：原基线43.4%（434/1000），尚无处理后新批次结果；本次不确认达标。';
 const open=async(code,id)=>{
  await p.goto(`${base}#/${code}?metric=${id}&issue=${id}`);
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
  await form().waitFor();
 };
 const save=()=>form().getByRole('button',{name:'保存本地记录',exact:true}).click();
 const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const read=()=>p.locator('.review-text').evaluateAll(nodes=>nodes.map(n=>({name:n.name,value:n.value,
  tag:n.tagName,width:n.clientWidth,scrollWidth:n.scrollWidth,height:n.clientHeight,scrollHeight:n.scrollHeight,
  resize:getComputedStyle(n).resize,maxHeight:parseFloat(getComputedStyle(n).maxHeight),
  fontSize:parseFloat(getComputedStyle(n).fontSize)})));
 try{
  for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});
   for(const [code,id] of [['A',13],['B',25],['C',42],['D',18],['E',35],['F',48],['G',54]]){
    await open(code,id);await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);
    await field('status').selectOption('resolved');await field('target').fill(target);await field('reviewValue').fill(result);
    const fields=await read();
    check(fields.length===2&&fields.every(f=>f.tag==='TEXTAREA'&&f.resize==='vertical'&&f.width>=200),`Review controls too narrow at ${width}: ${code}`);
    check(fields.every(f=>f.scrollWidth<=f.width+1&&f.scrollHeight<=f.height+1),'Representative business prose is clipped or requires horizontal scrolling');
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Review prose causes page overflow');
    const before=await stored();await field('reviewValue').press('Enter');await p.keyboard.type('补充：未确认恢复');
    check(await stored()===before&&(await field('reviewValue').inputValue()).includes('\n补充'),'Enter submits the form instead of inserting a review line');
    await save();const saved=JSON.parse(await stored()),record=Object.values(saved).find(r=>r.page===code&&r.evidenceId===id);
    check(record.target===target&&record.reviewValue===result+'\n补充：未确认恢复','Multiline review is truncated on save');
    await p.reload();await form().waitFor();
    check(await field('reviewValue').inputValue()===record.reviewValue&&await form().getAttribute('data-dirty')==='false','Reload changes multiline content or creates a false draft');
    states.push({width,size,code,id,fields});
   }
  }
  await p.setViewportSize({width:1600,height:1000});await open('D',18);
  const old=JSON.parse(await stored()),key=Object.keys(old).find(k=>k==='record:D:默认演示范围:18');
  old[key].target='第一项：同口径核对\r\n第二项：业务负责人确认';
  old[key].reviewValue='434/1000\r\n仍为登记基线';old[key].note='处理说明\r\n尚无新结果';
  const original=JSON.stringify(old);await p.evaluate(value=>localStorage.setItem(ACTION_STORAGE_KEY,value),original);
  await p.reload();await form().waitFor();
  check(await stored()===original&&await form().getAttribute('data-dirty')==='false','Reading CRLF history rewrites the record or falsely marks it dirty');
  check(await field('target').inputValue()===old[key].target.replace(/\r\n/g,'\n'),'Native line-ending normalization loses content');
  await field('target').fill(target+'\n草稿补充');await p.locator('.sidebar-nav .nav-link[data-page="C"]').click();
  await p.locator('.sidebar-nav .nav-link[data-page="D"]').click();
  if(!await form().isVisible())await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
  check(await field('target').inputValue()===target+'\n草稿补充'&&await stored()===original,'Cross-page navigation loses or silently saves multiline draft');
  // Simulate browsers without field-sizing: retain a standard resizable textarea.
  await p.addStyleTag({content:'.action-record-fields textarea.review-text {field-sizing:fixed !important}'});
  await field('target').fill(target);await field('reviewValue').fill(result);
  check((await read()).every(f=>f.scrollWidth<=f.width+1&&f.scrollHeight<=f.height+1),'Fixed-size fallback cannot show representative prose');
  const area=field('target');await area.scrollIntoViewIfNeeded();const box=await area.boundingBox();
  const initial=await area.evaluate(n=>n.clientHeight);
  await p.mouse.move(box.x+box.width-4,box.y+box.height-4);await p.mouse.down();
  await p.mouse.move(box.x+box.width-4,box.y+box.height+40,{steps:8});await p.mouse.up();
  check(await area.evaluate(n=>n.clientHeight)>initial,'Native vertical resize does not work in the fallback');
  const long=Array.from({length:40},(_,i)=>`第${i+1}条：仅为长文本滚动测试，不代表实际结果。`).join('\n');
  await field('reviewValue').fill(long);
  const bounded=(await read()).find(f=>f.name==='reviewValue');
  check(bounded.scrollHeight>bounded.height&&bounded.height<=bounded.maxHeight+1,'Very long review cannot scroll or expands without a bound');
  // Begin at the first character; macOS uses Command+Down to move to text end.
  await field('reviewValue').evaluate(n=>{n.setSelectionRange(0,0);n.scrollTop=0;});
  const endKey=await p.evaluate(()=>navigator.platform.includes('Mac')?'Meta+ArrowDown':'Control+End');
  await field('reviewValue').press(endKey);
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  check(await field('reviewValue').evaluate(n=>n.scrollTop>0&&n.selectionStart===n.value.length),'Keyboard cannot reach the end of a long review');
  check(!errors.length,errors.join('; '));
  return {status:'PASS',states,checks:['28 page/desktop/text-size states','representative business prose fully readable',
   'Enter inserts a line rather than saving','multiline save and reload','CRLF history unchanged on read and not falsely dirty',
   'cross-page draft continuity','fixed-size fallback with native vertical drag','bounded long content and keyboard scrolling','no runtime errors']};
 }finally{await c.close();}
}
