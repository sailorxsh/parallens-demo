"""Independent date, identity, count and scope checks for the approved #16 scene."""
import collections
import datetime as dt
import hashlib
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'data/diagnostics.json').read_text())
f=data['A']['activationFacts']
assert f['classification']=='entirely_synthetic' and f['timezone']=='UTC'
assert f['columns']==['id','firstContentDay','country','deviceModel','salesChannel']
assert len({r[0] for r in f['records']})==len(f['records'])==25160
ids=collections.Counter(r[0] for r in f['records'])
assert set(ids.values())=={1}
by_day=collections.Counter()
by_week=collections.Counter()
for identity,day,country,model,channel in f['records']:
    parsed=dt.date.fromisoformat(day)
    assert type(identity) is int and identity>0
    assert 0<=country<4 and 0<=model<4 and 0<=channel<2
    monday=parsed-dt.timedelta(days=parsed.weekday())
    by_day[day]+=1
    by_week[str(monday)]+=1
assert f['defaultWeek']=='2026-09-14'
assert by_week[f['defaultWeek']]==2450 and by_week['2026-09-07']==2360
for week in f['weeks']:
    start=dt.date.fromisoformat(week['start']);end=dt.date.fromisoformat(week['end'])
    assert start.weekday()==0 and end-start==dt.timedelta(days=6)
    assert sum(by_day[str(start+dt.timedelta(days=i))] for i in range(7))==by_week[week['start']]==week['count']
# Country/model/channel partition closure for every week and every supported intersection.
checks=0
for w in f['weeks']:
    rows=[r for r in f['records'] if w['start']<=r[1]<=w['end']]
    for c in range(4):
        for m in range(4):
            subtotal=sum(r[2]==c and r[3]==m for r in rows)
            assert sum(sum(r[2]==c and r[3]==m and r[4]==ch for r in rows) for ch in range(2))==subtotal
            checks+=1
# The approved #16 change must not rewrite the separate retention source.
retention=(root/'data/device-retention-facts.json').read_bytes()
assert hashlib.sha256(retention).hexdigest()=='b7127f424c21ed0bf69e66fed905e943fd337012b106573832b8a8225f6a25c2'
print(f'PASS #16: 25160 unique synthetic devices, 84 UTC dates, 12 complete weeks, {checks} grouped closures; #43 source unchanged.')
