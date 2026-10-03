// Run with playwright-cli run-code --filename=scripts/verify_action_flows.js.
// Isolated browser context: no changes to the user's existing local records.
async (page) => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({viewport:{width:1440,height:1000},locale:'zh-CN',reducedMotion:'reduce'});
  const probe=await context.newPage(),errors=[];
  probe.on('pageerror',error=>errors.push(error.message));
  probe.on('dialog',dialog=>dialog.accept());
  const form=()=>probe.locator('.action-record');
  const input=name=>form().locator(`[name="${name}"]`);
  const receipt=()=>form().locator('.action-receipt');
  const stored=()=>probe.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
  const open=async hash=>{
    await probe.goto(`${base}#/${hash}`);
    await probe.waitForFunction(code=>document.querySelector('h1')?.textContent===({D:'订阅转化',C:'设备健康'}[code]),hash[0]);
    await form().waitFor();
  };
  try {
    await open('D');
    check((await form().innerText()).includes('完整周 W12 · 2026-09-13'),'Trial baseline uses the snapshot date instead of its mature cohort');
    check(await form().getAttribute('data-dirty')==='false','Fresh record incorrectly claims unsaved edits');
    check(!await form().locator('.action-review').evaluate(node=>node.open),'Empty review fields clutter initial registration');
    await input('owner').fill('运营核查');
    await input('status').selectOption('reviewing');
    await input('note').fill('核对 Android Plus 支付失败记录');
    check(await form().getAttribute('data-dirty')==='true','Edited record does not expose an unsaved state');
    check(await stored()===null,'Draft was presented as persisted without a save');
    await probe.locator('.action-evidence-link[aria-label^="D-02，"]').click();
    await probe.locator('#metric-evidence-52').waitFor();
    check(probe.url().includes('metric=52'),'Action linked the wrong metric evidence');
    check(await input('note').inputValue()==='核对 Android Plus 支付失败记录','Evidence navigation discarded the draft');
    await open('C');
    await open('D');
    check(await input('owner').inputValue()==='运营核查','Cross-page return discarded the draft');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check(await receipt().getAttribute('data-state')==='saved','Save did not report success');
    check(await form().getAttribute('data-dirty')==='false','Successful save left a dirty record');
    const savedJSON=await stored(),savedRecords=JSON.parse(savedJSON);
    const recordKey=Object.keys(savedRecords).find(key=>key.startsWith('record:D:'));
    check(savedRecords[recordKey].baselineAt==='完整周 W12 · 2026-09-13','Persisted baseline contradicts the metric window');
    await probe.reload();await form().waitFor();
    check(await input('owner').inputValue()==='运营核查','Saved registration did not survive reload');
    await probe.evaluate(()=>{window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('Intentional storage failure');};});
    await input('note').fill('这一修改应该保存失败');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check(await receipt().getAttribute('role')==='alert'&&(await receipt().innerText()).includes('未保存'),'Failed storage write displayed a success receipt');
    check(await stored()===savedJSON,'Failed storage write altered the existing persisted record');
    await open('C');await open('D');
    check(await input('note').inputValue()==='这一修改应该保存失败','Failed-save content was lost on navigation');
    const actionButton=probe.locator('button[data-action-id="D-01"]');
    await actionButton.click();
    check(await actionButton.getAttribute('aria-pressed')==='false','Failed action toggle altered the in-memory status');
    check((await probe.locator('.action-operation-feedback').innerText()).includes('保持原状态'),'Failed action toggle omitted its unchanged state');
    check(await stored()===savedJSON,'Failed action toggle changed persisted records');
    await probe.evaluate(()=>{Storage.prototype.setItem=window.__setItem;});
    await probe.reload();await form().waitFor();
    check(await input('note').inputValue()==='核对 Android Plus 支付失败记录','Failed save falsely changed the committed registration');
    await probe.locator('button[data-action-id="D-01"]').click();
    check(await probe.locator('button[data-action-id="D-01"]').getAttribute('aria-pressed')==='true','Action toggle did not save');
    check(JSON.parse(await stored())['D:D-01'].evidenceMetric===18,'Action saved another metric as its evidence');
    await probe.reload();await form().waitFor();
    check(await probe.locator('button[data-action-id="D-01"]').getAttribute('aria-pressed')==='true','Action state did not survive reload');
    await probe.locator('button[data-action-id="D-01"]').click();
    check(await probe.locator('button[data-action-id="D-01"]').getAttribute('aria-pressed')==='false','Undo did not restore the unmarked state');
    const beforeReview=await stored();
    await input('status').selectOption('verified');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check(await form().locator('[aria-invalid="true"]').count()===3,'Manual verification did not enforce all three review fields');
    check(await input('target').evaluate(node=>document.activeElement===node),'Invalid submission did not focus the first error');
    check(await stored()===beforeReview,'Invalid review altered stored state');
    await input('target').fill('转正率达到业务确认的45%');
    await input('reviewValue').fill('45.2%');
    await input('reviewedAt').fill('2099-01-01');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check((await receipt().innerText()).includes('不能晚于今天'),'A future actual review date was accepted');
    check(await stored()===beforeReview,'Future review date changed stored state');
    await input('reviewedAt').fill('2026-09-24');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    check(JSON.parse(await stored())[recordKey].status==='verified','Complete manual review was not saved');
    check(await form().getAttribute('data-dirty')==='false','Verified save still appears unsaved');
    await probe.locator('.trial-sample-item').first().click();
    check(Boolean(await input('linkedSample').inputValue()),'Sample linkage did not fill the record');
    check(await form().getAttribute('data-dirty')==='true','Sample linkage bypassed unsaved-state feedback');
    const linked=await input('linkedSample').inputValue();
    await open('C');await open('D');
    check(await input('linkedSample').inputValue()===linked,'Sample linkage did not survive navigation');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    const globalRecord=await input('owner').inputValue();
    await open('D?country=US');
    check(await input('owner').inputValue()==='','Default issue leaked into a different filtered scope');
    await input('owner').fill('美国范围核查');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    await open('D');
    check(await input('owner').inputValue()===globalRecord,'Filtered issue overwrote the default issue');
    await open('D?week=2');
    check((await form().innerText()).includes('完整周 W2 · 2026-07-05'),'Selected week does not control the issue baseline');
    await open('D');
    await probe.evaluate(key=>{const records=JSON.parse(localStorage.getItem('parallens-demo-actions-v1'));records[key].baselineAt='2026-09-24';localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(records));},recordKey);
    await probe.reload();await form().waitFor();
    check((await form().locator('.action-baseline-note').innerText()).includes('完整周 W12 · 2026-09-13'),'Legacy baseline lacks a correction context');
    check(JSON.parse(await stored())[recordKey].baselineAt==='2026-09-24','Existing historical baseline was silently rewritten');
    await form().screenshot({path:'output/playwright/action-review-1440.png'});
    await probe.setViewportSize({width:1920,height:1000});
    await form().screenshot({path:'output/playwright/action-review-1920.png'});
    check(!await probe.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Review layout overflows at desktop width');
    for(const width of [1366,1920]) {
      await probe.setViewportSize({width,height:1000});
      await open('C?deviceModel=K6&firmware=2.8');
      const technicalRow=probe.locator('.action-checks tr[data-metric-id="46"]');
      const technicalSignal=await technicalRow.locator('td').first().innerText();
      check(technicalSignal.includes('直播 · 91.3%')&&technicalSignal.includes('推送成功率：95.0%')&&technicalSignal.includes('上传成功率：97.0%'),
        'Following a technical card into the action table hides the lower live rate');
      const deviceSignal=await probe.locator('.action-checks tr[data-metric-id="8"] td').first().innerText();
      check(deviceSignal.includes('19,611台')&&deviceSignal.includes('当前绑定设备：16,005台')&&!deviceSignal.includes(' / '),
        'The action table combines cumulative and currently bound devices without names');
      await input('note').fill('按链路核对请求失败，保留当前核查草稿');
      const originalIssue=await form().locator('.action-record-header strong').innerText();
      await technicalRow.locator('a').click();await probe.locator('#metric-evidence-46 svg').first().waitFor();
      check(probe.url().includes('deviceModel=K6')&&probe.url().includes('firmware=2.8')&&probe.url().includes('metric=46'),
        'Action evidence lost the metric or supported filter scope');
      check(await input('note').inputValue()==='按链路核对请求失败，保留当前核查草稿','Action evidence navigation lost the current draft');
      check(await form().locator('.action-record-header strong').innerText()===originalIssue,'Opening auxiliary evidence changed the current issue');
      await probe.goto(`${base}#/E?country=US`);await probe.locator('.income-workspace').waitFor();
      await probe.getByRole('tab',{name:'完整数据',exact:true}).click();
      await probe.getByText('查看核查对象与演示行动清单',{exact:true}).click();
      const paymentCard=probe.locator('.detail-kpi[data-metric-id="35"]');
      const paymentSignal=await probe.locator('.action-checks tr[data-metric-id="35"] td').first().innerText();
      check(paymentSignal.includes(await paymentCard.locator('.detail-select').innerText())&&
        paymentSignal.includes('月内订阅付款主账号：')&&paymentSignal.includes('8月'),
        'Payment actions lose the per-payer unit, payer count, or complete month');
      await probe.goto(`${base}#/F?country=US`);await probe.locator('.action-checks').waitFor();
      check(await probe.locator('.action-checks tr[data-metric-id="48"] th').innerText()==='多设备主账号占比',
        'Device-share actions are still labelled as device counts');
      check(!await probe.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Filtered action evidence overflows at desktop width');
    }
    check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
    return {status:'PASS',checks:['metric-specific action evidence','mature-cohort baseline','draft survives evidence and page navigation','successful save and reload','storage failure preserves committed state and draft','action marking and undo','review required fields and future-date validation','sample-link dirty feedback','filter scope isolation','selected-week baseline','legacy baseline preservation','card and action metric consistency','independent technical rates and device counts','scoped action evidence preserves issue and draft','payment units and periods in actions'],screenshots:['action-review-1440.png','action-review-1920.png']};
  } finally {await context.close();}
}
