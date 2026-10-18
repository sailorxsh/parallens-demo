"""Independently sum source counts in Python and compare actual JS window outputs."""
from datetime import date, timedelta
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
s=json.loads((ROOT/'data/technical-facts.json').read_text());h=s['dailyHistory']
runtime=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/verify_technical_history.mjs')],cwd=ROOT))
end=date.fromisoformat(s['asOf']);fields={'upload':'uploadFailures','live':'liveFailures','push':'pushFailures'}
assert h['endExclusive']==f'{end.isoformat()}T00:00:00Z' and len(h['rows'])==30
assert h['rows'][-1]['records']==s['records']
checks=0
for case in runtime['cases']:
 state=case['state'];part=case['part'];expected=[]
 for i,row in enumerate(h['rows']):
  assert date.fromisoformat(row['date'])==end-timedelta(days=30-i)
  rs=[r for r in row['records'] if (not state.get('productLine') or ('Hunting' if r['model']=='Hunt Pro' else 'Bird')==state['productLine']) and (not state.get('deviceModel') or r['model']==state['deviceModel']) and (not state.get('firmware') or r['firmware']==state['firmware'])]
  n=sum(r['attempts'] for r in rs)
  counts={k:{'numerator':n-sum(r[f] for r in rs),'denominator':n,'failed':sum(r[f] for r in rs)} for k,f in fields.items()}
  assert part['rows'][i]['counts']==counts
  expected.append(counts);checks+=len(fields)
 for days,key in [(1,'day'),(7,'week')]:
  for k in part['names']:
   totals={f:sum(r[k][f] for r in expected[-days:]) for f in ['numerator','denominator','failed']}
   assert part[key][k]==totals
 for i,counts in enumerate(expected):
  rate=min(counts[k]['numerator']/counts[k]['denominator'] for k in part['names'])
  assert abs(case['headline']['values'][i]-rate*100)<1e-10
assert len(runtime['cases'])==216
print(json.dumps({'status':'PASS','runtimeScopes':len(runtime['cases']),'independentDailyChainCounts':checks,'sourceGuardChecks':len(runtime['sourceGuardChecks']),'smallPopulationBoundaries':runtime['smallPopulationBoundaries']},ensure_ascii=False))
