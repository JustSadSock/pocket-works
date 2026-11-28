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

import vtk
from vtk.util.numpy_support import numpy_to_vtk,numpy_to_vtkIdTypeArray
from scipy.sparse import coo_matrix,diags,eye
from scipy.sparse.linalg import spsolve
out=Path(output);out.mkdir(parents=True,exist_ok=True)
def transforms(action,phase):
 if action=='rest':return np.repeat(np.eye(3)[None],len(J),axis=0),np.zeros_like(P),P.copy(),np.repeat(np.eye(3)[None],len(J),axis=0)
 rot,tr=clips[action];rots=[];pos=[];loc=[]
 for x in J:
  i=x['id'];a=x['parent'];times,slerp=rot[i];local=slerp([float(times[-1])*phase])[0];t=np.array(x['local']);loc.append(local.as_matrix())
  if i in tr:
   ts,v=tr[i];t=np.array([np.interp(ts[-1]*phase,ts,v[:,k]) for k in range(3)])
  rots.append(local if a<0 else rots[a]*local);pos.append(t if a<0 else pos[a]+rots[a].apply(t))
 r=np.array([x.as_matrix() for x in rots]);t=np.array(pos)-np.einsum('nij,nj->ni',r,P);return r,t,np.array(pos),np.array(loc)
def skin(v,j,w,r,t):return ((np.einsum('nkij,nj->nki',r[j],v)+t[j])*w[:,:,None]).sum(axis=1)
def poly(v,f):
 pts=vtk.vtkPoints();pts.SetData(numpy_to_vtk(np.ascontiguousarray(v),deep=True));cells=vtk.vtkCellArray();cells.SetData(numpy_to_vtkIdTypeArray(np.arange(0,3*(len(f)+1),3,dtype=np.int64),deep=True),numpy_to_vtkIdTypeArray(np.ascontiguousarray(f,dtype=np.int64).ravel(),deep=True));p=vtk.vtkPolyData();p.SetPoints(pts);p.SetPolys(cells);return p
def sdf(v,f,q,parity=False):
 p=poly(v,f);d=vtk.vtkImplicitPolyDataDistance();d.SetInput(p);closest=[];dist=[]
 for x in q:
  c=[0.,0.,0.];dist.append(d.EvaluateFunctionAndGetClosestPoint(x,c));closest.append(c)
 dist=np.array(dist);closest=np.array(closest)
 if parity:
  e=vtk.vtkSelectEnclosedPoints();e.Initialize(p);inside=np.array([bool(e.IsInsideSurface(x)) for x in q]);e.Complete();return dist,closest,inside
 return dist,closest
# Analytic closed outward-oriented tetrahedron control. Do not assume an arbitrary open source admits sign.
vv=np.array([[0.,0.,0.],[1,0,0],[0,1,0],[0,0,1]]);ff=np.array([[0,2,1],[0,1,3],[0,3,2],[1,2,3]]);dd,_,ii=sdf(vv,ff,np.array([[.1,.1,.1],[2,0,0],[.1,.1,-.2]]),True);assert np.allclose(dd,[-.1,1,.2]) and ii.tolist()==[True,False,False]
import trimesh
body=trimesh.Trimesh(B,BF,process=False);assert body.is_watertight and body.is_winding_consistent and body.volume>0
outer=F[np.max(F,axis=1)<n];EO=E[np.max(E,axis=1)<n];A=coo_matrix((np.ones(len(EO)*2),(np.r_[EO[:,0],EO[:,1]],np.r_[EO[:,1],EO[:,0]])),shape=(n,n)).tocsr();lap=diags(np.asarray(A.sum(1)).ravel())-A
regions=np.where(np.abs(V[:n,0])>.23,np.where(V[:n,0]>0,'left sleeve','right sleeve'),np.where(V[:n,1]<1.05,'lower panels',np.where(V[:n,1]>1.35,'shoulders/neck','chest/back')))
ph=[('rest',0),('idle',0),('walk',0),('walk',.26),('walk',.29),('walk',.77),('walk',38/48)]
def measure(v,action,phase,save=False):
 r,t,_,_=transforms(action,phase);d=skin(v,j,w,r,t);bb=skin(B,bj,bw,r,t);sample=np.r_[d,d[outer].mean(1)];sd,c,inside=sdf(bb,BF,sample,True);neg=inside&(sd<0);cent=neg[len(d):];tri=d[outer];area=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)/2;th=np.linalg.norm(d[:n]-d[n:],axis=1)
 affected=d[:n][neg[:n]];row={'action':action,'phase':phase,'maxDepthMm':float(max(0,-sd[neg].min(initial=0))*1000),'outerDepthMm':float(max(0,-sd[:n][neg[:n]].min(initial=0))*1000),'outerAreaCentroidCm2':float(area[cent].sum()*1e4),'outerAreaPercent':float(area[cent].sum()/area.sum()*100),'signDisagreement':int(np.sum((sd<0)!=inside)),'regions':{},'outerAffectedExtentMm':(np.ptp(affected,axis=0)*1000).tolist() if len(affected) else [0,0,0],'thicknessMm':[float(th.min()*1000),float(np.median(th)*1000),float(th.max()*1000)]}
 for region in sorted(set(regions)):
  mask=(regions==region)&neg[:n];row['regions'][region]={'insideOuterVertices':int(mask.sum()),'maxDepthMm':float(-sd[:n][mask].min(initial=0)*1000)}
 if save:np.savez(out/f'{action}-{phase:.4f}.npz',d=d,bb=bb,sd=sd,inside=inside)
 return row
