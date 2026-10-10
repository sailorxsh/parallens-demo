// Isolated browser probe: decoration cannot cover controls; section state follows visible evidence.
async (parent) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1487,height:1060},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const current=()=>p.locator('.section-navigation-item[aria-current="location"]').innerText();
  const open=async(route='')=>{
    await p.goto(`${base}#/${route}`);
    await p.locator('#main[aria-busy="false"] h1').waitFor();await settle();
  };
  try {
    for(const width of [1366,1600,1920,1100]) {
      await p.setViewportSize({width,height:900});await open();
      await p.locator('.field-landscape').evaluate(n=>n.decode());
      const state=await p.evaluate(()=>{
        const rect=n=>n.getBoundingClientRect(),image=document.querySelector('.field-landscape');
        const imageRect=rect(image),title=rect(document.querySelector('.home-field-heading>div:first-child'));
        const meta=rect(document.querySelector('.home-field-heading .heading-meta'));
        const quality=document.querySelector('.quality-status'),q=rect(quality);
        const overlaps=(a,b)=>a.width>0&&b.width>0&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        return {width:innerWidth,decorationVisible:!!image.getClientRects().length,
          collision:overlaps(imageRect,title)||overlaps(imageRect,meta),
          qualityClickable:quality.contains(document.elementFromPoint((q.left+q.right)/2,(q.top+q.bottom)/2)),
          overflow:document.documentElement.scrollWidth>innerWidth,
          imageLoaded:image.complete&&image.naturalWidth===384};
      });
      check(state.imageLoaded&&!state.collision&&!state.overflow&&state.qualityClickable,`Header collision: ${JSON.stringify(state)}`);
      check(state.decorationVisible===(width>1200),'Narrow desktop does not preserve room for content');
      results.push({kind:'header',...state});
    }
    await p.setViewportSize({width:1366,height:768});await open();
    await p.evaluate(()=>document.documentElement.style.fontSize='24px');await settle();
    check(!await p.evaluate(()=>{
      const image=document.querySelector('.field-landscape').getBoundingClientRect();
      const text=document.querySelector('.home-field-heading>div:first-child').getBoundingClientRect();
      const meta=document.querySelector('.heading-meta').getBoundingClientRect();
      return document.documentElement.scrollWidth>innerWidth||image.width>0&&(text.right>image.left||meta.left<image.right);
    }),'Enlarged text escapes reserved header columns');
    await p.locator('.quality-status').focus();await p.keyboard.press('Enter');
    await p.locator('#metric-evidence-54').waitFor();
    check(p.url().includes('/G?metric=54'),'Header quality action is covered or broken');
    await p.evaluate(()=>document.documentElement.style.fontSize='');
    // A short collapsed catalog at document bottom must not steal the section indicator.
    await p.setViewportSize({width:1487,height:1060});await open('E?metric=39&panel=groups');
    check(await current()==='诊断工作区','Deep-linked E evidence is mislabeled as the collapsed catalog');
    await p.getByRole('button',{name:'诊断工作区',exact:true}).click();await settle();
    check(await current()==='诊断工作区'&&!await p.locator('.income-catalog').evaluate(n=>n.open),'Diagnosis selection is immediately overridden');
    check((await p.locator('.detail-finding .insight-tag').innerText()).includes('#35 月度订阅付费用户与人均收入'),
      'Page-level observation lacks its own metric identity');
    await p.locator('.detail-finding .issue-register').click();
    check(await p.locator('.action-record [name="issueMetric"]').inputValue()==='35','Observation registration lost its metric');
    for(const label of ['关键指标','诊断工作区','全部指标']) {
      await p.getByRole('button',{name:label,exact:true}).focus();await p.keyboard.press('Enter');await settle();
      check(await current()===label,`Keyboard section destination does not select ${label}`);
      check(await p.evaluate(()=>document.activeElement.tagName==='H2'),'Section navigation loses destination focus');
    }
    check(await p.locator('.income-catalog').evaluate(n=>n.open),'Catalog navigation does not reveal metrics');
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:900});
      for(const page of ['A','B','C','D','E','F','G']) {
        await open(page);
        await p.getByRole('button',{name:'诊断工作区',exact:true}).click();await settle();
        check(await current()==='诊断工作区',`${page} diagnosis navigation at ${width} is stale`);
        results.push({kind:'navigation',page,width});
      }
    }
    await p.setViewportSize({width:1487,height:1060});await open('E?metric=39&panel=groups');
    await p.getByRole('button',{name:'诊断工作区',exact:true}).click();
    await p.getByRole('tab',{name:'完整数据',exact:true}).click();await settle();
    check(await current()==='诊断工作区','Panel reflow leaves the section state stale');
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['four desktop header widths','enlarged text and keyboard quality action',
      'E deep-link collapsed-catalog regression','page observation registration identity','keyboard section destinations',
      'A–G diagnosis at three widths','panel reflow synchronization'],results};
  } finally {await context.close();}
}
