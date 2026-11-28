"""Independent actual-GLB full layered study. Fixed host triangle identities, raw collision pairs, no exemptions."""
from pose_tailor import *
from scipy.spatial import cKDTree
from collections import defaultdict
full=json.loads(Path(sys.argv[6]).read_text());spec={p['name']:p for p in full['parts']};parts={}
for mesh in doc['meshes']:
 for prim in mesh['primitives']:
  name=prim['extras']['part'];assert name in spec and name not in parts;at=prim['attributes'];v=acc(at['POSITION']).astype(float);f=acc(prim['indices']).astype(np.int64).reshape(-1,3);js=np.c_[acc(at['JOINTS_0']),acc(at['JOINTS_1'])];ws=np.c_[acc(at['WEIGHTS_0']),acc(at['WEIGHTS_1'])].astype(float)
  assert len(v)*3==len(spec[name]['positions']) and np.array_equal(f.ravel(),spec[name]['indices']) and np.allclose(v.ravel(),spec[name]['positions'],atol=2e-7,rtol=0) and np.allclose(ws.sum(1),1,atol=1e-5,rtol=0) and np.isfinite(v).all() and np.isfinite(ws).all() and np.min(ws)>=0 and np.min(js)>=0 and np.max(js)<len(J)
  e=np.unique(np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1),axis=0);length=np.linalg.norm(v[e[:,0]]-v[e[:,1]],axis=1);parts[name]={'v':v,'f':f,'j':js,'w':ws,'e':e,'length':length,'validEdge':length>1e-6}
assert set(parts)==set(spec)
layer=[name for name in parts if spec[name].get('layer',0)>0];F_all=[];voff=0;face_owner=[];local_ids=[]
for name in layer:
 p=parts[name];F_all.append(p['f']+voff);voff+=len(p['v']);face_owner.extend([name]*len(p['f']));local_ids.extend(range(len(p['f'])))
F_all=np.concatenate(F_all);cut=len(F_all);f_all=np.r_[F_all,BF+voff];face_owner.extend(['source anatomy']*len(BF));local_ids.extend(range(len(BF)))
anchors=[]
for name,p in spec.items():
 a=p.get('authoredSpec',{});b=a.get('fixedBindings');host=a.get('fixedHost')
 if b is None:continue
 assert host in parts and len(b)>0;v=parts[name]['v'];hv=parts[host]['v'];hf=parts[host]['f'];pi=np.array([x['vertex'] for x in b]);hi=np.array([x['vertices'] for x in b]);bw0=np.array([x['bary'] for x in b]);face=np.array([x['face'] for x in b]);assert len(set(pi))==len(pi) and min(pi)>=0 and max(pi)<len(v) and min(face)>=0 and max(face)<len(hf) and np.array_equal(hi,hf[face]) and np.all(bw0>=0) and np.allclose(bw0.sum(1),1,atol=1e-8,rtol=0)
 rest=np.linalg.norm(v[pi]-np.einsum('nij,ni->nj',hv[hi],bw0),axis=1);assert np.allclose(rest,[x['restDistance'] for x in b],atol=2e-7,rtol=0)
 kind=a['fixedZoneKind'];nearest=cKDTree(hv).query(v[pi])[1];legacy=np.linalg.norm(v[pi]-hv[nearest],axis=1);anchors.append((name,host,kind,pi,hi,bw0,rest,nearest,legacy,np.linalg.norm(v-v[0],axis=1)))
assert len(anchors)==5
phases=[('rest',0)]+[('idle',i/8) for i in range(9)]+[('walk',i/48) for i in range(49)]+[('walk',(6*i+.5)/48) for i in range(8)]+[('walk',.26),('walk',.29),('walk',.77)];rows=[];worst={};att={}
for action,phase in phases:
 r,t,_,_=transforms(action,phase);posed={name:skin(p['v'],p['j'],p['w'],r,t) for name,p in parts.items()};bb=skin(B,bj,bw,r,t);_,pairs=classify(np.r_[np.concatenate([posed[name] for name in layer]),bb],f_all,voff,cut);pair_groups=defaultdict(list)
 for a,b in pairs:
  oa,ob=face_owner[a],face_owner[b];la,lb=local_ids[a],local_ids[b];pair_groups[(oa,ob)].append([la,lb])
 metrics={}
 for name in layer:
  p=parts[name];v=posed[name];e=p['e'];mask=p['validEdge'];ratio=np.linalg.norm(v[e[:,0]]-v[e[:,1]],axis=1)[mask]/p['length'][mask];m={'max':float(ratio.max(initial=1)),'p95':float(np.sort(ratio)[int((len(ratio)-1)*.95)]) if len(ratio) else 1,'collapsed':int(np.sum(ratio<.1)),'shortEdges':int(np.sum(~mask))};metrics[name]=m;z=worst.setdefault(name,{'max':0.,'p95':0.,'collapsed':0,'shortEdges':0})
  for k in m:z[k]=max(z[k],m[k])
 ar=[]
 for name,host,kind,pi,hi,bw0,rest,nearest,legacy,rigid_rest in anchors:
  d=posed[name];h=posed[host];gap=np.linalg.norm(d[pi]-np.einsum('nij,ni->nj',h[hi],bw0),axis=1);legacygap=np.linalg.norm(d[pi]-h[nearest],axis=1);rigid=float(np.max(abs(np.linalg.norm(d-d[0],axis=1)-rigid_rest))*1000) if kind=='rigid' else 0.;m={'part':name,'host':host,'kind':kind,'maxGapMm':float(gap.max()*1000),'maxDeltaMm':float(np.max(abs(gap-rest))*1000),'legacyMaxDeltaMm':float(np.max(abs(legacygap-legacy))*1000),'maxRigidErrorMm':rigid};ar.append(m);z=att.setdefault(name,{k:m[k] for k in ['part','host','kind']}|{'maxGapMm':0.,'maxDeltaMm':0.,'legacyMaxDeltaMm':0.,'maxRigidErrorMm':0.})
  for k in ['maxGapMm','maxDeltaMm','legacyMaxDeltaMm','maxRigidErrorMm']:z[k]=max(z[k],m[k])
 row={'action':action,'phase':phase,'self':sum(len(v) for (a,b),v in pair_groups.items() if a==b),'body':sum(len(v) for (a,b),v in pair_groups.items() if b=='source anatomy'),'layer':sum(len(v) for (a,b),v in pair_groups.items() if a!=b and b!='source anatomy'),'parts':metrics,'attachments':ar,'rawPairs':[{'a':a,'b':b,'pairs':v} for (a,b),v in sorted(pair_groups.items())]};rows.append(row);print(action,round(phase,5),row['self'],row['body'],row['layer'],flush=True)
for a in att.values():a['passed']=a['maxGapMm']<=18 and a['maxDeltaMm']<=6 and a['maxRigidErrorMm']<=.1
summ={k:max(x[k] for x in rows) for k in ['self','body','layer']};gate=not any(summ.values()) and all(x['max']<=1.6 and x['p95']<=1.15 and x['collapsed']==x['shortEdges']==0 for x in worst.values()) and all(a['passed'] for a in att.values());report={'scope':'actual GLB, all layers against full source anatomy, 67 required plus 3 exact defect phases; discrete no continuous claim','states':len(rows),'summary':summ,'worstByPart':worst,'attachments':att,'layeredStudyGate':bool(gate),'rows':rows};(out/'full-binary-audit.json').write_text(json.dumps(report,separators=(',',':'),allow_nan=False));print(summ,att,gate,flush=True)
