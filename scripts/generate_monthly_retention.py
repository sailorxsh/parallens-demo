"""Approved synthetic calendar cohorts; not account-level event histories."""
import calendar
import json
import math
from pathlib import Path


def allocate(total, weights):
    exact = [total * weight / sum(weights) for weight in weights]
    counts = [math.floor(value) for value in exact]
    for i in sorted(range(len(exact)), key=lambda i: (-(exact[i] - counts[i]), i))[:total - sum(counts)]:
        counts[i] += 1
    return counts


def build_retention_history():
    countries = ['US', 'UK', 'DE', 'Other']
    active = [52000,54000,56000,58000,60000,62000,64000,65000,66000,67000,68000,70000,72000]
    retained = [37440,39204,41160,43500,45600,47740,49920,50050,48840,47570,48960,54000]
    latest = [[16732,18698],[4496,5024],[2650,2962],[1624,1814]]

    def joint(total, weights, ios_shares, ios_total):
        rows = allocate(total, weights)
        exact = [count * share for count, share in zip(rows, ios_shares)]
        ios = [math.floor(value) for value in exact]
        extra = ios_total - sum(ios)
        assert 0 <= extra <= len(ios)
        for i in sorted(range(len(ios)), key=lambda i: (-(exact[i] - ios[i]), i))[:extra]:
            ios[i] += 1
        return [[ios[i], count - ios[i]] for i, count in enumerate(rows)]

    def active_cells(total):
        return joint(total, [.65,.18,.10,.07], [.45]*4, round(total*.45))

    def month(ordinal):
        return f'{ordinal//12:04d}-{ordinal%12+1:02d}'

    points = []
    for i, numerator in enumerate(retained):
        ordinal = 2025*12+8+i
        observed, base = month(ordinal), month(ordinal-1)
        d, a = active_cells(active[i]), active_cells(active[i+1])
        n = joint(numerator, [sum(v) for v in latest], [v[0]/sum(v) for v in latest], round(numerator*25502/54000))
        points.append(dict(kind='rate',baseMonth=base,observedMonth=observed,
            observedThrough=f'{observed}-{calendar.monthrange(ordinal//12,ordinal%12+1)[1]:02d}',
            numerator=numerator,denominator=active[i],activeObserved=active[i+1],value=numerator/active[i],
            provenance='reconstructed-demo-anchor' if i>=10 else 'constructed-monthly-simulation',records=[dict(country=country,appPlatform=platform,
                baseActive=d[j][k],retained=n[j][k],observedActive=a[j][k])
                for j,country in enumerate(countries) for k,platform in enumerate(['iOS','Android'])]))
    return dict(status='approved-synthetic',classification='entirely_synthetic',version='synthetic-monthly-retention-v1',
        asOf='2026-09-24',population='正式复合活跃主账号；以基期冻结的国家／App平台归属分组，包含观察期未留存者',
        labels=[p['observedMonth'] for p in points],unit='%',kind='rate',points=points,
        attributionNote='演示样例的国家／平台归属固定；正式接入须确定基期归属，不能用观察期行为筛掉未留存者。不是逐账号事件日志。',
        note='12个完整自然月；合并同范围留存与基期活跃人数后计算，不平均分组率。国家／App平台归属在合成样例中固定，包含未留存者；不是逐账号事件日志，不证明真实经营变化。',
        source='constructed-monthly-simulation')


if __name__ == '__main__':
    data = Path(__file__).resolve().parents[1] / 'data'
    path = data / 'metric-trends.json'
    trends = json.loads(path.read_text())
    trends['m24'] = build_retention_history()
    path.write_text(json.dumps(trends, ensure_ascii=False, indent=2)+'\n')
    print('PASS 12 approved synthetic retention cohorts, 96 joint cells')
