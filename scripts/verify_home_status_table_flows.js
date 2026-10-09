async(page)=>{
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({locale:'zh-CN',reducedMotion:'reduce'}),p=await context.newPage(),results=[];
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});await p.goto(base);await p.locator('.status-table tbody tr').first().waitFor();await p.evaluate(()=>document.fonts.ready);
      const wrap=p.locator('.status-table');
      const actual=await wrap.evaluate(node=>{
        const box=node.getBoundingClientRect(),table=node.querySelector('table');
        return {width:node.clientWidth,scroll:node.scrollWidth,columns:[...table.querySelectorAll('thead th')].map(n=>({text:n.textContent,scope:n.scope})),
          rows:[...table.querySelectorAll('tbody tr')].map(row=>({scope:row.firstElementChild.scope,values:[...row.querySelectorAll('td')].map(n=>Number(n.textContent.replaceAll(',','')))})),
          clipped:[...table.querySelectorAll('th,td')].filter(n=>n.getBoundingClientRect().right>box.right+1||n.scrollWidth>n.clientWidth+1).map(n=>n.textContent)};
      });
      if(actual.scroll>actual.width+1||actual.clipped.length)throw new Error(`Status table hides columns at ${width}: ${JSON.stringify(actual)}`);
      if(actual.columns.length!==8||actual.columns.some(n=>n.scope!=='col')||actual.rows.some(n=>n.scope!=='row'))throw new Error('Status table loses explicit row/column headers');
      const independent=await p.evaluate(async()=>{
        const d=await (await fetch('./data/metric-values.json')).json();
        return ['bird','hunting'].map(line=>{const r=d.m05.value[line];return [r.free??r.noEntitlement,r.trialEarly+r.trialNearExpiry,r.paidCurrent,r.cancelledButEntitled,r.paymentFailed,r.expired??0,Object.values(r).reduce((a,b)=>a+b,0)];});
      });
      if(JSON.stringify(actual.rows.map(r=>r.values))!==JSON.stringify(independent))throw new Error('Visible states differ from independent source counts');
      await p.locator('.status-details').scrollIntoViewIfNeeded();
      if(width===1600)await p.screenshot({path:'output/playwright/v60-home-status-after.png'});
      results.push({width,columns:actual.columns.length,visibleTotals:actual.rows.map(r=>r.values.at(-1))});
    }
    // Larger desktop text may scroll the table; its columns remain reachable by keyboard.
    await p.setViewportSize({width:900,height:900});await p.evaluate(()=>document.documentElement.style.fontSize='20px');
    await p.evaluate(()=>updateScrollableTables());
    const wrap=p.locator('.status-table');
    if(await wrap.evaluate(n=>n.scrollWidth>n.clientWidth+1)) {
      if(await wrap.getAttribute('tabindex')!=='0'||!await wrap.locator('.table-scroll-hint').isVisible())throw new Error('Expanded reading loses keyboard/scroll discovery');
      await wrap.focus();await wrap.press('End');await wrap.evaluate(n=>n.scrollLeft=n.scrollWidth);
      if(!await wrap.evaluate(n=>n.scrollLeft>0))throw new Error('Overflowing table cannot reveal its final columns');
    }
    return {status:'PASS',checks:['all eight columns visible at normal desktop widths','source counts and totals retained','explicit row/column headers','expanded reading retains scroll access'],results};
  } catch(error) {
    const state=await p.evaluate(()=>({url:location.href,text:document.querySelector('main')?.innerText.slice(0,700),tables:document.querySelectorAll('.status-table').length}));
    throw new Error(`${error.message}; ${JSON.stringify(state)}`);
  } finally {await context.close();}
}
