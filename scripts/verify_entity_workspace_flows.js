// Verify sample selection remains visible beside its list, without changing issues.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({locale:'zh-CN',reducedMotion:'reduce'}),p=await context.newPage();
  const check=(ok,message)=>{if(!ok)throw new Error(message);},errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());
  const open=async(code,query='')=>{
    await p.goto(`${base}#/${code}?panel=groups${query?`&${query}`:''}`);
    await p.locator(`#${code}-tab-groups[aria-selected="true"]`).waitFor();
    await p.evaluate(()=>document.fonts.ready);
  };
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});
      for(const code of ['C']) {
        await open(code);
        const navigation=p.getByRole('navigation',{name:'分组证据定位',exact:true});
        await navigation.getByRole('button').filter({hasText:code==='C'?'设备样本':'异常事件'}).click();
        await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
        const note=p.locator('.action-record [name="note"]');await note.fill(`${code}原问题草稿`);
        const baseline=await p.locator('.action-record > .table-note').first().innerText();
        const route=p.url();
        const buttons=await p.locator('.entity-sample-item').all();
        for(const button of [buttons.at(-1),buttons[0]]) {
          // Native focus may scroll to reveal the button; activation must preserve that view.
          await button.focus();const before=await p.evaluate(()=>scrollY);await button.press('Enter');
          check(await button.getAttribute('aria-pressed')==='true'&&await button.evaluate(n=>document.activeElement===n),'Sample selection lost state or keyboard focus');
          const state=await p.locator('.entity-workspace').evaluate(node=>{
            const box=n=>n.getBoundingClientRect().toJSON();
            return {detail:box(node.querySelector('.entity-sample-detail')),list:box(node.querySelector('.entity-sample-list')),
              heading:box(node.querySelector('.entity-sample-detail h4')),action:box(node.querySelector('.entity-sample-detail .inspector-link')),
              listWidth:node.querySelector('.entity-sample-list').clientWidth,listScrollWidth:node.querySelector('.entity-sample-list').scrollWidth,
              selected:node.querySelector('[aria-pressed="true"] .entity-sample-id').textContent,
              detailText:node.querySelector('.entity-sample-detail').textContent,announcement:document.querySelector('#announcement').textContent,scrollY,
              overflow:document.documentElement.scrollWidth>innerWidth};
          });
          check(state.detail.left>=state.list.right&&Math.abs(state.detail.top-state.list.top)<12,'Sample detail falls below its list at normal desktop width');
          check(state.heading.top>=0&&state.action.bottom<=height+1,'Selected sample heading or next action is outside the view');
          check(!state.overflow&&state.listScrollWidth<=state.listWidth+1,'Sample workspace or list introduces horizontal clipping');
          check(state.detailText.includes(state.selected)&&state.announcement.includes(state.selected),'Selected detail or live feedback is stale');
          check(p.url()===route&&await note.inputValue()===`${code}原问题草稿`&&await p.locator('.action-record > .table-note').first().innerText()===baseline,
            'Sample selection replaced the current issue, route, draft or baseline');
          check(Math.abs(state.scrollY-before)<1,'Selecting a sample jumps the document');
          results.push({page:code,width,height,selected:state.selected,detailTop:state.detail.top,actionBottom:state.action.bottom});
        }
        await p.screenshot({path:`output/playwright/v63-entity-${code}-${width}.png`});
        // Mouse selection has the same in-place result as keyboard selection.
        await buttons.at(-1).click();
        const selectedId=await buttons.at(-1).locator('.entity-sample-id').innerText();
        check((await p.locator('.entity-sample-detail').innerText()).includes(selectedId),'Mouse selection failed to update the detail');
        const target=await p.locator('.entity-sample-detail .inspector-link').getAttribute('href');
        check(target.startsWith('#/')&&target.includes('metric='),'Sample lacks a real related-metric evidence destination');
      }
    }
    await open('C','country=US&deviceModel=K6');
    const matching=await p.evaluate(()=>sourceData.entitySamples.C.filter(row=>row.dimensions.country==='US'&&row.dimensions.deviceModel==='K6').map(row=>row.id));
    const ids=await p.locator('.entity-sample-id').allTextContents();
    check(ids.join('|')===matching.join('|'),'Device sample list does not match its current business filters');
    const target=await p.locator('.entity-sample-detail .inspector-link').getAttribute('href');
    check(target.includes('country=US')&&target.includes('deviceModel=K6'),'Related metric drops supported sample-scope filters');
    await open('G','appPlatform=iOS');
    check(await p.locator('.anomaly-event-table tbody tr').count()===3,
      'Same-source iOS event list does not match three latest records');
    await open('G','metric=53');
    check((await p.locator('.income-evidence .evidence-meta').innerText()).includes('统一近4周基线待补'),'Anomaly window claims an uncomputed four-week alert baseline');
    const originalStorage=await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
    await p.locator('.anomaly-event-workspace').getByRole('button',{name:/查看EX-06 长期未使用/}).click();
    const unusedLink=p.locator('.entity-sample-detail .inspector-link');
    check((await unusedLink.getAttribute('href')).includes('/C?metric=44'),'Long-unused device event routes to active rate instead of #44');
    await unusedLink.click();await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
    check(await p.locator('#metric-evidence-44').count()===1&&new URL(p.url()).hash.includes('metric=44'),'Related event link does not open the unused-device evidence');
    check((await p.locator('.income-context .detail-finding').innerText()).includes('未使用'),'Event destination explains a different metric');
    check(await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===originalStorage,'Opening related evidence changes existing issue records');
    await open('C');
    await p.evaluate(()=>document.documentElement.style.fontSize='24px');
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Larger desktop text creates page-wide overflow');
    const selected=p.locator('.entity-sample-item').last();await selected.focus();await selected.press('Enter');
    check(await selected.evaluate(n=>n===document.activeElement)&&await p.locator('.entity-sample-detail .inspector-link').isVisible(),'Constrained reading loses sample selection or its next action');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:['list and detail in same view at three desktop sizes','heading and next action visible','mouse and keyboard selection',
      'selection feedback and focus','no document jump','draft and baseline preservation','device filters and related evidence scope','same-source iOS events and related unused-device destination',
      'larger desktop text retains accessible content','no runtime errors'],results};
  } finally {await context.close();}
}
