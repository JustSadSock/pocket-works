"""Use the pinned A3 binary context for a local hose refit and attachment-chain audit.
Run with the same first five arguments as pose_tailor.py; the sixth is the composed document.
The final exported binary requires its own independent audit.
"""
from pose_tailor import *
p=Path(sys.argv[6]);full=json.loads(p.read_text());parts={p['name']:p for p in full['parts']}
def ar(p):return np.array(p['positions']).reshape(-1,3),np.array(p['indices']).reshape(-1,3)
tunic=parts['authored artisan tunic'];tv,tf=ar(tunic);hose=[]
def defm(p,v,r,t):return skin(v,np.array(p['joints8']).reshape(-1,8),np.array(p['weights8']).reshape(-1,8),r,t)
for part in full['parts']:
 if not part['name'].startswith('trousers'):continue
 v,f=ar(part);orig=v.copy();side=1 if part['name'].endswith('L') else -1
 if len(v)!=180:raise ValueError('P0.3 hose topology changed')
 for start in range(0,180,18):
  vs=v[start:start+18]
  if vs[:,1].mean()<.74:continue
  sd,c=sdf(B,BF,vs);delta=vs-c;l=np.linalg.norm(delta,axis=1);a=np.clip((vs[:,1]-.74)/.075,0,1);sel=(sd>.006)&(np.sign(c[:,0])==side)&(np.abs(vs[:,0])>.035);target=c+delta/np.maximum(l,1e-9)[:,None]*.005;vs[sel]+=((target-vs)*a[:,None])[sel]
 part['positions']=v.ravel().tolist();part['normals']=np.array(trimesh.Trimesh(v,f,process=False).vertex_normals).ravel().tolist();part['authoredSpec']={'revision':'p0.5 local upper hose refit; unqualified','source':'P0.3 geometry'}
 for label,vv in [('old',orig),('new',v)]:
  r,t,_,_=transforms('idle',0);d=defm(part,vv,r,t);tt=defm(tunic,tv,r,t);_,pairs=classify(np.r_[tt,d],np.r_[tf,f+len(tt)],len(tt),len(tf));hose.append({'part':part['name'],'version':label,'idleTunicCrossings':sum(b>=len(tf) for a,b in pairs)})
def bind(p,h,indices):
 v,f=ar(p);hv,hf=ar(h);loc=vtk.vtkStaticCellLocator();loc.SetDataSet(poly(hv,hf));loc.BuildLocator();rows=[]
 for i in indices:
  c=[0.,0.,0.];cell=vtk.reference(0);sub=vtk.reference(0);dist=vtk.reference(0.);loc.FindClosestPoint(v[i],c,cell,sub,dist);ids=hf[int(cell)];tri=hv[ids];uv=np.linalg.lstsq(np.c_[tri[1]-tri[0],tri[2]-tri[0]],np.array(c)-tri[0],rcond=None)[0];w=np.maximum(0,np.r_[1-uv.sum(),uv]);w/=w.sum();a=w@tri;rows.append({'vertex':int(i),'face':int(cell),'vertices':ids.tolist(),'bary':w.tolist(),'restDistance':float(np.linalg.norm(v[i]-a))})
 return rows
specs=[('authored waist belt','authored artisan tunic','all'),('authored leather work apron','authored waist belt','top'),('pouch belt loop','authored waist belt','rigid'),('belt pouch','pouch belt loop','rigid'),('apron belt buckle','authored waist belt','rigid')];data=[]
phases=[('rest',0)]+[('idle',i/8) for i in range(9)]+[('walk',i/48) for i in range(49)]+[('walk',(6*i+.5)/48) for i in range(8)]
for name,host,kind in specs:
 part,h=parts[name],parts[host];v,_=ar(part);hv,hf=ar(h);inds=np.arange(len(v))
 if kind=='top':
  fixed=np.array(part['authoredSpec']['fixedOuterVertices']);inds=np.r_[fixed,fixed+part['outerVertexCount']]
 b=bind(part,h,inds)
 if kind=='rigid':b=sorted(b,key=lambda x:x['restDistance'])[:4]
 part['authoredSpec']['fixedBindings']=b;part['authoredSpec']['fixedHost']=host;part['authoredSpec']['fixedZoneKind']=kind
 rows=[];pi=np.array([x['vertex'] for x in b]);hi=np.array([x['vertices'] for x in b]);bw0=np.array([x['bary'] for x in b]);rest=np.array([x['restDistance'] for x in b]);rigid_rest=np.linalg.norm(v-v[0],axis=1)
 for action,phase in phases:
  r,t,_,_=transforms(action,phase);d=defm(part,v,r,t);dh=defm(h,hv,r,t);gap=np.linalg.norm(d[pi]-np.einsum('nij,ni->nj',dh[hi],bw0),axis=1);rows.append({'action':action,'phase':phase,'maxGapMm':float(gap.max()*1000),'maxDeltaMm':float(np.max(abs(gap-rest))*1000),'maxRigidErrorMm':float(np.max(abs(np.linalg.norm(d-d[0],axis=1)-rigid_rest))*1000) if kind=='rigid' else None})
 report={'part':name,'host':host,'kind':kind,'anchors':len(b),'maxGapMm':max(x['maxGapMm'] for x in rows),'maxDeltaMm':max(x['maxDeltaMm'] for x in rows),'maxRigidErrorMm':max((x['maxRigidErrorMm'] or 0) for x in rows),'rows':rows};report['passed']=report['maxGapMm']<=18 and report['maxDeltaMm']<=6 and report['maxRigidErrorMm']<=.1;data.append(report)
(out/'attachment-study.json').write_text(json.dumps(data,indent=2));(out/'hose-study.json').write_text(json.dumps(hose,indent=2));p.write_text(json.dumps(full,separators=(',',':'),allow_nan=False))
