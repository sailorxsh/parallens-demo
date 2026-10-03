// Run with playwright-cli run-code --filename=scripts/verify_search_flows.js.
// Uses an isolated context so the user's records and open view remain unchanged.
async (page) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));
  const dialog=p.locator('#metric-search'),input=p.getByRole('searchbox');
  const lookup=async query=>{
    await input.fill(query);
    const links=p.locator('.metric-search-result');
    const ids=await links.evaluateAll(nodes=>nodes.map(node=>Number(new URLSearchParams(node.hash.split('?')[1]).get('metric'))));
    check(new Set(ids).size===ids.length,`Duplicate search results: ${query}`);
    check(await p.locator('#metric-search-count').innerText()===`${ids.length} 项指标`,`Stale result count: ${query}`);
    check(!(await dialog.innerText()).match(/undefined|NaN|\[object Object\]/),`Invalid result text: ${query}`);
    return ids;
  };
  try {
    await p.goto(`${base}#/B?country=US`);await p.locator('.detail-kpi').first().waitFor();
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});
      await p.locator('#open-metric-search').click();
      check(await input.evaluate(node=>document.activeElement===node),'Search did not receive focus');
      check((await lookup('')).length===53,'An empty query does not expose all metrics');
      for(const [query,id] of [['DAU',25],['日活',25],['WAU',25],['周活',25],['月活',25],
        ['多设备主账号占比',48],['当前绑定设备',8],['上传成功率',46],['直播成功率',46],['推送成功率',46],
        ['事件丢失率',54],['ID映射覆盖率',54],['＃２５',25],['dau 活跃',25]]) {
        check((await lookup(query)).includes(id),`Missing visible metric or subitem: ${query}`);
        check(!await dialog.evaluate(node=>node.scrollWidth>node.clientWidth+1),`Search overflows at ${width}: ${query}`);
      }
      check((await lookup('DAU')).length===1,'DAU matches unrelated metrics');
      check((await p.locator('.metric-search-alias').innerText()).includes('DAU'),'Alias lookup does not explain the catalog result');
      await dialog.screenshot({path:`output/playwright/v48-search-dau-${width}.png`});
      check((await lookup('没有这个指标xyz')).length===0,'An unknown query returns a result');
      check(await p.locator('.metric-search-empty').isVisible(),'Missing empty-result feedback');
      await p.keyboard.press('Escape');
      check(!await dialog.evaluate(node=>node.open),'Escape did not close search');
      check(await p.locator('#open-metric-search').evaluate(node=>document.activeElement===node),'Dismissal lost the trigger focus');
      results.push({width,height,status:'PASS'});
    }
    await p.keyboard.press('Control+k');await lookup('DAU');await p.keyboard.press('Enter');
    await p.locator('#metric-evidence-25').waitFor();
    check(p.url().includes('country=US')&&p.url().includes('metric=25'),'Alias selection lost the supported filter or metric');
    check(!await dialog.evaluate(node=>node.open),'Search remained open after selection');
    await p.keyboard.press('Control+k');await lookup('事件丢失率');await p.keyboard.press('Enter');
    await p.locator('#metric-evidence-54 .na-note').waitFor();
    check(p.url().includes('country=US')&&p.url().includes('metric=54'),'Unavailable metric lookup discarded its scope');
    check((await p.locator('#metric-evidence-54 .na-note').innerText()).startsWith('待补数据：'),'Search disguised missing data');
    await p.goto(`${base}#/C?functionType=Upload`);await p.locator('.detail-kpi').first().waitFor();
    await p.keyboard.press('Control+k');
    check((await lookup('直播成功率')).includes(46),'A selected function hides another searchable subitem');
    check((await lookup('MRR')).join(',')==='3','Original MRR search changed');
    check((await lookup('DAU MRR')).length===0,'Terms are matched across different metrics');
    check(errors.length===0,`Runtime errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['visible metric names and independent subitems','original names and abbreviations',
      'full-width numbers and multiple terms','three desktop sizes','alias explanations','keyboard open/select/dismiss',
      'filter continuity','missing-data honesty','lookup independent of selected function'],results};
  } finally {await context.close();}
}
