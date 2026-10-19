"""Rebuild the approved 30-window synthetic anomaly ledger; no saved issues are touched."""
from pathlib import Path
from datetime import datetime,timedelta,timezone
import json
ROOT=Path(__file__).resolve().parents[1]
templates=json.loads((ROOT/'data/entity-samples.json').read_text())['G'];old=json.loads((ROOT/'data/metric-trends.json').read_text())['m53'];end=datetime(2026,9,24,12,tzinfo=timezone.utc)
latest=[('US','iOS'),('UK','Android'),('US','Android'),('US','Android'),('DE','Android'),('UK','iOS'),('Other','iOS')]
counts=[2,3,1,4,2,0,3,2,4,1,3,2,5,2,3,1,4,3,2,4,3,2,4]+[p['value'] for p in old['points']]
assert len(counts)==30
rows=[];events=[]
iso=lambda t:t.isoformat().replace('+00:00','Z')
for i,n in enumerate(counts):
 stop=end-timedelta(days=29-i);start=stop-timedelta(days=1);ids=[]
 for j in range(n):
  index=j if i==29 else (i+j*2)%7;t=templates[index];country,platform=latest[index] if i==29 else (['US','UK','DE','Other'][(i+2*j)%4],['iOS','Android'][(i+j)%2])
  observed=datetime.strptime(t['observedAt'],'%Y-%m-%d %H:%M').replace(tzinfo=timezone.utc) if i==29 else stop.replace(hour=8,minute=10)+timedelta(minutes=17*j)
  assert start<=observed<stop
  event={**t,'id':t['id'] if i==29 else f'SYN-{stop:%Y%m%d}-{j+1:02}', 'observedAt':iso(observed),'country':country,'appPlatform':platform,
    'anomalyType':'Business' if t['domain'] in ['新客','订阅'] else 'Device' if t['domain']=='设备' else 'Quality','severity':None,'affectedCount':None,
    'provenance':'existing-seven-signals-with-new-synthetic-attribution' if i==29 else 'newly-constructed-historical-event'}
  events.append(event);ids.append(event['id'])
 rows.append({'startInclusive':iso(start),'endExclusive':iso(stop),'eventIds':ids})
source={'status':'approved-synthetic','version':'synthetic-anomaly-events-noon-v1','classification':'entirely_synthetic','asOf':iso(end),'period':'30-contiguous-24h-windows','events':events,'windows':rows,
 'rules':['一条记录表示一个被登记的异常发现，不表示一个受影响用户、设备或原始触发事件。','截至2026-09-24 12:00 UTC，最近24小时为9/23 12:00→9/24 12:00，左含右不含；不同于其他指标的UTC零时窗口。','选择历史窗口只更新事件清单，顶部仍显示最新24小时。新登记保存最新及前24小时窗口的事件证据，旧编号、范围、基线与草稿保留。','所有统计从事件ID去重计算；维度分组互斥闭合，不再独立乘比例。','没有已批准的生产告警规则或严重程度定级；不把昨日事件数、未评级或未知影响人数当作正常基线、低风险或零影响。'],
 'limitations':['新增模拟市场与App归属，不能作为真实跨指标用户或设备身份链。','只有国家×App×异常类型有完整来源；产品线、型号、固件、设备状态与季节仍缺事件归属。','30日历史为合成情景，原末7个计数及EX-01至EX-07名称、状态、观测钟点保留；UTC时区和12:00截点为已确认演示口径。','严重程度、影响人数及统一4周监控基线仍待业务定义；已有单项指标的比较证据可通过链接查看。']}
diagnostics=json.loads((ROOT/'data/diagnostics.json').read_text())
diagnostics['G']['anomalyEvents']=source
(ROOT/'data/diagnostics.json').write_text(json.dumps(diagnostics,ensure_ascii=False,indent=2)+'\n')
print(f"Rebuilt {len(events)} synthetic anomaly events in {len(rows)} windows")
