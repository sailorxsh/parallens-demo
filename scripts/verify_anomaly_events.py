"""Independently reconcile each scoped count to unique timestamped event IDs."""
from pathlib import Path
from datetime import datetime,timedelta
import json,subprocess
R=Path(__file__).resolve().parents[1];d=json.loads((R/'data/diagnostics.json').read_text())['G']['anomalyEvents'];x=json.loads(subprocess.check_output(['node',str(R/'scripts/verify_anomaly_events.mjs')],cwd=R,text=True));checked=0
ids={e['id']:e for e in d['events']};assert len(ids)==len(d['events'])==84
for scope in x['scopes']:
 for i,w in enumerate(scope['rows']):
  a,b=map(datetime.fromisoformat,[w['start'],w['end']]);assert b-a==timedelta(days=1);assert b==datetime.fromisoformat(d['asOf'])-timedelta(days=29-i)
  expected=[e['id'] for e in d['events'] if a<=datetime.fromisoformat(e['observedAt'])<b and all(e[k]==v for k,v in scope['filters'].items())];assert sorted(w['ids'])==sorted(expected);checked+=1
old=json.loads((R/'data/entity-samples.json').read_text())['G'];last=d['windows'][-1]
for anchor,e in zip(old,[ids[i] for i in last['eventIds']]):
 for k in ['id','signal','status','domain','scope','review','evidence']:assert anchor[k]==e[k]
 assert anchor['observedAt'][11:]==e['observedAt'][11:16]
assert [len(w['eventIds']) for w in d['windows'][-7:]]==[p['value'] for p in json.loads((R/'data/metric-trends.json').read_text())['m53']['points']]
assert sum(ids[i]['country']=='US' for i in last['eventIds'])==3
print(json.dumps({'status':'PASS','scopedWindows':checked,'scopes':len(x['scopes']),'events':84,'preservedEventAnchors':7,'faults':x['faults'],'knownZero':x['knownZero'],'bothWindowBoundaries':True,'sameCountEvidenceChange':x['sameCountChange'],'limits':'Entirely synthetic discoveries; no four-week alert baseline, severity, impacted users or identity linkage.'}))
