// Evidence renderer faults are isolated; retry restores the same facts and issue draft.
async(parent)=>{
  const base=new URL('.',parent.url()).href,browser=parent.context().browser(),engine=browser.browserType().name();
  const context=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],logs=[],results=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')logs.push(m.text());});
  p.on('dialog',dialog=>dialog.accept());
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const model=()=>p.locator('#C-panel-groups .evidence-pair .detail-chart');
  const technical=()=>p.locator('#C-panel-groups .detail-chart-panel .detail-chart');
  const form=()=>p.locator('.action-record');
  const ready=()=>p.locator('#main[aria-busy="false"] #C-tab-change').waitFor();
  const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
  const open=async()=>{
    // A hash-only navigation keeps the old document and its fault hooks alive.
    await p.goto('about:blank');
    await p.goto(`${base}#/C?deviceModel=K6&firmware=2.8&metric=42&panel=change`);await ready();
    await p.locator('#C-panel-change svg').first().waitFor();
    await p.locator('.income-evidence > .section-top .issue-register').click();
    await form().locator('[name="owner"]').fill('故障验收');await form().locator('[name="note"]').fill('已保存的原说明');
    await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
    await form().locator('[name="note"]').fill('图表故障期间也保留的未保存草稿');
  };
  const verifyState=async(initial,baseline,url)=>{
    check(await stored()===initial,'Chart failure or retry writes the saved issue');
    check(await form().locator('[name="note"]').inputValue()==='图表故障期间也保留的未保存草稿','Chart failure discards the issue draft');
    check(await form().locator('>p').first().innerText()===baseline&&p.url()===url,'Chart recovery changes the scope or historical baseline');
    check(await p.locator('.chart-render-error').evaluateAll(ns=>ns.every(n=>!echarts.getInstanceByDom(n))),
      'A failed instance remains alive behind its error state');
    check(await p.evaluate(()=>detailCharts.every(e=>!e.isDisposed())),'Disposed charts remain in the resize collection');
  };
  const inject=async mode=>p.evaluate(mode=>{
    window.__chartFault={active:true,count:0,mode,failures:[]};
    const original=window.echarts,test=Object.create(original);
    Object.defineProperty(test,'init',{value:function(box,...args){
      if(box.matches('#C-panel-groups .evidence-pair .detail-chart')&&__chartFault.active&&mode==='init'){
        __chartFault.count++;__chartFault.failures.push('init');throw Error('SIMULATED_EVIDENCE_INIT_FAILURE');
      }
      const instance=original.init.call(original,box,...args);
      if(box.matches('#C-panel-groups .evidence-pair .detail-chart')&&mode==='option'){
        const set=instance.setOption;instance.setOption=function(...values){
          if(__chartFault.active){__chartFault.count++;__chartFault.failures.push('option');throw Error('SIMULATED_EVIDENCE_OPTION_FAILURE');}
          return set.apply(this,values);
        };
      }
      return instance;
    }});window.echarts=test;
  },mode);
  try{
    for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32],[1920,32]])for(const mode of ['init','option']){
      await p.setViewportSize({width,height:1000});await open();
      if(font!==16)await p.evaluate(()=>document.documentElement.style.fontSize='32px');
      const initial=await stored(),baseline=await form().locator('>p').first().innerText();
      await inject(mode);await p.locator('#C-tab-groups').focus();await p.keyboard.press('Enter');
      await model().locator('.chart-error-actions').waitFor();await technical().locator('svg').waitFor();
      const url=p.url(),survivor=await technical().evaluate(n=>echarts.getInstanceByDom(n).id);
      check(await model().getAttribute('role')==='group','Failure hides recovery buttons inside an image role');
      check((await model().innerText()).includes('完整数据表仍可查看'),'Failure offers no truthful data alternative');
      check((await model().boundingBox()).height<9*font,'Failure leaves a chart-sized empty panel');
      check(await p.evaluate(()=>document.activeElement.id==='C-tab-groups'),'Initial failure steals focus from the tab');
      const retry=()=>model().getByRole('button',{name:'重试设备型号 · 模拟分组对比图表',exact:true});
      await retry().focus();await p.keyboard.press('Enter');
      check(await p.evaluate(()=>__chartFault.count)===2,'Explicit retry does not perform a fresh render');
      check(await p.evaluate(mode=>__chartFault.failures.length===2&&__chartFault.failures.every(phase=>phase===mode),mode),
        `The ${mode} test did not fail in its own rendering phase`);
      check(await retry().evaluate(n=>document.activeElement===n),'A second failure loses keyboard focus');
      check((await p.locator('#announcement').innerText()).includes('仍无法显示'),'A failed retry announces success');
      const failedCalls=await p.evaluate(()=>__chartFault.count);
      await model().getByRole('button',{name:'查看设备型号 · 模拟分组对比完整数据表',exact:true}).click();
      const calculation=p.locator('#C-panel-groups .workspace-calculation');
      check(await calculation.evaluate(n=>n.open&&document.activeElement===n.querySelector('summary')),'Data fallback does not open and focus its own table');
      const first=await calculation.locator('tbody tr').first().innerText();
      check(first.includes('3,280')&&first.includes('4,000')&&first.includes('82.0%'),'Failure changes the source counts');
      await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      check(await p.evaluate(()=>__chartFault.count)===failedCalls,'Opening evidence silently retries a known failed chart');
      await verifyState(initial,baseline,url);
      if(width===1600&&mode==='option')await p.screenshot({path:`output/playwright/v108-${engine}-failure-data.png`});
      await p.evaluate(()=>__chartFault.active=false);await retry().focus();await p.keyboard.press('Enter');
      await model().locator('svg').waitFor();
      check(await model().getAttribute('role')==='img'&&await model().evaluate(n=>document.activeElement===n),'Successful retry does not restore an accessible graph and focus');
      check((await p.locator('#announcement').innerText()).includes('图表已恢复'),'Successful recovery has no accurate confirmation');
      check(await technical().evaluate(n=>echarts.getInstanceByDom(n).id)===survivor,'Retry redraws an unrelated healthy chart');
      const values=await model().evaluate(n=>echarts.getInstanceByDom(n).getOption().series[0].data);
      const expected=await p.evaluate(async()=>{
        const w=(await (await fetch('./data/weekly.json')).json()).at(-1);
        return ['K6','Bird Lite','Bird Pro'].map(model=>{
          const rows=w.deviceEventsBird.records.filter(r=>r.model===model&&r.firmware==='2.8');
          return rows.reduce((s,r)=>s+r.empty,0)/rows.reduce((s,r)=>s+r.triggers,0)*100;
        });
      });
      check(values.every((value,i)=>Math.abs(value-expected[i])<1e-9),'Recovered chart differs from the independent source counts');
      await p.getByRole('navigation',{name:'分组证据定位',exact:true}).getByRole('button',{name:'设备型号 · 模拟分组对比',exact:true}).click();
      await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
      const point=await model().evaluate(n=>{const e=echarts.getInstanceByDom(n),r=n.getBoundingClientRect(),xy=e.convertToPixel({seriesIndex:0},[0,41]);return {x:r.left+xy[0],y:r.top+xy[1]};});
      await p.mouse.click(point.x,point.y);await calculation.locator('.chart-selected').waitFor();
      check((await calculation.locator('.chart-selected').innerText()).includes('K6'),'Recovered chart loses its data-point binding');
      await verifyState(initial,baseline,url);results.push({mode,width,font,verifiedFailurePhase:mode,restored:values});
    }
    await p.setViewportSize({width:1600,height:1000});await open();await p.locator('#C-tab-groups').click();
    await technical().locator('svg').waitFor();
    const legend=()=>p.getByRole('group',{name:'固件版本 · 技术链路失败请求率图例；选择显示或隐藏系列',exact:true});
    await legend().getByRole('button',{name:'上传失败率',exact:true}).click();
    const initial=await stored(),baseline=await form().locator('>p').first().innerText(),url=p.url();
    for(const trigger of ['window','container']){
      await technical().evaluate(n=>{const e=echarts.getInstanceByDom(n);e.resize=function(){throw Error('SIMULATED_EVIDENCE_RESIZE_FAILURE');};});
      if(trigger==='window'){
        await form().locator('[name="note"]').focus();await p.setViewportSize({width:1640,height:1000});
      }else{
        await legend().getByRole('button',{name:'上传失败率',exact:true}).focus();
        await technical().evaluate(n=>n.style.height=`${n.clientHeight+24}px`);
      }
      await technical().locator('.chart-error-actions').waitFor();await model().locator('svg').waitFor();
      if(trigger==='window')check(await form().locator('[name="note"]').evaluate(n=>document.activeElement===n),'Resize failure steals the form focus');
      else check(await technical().getByRole('button',{name:/^重试/}).evaluate(n=>document.activeElement===n),'Removing a failed chart legend leaves focus on the page body');
      await verifyState(initial,baseline,url);
      await p.evaluate(()=>{
        window.__retryChartFault=true;
        const original=window.echarts,test=Object.create(original);
        Object.defineProperty(test,'init',{value:function(box,...args){
          if(box.matches('#C-panel-groups .detail-chart-panel .detail-chart')&&__retryChartFault)
            throw Error('SIMULATED_EVIDENCE_RETRY_FAILURE');
          return original.init.call(original,box,...args);
        }});window.echarts=test;
      });
      await technical().getByRole('button',{name:'重试固件版本 · 技术链路失败请求率图表',exact:true}).focus();
      await p.keyboard.press('Enter');
      check(await technical().getByRole('button',{name:/^重试/}).evaluate(n=>document.activeElement===n),
        'Repeated resize recovery failure loses the retry focus');
      await verifyState(initial,baseline,url);
      await p.evaluate(()=>__retryChartFault=false);
      await technical().getByRole('button',{name:'重试固件版本 · 技术链路失败请求率图表',exact:true}).click();
      await technical().locator('svg').waitFor();
      check(await legend().getByRole('button',{name:'上传失败率',exact:true}).getAttribute('aria-pressed')==='false','Retry loses the previous legend selection');
      check(await technical().evaluate(n=>echarts.getInstanceByDom(n).getOption().legend[0].selected['上传失败率']===false),
        'Recovered legend button and plotted series disagree');
      await verifyState(initial,baseline,url);results.push({mode:'resize',trigger,legendRestored:true});
    }
    check(!errors.length,`Unhandled browser errors: ${errors.join('; ')}`);
    check(logs.filter(text=>text.includes('证据图表绘制失败')).length===24,'Renderer failures are hidden or retried without an explicit action');
    return {status:'PASS',results,loggedFailures:logs.length,checks:['init and setOption faults isolated','unrelated graphs still render',
      'repeated failure and focused retry','unchanged tables, saved baselines and drafts','independent source counts','restored point-to-table interaction',
      'window and container resize faults','legend selection retained','no focus theft','all faults logged; none escape the boundary']};
  }catch(error){
    const state=await p.locator('#C-panel-groups .detail-chart').evaluateAll(ns=>ns.map(n=>({
      classes:n.className,text:n.textContent.slice(0,200),width:n.clientWidth,height:n.clientHeight,
      html:n.innerHTML.slice(0,250),instance:!!echarts.getInstanceByDom(n)})));
    await p.screenshot({path:`output/playwright/v108-${engine}-recovery-failure.png`});
    throw Error(`${error.message}; graphs=${JSON.stringify(state)}; errors=${JSON.stringify(errors)}; logs=${JSON.stringify(logs.map(text=>text.split('\n')[0]))}`);
  }finally{await context.close();}
}
