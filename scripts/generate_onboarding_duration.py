"""Rebuild approved synthetic onboarding frequencies, preserving all reviewed weekly totals."""
import json
import math
from datetime import date, timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'
load=lambda name:json.loads((ROOT/'data'/f'{name}.json').read_text())
weekly=load('weekly')


def allocate(total,weights):
    exact=[total*x/sum(weights) for x in weights]
    result=[math.floor(x) for x in exact]
    for i in sorted(range(len(weights)),key=lambda i:(-(exact[i]-result[i]),i))[:total-sum(result)]:result[i]+=1
    assert sum(result)==total and all(type(x)is int and x>=0 for x in result)
    return result


def quantile(freq,p):
    total=sum(count for _,count in freq)
    if total<30:return None
    rank=(total-1)*p
    def value_at(index):
        seen=0
        for value,count in sorted(freq):
            seen+=count
            if seen>index:return value
    low,high=math.floor(rank),math.ceil(rank)
    return value_at(low)+(value_at(high)-value_at(low))*(rank-low)



def summarize(rows):
    n=sum(sum(count for _,count in row['durationCounts']) for row in rows)
    d=sum(row['eligible'] for row in rows)
    freq={}
    for row in rows:
        for seconds,count in row['durationCounts']:freq[seconds]=freq.get(seconds,0)+count
    return dict(numerator=n,denominator=d,value=n/d if d else None,
                p50Seconds=quantile(freq.items(),.5),p90Seconds=quantile(freq.items(),.9),
                durationCount=n,frequency=sorted(freq.items()))


models={'K6':.1113,'Bird Lite':.3477,'Bird Pro':.3129,'Hunt Pro':.2281}
platforms={'iOS':.45,'Android':.55}
versions=['Demo 1.1.0','Demo 1.2.0','Demo 1.2.1']
causes_table=next(t for t in load('diagnostics')['A']['tables'] if t['title']=='首次绑定失败原因 · W12')
causes=[row[0] for row in causes_table['rows'] if row[0]!='合计']
binding=[];activation=[];checks=[]
for w in weekly:
    week=w['week'];end=date.fromisoformat(w['weekEnd']);late=week>=9
    groups=[dict(appPlatform=p,deviceModel=m,appVersion=v,deviceStatus='Effective')
            for p in platforms for m in models for v in versions]
    version_weights=[.35,.45,.20] if not late else [.15,.35,.50]
    weights=[platforms[r['appPlatform']]*models[r['deviceModel']]*version_weights[versions.index(r['appVersion'])] for r in groups]
    success_weights=[x*(.92 if r['appPlatform']=='Android' and r['deviceModel']=='K6' else 1.04 if r['deviceModel']=='Bird Pro' else 1)
                     for x,r in zip(weights,groups)]
    success=allocate(w['bindingAttempts']['successful'],success_weights)
    # A failure belongs to one cause and one group; W12 preserves all three original cause counts.
    totals=[row[1] for row in causes_table['rows'] if row[0]!='合计'] if week==12 else [80+week%5,75-week%5,45]
    failures=[allocate(count,[x*(1.3 if r['appPlatform']=='Android' and r['deviceModel']=='K6' else 1)
                             for x,r in zip(weights,groups)]) for count in totals]
    records=[]
    for i,(r,n) in enumerate(zip(groups,success)):
        times=[20,40,60,90,120,180,240,360,600,900,1500,2400]
        base=[1,3,6,8,10,10,6,4,2,1,.4,.2]
        tilt=(1.07 if r['appPlatform']=='Android' else .97)*(1.10 if r['deviceModel']=='K6' else .97)
        if late and r['appVersion']=='Demo 1.2.1':tilt*=1.12
        counts=allocate(n,[weight*tilt**(j-5) for j,weight in enumerate(base)])
        failed={cause:parts[i] for cause,parts in zip(causes,failures)}
        records.append(dict(r,eligible=n+sum(failed.values()),durationCounts=list(zip(times,counts)),failureCounts=failed))
    binding.append(dict(week=week,cohortStart=(end-timedelta(days=6)).isoformat(),cohortEnd=end.isoformat(),
                        observedThrough=(end+timedelta(days=2)).isoformat(),records=records))
    s=summarize(records)
    assert [s['numerator'],s['denominator']]==[w['bindingAttempts']['successful'],w['bindingAttempts']['total']]
    assert [sum(r['failureCounts'][cause] for r in records) for cause in causes]==totals
    checks.append(dict(metric=11,week=week,total=s['denominator'],success=s['numerator'],p50=s['p50Seconds'],p90=s['p90Seconds']))

    countries={'US':.65,'UK':.18,'DE':.10,'Other':.07}
    bird_models={m:weight/(1-models['Hunt Pro']) for m,weight in models.items() if m!='Hunt Pro'}
    groups=[dict(country=c,appPlatform=p,productLine='Bird',deviceModel=m) for c in countries for p in platforms for m in bird_models]
    weights=[countries[r['country']]*platforms[r['appPlatform']]*bird_models[r['deviceModel']] for r in groups]
    positive=[x*(.84 if r['deviceModel']=='K6' else 1.1 if r['deviceModel']=='Bird Pro' else 1)*
              (1.04 if r['appPlatform']=='iOS' else .97) for x,r in zip(weights,groups)]
    negative=[x*(1.18 if r['deviceModel']=='K6' else .92 if r['deviceModel']=='Bird Pro' else 1)*
              (.95 if r['appPlatform']=='iOS' else 1.04) for x,r in zip(weights,groups)]
    achieved=allocate(w['registrationCohort']['valueActivated7dBird'],positive)
    unachieved=allocate(w['registrationCohort']['birdEligible']-sum(achieved),negative)
    records=[]
    for r,n,unreached in zip(groups,achieved,unachieved):
        minutes=[5,30,60,120,240,480,720,1440,2880,4320,7200,10079]
        base=[1,2,3,4,5,6,10,12,14,12,7,3]
        tilt=(1.12 if late else .98)*(1.05 if r['deviceModel']=='K6' else .98)
        counts=allocate(n,[weight*tilt**(i-5) for i,weight in enumerate(base)])
        records.append(dict(r,eligible=n+unreached,notActivatedWithin7d=unreached,
                            durationCounts=[(minute*60,count) for minute,count in zip(minutes,counts)]))
    activation.append(dict(week=week,cohortStart=(end-timedelta(days=6)).isoformat(),cohortEnd=end.isoformat(),
                           observedThrough=(end+timedelta(days=8)).isoformat(),records=records))
    s=summarize(records)
    assert [s['numerator'],s['denominator']]==[w['registrationCohort']['valueActivated7dBird'],w['registrationCohort']['birdEligible']]
    assert all(seconds<7*86400 for r in records for seconds,_ in r['durationCounts'])
    checks.append(dict(metric=13,week=week,total=s['denominator'],activated=s['numerator'],p50=s['p50Seconds'],p90=s['p90Seconds']))

