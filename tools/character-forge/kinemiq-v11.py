"""Exact KinemIQ GLB channel evaluator and mannequin binding, no Blender required."""
import os,json,struct,math,zipfile,hashlib,bisect,copy
from pathlib import Path
out=Path(os.environ["CHARACTER_EVIDENCE"])
archive=out/"morph"/"v9-cc0-motions.zip"
def unpack(b):
 assert b[:4]==b'glTF' and struct.unpack_from('<I',b,4)[0]==2
 n,tag=struct.unpack_from('<I4s',b,12);assert tag==b'JSON'
 d=json.loads(b[20:20+n]);size,tag=struct.unpack_from('<I4s',b,20+n);assert tag==b'BIN\0'
 return d,b[28+n:28+n+size]
def pack(d,b):
 j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);b+=b'\0'*(-len(b)%4)
 return struct.pack('<4sII',b'glTF',2,28+len(j)+len(b))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(b),b'BIN\0')+b
def acc(d,b,i):
 a=d['accessors'][i];assert not a.get('sparse');v=d['bufferViews'][a['bufferView']]
 assert v.get('buffer',0)==0
 fmt='<'+{5126:'f',5125:'I',5123:'H',5121:'B',5122:'h',5120:'b'}[a['componentType']]*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',struct.calcsize(fmt))
 return [struct.unpack_from(fmt,b,offset+k*stride) for k in range(a['count'])]
def norm(q):
 n=math.sqrt(sum(x*x for x in q));assert n>0
 return [x/n for x in q]
def slerp(a,b,t):
 a=norm(a);b=norm(b);c=sum(x*y for x,y in zip(a,b))
 if c<0:b=[-x for x in b];c=-c
 if c>.9995:return norm([x+(y-x)*t for x,y in zip(a,b)])
 th=math.acos(max(-1,min(1,c)));return [ (x*math.sin((1-t)*th)+y*math.sin(t*th))/math.sin(th) for x,y in zip(a,b)]
def mat(n):
 if 'matrix' in n:return list(n['matrix'])
 x,y,z,w=norm(n.get('rotation',[0,0,0,1]));sx,sy,sz=n.get('scale',[1,1,1]);tx,ty,tz=n.get('translation',[0,0,0])
 return [(1-2*y*y-2*z*z)*sx,(2*x*y+2*z*w)*sx,(2*x*z-2*y*w)*sx,0,(2*x*y-2*z*w)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*x*w)*sy,0,(2*x*z+2*y*w)*sz,(2*y*z-2*x*w)*sz,(1-2*x*x-2*y*y)*sz,0,tx,ty,tz,1]
def mul(a,b):return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]
def worlds(nodes):
 parents={}
 for i,n in enumerate(nodes):
  for c in n.get('children',[]):
   if c in parents:raise ValueError('multiple parents')
   parents[c]=i
 cache={}
 def rec(i):
  if i not in cache:cache[i]=mul(rec(parents[i]),mat(nodes[i])) if i in parents else mat(nodes[i])
  return cache[i]
 return [rec(i) for i in range(len(nodes))]
def channels(d,b):
 a=d['animations'][0];out=[]
 for c in a['channels']:
  s=a['samplers'][c['sampler']];mode=s.get('interpolation','LINEAR');assert mode in ('LINEAR','STEP')
  t=[x[0] for x in acc(d,b,s['input'])];v=acc(d,b,s['output']);assert len(t)==len(v) and all(y>x for x,y in zip(t,t[1:]))
  out.append((c['target']['node'],c['target']['path'],t,v,mode))
 return out
def evaluate(nodes,tracks,time):
 ns=copy.deepcopy(nodes)
 for i,p,t,v,mode in tracks:
  k=max(0,min(len(t)-1,bisect.bisect_right(t,time)-1));j=min(k+1,len(t)-1);f=0 if j==k or mode=='STEP' else max(0,min(1,(time-t[k])/(t[j]-t[k])))
  ns[i][p]=slerp(v[k],v[j],f) if p=='rotation' else [x+(y-x)*f for x,y in zip(v[k],v[j])]
 return ns,worlds(ns)
def names(d):return {n['name']:i for i,n in enumerate(d['nodes'])}
with zipfile.ZipFile(archive) as z:
 mb=z.read('KinemIQ_Mannequin.glb');cb=z.read('GLB/Walk_forwards.glb')
m,binm=unpack(mb);c,binc=unpack(cb);mn,cn=names(m),names(c);tracks=channels(c,binc)
assert len(tracks)==67 and not c.get('skins') and len(m['skins'])==3
assert all(c['nodes'][i]['name'] in mn for i,_,_,_,_ in tracks)
mp={child:n['name'] for n in m['nodes'] for child in n.get('children',[])}
cp={child:n['name'] for n in c['nodes'] for child in n.get('children',[])}
for i,_,_,_,_ in tracks:
 j=mn[c['nodes'][i]['name']];assert cp.get(i)==mp.get(j)
 # Compare bone lengths and translations except explicitly animated pelvis translation.
 if c['nodes'][i]['name']!='pelvis':assert math.dist(c['nodes'][i].get('translation',[0,0,0]),m['nodes'][j].get('translation',[0,0,0]))<1e-5
start=min(t[0] for _,_,t,_,_ in tracks);end=max(t[-1] for _,_,t,_,_ in tracks)
aliases={'pelvis':'pelvis','root':'root','spine01':'spine_01','spine02':'spine_02','spine03':'spine_03','neck':'neck_01','head':'Head'}
for s in ['l','r']:
 for k in ['clavicle','upperarm','lowerarm','hand','thigh','calf','foot','ball']:aliases[k+'.'+s.upper()]=k+'_'+s
