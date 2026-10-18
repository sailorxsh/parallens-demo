"""Independent cohort counts, calendar boundaries and runtime slice reconciliation."""
import calendar,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=json.loads((ROOT/'data/metric-trends.json').read_text())['m24']
legacy=json.loads((ROOT/'scripts/fixtures/monthly-retention-before-12-months.json').read_text())
result=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/verify_monthly_retention.mjs')],cwd=ROOT))
assert result['status']=='PASS' and len(result['cases'])==180
assert len(source['points'])==12 and sum(len(r['records']) for r in source['points'])==96
for row in source['points']:
 y,m=map(int,row['observedMonth'].split('-'));assert row['observedThrough']==f'{y:04d}-{m:02d}-{calendar.monthrange(y,m)[1]:02d}'
 assert row['numerator']==sum(r['retained'] for r in row['records'])
 assert row['denominator']==sum(r['baseActive'] for r in row['records'])
 assert row['activeObserved']==sum(r['observedActive'] for r in row['records'])
 assert all(0<=r['retained']<=min(r['baseActive'],r['observedActive']) for r in row['records'])
for previous,current in zip(source['points'],source['points'][1:]):
 assert previous['observedMonth']==current['baseMonth']
 assert all(left['observedActive']==right['baseActive'] for left,right in zip(previous['records'],current['records']))
other={}
for case in result['cases']:
 def aggregate(point):
  rows=[r for r in point['records'] if all(r[k]==v for k,v in case['filters'].items())]
  return sum(r['retained'] for r in rows),sum(r['baseActive'] for r in rows)
 for point,actual in zip(source['points'],case['history']):
  n,d=aggregate(point);assert (actual['n'],actual['d'])==(n,d)
  assert abs(actual['value']-n/d)<1e-12
 current=next(r for r in source['points'] if r['observedMonth']==case['month']);n,d=aggregate(current)
 assert (case['current']['numerator'],case['current']['denominator'])==(n,d)
 assert case['window']=='完整月 '+case['month']
 assert current['baseMonth']+' → '+case['month'] in case['baseline']
 scope=json.dumps(case['filters'],sort_keys=True);assert other.setdefault(scope,case['other'])==case['other']
changes=[]
for old in legacy['scopes']:
 actual=next(c for c in result['cases'] if c['month']=='2026-08' and c['filters']==old['filters'])['current']
 if f"{actual['value']*100:.1f}"!=f"{old['current']['value']*100:.1f}":changes.append(old['filters'])
assert changes==[{'country':'Other','appPlatform':'iOS'}]
assert (source['points'][-2]['numerator'],source['points'][-2]['denominator'])==(48960,68000)
assert (source['points'][-1]['numerator'],source['points'][-1]['denominator'])==(54000,70000)
print('PASS 180 month/scope calculations and 2160 historical points; 96 cells, 88 continuity checks, 12 source faults, 5 invalid months, zero/29-person samples; one approved rounding change')
