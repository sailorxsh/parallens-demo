"""Rebuild approved synthetic UTC-day Session frequencies; preserve active accounts."""
import datetime as dt
import hashlib
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
original=(ROOT/'data/activity-window-facts.json').read_bytes()
active=json.loads(original)

def allocate(total,weights):
    exact=[total*w/sum(weights) for w in weights]
    result=[math.floor(v) for v in exact]
    order=sorted(range(len(weights)),key=lambda i:(-(exact[i]-result[i]),i))
    for i in order[:total-sum(result)]:result[i]+=1
    return result

def frequency(n,sessions):
    extra=sessions-n
    assert 0<=extra<=3*n
    four=min(max(round(n*.05),max(0,extra-2*n)),min(n,extra//3))
    lower=max(0,extra-n-2*four)
    upper=min(n-four,(extra-3*four)//2)
    three=min(max(round(n*.25),lower),upper)
    two=extra-3*four-2*three
    one=n-four-three-two
    result=[[1,one],[2,two],[3,three],[4,four]]
    assert min(one,two,three,four)>=0
    assert sum(c for _,c in result)==n and sum(k*c for k,c in result)==sessions
    return result

rows=[]
country_factor={'US':1.04,'UK':.98,'DE':1.01,'Other':.94}
for i,raw in enumerate(active['rows']):
    counts=[sum(o['count'] for o in r['outcomes'] if o['appAge']==0) for r in raw['records']]
    mean=1.98+.13*i/83+.13*math.sin(i*.31)+.05*math.cos(i*.12)
    if i==83:mean=2.1
    sessions=round(sum(counts)*mean)
    weights=[n*(1.15 if r['appPlatform']=='iOS' else .90)*country_factor[r['country']] for n,r in zip(counts,raw['records'])]
    extras=allocate(sessions-sum(counts),weights)
    p50=round(235+35*i/83+18*math.sin(i*.23))
    p90=round(1320+240*i/83+105*math.sin(i*.19))
    if i==83:p50,p90=270,1560
    def scale(v):
        if v<=270:return round(v*p50/270)
        if v<=1560:return round(p50+(v-270)*(p90-p50)/1290)
        return round(v*p90/1560)
    points=list(map(scale,[30,90,180,270,420,900,1560,2100]))
    cells=[]
    for j,(r,n,e) in enumerate(zip(raw['records'],counts,extras)):
        s=n+e
        profile=[12,16,25,20,12,7,5,3] if r['appPlatform']=='iOS' else [5,10,18,25,15,12,10,5]
        change={'US':1,'UK':0,'DE':-1,'Other':0}[r['country']]
        profile[0]+=change;profile[5]-=change
        cells.append({'country':r['country'],'appPlatform':r['appPlatform'],'activeAccounts':n,
                      'accountSessionFrequency':frequency(n,s),
                      'durationSecondsFrequency':list(zip(points,allocate(s,profile)))})
    end=dt.datetime.fromisoformat(raw['at'].replace('Z','+00:00'))
    rows.append({'endExclusive':raw['at'],'startInclusive':(end-dt.timedelta(days=1)).isoformat().replace('+00:00','Z'),'cells':cells})

source={'version':'synthetic-session-day-v1','status':'approved-synthetic','classification':'entirely_synthetic','metricId':26,
        'asOf':active['asOf'],'period':'rolling-1-day-at-UTC-midnight','rows':rows,
        'lineage':{'file':'data/activity-window-facts.json','sha256':hashlib.sha256(original).hexdigest(),'reuse':'Only each daily country×App-platform active account count; session counts and duration frequencies are newly constructed.'},
        'rules':['正式主账号，有效App前台会话；匿名与无主账号会话不计入。',
                         '首次有效前台交互开始会话；连续30分钟无有效前台交互后再交互记新会话；UTC零时切分。',
                         '时长累计该会话前台区间，后台挂起不计入；缺起止或非正时长不作有效时长样本。',
                         '本合成场景所有构造会话均有合格时长；正式接入须分别披露会话总数与合格时长样本数。',
                         '人均次数按Session总数／本日App主动活跃主账号；分位数按合并后的Session时长频数用R7计算。'],
        'limitations':['口径已确认，全部为合成频数，不是生产日志。',
                       '以新构造频数演示，不从现有P50/P90反推真实分布。',
                       '国家与平台沿用#25的样例固定归属，不代表实际Session客户端份额；生产需明确跨平台归属和去重。',
                       '没有跨日用户身份链，不把84日活跃人数相加作为84日独立用户。',
                       '当前仅国家×App平台可重算；App版本、用户类型及逐用户下钻仍缺归属来源。',
                       '1—4次是本合成场景采用的频次取值，不是业务上限。',
                       '三条趋势使用独立纵轴，只比较各自的方向；频次不等于打开间隔或留存。']}
p=ROOT/'data/diagnostics.json'
d=json.loads(p.read_text());d['B']['sessionDepth']=source
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
assert (ROOT/'data/activity-window-facts.json').read_bytes()==original
print('PASS approved Session daily source: 84 days, 672 cells; active account source unchanged')
