// A selected metric opens its own evidence, while explicit tab choice remains authoritative.
async (parent) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const open=async(route)=>{
    await p.goto(`${base}#/${route}`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const selected=page=>p.locator(`#${page}-tab-data`);
  const tableCases=[['A',7],['A',12],['B',26],['B',28],['B',31],['C',8],['C',43],['C',45],
    ['D',20],['D',22],['D',32],['D',33],['E',36],['E',37],['E',38],['E',40],['F',51]];
  try {
    for(const width of [1366,1600,1920]) {
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
      for(const [page,id,title] of [['A',14,'绑定→首图时长 · 演示分布'],['D',5,'产品线订阅状态 · 当前快照'],['D',21,'有效订阅人数流转 · 9/1–9/24'],['F',50,'设备交叉状态 · 当前快照']]) {
        await open(`${page}?metric=${id}`);
        check(await p.locator(`#${page}-tab-groups`).getAttribute('aria-selected')==='true',`#${id} hides its real chart`);
        const chart=p.locator(`#${page}-panel-groups .detail-chart-panel[data-evidence-metric="${id}"] .detail-chart`);
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
        check(await p.locator(`#${page}-tab-change`).getAttribute('aria-selected')==='true',`${page} hides its approved default trend`);
        await p.locator(`#${page}-panel-change svg`).first().waitFor();
      }
    }
    await p.setViewportSize({width:1600,height:1000});
    // A reader's explicit request to compare other evidence remains valid.
    await open('D?metric=5&panel=groups');
    check(await p.locator('#D-tab-groups').getAttribute('aria-selected')==='true','Explicit group selection is overridden');
    await p.reload();await p.locator('#D-tab-groups[aria-selected="true"]').waitFor();
    await p.locator('#D-tab-data').focus();await p.keyboard.press('Enter');
    check(await selected('D').getAttribute('aria-selected')==='true'&&p.url().includes('panel=data'),'Keyboard tab does not retain the chosen evidence in the URL');
    await p.goBack();await p.locator('#D-tab-groups[aria-selected="true"]').waitFor();
    await p.goForward();await p.locator('#D-tab-data[aria-selected="true"]').waitFor();
    // Opening evidence through the catalog and search uses the same landing rule.
    await p.getByRole('button',{name:'全部指标',exact:true}).click();
    await p.locator('.metric-inventory-link').getByText('订阅状态快照',{exact:true}).click();
    await p.locator('#D-tab-groups[aria-selected="true"]').waitFor();
    await p.keyboard.press('Control+k');await p.getByRole('searchbox').fill('新设备D7');await p.keyboard.press('Enter');
    await p.locator('#metric-evidence-43').waitFor();
    check(await selected('C').getAttribute('aria-selected')==='true','Search opens unrelated technical failure evidence for device retention');
    // Retention registration and its draft do not change when opening auxiliary evidence.
    await p.locator('#metric-evidence-43 .issue-register').click();
    await p.locator('.action-record [name="owner"]').fill('留存核查');
    await p.locator('.action-record [name="note"]').fill('所选指标的证据落点测试');
    await p.keyboard.press('Control+k');await p.getByRole('searchbox').fill('关键功能成功率');await p.keyboard.press('Enter');
    await p.locator('#metric-evidence-46').waitFor();
    check(await p.locator('#C-tab-groups').getAttribute('aria-selected')==='true','Technical success evidence lost its own group plot');
    check(await p.locator('.action-record [name="issueMetric"]').inputValue()==='43'&&
      await p.locator('.action-record [name="note"]').inputValue()==='所选指标的证据落点测试','Auxiliary evidence replaces the retention issue or discards its draft');
    // A filtered table-only metric does not borrow a different metric's filtered chart.
    await open('C?metric=43&country=US');
    check(await selected('C').getAttribute('aria-selected')==='true'&&
      (await p.locator('#metric-evidence-43 .evidence-meta').innerText()).includes('国家/市场 美国'),'Filtered retention destination loses its scope');
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['seventeen table-only metrics at three widths','four source-related charts at three widths','activity composition source cells and explicit data at three widths',
      'A–G default trends','explicit panel and refresh','keyboard tabs and history','catalog and search destinations',
      'auxiliary evidence preserves issue and draft','filtered table-only destination'],results};
  } finally {await context.close();}
}
