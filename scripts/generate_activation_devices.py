"""Independent, approved synthetic first-content ledger for metric 16 only."""
import datetime as dt
import json
import random
from pathlib import Path

root = Path(__file__).resolve().parents[1]
rng = random.Random(18316)
start = dt.date(2026, 6, 29)
counts = [1780, 1855, 1820, 1960, 2035, 2010, 2175, 2140, 2265, 2310, 2360, 2450]
records, weeks = [], []
for w, count in enumerate(counts):
    day0 = start + dt.timedelta(days=7*w)
    weeks.append({'start': str(day0), 'end': str(day0+dt.timedelta(days=6)), 'count': count})
    for _ in range(count):
        day = day0 + dt.timedelta(days=rng.choices(range(7), weights=[16,14,17,14,15,12,12])[0])
        country = rng.choices(range(4), weights=[55-w*.5,19,15+w*.3,11+w*.2])[0]
        model = rng.choices(range(4), weights=[35-w*.6,22,20+w*.5,23+w*.1])[0]
        channel = rng.choices(range(2), weights=[65-w,35+w])[0]
        # Numeric immutable IDs and dictionary codes keep the route payload compact.
        records.append([len(records)+1, str(day), country, model, channel])
facts = {
 'version':'synthetic-first-content-devices-v1','status':'approved-synthetic',
 'classification':'entirely_synthetic','asOf':'2026-09-24','timezone':'UTC',
 'defaultWeek':'2026-09-14', 'columns':['id','firstContentDay','country','deviceModel','salesChannel'],
 'codes':{'country':['US','UK','DE','Other'],'deviceModel':['K6','Bird Lite','Bird Pro','Hunt Pro'],'salesChannel':['Amazon','Shopify']},
 'identity':'ACT16- plus zero-padded numeric id; unique within this independent synthetic ledger. No cross-source device join is defined.',
 'population':'First image/video on an effective device; country, model and self-reported sales channel frozen on first-content day. Later unbinding or disposal does not remove historical activation.',
 'deviceStatus':'Effective',
 'limitations':'New approved scenario: 2450 on 2026-09-14 through 2026-09-20. Original 2450 aggregate had no period; this is not a historical backfill. Not the eligible App-bound cohort used by metric 43.',
 'weeks':weeks,'records':records}
p = root/'data/diagnostics.json'
text = p.read_text()
# Preserve formatting and bytes of unrelated diagnostic facts.
value = json.dumps(facts, ensure_ascii=False, separators=(',', ':'))
marker = '"activationFacts": '
if marker in text:
    begin = text.index(marker) + len(marker)
    _, used = json.JSONDecoder().raw_decode(text[begin:])
    text = text[:begin] + value + text[begin+used:]
else:
    begin = text.index('"A": ') + len('"A": ')
    _, used = json.JSONDecoder().raw_decode(text[begin:])
    end = begin + used
    boundary = text.rfind('\n  }', begin, end)
    text = text[:boundary] + ',\n    "activationFacts": ' + value + text[boundary:]
p.write_text(text)
print(f'Prepared {len(records)} independent first-content devices; latest complete week {counts[-1]}.')