# Option A: attach the original, unmodified animation accessors to mannequin.
# Only indices and buffer offsets change; animation sample bytes remain intact.
merged=copy.deepcopy(m);padding=b'\0'*(-len(binm)%4);offset=len(binm)+len(padding);bv=len(merged['bufferViews']);ac=len(merged['accessors'])
for v in c['bufferViews']:merged['bufferViews'].append({**v,'byteOffset':v.get('byteOffset',0)+offset})
for a in c['accessors']:merged['accessors'].append({**a,'bufferView':a['bufferView']+bv})
a=copy.deepcopy(c['animations'][0])
for s in a['samplers']:s['input']+=ac;s['output']+=ac
for ch in a['channels']:ch['target']['node']=mn[c['nodes'][ch['target']['node']]['name']]
merged['animations']=[a];blob=binm+padding+binc;merged['buffers'][0]['byteLength']=len(blob)
bound=pack(merged,blob);(out/'v11-kinemiq-original.glb').write_bytes(bound)
# Option B: evaluate the skinless clip directly, cross-check every animated
# world transform against the independently remapped mannequin hierarchy.
mt=channels(merged,blob);frames=[];err=0
for k in range(25):
 phase=k/24;t=start+(end-start)*phase;local,w=evaluate(c['nodes'],tracks,t);ml,mw=evaluate(merged['nodes'],mt,t)
 for i,_,_,_,_ in tracks:
  j=mn[c['nodes'][i]['name']];err=max(err,max(abs(x-y) for x,y in zip(w[i],mw[j])))
 frames.append({'phase':phase,'timeSeconds':t,'points':{k:w[cn[v]][12:15] for k,v in aliases.items()},'worldMatrices':{k:w[cn[v]] for k,v in aliases.items()},'localTRS':{k:{p:local[cn[v]].get(p,default) for p,default in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])]} for k,v in aliases.items()}})
if err>1e-5:raise ValueError('Clip/mannequin world transforms disagree: '+str(err))
# True bind pose comes from inverse bind matrices, not the mannequin animation's first frame.
def inv_affine(a):
 # Gauss-Jordan; column-major glTF.
 rows=[[a[c*4+r] for c in range(4)]+[float(r==c) for c in range(4)] for r in range(4)]
 for i in range(4):
  j=max(range(i,4),key=lambda k:abs(rows[k][i]));rows[i],rows[j]=rows[j],rows[i];v=rows[i][i];assert abs(v)>1e-10;rows[i]=[x/v for x in rows[i]]
  for j in range(4):
   if j!=i:
    v=rows[j][i];rows[j]=[x-v*y for x,y in zip(rows[j],rows[i])]
 return [rows[r][4+c] for c in range(4) for r in range(4)]
skin=m['skins'][2];ib=acc(m,binm,skin['inverseBindMatrices']);bind={m['nodes'][i]['name']:inv_affine(b) for i,b in zip(skin['joints'],ib)}
rest={k:bind[v][12:15] for k,v in aliases.items()}
report={'source':'GLB/Walk_forwards.glb','action':a['name'],'axis':'glTF Y-up','license':'CC0-1.0','archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'durationSeconds':end-start,'rest':rest,'bindMatrices':{k:bind[v] for k,v in aliases.items()},'frames':frames,'sourceNodes':len(c['nodes']),'mannequinNodes':len(m['nodes']),'channels':len(tracks),'maxWorldMatrixDifference':err,'rootTravel': [y-x for x,y in zip(frames[0]['points']['root'],frames[-1]['points']['root'])],'pelvisTravel':[y-x for x,y in zip(frames[0]['points']['pelvis'],frames[-1]['points']['pelvis'])]}
(out/'v10-reference-trajectory.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ['frames','rest','bindMatrices']}))

# Actual original skinned geometry, not a skeleton illustration. Use the
# mannequin's weights and inverse bind matrices, unchanged.
def point(a,p):return [sum(a[k*4+r]*p[k] for k in range(3))+a[12+r] for r in range(3)]
parts=[]
for node in m['nodes']:
 if 'mesh' not in node:continue
 skin=m['skins'][node['skin']];ib=acc(m,binm,skin['inverseBindMatrices'])
 for p in m['meshes'][node['mesh']]['primitives']:
  at=p['attributes'];pos=acc(m,binm,at['POSITION']);joints=acc(m,binm,at['JOINTS_0']);weights=acc(m,binm,at['WEIGHTS_0']);indices=[i[0] for i in acc(m,binm,p['indices'])]
  assert all(abs(sum(w)-1)<.001 for w in weights)
  color=m['materials'][p['material']]['pbrMetallicRoughness']['baseColorFactor'][:3]
  parts.append((node['name'],skin,ib,pos,joints,weights,indices,color))
samples=[]
for k in range(25):
 t=start+(end-start)*k/24;_,w=evaluate(merged['nodes'],mt,t);meshes=[]
 for name,skin,ib,pos,joints,weights,indices,color in parts:
  matrix=[mul(w[j],b) for j,b in zip(skin['joints'],ib)];v=[]
  for p,js,ws in zip(pos,joints,weights):
   x=[0,0,0]
   for j,weight in zip(js,ws):
    if weight:
     a=point(matrix[j],p)
     x=[z+weight*y for z,y in zip(x,a)]
   v.extend(x)
  meshes.append({'name':name,'color':color,'positions':v,'indices':indices})
 samples.append({'phase':k/24,'parts':meshes})
(out/'v11-native-mesh-frames.json').write_text(json.dumps(samples,separators=(',',':')))
