// Reconcile visible scope claims with the checked-in business policy, including unavailable cards.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({reducedMotion:'reduce',locale:'zh-CN'});
  const policy=JSON.parse(fs.readFileSync('data/filter-policy.json','utf8'));
  const ids=[41,42,48,49,15,52,29,22],states=[],errors=[];
  const labels={country:'国家/市场',appPlatform:'App平台',productLine:'产品线'};
  const names={US:'美国',UK:'英国',DE:'德国',Other:'其他',Bird:'观鸟',Hunting:'狩猎'};
  const cases=[{}, {country:'US'},{appPlatform:'iOS'},{appPlatform:'Android'},
    {country:'US',appPlatform:'iOS'},{productLine:'Hunting'},{productLine:'Bird'},
    {country:'UK',appPlatform:'Android',productLine:'Bird'},
    {country:'Other',appPlatform:'iOS',productLine:'Hunting'}];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const card=(p,id)=>p.locator('.mini-card').filter({has:p.locator(`a.card-link[href*="metric=${id}"]`)});
  const settle=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  let defaults;
  try{
    for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32],[1600,32],[1920,32],[1100,32]]){
      // Independent pages avoid WebKit's short-window History API write limit.
      const p=await context.newPage();await p.setViewportSize({width,height:1000});p.setDefaultTimeout(6000);
      p.on('pageerror',e=>errors.push(e.message));
      try{
        for(const filters of cases){
          await p.goto(`${base}#/?${new URLSearchParams(filters)}`);
          try{await p.waitForFunction(()=>document.querySelector('#main[aria-busy="false"] .home-alerts')&&lastRenderedHash===location.hash);}
          catch(e){throw Error(`${e.message}; scope=${JSON.stringify(filters)}; state=${JSON.stringify(await p.evaluate(()=>({url:location.href,last:typeof lastRenderedHash==='undefined'?null:lastRenderedHash,body:document.querySelector('#main')?.innerText.slice(0,300)})))}; errors=${errors.join('; ')}`);}
          await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await p.evaluate(()=>document.fonts.ready);await settle(p);
          const measures=await p.evaluate(ids=>ids.map(id=>({id,kind:metric(id).kind,reason:metric(id).reason})),ids);
          const observed=[];
          for(const measure of measures){
            const id=measure.id,node=card(p,id),link=node.locator('a.card-link');
            const note=await link.locator(':scope > p:not(.metric-filter-scope)').innerText();
            const metadata=(await link.locator(':scope > .metric-filter-scope').allTextContents()).join('');
            const value=await link.locator('.metric-value').innerText();
            const dimensions=policy.metrics.find(item=>item.id===id).businessDimensions;
            const applied=Object.entries(filters).filter(([key])=>dimensions.includes(key));
            const ignored=Object.entries(filters).filter(([key])=>!dimensions.includes(key));
            check(!metadata.includes('按当前筛选')&&!note.includes('按当前筛选'),`${id}: claims every global filter applies`);
            if(measure.kind==='na'){
              check(note===measure.reason,`${id}: unavailable reason replaced with a generic estimate claim`);
              check(!metadata.includes('模拟分片')&&!metadata.includes('事件汇总'),`${id}: unavailable result claims a computed source`);
              check(!await node.locator('.metric-value-unit').count()&&/待补数据|不适用/.test(value),`${id}: unavailable value fabricated`);
            }else{
              if(id===41)check(note.includes('近30天'),'Device activity window is missing from its homepage card');
              if(defaults)check(note===defaults[id].note,`${id}: filtering hides the original business definition`);
              check(!/NaN|undefined/.test(value),`${id}: invalid number`);
              if(applied.length){const expected=({15:'合成设备台账逐台计数',41:'合成设备行为间隔汇总',42:'合成触发事件汇总'})[id]??'模拟分片估算';check(metadata.includes(expected),`${id}: filtered source is undisclosed`);if([15,41,42].includes(id))check(!metadata.includes('模拟分片估算'),`${id}: fact aggregation is mislabeled as independent estimates`);}
            }
            if(ignored.length){
              check(metadata.includes('未应用：'),`${id}: ignored filters are undisclosed`);
              const [appliedText,ignoredText]=metadata.split('；未应用：');
              for(const [key,option] of ignored){
                const text=`${labels[key]} ${names[option]??option}`;
                check(ignoredText.includes(text)&&!appliedText.includes(text),`${id}: ignored condition appears applied`);
              }
              if(applied.length){
                check(appliedText.startsWith(measure.kind==='na'?'本项条件：':'本项应用：'),`${id}: incorrect scope state`);
                for(const [key,option] of applied)check(appliedText.includes(`${labels[key]} ${names[option]??option}`),`${id}: applied condition missing`);
              }else{
                check(appliedText==='本项仍为总体范围'&&!metadata.includes('模拟分片'),`${id}: unchanged total presented as a slice`);
                check(value===defaults[id].value,`${id}: non-business filter changed its population`);
              }
            }else check(!metadata.includes('未应用')&&!metadata.includes('总体范围'),`${id}: stale scope warning`);
            check(await node.evaluate(n=>n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1),`${id}: context escapes its card`);
            check(await node.evaluate(n=>n.getBoundingClientRect().width/parseFloat(getComputedStyle(document.documentElement).fontSize)>=14),`${id}: text reflows into an unreadably narrow column`);
            observed.push({id,note,metadata,value,kind:measure.kind});
          }
          if(!Object.keys(filters).length){
            defaults=Object.fromEntries(observed.map(item=>[item.id,item]));
            check(observed.every(item=>!item.metadata),'Default view gains unnecessary scope text');
          }
          check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Context causes page overflow');
          await p.locator('#statusChart').scrollIntoViewIfNeeded();
          await p.waitForFunction(()=>{const box=document.querySelector('#statusChart'),chart=echarts.getInstanceByDom(box);
            return chart&&Math.abs(chart.getWidth()-box.clientWidth)<1&&Math.abs(chart.getHeight()-box.clientHeight)<1;});
          const status=await p.locator('#statusChart').evaluate(box=>{
            const bounds=box.getBoundingClientRect();
            const labels=[...box.querySelectorAll('svg text')].map(n=>({text:n.textContent,rect:n.getBoundingClientRect()})).filter(n=>n.rect.width&&n.rect.height);
            const clipped=labels.filter(({rect:r})=>r.x<bounds.x-2||r.right>bounds.right+2||r.y<bounds.y-2||r.bottom>bounds.bottom+2).map(n=>n.text);
            const overlaps=[];
            for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
              const a=labels[i].rect,b=labels[j].rect;
              if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)
                overlaps.push([labels[i].text,labels[j].text]);
            }
            return {labelCount:labels.length,clipped,overlaps};
          });
          check(status.labelCount>=13&&!status.clipped.length&&!status.overlaps.length,`Status labels are unreadable: ${JSON.stringify(status)}`);
          states.push({width,size,filters,cards:observed,status});
        }
      }finally{await p.close();}
    }
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(base);await p.locator('#main[aria-busy="false"] .home-alerts').waitFor();
    await p.locator('.filter-bar > summary').click();
    await p.getByLabel('App平台',{exact:true}).selectOption('iOS');
    check((await card(p,15).innerText()).includes('本项仍为总体范围'),'Selecting a non-applicable control conceals total scope');
    await p.getByLabel('国家/市场',{exact:true}).selectOption('US');
    check((await card(p,42).innerText()).includes('缺少同范围明细')&&
      (await card(p,42).locator('.metric-filter-scope').innerText()).startsWith('本项条件：'),'Combined filter transition retains a computed claim');
    await p.getByLabel('App平台',{exact:true}).selectOption('All');
    check(!await card(p,15).locator('.metric-filter-scope').innerText().then(text=>text.includes('未应用')),'Clearing platform retains an ignored condition');
    await p.getByRole('button',{name:'重置全部',exact:true}).click();
    check(await p.locator('.mini-card .metric-filter-scope').count()===0&&await card(p,42).locator('.metric-value').innerText()==='58.0%','Reset fails to restore the default scope and fact');
    await p.close();check(!errors.length,errors.join('; '));
    return {status:'PASS',states,transitionChecks:4,checks:['eight card claims vs business policy','ignored-only and partial scope','pending and not-applicable explanations','business definitions preserved','source disclosure without fake computation','default, three widths and 200% text','real control transitions and reset','no overflow or runtime errors']};
  }finally{await context.close();}
}
