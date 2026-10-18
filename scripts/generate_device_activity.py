"""Rebuild explicitly synthetic, complete device-age aggregates for metrics 41/44.

Counts are scenarios, not inferred production measurements. Snapshot populations
are independent; transitions and recovery cannot be inferred by subtracting them.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
load = lambda name: json.loads((DATA / f'{name}.json').read_text())
write = lambda name, value: (DATA / f'{name}.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def allocate(total, weights):
    exact = [total * weight / sum(weights) for weight in weights]
    result = [int(x) for x in exact]
    for i in sorted(range(len(weights)), key=lambda i: (-(exact[i]-result[i]), i))[:total-sum(result)]:
        result[i] += 1
    return result


countries = {'US': .65, 'UK': .18, 'DE': .1, 'Other': .07}
models = [('K6', '2.8', .075), ('K6', 'Other', .0363), ('Bird Lite', 'Other', .3477),
          ('Bird Pro', 'Other', .3129), ('Hunt Pro', 'Other', .2281)]
groups = [dict(country=country, productLine='Hunting' if model == 'Hunt Pro' else 'Bird',
               deviceModel=model, firmware=firmware, deviceStatus='Effective')
          for country in countries for model, firmware, _ in models]
weights = [countries[row['country']] * models[i % 5][2] for i, row in enumerate(groups)]
# Vary age mix between declared groups; largest-remainder allocation preserves
# each overall band exactly, without multiplying separate marginal slices.
age_tilt = [.85, 1.05, 1.10, 1.18, .95]
trends = load('metric-trends')
points = trends['m41']['points']
snapshots = []
for i, point in enumerate(points):
    at = datetime(2026, 7, 9, tzinfo=timezone.utc) + timedelta(days=7*i)
    monthly, eligible = point['numerator'], point['denominator']
    daily = 16200 if i == 11 else round(monthly * (.176 + .0013*i))
    weekly = 46500 if i == 11 else round(monthly * (.535 + .001*i))
    active21 = 79800 if i == 11 else monthly-round(monthly*(.061 + .0003*i))
    totals = [daily, weekly-daily, active21-weekly, monthly-active21, eligible-monthly]
    columns = [allocate(total, [weight * age_tilt[j % 5]**(band-2) *
                              (1 + .018*(j//5-1.5)*(band-2)) for j, weight in enumerate(weights)])
               for band, total in enumerate(totals)]
    snapshots.append(dict(at=at.strftime('%Y-%m-%dT00:00:00Z'),
                          observedFrom=(at-timedelta(days=30)).strftime('%Y-%m-%dT00:00:00Z'),
                          eligibleDevices=eligible,
                          records=[dict(row, counts=[column[j] for column in columns]) for j, row in enumerate(groups)]))
returns = []
for threshold, cohort_total, returned_total in [(21, 3000, 600), (30, 1800, 270)]:
    cohorts = allocate(cohort_total, weights)
    # Allocate successes within those same disjoint cohort cells.
    returned = allocate(returned_total, [n * (.8 + (j % 5)*.09) for j,n in enumerate(cohorts)])
    assert all(r <= n for r,n in zip(returned,cohorts))
    returns.append(dict(thresholdDays=threshold, entryAt='2026-09-10T00:00:00Z',
                        observedThrough='2026-09-17T00:00:00Z', windowDays=7,
                        eligibleDevices=cohort_total, returnedDevices=returned_total,
                        records=[dict(row, eligible=n, returned=r) for row,n,r in zip(groups,cohorts,returned)]))
source = dict(version='synthetic-device-age-v1', asOf='2026-09-24T00:00:00Z', activeWindowDays=30,
              ageBands=[[0,1],[1,7],[7,21],[21,30],[30,None]], snapshots=snapshots, returnCohorts=returns,
              note='合成聚合事实，不是生产设备日志。最近有效行为间隔按UTC、左闭右开区间分层；有效行为含内容上传、直播或同步，纯心跳不计。每期分母仅含已激活、有效且具备完整30天行为观察的设备。国家、型号、固件为当期归属；不同快照不保证同一设备集合，不能相减推算回流。历史回流为入组时已连续21/30天无行为的独立设备群，随后7天内有有效行为计回流；两阈值群体可重叠，不相加，不解释为召回效果。')
write('device-activity-facts', source)
print(f"Prepared {len(snapshots)} snapshots × {len(groups)} disjoint groups; current bands {totals}")
