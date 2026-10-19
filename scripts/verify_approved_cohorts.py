"""Independent arithmetic and population bounds for the three approved proposals."""
from pathlib import Path
from datetime import date,timedelta
import json,itertools
ROOT=Path(__file__).resolve().parents[1];load=lambda n:json.loads((ROOT/'data'/f'{n}.json').read_text())
diag=load('diagnostics');active=load('activity-window-facts');usage=load('function-usage');features=usage['facts'];ret=diag['B']['userRetentionFacts'];reg=diag['A']['registrationFacts'];weekly=load('weekly');onboarding=load('onboarding-duration-facts')['activation']['cohorts'];asof=date.fromisoformat(load('snapshot')['asOf'])
assert features['version']=='synthetic-feature-usage-v1' and features['status']=='approved-synthetic' and features['classification']=='entirely_synthetic'
assert features['configDefinition']=='Account-level in-app notification master setting as of cutoff; independent of OS permission or push delivery' and features['defaultFunction']=='Live'
assert len(features['rows'])==84 and sum(len(r['records'])for r in features['rows'])==672
scopes=[{k:v for k,v in dict(country=c,appPlatform=a).items()if v} for c,a in itertools.product(['','US','UK','DE','Other'],['','iOS','Android'])]
feature_checks=0
for f,a in zip(features['rows'],active['rows']):
 assert f['at']==a['at'] and len({(r['country'],r['appPlatform'])for r in f['records']})==8
 for r in f['records']:
  base=next(x for x in a['records']if (x['country'],x['appPlatform'])==(r['country'],r['appPlatform']));app=sum(o['count']for o in base['outcomes']if o['appAge']is not None and o['appAge']<30);comp=sum(o['count']for o in base['outcomes']if o['compositeAge']<30)
  assert len(r['functionMasks'])==8 and all(type(n)is int and n>=0 for n in r['functionMasks']);assert sum(r['functionMasks'])==app
  assert set(r['notification'])=={'on','off','unknown'} and all(type(n)is int and n>=0 for n in r['notification'].values()) and sum(r['notification'].values())==comp
 for scope in scopes:
  rows=[r for r in f['records']if all(r[k]==v for k,v in scope.items())];den=sum(sum(r['notification'].values())for r in rows);n=[sum(r['functionMasks'][mask]for r in rows for mask in range(8)if mask&(1<<bit))for bit in range(3)]
  assert max(n)<=sum(sum(r['functionMasks'])for r in rows)<=den;feature_checks+=1
last=features['rows'][-1]['records'];assert [sum(r['functionMasks'][m]for r in last for m in range(8)if m&(1<<bit))for bit in range(3)]==[26000,18000,14000];assert [sum(r['notification'][key]for r in last)for key in ['on','off','unknown']]==[41800,22400,3800]
for i,label in enumerate(load('metric-trends')['m27']['labels']):
 f=next(r for r in features['rows']if f"{int(r['at'][5:7])}/{int(r['at'][8:10])}"==label);old=load('metric-trends')['m27']['points'][i];assert sum(r['functionMasks'][m]for r in f['records']for m in [1,3,5,7])==old['numerator']
assert ret['version']=='synthetic-user-retention-v1' and ret['status']=='approved-synthetic' and ret['classification']=='entirely_synthetic' and len(ret['cohorts'])==24
ret_checks=0
for c in ret['cohorts']:
 assert c['id']==c['start'] and date.fromisoformat(c['end'])-date.fromisoformat(c['start'])==timedelta(days=6)
 assert len({tuple(r[k]for k in ['country','appPlatform','deviceModel','salesChannel'])for r in c['records']})==len(c['records']) and sum(r['eligible']for r in c['records'])==c['eligible']
 for d in [1,7,30]:
  key=f'D{d}';end=date.fromisoformat(c['end'])+timedelta(days=d+1);assert c['observationEndExclusive'][key]==str(end) and c['mature'][key]==(end<=asof)
  for r in c['records']:
   assert sum(o['count']for o in r['outcomeCounts'])==r['eligible'] and all(type(o['count'])is int and o['count']>0 for o in r['outcomeCounts'])
   assert all(type(o[key])is bool for o in r['outcomeCounts'])if c['mature'][key]else all(o[key]is None for o in r['outcomeCounts'])
 for scope in scopes:
  rs=[r for r in c['records']if all(r[k]==v for k,v in scope.items())];n=sum(r['eligible']for r in rs)
  for d in ['D1','D7','D30']:assert sum(o['count']for r in rs for o in r['outcomeCounts']if o[d])<=n
  ret_checks+=1
