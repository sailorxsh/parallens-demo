// Shared desktop diagnosis. Every probe uses an isolated context.
async(page)=>{
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());
  const open=async hash=>{await p.goto(`${base}#/${hash}`);await p.locator('.income-workspace').waitFor();};
  const tab=(code,key)=>p.locator(`#${code}-tab-${key}`);
  const panel=(code,key)=>p.locator(`#${code}-panel-${key}`);
  const form=()=>p.locator('.action-record'),input=name=>form().locator(`[name="${name}"]`);
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});
      for(const code of ['A','B','C','D','E','F','G']) {
        await open(code);await panel(code,'change').locator('svg').first().waitFor();
        check(await p.locator('.detail-kpi').count()===4,`${code} loses headline metrics`);
        check(await tab(code,'change').getAttribute('aria-selected')==='true',`${code} hides its default trend`);
        const layout=await p.locator('.income-workspace-grid').evaluate(node=>{
          const l=node.children[0].getBoundingClientRect(),r=node.children[1].getBoundingClientRect();
          return {paired:l.right<r.left&&Math.abs(l.top-r.top)<2,ratio:l.width/r.width,height:document.documentElement.scrollHeight};
        });
        check(layout.paired&&layout.ratio>1.7&&layout.ratio<2.2,`${code} is not a paired desktop workspace`);
        check((await p.locator('.finding-title').boundingBox()).y<height-50,`${code} hides its observation below the first view`);
        check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),`${code} introduces page-wide overflow`);
        if(width===1600)await p.screenshot({path:`output/playwright/v58-workspace-${code}.png`});
        await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
        await input('owner').fill(`${code}专题核查`);await input('note').fill(`${code}切换证据保留草稿`);
        const issue=await input('issueMetric').inputValue();
        for(const key of ['groups','data','change']) {
          await tab(code,key).click();
          check(await p.locator('.income-panel:not([hidden])').count()===1,`${code} leaves multiple panels visible`);
          check(await input('note').inputValue()===`${code}切换证据保留草稿`,`${code} discarded the draft`);
        }
        await form().getByRole('button',{name:'保存本地记录',exact:true}).scrollIntoViewIfNeeded();
        const save=await form().getByRole('button',{name:'保存本地记录',exact:true}).boundingBox();
        if(save.y< -1||save.y+save.height>height+1)await p.screenshot({path:'output/playwright/v58-form-failure.png'});
        check(save.y>=-1&&save.y+save.height<=height+1,`${code} save is unreachable at ${width}×${height}: ${JSON.stringify(save)}`);
        await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
        await p.reload();await form().waitFor();
        check(await input('owner').inputValue()===`${code}专题核查`&&await input('issueMetric').inputValue()===issue,`${code} changed the saved issue`);
        await tab(code,'change').focus();await tab(code,'change').press('ArrowRight');
        check(await tab(code,'groups').evaluate(node=>document.activeElement===node)&&p.url().includes('panel=groups'),`${code} keyboard/URL mismatch`);
        await p.goBack();await tab(code,'change').waitFor();
        check(await tab(code,'change').getAttribute('aria-selected')==='true',`${code} back loses its evidence view`);
        await p.goForward();await tab(code,'groups').waitFor();
        check(await tab(code,'groups').getAttribute('aria-selected')==='true',`${code} forward loses its evidence view`);
        await p.locator('.section-navigation-item').getByText('全部指标',{exact:true}).click();
        const expected=await p.evaluate(code=>sourceData.catalog.filter(item=>item.page===code).length,code);
        check(await p.locator('.income-catalog tbody tr').count()===expected,`${code} lost catalog entries`);
        await tab(code,'data').click();
        const link=p.locator('.detail-kpi .detail-evidence-link').first();
        const target=new URL(await link.getAttribute('href'),base);
        check(!target.hash.includes('panel='),`${code} metric evidence inherits a panel that hides its chart`);
        await link.click();await p.locator('.income-workspace').waitFor();
        check(await input('issueMetric').inputValue()===issue,`${code} auxiliary evidence changes the saved issue`);
        results.push({page:code,width,height,...layout});
      }
    }
    await open('D');
    check(await p.locator('.trial-readiness').isVisible(),'Mature-cohort readiness is hidden behind a secondary tab');
    await tab('D','groups').click();await p.locator('.trial-sample-item').first().click();
    check(await form().isVisible()&&await input('issueMetric').inputValue()==='18'&&Boolean(await input('linkedSample').inputValue()),'Trial sample does not open and link its own issue');
    check(await tab('D','groups').getAttribute('aria-selected')==='true','Linking a sample discards its evidence panel');
    await open('C');await tab('C','groups').click();
    check(await p.locator('.entity-workspace').isVisible(),'Device samples are missing');
    await open('G');await tab('G','groups').click();
    check(await p.locator('.entity-workspace').isVisible(),'Event samples are missing');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',desktopWorkspaces:results.length,checks:['paired evidence and observation','default trends','reachable registration','drafts and saved issues','keyboard tabs','URL/back/forward','complete metric catalog','trial readiness and sample linkage','device/event samples'],results};
  } finally {await context.close();}
}
