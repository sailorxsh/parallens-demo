import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),file=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
const aliases={'metric-catalog':'catalog','metric-values':'metrics','filter-contract':'contract','filter-policy':'filterPolicy','filter-slices':'slices'};
const names=['metric-catalog','metric-values','weekly','snapshot','stories','diagnostics','filter-contract','filter-policy','filter-slices','trial-facts','model-market','metric-trends','entity-samples','function-usage','inactivity-cohorts','technical-facts','subscription-flow','binding-device-facts','device-activity-facts','onboarding-duration-facts','device-retention-facts','monthly-renewal-facts','activity-window-facts'];
const fixtures=Object.fromEntries(names.map(n=>[aliases[n]??n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),file(n)]));
const core=file('route-core'),home=file('route-home'),hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app.js'))).update(Buffer.concat(names.map(n=>fs.readFileSync(path.join(root,'data',n+'.json'))))).digest('hex');
assert.equal(core.revision,hash);assert.equal(home.revision,hash);
const app=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/\nstart\(\);\s*$/,'\n');
const make=()=>{const c=vm.createContext({document:{documentElement:{},querySelector:()=>null},getComputedStyle:()=>({fontSize:'16px'}),window:{addEventListener:()=>{},removeEventListener:()=>{}},localStorage:{getItem:()=>null},URLSearchParams,location:{hash:''},console});vm.runInContext(app,c);return c;};
const full=make(),lazy=make(),run=(c,s)=>vm.runInContext(s,c),plain=x=>JSON.parse(JSON.stringify(x));
full.fixture=fixtures;run(full,'sourceData=fixture');lazy.core=core;lazy.home=home;run(lazy,'routeCore=core;sourceData=structuredCore=JSON.parse(JSON.stringify(core.sources));preparedRoutes.set("",home);activateRouteData("")');
let checks=0;
const states=Object.keys(home.scopes).map(key=>Object.fromEntries(key.split('|').map((v,i)=>[['country','productLine','appPlatform'][i],v]).filter(([,v])=>v)));
for(const state of states){
 run(full,`filterState=${JSON.stringify(state)};projectDataset()`);run(lazy,`filterState=${JSON.stringify(state)};projectDataset()`);
 for(const id of [2,3,4,5,9,11,13,15,18,21,22,23,29,34,41,42,48,49,52,54]){
  assert.deepEqual(plain(run(lazy,`metric(${id})`)),plain(run(full,`metric(${id})`)),`Home metric #${id} ${JSON.stringify(state)}`);checks++;
 }
 for(const id of [2,3,4,9,11,13,18,23,34])assert.deepEqual(plain(run(lazy,`metricHistory(${id})`)),plain(run(full,`metricHistory(${id})`)));
 for(const id of [13,18,42])assert.deepEqual(plain(run(lazy,`weeklyRateComparison(${id})`)),plain(run(full,`weeklyRateComparison(${id})`)));
}
for(const page of 'ABCDEFG'){
 const part=file('route-'+page);assert.equal(part.revision,hash);lazy.part=part;run(lazy,`sourceData=JSON.parse(JSON.stringify(core.sources));preparedRoutes.set('${page}',part);activeDataPage=undefined;location.hash='#/${page}';activateRouteData('${page}')`);
 for(const state of states){
  run(full,`filterState=${JSON.stringify(state)};projectDataset()`);run(lazy,`filterState=${JSON.stringify(state)};projectDataset()`);
  for(const id of core.metricIds[page]){assert.deepEqual(plain(run(lazy,`metric(${id})`)),plain(run(full,`metric(${id})`)),`${page} #${id} ${JSON.stringify(state)}`);checks++;}
 }
}
// The option index must be exactly what the full validated source exposes.
for(const[page,key]of[['B','userCohort'],['D','riskSnapshot'],['F','unbindingMonth'],['D','renewalMonth'],['B','retentionMonth'],['C','activationCohort']])assert.deepEqual(core.options[key],plain(run(full,`availableOptions('${page}','${key}')`)));
console.log(`PASS route source equivalence: ${checks} metric/scope values, 45 home histories/comparisons, 7 isolated topics and saved-scope option index.`);
