"""Independent playback of the actual exported v15 walk in Blender and a raw
matrix skinning evaluator. No Character Core implementation imported."""
import os,json,math,struct
from pathlib import Path
import bpy,numpy as np
from mathutils import Matrix,Vector,Quaternion
from mathutils.kdtree import KDTree
out=Path(os.environ['CHARACTER_EVIDENCE'])
report=json.loads((out/'v15-continuous-report.json').read_text());name=report['selected'];path=out/('v15-walk-'+name+'.glb');clipName=os.environ.get('P0_CLIP','walk')
blob=path.read_bytes();length=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+length]);binary=blob[28+length:]
def acc(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']]
 dt=np.dtype(dtype);return np.ndarray((a['count'],n),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',n*dt.itemsize),dt.itemsize)).copy()
nodes=doc['nodes'];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
skin=doc['skins'][0];inverse=np.array([a.reshape(4,4).T for a in acc(skin['inverseBindMatrices'])])
clip=next(a for a in doc['animations'] if a['name']==clipName)
tracks={}
for ch in clip['channels']:
 s=clip['samplers'][ch['sampler']];tracks[(ch['target']['node'],ch['target']['path'])]=(acc(s['input']).ravel(),acc(s['output']))
prims=[]
for p in doc['meshes'][0]['primitives']:
 a=p['attributes'];v=acc(a['POSITION']);j=acc(a['JOINTS_0']);w=acc(a['WEIGHTS_0'])
 if 'JOINTS_1'in a:j=np.concatenate([j,acc(a['JOINTS_1'])],1);w=np.concatenate([w,acc(a['WEIGHTS_1'])],1)
 prims.append((p.get('extras',{}).get('part',''),v,j,w))
def sample(tr,t,rotation=False):
 ts,vs=tr;i=max(0,min(len(ts)-2,int(np.searchsorted(ts,t,side='right')-1)));u=max(0,min(1,(t-ts[i])/max(1e-12,ts[i+1]-ts[i])))
 if rotation:
  a,b=vs[i],vs[i+1];q=Quaternion((a[3],*a[:3])).slerp(Quaternion((b[3],*b[:3])),u);return [q.x,q.y,q.z,q.w]
 return vs[i]*(1-u)+vs[i+1]*u
def evaluate(t):
 world={}
 def node(i):
  if i in world:return world[i]
  n=nodes[i];p=sample(tracks[(i,'translation')],t) if (i,'translation') in tracks else n.get('translation',[0,0,0]);q=sample(tracks[(i,'rotation')],t,True) if (i,'rotation') in tracks else n.get('rotation',[0,0,0,1])
  mat=np.array(Matrix.Translation(Vector(p))@Quaternion((q[3],*q[:3])).to_matrix().to_4x4())
  world[i]=node(parents[i])@mat if i in parents else mat;return world[i]
 matrices=np.stack([node(i) for i in skin['joints']])@inverse;result=[]
 for name,v,j,w in prims:
  v4=np.concatenate([v,np.ones((len(v),1))],1);p=np.einsum('nkij,nj,nk->ni',matrices[j],v4,w)[:,:3];result.append((name,p))
 return result
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path),merge_vertices=False)
scene=bpy.context.scene;rigs=[x for x in scene.objects if x.type=='ARMATURE'];meshes=[x for x in scene.objects if x.type=='MESH' and any(m.type=='ARMATURE' for m in x.modifiers)]
if len(rigs)!=1 or not meshes:raise RuntimeError('Expected actual imported skinned character')
rig=rigs[0];acts=[a for a in bpy.data.actions if clipName in a.name.lower()]
if len(acts)!=1:raise RuntimeError('Expected single walk action, found '+str([a.name for a in bpy.data.actions]))
action=acts[0];ad=rig.animation_data_create();ad.action=action
if hasattr(action,'slots') and len(action.slots) and not ad.action_slot:ad.action_slot=action.slots[0]
start,end=action.frame_range
def cv(v):return [v.x,v.z,-v.y]
def blender(phase):
 f=start+(end-start)*phase;scene.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();out=[]
 for ob in meshes:
  ev=ob.evaluated_get(dg);mesh=ev.to_mesh();out.extend(cv(ev.matrix_world@v.co) for v in mesh.vertices);ev.to_mesh_clear()
 return out
def kdt(v):
 t=KDTree(len(v))
 for i,p in enumerate(v):t.insert(Vector(p),i)
 t.balance();return t
# Use nearest points in both directions on the full surface; keep boot-only
# measurements separate. Do not rely on importer primitive ordering.
rows=[]
duration=float(max(t[0][-1] for t in tracks.values()))
for phase in sorted(set([i/16 for i in range(17)]+[1/384,111/384,7/24,113/384,17/24,69/96,383/384])):
 raw=evaluate(phase*duration);flat=np.concatenate([v for _,v in raw],0);bv=blender(phase);bt=kdt(bv);rt=kdt(flat)
 forward=np.array([bt.find(Vector(p))[2] for p in flat]);reverse=np.array([rt.find(Vector(p))[2] for p in bv]);boot={}
 for n,v in raw:
  if n not in ('boot L','boot R'):continue
  d=np.array([bt.find(Vector(p))[2] for p in v]);match=[bt.find(Vector(p))[0] for p in v]
  boot[n]={'vertices':len(v),'rawMinY':float(v[:,1].min()),'blenderMatchedMinY':min(p.y for p in match),'maxNearestErrorMm':float(d.max()*1000)}
 rows.append({'phase':phase,'rawVertices':len(flat),'blenderVertices':len(bv),'maxRawToBlenderMm':float(forward.max()*1000),'maxBlenderToRawMm':float(reverse.max()*1000),'p95RawToBlenderMm':float(np.percentile(forward,95)*1000),'boot':boot})
result={'selected':name,'action':action.name,'frameRange':[float(start),float(end)],'fps':scene.render.fps,'rows':rows,'agreement':all(r['maxRawToBlenderMm']<=.5 and r['maxBlenderToRawMm']<=.5 and len(r['boot'])==2 and all(b['maxNearestErrorMm']<=.5 for b in r['boot'].values()) for r in rows),'limits':'Bidirectional vertex-cloud agreement, exact glTF raw matrix/8-influence skinning, not a force-plate test; Blender evaluates actual imported armature and mesh.'}
(out/('p0-blender-'+clipName+'.json')).write_text(json.dumps(result,indent=2));print(json.dumps({'agreement':result['agreement'],'maxErrorMm':max(max(r['maxRawToBlenderMm'],r['maxBlenderToRawMm']) for r in rows)}))
if not result['agreement']:raise RuntimeError('Independent imported playback differs from exported matrix evaluator')
