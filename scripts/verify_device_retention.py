"""Independent counts and UTC maturity checks for activation-week device retention."""
from datetime import date,timedelta
from pathlib import Path
import json,subprocess
ROOT=Path(__file__).resolve().parents[1]
source=json.loads((ROOT/'data/device-retention-facts.json').read_text());asof=date.fromisoformat(source['asOf'])
runtime=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/verify_device_retention.mjs')],cwd=ROOT))
assert runtime['status']=='PASS' and len(runtime['cases'])==8100 and len(source['cohorts'])==12
cohorts={c['id']:c for c in source['cohorts']}
for cohort in cohorts.values():
 start=date.fromisoformat(cohort['start']);end=date.fromisoformat(cohort['end'])
 assert start.weekday()==0 and end-start==timedelta(days=6)
 assert len(cohort['records'])==32 and len({(r['country'],r['deviceModel'],r['salesChannel']) for r in cohort['records']})==32
 assert sum(r['activated'] for r in cohort['records'])==cohort['activated']
 for key,days in [('D7',7),('D30',30)]:
  assert cohort['mature'][key]==(asof>=end+timedelta(days=days+1))
  assert cohort['observationEndExclusive'][key]==(end+timedelta(days=days+1)).isoformat()
 for row in cohort['records']:
  assert sum(o['count'] for o in row['outcomeCounts'])==row['activated']
for case in runtime['cases']:
 cohort=cohorts[case['id']]
 rows=[r for r in cohort['records'] if all(r['entryDeviceStatus' if k=='deviceStatus' else k]==v for k,v in case['filters'].items())]
 denominator=sum(r['activated'] for r in rows);assert case['d']==denominator
 for key in ['D7','D30']:
  numerator=sum(o['count'] for r in rows for o in r['outcomeCounts'] if o[key]) if cohort['mature'][key] else None
  actual=case[key];assert actual['n']==numerator
  assert actual['kind']==('na' if denominator<30 or numerator is None else 'rate')
  assert actual['value']==(numerator/denominator if denominator>=30 and numerator is not None else None)
ids=[]
for device in runtime['devices']:
 cohort=cohorts[device['id']];assert device['count']==len(device['ids'])==cohort['activated'];ids+=device['ids']
 for key in ['D7','D30']:
  expected=sum(o['count'] for r in cohort['records'] for o in r['outcomeCounts'] if o[key]) if cohort['mature'][key] else 0
  assert device[key]==expected
  assert device['unknown'+key[1:]]==(0 if cohort['mature'][key] else cohort['activated'])
assert len(ids)==len(set(ids))==24250
anchor=cohorts[source['defaultCohort']]
assert [sum(o['count'] for r in anchor['records'] for o in r['outcomeCounts'] if o[k]) for k in ['D7','D30']]==[1600,1450]
assert sum(o['count'] for r in anchor['records'] for o in r['outcomeCounts'] if o['D30'] and not o['D7'])==100
print('PASS 8100 cohort/filter intersections, 384 joint cells, 24250 unique devices, UTC day windows, 15 corrupt sources, 4 invalid cohorts, zero/100% rates and original scopes')
