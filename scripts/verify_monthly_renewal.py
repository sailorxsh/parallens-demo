"""Independently reconcile approved monthly frequencies and preserved payment summaries."""
import itertools,json,math
from collections import defaultdict
from datetime import date,timedelta
from pathlib import Path
root=Path(__file__).resolve().parents[1]/"data"
p=json.loads((root/'monthly-renewal-facts.json').read_text())
assert p['status']=='APPROVED_SYNTHETIC' and len(p['months'])==12 and p['asOf']=='2026-09-24'
expected=set(itertools.product(['US','UK','DE','Other'],['iOS','Android'],['App Store','Google Play','Web'],[('Bird','Plus'),('Bird','Pro'),('Hunting','Starter'),('Hunting','Plus'),('Hunting','Pro')],['Monthly','Annual']))
reports=[];intersections=0
for j,m in enumerate(p['months']):
    assert len(m['records'])==len(expected)==240
    seen=set();counts=defaultdict(int);byline=defaultdict(lambda:defaultdict(int))
    for r in m['records']:
        key=(r['country'],r['appPlatform'],r['subscriptionPlatform'],(r['productLine'],r['plan']),r['billingCycle'])
        assert key in expected and key not in seen;seen.add(key)
        local=defaultdict(int);signatures=set()
        for o in r['outcomeCounts']:
            signature=tuple(o[k] for k in ['due','renewed','cancelled','lossReason','restoredAfterLoss'])
            assert signature not in signatures;signatures.add(signature)
            assert isinstance(o['count'],int) and o['count']>0
            assert all(type(o[k]) is bool for k in ['due','renewed','cancelled','restoredAfterLoss'])
            assert not o['renewed'] or o['due']
            assert not o['restoredAfterLoss'] or o['lossReason'] is not None
            assert o['lossReason'] in [None,'cancel-expired','payment-expired','unclassified-expiry']
            assert o['lossReason']!='cancel-expired' or o['cancelled']
            assert r['billingCycle']!='Monthly' or o['due']
            n=o['count'];local['opening']+=n
            for k in ['due','renewed','cancelled','restoredAfterLoss']:local[k]+=n*o[k]
            local['basePayers']+=n*(o['renewed'] or o['restoredAfterLoss'])
            local['lostDuring']+=n*(o['lossReason'] is not None)
            local['cancelAndLoss']+=n*(o['cancelled'] and o['lossReason'] is not None)
            if o['lossReason'] is not None:local[o['lossReason']]+=n
        assert local['opening']==r['opening']
        assert 0<=local['renewed']<=local['due']<=local['opening']
        for k,v in local.items():counts[k]+=v;byline[r['productLine']][k]+=v
    for k in ['opening','due','renewed','cancelled','lostDuring','restoredAfterLoss']:assert counts[k]==m[k],(m['month'],k,counts[k],m[k])
    assert counts['cancel-expired']+counts['payment-expired']+counts['unclassified-expiry']==m['lostDuring']
    assert m['noRightsAtEnd']==m['lostDuring']-m['restoredAfterLoss']
    assert m['closing']==m['opening']-m['noRightsAtEnd']+m['otherInflow']
    assert counts['basePayers']+m['otherInflow']==m['monthlyPayers']
    assert sum(m['closingByProductLine'].values())==m['closing']
    if j<11:assert m['closing']==p['months'][j+1]['opening']
    assert date.fromisoformat(m['renewalObservationEndExclusive'])==date.fromisoformat(m['endExclusive'])+timedelta(days=7)
    assert date.fromisoformat(m['renewalObservationEndExclusive'])<=date.fromisoformat(p['asOf'])
    # Reconcile every named country/app/product/plan/subscription/cycle subset; never average rates.
    fields=['country','appPlatform','productLine','plan','subscriptionPlatform','billingCycle']
    for field in fields:
        totals=defaultdict(int)
        for r in m['records']:totals[r[field]]+=r['opening']
        assert sum(totals.values())==m['opening'];intersections+=len(totals)
    reports.append(dict(month=m['month'],**counts,noRightsAtEnd=m['noRightsAtEnd'],closing=m['closing']))
latest=reports[-1]
assert latest['due']==9940 and latest['renewed']==9443 and latest['opening']==11800
assert latest['lostDuring']==354 and latest['cancelled']==472 and latest['restoredAfterLoss']==59
assert latest['cancelAndLoss']<latest['cancelled'] and latest['cancelAndLoss']<latest['lostDuring']
payments=json.loads((root/'diagnostics.json').read_text())['E']['paymentMonths']['rows']
for month,payment in zip(p['months'],payments):
    assert month['month']==payment['month'] and month['monthlyPayers']==payment['payers'] and month['netIncome']==payment['netIncome']
flow=json.loads((root/'subscription-flow.json').read_text())
assert p['months'][-1]['closingByProductLine']=={line:part['opening'] for line,part in flow['byProductLine'].items()}
report=dict(status='PASS',classification='APPROVED_SYNTHETIC',months=12,jointCells=12*240,accountMonthObservations=sum(m['opening'] for m in p['months']),partitionChecks=intersections,latest=latest,
            limitation='Counts and subset consistency only; no cross-month unique identity, actual event chronology or causal attribution is proven.')

print(json.dumps(report,ensure_ascii=False))
