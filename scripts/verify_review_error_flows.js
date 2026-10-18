// Required-state changes must not leave stale errors or replace field guidance with save status.
async(parent)=>{
  const base=new URL('.',parent.url()).href;
  const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage(),states=[],errors=[];
  p.on('pageerror',error=>errors.push(error.message));
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const fields=['target','reviewValue','reviewedAt'];
  const form=()=>p.locator('.action-record'),input=name=>form().locator(`[name=${name}]`);
  const read=()=>form().evaluate(n=>({receipt:n.querySelector('.action-receipt').textContent,
    fields:[...n.querySelectorAll('[name=target],[name=reviewValue],[name=reviewedAt]')].map(control=>{
      const id=control.getAttribute('aria-describedby'),error=id&&document.getElementById(id);
      return {name:control.name,required:control.required,valid:control.validity.valid,
        invalid:control.getAttribute('aria-invalid'),description:error?.textContent??'',
        errorVisible:!!error&&error.classList.contains('action-field-error')&&!error.hidden};
    })}));
  const save=()=>form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  const stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
  const open=async()=>{
    await p.goto(`${base}#/D?metric=18&issue=18`);
    await p.waitForFunction(()=>typeof lastRenderedHash!=='undefined'&&lastRenderedHash===location.hash&&
      document.querySelector('#main')?.getAttribute('aria-busy')==='false');await form().waitFor();
  };
  try {
    for(const width of [1366,1600,1920]) {
      await p.setViewportSize({width,height:1000});await open();
      // A same-URL navigation can reuse the document; reset this test browser and its in-memory records.
      await p.evaluate(()=>localStorage.removeItem('parallens-demo-actions-v1'));
      await p.reload();await form().waitFor();
      await input('status').selectOption('verified');
      check(await form().locator('.action-field-error:not([hidden])').count()===0,'Errors appear before a failed submission');
      await input('target').fill('  ');await save();
      const submitted=await read();
      check(submitted.fields.every(f=>f.invalid==='true'&&f.errorVisible&&!f.valid),`Whitespace/missing review fields are not identified at ${width}: ${JSON.stringify(submitted)}`);
      check(new Set(submitted.fields.map(f=>f.description)).size===3,'Fields share a generic or unrelated description');
      check(await input('target').evaluate(n=>document.activeElement===n),'Focus does not identify the first error');
      const before=await stored();
      await input('target').fill('转正率至少45%');await input('note').fill('先核对分组证据');
      const partial=await read();
      check(partial.fields[0].invalid===null&&partial.fields[0].valid,'Corrected field keeps an error');
      check(partial.fields.slice(1).every((f,index)=>f.invalid==='true'&&f.description===submitted.fields[index+1].description),
        'Editing one field or the note overwrites remaining error guidance');
      if(width===1366) {
        for(const size of [24,32,16]) {
          await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);
          await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          check(await form().evaluate(n=>document.documentElement.scrollWidth<=innerWidth+1&&
            [...n.querySelectorAll('.action-field-error:not([hidden])')].every(error=>{
              const r=error.getBoundingClientRect(),f=error.parentElement.getBoundingClientRect();
              return r.left>=f.left-1&&r.right<=f.right+1&&error.scrollWidth<=error.clientWidth+1;
            })),'Inline error text overflows when desktop text is enlarged');
        }
      }
      await input('status').selectOption('pending');
      const optional=await read();
      check(optional.fields.every(f=>!f.required&&f.valid&&f.invalid===null&&!f.errorVisible),
        'Optional review fields retain native/custom or accessibility errors');
      await input('owner').fill(`核查-${width}`);await input('owner').focus();await p.keyboard.press('Enter');
      check(await form().locator('.action-receipt').getAttribute('data-state')==='saved','Keyboard save of pending record is rejected');
      let records=JSON.parse(await stored()),record=Object.values(records).find(r=>r.evidenceId===18);
      const baseline=record.baseline;
      await input('status').selectOption('verified');await input('reviewValue').fill('434/1000');
      const today=await input('reviewedAt').getAttribute('max'),future=new Date(`${today}T12:00:00Z`);
      future.setUTCDate(future.getUTCDate()+1);await input('reviewedAt').fill(future.toISOString().slice(0,10));
      const saved=await stored();await save();
      check((await read()).fields[2].description==='实际复查日不能晚于今天','Future review date lacks a specific error');
      check(await stored()===saved,'Invalid future review changes stored records');
      await input('status').selectOption('pending');
      check((await read()).fields[2].invalid==='true','Changing required state hides a still-invalid future date');
      await input('reviewedAt').fill(today);await input('status').selectOption('verified');await save();
      records=JSON.parse(await stored());record=Object.values(records).find(r=>r.evidenceId===18);
      check(record.status==='verified'&&record.baseline===baseline,'Valid review changes the historical baseline or is not saved');
      await p.reload();await form().waitFor();
      check(await input('status').inputValue()==='verified'&&await form().locator('[aria-invalid=true]').count()===0,
        'Reload restores stale errors instead of the saved review');
      check(await p.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return new Set(ids).size===ids.length;}),'Form field/error IDs collide');
      states.push({width,submitted,partial,optional,before});
    }
    check(errors.length===0,errors.join('; '));
    return {status:'PASS',checks:['three desktop widths','no premature errors','per-field error guidance','partial correction preserves other errors',
      'required-state changes clear obsolete errors','150/200% text containment','keyboard save','future date remains invalid',
      'failed save preserves stored state','valid review and reload retain baseline','unique field/error IDs','no runtime errors'],states};
  } finally {await context.close();}
}
