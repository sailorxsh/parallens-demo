"""Extend the audited two-cohort sample into a 12-week synthetic trial fact fixture."""
import json
from datetime import date, timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SAMPLE=json.loads((ROOT/'planning/simulation/trial-facts.json').read_text())['records']
WEEKS=json.loads((ROOT/'prototype/data/weekly.json').read_text())
TEMPLATES={period:[row for row in SAMPLE if row['period']==period] for period in ['previous','current']}
rows=[]
for week in WEEKS:
    period='previous' if week['week']<=9 else 'current'
    ended=date.fromisoformat(week['weekEnd'])
    hunt_index=0
    for template in TEMPLATES[period]:
        row={**template}
        suffix=template['trial_id'].split('-')[-1]
        row['trial_id']=f'SIM-W{week["week"]:02d}-{suffix}'
        row['user_id']=f'SIM-U-W{week["week"]:02d}-{suffix}'
        row['week']=week['week']
        row['maturity_week_end']=week['weekEnd']
        row['trial_started_at']=str(ended-timedelta(days=7))
        row['trial_ended_at']=week['weekEnd']
        row['outcome_observed_through']=str(ended+timedelta(days=3))
        # Keep the audited Bird/Android/Plus monthly cohort intact. Additional
        # dimensions are attached to the same trial records, never multiplied.
        if row['product_line']=='Hunting':
            row['plan']=['Starter','Plus','Pro'][hunt_index%3]
            hunt_index+=1
        index=int(suffix)
        row['subscription_platform']=('App Store' if index%5 else 'Web') if row['app_platform']=='iOS' else ('Google Play' if index%5 else 'Web')
        row['billing_cycle']='annual' if row['plan']!='Plus' and index%4==0 else 'monthly'
        rows.append(row)

# Give every paid product line a usable trial history while preserving each
# audited weekly total and the Bird/Android/Plus payment-failure comparison.
for week in WEEKS:
    cohort=[row for row in rows if row['week']==week['week']]
    donors=[row for row in cohort if row['product_line']=='Bird' and row['plan']=='Pro' and row['converted']]
    recipients=[row for row in cohort if row['product_line']=='Hunting']
    key=lambda row:(int(row['trial_id'].split('-')[-1])*7919)%10007
    count=108 if week['week']<=9 else 92
    for donor,recipient in zip(sorted(donors,key=key)[:count],sorted(recipients,key=key)[:count]):
        donor.update(converted=False,payment_attempted=False,payment_status='not_attempted')
        recipient.update(converted=True,payment_attempted=True,payment_status='succeeded')

assert len(rows)==12000 and len({row['trial_id'] for row in rows})==12000
for week in WEEKS:
    data=[r for r in rows if r['week']==week['week']]
    expected=450 if week['week']<=9 else 434
    assert len(data)==1000 and sum(r['converted'] for r in data)==expected
    focus=[r for r in data if r['product_line']=='Bird' and r['app_platform']=='Android' and r['plan']=='Plus']
    assert len(focus)==400
    assert sum(r['payment_status']=='failed' for r in focus)==(6 if week['week']<=9 else 22)
    assert sum(r['converted'] for r in focus)==(194 if week['week']<=9 else 178)
# Readiness examples are disjoint aggregate buckets, not trial outcome facts.
# Null means observation is unfinished; an absent bucket means no example.
readiness_groups=[
 ('US','Android','Bird','Google Play','Plus','monthly',120,100),
 ('UK','iOS','Bird','App Store','Pro','annual',80,68),
 ('DE','Android','Hunting','Google Play','Starter','monthly',60,49),
 ('US','iOS','Hunting','App Store','Plus','monthly',40,31),
]
readiness_rows=[]
for end,observed in [('2026-09-20','2026-09-23'),('2026-09-27','2026-09-30')]:
    for country,app,product,platform,plan,cycle,expected,received in readiness_groups:
        readiness_rows.append(dict(batch_end=end,observation_end=observed,country=country,
            app_platform=app,product_line=product,subscription_platform=platform,plan=plan,
            billing_cycle=cycle,expected_outcomes=expected,
            received_outcomes=received if observed<='2026-09-24' else None))
artifact={
 'classification':'entirely_synthetic',
 'scenario':'12 mature trial weeks; W1-W9 baseline and W10-W12 change',
 'grain':'one completed trial per synthetic user; at most one payment attempt in this fixture',
 'timezone':'UTC',
 'latest_complete_week':WEEKS[-1]['weekEnd'],
 'dimensions':['week','country','app_platform','product_line','subscription_platform','plan','billing_cycle'],
 'limitations':['Synthetic demonstration; no real person or transaction.','Starter exists only for Hunting; Free is not a paid trial.','Payment failure association does not establish cause.','Other is a residual geography, not a country.'],
 'records':rows,
 'readiness':{
   'as_of':'2026-09-24',
   'classification':'entirely_synthetic',
   'grain':'disjoint batch x business-dimension aggregate buckets; separate from mature trial facts',
   'coverage':'selected example intersections only; absence is unknown, never zero',
   'records':readiness_rows,
 },
}
path=ROOT/'prototype/data/trial-facts.json'
path.write_text(json.dumps(artifact,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'{len(rows)} records -> {path} ({path.stat().st_size} bytes)')
