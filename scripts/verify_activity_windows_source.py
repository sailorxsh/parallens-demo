import json,itertools
from pathlib import Path
root=Path(__file__).resolve().parents[1];p=json.loads((root/'data/activity-window-facts.json').read_text());m=json.loads((root/'data/metric-values.json').read_text());chart=json.loads((root/'data/diagnostics.json').read_text())['B']['chart']
assert p['status']=='approved-synthetic';reports=[]
for i,row in enumerate(p['rows']):
    totals=dict(comp1=0,comp7=0,comp30=0,app1=0,app7=0,app30=0);seen=set()
    for r in row['records']:
        key=r['country'],r['appPlatform'];assert key not in seen;seen.add(key);signatures=set()
        for o in r['outcomes']:
            c,a,n=o['compositeAge'],o['appAge'],o['count'];assert type(n) is int and n>0 and c in [0,1,2] and (a is None or a in [0,1,2] and a>=c)
            assert (c,a) not in signatures;signatures.add((c,a))
            for label,bound in [('1',0),('7',1),('30',2)]:
                totals['comp'+label]+=n*(c<=bound);totals['app'+label]+=n*(a is not None and a<=bound)
    assert len(seen)==8 and totals['comp1']<=totals['comp7']<=totals['comp30'] and totals['app1']<=totals['app7']<=totals['app30']
    assert all(totals['app'+label]<=totals['comp'+label] for label in ['1','7','30'])
    label=str(int(row['at'][5:7]))+'/'+str(int(row['at'][8:10]))
    if label in chart['labels']:
        j=chart['labels'].index(label);assert totals['comp30']==chart['series'][0]['values'][j] and totals['app30']==chart['series'][1]['values'][j]
    reports.append(dict(at=row['at'],**totals))
last=reports[-1];assert [last[k] for k in ['comp1','comp7','comp30','app30']]==[m['m25']['value'][k] for k in ['DAU','WAU','MAU','appMAU']]
assert sum(r['composite'] for r in p['currentComposition'])==m['m04']['value']
for label,n in m['m30']['value']['exclusiveCells'].items():assert sum(r['exclusive'][label] for r in p['currentComposition'])==n
for source,r in zip(p['rows'][-1]['records'],p['currentComposition']):
    assert sum(r['exclusive'].values())==r['composite']==sum(o['count'] for o in source['outcomes'])
    assert sum(r['exclusive'][k] for k in ['appOnly','appContentOnly','appPushOnly','allThree'])==r['app']==sum(o['count'] for o in source['outcomes'] if o['appAge'] is not None)
from datetime import datetime,timedelta
assert len(p['rows'])==84 and len({r['at'] for r in p['rows']})==84
for i,r in enumerate(p['rows']):assert datetime.fromisoformat(r['at'])==datetime.fromisoformat(p['asOf'])-timedelta(days=83-i)
for cell in range(8):
    series=[]
    for row in p['rows']:
        result={}
        for prefix,field in [('comp','compositeAge'),('app','appAge')]:
            for label,bound in [('1',0),('7',1),('30',2)]:result[prefix+label]=sum(o['count'] for o in row['records'][cell]['outcomes'] if o[field] is not None and o[field]<=bound)
        series.append(result)
    for i,r in enumerate(series):
        for prefix in ['comp','app']:
            for days in [1,7,30]:
                values=[v[prefix+'1'] for v in series[max(0,i-days+1):i+1]]
                assert r[prefix+str(days)]>=max(values)
                if i>=days-1:assert r[prefix+str(days)]<=sum(values)
report=dict(status='PASS',classification='approved-synthetic',snapshots=84,jointCells=672,overallAnchorsPreserved=True,compositionSevenCellsPreserved=True,rows=reports,limitations=p['limits'])
print(json.dumps(report,ensure_ascii=False))
