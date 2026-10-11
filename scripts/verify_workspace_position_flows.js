// Panel height changes must not move readers out of the diagnosis they selected.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({reducedMotion:'reduce'});
  const p=await context.newPage(),results=[],errors=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
  const position=()=>p.evaluate(()=>({y:scrollY,max:Math.max(0,document.documentElement.scrollHeight-innerHeight),
    current:document.querySelector('.section-navigation-item[aria-current]')?.textContent}));
  try {
    for(const [width,height] of [[1487,1060],[1366,768]]) {
      await p.setViewportSize({width,height});
      for(const [page,metric] of [['E',39],['D',18],['C',42],['G',54]]) {
        await p.goto(`${base}#/${page}?metric=${metric}&panel=groups`);
        await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
        await p.getByRole('button',{name:'诊断工作区',exact:true}).click();await settle();
        const selected=()=>p.locator('.income-tab[aria-selected="true"]');
        for(const [key,keyboard] of [['data',false],['groups',false],['data','ArrowRight'],['change','Home'],['data','End']]) {
          const button=p.locator(`#${page}-tab-${key}`);
          const trigger=keyboard?selected():button;
          const bounds=await trigger.boundingBox();
          check(bounds&&bounds.y>=0&&bounds.y+bounds.height<=height,`${page} tab is outside the selected workspace viewport`);
          if(keyboard)await trigger.evaluate(n=>n.focus({preventScroll:true}));
          const before=await position();
          if(keyboard)await trigger.press(keyboard);else await button.click();
          await settle();
          const after=await position(),expected=Math.min(before.y,after.max);
          check(Math.abs(after.y-expected)<=2,`${page} ${key} ${width}: viewport moved ${before.y}→${after.y}, expected ${expected}`);
          check(after.current==='诊断工作区',`${page} ${key} ${keyboard||'click'} ${width}×${height}: ${JSON.stringify({before,after})}`);
          check(await button.getAttribute('aria-selected')==='true'&&await button.evaluate(n=>document.activeElement===n),`${page} ${key} loses selection or focus`);
          const params=new URLSearchParams(p.url().split('?')[1]);
          check((params.get('panel')??'change')===key,`${page} ${key} loses URL state`);
          results.push({page,key,keyboard:keyboard||null,width,height,before:before.y,after:after.y,max:after.max});
        }
        // Keeping a tab's reading position must not pin the scrollspy during ordinary scrolling.
        await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await settle();
        check((await position()).current==='关键指标',`${page} manual scroll does not update the navigation`);
      }
    }
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:['panel shrink and grow','pointer and keyboard activation','native scroll limit','section follows manual scroll','selection focus and URL'],results};
  } finally {await context.close();}
}
