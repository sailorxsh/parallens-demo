// Native Chrome page zoom in a disposable profile; never uses the user's browser profile.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'parallens-native-zoom-')),dir='output/playwright/v194-zoom';fs.mkdirSync(dir,{recursive:true});
 const c=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1600,height:1000},reducedMotion:'reduce'});
 const results=[],errors=[],check=(ok,msg)=>{if(!ok)throw Error(msg);};
 try{
  const settings=await c.newPage();await settings.goto('chrome://settings/appearance');
  const p=await c.newPage(),cdp=await c.newCDPSession(p);const capture=async name=>{const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});fs.writeFileSync(`${dir}/${name}.png`,Buffer.from(shot.data,'base64'));};p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});};
  const open=async hash=>{await p.goto('http://127.0.0.1:8765/#/'+hash);await ready();};
  const geometry=()=>p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,root:getComputedStyle(document.documentElement).fontSize,overflow:document.documentElement.scrollWidth>innerWidth+1}));
  await open('D');const before=await geometry();await settings.locator('#zoomLevel').selectOption('2');await p.reload();await ready();const after=await geometry();
  check(await settings.locator('#zoomLevel').inputValue()==='2'&&after.width===before.width/2&&after.dpr===before.dpr*2&&after.root===before.root,'Native page zoom not verified');
  for(const width of [1366,1600,1920]){
   await p.setViewportSize({width,height:1000});await open('');check(!(await geometry()).overflow,'Home overflow '+width);
   for(const [code,id]of Object.entries({A:13,B:25,C:42,D:18,E:35,F:48,G:54})){
    await open(code);const box=await geometry();check(box.width===width/2&&!box.overflow,'Overview overflow '+code+width);
    const trigger=p.locator(`#topic-${code}-metric-${id} .definition-trigger`);await trigger.focus();await p.keyboard.press('Enter');
    check(await p.locator('#metric-definition-popover').isVisible(),'Definition hidden');
    const popup=await p.locator('#metric-definition-popover').evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};});
    check(popup.left>=-1&&popup.right<=popup.width+1&&popup.top>=-1&&popup.bottom<=popup.height+1,'Definition clipped '+code+width+' '+JSON.stringify(popup));
    await p.keyboard.press('Escape');check(await trigger.evaluate(n=>document.activeElement===n),'Definition focus lost');
    const values=p.locator(`#topic-${code}-metric-${id} .metric-secondary-values`);
    if(await values.count()&&await values.locator(':scope > div').count()===1){const single=await values.evaluate(n=>({width:n.clientWidth,child:n.firstElementChild.getBoundingClientRect().width}));check(Math.abs(single.width-single.child)<2,'Single value wastes half card width');}
    const entry=p.locator(`#topic-open-${code}-${id}`);await entry.focus();await p.keyboard.press('Enter');await ready();
    check(await p.locator(`#metric-evidence-${id}`).count()===1&&!(await geometry()).overflow,'Diagnosis missing or overflowing '+code+width);
    for(const tab of ['groups','data','change']){const button=p.locator(`#${code}-tab-${tab}`);await button.focus();await p.keyboard.press('Enter');check(await button.getAttribute('aria-selected')==='true','Evidence tab keyboard failed');}
    const back=p.locator('.topic-return');await back.focus();await p.keyboard.press('Enter');await ready();check(await p.locator(`#topic-open-${code}-${id}`).evaluate(n=>n===document.activeElement),'Return focus failed');
    if(width===1600){await p.locator(`#topic-${code}-metric-${id}`).scrollIntoViewIfNeeded();await capture(`overview-${code}`);}results.push({width,code,id,...box,keyboard:true,popup});
   }
  }
  await p.setViewportSize({width:1366,height:1000});await open('D?metric=18&issue=18');
  const form=p.locator('.action-record');await form.locator('[name=owner]').fill('200%缩放独立验收');await form.locator('[name=note]').fill('测试配置内的草稿');
  await form.getByRole('button',{name:'保存本地记录',exact:true}).click();check(await p.evaluate(()=>!!localStorage.getItem(ACTION_STORAGE_KEY)),'Record not saved');check(!(await geometry()).overflow,'Registration overflow');await form.scrollIntoViewIfNeeded();await capture('registration');
  check(!errors.length,errors.join(';'));fs.writeFileSync(`${dir}/verification.json`,JSON.stringify({status:'PASS',browser:await c.browser().version(),before,after,results,registration:true,errors},null,2));console.log('PASS native 200% zoom: 21 topic states, home, keyboard definitions/tabs/return, isolated registration');
 }catch(e){fs.writeFileSync(`${dir}/verification.json`,JSON.stringify({status:'FAIL',error:e.stack,results,errors},null,2));throw e;}
 finally{await c.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
