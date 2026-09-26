"""Generate bounded synthetic histories for selected headline metrics, anchored to the existing workbook snapshot."""
import json
from pathlib import Path

DATA=Path(__file__).resolve().parents[1]/'data'
weekly=json.loads((DATA/'weekly.json').read_text())
metrics=json.loads((DATA/'metric-values.json').read_text())
labels=[f'W{w["week"]}' for w in weekly]

def count(values,unit='人',note=''):
    return {'labels':labels,'unit':unit,'kind':'count','points':[{'kind':'count','value':v} for v in values],'note':note,'source':'constructed-weekly-simulation'}
def money(values,note=''):
    return {'labels':labels,'unit':'美元','kind':'usd','points':[{'kind':'usd','value':v} for v in values],'note':note,'source':'constructed-weekly-simulation'}
def rate(numerators,denominators,note=''):
    return {'labels':labels,'unit':'%','kind':'rate','points':[{'kind':'rate','numerator':n,'denominator':d,'value':n/d} for n,d in zip(numerators,denominators)],'note':note,'source':'constructed-weekly-simulation'}

subscribers=[w['paidUsersIncludingPackOnly']-150 for w in weekly]
mrr=[round(56000*(x/12400)*(0.985+0.015*i/11)) for i,x in enumerate(subscribers)]
mrr[-1]=56000
active=[w['activity']['activeDevices'] for w in weekly]
effective=[139800-400*(11-i) for i in range(12)]
owners=[82400-150*(11-i) for i in range(12)]
multi=[round(18128*(d/82400)*(0.92+0.08*i/11)) for i,d in enumerate(owners)]
multidevice=[143800-600*(11-i) for i in range(12)]
shared=[round(25884*(d/143800)*(0.90+0.10*i/11)) for i,d in enumerate(multidevice)]
unactivated=[92,96,101,99,105,110,108,116,121,119,125,128]
at_risk=[112,116,119,125,129,133,140,143,149,155,160,168]
core_users=[round(w['activity']['compositeMAU']*share) for w,share in zip(weekly,
            [.405,.402,.398,.397,.394,.391,.389,.388,.386,.385,.384,.38235294117647056])]
core_users[-1]=26000

dataset={
 'm02':count(subscribers,note='有效订阅周末快照：以周度付费权益人数扣除150位仅持有Pack的演示用户；历史为构造数据。'),
 'm03':money(mrr,note='MRR周末快照演示序列；最新点锚定底表$56,000，早期点为构造值。'),
 'm04':count([w['activity']['compositeMAU'] for w in weekly],note='每个周末向前30天去重主账号，滚动窗口互有重叠。'),
 'm15':count(unactivated,note='绑定超3天仍未激活设备的主账号周末快照；历史为演示构造值，最新点锚定底表128人。'),
 'm24':{'labels':['7月','8月'],'unit':'%','kind':'rate','points':[{'kind':'rate','numerator':25200,'denominator':35000,'value':.72},{'kind':'rate','numerator':27000,'denominator':35000,'value':27000/35000}],
        'note':'按完整月成熟留存批次计算；仅有两个演示月份，不外推12周。','source':'diagnostic-summary'},
 'm27':rate(core_users,[w['activity']['compositeMAU'] for w in weekly],note='核心功能使用主账号/同期复合活跃主账号；历史分子为演示构造值，最新点锚定底表26,000/68,000。'),
 'm41':rate(active,effective,note='活跃设备来自周度演示汇总；有效且已激活设备分母按快照构造，最新点为85,278/139,800。'),
 'm48':rate(multi,owners,note='多设备主账号/已绑定主账号；历史周末值为构造快照，最新点为18,128/82,400。'),
 'm49':rate(shared,multidevice,note='开启共享的绑定设备/当前绑定设备；历史周末值为构造快照，最新点为25,884/143,800。'),
 'm52':count(at_risk,note='需要核对的风险用户周末快照；历史为演示构造值，最新点锚定底表168人。'),
 'm53':{'labels':['9/18','9/19','9/20','9/21','9/22','9/23','9/24'],'unit':'条','kind':'count',
        'points':[{'kind':'count','value':v} for v in [3,2,1,4,2,5,7]],'note':'每日模拟异常事件数；最新7条与快照及类别归属闭合，历史6日为新增演示。','source':'constructed-daily-simulation'},
 'm54':{'labels':['9/18','9/19','9/20','9/21','9/22','9/23','9/24'],'unit':'%','kind':'rate',
        'points':[{'kind':'rate','numerator':v,'denominator':10000,'value':v/10000} for v in [180,190,210,200,220,210,220]],
        'note':'日埋点丢失率；每日期望事件10,000，最新220/10,000与质量快照一致。','source':'diagnostic-summary'},
}
assert subscribers[-1]==metrics['m02']['value']
assert mrr[-1]==metrics['m03']['value']
assert dataset['m04']['points'][-1]['value']==metrics['m04']['value']
for id in [15,52]:
    assert dataset[f'm{id:02d}']['points'][-1]['value']==metrics[f'm{id:02d}']['value']
for id in [24,27,41,48,49]:
    assert dataset[f'm{id:02d}']['points'][-1]['numerator']==metrics[f'm{id:02d}']['numerator']
    assert dataset[f'm{id:02d}']['points'][-1]['denominator']==metrics[f'm{id:02d}']['denominator']
assert dataset['m53']['points'][-1]['value']==metrics['m53']['value']
assert dataset['m54']['points'][-1]['numerator']==metrics['m54']['value']['eventLoss']['numerator']
(DATA/'metric-trends.json').write_text(json.dumps(dataset,ensure_ascii=False,indent=2)+'\n')
print(f'PASS selected metric trends: {len(dataset)} histories anchored to current metric values')
