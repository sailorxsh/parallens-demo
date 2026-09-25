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
        rows.append(row)

assert len(rows)==12000 and len({row['trial_id'] for row in rows})==12000
for week in WEEKS:
    data=[r for r in rows if r['week']==week['week']]
    expected=450 if week['week']<=9 else 434
    assert len(data)==1000 and sum(r['converted'] for r in data)==expected
    assert sum(r['payment_status']=='failed' for r in data if r['plan']=='Plus')==(6 if week['week']<=9 else 22)
    assert sum(r['converted'] for r in data if r['plan']=='Plus')==(194 if week['week']<=9 else 178)
artifact={
 'classification':'entirely_synthetic',
 'scenario':'12 mature trial weeks; W1-W9 baseline and W10-W12 change',
 'grain':'one completed trial per synthetic user; at most one payment attempt in this fixture',
 'timezone':'UTC',
 'latest_complete_week':WEEKS[-1]['weekEnd'],
 'dimensions':['week','country','app_platform','product_line','plan'],
 'limitations':['Synthetic demonstration; no real person or transaction.','Only monthly Plus/Pro trials across Bird/Hunting.','Payment failure association does not establish cause.','Other is a residual geography, not a country.'],
 'records':rows,
}
path=ROOT/'prototype/data/trial-facts.json'
path.write_text(json.dumps(artifact,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'{len(rows)} records -> {path} ({path.stat().st_size} bytes)')
