// Real font delivery, exact source metrics, and graceful network failure.
async(parent)=>{
  const base=new URL('.',parent.url()).href,states=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  for(const failure of ['none','woff2','all']) {
    const context=await parent.context().browser().newContext({viewport:{width:1600,height:900},reducedMotion:'reduce'});
    const p=await context.newPage(),requests=[],errors=[];
    p.on('request',r=>{if(r.url().includes('/vendor/fonts/'))requests.push(new URL(r.url()).pathname);});
    p.on('pageerror',e=>errors.push(e.message));
    if(failure!=='none')await context.route('**/vendor/fonts/*',route=>{
      if(failure==='all'||new URL(route.request().url()).pathname.endsWith('.woff2'))return route.abort();
      return route.continue();
    });
    try {
      await p.goto(base);
      await p.locator('#main[aria-busy="false"] h1').waitFor();
      await p.locator('#trendChart svg').waitFor();
      await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      const fontState=await p.evaluate(()=>({check:document.fonts.check('650 24px "DM Sans"','12,400 € Ā →'),
        faces:[...document.fonts].filter(f=>f.family==='DM Sans').map(f=>f.status)}));
      const loaded=fontState.faces.some(status=>status==='loaded');
      check(requests.some(url=>url.endsWith('.woff2')),'WOFF2 not requested');
      check(requests.some(url=>url.endsWith('.ttf'))===(failure!=='none'),'Normal delivery downloads both fonts or failure loses TTF fallback');
      check(loaded===(failure!=='all'),`Unexpected face availability: ${failure}`);
      // WebKit can report check()=true for an errored face; inspect the face itself.
      check(fontState.faces.length===1&&fontState.faces[0]===(failure==='all'?'error':'loaded'),`Incorrect font face state: ${JSON.stringify(fontState)}`);
      const delivery=[...requests];
      let metrics=null;
      if(failure!=='all') {
        metrics=await p.evaluate(async()=>{
          const source=new FontFace('Parallens source baseline',"url('./vendor/fonts/dm-sans-variable.ttf')",{weight:'400 700',style:'normal'});
          await source.load();document.fonts.add(source);
          const sample='PARALLENS 12,400 $56,000 +3.2% Ā Ł é £ € → − ≤ ≥ 经营简报';
          const measurements=[];
          for(const weight of [400,500,600,650,700])for(const size of [14,24,32]) {
            const spans=['DM Sans','Parallens source baseline'].map(family=>{
              const n=document.createElement('span');n.textContent=sample;
              Object.assign(n.style,{fontFamily:`"${family}", "PingFang SC", sans-serif`,fontSize:`${size}px`,fontWeight:String(weight),display:'inline-block',position:'fixed',top:'0',left:'0',visibility:'hidden'});
              document.body.append(n);return n;
            });
            const bounds=spans.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};});
            spans.forEach(n=>n.remove());measurements.push({weight,size,bounds});
          }
          document.fonts.delete(source);return measurements;
        });
        check(metrics.every(m=>JSON.stringify(m.bounds[0])===JSON.stringify(m.bounds[1])),'Font format changes rendered text metrics');
      }
      await p.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'D · 订阅转化',exact:true}).click();
      await p.waitForFunction(()=>location.hash==='#/D'&&lastRenderedHash===location.hash);
      const state=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
        kpis:[...document.querySelectorAll('.detail-kpi')].map(n=>n.innerText),
        graphs:[...document.querySelectorAll('.detail-chart')].filter(n=>n.checkVisibility()).map(n=>!!n.querySelector('svg text'))}));
      check(!state.overflow&&state.graphs.length&&state.graphs.every(Boolean),'Font failure breaks navigation or visible charts');
      check(state.kpis.some(text=>text.includes('43.4%')),'Font delivery loses current trial metric');
      check(!errors.length,errors.join('; '));
      states.push({failure,delivery,loaded,fontState,metrics,...state});
    }finally{await context.close();}
  }
  return {status:'PASS',states};
}
