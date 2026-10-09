// Real group-navigation and comparative rates, isolated from user issue records.
async(page)=>{
  const base=new URL('.',page.url()).href;
  const context=await page.context().browser().newContext({locale:'zh-CN',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[],results=[];
  p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const open=async hash=>{await p.goto(`${base}#/${hash}`);await p.locator(`#${hash.split('?')[0]}-tab-change`).waitFor();await p.evaluate(()=>document.fonts.ready);};
  const form=()=>p.locator('.action-record'),field=name=>form().locator(`[name="${name}"]`);
  try {
    for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]) {
      await p.setViewportSize({width,height});
      for(const code of ['C','D','E','F','G']) {
        await open(code);
        await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
        await field('note').fill(`${code}证据定位不丢失的草稿`);
        const baseline=await form().locator('> .table-note').first().textContent();
        await p.locator(`#${code}-tab-groups`).click();
        const navigation=p.getByRole('navigation',{name:'分组证据定位',exact:true});await navigation.waitFor();
        const buttons=await navigation.getByRole('button').all(),url=p.url();
        check(buttons.length>=2,`${code} has no usable evidence destinations`);
        for(const button of buttons) {
          const id=await button.getAttribute('aria-controls'),target=p.locator(`[id="${id}"]`);
          await button.focus();await button.press('Enter');
          check(await target.isVisible(),`${code} destination stays hidden`);
          await p.waitForFunction(id=>document.getElementById(id).contains(document.activeElement),id);
          const focused=await p.evaluate(id=>document.getElementById(id).contains(document.activeElement),id);
          check(focused,`${code} destination does not receive keyboard focus`);
          const targetBox=await target.boundingBox(),navBox=await navigation.boundingBox();
          check(targetBox.y>=navBox.y+navBox.height-2&&targetBox.y<height-75,`${code} target is obscured or outside the view at ${width}: ${JSON.stringify({targetBox,navBox})}`);
          check(p.url()===url&&await field('note').inputValue()===`${code}证据定位不丢失的草稿`,`${code} navigation changes scope, issue, or draft`);
          check(await form().locator('> .table-note').first().textContent()===baseline,`${code} navigation rewrites the issue baseline`);
        }
        check(await navigation.evaluate(node=>node.scrollWidth<=node.clientWidth+1),`${code} destination controls overflow`);
        results.push({page:code,width,destinations:buttons.length});
      }
      // Link a sample from a different issue while retaining the actual sample in view.
      await open('D?metric=52&issue=52');await field('note').fill('保留风险核查草稿');
      await p.locator('#D-tab-groups').click();
      await p.getByRole('navigation',{name:'分组证据定位',exact:true}).getByRole('button',{name:'成熟试用记录 · 支付失败样本',exact:true}).click();
      const sampleNode=await p.locator('.trial-samples').elementHandle();
      const before=await p.locator('.trial-samples').boundingBox();
      const sampleButton=await p.locator('.trial-sample-item').first().boundingBox();
      check(sampleButton.y>=0&&sampleButton.y+sampleButton.height<=height,'Sample button is not fully visible before the mouse interaction');
      // Click the visible sample without the automation driver's preliminary scrolling.
      await p.mouse.click(sampleButton.x+sampleButton.width/2,sampleButton.y+sampleButton.height/2);
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const after=await p.locator('.trial-samples').boundingBox();
      if(Math.abs(after.y-before.y)>=2)await p.screenshot({path:'output/playwright/v59-anchor-failure.png'});
      check(Math.abs(after.y-before.y)<2&&after.y<height-75&&after.y+after.height>100,`Linking a sample moves its evidence at ${width}: ${JSON.stringify({before,after})}`);
      check(await field('issueMetric').inputValue()==='18'&&Boolean(await field('linkedSample').inputValue())&&await field('linkedSample').evaluate(n=>document.activeElement===n),'Sample does not link to and focus the trial issue');
      check(await sampleNode.evaluate(node=>node.isConnected)&&new URLSearchParams(p.url().split('?')[1]).get('metric')==='52','Sample registration replaces the evidence or changes its metric');
      check(await p.locator('#D-tab-groups').getAttribute('aria-selected')==='true'&&await form().isVisible(),'Sample linkage loses its evidence or adjacent form');
      const controls=await p.locator('.income-context-controls').boundingBox();
      check(controls.y>=50&&controls.y+controls.height<height,'Sample linkage hides the observation/registration controls behind the page navigation');
      if(width===1600)await p.screenshot({path:'output/playwright/v59-linked-sample.png'});
      await p.locator('.income-context-controls').getByRole('button',{name:'关键观察',exact:true}).click();
      await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
      check(await field('issueMetric').inputValue()==='18'&&Boolean(await field('linkedSample').inputValue()),'Reopening registration loses the replacement issue form');
      await p.locator('.trial-sample-item').first().evaluate(node=>node.focus({preventScroll:true}));
      const beforeKeyboard=await p.locator('.trial-samples').boundingBox();
      await p.locator('.trial-sample-item').first().press('Enter');
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const afterKeyboard=await p.locator('.trial-samples').boundingBox();
      check(Math.abs(afterKeyboard.y-beforeKeyboard.y)<2&&await field('linkedSample').evaluate(node=>document.activeElement===node),'Keyboard sample linkage moves evidence or loses field focus');
      await field('issueMetric').selectOption('52');
      check(await field('note').inputValue()==='保留风险核查草稿','Sample linkage destroys the previous issue draft');
      for(const query of ['', 'country=US&appPlatform=Android&plan=Plus&billingCycle=monthly']) {
        await open(`D?metric=18${query?`&${query}`:''}`);await p.locator('#D-tab-groups').click();
        const chart=p.locator('.period-comparison .detail-chart');await chart.locator('svg').waitFor();
        const actual=await chart.evaluate(node=>{
          const o=echarts.getInstanceByDom(node).getOption(),r=node.getBoundingClientRect();
          const labels=[...node.querySelectorAll('svg text')];
          return {type:o.series[0].type,values:o.series[0].data.map(d=>d.value[0]),axis:[o.xAxis[0].min,o.xAxis[0].max],
            tip:o.tooltip[0].formatter({dataIndex:1}),
            texts:labels.map(t=>t.textContent),clipped:labels.filter(t=>{const b=t.getBoundingClientRect();return b.width&&(b.left<r.left-2||b.right>r.right+2||b.top<r.top-2||b.bottom>r.bottom+2);}).map(t=>t.textContent)};
        });
        const independent=await p.evaluate(async query=>{
          const rows=(await (await fetch('./data/trial-facts.json')).json()).records;
          const params=new URLSearchParams(query),fields={country:'country',appPlatform:'app_platform',plan:'plan',billingCycle:'billing_cycle'};
          const matching=rows.filter(r=>[...params].every(([key,value])=>r[fields[key]]===value));
          return ['previous','current'].map(period=>{const group=matching.filter(r=>r.period===period);return {n:group.filter(r=>r.converted).length,d:group.length};});
        },query);
        check(actual.type==='scatter'&&actual.values.every((v,i)=>Math.abs(v-independent[i].n/independent[i].d*100)<1e-9),'Comparison does not match independently aggregated trial facts');
        check(actual.axis[1]-actual.axis[0]<20&&actual.values.every(v=>v>=actual.axis[0]&&v<=actual.axis[1]),'Comparison uses an unreadable or truncated range');
        check(actual.clipped.length===0,`Comparison labels clipped at ${width}: ${actual.clipped.join(', ')}`);
        check(actual.tip.includes(`${independent[1].n.toLocaleString('zh-CN')}人 / ${independent[1].d.toLocaleString('zh-CN')}人`),'Comparison tooltip omits its own numerator/denominator');
        const panel=p.locator('.period-comparison');
        check((await panel.locator('.chart-scale-note').innerText()).includes('点图使用局部范围'),'Local comparison scale is not disclosed');
        await panel.locator('.chart-data summary').click();
        const rows=await panel.locator('.chart-data tbody tr').allTextContents();
        check(rows.length===2&&rows.every((text,i)=>text.includes(`${(independent[i].n/independent[i].d*100).toFixed(1)}%`)&&text.includes(`${independent[i].d.toLocaleString('zh-CN')}人`)),'Comparison table and point values differ');
        await panel.locator('.chart-data summary').click();
        await p.getByRole('navigation',{name:'分组证据定位',exact:true}).getByRole('button',{name:'成熟试用转正率 · 可比批次',exact:true}).click();
        const point=await chart.evaluate(node=>{const e=echarts.getInstanceByDom(node),o=e.getOption(),r=node.getBoundingClientRect(),xy=e.convertToPixel({seriesIndex:0},o.series[0].data[1].value);return {x:r.left+xy[0],y:r.top+xy[1]};});
        await p.mouse.click(point.x,point.y);
        try {await p.waitForFunction(()=>document.querySelector('.period-comparison .chart-data')?.open);} catch(error) {
          const hit=await p.evaluate(point=>{const n=document.elementFromPoint(point.x,point.y);return {tag:n?.tagName,cls:n?.getAttribute('class'),nav:n?.closest('nav')?.className,point};},point);
          await p.screenshot({path:'output/playwright/v59-point-failure.png'});
          throw new Error(`Point selection fails at ${width} ${query}: ${JSON.stringify(hit)}; ${error.message}`);
        }
        check((await panel.locator('.chart-selected').innerText()).includes('近3个成熟周'),'Point click does not reveal the matching table row');
        check(p.url().includes('panel=groups')&&!p.url().includes('issue='),'Point selection changes issue or filters');
        results.push({page:'D-comparison',width,query,values:actual.values,axis:actual.axis});
      }
    }
    // A missing/small preceding cohort must not become a fabricated zero point.
    await p.route('**/data/trial-facts.json',async route=>{
      const response=await route.fetch(),json=await response.json();
      const previous=json.records.filter(r=>r.period==='previous').slice(0,29);
      json.records=[...previous,...json.records.filter(r=>r.period==='current')];
      await route.fulfill({response,json});
    });
    await open('D?metric=18&panel=groups');await p.reload();await p.locator('.period-comparison svg').waitFor();
    const sparse=await p.locator('.period-comparison .detail-chart').evaluate(node=>({data:echarts.getInstanceByDom(node).getOption().series[0].data.map(d=>d.value[0]),text:node.textContent}));
    check(sparse.data[0]===null&&Number.isFinite(sparse.data[1])&&!sparse.text.includes('0.0%'),'Small preceding cohort becomes a zero-valued comparison');
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Evidence localization introduces page-wide overflow');
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:['keyboard evidence destinations','unobscured target headings','preserved issue draft and baseline','independent period aggregates','focused point scales','numerator/denominator tooltips and tables','real point-to-row interaction','small-cohort suppression','sample stays beside its own registration','previous issue draft retained','three desktop sizes'],results};
  } finally {await context.close();}
}
