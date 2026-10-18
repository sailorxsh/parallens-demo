// Inspect real rendered rows against source facts; counterfactual arithmetic lives in verify_projection.mjs.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:900},reducedMotion:'reduce',locale:'zh-CN'});
  const p=await context.newPage(),errors=[],states=[];
  const records=JSON.parse(fs.readFileSync('data/trial-facts.json','utf8')).records;
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const count=value=>value.toLocaleString('en-US'),rate=value=>`${(value*100).toFixed(1)}%`;
  const signed=value=>`${Math.abs(value)<.005?'':value>0?'+':'−'}${Math.abs(value).toFixed(2)}`;
  const fields={country:'country',appPlatform:'app_platform',productLine:'product_line',plan:'plan'};
  p.on('pageerror',error=>errors.push(error.message));p.setDefaultTimeout(6000);
  const expected=filters=>{
    const rows=records.filter(row=>Object.entries(filters).every(([key,value])=>row[fields[key]]===value));
    const periods=['previous','current'].map(period=>rows.filter(row=>row.period===period));
    const matches=row=>row.product_line==='Bird'&&row.app_platform==='Android'&&row.plan==='Plus'&&row.billing_cycle==='monthly';
    const groups=[periods.map(rows=>rows.filter(matches)),periods.map(rows=>rows.filter(row=>!matches(row)))].filter(group=>group.some(rows=>rows.length));
    if(periods.some(rows=>rows.length<30)||groups.some(group=>group.some(rows=>rows.length<30)))return null;
    const summaries=groups.map(group=>{
      const n=group.map(rows=>rows.filter(row=>row.converted).length),d=group.map(rows=>rows.length);
      const r=n.map((value,index)=>value/d[index]),w=d.map((value,index)=>value/periods[index].length);
      return {n,d,r,w,within:(w[0]+w[1])/2*(r[1]-r[0])*100,mix:(r[0]+r[1])/2*(w[1]-w[0])*100,
        total:(n[1]/periods[1].length-n[0]/periods[0].length)*100};
    });
    return {periods,summaries};
  };
  const open=async filters=>{
    await p.goto(`${base}#/D?metric=18&panel=groups&${new URLSearchParams(filters)}`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
    await p.evaluate(()=>document.fonts.ready);
  };
  try{
    for(const [width,fontSize] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
      await p.setViewportSize({width,height:1000});
      for(const filters of [{},{country:'US'},{country:'UK'},{appPlatform:'iOS'},{productLine:'Bird',appPlatform:'Android'}]){
        await open(filters);await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,fontSize);
        const source=expected(filters),details=p.locator('.trial-rate-decomposition');
        check(Boolean(source),'Fixture requires a valid decomposition');
        check(await details.count()===1&&!await details.evaluate(n=>n.open),'Detailed arithmetic should be available but collapsed');
        const pair=p.locator('.trial-period-comparisons .evidence-pair');
        const summary=await pair.locator('.table-note').first().innerText();
        check(summary.includes(`组内表现 ${signed(source.summaries.reduce((sum,item)=>sum+item.within,0))}`)&&
          summary.includes(`人群构成 ${signed(source.summaries.reduce((sum,item)=>sum+item.mix,0))}`),'Default summary contradicts raw records');
        const original=await pair.locator('.detail-chart').evaluate(n=>{
          const o=echarts.getInstanceByDom(n).getOption();return {min:o.yAxis[0].min,max:o.yAxis[0].max,values:o.series[0].data.map(v=>typeof v==='number'?v:v.value)};
        });
        check(original.min<=Math.min(0,...original.values)&&original.max>=Math.max(0,...original.values)&&
          original.values.every((value,index)=>Math.abs(value-source.summaries[index].total)<1e-9),'Original contribution changed or zero/data is clipped');
        await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
        const form=p.locator('.action-record');await form.locator('[name="note"]').fill('拆分核验保留的草稿');
        const baseline=await form.locator('> .table-note').first().innerText();
        const originalUrl=p.url();
        const button=p.getByRole('navigation',{name:'分组证据定位'}).getByRole('button',{name:'核对组内表现与人群构成拆分',exact:true});
        await button.focus();await button.press('Enter');
        check(await details.evaluate(n=>n.open&&n.contains(document.activeElement)),'Keyboard destination must open and focus the calculation');
        await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const heading=await details.locator('summary').boundingBox(),navigation=await p.getByRole('navigation',{name:'分组证据定位'}).boundingBox();
        check(heading.y>=navigation.y+navigation.height-2&&heading.y+heading.height<1000,'New calculation destination is obscured or outside the viewport');
        const actual=await details.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.children].map(cell=>cell.textContent)));
        source.summaries.forEach((item,index)=>{
          const expectedCells=[...item.n.map((n,i)=>`${count(n)} / ${count(item.d[i])}（${rate(item.r[i])}）`),
            item.w.map(rate).join(' → '),signed(item.within),signed(item.mix)];
          check(JSON.stringify(actual[index].slice(1))===JSON.stringify(expectedCells),'Displayed counts, rates, shares or effects differ from raw records');
          check(Math.abs(item.within+item.mix-item.total)<1e-9,'Within plus composition must reconcile with the original contribution');
        });
        const wrap=details.locator('.data-table-scroll');
        const overflowing=await wrap.evaluate(n=>n.scrollWidth>n.clientWidth+2);
        if(overflowing){
          await p.waitForFunction(()=>document.querySelector('.trial-rate-decomposition .data-table-scroll')?.getAttribute('role')==='region');
          check(await wrap.locator('.table-scroll-hint').isVisible(),'Wide calculation has no discoverable scrolling');
          await wrap.focus();await wrap.press('ArrowRight');
          await p.waitForFunction(()=>document.querySelector('.trial-rate-decomposition .data-table-scroll').scrollLeft>0);
        }
        check(await details.locator('tbody th').first().evaluate(n=>n.getBoundingClientRect().width>=parseFloat(getComputedStyle(document.documentElement).fontSize)*10-1),'Group names lost their minimum readable width');
        check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Calculation causes whole-page overflow');
        check(p.url()===originalUrl&&await form.locator('[name="note"]').inputValue()==='拆分核验保留的草稿'&&
          await form.locator('> .table-note').first().innerText()===baseline,'Opening arithmetic changes the scope, issue draft or baseline');
        await details.locator('summary').focus();await details.locator('summary').press('Space');
        check(!await details.evaluate(n=>n.open),'Native disclosure does not close from keyboard');
        states.push({width,fontSize,filters,rows:actual.length,within:source.summaries.reduce((sum,item)=>sum+item.within,0),composition:source.summaries.reduce((sum,item)=>sum+item.mix,0)});
      }
    }
    for(const filters of [{week:'12'},{country:'Other',plan:'Plus'},{plan:'Free'},{country:'FR'}]){
      await open(filters);check(await p.locator('.trial-rate-decomposition').count()===0,'Unavailable, invalid, or single-period scope shows a comparison');
    }
    await p.goto(`${base}#/E?metric=35&panel=groups`);await p.locator('#main[aria-busy="false"] h1').waitFor();
    check(await p.locator('.trial-rate-decomposition').count()===0,'Trial calculation leaked into another metric');
    check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['independent source rows','unchanged original contribution and zero baseline','native disclosure and keyboard destination','scrolling with readable group names','scope, draft and baseline preserved','unavailable and invalid scopes suppressed','no runtime errors']};
  }finally{await context.close();}
}