def strict_rows(v,jj,ww,corrective=None):
 rr=[];rest=np.linalg.norm(v[E[:,0]]-v[E[:,1]],axis=1)
 for action,phase in ph:
  r,t,_,_=transforms(action,phase);q=v if corrective is None or action!='walk' else v+corrective(phase);d=skin(q,jj,ww,r,t);bb=skin(B,bj,bw,r,t);_,pairs=classify(np.r_[d,bb],np.r_[F,BF+len(d)],len(d),len(F));sp=[(a,b) for a,b in pairs if b<len(F)];cp=[(a,b-len(F)) for a,b in pairs if b>=len(F)];ratio=np.linalg.norm(d[E[:,0]]-d[E[:,1]],axis=1)/rest
  rr.append({'action':action,'phase':phase,'self':len(sp),'body':len(cp),'max':float(ratio.max()),'p95':float(np.sort(ratio)[int((len(ratio)-1)*.95)]),'collapsed':int((ratio<.1).sum()),'selfTrianglePairs':sp,'bodyTrianglePairs':cp})
 return rr
def main():
 r0,t0,p0,l0=transforms('idle',0);r1,t1,p1,l1=transforms('walk',0);names=['root','pelvis.L','pelvis.R','spine05','spine03','spine01','clavicle.L','clavicle.R','shoulder01.L','shoulder01.R','upperarm01.L','upperarm01.R','lowerarm01.L','lowerarm01.R','upperleg01.L','upperleg01.R'];jointrows=[]
 for name in names:
  i=next(x['id'] for x in J if x['name']==name);jointrows.append({'joint':name,'localDeltaDegrees':float(np.rad2deg(R.from_matrix(l1[i]@l0[i].T).magnitude())),'globalDeltaDegrees':float(np.rad2deg(R.from_matrix(r1[i]@r0[i].T).magnitude())),'rootRelativeShiftMm':float(np.linalg.norm((p1[i]-p1[0])-(p0[i]-p0[0]))*1000),'absoluteShiftMm':float(np.linalg.norm(p1[i]-p0[i])*1000)})
 rows=[measure(V,a,p,True) for a,p in ph];(out/'diagnosis.json').write_text(json.dumps({'method':'VTK nearest triangle pseudonormal sign cross-checked with enclosed ray parity; closed source; possible self-overlap of posed anatomy means approximate depth, not continuous proof; centroid sampled outer area','control':dd.tolist(),'jointTransforms':jointrows,'rows':rows},indent=2))
 # A: bounded local geometry correction, unchanged weights, paired displacement. One solve, 35 mm cap, eight training poses.
 D=np.zeros((n,3));score=np.zeros(n)
 for phase in [0,.125,.26,.29,.5,.625,.77,38/48]:
  r,t,_,_=transforms('walk',phase);d=skin(V,j,w,r,t);bb=skin(B,bj,bw,r,t);sd,c,inside=sdf(bb,BF,d[n:],True);active=inside&(sd<-.001);M=(r[j[:n]]*w[:n,:,None,None]).sum(1);vec=c-d[n:];norm=np.linalg.norm(vec,axis=1);vec*=((norm+.003)/np.maximum(norm,1e-8))[:,None];z=np.linalg.solve(M,vec[...,None]).squeeze(-1);strength=np.linalg.norm(z,axis=1);sel=active&(strength>score);D[sel]=z[sel];score[sel]=strength[sel]
 D=spsolve(eye(n)+1.2*lap,D);length=np.linalg.norm(D,axis=1);D*=np.minimum(1,.035/np.maximum(length,1e-9))[:,None];Q=V+np.r_[D,D];np.save(out/'geometry-displacement.npy',D);np.save(out/'candidate.npy',Q)
 newrows=[measure(Q,a,p) for a,p in ph];(out/'geometry-study.json').write_text(json.dumps({'hypothesis':'bounded local rest displacement, unchanged weights and paired lining','rows':newrows,'maxMoveMm':float(np.linalg.norm(D,axis=1).max()*1000)},indent=2))
 for name,v in [('A3',V),('A',Q)]:(out/(name+'-strict.json')).write_text(json.dumps(strict_rows(v,j,w),indent=2))
if __name__=='__main__':main()
