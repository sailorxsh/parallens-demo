import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const prefix=fs.readFileSync('scripts/verify_projection.mjs','utf8').split('// Device counts,')[0].replaceAll("import.meta.dirname", "process.cwd()+'/scripts'");
// Reuse the existing fixture loader, not its projection assertions.
const body=prefix.replace(/^import .*$/gm,'').replace("const root=path.resolve(process.cwd()+'/scripts','..');","const root=process.cwd();");
const path=await import('node:path');eval('');
const sandbox={fs,path,vm,console,process,URLSearchParams};vm.createContext(sandbox);
vm.runInContext(body+`\nglobalThis.testRuntime={project,evaluate,fixtures};`,sandbox);
const {project,evaluate,fixtures}=sandbox.testRuntime,out=[];
for(const country of['','US','UK','DE','Other'])for(const appPlatform of['','iOS','Android'])for(const anomalyType of['','Business','Device','Quality']){
 const filters=Object.fromEntries(Object.entries({country,appPlatform,anomalyType}).filter(([,v])=>v));const m=project(filters).m53,p=evaluate('anomalyProjection()');assert.equal(m.kind,'count');assert.equal(m.value,p.current.count);assert.deepEqual(Array.from(evaluate('metricHistory(53).values')),Array.from(p.rows,r=>r.count));out.push({filters,rows:JSON.parse(JSON.stringify(p.rows.map(w=>({start:w.startInclusive,end:w.endExclusive,ids:w.events.map(e=>e.id)}))))});
}
for(const key of['deviceModel','productLine','deviceStatus','firmware','season']){project({[key]:key==='deviceModel'?'K6':key==='productLine'?'Bird':key==='deviceStatus'?'Effective':key==='firmware'?'2.8':'Migration'});assert.equal(evaluate('metric(53).availability'),'pending');assert.equal(evaluate('metricHistory(53)'),null);}
project({});assert.equal(evaluate('metric(53).value'),7);assert.equal(project({country:'US'}).m53.value,3);project({});
const mutations=[
 's.events[0].id=s.events[1].id','s.events[0].country=null','s.events[0].observedAt="2026-02-30T10:00:00Z"',
 's.windows[0].eventIds.push(s.windows[1].eventIds[0])','s.windows[0].eventIds.pop()','s.windows.pop()',
 's.events.at(-1).observedAt=s.asOf','s.windows[0].startInclusive=s.windows[0].endExclusive',
 's.events[0].evidence.metricId=999','s.events[0].affectedCount=0','s.events[0].appPlatform=null','s.events[0].anomalyType="Unknown"'];
for(const mutation of mutations){evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures));{const s=sourceData.diagnostics.G.anomalyEvents;'+mutation+'}');project({});assert.equal(evaluate('metric(53).availability'),'pending',mutation);assert.equal(evaluate('metricHistory(53)'),null);assert.equal(evaluate('metric(54).kind'),'group');}
evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures));{const s=sourceData.diagnostics.G.anomalyEvents;s.events=[];s.windows.forEach(w=>w.eventIds=[])}');project({});assert.equal(evaluate('metric(53).value'),0);assert.ok(evaluate('metricHistory(53).values.every(v=>v===0)'));
evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures));{const s=sourceData.diagnostics.G.anomalyEvents;const w=s.windows.at(-1);s.events.find(e=>e.id===w.eventIds[0]).observedAt=w.startInclusive}');project({});assert.equal(evaluate('metric(53).value'),7);
evaluate('sourceData=JSON.parse(JSON.stringify(__fixtures))');project({});const baseline=evaluate('actionBaselineValue(53)'),window=evaluate('actionBaselineWindow(53)');assert.equal(evaluate('baselineWindowEnd(actionBaselineWindow(53))'),'2026-09-24');
evaluate('sourceData.diagnostics.G.anomalyEvents.events.at(-1).status="另一个待核验状态"');project({});assert.equal(evaluate('metric(53).value'),7);assert.notEqual(evaluate('actionBaselineValue(53)'),baseline);assert.equal(evaluate('actionBaselineWindow(53)'),window);
console.log(JSON.stringify({status:'PASS',scopes:out,faults:mutations.length,knownZero:true,leftBoundary:true,rightBoundary:true,sameCountChange:true}));
