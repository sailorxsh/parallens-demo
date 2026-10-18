"""Audit necessary set bounds between calendar retention and rolling composite MAU.

This detects conflicts under the displayed whole-population definition. Passing
these necessary bounds is not proof of a shared account-level event source.
"""
import argparse
import json
import re
from datetime import date,timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--history',type=Path)
args=parser.parse_args()
load=lambda name:json.loads((ROOT/'data'/f'{name}.json').read_text())
trends=load('metric-trends');snapshot=load('snapshot');diagnostics=load('diagnostics')
history=json.loads(args.history.read_text()) if args.history else trends['m24']
def ordinal(month):
    y,m=map(int,month.split('-'));return y*12+m-1
def month(value):return f'{value//12:04d}-{value%12+1:02d}'
def start(value):return date.fromisoformat(value+'-01')
# The old explicit calculation table supplies years missing from its 7月/8月 axis.
legacy={}
for table in diagnostics['B']['tables']:
    if table['title']=='完整月与新客留存批次':
        for row in table['rows']:
            found=re.match(r'^(\d{4})-(\d{2})→(\d{2})',str(row[0]))
            if found:
                y,b,o=map(int,found.groups());legacy[f'{o}月']=f'{y+(o<b):04d}-{o:02d}'
points=[];active={};errors=[]
if len(history['labels'])!=len(history['points']):errors.append('History labels and points differ in length')
def assign_active(month,count):
    if month in active and active[month]!=count:errors.append('Conflicting calendar active count for '+month)
    active[month]=count
for label,raw in zip(history['labels'],history['points']):
    observed=raw.get('observedMonth') or (label if re.fullmatch(r'\d{4}-\d{2}',label) else legacy[label])
    base=raw.get('baseMonth',month(ordinal(observed)-1));n,d=raw['numerator'],raw['denominator']
    if ordinal(observed)-ordinal(base)!=1 or type(n) is not int or type(d) is not int or not(0<=n<=d):errors.append('Invalid consecutive cohort or subset count')
    assign_active(base,d)
    if 'activeObserved' in raw:assign_active(observed,raw['activeObserved'])
    points.append({'baseMonth':base,'observedMonth':observed,'retained':n,'baseActive':d})
pairs=[]
for point in points:
    observed=point['observedMonth']
    if observed not in active:continue
    current=active[observed];n=point['retained'];d=point['baseActive']
    if n>current:errors.append('Retained users exceed observation-month active users')
    pairs.append({**point,'observedActive':current,'unionUpperBound':d+current-n})
asof=date.fromisoformat(snapshot['asOf']);rolling=trends['m04'];checks=[];unbounded=[]
for i,(label,raw) in enumerate(zip(rolling['labels'],rolling['points'])):
    at=asof-timedelta(days=7*(len(rolling['labels'])-1-i))
    assert label==f'{at.month}/{at.day}'
    # Conservative envelope covers both start-of-day/exclusive and end-of-day
    # interpretations; only compare when either whole window fits the same pair.
    first,last=at-timedelta(days=30),at+timedelta(days=1)
    eligible=[p for p in pairs if first>=start(p['baseMonth']) and last<=start(month(ordinal(p['observedMonth'])+1))]
    if not eligible:unbounded.append({'at':at.isoformat(),'reason':'No complete calendar pair bounds this entire rolling window'});continue
    for pair in eligible:
        checks.append({'at':at.isoformat(),'rollingActive':raw['value'],**pair,'excess':max(0,raw['value']-pair['unionUpperBound']),
                       'passed':raw['value']<=pair['unionUpperBound']})
conflicts=[c for c in checks if not c['passed']]
result={'status':'CONFLICT' if errors or conflicts else 'NECESSARY_BOUNDS_SATISFIED' if checks else 'INSUFFICIENT_BOUNDS',
        'assumption':'Monthly retention represents the displayed complete composite-active population; if it is a separate sample its boundary must be declared.',
        'scopeLimit':'Counts and necessary set bounds only, not account-level identity or event linkage.',
        'errors':errors,'pairs':pairs,'checks':checks,'conflicts':conflicts,'unbounded':unbounded}
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(1 if errors or conflicts else 0 if checks else 2)
