// All catalog and shared-topic registration routes, without touching user records.
async (page) => {
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1366,height:1000},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  p.on('dialog',dialog=>dialog.accept());
  try {
    await p.goto(base);await p.locator('#statusChart svg').waitFor();
    const cases=await p.evaluate(()=>Object.keys(pages).flatMap(code=>[...new Set([
      ...sourceData.catalog.filter(item=>item.page===code).map(item=>item.id),...sourceData.diagnostics[code].heroIds])].map(id=>[code,id])));
    for(const [code,id] of cases) {
      await p.goto(`${base}#/${code}?metric=${id}`);
      const evidence=p.locator(`#metric-evidence-${id}`);await evidence.waitFor();
      await evidence.locator('.issue-register').click();
      const form=p.locator('.action-record');
      check((await form.locator('strong').first().innerText()).startsWith(`问题单 DEMO-${code}-${id}-`),`${code} #${id} registered another metric`);
      check(await form.locator('[name="issueMetric"]').inputValue()===String(id),`${code} #${id} issue selector disagrees`);
      check(await form.locator('[name="owner"]').evaluate(node=>document.activeElement===node),`${code} #${id} registration focus lost`);
      check(p.url().includes(`issue=${id}`),`${code} #${id} explicit selection missing from URL`);
      results.push({page:code,id});
    }
    for(const [code,id] of [['G',52],['G',15],['F',7],['F',47],['E',3]]) {
      await p.goto(`${base}#/${code}?metric=${id}&issue=${id}`);
      const form=p.locator('.action-record');await form.waitFor();
      const baseline=await form.locator(':scope > p').first().innerText();
      await form.locator('[name="owner"]').fill(`${code} #${id} 核查`);
      await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
      const expected=await form.locator('strong').first().innerText();
      await p.reload();await form.waitFor();
      check(await form.locator('strong').first().innerText()===expected,'Shared issue changed after refresh');
      check(await form.locator(':scope > p').first().innerText()===baseline,'Shared issue baseline changed');
      check(await form.locator('[name="owner"]').inputValue()===`${code} #${id} 核查`,'Shared issue did not persist');
      if(code==='G'&&id===52)await form.screenshot({path:'output/playwright/v52-shared-issue-after.png'});
    }
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',registrations:results.length,sharedSavedReloaded:5,results};
  } finally {await context.close();}
}
