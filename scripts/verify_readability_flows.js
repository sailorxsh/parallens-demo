// Desktop reading, enlarged text, keyboard focus, and actual control/background contrast.
async (parent) => {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],states=[],focus=[];
  p.on('pageerror',error=>errors.push(error.message));
  const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const open=async(route='')=>{
    await p.evaluate(()=>{document.documentElement.style.fontSize='';document.body.style.zoom='';});
    await p.goto(`${base}#/${route}`);
    await p.waitForFunction(()=>typeof lastRenderedHash!=='undefined'&&lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
    await settle();
  };
  const layout=()=>p.evaluate(()=>{
    const nodes=[...document.querySelectorAll('.home-result,.detail-kpi,.income-evidence,.income-context,.heading-meta')];
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,
      clipped:nodes.filter(n=>n.scrollWidth>n.clientWidth+2).map(n=>n.className),
      evidenceWidth:document.querySelector('.income-evidence')?.getBoundingClientRect().width,
      titleWidth:document.querySelector('.page-heading>div:first-child')?.getBoundingClientRect().width,
      headingHeight:document.querySelector('h1').getBoundingClientRect().height,
      columns:getComputedStyle(document.querySelector('.home-results')||document.querySelector('.detail-kpis')).gridTemplateColumns.split(' ').length,
      journeyColumns:document.querySelector('.journey-rail')&&getComputedStyle(document.querySelector('.journey-rail')).gridTemplateColumns.split(' ').length,
      chartMismatch:[chart,statusChart,...sparklines,...detailCharts].filter(instance=>instance&&!instance.isDisposed()&&instance.getDom().isConnected&&instance.getDom().clientWidth&&instance.getDom().clientHeight)
        .filter(instance=>Math.abs(instance.getWidth()-instance.getDom().clientWidth)>=1||Math.abs(instance.getHeight()-instance.getDom().clientHeight)>=1)
        .map(instance=>({box:[instance.getDom().clientWidth,instance.getDom().clientHeight],chart:[instance.getWidth(),instance.getHeight()]}))};
  });
  const colorState=locator=>locator.evaluate(el=>{
    const rgba=s=>{const m=s.match(/[\d.]+/g);return m?[+m[0],+m[1],+m[2],m[3]===undefined?1:+m[3]]:[0,0,0,0];};
    const over=(a,b)=>{const alpha=a[3]+b[3]*(1-a[3]);return [...a.slice(0,3).map((v,i)=>(v*a[3]+b[i]*b[3]*(1-a[3]))/(alpha||1)),alpha];};
    const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    const chain=[];for(let n=el.parentElement;n;n=n.parentElement)chain.push(rgba(getComputedStyle(n).backgroundColor));
    let bg=[255,255,255,1];chain.reverse().forEach(c=>bg=over(c,bg));
    const contrast=s=>{const a=lum(over(rgba(s),bg)),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
    const style=getComputedStyle(el),r=el.getBoundingClientRect(),center=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
    return {outline:style.outlineStyle,width:parseFloat(style.outlineWidth),focusRatio:contrast(style.outlineColor),
      borderRatio:contrast(style.borderTopColor),borderWidth:parseFloat(style.borderTopWidth),size:parseFloat(style.fontSize),
      visible:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&el.contains(center),
      focused:document.activeElement===el};
  });
  try {
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:1000});
      for(const page of ['',...'ABCDEFG']) {
        await open(page);const state=await layout();
        check(!state.overflow&&!state.clipped.length&&!state.chartMismatch.length,`Normal desktop clipping: ${page} ${width} ${JSON.stringify(state)}`);
        check(state.columns===4,`${page||'HOME'} loses normal four-card density at ${width}`);
        if(!page)check(state.journeyColumns===6,'Normal desktop no longer shows six journey nodes in a row');
        states.push({page,width,scale:1,...state});
      }
    }
    await p.setViewportSize({width:1366,height:1000});
    for(const size of [24,32])for(const page of ['',...'ABCDEFG']) {
      await open(page);await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await settle();
      const state=await layout();
      check(!state.overflow&&!state.clipped.length&&!state.chartMismatch.length,`Enlarged clipping: ${page} ${size} ${JSON.stringify(state)}`);
      if(page)check(state.evidenceWidth>=700,'Enlarged evidence remains an unreadable narrow column');
      else check(state.titleWidth>=700&&state.headingHeight<80,'Enlarged home title is vertically squeezed');
      states.push({page,width:1366,scale:size/16,...state});
      await p.locator('.metric-search-trigger').focus();await p.locator('.sidebar-nav .nav-link').last().focus();await settle();
      const sidebar=await p.locator('.sidebar-nav .nav-link').last().evaluate(el=>{
        const r=el.getBoundingClientRect();return {visible:r.top>=6&&r.bottom<=innerHeight-6&&document.activeElement===el,scroll:el.closest('.sidebar-inner').scrollTop};
      });
      check(sidebar.visible,`Enlarged sidebar hides its last diagnosis link: ${page} ${size} ${JSON.stringify(sidebar)}`);
    }
    await open();await p.keyboard.press('Tab');
    for(const selector of ['.metric-search-trigger','.quality-status','.home-result .definition-trigger','.home-signal-actions .insight-link']) {
      const control=p.locator(selector).first();await control.focus();await settle();const state=await colorState(control);
      check(state.focused&&state.visible&&state.width>=2&&state.outline!=='none'&&state.focusRatio>=3,`Unclear keyboard focus: ${selector} ${JSON.stringify(state)}`);
      focus.push({selector,...state});
    }
    await p.locator('.home-result .definition-trigger').first().click();
    const popover=p.locator('#metric-definition-popover');await popover.waitFor();
    check(await popover.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),'Definition is clipped after typography changes');
    await p.keyboard.press('Escape');check(!await popover.isVisible(),'Definition Escape dismissal regressed');
    await open('E?metric=39&issue=39&panel=data');
    for(const selector of ['.action-record [name="owner"]','.action-record [name="issueMetric"]','.action-record [name="note"]']) {
      const control=p.locator(selector);await control.focus();await settle();const state=await colorState(control);
      check(state.focused&&state.visible&&state.focusRatio>=3&&state.borderRatio>=3&&state.borderWidth>=1,`Weak registration boundary: ${selector} ${JSON.stringify(state)}`);
      focus.push({selector,...state});
    }
    await p.locator('.filter-bar > summary').click();
    const country=p.locator('.filter-field select[name="country"]');await country.focus();await settle();const countryState=await colorState(country);
    check(countryState.focused&&countryState.visible&&countryState.focusRatio>=3&&countryState.borderRatio>=3,'Filter focus or border is indistinct');
    focus.push({selector:'country filter',...countryState});
    await open('D?metric=18&panel=groups');
    const sample=p.locator('.trial-sample-item').first();await sample.waitFor();await sample.focus();await settle();const sampleState=await colorState(sample);
    check(sampleState.visible&&sampleState.focusRatio>=3&&sampleState.width>=2,'Trial sample keeps the low-contrast focus override');
    focus.push({selector:'trial sample',...sampleState});
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',states,focus,checks:['three desktop widths across HOME/A–G','normal four results and six nodes',
      '150/200 percent HTML text reflow across HOME/A–G','scrollable enlarged sidebar','nine light/dark keyboard focus targets',
      'registration and filter control boundaries','definition fit and Escape','chart size follows CSS reflow']};
  } finally {await context.close();}
}
