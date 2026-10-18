"""Independent percentile and closure checks against the actual JavaScript runtime."""
import json, statistics, subprocess
from datetime import date, timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=json.loads((ROOT/'data/onboarding-duration-facts.json').read_text())
actual=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/verify_onboarding.mjs')],cwd=ROOT))
quantiles=0
for case in actual['cases']:
 section=source['binding' if case['id']==11 else 'activation']
 cohort=next(c for c in section['cohorts'] if c['week']==case['week'])
 assert date.fromisoformat(cohort['cohortEnd'])-date.fromisoformat(cohort['cohortStart'])==timedelta(days=6)
 assert date.fromisoformat(cohort['observedThrough'])<=date.fromisoformat(source['asOf'])
 if case['id']==13:assert date.fromisoformat(cohort['observedThrough'])-date.fromisoformat(cohort['cohortEnd'])>=timedelta(days=8)
 rows=[r for r in cohort['records'] if all(r[k]==v for k,v in case['scope'].items())]
 expanded=[seconds for r in rows for seconds,n in r['durationCounts'] for _ in range(n)]
 d=sum(r['eligible'] for r in rows);s=case['summary'];assert [s['numerator'],s['denominator']]==[len(expanded),d]
 excluded=sum(sum(r['failureCounts'].values()) if case['id']==11 else r['notActivatedWithin7d'] for r in rows)
 assert excluded+len(expanded)==d
 assert all(0<=seconds<=(86400 if case['id']==11 else 604799) for seconds in expanded)
 if len(expanded)>=30:
  p50=statistics.median(expanded);p90=statistics.quantiles(expanded,n=100,method='inclusive')[89]
  assert abs(s['p50Seconds']-p50)<1e-8 and abs(s['p90Seconds']-p90)<1e-8
  quantiles+=2
 else:assert s['p50Seconds'] is None and s['p90Seconds'] is None
 for key,values in [(k,{r[k] for r in rows}) for k in (['appPlatform','deviceModel','appVersion'] if case['id']==11 else ['country','appPlatform','deviceModel'])]:
  assert sum(sum(r['eligible'] for r in rows if r[key]==v) for v in values)==d
print(json.dumps({'status':'PASS','runtimeScopes':len(actual['cases']),'independentExpandedQuantiles':quantiles,'sourceGuardChecks':actual['sourceGuardChecks'],'interpolationChecks':actual['interpolationChecks']},ensure_ascii=False))
