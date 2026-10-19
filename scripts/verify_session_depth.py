"""Expand constructed session samples independently of generator/preview quantile methods."""
import datetime as dt
import hashlib
import itertools
import json
import statistics
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
s=json.loads((root/'data/diagnostics.json').read_text())['B']['sessionDepth']
runtime=json.loads(subprocess.check_output(['node',str(root/'scripts/verify_session_depth.mjs')],text=True))
data=(root/'data/activity-window-facts.json').read_bytes()
active=json.loads(data)
assert s['status']=='approved-synthetic' and s['classification']=='entirely_synthetic'
assert s['lineage']['sha256']==hashlib.sha256(data).hexdigest()
assert len(s['rows'])==84
for row,a in zip(s['rows'],active['rows']):
    assert row['endExclusive']==a['at']
    assert dt.datetime.fromisoformat(row['endExclusive'])-dt.datetime.fromisoformat(row['startInclusive'])==dt.timedelta(days=1)
    assert len(row['cells'])==8 and len({(c['country'],c['appPlatform']) for c in row['cells']})==8
    for c in row['cells']:
        original=next(r for r in a['records'] if (r['country'],r['appPlatform'])==(c['country'],c['appPlatform']))
        assert c['activeAccounts']==sum(o['count'] for o in original['outcomes'] if o['appAge']==0)
        assert sum(n for _,n in c['accountSessionFrequency'])==c['activeAccounts']
        assert len({k for k,_ in c['accountSessionFrequency']})==4
        total=sum(k*n for k,n in c['accountSessionFrequency'])
        assert total==sum(n for _,n in c['durationSecondsFrequency'])
        assert all(type(k) is int and k>0 and type(n) is int and n>=0 for values in [c['accountSessionFrequency'],c['durationSecondsFrequency']] for k,n in values)
        assert max(k for k,_ in c['durationSecondsFrequency'])*max(k for k,_ in c['accountSessionFrequency'])<86400
values=[]
for country,platform in itertools.product([None,'US','UK','DE','Other'],[None,'iOS','Android']):
    rows=[]
    for r in s['rows']:
        cs=[c for c in r['cells'] if (country is None or c['country']==country) and (platform is None or c['appPlatform']==platform)]
        accounts=sum(c['activeAccounts'] for c in cs)
        sessions=sum(k*n for c in cs for k,n in c['accountSessionFrequency'])
        samples=sorted(k for c in cs for k,n in c['durationSecondsFrequency'] for _ in range(n))
        q=statistics.quantiles(samples,n=100,method='inclusive')
        rows.append({'endExclusive':r['endExclusive'],'accounts':accounts,'sessions':sessions,'timedSessions':len(samples),'frequency':sessions/accounts,'p50Seconds':q[49],'p90Seconds':q[89]})
    values.append({'country':country,'platform':platform,'rows':rows})
last=values[0]['rows'][-1]
old=json.loads((root/'data/metric-values.json').read_text())['m26']['value']
assert last['accounts']==8400 and last['sessions']==17640 and last['timedSessions']==17640
assert last['frequency']==old['sessionsPerUser'] and last['p50Seconds']/60==old['durationP50Minutes'] and last['p90Seconds']/60==old['durationP90Minutes']
assert all(len({r[k] for r in values[0]['rows']})>8 for k in ['frequency','p50Seconds','p90Seconds'])
for expected,actual in zip(values,runtime['cases']):
    assert expected['country']==actual['state'].get('country') and expected['platform']==actual['state'].get('appPlatform')
    for x,y in zip(expected['rows'],actual['projection']['rows']):
        for key,other in [('accounts','accounts'),('sessions','sessions'),('timedSessions','timedSessions'),('frequency','frequency'),('p50Seconds','p50'),('p90Seconds','p90')]:
            assert abs(x[key]-y[other])<1e-9,(actual['state'],x['endExclusive'],key)

summary={'status':'PASS','sourceGuardChecks':runtime['sourceGuardChecks'],'periods':84,'cells':672,'scopedDates':1260,'current':last,'examples':[v|{'rows':[v['rows'][-1]]} for v in values if (v['country'],v['platform']) in [('US','iOS'),(None,'iOS'),(None,'Android')]],'limits':'Checks reconcile constructed aggregate frequencies and existing App daily counts; no real event/sessionization or individual identity lineage established.'}

print(json.dumps(summary,ensure_ascii=False))
