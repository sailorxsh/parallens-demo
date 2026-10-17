// Independently reconcile the homepage clue with filtered records and its destination chart.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),states=[],errors=[];
  const records=JSON.parse(fs.readFileSync('data/trial-facts.json','utf8')).records;
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  p.on('pageerror',error=>errors.push(error.message));
  const fields={country:'country',appPlatform:'app_platform',productLine:'product_line',plan:'plan',billingCycle:'billing_cycle',subscriptionPlatform:'subscription_platform'};
  const expected=filters=>{
    if(Object.keys(filters).some(key=>!fields[key]))return null;
    const rows=records.filter(row=>Object.entries(filters).every(([key,value])=>row[fields[key]]===value));
    const periods=['previous','current'].map(period=>rows.filter(row=>row.period===period));
    if(periods.some(rows=>rows.length<30))return null;
    const target=row=>row.product_line==='Bird'&&row.app_platform==='Android'&&row.plan==='Plus'&&row.billing_cycle==='monthly';
    const groups=[{name:'观鸟 Android Plus月付',matches:target},{name:'其他成熟试用',matches:row=>!target(row)}]
      .map(group=>({...group,rows:periods.map(rows=>rows.filter(group.matches))})).filter(group=>group.rows.some(rows=>rows.length));
    if(groups.some(group=>group.rows.some(rows=>rows.length<30)))return null;
    const converted=rows=>rows.filter(row=>row.converted).length;
    const delta=(converted(periods[1])/periods[1].length-converted(periods[0])/periods[0].length)*100;
    if(Math.abs(delta)<.05)return null;
    const changes=groups.map(group=>(converted(group.rows[1])/periods[1].length-converted(group.rows[0])/periods[0].length)*100);
    const leader=changes.map((value,index)=>({value,index})).filter(item=>item.value*delta>0).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value))[0];
    return leader?{name:groups[leader.index].name,value:leader.value,changes,labels:groups.map(group=>group.name),delta}:null;
  };
  const open=async filters=>{
    const query=new URLSearchParams(filters).toString();await p.goto(`${base}#/${query?'?'+query:''}`);
    await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
  };
  const cases=[{}, {country:'US'},{country:'UK'},{country:'DE'},{country:'Other'},
    {appPlatform:'Android'},{appPlatform:'iOS'},{productLine:'Bird'},{productLine:'Hunting'},
    {appPlatform:'Android',productLine:'Bird'}, {appPlatform:'Android',country:'Other',productLine:'Bird'},
    {country:'FR'}];
  try{
    for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
      await p.setViewportSize({width,height:1000});await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);
      for(const filters of cases){
        await open(filters);const signal=p.locator('.home-signal[data-metric-id="18"]');
        if(await signal.count())await signal.click();
        const text=await p.locator('.signal-explanation').allTextContents(),clue=expected(filters),copy=text.join(' ');
        if(clue){
          const signed=`${clue.value<0?'−':'+'}${Math.abs(clue.value).toFixed(2)} 个百分点`;
          check(copy.includes(clue.name)&&copy.includes(signed)&&copy.includes('数学分解，不证明因果'),`Wrong homepage contribution: ${JSON.stringify(filters)} ${copy}`);
          const remainder=clue.changes.reduce((sum,value)=>sum+value,0)-clue.value;
          if(Math.abs(remainder)>=.005)check(copy.includes(`其余合计 ${remainder<0?'−':'+'}${Math.abs(remainder).toFixed(2)} 个百分点`),'A leading contribution hides the other group contribution');
          await p.locator('.home-comparison-context .insight-link').click();
          const plot=p.locator('#D-panel-groups .evidence-pair').filter({has:p.getByRole('heading',{name:'转正率变化 · 互斥分组贡献',exact:true})}).locator('.detail-chart');
          await plot.locator('svg').waitFor();
          const chart=await plot.evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {labels:o.xAxis[0].data,values:o.series[0].data.map(v=>typeof v==='number'?v:v.value)};});
          check(JSON.stringify(chart.labels)===JSON.stringify(clue.labels)&&chart.values.every((v,i)=>Math.abs(v-clue.changes[i])<1e-8),'Destination contribution differs from independently filtered records');
          for(const [key,value] of Object.entries(filters))check(new URLSearchParams(p.url().split('?')[1]).get(key)===value,'Contribution link drops its filter');
          await p.goBack();await p.locator('.home-results').waitFor();
          check((await p.locator('.signal-explanation').innerText())===copy,'Back replaces the original clue or its scope');
        }else check(!copy.includes('对本次变化贡献'),`Invalid, stable or low-sample scope claims a contribution: ${JSON.stringify(filters)} ${copy}`);
        check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Homepage clue causes horizontal overflow');
        check(await p.locator('.signal-explanation').evaluateAll(nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight+1)),'Homepage observation is clipped');
        states.push({width,size,filters,clue:clue?{name:clue.name,value:clue.value}:null,text});
      }
    }
    await p.evaluate(()=>document.documentElement.style.fontSize='');await open({});
    await p.locator('.home-signal[data-metric-id="13"]').click();
    check((await p.locator('.signal-explanation').innerText()).includes('优先核对分组差异及成熟注册批次')&&
      !(await p.locator('.signal-explanation').innerText()).includes('对本次变化贡献'),'Activation inherits an unrelated trial explanation');
    await p.locator('.trend-overview').click();
    check(!(await p.locator('.home-comparison-context').innerText()).includes('对本次变化贡献'),'Parallel comparison retains a stale group clue');
    check(!errors.length,errors.join('; '));
    return {status:'PASS',checks:['independent filtered records','same contribution and categories in destination chart','filter and back continuity',
      'no strong clue for low samples, stable groups or invalid country','three desktop widths and 200% text',
      'activation and parallel comparison clear unrelated clues','no runtime errors'],states};
  }finally{await context.close();}
}
