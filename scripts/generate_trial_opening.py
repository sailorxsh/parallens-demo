"""Approved #17 cohort frequency source; registration counts are never rewritten."""
from pathlib import Path
import json, math
root=Path(__file__).resolve().parents[1]
path=root/'data/diagnostics.json'
data=json.loads(path.read_text())
reg=data['A']['registrationFacts']
weekly=json.loads((root/'data/weekly.json').read_text())
# Frozen calibration from dc19e12, not real observed trial events.
weights=[[352, 394, 95, 106, 56, 62, 34, 38], [363, 405, 97, 109, 57, 64, 35, 39], [366, 409, 98, 110, 58, 65, 35, 40], [358, 400, 96, 108, 57, 63, 35, 39], [379, 423, 102, 114, 60, 67, 37, 41], [376, 420, 101, 113, 60, 67, 36, 41], [389, 435, 104, 117, 62, 69, 38, 42], [385, 430, 103, 115, 61, 68, 37, 42], [393, 439, 106, 118, 62, 70, 38, 43], [398, 444, 107, 119, 63, 70, 39, 43], [392, 438, 105, 118, 62, 69, 38, 42], [400, 447, 108, 120, 63, 71, 39, 43]]
old=[{'total':w['registrationCohort']['trialStarted7d'],'groups':[{'country':country,'appPlatform':app,'value':{'numerator':weights[i][j],'denominator':0}}for j,(country,app)in enumerate((country,app)for country in ['US','UK','DE','Other']for app in ['iOS','Android'])]}for i,w in enumerate(weekly)]
def allocate(total,weights):
    s=sum(weights);raw=[total*w/s for w in weights];values=[math.floor(v) for v in raw]
    for i in sorted(range(len(values)),key=lambda i:(-(raw[i]-values[i]),i))[:total-sum(values)]:values[i]+=1
    return values
cohorts=[]
for c,w in zip(reg['cohorts'],old):
    groups=[]
    targets=allocate(w['total'],[g['value']['numerator'] for g in w['groups']])
    for g,n in zip(w['groups'],targets):
        country,app=g['country'],g['appPlatform']
        rows=[r for r in c['records'] if r['country']==country and r['appPlatform']==app]
        registered=sum(r['registered'] for r in rows)
        assert 0<=n<=registered
        started=[]
        # Post-opening attributes: never assigned to a non-starter for a rate denominator.
        for line,lineN in zip(['Bird','Hunting'],allocate(n,[70,30])):
            plans=['Plus','Pro'] if line=='Bird' else ['Starter','Plus','Pro']
            for plan,planN in zip(plans,allocate(lineN,[65,35] if line=='Bird' else [50,35,15])):
                for cycle,cycleN in zip(['monthly','annual'],allocate(planN,[70,30])):
                    platforms=['App Store','Web'] if app=='iOS' else ['Google Play','Web']
                    for platform,count in zip(platforms,allocate(cycleN,[80,20])):
                        if count: started.append({'productLine':line,'plan':plan,'billingCycle':cycle,'subscriptionPlatform':platform,'count':count})
        assert sum(r['count'] for r in started)==n
        row={'country':country,'appPlatform':app,'registered':registered,'trialStarted7d':n,'notStarted7d':registered-n,'firstOpeningLagHourCounts':list(zip([0,8,24,48,72,120,167],allocate(n,[15,20,25,16,10,9,5]))),'openings':started}
        assert sum(v for _,v in row['firstOpeningLagHourCounts'])==n
        groups.append(row)
    cohort={'week':c['week'],'start':c['start'],'end':c['end'],'observationThrough':c['observed7Through'],'registered':sum(r['registered'] for r in groups),'trialStarted7d':sum(r['trialStarted7d'] for r in groups),'groups':groups}
    assert cohort['registered']==sum(r['registered'] for r in c['records']) and cohort['trialStarted7d']==w['total']
    cohorts.append(cohort)
facts={'status':'approved-synthetic','classification':'entirely_synthetic','asOf':'2026-09-24','timezone':'UTC','source':'synthetic-trial-opening-v1','registrationSource':reg['version'],'window':'first opening lag >=0 and <168 hours; compare only fully observed registration cohorts','rateDimensions':['country','appPlatform','week'],'compositionOnlyDimensions':['productLine','plan','billingCycle','subscriptionPlatform'],'cohorts':cohorts}
facts['version']=facts.pop('source')
facts['legacyCalibrationCommit']='dc19e124468b23d1800635a22222aad11befb6fe'
facts['population']='All newly registered accounts in the same #9 cohort. Country and App frozen at registration; first opening strictly before 168 hours. Post-opening product, plan, cycle and subscription platform are only composition attributes.'
facts['limitations']='Entirely synthetic frequencies, not account event identities. Not joined to #18 trial-ending cohorts. Old issue scope, baseline and drafts remain historical.'
text=path.read_text();marker='"trialOpeningFacts": '
value=json.dumps(facts,ensure_ascii=False,separators=(',',':'))
if marker in text:
 begin=text.index(marker)+len(marker);_,used=json.JSONDecoder().raw_decode(text[begin:]);text=text[:begin]+value+text[begin+used:]
else:
 begin=text.index('"D": ')+len('"D": ');_,used=json.JSONDecoder().raw_decode(text[begin:]);end=begin+used;boundary=text.rfind('\n  }',begin,end);text=text[:boundary]+',\n    '+marker+value+text[boundary:]
path.write_text(text)
print('Prepared #17: 12 registration cohorts, 96 country x App groups; 1292 / 2750 preserved.')
