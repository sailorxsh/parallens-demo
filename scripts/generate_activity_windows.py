"""Rebuild approved daily synthetic active-window frequencies and current composition."""
import json,math,hashlib
from datetime import date,timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/"data"

def allocate(total,weights,caps=None):
    caps=caps if caps is not None else [total]*len(weights)
    result=[0]*len(weights);left=total;active=[i for i,w in enumerate(weights) if w>0 and caps[i]>0]
    while left:
        assert active and left<=sum(caps[i] for i in active)
        mass=sum(weights[i] for i in active);exact={i:left*weights[i]/mass for i in active};full=[i for i in active if exact[i]>=caps[i]]
        if full:
            for i in full:result[i]=caps[i];left-=caps[i]
            active=[i for i in active if i not in full];continue
        for i in active:result[i]=math.floor(exact[i])
        seats=left-sum(result[i] for i in active)
        for i in sorted(active,key=lambda i:(-(exact[i]-math.floor(exact[i])),i))[:seats]:result[i]+=1
        left=0
    assert sum(result)==total and all(0<=n<=cap for n,cap in zip(result,caps));return result

source=json.loads((ROOT/'data/diagnostics.json').read_text())['B']['chart'];metrics=json.loads((ROOT/'data/metric-values.json').read_text())
weights=[c*a for c in [.65,.18,.10,.07] for a in [.45,.55]]
keys=[dict(country=c,appPlatform=a) for c in ['US','UK','DE','Other'] for a in ['iOS','Android']]
comp1=[11900,12120,11800,12350,12500,11600,11950,12200,12900,12750,12300,12600]
comp7=[28200,28450,28300,28750,29100,28600,28900,29150,29500,30000,29900,29800]
app1=[8100,8300,8000,8350,8500,7700,7950,8100,8700,8600,8200,8400]
app7=[19000,19150,19050,19350,19600,19100,19400,19600,20100,20700,20400,20500]
rows=[]
def daily(values,at,amplitude):
    t=(at-date(2026,7,9)).days/7;i=math.floor(t);fraction=t-i
    left=values[i] if i>=0 else values[0]-(values[1]-values[0]);right=values[min(i+1,11)]
    return round(left+(right-left)*fraction+amplitude*math.sin(2*math.pi*fraction))
for day in range(84):
    at=date(2026,9,24)-timedelta(days=83-day)
    day1=daily(comp1,at,900);day7=daily(comp7,at,250);appday1=daily(app1,at,600);appday7=daily(app7,at,170)
    c30=daily(source['series'][0]['values'],at,35);a30=daily(source['series'][1]['values'],at,25)
    capacity=[day1,day7-day1,c30-day7];frequencies=[]
    # App recency cannot be more recent than composite recency; each account belongs to one cell.
    app_by_age=[appday1,appday7-appday1,a30-appday7]
    for app_age,total in enumerate(app_by_age):
        caps=[n if c<=app_age else 0 for c,n in enumerate(capacity)]
        counts=allocate(total,caps,caps)
        for c,n in enumerate(counts):
            if c<=app_age:frequencies.append(dict(compositeAge=c,appAge=app_age,count=n));capacity[c]-=n
    frequencies += [dict(compositeAge=c,appAge=None,count=n) for c,n in enumerate(capacity)]
    cells=[{**k,'outcomes':[]} for k in keys]
    for f in frequencies:
        for cell,n in zip(cells,allocate(f['count'],weights)):
            if n:cell['outcomes'].append({**f,'count':n})
    rows.append(dict(at=at.isoformat()+'T00:00:00Z',records=cells))

current=rows[-1];cells=[]
for r in current['records']:
    a=sum(o['count'] for o in r['outcomes'] if o['appAge'] is not None);b=sum(o['count'] for o in r['outcomes']);cells.append({**{k:r[k] for k in ['country','appPlatform']},'composite':b,'app':a,'exclusive':{}})
components=metrics['m30']['value']['exclusiveCells']
for app_flag,labels in [(True,['appOnly','appContentOnly','appPushOnly','allThree']),(False,['contentOnly','pushOnly','contentPushOnly'])]:
    caps=[r['app'] if app_flag else r['composite']-r['app'] for r in cells]
    for label in labels:
        counts=allocate(components[label],caps,caps)
        for j,(r,n) in enumerate(zip(cells,counts)):r['exclusive'][label]=n;caps[j]-=n
    assert not any(caps)
proposal=dict(version='synthetic-active-windows-v1',status='approved-synthetic',classification='entirely_synthetic',definition='Rolling 1/7/30-day windows ending at 00:00 UTC; most recent day is the preceding complete UTC date',asOf='2026-09-24T00:00:00Z',rows=rows,currentComposition=cells,
 limits=['84 independent daily snapshot frequencies; existing 12 weekly MAU anchors preserved; no cross-snapshot account identity or real events','Country and App platform attribution is fixed in the sample','Product/model attribution is absent and must remain pending, not independently multiplied into these facts','New App DAU/WAU are synthetic additions; existing overall anchors remain unchanged','No inference of causality or calendar-month retention'])
(OUT/'activity-window-facts.json').write_text(json.dumps(proposal,ensure_ascii=False,indent=2)+'\n')
print('APPROVED_SYNTHETIC',len(rows),'daily snapshots',len(rows)*len(keys),'joint cells')

metrics['m25']['value'].update(appDAU=8400,appWAU=20500)
(ROOT/'data/metric-values.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
