// Browser regression in an isolated context; no changes to user issue records.
async(page)=>{
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1366,height:768},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],sizes=[];
  const check=(value,message)=>{if(!value)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const panel=()=>p.locator('.trial-readiness');
  const batch=end=>panel().locator(`[data-batch-end="${end}"]`);
  const open=async hash=>{await p.goto(`${base}#/${hash}`);await panel().waitFor();};
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});await open('D?metric=18');
      check((await p.locator('.detail-kpi[data-metric-id="18"]').innerText()).includes('43.4%'),'Mature conversion changed');
      check((await batch('2026-09-27').innerText()).includes('观察未结束'),'Future batch shown as zero');
      check((await batch('2026-09-20').innerText()).includes('已齐 248 / 应齐 300 人'),'Pending result counts differ');
      check((await batch('2026-09-20').innerText()).includes('仍缺 52 人'),'Missing results hidden');
      check(await panel().evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Readiness panel overflows');
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflows');
      const summary=batch('2026-09-20').locator('summary');
      if(await batch('2026-09-20').locator('details').getAttribute('open')!==null)await summary.click();
      await summary.focus();await summary.press('Enter');
      await p.waitForFunction(()=>document.querySelector('[data-batch-end="2026-09-20"] details')?.open);
      check(await batch('2026-09-20').locator('details').getAttribute('open')!==null,'Keyboard cannot open readiness details');
      check(await batch('2026-09-20').getByRole('table').isVisible(),'Count table not visible');
      check(await batch('2026-09-20').getByRole('row').count()===5,'Count table missing disjoint groups');
      check(await summary.evaluate(node=>document.activeElement===node),'Expanding loses focus');
      if(width===1600) {
        await panel().evaluate(node=>scrollTo({top:node.getBoundingClientRect().top+scrollY-75,behavior:'instant'}));
        await panel().screenshot({path:'output/playwright/v54-trial-readiness.png'});
      }
      sizes.push(width);
    }
    await open('D?country=US&metric=18');
    check((await batch('2026-09-20').innerText()).includes('已齐 131 / 应齐 160 人'),'Country selection retains overall counts');
    await p.locator('.filter-bar > summary').click();
    await p.locator('select[name="country"]').selectOption('UK');
    await p.waitForFunction(()=>document.querySelector('.trial-readiness-count')?.textContent.includes('80 人'));
    check((await batch('2026-09-20').innerText()).includes('已齐 68 / 应齐 80 人'),'Interactive filter does not recalculate readiness');
    await p.reload();await panel().waitFor();
    check((await batch('2026-09-20').innerText()).includes('已齐 68 / 应齐 80 人'),'Reload loses readiness scope');
    await open('D?country=Other&metric=18');
    check(await panel().locator('.trial-readiness-card').count()===0,'Missing example shown as zero batch');
    check((await panel().innerText()).includes('不能据此判断没有待齐批次'),'Missing coverage hidden');
    await open('D?week=1&metric=18');
    check((await p.locator('.detail-kpi[data-metric-id="18"]').innerText()).includes('45.0%'),'W1 mature conversion changed');
    check(await panel().locator('.trial-readiness-card').count()===2,'Week filter incorrectly drops readiness dates');
    await open('D?metric=52&issue=52');
    check((await p.locator('.action-record').innerText()).includes('168'),'Readiness module changes risk issue baseline');
    await p.route('**/data/trial-facts.json',async route=>{
      const response=await route.fetch(),json=await response.json();
      json.readiness.records[0].received_outcomes=null;
      await route.fulfill({response,json});
    });
    await p.reload();await panel().waitFor();
    check((await batch('2026-09-20').innerText()).includes('已齐数量待核验'),'Unknown count converted to zero');
    check((await batch('2026-09-20').innerText()).includes('结果待齐'),'Completed observation mistaken for unfinished window');
    check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
    return {result:'PASS',sizes,scenarios:['observation unfinished','results incomplete','country interaction and reload','missing intersection','unknown received count','independent batch dates','mature denominator and issue baseline preserved','keyboard details']};
  } finally {await context.close();}
}
