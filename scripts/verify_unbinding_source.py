from pathlib import Path
from datetime import datetime,timedelta
import json,itertools
O=Path(__file__).resolve().parents[1];s=json.loads((O/'data/diagnostics.json').read_text())['F']['unbindingFacts'];at=datetime.fromisoformat(s['asOf']);reports=[];events=set();ids=set();previous=None
for m in s['months']:
 a,b=map(datetime.fromisoformat,[m['startInclusive'],m['endExclusive']]);assert a.day==b.day==1 and 28<=(b-a).days<=31 and b<=at and (previous is None or a==previous);previous=b
 assert len(m['openingGroups'])==len({(r['country'],r['appPlatform'],r['deviceModel'],r['deviceStatus'])for r in m['openingGroups']})==64
 assert all(r['deviceStatus']=='Effective' or r['count']==0 for r in m['openingGroups'])
 groups={tuple(r[k]for k in ['country','appPlatform','deviceModel','deviceStatus']):r['count']for r in m['openingGroups']};selected={}
 for r in m['devices']:
  assert r['deviceStatus']=='Effective';assert r['id'] not in ids;ids.add(r['id']);key=tuple(r[k]for k in ['country','appPlatform','deviceModel','deviceStatus']);selected[key]=selected.get(key,0)+1
  assert r['productLine']==s['models'][r['deviceModel']]
  us=sorted(r['unbindings'],key=lambda e:e['at']);assert a<=datetime.fromisoformat(us[0]['at'])<b
  timeline=sorted([(u['at'],'U',u['id'])for u in us]+[(x['at'],'B',x['id'])for x in r['bindings']]);bound=True
  for stamp,kind,id in timeline:
   assert id not in events;events.add(id);when=datetime.fromisoformat(stamp);assert when<=at and (kind=='U')==bound;bound=kind=='B'
  assert all(a<=datetime.fromisoformat(u['at'])<b for u in us)
 assert all(count<=groups[k]for k,count in selected.items())

def project(f,m):
 match=lambda r:all(not v or r[k]==v for k,v in f.items());rows=[r for r in m['devices']if match(r)];opening=sum(r['count']for r in m['openingGroups']if match(r));n=len(rows)
 result={'month':m['month'],'opening':opening,'devices':n,'events':sum(len(r['unbindings'])for r in rows),'rate':n/opening if opening else None}
 for days in [7,30]:
  mature=hits=0
  for r in rows:
   first=min(datetime.fromisoformat(e['at'])for e in r['unbindings']);deadline=first+timedelta(days=days);mature+=at>=deadline
   returns=[datetime.fromisoformat(e['at'])for e in r['bindings']if datetime.fromisoformat(e['at'])>first];hits+=bool(returns and min(returns)<=deadline)
  result['D'+str(days)]={'numerator':hits if n and mature==n else None,'observedHits':hits,'denominator':n,'mature':mature,'value':hits/n if n>=30 and mature==n else None,'status':'无解绑设备' if not n else '观察中' if mature!=n else '样本不足30台' if n<30 else '观察完成'}
 return result
for country,appPlatform,deviceModel,deviceStatus in itertools.product(['','US','UK','DE','Other'],['','iOS','Android'],['','K6','Bird Lite','Bird Pro','Hunt Pro'],['','Effective','Inactive']):
 f=dict(country=country,appPlatform=appPlatform,deviceModel=deviceModel,deviceStatus=deviceStatus);reports.append({'filters':f,'points':[project(f,m)for m in s['months']]})
for f in [{'productLine':'Bird'},{'productLine':'Hunting'},{'productLine':'Bird','deviceModel':'Hunt Pro'}]:reports.append({'filters':f,'points':[project(f,m)for m in s['months']]})
for m in s['months']:
 p=project({},m);assert m['controls']=={'devices':p['devices'],'events':p['events'],'opening':p['opening'],'mature7':p['D7']['mature'],'observed7':p['D7']['observedHits'],'mature30':p['D30']['mature'],'observed30':p['D30']['observedHits']}
july=project({},next(m for m in s['months']if m['month']=='2026-07'));assert(july['devices'],july['events'],july['opening'],july['D7']['numerator'],july['D30']['numerator'])==(250,300,142000,120,180)
aug=project({},s['months'][-1]);assert aug['D7']['value'] is not None and aug['D30']['value'] is None and aug['D30']['mature']<aug['devices']
for m in s['months']:
 overall=project({},m);parts=[project({'deviceModel':key},m)for key in s['models']];assert all(sum(p[k]for p in parts)==overall[k]for k in ['devices','events','opening']);assert all(p['D7']['observedHits']<=p['D30']['observedHits']<=p['devices']for p in parts)

summary={'status':'PASS','scopes':len(reports),'cohortScopes':len(reports)*12,'deviceRecords':len(ids),'eventRecords':len(events),'july':july,'august':aug,'usJuly':project({'country':'US'},next(m for m in s['months']if m['month']=='2026-07')),'androidJuly':project({'appPlatform':'Android'},next(m for m in s['months']if m['month']=='2026-07'))}
if __name__=='__main__': print(json.dumps(summary,ensure_ascii=False))