proposal=dict(status='SYNTHETIC_DEMO',version='synthetic-onboarding-duration-v1',asOf=load('snapshot')['asOf'],
              quantileMethod='R7 linear percentile on all weighted successful durations, h=(n-1)*p; never average subgroup percentiles; fewer than 30 successes -> counts only',
              binding=dict(start='first_valid_binding_attempt_started_at',end='binding_succeeded_at',unit='seconds',
                           failureReasonLabels=causes,cohorts=binding,
                           note='合成首次有效尝试计数。每次成功只归一个耗时取值，失败不填0秒，不计入成功耗时分位数。所有样本为有效设备；非有效状态不构成分母。注册和设备绑定是独立批次，不拼接为同一漏斗。'),
              activation=dict(start='registered_at',end='first qualifying bird recognition OR first completed live, whichever occurs first',unit='seconds',
                              cohorts=activation,
                              note='合成观鸟新注册主账号；全部完成7日观察。每人仅计第一次价值事件，未达成者不填7天代替；成功条件为elapsed<604800秒。示例预设可归属主型号，正式接入必须定义注册人群的型号归属，不能用完成激活后的设备关系反向筛掉未激活者。狩猎线不适用；未使用判定规则不作为注册批次的季节分组。'),
              provenance='经确认用于原型的合成频数；不是日志、不是从分位数反推的实测分布。总体与12期原有计数保留，交叉分组重建后可能不同；版本是合成标签，不代表某次真实版本发布。')
(OUT/'onboarding-duration-facts.json').write_text(json.dumps(proposal,ensure_ascii=False,separators=(',',':'))+'\n')
print('PASS approved 576 onboarding groups; 24 weekly rate totals preserved')
