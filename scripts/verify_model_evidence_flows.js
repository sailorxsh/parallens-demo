// Isolated browser probe: displayed model rates are traceable to the selected source cohort.
async(parent)=>{
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:900},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());
  const open=async(query='')=>{
    await p.goto(`${base}#/E?metric=39&panel=groups${query?`&${query}`:''}`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main').getAttribute('aria-busy')==='false');
    await p.locator('#main[aria-busy="false"] #metric-evidence-39').waitFor();
  };
  try {
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:900});
      for(const query of ['', 'country=US', 'country=UK', 'country=DE', 'country=Other', 'productLine=Hunting',
        'country=US&productLine=Bird&deviceModel=Bird%20Pro']) {
        await open(query);await p.locator('#E-panel-groups .detail-chart svg').first().waitFor();
        const chart=await p.locator('#E-panel-groups .detail-chart').first().evaluate(node=>{
          const option=echarts.getInstanceByDom(node).getOption();
          return {cells:option.series[0].data.map(cell=>cell.value),labels:option.yAxis[0].data,
            tips:option.series[0].data.map(cell=>option.tooltip[0].formatter({value:cell.value}))};
        });
        await p.getByRole('tab',{name:'完整数据',exact:true}).click();
        const state=await p.locator('.model-calculation').evaluate(node=>{
          const params=new URLSearchParams(location.hash.split('?')[1]),records=sourceData.modelMarket.records.filter(row=>
            (!params.get('country')||row.country===params.get('country'))&&
            (!params.get('productLine')||row.productLine===params.get('productLine'))&&
            (!params.get('deviceModel')||row.model===params.get('deviceModel')));
          return {rows:[...node.querySelectorAll('tbody tr')].map(row=>[...row.children].map(cell=>cell.textContent)),
            records,columns:[...node.querySelectorAll('thead th')].map(cell=>cell.textContent),
            semantics:[...node.querySelectorAll('thead th')].every(n=>n.scope==='col')&&[...node.querySelectorAll('tbody th')].every(n=>n.scope==='row'),
            fits:node.scrollWidth<=node.clientWidth+1,pageFits:document.documentElement.scrollWidth<=innerWidth+1,note:node.querySelector('.table-note').textContent};
        });
        check(state.columns.join('|')==='型号|主账号（人）|活跃（人）|活跃率|订阅（人）|订阅率','Complete model evidence lost its units');
        check(state.semantics&&state.fits&&state.pageFits,`Model calculation is clipped or lacks header relationships at ${width}`);
        check(state.rows.length===new Set(state.records.map(row=>row.model)).size,'Missing or stale model rows');
        const parse=text=>Number(text.replaceAll(',',''));
        for(const row of state.rows) {
          const records=state.records.filter(record=>record.model===row[0]);
          const [owners,active,subscribed]=['owners','activeOwners','subscribedOwners'].map(key=>records.reduce((sum,record)=>sum+record[key],0));
          check(parse(row[1])===owners&&parse(row[2])===active&&parse(row[4])===subscribed,'Model counts disagree with the selected source cohort');
          check(row[3]===`${(active/owners*100).toFixed(1)}%`&&row[5]===`${(subscribed/owners*100).toFixed(1)}%`,'Displayed model rates do not close to their counts');
          const index=chart.labels.indexOf(row[0]);
          for(const [dimension,numerator] of [[0,active],[1,subscribed]]) {
            const cell=chart.cells.find(value=>value[0]===dimension&&value[1]===index),tip=chart.tips[chart.cells.indexOf(cell)];
            check(Math.abs(cell[2]-numerator/owners*100)<1e-9,'Heatmap and calculation table disagree');
            check(tip.includes(numerator.toLocaleString('zh-CN'))&&tip.includes(owners.toLocaleString('zh-CN'))&&!tip.includes('约'),'Heatmap tooltip still reverses rounded percentages into counts');
          }
        }
        check(state.note.includes('合成汇总')&&state.note.includes('不代表全部合资格主账号'),'Model cohort boundary or synthetic source is hidden');
        results.push({width,query,models:state.rows.length});
      }
    }
    await open();await p.locator('.filter-bar summary').click();
    await p.getByLabel('国家/市场',{exact:true}).selectOption('US');
    await p.getByRole('tab',{name:'完整数据',exact:true}).click();
    await p.locator('#metric-evidence-39 .issue-register').click();
    check(await p.locator('.action-record [name="issueMetric"]').inputValue()==='39','Model registration uses the page-level observation metric');
    await p.locator('.action-record [name="owner"]').fill('型号核查');
    await p.locator('.action-record [name="note"]').fill('按市场与主型号的合成人数核对两项比率');
    await p.getByRole('button',{name:'保存本地记录',exact:true}).click();
    await p.reload();await p.locator('.model-calculation').waitFor();
    check(await p.locator('.action-record [name="owner"]').inputValue()==='型号核查','Saving and reloading loses the scoped model record');
    check(await p.locator('.action-record [name="issueMetric"]').inputValue()==='39','Reload changes the registered metric');
    await open('appPlatform=iOS');
    check((await p.locator('#metric-evidence-39 .evidence-meta .metric-filter-scope').innerText()).includes('本项仍为总体范围；未应用：App平台 iOS'),
      'Irrelevant App platform is falsely presented as an applied model filter');
    check((await p.locator('.detail-kpi[data-metric-id="39"] .metric-filter-scope').innerText()).includes('未应用：App平台 iOS'),
      'The model headline hides its unchanged scope');
    await p.getByRole('tab',{name:'完整数据',exact:true}).click();
    check(await p.locator('.model-calculation tbody tr').count()===4,'Irrelevant dimension wrongly discards the valid model cohort');
    await open('productLine=Bird&deviceModel=Hunt%20Pro');
    check(await p.getByLabel('设备型号',{exact:true}).inputValue()==='All','A conflicting dependent model is not reset by the route policy');
    await p.getByRole('tab',{name:'完整数据',exact:true}).click();
    check(await p.locator('.model-calculation tbody tr').count()===3,'Resetting an incompatible model does not retain the Bird cohort');
    const modelSource=await p.evaluate(()=>sourceData.modelMarket);
    await p.route('**/data/model-market.json',async route=>{
      const data=structuredClone(modelSource);
      data.records=data.records.filter(row=>!(row.country==='US'&&row.model==='Hunt Pro'));
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    await open('country=US&productLine=Hunting');
    await p.reload();await p.locator('#main[aria-busy="false"] #metric-evidence-39').waitFor();
    check(await p.evaluate(()=>metric(39).kind)==='na','A supported empty source cohort becomes a measured result');
    for(const label of ['分组证据','变化拆分','完整数据']) {
      await p.getByRole('tab',{name:label,exact:true}).click();
      const reason=p.locator('#metric-evidence-39 > .na-note');
      check(await reason.isVisible()&&(await reason.innerText()).startsWith('不适用：该市场'),`Empty model reason disappears in ${label}`);
    }
    check(await p.locator('.model-calculation').count()===0,'Unavailable model scope retains measured rows');
    await p.unroute('**/data/model-market.json');
    await p.route('**/data/model-market.json',async route=>{
      const data=structuredClone(modelSource);delete data.records[0].activeOwners;
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    await open();await p.reload();await p.locator('#main[aria-busy="false"] #metric-evidence-39').waitFor();
    check((await p.locator('#metric-evidence-39 > .na-note').innerText()).startsWith('待补数据：'),'Invalid counts produce a measured rate or an inapplicable state');
    check(await p.locator('.model-calculation').count()===0,'Missing counts retain the previous measured table');
    await p.unroute('**/data/model-market.json');await p.reload();await p.locator('.model-calculation').waitFor({state:'attached'});
    await p.getByRole('tab',{name:'完整数据',exact:true}).click();await p.locator('.model-calculation').waitFor();
    check(await p.locator('#metric-evidence-39 > .na-note').count()===0,'Restored valid counts retain a stale missing-data reason');
    for(const [id,page] of [[38,'E'],[40,'E'],[35,'E']]) {
      await p.goto(`${base}#/${page}?metric=${id}&panel=data`);await p.locator(`#metric-evidence-${id}`).waitFor();
      const rows=await p.locator(`#${page}-panel-data > .data-table-scroll tbody tr`).evaluateAll(nodes=>nodes.map(row=>[...row.children].map(cell=>cell.textContent)));
      check(rows.every(row=>!row[1]?.endsWith('%')),'A ratio is mislabeled as a numerator');
      if(id===38)check(rows.filter(row=>row[3].endsWith('%')).length===10,'Share dimensions lost their percentage units');
      if(id===40)check(rows.filter(row=>row[3].includes('/人')).length===2,'Channel ARPPU lost its currency per payer unit');
    }
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['21 desktop and source-cohort states','source counts and weighted rates',
      'chart/table/tooltip agreement','semantic numeric tables without clipping','scope boundaries','filtered registration/save/reload',
      'ignored dimensions labeled and conflicting model reset','empty and invalid source reasons persist across panels',
      'generic shares, channel rates and ARPPU units'],results};
  } finally {await context.close();}
}
