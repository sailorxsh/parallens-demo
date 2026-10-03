// E-page pilot, isolated from the user's issue records.
async(page)=>{
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1366,height:768},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],sizes=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());
  const tab=key=>p.locator(`#E-tab-${key}`),panel=key=>p.locator(`#E-panel-${key}`);
  const form=()=>p.locator('.action-record'),input=name=>form().locator(`[name="${name}"]`);
  const open=async hash=>{await p.goto(`${base}#/${hash}`);await p.locator('.income-workspace').waitFor();};
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});await open('E');
      await panel('change').locator('svg').waitFor();
      check(await p.locator('.detail-kpi').count()===4,'Pilot loses a headline KPI');
      check(await tab('change').getAttribute('aria-selected')==='true','Pilot does not start with the income change');
      check(await p.locator('.income-panel:not([hidden])').count()===1,'Multiple evidence panels compete for attention');
      check(await p.locator('.income-workspace svg').count()===1,'Closed evidence was needlessly rendered');
      const rectangles=await p.locator('.income-workspace-grid').evaluate(node=>{
        const l=node.children[0].getBoundingClientRect(),r=node.children[1].getBoundingClientRect();
        return {paired:l.right<r.left&&Math.abs(l.top-r.top)<2,ratio:l.width/r.width};
      });
      check(rectangles.paired&&rectangles.ratio>1.7&&rectangles.ratio<2.2,'Evidence and observation do not share the intended desktop layout');
      check((await p.locator('.finding-title').boundingBox()).y<height-60,'Priority observation is hidden below the first view');
      check(await p.evaluate(()=>document.documentElement.scrollHeight)<1800,'Default page still requires many screens of scrolling');
      check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Pilot introduces page-wide horizontal scrolling');
      if(width===1600)await p.screenshot({path:'output/playwright/v57-01-workspace.png'});
      await p.locator('#metric-evidence-35 .issue-register').click();
      check(await form().isVisible()&&await input('owner').evaluate(node=>document.activeElement===node),`Registration focus fails at ${width}px`);
      check(await form().evaluate(node=>node.scrollWidth<=node.clientWidth+1),`Right-hand form overflows at ${width}px`);
      await panel('change').locator('svg').waitFor();
      check(await panel('change').locator('svg').isVisible(),`Registration hides the evidence at ${width}px`);
      await form().getByRole('button',{name:'保存本地记录',exact:true}).scrollIntoViewIfNeeded();
      const saveBox=await form().getByRole('button',{name:'保存本地记录',exact:true}).boundingBox();
      check(saveBox.y>=0&&saveBox.y+saveBox.height<=height,`Save cannot be reached in the rail at ${width}px`);
      if(width===1600)await p.screenshot({path:'output/playwright/v57-02-registration.png'});
      sizes.push(width);
    }
    await tab('change').focus();await tab('change').press('ArrowRight');
    check(await tab('groups').evaluate(node=>document.activeElement===node),'Arrow navigation loses focus');
    check(await tab('groups').getAttribute('aria-selected')==='true'&&p.url().includes('panel=groups'),'Keyboard tab selection disagrees with the URL');
    await panel('groups').locator('svg').first().waitFor();
    const groups=await panel('groups').locator('.detail-chart').evaluateAll(nodes=>nodes.filter(n=>!n.closest('details')).map(node=>({
      label:node.getAttribute('aria-label'),width:echarts.getInstanceByDom(node)?.getWidth(),values:echarts.getInstanceByDom(node)?.getOption().series[0].data
    })));
    check(groups.length===2&&groups.every(plot=>plot.width>400),'Group evidence is blank or too narrow');
    check(groups[0].values.join(',')==='6500,1800,1000,700','Group payer counts changed during the layout conversion');
    await tab('groups').press('End');
    check(await tab('data').getAttribute('aria-selected')==='true','End does not select the final tab');
    check((await panel('data').innerText()).includes('$52,000'),'Complete current income is missing from the data tab');
    await p.goBack();await tab('groups').waitFor();
    check(await tab('groups').getAttribute('aria-selected')==='true','Back does not restore the evidence view');
    await p.goForward();await tab('data').waitFor();
    check(await tab('data').getAttribute('aria-selected')==='true','Forward does not restore the evidence view');
    await p.reload();await tab('data').waitFor();
    check(await tab('data').getAttribute('aria-selected')==='true','Reload loses the evidence view');
    await tab('change').click();
    await p.locator('#metric-evidence-35 .issue-register').click();
    check(await form().isVisible()&&await input('owner').evaluate(node=>document.activeElement===node),'Registration is not opened and focused in the rail');
    check((await form().boundingBox()).x>(await panel('change').boundingBox()).x,'Registration escaped the right-hand rail');
    await input('owner').fill('付费价值核查');await input('note').fill('核对人数与ARPPU变化，保留草稿');
    await tab('groups').click();
    check(await input('note').inputValue()==='核对人数与ARPPU变化，保留草稿','Switching evidence discards registration edits');
    await p.locator('.income-context-controls').getByRole('button',{name:'关键观察',exact:true}).click();
    check(await p.locator('.detail-finding').isVisible()&&!await form().isVisible(),'The observation and form cannot be switched in place');
    await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
    check(await input('note').inputValue()==='核对人数与ARPPU变化，保留草稿','Returning to the form loses the draft');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    await p.reload();await form().waitFor();
    check(await input('owner').inputValue()==='付费价值核查'&&await tab('groups').getAttribute('aria-selected')==='true','Reload loses the issue or evidence view');
    await input('note').fill('辅助指标核对期间也保留草稿');
    await p.locator('.detail-kpi[data-metric-id="3"] .detail-evidence-link').click();
    await p.locator('#metric-evidence-3').waitFor();
    check(await input('issueMetric').inputValue()==='35'&&await input('note').inputValue()==='辅助指标核对期间也保留草稿','Auxiliary evidence silently changes the issue or discards edits');
    await p.locator('.income-context-controls').getByRole('button',{name:'关键观察',exact:true}).click();
    check((await p.locator('.detail-finding .issue-register').getAttribute('aria-label')).includes('#35'),
      'Page-level income observation registers the auxiliary MRR metric');
    await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
    check(await input('issueMetric').inputValue()==='35'&&p.url().includes('metric=3')&&await input('note').inputValue()==='辅助指标核对期间也保留草稿',
      'Switching the rail changes the current issue or auxiliary evidence');
    await open('E');
    await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
    await input('note').fill('直接打开右侧登记后，保留当前问题');
    await p.locator('.detail-kpi[data-metric-id="3"] .detail-evidence-link').click();
    await p.locator('#metric-evidence-3').waitFor();
    check(p.url().includes('issue=35')&&await input('issueMetric').inputValue()==='35'&&await input('note').inputValue()==='直接打开右侧登记后，保留当前问题',
      'Opening registration directly leaves stale evidence links and changes the issue');
    await open('E?country=US&metric=35');
    await p.locator('#metric-evidence-35 .issue-register').click();
    check(await input('owner').inputValue()==='','Country-scoped issue leaks the overall saved record');
    check(!(await form().innerText()).includes('订阅净收入：$52,000'),'Country issue retains the overall income baseline');
    await tab('groups').click();await panel('groups').locator('svg').first().waitFor();
    check((await panel('groups').innerText()).includes('保留当前其他筛选条件，仅切换国家/市场')&&
      (await panel('groups').locator('svg').first().textContent()).includes('美国（当前）'),
      'Cross-country comparison masquerades as data wholly inside the selected country');
    await open('E?deviceModel=K6&metric=35');
    check((await panel('change').innerText()).includes('待补数据'),'Missing income data is hidden behind a generic empty trend');
    check(await p.locator('#metric-evidence-35 .issue-register').count()===0,'Missing facts still offer a new issue baseline');
    await open('E');await p.getByRole('button',{name:'全部指标',exact:true}).click();
    check(await p.locator('.income-catalog').evaluate(node=>node.open),'Catalog navigation does not reveal the full catalog');
    check(await p.locator('.metric-inventory tbody tr').count()===7,'Pilot loses full metric coverage');
    for(const id of [34,35,36,37,38,39,40]) {
      await open(`E?metric=${id}`);
      check(await p.locator(`#metric-evidence-${id} .issue-register`).isVisible(),`Catalog metric #${id} lacks its registration entry`);
      await tab('data').click();
      check(await panel('data').locator('.diagnostic-table').count()>0,`Catalog metric #${id} loses its complete values`);
    }
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',sizes,checks:['four KPI cards','income evidence with adjacent observation','one visible evidence panel','deferred hidden charts','keyboard tabs','group chart values','data completeness','URL back forward and reload','in-place registration','drafts and saved records','auxiliary evidence preserves issue','country scope isolation','missing facts boundary','seven catalog metrics']};
  }finally{await context.close();}
}
