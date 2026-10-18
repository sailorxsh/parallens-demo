// Export actual runtime summaries; Python independently checks expanded raw samples.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\nstart\(\);\s*$/,'\n');
const names=/const dataParts=\[(.*?)\];/.exec(code)[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1));
const aliases={'metric-catalog':'catalog','metric-values':'metrics','filter-contract':'contract','filter-slices':'slices'};
const fixtures=Object.fromEntries(names.map(n=>[aliases[n]??n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`,import.meta.url)))]));
const c=vm.createContext({__fixtures:fixtures,document:{documentElement:{},querySelector:()=>null},getComputedStyle:()=>({fontSize:'16px'}),window:{addEventListener:()=>{},removeEventListener:()=>{}},localStorage:{getItem:()=>null},URLSearchParams,location:{hash:''},console});
vm.runInContext(code,c);const run=s=>vm.runInContext(s,c);run('sourceData=__fixtures');
const cases=[];
for(const id of [11,13])for(const cohort of fixtures.onboardingDurationFacts[id===11?'binding':'activation'].cohorts){
 const dims=id===11?['appPlatform','deviceModel','appVersion']:['country','appPlatform','deviceModel'];
 function walk(rows,depth,scope){
  const summary=run(`onboardingAggregate(${JSON.stringify(rows)})`);
  cases.push({id,week:cohort.week,scope,summary});
  if(depth<dims.length)for(const value of [...new Set(rows.map(r=>r[dims[depth]]))])walk(rows.filter(r=>r[dims[depth]]===value),depth+1,{...scope,[dims[depth]]:value});
 }
 walk(cohort.records,0,{});
}
const corruptions=["delete sourceData.onboardingDurationFacts","sourceData.onboardingDurationFacts.status='PROPOSAL_ONLY'","sourceData.onboardingDurationFacts.asOf='2026-09-25'",
 "sourceData.onboardingDurationFacts.binding.cohorts[0].records.pop()","sourceData.onboardingDurationFacts.binding.cohorts[0].records[0].durationCounts[0][1]=-1",
 "sourceData.onboardingDurationFacts.binding.cohorts[0].records[0].durationCounts[1][0]=20","sourceData.onboardingDurationFacts.activation.cohorts[0].records[0].durationCounts.at(-1)[0]=604800",
 "sourceData.onboardingDurationFacts.activation.cohorts[0].observedThrough='2026-09-25'","sourceData.onboardingDurationFacts.activation.cohorts[0].records[1]=structuredClone(sourceData.onboardingDurationFacts.activation.cohorts[0].records[0])",
 "sourceData.weekly[0].registrationCohort.valueActivated7dBird++","sourceData.onboardingDurationFacts.binding.cohorts[0].records[0]=null","sourceData.onboardingDurationFacts.activation.cohorts[0]=null","sourceData.onboardingDurationFacts.activation.cohorts.at(-1).observedThrough='2026-09-20'"];
// structuredClone is not required by the app, but the test uses a plain JSON fixture copy.
for(const change of corruptions){
 run(`sourceData=JSON.parse(JSON.stringify(__fixtures));${change.replace('structuredClone(sourceData.onboardingDurationFacts.activation.cohorts[0].records[0])','JSON.parse(JSON.stringify(sourceData.onboardingDurationFacts.activation.cohorts[0].records[0]))')}`);
 assert.ok(run('onboardingIndex().reason'),change);assert.equal(run('projectMetric(13,{}).kind'),'na');assert.equal(run('projectMetric(11,{}).kind'),'na');
}
run('sourceData=__fixtures');
assert.equal(run("projectMetric(13,{deviceModel:'K6'}).numerator"),111);assert.equal(run("projectMetric(13,{deviceModel:'K6'}).denominator"),283);
assert.equal(run("projectMetric(13,{deviceModel:'Hunt Pro'}).kind"),'na');
assert.equal(run("projectMetric(11,{}).value"),.9);assert.equal(run("projectMetric(13,{}).value"),.48);
assert.equal(run('frequencyQuantile([[60,15],[120,15]],.5)'),90);assert.equal(run('frequencyQuantile([[60,29]],.5)'),null);
console.log(JSON.stringify({status:'PASS',cases,sourceGuardChecks:corruptions.length,interpolationChecks:2}));
