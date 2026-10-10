// Count raw mature records independently; an empty scope is not a measured zero.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),states=[],errors=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const cases=[
    {name:'measured failure',query:''},
    {name:'empty eligible scope',query:'country=US&appPlatform=iOS&productLine=Bird&plan=Plus'},
    {name:'inapplicable Free',query:'plan=Free'},
    {name:'small scope',query:'country=Other&plan=Plus'},
    {name:'measured zero',query:'plan=Starter'},
    {name:'selected week',query:'country=Other&plan=Plus&week=1'}
  ];
  const open=async query=>{
    await p.goto(`${base}#/D?metric=18&panel=groups${query?'&'+query:''}`);
    await p.locator('.trial-samples').waitFor();
    await p.locator('.trial-samples').scrollIntoViewIfNeeded();
  };
  const counts=()=>p.evaluate(()=>{
    const query=new URLSearchParams(location.hash.split('?')[1]);
    const fields={country:'country',appPlatform:'app_platform',productLine:'product_line',subscriptionPlatform:'subscription_platform',plan:'plan',billingCycle:'billing_cycle'};
    const rows=sourceData.trialFacts.records.filter(row=>row.week===Number(query.get('week')??12)&&
      Object.entries(fields).every(([key,field])=>!query.get(key)||row[field]===query.get(key)));
    return {mature:rows.length,failed:rows.filter(row=>row.payment_status==='failed').length,
      ids:rows.filter(row=>row.payment_status==='failed').slice(0,5).map(row=>row.trial_id)};
  });
  try{
    for(const width of [1366,1600,1920]){
      await p.setViewportSize({width,height:900});
      for(const scenario of cases){
        await open(scenario.query);const expected=await counts(),panel=p.locator('.trial-samples'),text=await panel.innerText();
        if(!expected.mature){
          check(text.includes('支付失败数量 —')&&!text.includes('支付失败 0 条'),'An empty/inapplicable scope claims measured zero failures');
          check(text.includes(scenario.name==='inapplicable Free'?'Free不是付费试用':'没有该筛选组合'),'Unavailable scope loses its specific reason');
          check(await panel.locator('.trial-sample-item').count()===0,'Unavailable scope offers a record association');
        }else{
          check(text.includes(`成熟试用 ${expected.mature.toLocaleString('en-US')} 人`)&&text.includes(`支付失败 ${expected.failed.toLocaleString('en-US')} 条`),'Sample caption contradicts raw cohort counts');
          const visibleIds=await panel.locator('.trial-sample-item strong').allTextContents();
          check(JSON.stringify(visibleIds)===JSON.stringify(expected.ids),'Displayed failure records differ from current mature cohort');
          if(expected.mature<30){
            check(text.includes('不能作为问题登记基线')&&await panel.locator('button.trial-sample-item').count()===0,'Small-scope samples bypass the metric eligibility guard');
            if(expected.failed){
              const hash=await p.evaluate(()=>location.hash);await panel.locator('.trial-sample-item').first().click();
              check(await p.evaluate(()=>location.hash)===hash&&!await p.locator('.action-record').isVisible(),'Reading a small sample opens an invalid baseline');
            }
          }else check(await panel.locator('button.trial-sample-item').count()===Math.min(5,expected.failed),'Usable sample association disappears');
        }
        if(scenario.name==='small scope'){
          const notes=await p.locator('.income-evidence .detail-chart-panel .table-note').allTextContents();
          check(notes.some(note=>note.includes('当前选择：其他')&&note.includes('未绘制：其他')&&note.includes('25人')),'A suppressed selected group silently disappears from the chart');
        }
        check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Sample state overflows the desktop page');
        check(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Sample panel overflows');
        states.push({width,scenario:scenario.name,...expected,text});
      }
    }
    // Direct links cannot bypass the baseline rule; saved historical records remain editable.
    await p.goto(`${base}#/D?metric=18&panel=groups&country=Other&plan=Plus&issue=18`);
    const unavailable=p.locator('.action-record');await unavailable.waitFor();
    await unavailable.locator('[name="owner"]').fill('无基线草稿');
    await unavailable.getByRole('button',{name:'保存本地记录',exact:true}).click();
    check((await unavailable.locator('.action-receipt').innerText()).includes('暂不能新建问题单'),'A direct issue URL bypasses the baseline rule');
    check(await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===null,'An invalid baseline is persisted');
    check(await unavailable.locator('[name="owner"]').inputValue()==='无基线草稿','Failed registration discards entered content');
    await p.evaluate(()=>{
      const scope=activeFilterDescription(),key=`record:D:${scope}:18`;
      localStorage.setItem('parallens-demo-actions-v1',JSON.stringify({[key]:{owner:'历史核查',status:'reviewing',baseline:'44.0%',baselineAt:'历史完整周',note:'已保存的历史记录'}}));
    });
    await p.reload();await unavailable.waitFor();
    await unavailable.locator('[name="note"]').fill('保留历史基线继续核查');
    await unavailable.getByRole('button',{name:'保存本地记录',exact:true}).click();
    check((await unavailable.locator('.action-receipt').innerText()).includes('已保存至此浏览器')&&(await unavailable.locator('> .table-note').first().innerText()).includes('44.0%'),'Unavailable current data blocks an existing record or rewrites its historical baseline');
    // A usable record still links to the current metric, preserves its baseline, and saves locally.
    await open('');const expected=await counts();
    await p.locator('button.trial-sample-item').first().focus();await p.keyboard.press('Enter');
    const form=p.locator('.action-record');await form.waitFor();
    check((await form.locator('[name="linkedSample"]').inputValue()).startsWith(expected.ids[0]),'Keyboard association points to another record');
    const baseline=await form.locator('> .table-note').first().innerText();
    check(baseline.includes('43.4%')&&!baseline.includes('不适用'),'Usable association has no metric baseline');
    await form.locator('[name="owner"]').fill('回归核查');
    await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
    await p.reload();await form.waitFor();
    check((await form.locator('[name="linkedSample"]').inputValue()).startsWith(expected.ids[0])&&await form.locator('> .table-note').first().innerText()===baseline,'Saved sample association or baseline is lost on reload');
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['independent mature and failure counts','empty scope is not zero','Free scope explains inapplicability','low samples remain readable without invalid registration',
      'suppressed group explains current scope','measured zero remains zero','three desktop widths','direct-link baseline guard preserves drafts','historical records remain editable','keyboard association and local persistence','no runtime errors'],states};
  }finally{await context.close();}
}
