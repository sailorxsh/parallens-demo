"""Check synthetic trial facts against the D-page story and filtered aggregations."""
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

DATA=Path(__file__).resolve().parents[1]/'data'
rows=json.loads((DATA/'trial-facts.json').read_text())['records']
weeks=json.loads((DATA/'weekly.json').read_text())
assert len(rows)==12000
assert len({r['trial_id'] for r in rows})==len(rows)
assert len({r['user_id'] for r in rows})==len(rows)
assert all((date.fromisoformat(r['trial_ended_at'])-date.fromisoformat(r['trial_started_at'])).days==7 for r in rows)
assert all((date.fromisoformat(r['outcome_observed_through'])-date.fromisoformat(r['trial_ended_at'])).days==3 for r in rows)
assert all(not r['converted'] or (r['payment_attempted'] and r['payment_status']=='succeeded') for r in rows)
assert all(r['payment_status']!='failed' or r['payment_attempted'] for r in rows)

def agg(items):
    return len(items),sum(r['converted'] for r in items),sum(r['payment_status']=='failed' for r in items)

for w in weeks:
    cohort=[r for r in rows if r['week']==w['week']]
    assert {r['maturity_week_end'] for r in cohort}=={w['weekEnd']}
    assert agg(cohort)[:2]==(1000,w['trialMaturity']['converted'])
    target=[r for r in cohort if r['app_platform']=='Android' and r['plan']=='Plus']
    assert len(target)==400 and sum(r['payment_attempted'] for r in target)==200
    assert sum(r['payment_status']=='failed' for r in target)==(6 if w['week']<=9 else 22)
    assert sum(r['converted'] for r in target)==(194 if w['week']<=9 else 178)
    for dimension in ['country','app_platform','plan']:
        groups=defaultdict(list)
        for row in cohort:groups[row[dimension]].append(row)
        assert sum(agg(group)[0] for group in groups.values())==1000
        assert sum(agg(group)[1] for group in groups.values())==w['trialMaturity']['converted']

prior=[r for r in rows if r['week']<=9]
recent=[r for r in rows if r['week']>=10]
assert agg(prior)[:2]==(9000,4050)
assert agg(recent)[:2]==(3000,1302)
assert round(100*(1302/3000-4050/9000),1)==-1.6
# Multidimensional intersections retain their actual record count and rate.
for country,platform,plan in [('US','Android','Plus'),('UK','iOS','Pro'),('DE','Android','Pro')]:
    selected=[r for r in recent if r['country']==country and r['app_platform']==platform and r['plan']==plan]
    assert len(selected)>0
    assert sum(r['converted'] for r in selected)<=len(selected)
assert not [r for r in rows if r['country']=='FR']
assert len([r for r in rows if r['week']==12 and r['country']=='Other' and r['plan']=='Plus'])==20
print('PASS 12,000 synthetic trial facts: cohort windows, payments, 12 weekly totals, cross-filter intersections, small/empty samples')
