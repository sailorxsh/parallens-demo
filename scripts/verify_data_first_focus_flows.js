// An explicit data-first choice should take keyboard and visual reading to the data.
async(parent)=>{
 const browser=parent.context().browser(),engine=browser.browserType().name(),base=new URL('.',parent.url()).href,results=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 for(const [width,height,font] of [[1366,768,16],[1600,900,16],[1920,1080,16],[1366,768,32]])for(const outcome of ['abort','continue']){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),p=await context.newPage();let release;const gate=new Promise(r=>release=r);p.on('pageerror',e=>errors.push(e.message));
  try{
   await p.route('**/vendor/echarts.min.js*',async r=>{await gate;await r[outcome]();});
   await p.goto(base+(width===1600?'#/?country=US':''),{waitUntil:'commit'});
   const choice=p.getByRole('button',{name:'先查看数据表',exact:true});await choice.waitFor();await p.evaluate(size=>document.documentElement.style.fontSize=size+'px',font);
   const initialUrl=p.url();await choice.focus();await p.keyboard.press('Enter');
   await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'),{},{polling:50});
   const state=await p.evaluate(()=>{const summary=document.querySelector('.trend-table-wrap summary'),row=document.querySelector('.trend-table-wrap tbody tr');return {focused:document.activeElement===summary,open:summary.parentElement.open,rows:summary.parentElement.querySelectorAll('tbody tr').length,summaryTop:summary.getBoundingClientRect().top,firstRowBottom:row.getBoundingClientRect().bottom,height:innerHeight,scrollY,announcement:document.querySelector('#announcement').textContent};});
   check(state.focused&&state.open,'Data-first choice leaves focus outside its opened evidence');
   check(state.summaryTop>=0&&state.firstRowBottom<=height,'Data-first choice hides summary or first row outside viewport');
   check(state.rows===12&&p.url()===initialUrl&&state.announcement.includes('已打开近12周趋势数据表'),'Choice changes evidence, route or gives no completion feedback');
   await p.keyboard.press('Space');check(!await p.locator('.trend-table-wrap').evaluate(n=>n.open),'Native focused summary cannot collapse');await p.keyboard.press('Enter');check(await p.locator('.trend-table-wrap').evaluate(n=>n.open),'Native summary cannot reopen');
   if(outcome==='continue')await p.keyboard.press('Tab');
   const before=await p.evaluate(()=>{window.__dataFirstFocus=document.activeElement;window.__dataFirstResults=document.querySelector('.home-results');return {top:scrollY,activeTag:document.activeElement.tagName};});
   release();await p.waitForLoadState('domcontentloaded');await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   check(await p.evaluate(()=>window.__dataFirstFocus===document.activeElement&&window.__dataFirstResults===document.querySelector('.home-results')),'Late library arrival steals focus or replaces the working page');
   check(Math.abs((await p.evaluate(()=>scrollY))-before.top)<=2,'Late library arrival moves the reading position');
   check(await p.locator('.trend-table-wrap').evaluate(n=>n.open)&&await p.locator('.trend-table-wrap tbody tr').count()===12,'Late outcome closes or loses evidence');
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Data-first focus introduces horizontal overflow');
   if(outcome==='abort'&&(width===1366||width===1600))await p.screenshot({path:`output/playwright/v148-audit/${engine}-data-first-focus-${width}-${font}.png`});
   results.push({width,height,font,outcome,state,lateFocus:before.activeTag});
  }finally{release();await p.waitForLoadState('domcontentloaded').catch(()=>{});await context.close();}
 }
 const normal=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),page=await normal.newPage();
 try{await page.goto(base);await page.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));check(await page.evaluate(()=>document.activeElement===document.querySelector('#main')&&scrollY===0),'Normal chart-ready startup is diverted to data-first evidence');results.push({kind:'normal chart-ready startup',mainFocused:true,top:0});}finally{await normal.close();}
 check(!errors.length,errors.join(';'));return {status:'PASS',checks:['explicit choice focuses and reveals table','native Space and Enter toggle','unchanged 12 source rows and route','three desktop widths and 200% text','late success/failure preserves focus and reading','user Tab navigation is not undone','no replacement, overflow or runtime errors'],results};
}
