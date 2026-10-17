// Real definition reading: exact catalog content, adjacent entry, scrolling, focus and scope.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const catalog=JSON.parse(fs.readFileSync('data/metric-catalog.json','utf8')).filter(item=>item.id!==1);
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:900},reducedMotion:'reduce'});
  const errors=[],states=[],check=(ok,message)=>{if(!ok)throw new Error(message);};
  const open=async(item,size={width:1600,height:900,font:16},fallback=false)=>{
    const p=await context.newPage();p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));
    if(fallback)await p.addInitScript(()=>Object.defineProperty(HTMLElement.prototype,'showPopover',{value:undefined,configurable:true}));
    await p.goto(`${base}#/${item.page}?metric=${item.id}&panel=groups`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
    await p.setViewportSize({width:size.width,height:size.height});
    await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,size.font);
    await p.evaluate(()=>document.fonts.ready);
    const trigger=p.locator('.income-evidence > .section-top .definition-trigger');
    check(await trigger.count()===1,`#${item.id} has no unique adjacent definition`);
    await trigger.scrollIntoViewIfNeeded();
    return {p,trigger};
  };
  const geometry=popover=>popover.evaluate(n=>{
    const r=n.getBoundingClientRect(),close=n.querySelector('.definition-close'),c=close.getBoundingClientRect(),body=n.querySelector('.definition-popover-body');
    return {width:r.width,inside:r.left>=15&&r.right<=innerWidth-15&&r.top>=15&&r.bottom<=innerHeight-15,
      closeVisible:c.top>=r.top&&c.bottom<=r.bottom&&c.width>=24&&c.height>=24&&close.contains(document.elementFromPoint((c.left+c.right)/2,(c.top+c.bottom)/2)),
      bodyWidth:body.clientWidth,bodyScroll:body.scrollTop,bodyOverflow:body.scrollHeight>body.clientHeight+1,
      contentContained:body.scrollWidth<=body.clientWidth+1,
      minFont:Math.min(...[...body.querySelectorAll('p')].map(p=>parseFloat(getComputedStyle(p).fontSize)))};
  });
  const position=p=>p.evaluate(()=>({x:scrollX,y:scrollY,url:location.href,metrics:JSON.stringify(dataset.metrics),stored:localStorage.getItem('parallens-demo-actions-v1')}));
  const same=(a,b)=>check(Math.abs(a.x-b.x)<1&&Math.abs(a.y-b.y)<1&&a.url===b.url&&a.metrics===b.metrics&&a.stored===b.stored,'Definition changes reading position, scope, metrics or saved records');
  try{
    // A fresh page per independent catalog route avoids WebKit's history-write rate limit.
    const routes=[...catalog,{...catalog.find(item=>item.id===3),page:'E'},{...catalog.find(item=>item.id===8),page:'F'}];
    for(const item of routes){
      const {p,trigger}=await open(item);
      try{
        const before=await position(p);await trigger.click();const popover=p.locator('#metric-definition-popover');
        const rows=await popover.locator('.definition-popover-row p').allTextContents();
        check(JSON.stringify(rows)===JSON.stringify([item.definition,item.formula,item.grain,item.source].filter(Boolean)),`#${item.id} shows another metric or modified source content`);
        check((await popover.locator('.definition-popover-head strong').innerText())===`${item.name} · 指标口径`,'Definition title loses metric identity');
        check(await p.getByRole('dialog',{name:`${item.name} · 指标口径`,exact:true}).count()===1,'Definition dialog is not named for the current metric');
        const state=await geometry(popover);check(state.inside&&state.closeVisible&&state.contentContained&&state.minFont>=13,'Definition is clipped, unreadable, or covered');
        same(before,await position(p));await p.keyboard.press('Escape');
        check(!await popover.isVisible()&&await trigger.evaluate(n=>document.activeElement===n),'Escape loses the definition trigger');same(before,await position(p));
        states.push({id:item.id,page:item.page,font:16,...state});
      }finally{await p.close();}
    }
    const long=catalog.find(item=>item.id===52);
    for(const width of [1100,1366,1920])for(const font of [24,32]){
      const {p,trigger}=await open(long,{width,height:650,font});
      try{
        const before=await position(p);await trigger.click();const popover=p.locator('#metric-definition-popover'),body=popover.locator('.definition-popover-body');
        const first=await geometry(popover);check(first.inside&&first.closeVisible&&first.contentContained&&first.width>=440*font/16-1&&first.minFont>=13*font/16,'Enlarged definition ignores readable text scale');
        await body.focus();await body.press('End');
        await p.waitForFunction(()=>{const n=document.querySelector('.definition-popover-body');return n.scrollTop>=n.scrollHeight-n.clientHeight-2;});
        const last=await geometry(popover);check(last.closeVisible&&last.contentContained,'Reading to the end loses the close control');same(before,await position(p));
        await popover.getByRole('button',{name:'关闭指标口径'}).click();
        check(!await popover.isVisible()&&await trigger.evaluate(n=>document.activeElement===n),'Close does not restore definition focus');same(before,await position(p));
        states.push({id:52,width,font,scrollable:first.bodyOverflow,last});
      }finally{await p.close();}
    }
    const live=await open(catalog.find(item=>item.id===18),{width:1366,height:900,font:16});
    try{
      const before=await position(live.p);await live.trigger.click();
      await live.p.evaluate(()=>document.documentElement.style.fontSize='32px');
      await live.p.setViewportSize({width:1100,height:650});
      const popover=live.p.locator('#metric-definition-popover');
      await live.p.waitForFunction(()=>{const r=document.querySelector('#metric-definition-popover').getBoundingClientRect();return r.width>=879&&r.right<=innerWidth-15&&r.bottom<=innerHeight-15;});
      const engine=context.browser().browserType().name();
      // WebKit's screenshot preparation forces stylesheet/layout synchronization.
      // Verify the painted open state before closing, then inspect the painted return state.
      await live.p.screenshot({path:`output/playwright/v102-definition-live-${engine}-open.png`});
      const state=await geometry(popover);check(state.inside&&state.closeVisible,'Open definition does not follow viewport/text changes');
      await live.p.keyboard.press('Escape');
      await live.p.screenshot({path:`output/playwright/v102-definition-live-${engine}-return.png`});
      check(await live.trigger.evaluate(n=>{const r=n.getBoundingClientRect();return document.activeElement===n&&r.top>=0&&r.bottom<=innerHeight&&n.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2));}),'Live text enlargement returns invisible definition focus');
      const after=await position(live.p);check(before.url===after.url&&before.metrics===after.metrics&&before.stored===after.stored,'Live enlargement changes scope, data or saved records');
      states.push({id:18,liveResize:true,...state});
    }finally{await live.p.close();}
    const draft=await open(catalog.find(item=>item.id===18));
    try{
      await draft.p.locator('.income-evidence > .section-top .issue-register').click();
      await draft.p.locator('.action-record [name="owner"]').fill('口径查看验收');
      await draft.p.locator('.action-record [name="note"]').fill('返回口径前的未保存草稿');
      const baseline=await draft.p.locator('.action-record > .table-note').allTextContents();
      await draft.trigger.scrollIntoViewIfNeeded();const before=await position(draft.p);
      await draft.trigger.click();await draft.p.keyboard.press('Escape');same(before,await position(draft.p));
      check(await draft.p.locator('.action-record [name="owner"]').inputValue()==='口径查看验收'&&
        await draft.p.locator('.action-record [name="note"]').inputValue()==='返回口径前的未保存草稿'&&
        JSON.stringify(await draft.p.locator('.action-record > .table-note').allTextContents())===JSON.stringify(baseline),'Definition replaces a draft or original registration baseline');
      states.push({id:18,draftPreserved:true});
    }finally{await draft.p.close();}
    const {p,trigger}=await open(catalog.find(item=>item.id===18),{width:1366,height:900,font:16},true);
    try{
      const before=await position(p);await trigger.click();const popover=p.locator('#metric-definition-popover');
      check((await geometry(popover)).closeVisible,'Fallback definition is not displayed');
      await p.keyboard.press('Escape');check(!await popover.isVisible()&&await trigger.evaluate(n=>document.activeElement===n),'API-disabled fallback cannot dismiss with Escape');same(before,await position(p));
    }finally{await p.close();}
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['all 53 metric definitions adjacent to evidence plus shared-topic entries','exact catalog content','Escape and close restore focus and reading position',
      'three desktop widths with 150%/200% text','keyboard scroll with persistent close','live text/viewport changes restore visible focus',
      'unchanged scope, values, draft, registration baseline and saved records','API-disabled fallback','no runtime errors'],states};
  }finally{await context.close();}
}
