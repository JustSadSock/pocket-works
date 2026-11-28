"""P0.5 bounded negative B/C studies; separate research only, not a default workflow."""
from pose_tailor import *
# B: explicit region eligibility + anatomical triangle transfer; single graph diffusion.
locator=vtk.vtkStaticCellLocator();locator.SetDataSet(poly(B,BF));locator.BuildLocator();dense=np.zeros((n,len(J)))
for i,q in enumerate(V[:n]):
 c=[0.,0.,0.];cell=vtk.reference(0);sub=vtk.reference(0);dist=vtk.reference(0.);locator.FindClosestPoint(q,c,cell,sub,dist);ids=BF[int(cell)];tri=B[ids];u,v=tri[1]-tri[0],tri[2]-tri[0];beta=np.linalg.lstsq(np.c_[u,v],np.array(c)-tri[0],rcond=None)[0];bary=np.maximum(0,np.r_[1-beta.sum(),beta]);bary/=bary.sum()
 for k,idx in enumerate(ids):np.add.at(dense[i],bj[idx],bw[idx]*bary[k])
for i,q in enumerate(V[:n]):
 x,y,z=q;allow=[]
 for k,a in enumerate(J):
  name=a['name'];is_arm=any(s in name for s in ['clavicle','shoulder','upperarm','lowerarm','wrist']);is_leg=any(s in name for s in ['upperleg','lowerleg']);is_trunk=name=='root' or any(s in name for s in ['pelvis','spine','breast','neck'])
  ok=(is_trunk and abs(x)<.34) or (is_arm and y>1.04 and ((name.endswith('.L') and x>-.04) or (name.endswith('.R') and x<.04))) or (is_leg and y<1.14 and abs(x)<.25)
  if ok:allow.append(k)
 dense[i,[k for k in range(len(J)) if k not in allow]]=0
 if dense[i].sum()==0:np.add.at(dense[i],j[i],w[i])
 dense[i]/=dense[i].sum()
prior=np.zeros_like(dense)
for i in range(n):np.add.at(prior[i],j[i],w[i])
field=spsolve(eye(n)+3*lap,.7*dense+.3*prior);field=np.maximum(0,field);ix=np.argsort(field,axis=1,kind='stable')[:,-8:][:,::-1];W=np.take_along_axis(field,ix,axis=1);W/=W.sum(1)[:,None];j2=np.r_[ix,ix];w2=np.r_[W,W];Q=np.load(out/'candidate.npy');(out/'B-strict.json').write_text(json.dumps(strict_rows(Q,j2,w2),indent=2));np.savez(out/'domain-candidate.npz',V=Q,j=j2,w=w2)
# C: eight cyclic corrections, one inverse-skin solve per key, unchanged rest and weights.
shapes=[]
for phase in np.arange(8)/8:
 r,t,_,_=transforms('walk',phase);d=skin(V,j,w,r,t);bb=skin(B,bj,bw,r,t);sd,c,inside=sdf(bb,BF,d[n:],True);active=inside&(sd<-.001);M=(r[j[:n]]*w[:n,:,None,None]).sum(1);vec=c-d[n:];norm=np.linalg.norm(vec,axis=1);vec*=((norm+.004)/np.maximum(norm,1e-8))[:,None];z=np.linalg.solve(M,vec[...,None]).squeeze(-1);z[~active]=0;D=spsolve(eye(n)+.65*lap,z);length=np.linalg.norm(D,axis=1);D*=np.minimum(1,.045/np.maximum(length,1e-9))[:,None];shapes.append(np.r_[D,D])
shapes=np.array(shapes);np.save(out/'corrective-deltas.npy',shapes)
def correction(phase):
 x=phase*8;lo=int(x)%8;u=x-int(x);return (1-u)*shapes[lo]+u*shapes[(lo+1)%8]
(out/'C-strict.json').write_text(json.dumps(strict_rows(V,j,w,correction),indent=2))
