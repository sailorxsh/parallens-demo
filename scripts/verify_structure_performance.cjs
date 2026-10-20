// Controlled local comparison. Fresh browser context per run; alternate version order.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const before=process.argv[2],after=process.argv[3],output=process.argv[4];
if(!before||!after||!output)throw Error('Usage: node verify_structure_performance.cjs BEFORE_URL AFTER_URL OUTPUT_JSON');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
(async()=>{
 const browser=await chromium.launch({channel:'chrome'}),runs=[],errors=[];
 const ready=async page=>{await page.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false] h1'));await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});};
 try{
  for(const code of 'ABCDEFG')for(let round=0;round<5;round++)for(const version of round%2?['after','before']:['before','after']){
   const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push({code,version,message:e.message}));
   try{
    const start=performance.now();await page.goto((version==='before'?before:after)+'#/'+code);await ready(page);const first=performance.now()-start;
    const facts=await page.evaluate(()=>({heading:document.querySelector('h1').textContent,charts:document.querySelectorAll('[_echarts_instance_]').length,transfer:performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0),renderedMetrics:document.querySelectorAll('.topic-metric').length}));
    const details=page.locator('.filter-bar');if(await details.evaluate(n=>n.tagName==='DETAILS'&&!n.open))await details.locator(':scope > summary').click();
    await page.getByLabel('国家/市场',{exact:true}).evaluate(n=>n.addEventListener('change',()=>window.__filterStarted=performance.now(),{once:true,capture:true}));
    await page.getByLabel('国家/市场',{exact:true}).selectOption('US');await ready(page);
    const response=await page.evaluate(()=>{if(filterState.country!=='US')throw Error('Filter did not apply');return performance.now()-window.__filterStarted;});
    if(!Number.isFinite(response))throw Error('No filter change event');
    runs.push({code,round,version,first,response,...facts});
   }finally{await context.close();}
   fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({status:'RUNNING',runs},null,2));
  }
  const comparison=[...'ABCDEFG'].map(code=>{const stats={};for(const key of ['first','response','charts','transfer']){const a=median(runs.filter(r=>r.code===code&&r.version==='before').map(r=>r[key])),b=median(runs.filter(r=>r.code===code&&r.version==='after').map(r=>r[key]));stats[key]={before:a,after:b,pass:!['first','response'].includes(key)||b-a<=Math.max(a*.1,100)};}return {code,...stats};});
  const status=!errors.length&&comparison.every(r=>r.first.pass&&r.response.pass)?'PASS':'FAIL';
  fs.writeFileSync(output,JSON.stringify({status,environment:{browser:await browser.version(),viewport:'1600x1000',reducedMotion:true,cache:'fresh context per run',order:'alternating before/after',runsPerPagePerVersion:5,network:'unthrottled localhost',threshold:'median regression <= max(before*0.1,100ms)',timing:'navigation to ready + fonts + two frames; native select change to ready + two frames'},comparison,runs,errors},null,2));
  console.log(JSON.stringify({status,comparison,errors},null,2));if(status==='FAIL')process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
