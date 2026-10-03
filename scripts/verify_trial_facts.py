"""Check synthetic trial facts against the D-page story and filtered aggregations."""
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

DATA=Path(__file__).resolve().parents[1]/'data'
artifact=json.loads((DATA/'trial-facts.json').read_text())
rows=artifact['records']
weeks=json.loads((DATA/'weekly.json').read_text())
assert len(rows)==12000
assert all(r['cohort_mature'] for r in rows)
assert len({r['trial_id'] for r in rows})==len(rows)
assert len({r['user_id'] for r in rows})==len(rows)
assert all((date.fromisoformat(r['trial_ended_at'])-date.fromisoformat(r['trial_started_at'])).days==7 for r in rows)
assert all((date.fromisoformat(r['outcome_observed_through'])-date.fromisoformat(r['trial_ended_at'])).days==3 for r in rows)
assert all(not r['converted'] or (r['payment_attempted'] and r['payment_status']=='succeeded') for r in rows)
assert all(r['payment_status']!='failed' or r['payment_attempted'] for r in rows)
assert all(r['plan'] in ({'Free','Plus','Pro'} if r['product_line']=='Bird' else {'Starter','Plus','Pro'}) for r in rows)
assert all(r['subscription_platform'] in ({'App Store','Web'} if r['app_platform']=='iOS' else {'Google Play','Web'}) for r in rows)
assert {'monthly','annual'}=={r['billing_cycle'] for r in rows}

def agg(items):
    return len(items),sum(r['converted'] for r in items),sum(r['payment_status']=='failed' for r in items)

for w in weeks:
    cohort=[r for r in rows if r['week']==w['week']]
    assert {r['maturity_week_end'] for r in cohort}=={w['weekEnd']}
    assert agg(cohort)[:2]==(1000,w['trialMaturity']['converted'])
    target=[r for r in cohort if r['product_line']=='Bird' and r['app_platform']=='Android' and r['plan']=='Plus']
    assert len(target)==400 and sum(r['payment_attempted'] for r in target)==200
    assert sum(r['payment_status']=='failed' for r in target)==(6 if w['week']<=9 else 22)
    assert sum(r['converted'] for r in target)==(194 if w['week']<=9 else 178)
    hunting=[r for r in cohort if r['product_line']=='Hunting']
    assert {r['plan'] for r in hunting}=={'Starter','Plus','Pro'}
    assert sum(r['converted'] for r in hunting)==(108 if w['week']<=9 else 92)
    for dimension in ['country','app_platform','subscription_platform','plan','billing_cycle']:
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
assert len([r for r in rows if r['week']==12 and r['country']=='Other' and r['product_line']=='Bird' and r['plan']=='Plus'])==20
readiness=artifact['readiness']
assert readiness['as_of']==json.loads((DATA/'snapshot.json').read_text())['asOf']
examples=readiness['records']
assert len(examples)==8
assert len({tuple(r[key] for key in ['batch_end','country','app_platform','product_line','subscription_platform','plan','billing_cycle']) for r in examples})==8
for r in examples:
    assert r['batch_end']>artifact['latest_complete_week']
    assert (date.fromisoformat(r['observation_end'])-date.fromisoformat(r['batch_end'])).days==3
    assert r['expected_outcomes']>0
    if r['observation_end']>readiness['as_of']:
        assert r['received_outcomes'] is None
    else:
        assert 0<=r['received_outcomes']<r['expected_outcomes']
    assert 'converted' not in r and 'user_id' not in r
    assert r['plan'] in ({'Plus','Pro'} if r['product_line']=='Bird' else {'Starter','Plus','Pro'})
    assert r['subscription_platform'] in ({'App Store','Web'} if r['app_platform']=='iOS' else {'Google Play','Web'})
assert sum(r['expected_outcomes'] for r in examples if r['batch_end']=='2026-09-20')==300
assert sum(r['received_outcomes'] for r in examples if r['batch_end']=='2026-09-20')==248
print('PASS 12,000 mature trial facts unchanged; 8 independent readiness buckets, unfinished observation, missing outcomes, filterable business dimensions')
