from pathlib import Path
from datetime import datetime,timedelta
import json,itertools
O=Path(__file__).resolve().parents[1];s=json.loads((O/'data/diagnostics.json').read_text())['D']['riskFacts'];asdate=datetime.fromisoformat

assert s['status']=='approved-synthetic' and s['classification']=='entirely_synthetic' and s['version']=='synthetic-risk-account-evidence-v1'
assert len(s['snapshots'])==12 and len(s['activity'])==216 and len(s['dates'])==112
assert s['models']=={'K6':'Bird','Bird Lite':'Bird','Bird Pro':'Bird','Hunt Pro':'Hunting'}
assert s['rule']=={'intentLookbackDays':30,'recentActivityDays':7,'baselineActivityDays':28,'declineStrictlyGreaterThan':.5,'offlineHoursAtLeast':168,'ignoredAlertLookbackDays':30,'ignoredAlertCountAtLeast':3}
assert s['asOf']==json.loads((O/'data/snapshot.json').read_text())['asOf']+'T00:00:00Z'
for index,w in enumerate(s['snapshots']):
 assert asdate(s['asOf'])-asdate(w['at'])==timedelta(days=(11-index)*7)
 assert set(r['id']for r in w['accounts'])==set(s['activity'])
 assert all(len(set(r['ignoredAlerts']))==len(r['ignoredAlerts']) for r in w['accounts'])
for index,date in enumerate(s['dates']):
 if index: assert asdate(date)-asdate(s['dates'][index-1])==timedelta(days=1)
assert all(len(bits)==112 and all(n in [0,1]for n in bits) for bits in s['activity'].values())

def evidence(r,at):
 t=asdate(at);recent=[i for i,d in enumerate(s['dates'])if t-timedelta(days=7)<=asdate(d+'T00:00:00Z')<t];base=[i for i,d in enumerate(s['dates'])if t-timedelta(days=35)<=asdate(d+'T00:00:00Z')<t-timedelta(days=7)];assert len(recent)==7 and len(base)==28
 bits=s['activity'][r['id']];n=sum(bits[i]for i in recent);d=sum(bits[i]for i in base);b=d>0 and n*8<d
 rec=lambda date:date is not None and t-timedelta(days=30)<=asdate(date)<t
 i=r['cancelAutoRenew']or(rec(r['trialEndedAt'])and not r['trialPaid'])or rec(r['expiredAt']);offline=any(t-asdate(v['lastOnlineAt'])>=timedelta(hours=168)for v in r['devices']);push=not r['pushEnabled'];ignored=sum(t-timedelta(days=30)<=asdate(a)<t for a in r['ignoredAlerts']);support=offline or push or ignored>=3
 return {'intent':bool(i),'behavior':b,'device':offline,'push':push,'attitude':ignored>=3,'risk':bool(i or(b and support)),'recent':n,'baseline':d,'ignored':ignored}
expected=[]
for point in s['snapshots']:
 rows=[{**r,**evidence(r,point['at'])}for r in point['accounts']];assert len({r['id']for r in rows})==point['eligible']==216;assert sum(r['risk']for r in rows)==point['expectedRisk'];expected.append(rows)
last=expected[-1];risks=[r for r in last if r['risk']];counts={key:sum(r[key]for r in risks)for key in['intent','behavior','device','push','attitude']};combos={name:sum((r['intent'],r['behavior']and(r['device']or r['push']or r['attitude']))==flags for r in last)for name,flags in [('intentOnly',(True,False)),('behaviorOnly',(False,True)),('both',(True,True)),('neither',(False,False))]};assert combos=={'intentOnly':90,'behaviorOnly':60,'both':18,'neither':48};assert len([r for r in risks if r['plan']=='Free'])==48
scopes=[]
for country,app,plan in itertools.product(['','US','UK','DE','Other'],['','iOS','Android'],['','Free','Starter','Plus','Pro']):scopes.append({k:v for k,v in dict(country=country,appPlatform=app,plan=plan).items()if v})
for filters in scopes:
 for point,rows in zip(s['snapshots'],expected):
  found=[r for r in rows if all(r[k]==v for k,v in filters.items())];n=sum(r['risk']for r in found);assert sum(r['risk']and r['intent']for r in found)+sum(r['risk']and not r['intent']for r in found)==n
summary={'status':'PASS','snapshots':12,'scopeCases':len(scopes)*12,'current':len(risks),'evaluated':216,'signalsWithinRisk':counts,'mutuallyExclusive':combos,'freeRisk':48,'country':{c:sum(r['country']==c for r in risks)for c in['US','UK','DE','Other']},'plan':{c:sum(r['plan']==c for r in risks)for c in['Free','Starter','Plus','Pro']}}

legacy=json.loads((O/'data/metric-trends.json').read_text())['m52']
assert [w['expectedRisk'] for w in s['snapshots']]==[p['value']for p in legacy['points']]
assert [f"{asdate(w['at']).month}/{asdate(w['at']).day}" for w in s['snapshots']]==legacy['labels']
assert len(risks)==json.loads((O/'data/metric-values.json').read_text())['m52']['value']
if __name__=='__main__': print(json.dumps(summary,ensure_ascii=False))
