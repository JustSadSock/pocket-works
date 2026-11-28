"""Read actual GLB skin channels and independently evaluate 67 states.
Only the named clothing primitive versus the full source anatomy; no production receipt.
"""
import json,struct,sys,numpy as np
from pathlib import Path
from scipy.spatial.transform import Rotation as R,Slerp
from collision import classify
glb_path,source_path,part_name,outer,output=sys.argv[1:6];n=int(outer);s=json.loads(Path(source_path).read_text());b=s['parts'][0];B=np.array(b['positions']).reshape(-1,3);BF=np.array(b['indices']).reshape(-1,3);bj=np.array(b.get('joints8',b['joints'])).reshape(len(B),-1);bw=np.array(b.get('weights8',b['weights'])).reshape(len(B),-1);J=s['joints'];P=np.array([x['position'] for x in J]);glb=Path(glb_path).read_bytes()
assert struct.unpack_from('<III',glb)==(0x46546c67,2,len(glb))
l,kind=struct.unpack_from('<II',glb,12);assert kind==0x4e4f534a;doc=json.loads(glb[20:20+l]);length,kind=struct.unpack_from('<II',glb,20+l);raw=glb[28+l:];assert kind==0x004e4942 and len(raw)==length
def acc(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']];width={'VEC4':4,'VEC3':3,'SCALAR':1,'MAT4':16}[a['type']];assert not a.get('sparse') and not a.get('normalized') and v.get('byteStride',np.dtype(dtype).itemsize*width)==np.dtype(dtype).itemsize*width;return np.frombuffer(raw,dtype=dtype,count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],width)
assert doc['skins'][0]['joints']==list(range(len(J)))
for x in J:assert doc['nodes'][x['id']]['name']==x['name'] and np.allclose(doc['nodes'][x['id']]['translation'],x['local'],atol=1e-8,rtol=0)
inv=acc(doc['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);expected=np.repeat(np.eye(4)[None],len(J),axis=0);expected[:,:3,3]=-P;assert np.allclose(inv,expected,atol=1e-6,rtol=0)
p,=[p for mesh in doc['meshes'] for p in mesh['primitives'] if p.get('extras',{}).get('part')==part_name];a=p['attributes'];V=acc(a['POSITION']).astype(float);F=acc(p['indices']).astype(np.int64).reshape(-1,3);j=np.c_[acc(a['JOINTS_0']),acc(a['JOINTS_1'])];w=np.c_[acc(a['WEIGHTS_0']),acc(a['WEIGHTS_1'])].astype(float)
assert n*2==len(V) and np.allclose(w.sum(1),1,atol=1e-5,rtol=0) and np.isfinite(V).all() and np.isfinite(w).all() and np.min(w)>=0 and np.min(j)>=0 and np.max(j)<len(J) and np.min(F)>=0 and np.max(F)<len(V)
E,inc=np.unique(np.sort(np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]),axis=1),axis=0,return_counts=True);L=np.linalg.norm(V[E[:,0]]-V[E[:,1]],axis=1);mask=L>1e-6
clips={}
for a in doc['animations']:
 rot={};tr={}
 for c in a['channels']:
  sm=a['samplers'][c['sampler']];times=acc(sm['input']).ravel();values=acc(sm['output']);target=c['target'];idx=target['node']
  assert sm.get('interpolation','LINEAR')=='LINEAR'
  if target['path']=='rotation':rot[idx]=(times,Slerp(times,R.from_quat(values)))
  elif target['path']=='translation':tr[idx]=(times,values)
  else:raise ValueError('Unsupported animation channel')
 assert set(rot)==set(range(len(J)))
 clips[a['name']]=(rot,tr)
def frame(action,phase):
 if action=='rest':return V,B
 rot,tr=clips[action];rots=[];pos=[]
 for x in J:
  i=x['id'];a=x['parent'];times,slerp=rot[i];local=slerp([float(times[-1])*phase])[0];t=np.array(x['local'])
  if i in tr:
   ts,v=tr[i];t=np.array([np.interp(ts[-1]*phase,ts,v[:,k]) for k in range(3)])
  rots.append(local if a<0 else rots[a]*local);pos.append(t if a<0 else pos[a]+rots[a].apply(t))
 r=np.array([x.as_matrix() for x in rots]);t=np.array(pos)-np.einsum('nij,nj->ni',r,P)
 def deform(V,j,w):return ((np.einsum('nkij,nj->nki',r[j],V)+t[j])*w[:,:,None]).sum(axis=1)
 return deform(V,j,w),deform(B,bj,bw)
phases=[('rest',0)]+[('idle',i/8) for i in range(9)]+[('walk',i/48) for i in range(49)]+[('walk',(i*6+.5)/48) for i in range(8)];rows=[]
def shell(i):return 'outer' if max(F[i])<n else 'lining' if min(F[i])>=n else 'seam'
for action,phase in phases:
 d,bb=frame(action,phase);_,pairs=classify(np.r_[d,bb],np.r_[F,BF+len(d)],len(d),len(F));sp=[(a,b) for a,b in pairs if b<len(F)];cp=[(a,b-len(F)) for a,b in pairs if b>=len(F)];ratio=np.linalg.norm(d[E[:,0]]-d[E[:,1]],axis=1)[mask]/L[mask];classes={}
 for a,b in sp:
  key='/'.join(sorted((shell(a),shell(b))));classes[key]=classes.get(key,0)+1
 row={'action':action,'phase':phase,'self':len(sp),'body':len(cp),'max':float(ratio.max()),'p95':float(np.sort(ratio)[int((len(ratio)-1)*.95)]),'collapsed':int(np.sum(ratio<.1)),'selfTrianglePairs':sp,'bodyTrianglePairs':cp,'rawSelfCrossingsByShell':classes};rows.append(row)
 print(action,round(phase,5),row['self'],row['body'],round(row['max'],4),round(row['p95'],4),flush=True)
def summary(rows):return {k:max(x[k] for x in rows) for k in ['self','body','max','p95','collapsed']}
matched=[x for x in rows if x['action']!='rest' and abs(x['phase']*8-round(x['phase']*8))<1e-8];a=summary(rows);report={'scope':'isolated tunic, actual exported GLB, source anatomy, discrete strict crossings; not full outfit admission','states':len(rows),'summary':a,'matched18':summary(matched),'nonmanifoldEdges':int(np.sum(inc!=2)),'shortEdges':int(np.sum(~mask)),'isolatedGate':bool(np.all(inc==2) and np.all(mask) and a['self']==a['body']==a['collapsed']==0 and a['max']<=1.6 and a['p95']<=1.15),'rows':rows};Path(output).write_text(json.dumps(report,indent=2,allow_nan=False));print(report['summary'],report['matched18'],report['isolatedGate'],flush=True)
