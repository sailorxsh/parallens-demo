"""Align synthetic retention enrollment cells with the approved registration population.
Preserves every overall D1/D7/D30 overlap count; never filters the denominator by retention.
"""
from pathlib import Path
from collections import Counter
import json,math
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'data/diagnostics.json'

def align(data):
    registration={c['start']:c for c in data['A']['registrationFacts']['cohorts']}
    facts=data['B']['userRetentionFacts'];changed=[]
    for c in facts['cohorts']:
        if c['type']!='registration' or c['start']not in registration:continue
        reg=registration[c['start']];countries=['US','UK','DE','Other'];days=['D1','D7','D30']
        pools={country:Counter()for country in countries};target={(country,app):sum(r['registered']for r in reg['records']if r['country']==country and r['appPlatform']==app)for country in countries for app in ['iOS','Android']}
        for r in c['records']:
            for o in r['outcomeCounts']:pools[r['country']][tuple(o[d]for d in days)]+=o['count']
        before=Counter();[before.update(pool)for pool in pools.values()]
        for country in countries:
            need=sum(target[country,app]for app in ['iOS','Android'])-sum(pools[country].values())
            while need>0:
                donor=next(k for k in countries if sum(pools[k].values())>sum(target[k,a]for a in ['iOS','Android']))
                pattern=max(pools[donor],key=lambda key:(pools[donor][key],str(key)));pools[donor][pattern]-=1;pools[country][pattern]+=1;need-=1
        records=[]
        for country in countries:
            patterns=sorted((k for k,v in pools[country].items()if v),key=str);counts=[pools[country][k]for k in patterns];n=sum(counts);ios=target[country,'iOS'];ideal=[v*ios/n if n else 0 for v in counts];assigned=[math.floor(v)for v in ideal]
            for i in sorted(range(len(ideal)),key=lambda i:(-(ideal[i]-assigned[i]),i))[:ios-sum(assigned)]:assigned[i]+=1
            for app in ['iOS','Android']:
                values=assigned if app=='iOS'else [v-a for v,a in zip(counts,assigned)]
                records.append({'country':country,'appPlatform':app,'deviceModel':None,'salesChannel':None,'eligible':target[country,app],'outcomeCounts':[{**dict(zip(days,key)),'count':count}for key,count in zip(patterns,values)if count]})
        after=Counter()
        for r in records:
            for o in r['outcomeCounts']:after[tuple(o[d]for d in days)]+=o['count']
        assert before==after and sum(r['eligible']for r in records)==c['eligible']
        if records!=c['records']:changed.append(c['id'])
        c['records']=records
    facts['enrollmentPopulation']='Common registration cohorts use the same frozen country x App enrollment counts as #9/#10/#12. Overall day-overlap frequencies are preserved; App assignments are synthetic, not observed identities. The independent 2026-09-14 registration cohort has no matching #9 period.'
    return changed

if __name__=='__main__':
    text=path.read_text();data=json.loads(text);changed=align(data)
    key=text.index('"userRetentionFacts"');start=text.index('{',key);_,end=json.JSONDecoder().raw_decode(text,start)
    replacement=json.dumps(data['B']['userRetentionFacts'],ensure_ascii=False,separators=(',',':'))
    path.write_text(text[:start]+replacement+text[end:]);print(json.dumps({'status':'PASS','alignedCohorts':changed,'overallRetentionOutcomesPreserved':True}))
