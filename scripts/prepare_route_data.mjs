// Compile route read models from the same validated functions used by the dashboard.
// No facts, filter shares, metric definitions or historical records are rewritten.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const names=['metric-catalog','metric-values','weekly','snapshot','stories','diagnostics','filter-contract','filter-policy','filter-slices','trial-facts','model-market','metric-trends','entity-samples','function-usage','inactivity-cohorts','technical-facts','subscription-flow','binding-device-facts','device-activity-facts','onboarding-duration-facts','device-retention-facts','monthly-renewal-facts','activity-window-facts'];
const aliases={ 'metric-catalog':'catalog','metric-values':'metrics','filter-contract':'contract','filter-policy':'filterPolicy','filter-slices':'slices'};
const key=name=>aliases[name]??name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
const bytes=names.map(name=>fs.readFileSync(path.join(root,'data',`${name}.json`)));
const source=Object.fromEntries(names.map((name,i)=>[key(name),JSON.parse(bytes[i])]));
const revision=crypto.createHash('sha256').update(app).update(Buffer.concat(bytes)).digest('hex');
const context=vm.createContext({__fixtures:source,document:{documentElement:{},querySelector:()=>null},getComputedStyle:()=>({fontSize:'16px'}),window:{addEventListener:()=>{},removeEventListener:()=>{}},localStorage:{getItem:()=>null},URLSearchParams,location:{hash:''},console});
vm.runInContext(app.replace(/\nstart\(\);\s*$/,'\n'),context,{filename:'app.js'});
const run=code=>vm.runInContext(code,context),plain=value=>JSON.parse(JSON.stringify(value));
run('sourceData=__fixtures;projectDataset()');
const ids=plain(run('Object.fromEntries(Object.keys(pages).map(page=>[page,[...new Set([...sourceData.catalog.filter(c=>c.page===page).map(c=>c.id),...primaryHeroIds[page],...sourceData.diagnostics[page].heroIds,2,5,6,21])]]))'));
const homeIds=[2,3,4,5,9,11,13,15,18,21,22,23,29,34,41,42,48,49,52,54];
const home={version:1,revision,page:'',scopes:{}};
for(const country of ['',...source.filterPolicy.controls.country.options])
for(const productLine of ['',...source.filterPolicy.controls.productLine.options])
for(const appPlatform of ['',...source.filterPolicy.controls.appPlatform.options]) {
  const state=Object.fromEntries(Object.entries({country,productLine,appPlatform}).filter(([,v])=>v&&v!=='All'));
  run(`filterState=${JSON.stringify(state)};projectDataset()`);
  const scope=plain(run(`({metrics:Object.fromEntries(${JSON.stringify(homeIds)}.map(id=>['m'+String(id).padStart(2,'0'),metric(id)])),
    histories:Object.fromEntries(${JSON.stringify(homeIds)}.map(id=>[id,metricHistory(id)])),
    trends:Object.fromEntries(${JSON.stringify(homeIds)}.map(id=>[id,trendValues(id)])),
    details:Object.fromEntries([13,18,42].map(id=>[id,weeklyRateDetails(id)])),
    comparisons:Object.fromEntries([13,18,42].map(id=>[id,weeklyRateComparison(id)])),
    trialEvidence:(()=>{const c=weeklyRateComparison(18);return c?homeTrialEvidence(c):null;})(),
    deviceChanges:deviceEventGroupChanges()})`));
  // Keep all metric keys so catalog/search never sees an undefined metric.
  home.scopes[run('homeScopeKey(filterState)')]=scope;
}
assert.equal(Object.keys(home.scopes).length,45,'Home global filter combinations changed; update acceptance deliberately');
// Small shared definitions and navigation metadata; no event rows in initial transfer.
const common=['catalog','metrics','weekly','snapshot','stories','contract','filterPolicy','slices','modelMarket','metricTrends','entitySamples','inactivityCohorts','subscriptionFlow'];
const heavyFields=new Set(['accountHistory','registrationFacts','sessionDepth','userRetentionFacts','riskFacts','unbindingFacts','anomalyEvents','qualityFacts']);
const diagnostics=Object.fromEntries(Object.entries(source.diagnostics).map(([p,d])=>[p,Object.fromEntries(Object.entries(d).filter(([k])=>!heavyFields.has(k)))]));
const options=plain(run(`Object.fromEntries([
 ['B','userCohortType'],['B','userCohort'],['D','riskSnapshot'],['F','unbindingMonth'],
 ['D','renewalMonth'],['B','retentionMonth'],['C','activationCohort']
].map(([page,key])=>[key,availableOptions(page,key)]))`));
const core={version:1,revision,sources:{...Object.fromEntries(common.map(k=>[k,source[k]])),diagnostics},metricIds:ids,options};
// Intern repeated metric/history objects across ignored-filter combinations.
// References are a transport optimization only; decoding restores the exact values.
const pool=[],interned=new Map(),intern=value=>{const text=JSON.stringify(value);if(!interned.has(text)){interned.set(text,pool.length);pool.push(value);}return interned.get(text);};
const packed={...home,pool,scopes:Object.fromEntries(Object.entries(home.scopes).map(([key,scope])=>[key,
 Object.fromEntries(Object.entries(scope).map(([field,value])=>[field,['trialEvidence','deviceChanges'].includes(field)?intern(value):Object.fromEntries(Object.entries(value).map(([id,item])=>[id,intern(item)]))]))]))};
const files={'route-core':core,'route-home':packed};
// Explicit source requirements include dependencies of source-to-source checks and
// evidence panels, not just the metric value. Each topic is committed atomically.
const requirements={
 A:{facts:['bindingDeviceFacts','onboardingDurationFacts'],diagnostics:['A']},
 B:{facts:['activityWindowFacts','functionUsage','deviceRetentionFacts','onboardingDurationFacts'],diagnostics:['A','B']},
 C:{facts:['deviceActivityFacts','deviceRetentionFacts','technicalFacts'],diagnostics:[]},
 D:{facts:['trialFacts','monthlyRenewalFacts'],diagnostics:['D']},
 E:{facts:[],diagnostics:[]},
 F:{facts:[],diagnostics:['A','F']},
 G:{facts:['bindingDeviceFacts'],diagnostics:['D','G']},
};
// Metric 2/5/6/21 reconciliation is small shared data. The page's own facts are
// independently checked by projectMetric before the corresponding value is used.
for(const [page,r] of Object.entries(requirements))files[`route-${page}`]={version:1,revision,page,
 sources:Object.fromEntries(r.facts.map(k=>[k,source[k]])),diagnostics:Object.fromEntries(r.diagnostics.map(p=>[p,source.diagnostics[p]]))};
const check=process.argv.includes('--check');
for(const [name,value] of Object.entries(files)) {
 const filename=path.join(root,'data',name+'.json'),text=JSON.stringify(value)+'\n';
 if(check)assert.equal(fs.readFileSync(filename,'utf8'),text,`${name} is stale; run node scripts/prepare_route_data.mjs`);
 else fs.writeFileSync(filename,text);
}
console.log(`${check?'Verified':'Prepared'} ${Object.keys(files).length} route artifacts, 45 source-derived home scopes, revision ${revision.slice(0,12)}.`);
