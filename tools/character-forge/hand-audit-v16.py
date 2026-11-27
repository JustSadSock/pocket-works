"""Independent geometry audit on the actual evaluated Godot and transferred MakeHuman surfaces."""
import os,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(os.environ['CHARACTER_EVIDENCE'])
ref=json.loads((out/'v15-reference-poses.json').read_text())
target=json.loads((out/'v16-hand-transfer.json').read_text())
def pairs(vertices,faces):
 v=[Vector(x) for x in vertices]
 tree=BVHTree.FromPolygons(v,faces,all_triangles=True,epsilon=0)
 # Ignore only common-vertex neighbors. Classify strict transverse plane crossing
 # separately; tangent/coplanar intersections remain unresolved, never accepted.
 hits=[];strict=[]
 for a,b in tree.overlap(tree):
  if a>=b or set(faces[a])&set(faces[b]):continue
  hits.append((a,b))
  def straddles(f,g):
   x,y,z=[v[i] for i in f];n=(y-x).cross(z-x)
   if n.length<1e-12:return False
   n.normalize();d=[n.dot(v[i]-x) for i in g]
   return min(d)<-1e-6 and max(d)>1e-6
  if straddles(faces[a],faces[b]) and straddles(faces[b],faces[a]):strict.append((a,b))
 return set(hits),set(strict)
def row(name,v,f,base):
 h,s=pairs(v,f)
 return {'name':name,'totalPairs':len(h),'newPairs':len(h-base),'strictTransversePairs':len(s),'unresolvedPairs':len(h-s),'newPairIndices':sorted(h-base)}
def unpack(p):
 return [p['positions'][i:i+3] for i in range(0,len(p['positions']),3)],[p['indices'][i:i+3] for i in range(0,len(p['indices']),3)]
v,f=unpack(ref['poses'][0]['parts'][0]);base=pairs(v,f)[0]
source=[]
for pose in ref['poses']:
 if len(pose['parts'])!=1:raise RuntimeError('Expected single reference mesh')
 v,f=unpack(pose['parts'][0]);source.append(row(pose['name'],v,f,base))
f=target['faces'];base=pairs(target['rest'],f)[0]
b=[row(p['name'],p['vertices'],f,base) for p in target['rows']]
result={'source':source,'transferB':b,'artApproved':False,'gripAllowed':False,'classification':'Strict transverse crossing is a penetration indicator, not measured depth; unresolved contacts require review. Baseline is retained, not waived.'}
(out/'v16-hand-audit.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'source':[{k:v for k,v in r.items() if k!='newPairIndices'} for r in source],'B':[{k:v for k,v in r.items() if k!='newPairIndices'} for r in b]}),flush=True)
