"""Reconcile JavaScript stock views against independent Python source sums."""
import json, subprocess
from pathlib import Path
from datetime import date, timedelta
ROOT=Path(__file__).resolve().parents[1];load=lambda name:json.loads((ROOT/'data'/f'{name}.json').read_text())
s=load('diagnostics')['A']['accountHistory'];runtime=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/verify_account_history.mjs')],cwd=ROOT));current=load('metric-values')['m07']['value']
points=s['months']+[s['current']];checks=0
for case in runtime['cases']:
 for i,point in enumerate(points):
  rows=[r for r in point['records'] if all(r[k]==v for k,v in case['state'].items())]
  expected={key:sum(r[key] for r in rows) for key in ['registered','boundOwners']}
  assert all(case['history']['rows'][i][key]==value for key,value in expected.items());assert expected['boundOwners']<=expected['registered'];checks+=2
  if i==12:assert case['current']['value']==expected
for week in load('weekly'):
 end=date.fromisoformat(week['weekEnd']);days=[r for r in s['registrationBridge']['days'] if end-timedelta(days=6)<=date.fromisoformat(r['date'])<=end];assert len(days)==7 and sum(r['registered'] for r in days)==week['registrationCohort']['registered']
for point in s['months'][-3:]:
 total=sum(r['registered'] for r in point['records']);after=sum(r['registered'] for r in s['registrationBridge']['days'] if r['date']>point['date']);assert total+after==current['registered']
# A monthly active account must already be registered by the same month end.
stock={p['month']:p['records'] for p in s['months']};subset_checks=0
for point in load('metric-trends')['m24']['points']:
 for month,key in [(point['baseMonth'],'baseActive'),(point['observedMonth'],'observedActive')]:
  if month in stock:
   for active in point['records']:
    registered=next(r['registered'] for r in stock[month] if r['country']==active['country'] and r['appPlatform']==active['appPlatform'])
    assert active[key]<=registered;subset_checks+=1
assert len(runtime['cases'])==15
print(json.dumps({'status':'PASS','runtimeScopes':15,'independentSnapshotCounts':checks,'originalWeeklyTotals':12,'sourceGuardChecks':runtime['sourceGuardChecks'],'knownZero':runtime['knownZero'],'monthlyActiveSubsetChecks':subset_checks},ensure_ascii=False))
