"""Add the required twelve full calendar months without changing the three original anchors.

The prior nine months are constructed scenarios, never backfilled observations.
Only the owned monthly history, chart arrays and matching table are updated.
"""
import json
from pathlib import Path

DATA=Path(__file__).resolve().parents[1]/'data'
file=DATA/'diagnostics.json'
diag=json.loads(file.read_text())
snapshot=json.loads((DATA/'snapshot.json').read_text())
metric=json.loads((DATA/'metric-values.json').read_text())['m35']['value']
assert snapshot['asOf'][:7]=='2026-09','Re-review monthly anchors when the demo reporting month changes'
months=[f'{year}-{month:02d}' for year,month in [(2025,9),(2025,10),(2025,11),(2025,12),*[(2026,m) for m in range(1,9)]]]
payers=[7600,7900,8250,9100,8750,8900,9200,9500,9350,9600,9800,10000]
revenues=[36480,38394,40425,46865,43487,44767,46644,47975,47592,48000,49980,52000]
rows=[{'month':month,'payers':n,'netIncome':revenue,'provenance':'existing-demo-summary' if i>=9 else 'constructed-simulation'}
      for i,(month,n,revenue) in enumerate(zip(months,payers,revenues))]
assert [rows[-1]['payers'],rows[-1]['netIncome']]==[metric['monthlySubscriptionPayers'],metric['subscriptionNetIncome']]
assert rows[-1]['netIncome']/rows[-1]['payers']==metric['ARPPU']
source={'version':'synthetic-payment-months-v1','asOf':snapshot['asOf'],'rows':rows,
        'note':'2025-09至2026-08共12个完整自然月。2026年6–8月沿用原演示汇总，前9个月为新增合成场景；均非真实经营历史。付款主账号按各月分别去重，跨月不可相加作为年度独立付款人数。订阅净收入与MRR分别核对。'}
e=diag['E'];e['paymentMonths']=source
e['period']=f"权益快照 {snapshot['asOf']}；付款趋势为12个完整月（2025-09–2026-08）"
e['chart'].update(title='月内订阅付款主账号 · 最近12个完整月',labels=months,
                  series=[{'name':'付款主账号','values':payers}],note=source['note']+' 人数与期末有效付费权益不同。')
e['extraCharts'][0].update(title='订阅ARPPU · 相同12个完整月',labels=months,
                           series=[{'name':'ARPPU','values':[r/n for r,n in zip(revenues,payers)]}],
                           note=source['note']+' 每月基础订阅净收入÷同月付款主账号；与人数图共用月份轴，不使用双Y轴。')
table=next(t for t in e['tables'] if t['title']=='完整月付款与人均收入')
table['rows']=[[m,n,f'${r:,}',f'${r/n:.2f}'] for m,n,r in zip(months,payers,revenues)]
table['note']=source['note']+' 各行收入÷同月人数回算ARPPU。'
file.write_text(json.dumps(diag,ensure_ascii=False,indent=2)+'\n')
print('Prepared 12 complete monthly aggregates; June–August counts and revenues retained exactly')
