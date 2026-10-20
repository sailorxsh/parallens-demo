// A selected metric opens its own evidence, while explicit tab choice remains authoritative.
async (parent) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  let context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  let p=await context.newPage();const errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const open=async(route)=>{
    await p.goto(`${base}#/${route}`);
    try{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');}catch(error){const state=await p.evaluate(()=>({url:location.href,rendered:typeof lastRenderedHash==='string'?lastRenderedHash:null,busy:document.querySelector('#main')?.getAttribute('aria-busy'),heading:document.querySelector('h1')?.textContent}));throw Error('Destination did not settle: '+JSON.stringify({state,errors})+'; '+error.message);}
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const selected=page=>p.locator(`#${page}-tab-data`);
  const tableCases=[['B',31],['C',8],['C',45],
    ['D',20],['D',22],['D',32],['D',33],['E',37],['E',40]];
  try {
    for(const width of [1366,1600,1920]) {
      // Each size is an independent reading task; reset WebKit's per-document History API quota.
      await p.goto('about:blank');
      await p.setViewportSize({width,height:1000});
      for(const [page,id] of tableCases) {
        await open(`${page}?metric=${id}`);
        check(await selected(page).getAttribute('aria-selected')==='true',`#${id} opens another metric's group chart at ${width}`);
        const ownTable=p.locator(`#metric-evidence-${id} #${page}-panel-data > .data-table-scroll`).first();
        check(await ownTable.isVisible()&&(await ownTable.locator('caption').innerText()).includes('当前筛选完整值'),`#${id} does not immediately show its own values`);
        check(await p.locator('.income-panel:not([hidden])').count()===1,`#${id} reveals multiple evidence tabs`);
        check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),`#${id} introduces page overflow`);
        results.push({width,page,id,view:'data'});
      }
      for(const [page,id,view,title,points]of [['A',9,'change','新增注册',12],['A',10,'change','注册后72h／7天绑定',12],['A',12,'change','注册后7／30天首图',12],['B',27,'change','三类功能使用率',84],['B',28,'change','D1／D7／D30',12],['F',51,'change','解绑设备率',12],['A',7,'change','注册与当前绑定主账号',13],['B',26,'change','人均有效会话',84],['C',43,'change','D7／D30留存',12],['C',46,'change','30个完整日',30],['E',36,'groups','五类Pack',5],['E',38,'groups','用户与设备构成',4]]) {
        await open(`${page}?metric=${id}`);
        check(await p.locator(`#${page}-tab-${view}`).getAttribute('aria-selected')==='true',`#${id} hides its approved ${view} evidence`);
        const root=p.locator(`#metric-evidence-${id}`),visible=p.locator(`#${page}-panel-${view}`);
        check((await visible.innerText()).includes(title),`#${id} opens unrelated evidence`);
        const chart=visible.locator(`:is(.evidence-pair,.detail-chart-panel)[data-evidence-metric="${id}"] .detail-chart`).first();
        await chart.locator('svg').waitFor();check(await chart.isVisible(),`#${id} chart is closed`);
        const plot=await chart.evaluate(node=>{const o=echarts.getInstanceByDom(node).getOption();return {series:o.series.map(s=>s.data),axes:o.xAxis[0].data,y:o.yAxis[0].data};});
        check(([28,43].includes(id)?plot.y?.length:plot.axes?.length)===points,`#${id} loses approved source categories or history points`);
        if(id===12)check(plot.series[1].slice(-3).every(v=>v===null)&&plot.series[0].at(-1)===64,'Registration horizon loses immature gaps or latest 7-day anchor');
        if(id===28)check(JSON.stringify(plot.axes)==='["D1","D7","D30"]'&&plot.series[1].length>0,'User retention loses three exact days or observation states');
        if(id===7)check(plot.series[0].at(-1)===128600&&plot.series[1].at(-1)===82400,'Account stock chart loses current counts');
        if(id===36)check(plot.series[0].every(v=>Number.isFinite(v)&&v>=0&&v<=100),'Pack shares have invalid units');
        if(id===38)check(plot.series[0].reduce((a,b)=>a+b,0)===128600,'Population composition loses registered-account denominator');
        results.push({width,page,id,view,title,points});
      }
      for(const [page,id,title] of [['A',14,'绑定→首图时长 · 演示分布'],['D',5,'产品线订阅状态 · 当前快照'],['D',21,'有效订阅人数流转 · 9/1–9/24'],['F',50,'设备交叉状态 · 当前快照']]) {
        await open(`${page}?metric=${id}`);
        check(await p.locator(`#${page}-tab-groups`).getAttribute('aria-selected')==='true',`#${id} hides its real chart`);
        const chart=p.locator(`#${page}-panel-groups :is(.detail-chart-panel,.evidence-pair)[data-evidence-metric="${id}"] .detail-chart`);
        await chart.locator('svg').waitFor();check(await chart.isVisible(),`#${id} chart is under a closed context`);
        const state=await chart.evaluate((node,{page,id})=>{
          const option=echarts.getInstanceByDom(node).getOption(),values=option.series.filter(s=>s.type!=='scatter').map(s=>s.data);
          return {title:node.getAttribute('aria-label'),values,optionTypes:option.series.map(s=>s.type)};
        },{page,id});
        check(state.title.includes(title),`#${id} opens a wrong plot`);
        const source=await p.evaluate(async id=>(await (await fetch('./data/metric-values.json')).json())[`m${String(id).padStart(2,'0')}`],id);
        if(id===50)check(JSON.stringify(state.values[0])===JSON.stringify([source.value.boundActivated,source.value.boundNotActivated,source.value.activatedUnbound]),'Device state chart disagrees with source states');
        if(id===14)check(state.optionTypes.includes('boxplot')&&state.values[0][0][2]===source.value.p50Minutes,'First-image distribution lost its source median');
        if(id===21)check(state.optionTypes.includes('bar')&&state.optionTypes.includes('scatter'),'Subscription flow lost its stock/change encoding');
        if(id===5)check(state.values.length===6&&[0,1].every(index=>Math.abs(state.values.reduce((sum,line)=>sum+line[index],0)-100)<1e-9),'Subscription state shares do not close to 100%');
        results.push({width,page,id,view:'groups',title});
      }
      await open('B?metric=30');
      check(await p.locator('#B-tab-groups').getAttribute('aria-selected')==='true','Activity composition hides its own source-backed chart');
      const activity=p.locator('#B-panel-groups .evidence-pair[data-evidence-metric="30"] .detail-chart');
      await activity.locator('svg').waitFor();
      const composition=await activity.evaluate(node=>echarts.getInstanceByDom(node).getOption().series[0].data);
      const source30=await p.evaluate(async()=>(await(await fetch('./data/metric-values.json')).json()).m30.value);
      check(JSON.stringify(composition)===JSON.stringify(Object.values(source30.exclusiveCells))&&
        composition.reduce((sum,n)=>sum+n,0)===source30.composite,'Activity composition changes source cells or union');
      await open('B?metric=30&panel=data');
      check(await selected('B').getAttribute('aria-selected')==='true','Activity composition overrides an explicit complete-data request');
      results.push({width,page:'B',id:30,view:'groups',explicitData:true});
      for(const page of ['A','B','C','D','E','F','G']) {
        await open(page);
        check(await p.locator('.topic-overview').count()===1,`${page} hides its default topic overview`);
        check(await p.locator('.topic-metric').count()===await p.evaluate(page=>topicGroups[page].flatMap(([,ids])=>ids).length,page),`${page} omits an overview metric`);
      }
    }
    await p.setViewportSize({width:1600,height:1000});
    const catalog=await p.evaluate(()=>sourceData.catalog.filter(r=>r.id>=2));
    check(catalog.length===53,'Destination inventory omits a metric');
    // Independent page inventories get separate sessions: WebKit rejects more
    // than 100 History API writes in 10 seconds. Keep each real task intact.
    await context.close();
    for(const code of ['A','B','C','D','E','F','G']){
      const inventoryContext=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});p=await inventoryContext.newPage();p.on('pageerror',error=>errors.push(error.message));
      try{for(const item of catalog.filter(r=>r.page===code)){
      await open(item.page);await p.locator(`#topic-open-${item.page}-${item.id}`).click();await p.waitForFunction(id=>new URLSearchParams(location.hash.split('?')[1]??'').get('metric')===String(id)&&lastRenderedHash===location.hash,item.id);
      const root=p.locator(`#metric-evidence-${item.id}`),right=p.locator('.income-context .detail-finding').first();
      check(await root.count()===1&&await right.getAttribute('data-metric-id')===String(item.id),`#${item.id} explanation belongs to another subject`);
      await p.locator(`#${item.page}-tab-data`).click();
      check((await p.locator(`#${item.page}-panel-data`).innerText()).trim().length>20,`#${item.id} lacks inspectable numeric evidence`);
      check(await p.locator(`#${item.page}-panel-data .data-table-scroll table tbody tr`).count()>0,`#${item.id} complete data is empty`);
      results.push({page:item.page,id:item.id,allCatalog:true});
      }}finally{await inventoryContext.close();}
    }
    context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));await p.goto(base);await p.waitForFunction(()=>document.querySelector('#main[aria-busy=false]'));
    // A reader's explicit request to compare other evidence remains valid.
    await open('D?metric=5&panel=groups');
    check(await p.locator('#D-tab-groups').getAttribute('aria-selected')==='true','Explicit group selection is overridden');
    await p.reload();await p.locator('#D-tab-groups[aria-selected="true"]').waitFor();
    await p.locator('#D-tab-data').focus();await p.keyboard.press('Enter');
    check(await selected('D').getAttribute('aria-selected')==='true'&&p.url().includes('panel=data'),'Keyboard tab does not retain the chosen evidence in the URL');
    await p.goBack();await p.locator('#D-tab-groups[aria-selected="true"]').waitFor();
    await p.goForward();await p.locator('#D-tab-data[aria-selected="true"]').waitFor();
    // Opening evidence through the catalog and search uses the same landing rule.
    await p.locator('.topic-return').click();await p.locator('#topic-open-D-5').click();
    await p.locator('#D-tab-groups[aria-selected="true"]').waitFor();
    await p.keyboard.press('Control+k');await p.getByRole('searchbox').fill('新设备D7');await p.keyboard.press('Enter');
    await p.locator('#metric-evidence-43').waitFor();
    check(await p.locator('#C-tab-change').getAttribute('aria-selected')==='true'&&await p.locator('#metric-evidence-43 .evidence-pair[data-evidence-metric="43"] svg').count()>0,'Search hides the approved cohort history/control');
    // Retention registration and its draft do not change when opening auxiliary evidence.
    await p.locator('#metric-evidence-43 .issue-register').click();
    await p.locator('.action-record [name="owner"]').fill('留存核查');
    await p.locator('.action-record [name="note"]').fill('所选指标的证据落点测试');
    await p.keyboard.press('Control+k');await p.getByRole('searchbox').fill('关键功能成功率');await p.keyboard.press('Enter');
    await p.locator('#metric-evidence-46').waitFor();
    check(await p.locator('#C-tab-change').getAttribute('aria-selected')==='true'&&(await p.locator('#C-panel-change').innerText()).includes('30个完整日'),'Technical success evidence hides its approved 30-day trend');
    check(await p.locator('.action-record [name="issueMetric"]').inputValue()==='43'&&
      await p.locator('.action-record [name="note"]').inputValue()==='所选指标的证据落点测试','Auxiliary evidence replaces the retention issue or discards its draft');
    // A filtered table-only metric does not borrow a different metric's filtered chart.
    await open('C?metric=43&country=US');
    check(await p.locator('#C-tab-change').getAttribute('aria-selected')==='true'&&
      (await p.locator('#metric-evidence-43 .evidence-meta').innerText()).includes('国家/市场 美国'),'Filtered retention destination loses its scope');
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['twelve table-only metrics at three widths','six approved historical/composition destinations at three widths','four source-related charts at three widths','activity composition source cells and explicit data at three widths',
      'A–G default complete overview','explicit panel and refresh','keyboard tabs and history','catalog and search destinations',
      'auxiliary evidence preserves issue and draft','filtered cohort destination','all 53 owned numeric tables and subject explanations'],results};
  } finally {await context.close();}
}
