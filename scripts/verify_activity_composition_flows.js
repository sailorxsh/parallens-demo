// Independently reconcile the seven exclusive cells, their overlapping sources and visible evidence.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),results=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const read=async name=>{const r=await parent.request.get(`${base}data/${name}.json`);check(r.ok(),name);return r.json();};
 const [raw,slices]=await Promise.all(['metric-values','filter-slices'].map(read)),original=raw.m30.value;
 const keys=['appOnly','contentOnly','pushOnly','appContentOnly','appPushOnly','contentPushOnly','allThree'];
 const names=['仅App','仅内容','仅推送','App＋内容','App＋推送','内容＋推送','三者都有'];
 const memberships={app:[0,3,4,6],content:[1,3,5,6],pushClicked:[2,4,5,6]};
 const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 };
 const open=async(route)=>{await p.goto(`${base}#/${route}`);await ready();};
 const pair=()=>p.locator('#B-panel-groups .evidence-pair[data-evidence-metric="30"]');
 const form=()=>p.locator('.action-record');
 const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const inspect=async(filters)=>{
  check(await p.locator('#B-tab-groups').getAttribute('aria-selected')==='true','Own composition chart is not the default');
  const plot=pair().locator('.detail-chart');await plot.locator('svg').waitFor();
  const state=await pair().evaluate(node=>{
   const plot=node.querySelector('.detail-chart'),chart=echarts.getInstanceByDom(plot),option=chart.getOption();
   const extent=chart.getModel().getComponent('yAxis',0).axis.scale.getExtent();
   return {value:metric(30).value,values:option.series[0].data,labels:option.xAxis[0].data,
    min:extent[0],max:extent[1],
    rows:[...node.querySelectorAll('tbody tr')].map(r=>[...r.children].map(c=>c.textContent)),
    note:node.textContent,summary:metricCardSummary(30),active:metric(4).value,mau:metric(25).value,
    legacyMargins:projectGroup(sourceData.metrics.m30.value,sharesFor(effectiveFor(30),30),effectiveFor(30),30)};
  });
  const scale=Object.entries(filters).reduce((n,[key,value])=>n*slices[key][value].denominatorShare,1);
  const cells=keys.map(k=>state.value.exclusiveCells[k]),union=Math.round(original.composite*scale);
  check(JSON.stringify(cells)===JSON.stringify(state.values),'Visible bars differ from projected source cells');
  check(cells.reduce((a,b)=>a+b,0)===union&&state.value.composite===union,'Seven groups do not close to the union');
  check(cells.every((n,i)=>Number.isSafeInteger(n)&&n>=0&&Math.abs(n-original.exclusiveCells[keys[i]]*scale)<1.00000001),
   'A cell changed by more than integer rounding');
  for(const [field,indexes] of Object.entries(memberships))check(indexes.reduce((n,i)=>n+cells[i],0)===state.value[field]&&
   state.value[field]===state.legacyMargins[field]&&Math.abs(state.value[field]-original[field]*scale)<=.50000001,
   `Source margin ${field} changed: ${JSON.stringify({filters,scale,cells,value:state.value[field],legacy:state.legacyMargins[field]})}`);
  check(state.active===union&&state.mau.MAU===union&&state.mau.appMAU===state.value.app,'Activity counts disagree across metrics');
  check(state.min===0&&state.max>=Math.max(...cells),'Count bars omit zero or a real cell');
  check(state.labels.map(s=>s.replaceAll('\n','')).join('|')===names.join('|'),'Category names do not match the exclusive groups');
  const numeric=s=>Number(s.replaceAll(',',''));
  check(state.rows.length===8,'Exact table lacks seven cells and a total');
  for(let i=0;i<7;i++)check(state.rows[i][0]===names[i]&&numeric(state.rows[i][1])===cells[i]&&
   numeric(state.rows[i][2])===union&&state.rows[i][3]===`${(100*cells[i]/union).toFixed(1)}%`,'Displayed numerator, denominator or share is stale');
  check(numeric(state.rows[7][1])===union&&state.rows[7][3]==='100.0%','Exact table has no reconciled total');
  check(state.summary.label==='复合活跃主账号'&&state.summary.unit==='人'&&state.summary.fields.length===3,'Current summary hides a source or its unit');
  check(state.note.includes('不能相加')&&state.note.includes('App＋内容不含推送')&&state.note.includes('向前30天'),'Composition loses overlap, exclusivity or period boundaries');
  if(Object.keys(filters).length)check(state.note.includes('模拟分片估算'),'Scoped estimates are presented as observed facts');
  check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Composition creates page overflow');
  results.push({filters,width:await p.evaluate(()=>innerWidth),union,cells,app:state.value.app});return state;
 };
 try{
  let visited=0;
  for(const country of ['', 'US','UK','DE','Other'])for(const appPlatform of ['', 'iOS','Android'])for(const productLine of ['', 'Bird','Hunting']){
   if(visited++%10===0)await p.goto('about:blank');
   const filters=Object.fromEntries(Object.entries({country,appPlatform,productLine}).filter(([,v])=>v));
   await open(`B?metric=30&${new URLSearchParams(filters)}`);await inspect(filters);
  }
  check(await stored()===null,'Reading a composition writes an issue');
  // Keep the small bar's exact height; its readable value label is a larger native pointer target.
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.goto('about:blank');await p.setViewportSize({width,height:1000});
   await open('B?metric=30&country=US&appPlatform=iOS');
   await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
   await p.waitForFunction(font=>parseFloat(getComputedStyle(document.documentElement).fontSize)===font,font);
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await inspect({country:'US',appPlatform:'iOS'});
   const details=pair().locator('.workspace-calculation'),plot=pair().locator('.detail-chart');
   const clipped=await plot.evaluate(node=>{
    const bounds=node.querySelector('svg').getBoundingClientRect();
    return [...node.querySelectorAll('svg text')].filter(n=>n.textContent.trim()).filter(n=>{
     const r=n.getBoundingClientRect();return r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1;
    }).map(n=>n.textContent);
   });
   check(!clipped.length,`Chart text is clipped at ${width}/${font}: ${clipped.join(', ')}`);
   await plot.scrollIntoViewIfNeeded();
   for(const index of [0,2]){
    const point=await plot.evaluate((node,index)=>{
     const chart=echarts.getInstanceByDom(node),value=chart.getOption().series[0].data[index],r=node.getBoundingClientRect();
     if(index===2){
      const label=[...node.querySelectorAll('text')].find(n=>n.textContent===`${value.toLocaleString('zh-CN')}人`);
      if(!label)throw Error('The tiny group has no readable value label');
      const rect=label.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2,target:'value label'};
     }
     const [x,y]=chart.convertToPixel({seriesIndex:0},[index,value/2]);return{x:r.left+x,y:r.top+y};
    },index);
    const url=p.url();await p.mouse.click(point.x,point.y);
    check(await details.evaluate(n=>n.open),'Actual bar click does not open its evidence');
    const selected=details.locator('tbody tr.chart-selected');
    check(await selected.count()===1&&(await selected.locator('th,td').first().innerText())===names[index],
     `Bar click selects a different group: ${JSON.stringify({width,font,index,point,rows:await selected.allTextContents()})}`);
    check(p.url()===url&&(await pair().locator('.chart-selection').innerText()).includes('全局筛选保持不变'),'Selecting a group changes global scope');
   }
   await details.locator('summary').focus();await p.keyboard.press('Enter');check(!await details.evaluate(n=>n.open),'Keyboard cannot close exact data');
   await p.keyboard.press('Enter');check(await details.evaluate(n=>n.open),'Keyboard cannot reopen exact data');
   await p.screenshot({path:`output/playwright/activity-composition-${browser.browserType().name()}-${width}-${font}.png`,fullPage:false});
  }
  await p.goto('about:blank');await open('B?metric=30&panel=data&country=US');
  check(await p.locator('#B-tab-data').getAttribute('aria-selected')==='true','Explicit complete-data view is ignored');
  await p.locator('#B-tab-groups').focus();await p.keyboard.press('Enter');await ready();
  await p.goBack();await ready();check(await p.locator('#B-tab-data').getAttribute('aria-selected')==='true','History loses explicit complete-data choice');
  await p.goForward();await ready();check(await p.locator('#B-tab-groups').getAttribute('aria-selected')==='true','Forward loses group evidence');
  await p.keyboard.press('Control+k');await p.getByRole('searchbox').fill('互斥活跃组合');await p.keyboard.press('Enter');await ready();
  check(p.url().includes('metric=30'),'Subitem search does not reach composition');
  await p.locator('#metric-evidence-30 .issue-register').click();
  await form().locator('[name=owner]').fill('构成核对');await form().locator('[name=note]').fill('保留原始范围与基线');
  await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  const saved=await stored();check(saved,'Issue was not saved');
  const entries=Object.entries(JSON.parse(saved)),entry=entries.find(([,r])=>r.evidenceId===30);
  check(entry&&entry[1].baseline.includes('复合活跃主账号')&&entry[1].baseline.includes('推送点击活跃')&&entry[1].filters.country==='US','Saved baseline omits sources or original scope');
  await form().locator('[name=note]').fill('未保存的构成草稿');
  const baseline=await form().locator('> .table-note').innerText();
  await p.locator('#B-tab-data').click();await p.locator('#B-tab-groups').click();
  check(await form().locator('[name=note]').inputValue()==='未保存的构成草稿'&&await form().locator('> .table-note').innerText()===baseline&&await stored()===saved,'Evidence tabs overwrite a draft, baseline or saved record');
  // A historical value is immutable, even when its old wording differs from the new summary.
  const historical=JSON.parse(saved);historical[entry[0]].baseline='App主动活跃：30,420人；复合活跃：44,200人';
  await p.evaluate(value=>localStorage.setItem('parallens-demo-actions-v1',value),JSON.stringify(historical));
  await p.reload();await ready();await p.locator('#metric-evidence-30 .issue-register').click();
  check((await form().locator('> .table-note').innerText()).includes(historical[entry[0]].baseline),'Opening an old record silently migrates its baseline');
  await form().locator('[name=note]').fill('仅更新处理进度');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  check(JSON.parse(await stored())[entry[0]].baseline===historical[entry[0]].baseline,'Saving progress overwrites the historical baseline');
  // Invalid cells are not silently repaired; a known zero is not a missing value or a reliable proportion.
  for(const mode of ['corrupt','zero','small']){
   const fixture=JSON.parse(JSON.stringify(raw));
   if(mode==='corrupt')fixture.m30.value.exclusiveCells.appOnly++;
   else{
    Object.assign(fixture.m30.value,{composite:mode==='zero'?0:12,app:mode==='zero'?0:12,content:0,pushClicked:0});
    fixture.m30.value.exclusiveCells=Object.fromEntries(keys.map(k=>[k,k==='appOnly'&&mode==='small'?12:0]));
   }
   const isolated=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),q=await isolated.newPage();
   try{
    q.on('pageerror',e=>errors.push(e.message));
    await q.route('**/data/metric-values.json',r=>r.fulfill({json:fixture}));
    await q.goto(`${base}#/B?metric=30`);await q.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
    const value=await q.evaluate(()=>metric(30));
    if(mode==='corrupt')check(value.availability==='pending'&&await q.locator('.evidence-pair[data-evidence-metric="30"]').count()===0,'Corrupt source produces a plausible graph');
    else{
     const evidence=q.locator('.evidence-pair[data-evidence-metric="30"]');
     await evidence.locator('.workspace-calculation > summary').click();
     check(value.value.composite===(mode==='zero'?0:12)&&(await evidence.innerText()).includes('样本不足（少于30人）')&&
      !(await evidence.locator('tbody').innerText()).includes('NaN'),'Small or zero group implies a reliable share');
    }
   }finally{await isolated.close();}
   results.push({fixture:mode});
  }
  check(!errors.length,errors.join('; '));
  return{status:'PASS',checks:['45 supported scopes reconcile seven exclusive cells and all three overlapping margins',
   'cross-metric MAU identity and exact numerator/denominator/share table','three desktop widths and actual 200% text',
   'real bar and tiny-group value-label selection, keyboard data disclosure','explicit tabs, search and history',
   'saved scope, draft and immutable historical baseline','corrupt, zero and small-sample source responses'],results};
 }finally{await context.close();}
}
