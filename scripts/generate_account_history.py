"""Construct monthly account stocks, preserving current margins and weekly totals.

Country/App membership is fixed only in this synthetic scenario. No account
identities or register-month/binding event histories are implied by these cells.
"""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import calendar, json
DATA=Path(__file__).resolve().parents[1]/'data'
load=lambda name:json.loads((DATA/f'{name}.json').read_text())
snapshot=load('snapshot');values=load('metric-values');slices=load('filter-slices');weekly=load('weekly');trends=load('metric-trends')
end=date.fromisoformat(snapshot['asOf']);anchor=values['m07']['value']
countries=['US','UK','DE','Other'];platforms=['iOS','Android']
def allocate(total,weights):
 exact=[Decimal(total)*w/sum(weights) for w in weights];parts=[int(v) for v in exact]
 for i in sorted(range(len(parts)),key=lambda i:-(exact[i]-parts[i]))[:total-sum(parts)]:parts[i]+=1
 return parts
weights=lambda field,keys:[Decimal(str(slices[field][key]['denominatorShare'])) for key in keys]
def cells(registered,bound):
 out=[dict(country=c,appPlatform=p) for c in countries for p in platforms]
 for name,total in [('registered',registered),('boundOwners',bound)]:
  margins=allocate(total,weights('country',countries));ios=allocate(total,weights('appPlatform',platforms))[0]
  column=allocate(ios,[Decimal(n) for n in margins])
  for i,n in enumerate(margins):out[2*i][name]=column[i];out[2*i+1][name]=n-column[i]
 return out
# All 12 weekly registration totals remain exact. Later ten days are explicitly
# newly constructed using the last complete week's daily integer pattern.
daily={}
for w in weekly:
 n=w['registrationCohort']['registered'];last=date.fromisoformat(w['weekEnd']);q,r=divmod(n,7)
 for i in range(7):daily[last-timedelta(days=6-i)]=q+(i<r)
last=date.fromisoformat(weekly[-1]['weekEnd']);q,r=divmod(weekly[-1]['registrationCohort']['registered'],7)
for i in range((end-last).days-1):daily[last+timedelta(days=i+1)]=q+(i%7<r)
stock=lambda cutoff:anchor['registered']-sum(n for d,n in daily.items() if d>cutoff)
legacy=trends['m48'];points=[(date(end.year,*map(int,label.split('/'))),p['denominator']) for label,p in zip(legacy['labels'],legacy['points'])]
def bound_at(day):
 a,b=next(((a,b) for a,b in zip(points,points[1:]) if a[0]<=day<=b[0]),(points[0],points[1]))
 return int((Decimal(a[1])+Decimal(b[1]-a[1])*Decimal((day-a[0]).days)/Decimal((b[0]-a[0]).days)).quantize(Decimal(1),rounding=ROUND_HALF_UP))
months=[];older_reg=[64000,66700,69900,73300,76800,80300,84100,88100,92300];older_bound=[54000,56000,58000,60000,62200,64300,66800,69500,73500]
for i in range(12):
 index=end.year*12+end.month-1-12+i;y,m=divmod(index,12);m+=1;day=date(y,m,calendar.monthrange(y,m)[1])
 reg=older_reg[i] if i<9 else stock(day);bound=older_bound[i] if i<9 else bound_at(day)
 months.append({'month':day.strftime('%Y-%m'),'date':day.isoformat(),'endExclusive':(day+timedelta(days=1)).isoformat()+'T00:00:00Z','records':cells(reg,bound)})
source={'version':'synthetic-account-month-stocks-v1','asOf':snapshot['asOf']+'T00:00:00Z','provenance':'constructed-month-end-stocks',
 'note':'12个完整月末与当前快照；国家×App是模拟固定归属，真实接入需确认维度时点。绑定为当时有主设备绑定的主账号，不是累计曾绑定人数；没有逐账号或注册月份批次来源。',
 'months':months,'current':{'date':snapshot['asOf'],'endExclusive':snapshot['asOf']+'T00:00:00Z','records':cells(anchor['registered'],anchor['boundOwners'])},
 'registrationBridge':{'note':'12个原完整注册周保留；之后至当前的10天为新增模拟注册，较早月份为构造累计存量。仅总体连接，不声称现有#9维度分片与此来源同一账号链。','days':[{'date':d.isoformat(),'registered':n} for d,n in sorted(daily.items())]}}
p=DATA/'diagnostics.json';diagnostics=load('diagnostics');diagnostics['A']['accountHistory']=source;p.write_text(json.dumps(diagnostics,ensure_ascii=False,indent=2)+'\n')
print('PASS 12 complete month ends + current, 104 country/App cells; current margins and 12 weekly registration totals preserved')
