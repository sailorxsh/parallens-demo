"""Independently check count allocation and subset constraints, not real device lineage."""
from pathlib import Path
import json,subprocess,math
R=Path(__file__).resolve().parents[1]
result=json.loads(subprocess.check_output(['node',str(R/'scripts/verify_device_state_projection.mjs')],text=True));metrics=json.loads((R/'data/metric-values.json').read_text());slices=json.loads((R/'data/filter-slices.json').read_text());base=metrics['m50']['value'];checked=0
# Existing dimensions are a synthetic independent model, not linked device records.
def allocated(total,state,kind):
 d=[(k,v) for k,v in state.items() if not(k=='deviceStatus' and v=='Effective')]
 if any(k=='deviceModel' for k,v in d):d=[(k,v) for k,v in d if k!='productLine']
 property='denominatorShare' if kind=='denominator' else 'numeratorShare'
 weight=math.prod(slices[k][v][property] for k,v in d)
 if len(d)!=1:return math.floor(total*weight+.5)
 k,selected=d[0];options=list(slices[k]);weights=[slices[k][v][property] for v in options];exact=[total*w/sum(weights) for w in weights];counts=[math.floor(n) for n in exact]
 for i in sorted(range(len(options)),key=lambda i:(-(exact[i]-counts[i]),i))[:total-sum(counts)]:counts[i]+=1
 return counts[options.index(selected)]
for c in result['cases']:
 state=c['state'];part=c['part'];v=part['value'];bound=allocated(metrics['m08']['value']['boundCurrent'],state,'denominator');activated=allocated(metrics['m08']['value']['activatedCumulative'],state,'denominator');not_activated=allocated(base['boundNotActivated'],state,'denominator');shared=allocated(metrics['m49']['numerator'],state,'numerator');bound_active=bound-not_activated
 sub=math.floor(shared*base['sharedBoundNotActivated']/metrics['m49']['numerator']+.5);sub=max(max(0,shared-bound_active),min(min(not_activated,shared),sub))
 expected=dict(boundActivated=bound_active,boundNotActivated=not_activated,activatedUnbound=activated-bound_active,sharedBoundActivated=shared-sub,sharedBoundNotActivated=sub)
 assert v==expected,(state,v,expected);assert part['shared']==shared and part['boundCurrent']==bound and part['activatedCumulative']==activated
 assert v['sharedBoundActivated']<=v['boundActivated'] and v['sharedBoundNotActivated']<=v['boundNotActivated'];checked+=5
# Single-dimension partitions close to the source overall. Cross-dimension
# attribution still has the pre-existing independent-model limitations.
for key,options in [('country',['US','UK','DE','Other']),('appPlatform',['iOS','Android']),('deviceModel',['K6','Bird Lite','Bird Pro','Hunt Pro']),('productLine',['Bird','Hunting'])]:
 parts=[next(c['part']['value'] for c in result['cases'] if c['state']=={key:v}) for v in options]
 for field,n in base.items():assert sum(p[field] for p in parts)==n,(key,field)
print(json.dumps({'status':'PASS','scopes':len(result['cases']),'stateCountsCompared':checked,'neutralStatusChecks':result['neutralChecks'],'sourceGuardChecks':result['sourceGuardChecks'],'singleDimensionPartitions':4,'knownZero':result['knownZero'],'limitation':'Verifies arithmetic consistency of synthetic slices, not real joint ownership, device identities, six-month history or product/model population attribution.'},ensure_ascii=False))
