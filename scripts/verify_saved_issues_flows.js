// Cross-page discovery of actual saved records; original keys, baselines and drafts survive.
async(parent)=>{
  const base=new URL('.',parent.url()).href,states=[],rapidNavigation=[];
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:900},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],dialogs=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',e=>errors.push(e.message));
  p.on('dialog',async d=>{dialogs.push(d.type());await d.accept();});
  const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const ready=async()=>{await p.locator('#main[aria-busy="false"] h1').waitFor();await settle();};
  const open=async route=>{await p.goto(`${base}#/${route}`);await ready();};
  const trigger=()=>p.locator('#open-saved-issues'),dialog=()=>p.locator('#saved-issues');
  const query=()=>p.getByRole('searchbox',{name:'查找问题、范围、负责人或处理状态',exact:true});
  const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
  const list=async()=>{await trigger().click();await dialog().waitFor();};
  const cases=[['A',13,''],['B',25,''],['C',42,''],['D',18,''],['E',35,''],['F',48,''],['G',54,''],
    ['D',18,'country=US&'],['D',18,'country=UK&'],['A',13,'appPlatform=iOS&']];
  const saved=[];
  try {
    await open('');await trigger().focus();await p.keyboard.press('Enter');
    const emptyText=await dialog().innerText();
    check(emptyText.includes('还没有已保存的问题单'),`Empty state gives no next step: ${JSON.stringify({text:emptyText,stored:await stored()})}`);
    await p.keyboard.press('Control+k');
    check(await dialog().isVisible()&&!await p.locator('#metric-search').isVisible(),'Metric shortcut opens a second modal above the issue list');
    await p.keyboard.press('Escape');check(await trigger().evaluate(n=>document.activeElement===n),'Escape loses original trigger');
    for(const [code,id,filters] of cases) {
      await open(`${code}?${filters}metric=${id}&issue=${id}`);
      const form=p.locator('.action-record');await form.waitFor();
      await form.locator('[name="owner"]').fill(`自检 ${code} ${filters||'总体'}`);
      const status=code==='E'?'resolved':code==='A'&&filters?'verified':code==='D'&&filters?'pending':'reviewing';
      await form.locator('[name="status"]').selectOption(status);
      await form.locator('[name="due"]').fill('2026-10-20');
      if(status==='verified') {
        await form.locator('[name="target"]').fill('实测值与登记值保持一致，仅为流程演示');
        await form.locator('[name="reviewValue"]').fill(await p.evaluate(()=>actionBaselineValue(Number(document.querySelector('[name="issueMetric"]').value))));
        await form.locator('[name="reviewedAt"]').fill('2026-09-24');
      }
      await form.locator('[name="note"]').fill(`仅用于独立浏览器验收：${code} #${id}`);
      await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
      check(await form.getAttribute('data-dirty')==='false','Record save failed');
      const entry=await p.evaluate(({code,id})=>Object.entries(simulatedActionState).find(([key,r])=>
        key===`record:${code}:${activeFilterDescription()||'默认演示范围'}:${id}`),{code,id});
      check(Boolean(entry),'Saved key is not traceable');saved.push(entry);
      check(await p.locator('#saved-issues-total').innerText()===String(saved.length),'Sidebar count does not follow actual save');
    }
    const original=await stored();
    for(const [key,record] of saved) {
      await open('D?country=DE&plan=Plus&week=12');
      await list();await query().fill(record.issueId);
      check(await dialog().locator('.saved-issues-table > table > tbody > tr[data-record-key]').count()===1,'Issue ID does not find one original record');
      await dialog().getByRole('button',{name:`打开 ${record.issueId} · ${record.scope}`,exact:true}).focus();await p.keyboard.press('Enter');await settle();
      check(!await dialog().isVisible(),'Open leaves the modal in front of evidence');
      const state=await p.evaluate(()=>({filters:filterState,issue:document.querySelector('[name="issueMetric"]').value,
        owner:document.querySelector('[name="owner"]').value,note:document.querySelector('[name="note"]').value,
        status:document.querySelector('[name="status"]').value,due:document.querySelector('[name="due"]').value,
        baseline:document.querySelector('.action-record > p').textContent,focus:document.activeElement.name,
        heading:document.querySelector('.action-record strong').textContent}));
      check(JSON.stringify(state.filters)===JSON.stringify(record.filters),'Opened record merged current filters into stored filters');
      check(state.issue===String(record.evidenceId)&&state.owner===record.owner&&state.note===record.note,'Opened another issue or lost fields');
      check(state.status===record.status&&state.due===record.due,'Stored progress or review date changed');
      if(record.evidenceId===54&&record.baseline.startsWith('质量日证据v1：')) {
        const counts=JSON.parse(record.baseline.slice('质量日证据v1：'.length)),detail=p.locator('.action-record .quality-baseline-details');
        check(await detail.count()===1&&await detail.locator('tbody tr').count()===8,'Saved quality source no longer has inspectable two-day/type evidence');
        await detail.locator('> summary').click();
        const latest=await detail.locator('table').first().locator('tbody tr').last().innerText();
        check(latest.includes(counts.windows[1].start)&&latest.includes(counts.windows[1].end)&&latest.includes(counts.windows[1].mapped.toLocaleString('zh-CN')),'Reopened quality baseline uses different daily evidence');
        await detail.locator('> summary').click();await p.locator('.action-record [name=owner]').focus();
      }else check(state.baseline.includes(record.baseline),'Stored baseline changed');
      check(state.baseline.includes(record.baselineAt)&&state.heading.includes(record.issueId),'Stored window or identity changed');
      check(state.focus==='owner','Opened issue has no keyboard destination');
      check(await stored()===original,'Opening a saved record changes persisted data');states.push({key,...state});
    }
    const rapidRecord=saved.find(([,r])=>r.page==='D'&&r.filters.country==='US')[1];
    for(const motion of ['reduce','no-preference'])for(const width of [1366,1600,1920]) {
      await p.emulateMedia({reducedMotion:motion});await p.setViewportSize({width,height:900});await p.reload();await ready();
      // These 66 same-paint interactions cover already visited views. Cold-route
      // cancellation, readiness and modal ownership are tested in page_loading.
      await p.evaluate(()=>Promise.all(['',...Object.keys(pages)].map(requestRouteData)));
      for(const next of ['', 'A','B','C','E','F','G','metric-search','saved-issues','filter','metric-search-close']) {
        await open('A');await list();await query().fill(rapidRecord.issueId);
        const sample=await p.evaluate(next=>{
          const snapshot=()=>({hash:location.hash,top:scrollY,focus:document.activeElement.id||document.activeElement.name,
            announcement:document.querySelector('#announcement').textContent,
            modal:document.querySelector('dialog:modal')?.id??null});
          // Deliver two UI actions before the next paint to expose stale deferred work.
          document.querySelector('.saved-issue-open').click();
          if(next==='metric-search')document.querySelector('#open-metric-search').click();
          else if(next==='metric-search-close') {
            document.querySelector('#open-metric-search').click();document.querySelector('#metric-search').close();
          }
          else if(next==='saved-issues')document.querySelector('#open-saved-issues').click();
          else if(next==='filter') {
            document.querySelector('.filter-bar').open=true;
            const select=document.querySelector('.filter-field select[name="country"]');
            select.value='UK';select.dispatchEvent(new Event('change',{bubbles:true}));
          } else document.querySelector(`.sidebar-nav .nav-link[data-page="${next}"]`).click();
          const immediate=snapshot(),frames=[];
          return new Promise(resolve=>{
            const paint=()=>{frames.push(snapshot());if(frames.length<3)requestAnimationFrame(paint);else resolve({immediate,frames});};
            requestAnimationFrame(paint);
          });
        },next);
        const final=sample.frames.at(-1);
        check(sample.frames.every(frame=>frame.hash===sample.immediate.hash&&Math.abs(frame.top-sample.immediate.top)<1.5),
          `Old issue navigation moves the newer view: ${width} ${next} ${JSON.stringify(sample)}`);
        // An uncached destination may legitimately finish preparing between paints;
        // its completion must keep the current focus and must never announce the old issue.
        const requestedCode=sample.immediate.hash.replace(/^#\/?/,'').split('?')[0];
        const completion=requestedCode?`已打开${({A:'新客与激活',B:'活跃与留存',C:'设备健康',D:'订阅转化',E:'付费价值',F:'用户与设备结构',G:'异常与数据质量'})[requestedCode]}诊断页`:'已返回经营总览';
        check(sample.frames.every(frame=>frame.focus===sample.immediate.focus&&
          (frame.announcement===sample.immediate.announcement||frame.announcement===completion)),
          `Old issue navigation steals focus or announces a stale scope: ${JSON.stringify(sample)}`);
        if(next==='metric-search'||next==='saved-issues') {
          check(final.modal===next,'New modal was displaced by the previous record opening');
          await p.keyboard.press('Escape');await settle();
          check(Math.abs(await p.evaluate(()=>scrollY)-final.top)<1.5,'Closing the new modal exposes a moved background');
        } else if(next==='filter') {
          check(final.hash.includes('country=UK')&&final.focus==='country','New filter loses its scope or focus');
        } else if(next==='metric-search-close') {
          check(!final.modal&&final.focus==='open-metric-search','Closing the new modal loses its own return focus');
        } else {
          check(final.hash.startsWith(`#/${next}?`)&&Math.abs(final.top)<1.5,
            `Sidebar does not keep its requested page entry: ${JSON.stringify(sample)}`);
        }
        check(await stored()===original,'Rapid navigation writes the historical issue');
        rapidNavigation.push({motion,width,next,...sample});
        if(width===1600&&next==='E')await p.screenshot({path:`output/playwright/v110-${parent.context().browser().browserType().name()}-${motion}-following-page.png`});
      }
    }
    await p.emulateMedia({reducedMotion:'reduce'});
    const [sourceKey,sourceRecord]=saved.find(([,r])=>r.page==='A'&&!Object.keys(r.filters).length);
    const [targetKey,targetRecord]=saved.find(([,r])=>r.page==='D'&&r.filters.country==='US');
    await open(`A?metric=13&issue=13`);await p.locator('[name="note"]').fill('A页尚未保存的跨页草稿');
    await list();await query().fill(targetRecord.issueId);await dialog().getByRole('button',{name:`打开 ${targetRecord.issueId} · ${targetRecord.scope}`,exact:true}).click();await settle();
    await p.locator('[name="note"]').fill('美国问题单尚未保存的草稿');
    await list();await query().fill(sourceRecord.issueId);await dialog().getByRole('button',{name:`打开 ${sourceRecord.issueId} · ${sourceRecord.scope}`,exact:true}).click();await settle();
    check(await p.locator('[name="note"]').inputValue()==='A页尚未保存的跨页草稿','Cross-page list discards the previous draft');
    await list();await query().fill(targetRecord.issueId);await dialog().getByRole('button',{name:`打开 ${targetRecord.issueId} · ${targetRecord.scope}`,exact:true}).click();await settle();
    check(await p.locator('[name="note"]').inputValue()==='美国问题单尚未保存的草稿','Returning through the list overwrites its target draft');
    check(await stored()===original,'Switching drafts silently saves changes');
    await p.goBack();await settle();check(await p.locator('[name="note"]').inputValue()==='A页尚未保存的跨页草稿','Browser back loses the source draft');
    await p.goForward();await settle();check(await p.locator('[name="note"]').inputValue()==='美国问题单尚未保存的草稿','Browser forward loses target draft');
    // Restore the exact saved text, so reload is a deliberate clean navigation.
    await p.locator('[name="note"]').fill(targetRecord.note);
    const broken=await p.evaluate(()=>{
      const before=JSON.parse(localStorage.getItem(ACTION_STORAGE_KEY));
      const d=Object.values(before).find(r=>r.page==='D'&&!Object.keys(r.filters).length);
      const entries={
        'record:legacy':{page:'D',evidenceId:18,scope:'旧范围',issueId:'OLD-RECORD',baseline:'41.0%',baselineAt:'旧观察窗口',note:'必须保留的旧说明'},
        'record:unsupported':{...d,filters:{country:'FR'}},
        'record:scope-mismatch':{...d,scope:'旧范围标签',filters:{country:'US'}},
        'record:unknown-page':{...d,page:'constructor',status:'constructor'},
        'record:null':null,
        'record:wrong-identity':{...d,issueId:'DIFFERENT-ID'},
        'D:D-01':{complete:true,evidenceMetric:18}
      };
      entries['record:legacy'].owner='很长的核查负责人'.repeat(15);
      entries['record:legacy'].scope='需要完整保留的历史范围'.repeat(20);
      Object.assign(before,entries);localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(before));return Object.keys(entries).filter(k=>k.startsWith('record:'));
    });
    await p.reload();await ready();await list();
    for(const key of broken) {
      const row=dialog().locator(`[data-record-key="${key}"]`);
      check(await row.count()===1&&await row.locator('.saved-issue-open').count()===0&&await row.locator('.saved-issue-details-toggle').count()===1&&Boolean(await row.locator('.saved-issue-readonly').innerText()),
        'Unsupported stored scope disappeared or can open as a new issue');
    }
    check(await dialog().locator('.saved-issues-table > table > tbody > tr[data-record-key]').count()===saved.length+broken.length,'A stored problem disappeared or a separate action mark entered the list');
    await query().fill('OLD-RECORD');await dialog().locator('.saved-issue-details-toggle').click();
    check((await dialog().innerText()).includes('41.0%')&&(await dialog().innerText()).includes('必须保留的旧说明'),'Read-only historical details disappeared');
    await query().fill('不会匹配的关键词');check((await dialog().innerText()).includes('没有匹配的问题'),'Search empty state disappears');
    await query().fill('');
    await query().focus();
    const focusable=await dialog().locator('button,input,summary,[tabindex="0"]').count();
    for(let i=0;i<focusable+2;i++) {
      await p.keyboard.press('Tab');
      const focus=await dialog().evaluate(n=>({inside:n.contains(document.activeElement),modal:n.matches(':modal'),
        browserChrome:!document.hasFocus()&&document.activeElement===document.body}));
      check(focus.modal&&(focus.inside||focus.browserChrome),'Tab enters an inert background control');
      if(focus.browserChrome) {
        await p.keyboard.press('Tab');
        check(await dialog().evaluate(n=>n.contains(document.activeElement)),'Tab does not return from browser chrome to the modal');
      }
    }
    const beforeReadOnly=await stored();
    for(const width of [1100,1366,1600,1920])for(const font of [16,24,32]) {
      await p.setViewportSize({width,height:900});await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,font);await settle();
      const layout=await dialog().evaluate(n=>{
        const r=n.getBoundingClientRect(),close=n.querySelector('#close-saved-issues'),c=close.getBoundingClientRect();
        return {inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
          closeClickable:close.contains(document.elementFromPoint(c.left+c.width/2,c.top+c.height/2)),
          overflow:document.documentElement.scrollWidth>innerWidth};
      });
      check(layout.inside&&layout.closeClickable&&!layout.overflow,`Dialog clips controls: ${width} ${font} ${JSON.stringify(layout)}`);
      const scrollTable=dialog().locator('.saved-issues-table');
      if(await scrollTable.getAttribute('data-scrollable')!==null) {
        check(await scrollTable.locator(':scope > .table-scroll-hint').isVisible(),'Wide record table has no visible scrolling instruction');
        await scrollTable.evaluate(n=>n.scrollLeft=0);await scrollTable.focus();await p.keyboard.press('ArrowRight');
        check(await scrollTable.evaluate(n=>n.scrollLeft>0),'Wide record table does not respond to keyboard scrolling');
      }
      await dialog().locator('.saved-issue-open').last().focus();await settle();
      check(await dialog().evaluate(n=>n.contains(document.activeElement)),'Last record loses modal focus');
      check(await dialog().locator('#close-saved-issues').evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),'Scrolling records hides the close action');
    }
    const reading=await p.evaluate(()=>({left:scrollX,top:scrollY}));
    await p.keyboard.press('Escape');await settle();
    check(await trigger().evaluate(n=>{
      const r=n.getBoundingClientRect();return document.activeElement===n&&r.top>=0&&r.bottom<=innerHeight&&
        n.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
    }),'Enlarged modal does not restore a visible trigger');
    check(await p.evaluate(view=>scrollX===view.left&&scrollY===view.top,reading),'Closing the list moves the underlying reading position');
    check(await stored()===beforeReadOnly,'Read-only inspection modifies old data');
    check(!errors.length,errors.join('; '));
    return {status:'PASS',records:states,rapidNavigation,dialogs,checks:['empty and unmatched search','ten real saves across A–G and multiple scopes','exact filter replacement and original IDs/baselines',
      'sixty-six rapid sidebar, modal and filter actions preserve the newest view, focus and announcement with both motion preferences',
      'cross-page source/target drafts and back/forward','six unsupported legacy records remain read-only','separate action marks excluded',
      'four desktop widths at 100/150/200% text','scrolling retains close action','keyboard open/Tab/Escape and focus restoration','no stacked metric-search shortcut','unchanged stored JSON on inspection']};
  }catch(error){
    const state=await p.evaluate(()=>({hash:location.hash,focus:document.activeElement.id||document.activeElement.name,
      modal:document.querySelector('dialog:modal')?.id,content:document.querySelector('#saved-issues')?.innerText,
      stored:localStorage.getItem('parallens-demo-actions-v1')}));
    try{await p.screenshot({path:`output/playwright/v110-${parent.context().browser().browserType().name()}-saved-failure.png`,timeout:5000});}
    catch(captureError){state.captureFailure=captureError.message;}
    throw Error(`${error.message}; state=${JSON.stringify(state)}`);
  }finally{await context.close();}
}
