"""Rebuild approved synthetic monthly renewal frequency source; no real customer data."""
import calendar, hashlib, itertools, json, math, random
from collections import Counter
from datetime import date,timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/"data"

def allocate(total,weights,caps=None):
    """Capped Hamilton allocation; distribute fractional seats once, not by weights again."""
    caps=caps if caps is not None else [total]*len(weights)
    result=[0]*len(weights);left=total
    active=[i for i in range(len(weights)) if caps[i]>0 and weights[i]>0]
    while left:
        assert active and left<=sum(caps[i] for i in active)
        mass=sum(weights[i] for i in active)
        exact={i:left*weights[i]/mass for i in active}
        capped=[i for i in active if exact[i]>=caps[i]]
        if capped:
            for i in capped:result[i]=caps[i];left-=caps[i]
            active=[i for i in active if i not in capped]
            continue
        for i in active:result[i]=math.floor(exact[i])
        remainder=left-sum(result[i] for i in active)
        for i in sorted(active,key=lambda j:(-(exact[j]-math.floor(exact[j])),j))[:remainder]:result[i]+=1
        left=0
    assert sum(result)==total and all(0<=n<=cap for n,cap in zip(result,caps))
    return result

def sample(n,k,label):
    seed=int(hashlib.sha256(label.encode()).hexdigest()[:16],16)
    return set(random.Random(seed).sample(range(n),k))

countries=[('US',.65),('UK',.18),('DE',.10),('Other',.07)]
apps=[('iOS',.45),('Android',.55)]
platforms=[('App Store',.36),('Google Play',.44),('Web',.20)]
plans=[('Bird','Plus',.45),('Bird','Pro',.20),('Hunting','Starter',.10),('Hunting','Plus',.16),('Hunting','Pro',.09)]
cycles=[('Monthly',.82),('Annual',.18)]
keys=[];weights=[]
for country,app,platform,plan,cycle in itertools.product(countries,apps,platforms,plans,cycles):
    keys.append(dict(country=country[0],appPlatform=app[0],subscriptionPlatform=platform[0],productLine=plan[0],plan=plan[1],billingCycle=cycle[0]))
    weights.append(country[1]*app[1]*platform[1]*plan[2]*cycle[1])
