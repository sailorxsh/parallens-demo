"""Append a deterministic 30-day request scenario; preserve all current anchors.

Each chain has its own attempts even where this synthetic fixture uses equal
volumes. These are aggregate request counts, not request or device identities.
"""
from datetime import date, timedelta
import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / 'data'
p = DATA / 'technical-facts.json'
source = json.loads(p.read_text())
end = date.fromisoformat(source['asOf'])
fields = ['networkFailures', 'uploadFailures', 'liveFailures', 'pushFailures']
rows = []
for day in range(30):
    records = []
    for i, current in enumerate(source['records']):
        if day == 29:
            record = dict(current)
        else:
            volume = .87 + .08 * math.sin((day + i) * .65) + .05 * day / 29
            attempts = max(30, round(current['attempts'] * volume))
            record = {k: current[k] for k in ['model', 'firmware']}
            record['attempts'] = attempts
            for j, field in enumerate(fields):
                # K6/2.8 live failures rise toward the preserved current sample.
                factor = (.40 + .60 * (day / 29) ** 2 if i == 0 and field == 'liveFailures'
                          else .90 + .08 * math.sin(day * .43 + i + j) + .02 * day / 29)
                record[field] = min(attempts, max(0, round(attempts * current[field] / current['attempts'] * factor)))
        records.append(record)
    rows.append({'date': (end - timedelta(days=30-day)).isoformat(), 'records': records})
source['dailyHistory'] = {
    'version': 'synthetic-technical-days-v1',
    'endExclusive': source['asOf'] + 'T00:00:00Z',
    'provenance': 'constructed-simulation-preserving-current-anchor',
    'note': '30个完整UTC日，起含止不含；新增合成情景，非生产请求日志。每链路按失败数与请求数重算，不平均日率，不生成设备或请求身份。',
    'rows': rows,
}
p.write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
print('PASS 30 days / 240 model-firmware cells; all eight current request anchors preserved')