for typ,counts,n in [('activation',[1530,1458,1314],1800),('registration',[1863,1377,918],2700)]:
 c=next(c for c in ret['cohorts']if c['type']==typ and c['id']==ret['defaultCohort']);assert c['eligible']==n and [sum(o['count']for r in c['records']for o in r['outcomeCounts']if o[d])for d in ['D1','D7','D30']]==counts
 if typ=='activation':assert [load('metric-values')['m28']['value'][d]['numerator']for d in ['D1','D7','D30']]==counts and all(v['denominator']==1800 for v in load('metric-values')['m28']['value'].values())
assert reg['version']=='synthetic-registration-cohorts-v1' and reg['status']=='approved-synthetic' and reg['classification']=='entirely_synthetic' and reg['default30Cohort']==7 and len(reg['cohorts'])==12
reg_checks=0
for c,w,act in zip(reg['cohorts'],weekly,onboarding):
 rs=c['records'];assert len(rs)==48 and len({tuple(r[k]for k in ['country','appPlatform','productLine','registrationAppVersion'])for r in rs})==48
 assert c['end']==w['weekEnd'] and c['week']==w['week'] and c['mature30']==(date.fromisoformat(c['observed30Through'])<asof)
 for field,days in [('observed72Through',3),('observed7Through',7),('observed30Through',30)]:assert date.fromisoformat(c[field])-date.fromisoformat(c['end'])==timedelta(days=days)
 for r in rs:
  assert all(type(n)is int and n>=0 for n in [r['registered'],*r['bindingLagCounts'],r['firstImage7d']]);assert sum(r['bindingLagCounts'])==r['registered'] and r['firstImage7d']<=sum(r['bindingLagCounts'][:2])<=r['registered']
  assert r['firstImage7d']<=r['firstImage30d']<=r['registered']if c['mature30']else r['firstImage30d']is None
 assert sum(r['registered']for r in rs)==w['registrationCohort']['registered'] and sum(r['bindingLagCounts'][0]for r in rs)==w['registrationCohort']['bound72h'] and sum(r['firstImage7d']for r in rs)==w['registrationCohort']['firstImage7d']
 for scope in scopes:
  bird=[r for r in rs if r['productLine']=='Bird' and all(r[k]==v for k,v in scope.items())];known=[r for r in act['records']if all(r[k]==v for k,v in scope.items())]
  assert sum(r['registered']for r in bird)==sum(r['eligible']for r in known) and sum(r['firstImage7d']for r in bird)>=sum(n for r in known for _,n in r['durationCounts'])
  for product in ['', 'Bird','Hunting']:
   selected=[r for r in rs if (not product or r['productLine']==product)and all(r[k]==v for k,v in scope.items())];n=sum(r['registered']for r in selected);assert sum(sum(r['bindingLagCounts'][:2])for r in selected)<=n;reg_checks+=1
last=reg['cohorts'][-1]['records'];assert sum(sum(r['bindingLagCounts'][:2])for r in last)==2200
joint_enrollments=0
for c in ret['cohorts']:
 if c['type']!='registration':continue
 common=next((r for r in reg['cohorts']if r['start']==c['start']),None)
 if not common:continue
 for scope in scopes:
  enrolled=sum(r['eligible']for r in c['records']if all(r[k]==v for k,v in scope.items()));registered=sum(r['registered']for r in common['records']if all(r[k]==v for k,v in scope.items()));assert enrolled==registered;joint_enrollments+=1
assert joint_enrollments==165
summary={'status':'PASS','featureScopeDays':feature_checks,'retentionScopeCohorts':ret_checks,'registrationScopeCohorts':reg_checks,'featureCells':672,'retentionGroups':sum(len(c['records'])for c in ret['cohorts']),'registrationGroups':576,'jointEnrollmentScopes':joint_enrollments}
if __name__=='__main__':print(json.dumps(summary,ensure_ascii=False))
