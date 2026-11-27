"""Independent BVH, signed normal and area audit of the actual index surfaces."""
import json,os,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(os.environ['CHARACTER_EVIDENCE'])
data=json.loads((out/'v17-hand-surface.json').read_text())
def audit(v,f):
 v=[Vector(x) for x in v];tree=BVHTree.FromPolygons(v,f,all_triangles=True,epsilon=0)
 def side(a,b):
  x,y,z=[v[i] for i in f[a]];n=(y-x).cross(z-x)
  if n.length<1e-12:return False
  n.normalize();d=[n.dot(v[i]-x) for i in f[b]]
  return min(d)<-1e-6 and max(d)>1e-6
 pairs={(a,b) for a,b in tree.overlap(tree) if a<b and not set(f[a])&set(f[b])}
 return pairs,{(a,b) for a,b in pairs if side(a,b) and side(b,a)}
def geom(v,f):
 v=[Vector(x) for x in v];return [(v[b]-v[a]).cross(v[c]-v[a]) for a,b,c in f]
reports={}
for c in data['cases']:
 f=c['faces'];base,baseStrict=audit(c['rest'],f);rest=geom(c['rest'],f);rows=[]
 for r in c['rows']:
  pairs,strict=audit(r['vertices'],f);cur=geom(r['vertices'],f)
  ratios=[b.length/a.length for a,b in zip(rest,cur) if a.length>1e-12]
  rows.append({'phase':r['phase'],'totalPairs':len(pairs),'strictPairs':len(strict),'newPairs':len(pairs-base),'newStrictPairs':len(strict-baseStrict),'strictIndices':sorted(strict),'areaMin':min(ratios),'areaMax':max(ratios),'areaTotalRatio':sum(x.length for x in cur)/sum(x.length for x in rest),'normalOpposedToRest':sum(a.dot(b)<0 for a,b in zip(rest,cur))})
 reports[c['name']]={'rows':rows,'zeroNewStrict':all(x['newStrictPairs']==0 for x in rows),'artApproved':False}
result={'reports':reports,'gripAllowed':False,'note':'Normals compared in world space, rotations may reverse their orientation without triangle inversion. Contact classification does not waive unresolved pairs.'}
(out/'v17-hand-audit.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:[{x:y for x,y in r.items() if x!='strictIndices'} for r in v['rows']] for k,v in reports.items()}),flush=True)
