"""Add source-aligned synthetic status snapshots; current values and flow data stay unchanged."""
import datetime as dt
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
data=ROOT/'data'
def read(name):return json.loads((data/(name+'.json')).read_text())
metrics,trend,snapshot,flow=[read(x) for x in ['metric-values','metric-trends','snapshot','subscription-flow']]
current=metrics['m05']['value'];last=dt.date.fromisoformat(snapshot['asOf'])
cancel={'bird':[520,525,530,535,540,545,560,570,585,590,595,600],'hunting':[330,335,340,350,360,370,380,390,395,400,400,400]}
early={'bird':[1100,1120,1100,1080,1150,1180,1160,1100,1080,1050,1020,1000],'hunting':[900,930,950,970,1020,1060,1040,1030,1020,1010,1005,1000]}
near={'bird':[450,460,480,490,520,530,540,520,510,505,500,500],'hunting':[420,430,450,480,500,520,510,505,500,500,500,500]}
failed={'bird':[285,290,300,330,360,410,390,360,340,320,310,300],'hunting':[320,330,350,370,395,430,415,390,360,340,320,300]}
expired=[350,360,390,420,470,520,500,480,450,430,410,400]
rows=[]
for i in range(12):
 at=last-dt.timedelta(days=(11-i)*7);owners=trend['m48']['points'][i]['denominator'];paid=trend['m02']['points'][i]['value'];bird_owners=round(owners*snapshot['birdOwners']/snapshot['boundOwnerAccounts']);bird_paid=round(paid*flow['byProductLine']['Bird']['closing']/snapshot['effectiveSubscribers']);parts={}
 for product,total,effective in [('bird',bird_owners,bird_paid),('hunting',owners-bird_owners,paid-bird_paid)]:
  part=dict(current[product]);part.update(trialEarly=early[product][i],trialNearExpiry=near[product][i],paidCurrent=effective-cancel[product][i],cancelledButEntitled=cancel[product][i],paymentFailed=failed[product][i]);base='free' if product=='bird' else 'noEntitlement'
  if product=='hunting':part['expired']=expired[i]
  part[base]=total-sum(n for k,n in part.items() if k!=base);assert all(isinstance(n,int) and n>=0 for n in part.values());assert sum(part.values())==total;parts[product]=part
 assert sum(p['paidCurrent']+p['cancelledButEntitled'] for p in parts.values())==paid
 assert f'{at.month}/{at.day}'==trend['m02']['labels'][i]==trend['m48']['labels'][i]
 rows.append({'at':str(at),'products':parts})
assert rows[-1]['products']==current
flow['statusHistory']={'version':'synthetic-status-snapshots-v1','classification':'entirely_synthetic','asOf':snapshot['asOf'],'timezone':'UTC','rows':rows,'note':'每7天一个合成订阅状态快照，包含当前9/24。各期有效付费合计及主账号池分别沿用已构造的#2和#48历史；其他状态为新增模拟场景。各状态互斥；没有跨期用户身份，不从快照之差推算转化、流失或原因。不是注册批次W1–W12。'}
(data/'subscription-flow.json').write_text(json.dumps(flow,ensure_ascii=False,indent=2)+'\n')
print('Added 12 synthetic status snapshots; latest state counts and existing paid/owner history preserved')
