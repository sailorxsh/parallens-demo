// Regression for the approved first-screen comparisons: exact units, comparison periods and unavailable states.
async parent=>{
 const base=new URL('.',parent.url()).href,context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage();
 const expected={
  "A": [
    "+60人 · 较 W11",
    "下降不足 0.1 个百分点 · 较 W11",
    "+90台 · 较 2026-09-07"
  ],
  "B": [
    "+73人 · 较 2026-09-23",
    "+5.1 个百分点 · 较 2026-07",
    "下降不足 0.1 个百分点 · 较 2026-09-23"
  ],
  "C": [
    "+0.2 个百分点 · 较 9/17",
    "持平 · 较 W11"
  ],
  "D": [
    "+50人 · 较 9/17",
    "持平 · 较 W11",
    "-0.5 个百分点 · 较 2026-07"
  ],
  "E": [
    "+50人 · 较 9/17",
    "+$0.10/人 · 较 2026-07"
  ],
  "F": [
    "+0.2 个百分点 · 较 9/17",
    "+0.2 个百分点 · 较 9/17"
  ],
  "G": [
    "+2条 · 较 2026-09-23",
    "+0.1 个百分点 · 较 2026-09-22"
  ]
};
 const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 const open=async hash=>{await p.goto('about:blank');await p.goto(base+'#/'+hash);await ready();};
 const results=[];try{
 for(const page of'ABCDEFG'){
  await open(page);const actual=await p.locator('.topic-highlight-comparison').allTextContents();if(JSON.stringify(actual)!==JSON.stringify(expected[page]))throw Error('First-screen comparison units or dates changed '+page+' '+JSON.stringify(actual));results.push({page,comparisons:actual.length});
 }
 await open('B?retentionMonth=2026-07');if(await p.locator('#topic-highlight-B-24 .topic-highlight-comparison').innerText()!=='+1.0 个百分点 · 较 2026-06')throw Error('Selected retention month compared to wrong month');
 await open('A?week=1');if(await p.locator('#topic-highlight-A-9 .topic-highlight-comparison').count())throw Error('First week invents a comparator');
 await open('B?deviceModel=K6');if(await p.locator('#topic-highlight-B-4 .topic-highlight-comparison').count())throw Error('Missing attribution fabricates a comparison');
 await open('C');if(await p.locator('#topic-highlight-C-46 .topic-highlight-comparison').count())throw Error('Changing minimum chain treated as a single comparable chain');
 await open('E?country=US');const link=p.locator('#topic-highlight-E-35');await link.focus();await p.keyboard.press('Enter');await ready();if(!p.url().includes('metric=35')||!p.url().includes('country=US'))throw Error('Comparison entry loses scope');await p.goBack();await ready();if(!await p.locator('#topic-highlight-E-35').isVisible())throw Error('Back loses summary');
 return{status:'PASS',results,selectedMonth:true,missingComparator:true,changingMinimumOmitted:true,keyboardScopeAndBack:true};
 }finally{await context.close()}
}