openings=[9000,9300,9600,9800,10200,10400,10600,10800,11000,11200,11500,11800]
renewal=[.94,.945,.95,.945,.955,.95,.945,.95,.955,.95,.955,.95]
payment_rows=json.loads((ROOT/'diagnostics.json').read_text())['E']['paymentMonths']['rows']
loss_rates=[.036,.034,.035,.033,.032,.035,.036,.035,.034,.033,.032,.03]
cancel_rates=[.046,.045,.044,.043,.042,.045,.047,.046,.045,.044,.042,.04]
rows=[]
for j in range(12):
    year,month=divmod(2025*12+8+j,12);month+=1
    month_id=f'{year}-{month:02}';start=date(year,month,1);end=start+timedelta(days=calendar.monthrange(year,month)[1])
    B=openings[j];L=round(B*loss_rates[j]);C=round(B*cancel_rates[j]);R=round(L/6)
    nextB=openings[j+1] if j<11 else 12020
    overlap=17 if j==11 else 36 if j==10 else R
    P=payment_rows[j]['payers'];S=P-(nextB-B)-L+overlap;D=round(S/renewal[j])
    base=allocate(B,weights)
    eligible_monthly=[base[i] if k['billingCycle']=='Monthly' else 0 for i,k in enumerate(keys)]
    annual_due=allocate(D-sum(eligible_monthly),[w if k['billingCycle']=='Annual' else 0 for k,w in zip(keys,weights)],[base[i] if k['billingCycle']=='Annual' else 0 for i,k in enumerate(keys)])
    due=[a+b for a,b in zip(eligible_monthly,annual_due)]
    renewed=allocate(S,[n*(1+((i*7)%11-5)/100) for i,n in enumerate(due)],due)
    lost=allocate(L,[n*(1+((i*13)%9-4)/20) for i,n in enumerate(base)],base)
    voluntary=allocate(round(L*2/3),lost,lost)
    payment=allocate(round(L*.113),[n-v for n,v in zip(lost,voluntary)],[n-v for n,v in zip(lost,voluntary)])
    cancel_extra=allocate(C-sum(voluntary),[n-v for n,v in zip(base,voluntary)],[n-v for n,v in zip(base,voluntary)])
    cells=[];pending=[]
    for i,k in enumerate(keys):
        n=base[i];stem=f'{month_id}:{i}'
        eligible=sample(n,due[i],stem+':due');successful=set(sorted(eligible)[t] for t in sample(len(eligible),renewed[i],stem+':renew'))
        non_success=sorted(set(range(n))-successful);success_values=sorted(successful)
        n_other=max(lost[i]-len(successful),min(len(non_success),math.ceil(lost[i]*.4)))
        loss={non_success[x] for x in sample(len(non_success),n_other,stem+':loss-other')}|{success_values[x] for x in sample(len(success_values),lost[i]-n_other,stem+':loss-renew')}
        ordered_loss=sorted(loss)
        vset=set(ordered_loss[:voluntary[i]]);pset=set(ordered_loss[voluntary[i]:voluntary[i]+payment[i]])
        available=sorted(set(range(n))-vset)
        canceled=vset|{available[t] for t in sample(len(available),cancel_extra[i],stem+':cancel')}
        pending.append(dict(key=k,n=n,eligible=eligible,successful=successful,loss=loss,vset=vset,pset=pset,canceled=canceled,stem=stem))
    intersections=[len(t['loss']&t['successful']) for t in pending]
    complements=[len(t['loss']-t['successful']) for t in pending]
    overlap_counts=allocate(overlap,intersections,intersections)
    assert sum(complements)>=R-overlap,(month_id,R,overlap,sum(intersections),sum(complements),S,D)
    other_returns=allocate(R-overlap,complements,complements)
    for i,t in enumerate(pending):
        def choose(pool,count,label):
            values=sorted(pool);return {values[x] for x in sample(len(values),count,label)}
        returned=choose(t['loss']&t['successful'],overlap_counts[i],t['stem']+':return-renew')|choose(t['loss']-t['successful'],other_returns[i],t['stem']+':return-other')
        bins=Counter()
        for x in range(t['n']):
            reason='cancel-expired' if x in t['vset'] else 'payment-expired' if x in t['pset'] else 'unclassified-expiry' if x in t['loss'] else None
            bins[(x in t['eligible'],x in t['successful'],x in t['canceled'],reason,x in returned)]+=1
        frequencies=[dict(due=d,renewed=s,cancelled=c,lossReason=r,restoredAfterLoss=a,count=count) for (d,s,c,r,a),count in sorted(bins.items(),key=lambda x:str(x[0]))]
        cells.append({**t['key'],'opening':t['n'],'outcomeCounts':frequencies})
    closingByProductLine=({'Bird':round(nextB*.65),'Hunting':nextB-round(nextB*.65)} if j<11 else {'Bird':7750,'Hunting':4270})
    row=dict(month=month_id,start=start.isoformat(),endExclusive=end.isoformat(),renewalObservationEndExclusive=(end+timedelta(days=7)).isoformat(),
             opening=B,due=D,renewed=S,lostDuring=L,cancelled=C,restoredAfterLoss=R,noRightsAtEnd=L-R,otherInflow=nextB-B+L-R,monthlyPayers=P,netIncome=payment_rows[j]['netIncome'],closing=nextB,closingByProductLine=closingByProductLine,records=cells)
    rows.append(row)
proposal=dict(version='synthetic-monthly-renewal-v1',status='APPROVED_SYNTHETIC',classification='entirely_synthetic',asOf='2026-09-24',timezone='UTC',defaultMonth='2026-08',
    definitions={'base':'当月期初有效主订阅权益主账号；排除Free、试用与仅Pack人群；归属按入组时固定',
    'renewal':'到期日在当月、最终续订结果已完整观察的期初主账号；月付期初群均有本月到期点，年付取当月到期者。以到期后7天为合成结果观察窗，整月等待到月末后7天，非平台宽限期。按主账号去重，不按支付尝试计次；候选中成功续订及恢复的付款均发生在本月',
    'loss':'期初主账号中，月内至少失去过一次有效主订阅权益的去重人数；本月内恢复者仍记发生过流失，不等于期末无权益人数',
    'cancel':'期初主账号中，月内至少有一次主动关闭续订或取消请求；不等于立即失去权益，不和流失人数相加',
    'reasons':'同一发生流失主账号只分配一个首个权益失效主原因；合成分类不证明真实因果',
    'limit':'各月独立合成频数，不提供跨月逐账号身份或真实事件时序；不得由此计算全年去重人数。新月付合成配额不是从原周度500人推导；新主值为完整月95%，不能与原周度86%作环比。月付款去重人数沿用已有12月输入：续订与期初群恢复付款取并集，再加非期初群首次/恢复流入；金额仍为原月度净收入汇总，不据此构造交易金额。'},months=rows)
(ROOT/'monthly-renewal-facts.json').write_text(json.dumps(proposal,ensure_ascii=False,separators=(',',':'))+'\n')
metrics=json.loads((ROOT/'metric-values.json').read_text())
r=rows[-1];metrics['m23']={'kind':'rate','numerator':r['renewed'],'denominator':r['due'],'value':r['renewed']/r['due']}
(ROOT/'metric-values.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
print(f'Generated {len(rows)} approved synthetic months and {len(keys)*len(rows)} frequency cells')
