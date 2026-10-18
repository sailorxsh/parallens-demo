"""Rebuild approved synthetic device retention frequencies; never production event logs."""
from datetime import datetime,date,timedelta,timezone
from pathlib import Path
from collections import Counter
import hashlib,json,math
ROOT=Path(__file__).resolve().parents[1]/'data'
AS_OF=date(2026,9,24)
COUNTRIES={'US':.65,'UK':.18,'DE':.10,'Other':.07}
MODELS={'K6':.11,'Bird Lite':.35,'Bird Pro':.31,'Hunt Pro':.23}
CHANNELS={'Amazon':.7,'Shopify':.3}
TOTAL=[1800,1850,1900,1950,2000,2050,2000,2000,2100,2150,2200,2250]
D7=[1512,1535,1558,1599,1640,1661,1620,1600,1659,1677,1694,None]
D30=[1386,1406,1444,1463,1500,1517,1470,1450,None,None,None,None]
def allocate(total,weights):
 exact=[total*w/sum(weights) for w in weights];counts=[math.floor(v) for v in exact]
 for i in sorted(range(len(exact)),key=lambda i:(-(exact[i]-counts[i]),i))[:total-sum(counts)]:counts[i]+=1
 return counts
def score(identity,salt):return int.from_bytes(hashlib.sha256((salt+identity).encode()).digest()[:8],'big')/2**64
cohorts=[]
for i,total in enumerate(TOTAL):
 start=date(2026,6,29)+timedelta(weeks=i);end=start+timedelta(days=6)
 dimensions=[(country,model,channel) for country in COUNTRIES for model in MODELS for channel in CHANNELS]
 sizes=allocate(total,[COUNTRIES[c]*MODELS[m]*CHANNELS[s] for c,m,s in dimensions])
 people=[]
 for (country,model,channel),size in zip(dimensions,sizes):
  for j in range(size):
   key=f'{start}:{country}:{model}:{channel}:{j}'
   penalty={'K6':.10,'Bird Lite':.025,'Bird Pro':0,'Hunt Pro':.04}[model]+(.025 if channel=='Shopify' else 0)
   people.append({'key':key,'country':country,'deviceModel':model,'salesChannel':channel,'position':j,
    's7':score(key,'7')+penalty,'s30':.60*score(key,'7')+.40*score(key,'30')+penalty})
 keep7={r['key'] for r in sorted(people,key=lambda r:r['s7'])[:D7[i]]} if D7[i] is not None else None
 keep30={r['key'] for r in sorted(people,key=lambda r:r['s30'])[:D30[i]]} if D30[i] is not None else None
 records=[]
 for country,model,channel in dimensions:
  part=[r for r in people if (r['country'],r['deviceModel'],r['salesChannel'])==(country,model,channel)]
  frequencies=Counter((None if keep7 is None else r['key'] in keep7,None if keep30 is None else r['key'] in keep30) for r in part)
  records.append({'country':country,'productLine':'Hunting' if model=='Hunt Pro' else 'Bird','deviceModel':model,
    'salesChannel':channel,'entryDeviceStatus':'Effective','activated':len(part),
    'outcomeCounts':[{'D7':a,'D30':b,'count':n} for (a,b),n in sorted(frequencies.items(),key=lambda r:str(r[0]))]})
 mature={f'D{day}':AS_OF>=end+timedelta(days=day+1) for day in [7,30]}
 cohorts.append({'id':start.isoformat(),'start':start.isoformat(),'end':end.isoformat(),'activated':total,
  'observationEndExclusive':{f'D{day}':(end+timedelta(days=day+1)).isoformat() for day in [7,30]},
  'mature':mature,'records':records})
source={'status':'approved-synthetic','classification':'entirely_synthetic','version':'synthetic-device-retention-v1','asOf':AS_OF.isoformat(),
 'timezone':'UTC','cohortUnit':'complete Monday-Sunday activation week; first image/video day is D0',
 'defaultCohort':'2026-08-17','population':'Activation occurred while App-bound and not deactivated; entryDeviceStatus frozen at first image/video. Later disposal or unbinding does not remove devices.',
 'measurement':'D7/D30 are exact UTC calendar-day effective-device behavior; heartbeat excluded. Not a cumulative seven/thirty-day return window. D30 is not a subset of D7.',
 'identity':'Illustrative immutable identities can be enumerated per fixed synthetic outcome cell; not linked to existing binding or device-activity event sources.',
 'cohorts':cohorts}
(ROOT/'device-retention-facts.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
print('Rebuilt approved synthetic source',sum(TOTAL),'synthetic devices compressed into',sum(len(c['records']) for c in cohorts),'joint cells')
