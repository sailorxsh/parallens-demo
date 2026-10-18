"""Independently reconcile the status snapshots to reviewed pool/subscriber anchors."""
import datetime as dt
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'data'
read=lambda name:json.loads((root/(name+'.json')).read_text())
flow,trend,metrics,snapshot=[read(n) for n in ['subscription-flow','metric-trends','metric-values','snapshot']]
h=flow['statusHistory'];assert h['classification']=='entirely_synthetic' and h['timezone']=='UTC' and h['asOf']==snapshot['asOf'];assert len(h['rows'])==12
first=dt.date.fromisoformat(h['asOf'])-dt.timedelta(days=77)
for i,row in enumerate(h['rows']):
 at=dt.date.fromisoformat(row['at']);assert at==first+dt.timedelta(days=7*i);assert f'{at.month}/{at.day}'==trend['m02']['labels'][i]==trend['m48']['labels'][i];assert set(row['products'])=={'bird','hunting'}
 for key,part in row['products'].items():
  assert set(part)==set(metrics['m05']['value'][key]);assert all(isinstance(n,int) and n>=0 for n in part.values());assert 'free' not in part or key=='bird';assert 'noEntitlement' not in part or key=='hunting'
 total=sum(sum(p.values()) for p in row['products'].values());paid=sum(p['paidCurrent']+p['cancelledButEntitled'] for p in row['products'].values());assert total==trend['m48']['points'][i]['denominator'];assert paid==trend['m02']['points'][i]['value'];assert paid<=total
assert h['rows'][-1]['products']==metrics['m05']['value']==snapshot['subscriptionStatuses'];assert sum(sum(p.values()) for p in h['rows'][-1]['products'].values())==snapshot['boundOwnerAccounts'];assert sum(p['paidCurrent']+p['cancelledButEntitled'] for p in h['rows'][-1]['products'].values())==metrics['m02']['value']==snapshot['effectiveSubscribers']
print('PASS 12 exact dates, 24 exclusive product snapshots, 156 nonnegative state counts, current snapshot and 12 paid/owner anchors; no identity or transition proof claimed')
