"""Independent BVH, signed normal and area audit of the actual index surfaces."""
import json,os,math,struct
import numpy as np
from mathutils import Matrix,Quaternion
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
def raw_glb(case):
 blob=(out/('v17-hand-'+case['name']+'.glb')).read_bytes()
 size=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+size]);binary=blob[28+size:]
 def acc(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']])
  return np.ndarray((a['count'],n),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',n*dt.itemsize),dt.itemsize)).copy()
 nodes=doc['nodes'];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
 skin=doc['skins'][0];ib=np.array([a.reshape(4,4).T for a in acc(skin['inverseBindMatrices'])])
 clip=next(a for a in doc['animations'] if a['name']=='walk')
 tracks={}
 for ch in clip['channels']:
  sampler=clip['samplers'][ch['sampler']];tracks[(ch['target']['node'],ch['target']['path'])]=acc(sampler['output'])
 prim=doc['meshes'][0]['primitives'][0];attr=prim['attributes'];verts=acc(attr['POSITION']);js=acc(attr['JOINTS_0']);ws=acc(attr['WEIGHTS_0'])
 if 'JOINTS_1' in attr:js=np.concatenate([js,acc(attr['JOINTS_1'])],1);ws=np.concatenate([ws,acc(attr['WEIGHTS_1'])],1)
 meshNode=next(i for i,n in enumerate(nodes) if 'mesh' in n)
 delta=acc(prim['targets'][0]['POSITION']) if prim.get('targets') else None
 if case['activation'] is not None and (delta is None or (meshNode,'weights') not in tracks):raise RuntimeError('Missing actual GLB corrective channels')
 rows=[]
 for i,r in enumerate(case['rows']):
  world={}
  def node(j):
   if j in world:return world[j]
   n=nodes[j];t=tracks.get((j,'translation'));q=tracks.get((j,'rotation'));t=t[i] if t is not None else n.get('translation',[0,0,0]);q=q[i] if q is not None else n.get('rotation',[0,0,0,1])
   m=np.array(Matrix.Translation(Vector(t))@Quaternion((q[3],*q[:3])).to_matrix().to_4x4())
   world[j]=node(parents[j])@m if j in parents else m
   return world[j]
  matrices=np.stack([node(j) for j in skin['joints']])@ib
  weight=float(tracks[(meshNode,'weights')][i,0]) if delta is not None else 0
  v=verts+delta*weight if delta is not None else verts
  idx=case['indices'];v=v[idx];j=js[idx];w=ws[idx];v4=np.concatenate([v,np.ones((len(v),1))],1)
  posed=np.einsum('nkij,nj,nk->ni',matrices[j],v4,w)[:,:3];err=np.linalg.norm(posed-np.array(r['vertices']),axis=1)*1000
  rows.append({'phase':r['phase'],'morphWeight':weight,'maxVertexErrorMm':float(err.max()),'meanVertexErrorMm':float(err.mean())})
 return {'rows':rows,'agreement':all(r['maxVertexErrorMm']<=.05 for r in rows),'method':'Independent raw float32 GLB morph-before-skin matrix evaluation, not Blender importer playback'}
reports={}
for c in data['cases']:
 f=c['faces'];base,baseStrict=audit(c['rest'],f);rest=geom(c['rest'],f);rows=[]
 for r in c['rows']:
  pairs,strict=audit(r['vertices'],f);cur=geom(r['vertices'],f)
  ratios=[b.length/a.length for a,b in zip(rest,cur) if a.length>1e-12]
  rows.append({'phase':r['phase'],'totalPairs':len(pairs),'strictPairs':len(strict),'newPairs':len(pairs-base),'newStrictPairs':len(strict-baseStrict),'strictIndices':sorted(strict),'areaMin':min(ratios),'areaMax':max(ratios),'areaTotalRatio':sum(x.length for x in cur)/sum(x.length for x in rest),'normalOpposedToRest':sum(a.dot(b)<0 for a,b in zip(rest,cur))})
 reports[c['name']]={'glbPlayback':raw_glb(c),'rows':rows,'zeroNewStrict':all(x['newStrictPairs']==0 for x in rows),'artApproved':False}
result={'reports':reports,'gripAllowed':False,'note':'Normals compared in world space, rotations may reverse their orientation without triangle inversion. Contact classification does not waive unresolved pairs.'}
(out/'v17-hand-audit.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:{'rows':[{x:y for x,y in r.items() if x!='strictIndices'} for r in v['rows']],'glbPlayback':v['glbPlayback']} for k,v in reports.items()}),flush=True)
if not all(v['glbPlayback']['agreement'] for v in reports.values()):raise RuntimeError('GLB corrective playback diverged from evaluated candidate')
