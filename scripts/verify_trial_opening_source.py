"""Independent source checks for #17 and exact registration denominator agreement."""
from pathlib import Path
import json, datetime as dt
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'data/diagnostics.json').read_text());f=data['D']['trialOpeningFacts'];reg=data['A']['registrationFacts'];weekly=json.loads((root/'data/weekly.json').read_text())
assert f['status']=='approved-synthetic' and f['classification']=='entirely_synthetic'
assert f['rateDimensions']==['country','appPlatform','week']
assert f['compositionOnlyDimensions']==['productLine','plan','billingCycle','subscriptionPlatform']
checks=cells=0
for c,r,w in zip(f['cohorts'],reg['cohorts'],weekly,strict=True):
 assert c['week']==r['week']==w['week']
 assert c['start']==r['start'] and c['end']==r['end']
 assert c['observationThrough']==r['observed7Through']
 assert dt.date.fromisoformat(c['observationThrough'])-dt.date.fromisoformat(c['end'])==dt.timedelta(days=7)
 assert c['observationThrough']<=f['asOf']
 assert len(c['groups'])==8 and len({(g['country'],g['appPlatform']) for g in c['groups']})==8
 for g in c['groups']:
  registered=sum(v['registered'] for v in r['records'] if v['country']==g['country'] and v['appPlatform']==g['appPlatform'])
  assert g['registered']==registered and g['registered']==g['trialStarted7d']+g['notStarted7d']
  assert sum(count for hour,count in g['firstOpeningLagHourCounts'])==g['trialStarted7d']
  assert all(type(hour)is int and 0<=hour<168 and type(count)is int and count>=0 for hour,count in g['firstOpeningLagHourCounts'])
  assert sum(o['count'] for o in g['openings'])==g['trialStarted7d']
  assert len({(o['productLine'],o['plan'],o['billingCycle'],o['subscriptionPlatform'])for o in g['openings']})==len(g['openings'])
  for o in g['openings']:
   assert type(o['count'])is int and o['count']>0
   assert o['plan'] in (['Plus','Pro'] if o['productLine']=='Bird' else ['Starter','Plus','Pro'])
   assert o['subscriptionPlatform']in(['App Store','Web']if g['appPlatform']=='iOS'else['Google Play','Web'])
   assert o['billingCycle']in['monthly','annual']
  checks+=1;cells+=len(g['openings'])
 assert sum(g['registered']for g in c['groups'])==c['registered']==w['registrationCohort']['registered']
 assert sum(g['trialStarted7d']for g in c['groups'])==c['trialStarted7d']==w['registrationCohort']['trialStarted7d']
assert f['cohorts'][-1]['registered']==2750 and f['cohorts'][-1]['trialStarted7d']==1292
print(f'PASS #17: 12 mature cohorts, {checks} exact #9 denominator groups, {cells} exclusive opening cells; original weekly totals preserved.')
