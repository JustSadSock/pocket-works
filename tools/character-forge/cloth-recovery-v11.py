"""Short gated cloth recovery, using existing garment input and Blender cloth.
Weld the actual pattern seam. Only pinned vertices receive shape-key motion.
No unstable candidate may advance to a more expensive motion study."""
import bpy,json,math,os,struct,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(os.environ['CHARACTER_EVIDENCE']);spec=json.loads((out/'morph/v9-cloth-input.json').read_text())
g=spec['garment'];N=g['outerVertexCount'];raw=lambda a:[a[i:i+3] for i in range(0,len(a),3)] if a and isinstance(a[0],(float,int)) else a
cv=lambda p:(p[0],-p[2],p[1]);gltf=lambda p:[p.x,p.z,-p.y]
base=raw(g['staticPositions']);pins=set(g['pinIndices']);remap={};unique=[];lookup={}
# Weld only coincident pattern vertices. Keep explicit original-to-welded mapping.
for i,p in enumerate(base):
 key=tuple(round(x,7) for x in p)
 if key not in lookup:lookup[key]=len(unique);unique.append(i)
 remap[i]=lookup[key]
faces=[tuple(remap[i] for i in g['indices'][k:k+3]) for k in range(0,len(g['indices']),3)]
assert all(len(set(f))==3 for f in faces)
wpins=sorted({remap[i] for i in pins});edges=sorted({tuple(sorted((f[k],f[(k+1)%3]))) for f in faces for k in range(3)})
initial=[base[i][:] for i in unique];original=[p[:] for p in initial]
# Forward root path is known from the existing skeletal input; leave vertical
# bob and lateral body motion intact. If explicit root offsets are supplied,
# use those instead of inferring world travel from the anchored seam.
offsets=spec.get('rootOffsets')
if offsets is None:
 offsets=[[0,0,sum(raw(g['frames'][i])[p][2]-base[p][2] for p in pins)/len(pins)] for i in range(spec['frameCount'])]
offsets=[[0,0,p[2]-offsets[0][2]] for p in offsets]
def local(p,i):return [x-y for x,y in zip(p,offsets[i])]
def object_mesh(name,positions,faces):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata([cv(v) for v in positions],[],faces);mesh.update();ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob);return ob
def keys(ob,frames,only=None):
 b=ob.shape_key_add(name='Basis')
 for i,vs in enumerate(frames[1:],1):
  k=ob.shape_key_add(name='Pose_%02d'%i)
  for j,v in enumerate(vs):
   if only is None or j in only:k.data[j].co=cv(v)
  for t in [i,i+1,i+2]:
   if t>=1:k.value=float(t==i+1);k.keyframe_insert(data_path='value',frame=t)
 ad=ob.data.shape_keys.animation_data
 if ad and ad.action:
  from bpy_extras.anim_utils import action_get_channelbag_for_slot
  curves=ad.action.fcurves if hasattr(ad.action,'fcurves') else action_get_channelbag_for_slot(ad.action,ad.action_slot).fcurves
  for f in curves:
   for k in f.keyframe_points:k.interpolation='LINEAR'
def evaluated(ob):
 dg=bpy.context.evaluated_depsgraph_get();ev=ob.evaluated_get(dg);mesh=ev.to_mesh()
 vs=[gltf(v.co) for v in mesh.vertices];ev.to_mesh_clear();return vs
def percentile(a,p):return sorted(a)[min(len(a)-1,int((len(a)-1)*p))]
def tree(v,f):return BVHTree.FromPolygons([Vector(x) for x in v],f,all_triangles=True,epsilon=1e-6)
freeFaces=[f for f in faces if not any(i in wpins for i in f)]
staticColliders=[(i['name'],raw(i['staticPositions']),[tuple(i['indices'][k:k+3]) for k in range(0,len(i['indices']),3)]) for i in spec['colliders']]
def initial_overlap(v):
 t=tree(v,freeFaces);return {name:len(t.overlap(tree(vs,fs))) for name,vs,fs in staticColliders}
beforeFit=initial_overlap(initial)
# The actual neutral leg/boot sections determine the clearance. No blanket
# translation or scaling of the garment. The attachment seam stays fixed.
def hull(pts):
 pts=sorted(set(pts))
 if len(pts)<3:return pts
 def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 def half(pts):
  h=[]
  for p in pts:
   while len(h)>=2 and cross(h[-2],h[-1],p)<=0:h.pop()
   h.append(p)
  return h
 return half(pts)[:-1]+half(pts[::-1])[:-1]
def section(y):
 pts=[]
 for name,v,fs in staticColliders:
  if name=='tunic':continue
  for f in fs:
   for k in range(3):
    a,b=v[f[k]],v[f[(k+1)%3]]
    if (a[1]-y)*(b[1]-y)>0 or abs(a[1]-b[1])<1e-9:continue
    t=(y-a[1])/(b[1]-a[1]);pts.append((a[0]+t*(b[0]-a[0]),a[2]+t*(b[2]-a[2])))
 return pts
def radial_exit(poly,o,d):
 best=0.0
 for i,a in enumerate(poly):
  b=poly[(i+1)%len(poly)];e=[b[0]-a[0],b[1]-a[1]];q=[a[0]-o[0],a[1]-o[1]];det=d[0]*e[1]-d[1]*e[0]
  if abs(det)<1e-10:continue
  t=(q[0]*e[1]-q[1]*e[0])/det;u=(q[0]*d[1]-q[1]*d[0])/det
  if t>=0 and -1e-8<=u<=1+1e-8:best=max(best,t)
 return best
center=[sum(initial[i][k] for i in wpins)/len(wpins) for k in (0,2)]
for i,p in enumerate(initial):
 if i in wpins:continue
 poly=hull([v for y in [p[1]-.008,p[1],p[1]+.008] for v in section(y)])
 dx,dz=p[0]-center[0],p[2]-center[1];r=math.hypot(dx,dz)
 if r<1e-8 or len(poly)<3:continue
 d=[dx/r,dz/r];needed=radial_exit(poly,center,d)+.012
 if needed>r:
  shift=min(.06,needed-r);p[0]+=shift*d[0];p[2]+=shift*d[1]
afterFit=initial_overlap(initial)
fitDelta=max(math.dist(a,b) for a,b in zip(initial,original))
lengths=[math.dist(initial[a],initial[b]) for a,b in edges];assert min(lengths)>1e-6
area=sum((Vector(initial[b])-Vector(initial[a])).cross(Vector(initial[c])-Vector(initial[a])).length*.5 for a,b,c in faces)
# Blender mass is PER VERTEX, not whole garment mass. Woven-wool density
# is a declared experiment parameter (kg/m^2); use the actual mesh area.
density=.38;vertexMass=area*density/len(initial)
preflight={'before':beforeFit,'after':afterFit,'maxFitCorrectionMetres':fitDelta,'areaSquareMetres':area,'arealDensityKgM2':density,'totalMassKg':area*density,'vertexMassKg':vertexMass}
(out/'v11-cloth-preflight.json').write_text(json.dumps(preflight,indent=2))
print(json.dumps({'clothPreflight':preflight}),flush=True)
if sum(afterFit.values())>0:raise RuntimeError('Neutral cloth initial intersection gate rejected; no simulation advanced')
def stats(v,expected,colliders):
 ratio=[math.dist(v[a],v[b])/d for (a,b),d in zip(edges,lengths)]
 seam=max(math.dist(v[j],expected[j]) for j in wpins)
 center=lambda vv:[sum(x[k] for x in vv)/len(vv) for k in range(3)]
 hem=[i for i,p in enumerate(initial) if p[1]<min(x[1] for x in initial)+.035];center0=center([initial[i] for i in hem]);center1=center([v[i] for i in hem]);radius=lambda vv,c:sum(math.hypot(vv[i][0]-c[0],vv[i][2]-c[2]) for i in hem)/len(hem)
 t=tree(v,freeFaces);hits={name:len(t.overlap(tree(vs,fs))) for name,vs,fs in colliders}
 return {'p95Stretch':percentile(ratio,.95),'maxStretch':max(ratio),'collapsedEdges':sum(x<.5 for x in ratio),'pinErrorMetres':seam,'hemRadiusRatio':radius(v,center1)/radius(initial,center0),'hemHeightMetres':center1[1],'nonSeamTrianglePairs':hits,'maxDeviationMetres':max(math.dist(x,y) for x,y in zip(v,expected))}
# v12: keep the accepted static baseline; isolate the moving colliders.
# Actual trousers/boots are sewn double surfaces. Build a closed outer-only
# collision volume, with deterministic boundary caps, without changing art.
from collections import Counter,defaultdict
def topology(v,fs):
 es=Counter(tuple(sorted((f[k],f[(k+1)%3]))) for f in fs for k in range(3))
 volume=sum(Vector(v[f[0]]).dot(Vector(v[f[1]]).cross(Vector(v[f[2]]))) for f in fs)/6
 return {'vertices':len(v),'triangles':len(fs),'boundaryEdges':sum(n==1 for n in es.values()),'nonManifoldEdges':sum(n>2 for n in es.values()),'signedVolume':volume}
def outer_proxy(item):
 vs=raw(item['staticPositions']);boot=item['name'].startswith('boot');n=(len(vs)-int(boot))//2
 fs=[tuple(item['indices'][k:k+3]) for k in range(0,len(item['indices']),3) if max(item['indices'][k:k+3])<n]
 ec=Counter(tuple(sorted((f[k],f[(k+1)%3]))) for f in fs for k in range(3));boundary=[(a,b) for f in fs for a,b in zip(f,f[1:]+f[:1]) if ec[tuple(sorted((a,b)))]==1]
 by={a:b for a,b in boundary};assert len(by)==len(boundary)
 loops=[]
 while by:
  start=next(iter(by));loop=[start];j=by.pop(start)
  while j!=start:loop.append(j);j=by.pop(j)
  loops.append(loop)
 for i,loop in enumerate(loops):
  for a,b in zip(loop,loop[1:]+loop[:1]):fs.append((b,a,n+i))
 def convert(v):
  v=[list(p) for p in v[:n]]
  for loop in loops:v.append([sum(v[j][k] for j in loop)/len(loop) for k in range(3)])
  return v
 vv=convert(vs);t=topology(vv,fs)
 if t['signedVolume']<0:fs=[(a,c,b) for a,b,c in fs];t=topology(vv,fs)
 if t['boundaryEdges'] or t['nonManifoldEdges'] or t['signedVolume']<=0:raise RuntimeError('Invalid outer collision proxy '+item['name'])
 return fs,convert,t
# Same motion, same mass, and same pin path in each candidate.
# Smooth rings retain their measured centroid and mean cross-section radius.
def smooth_ring(ring):
 c=Vector([sum(p[k] for p in ring)/len(ring) for k in range(3)])
 v=[Vector(p)-c for p in ring];u=[v[i]*.6+v[i-1]*.2+v[(i+1)%len(v)]*.2 for i in range(len(v))]
 scale=sum(x.length for x in v)/max(1e-9,sum(x.length for x in u))
 return [list(c+x*scale) for x in u]
def rings(v,n):return [v[i:i+n] for i in range(0,5*n,n)]
def resample(ring,n):
 out=[]
 for i in range(n):
  t=i*len(ring)/n;a=int(t);f=t-a;out.append([x+(y-x)*f for x,y in zip(ring[a],ring[(a+1)%len(ring)])])
 return out
def ringmesh(rows):
 n=len(rows[0]);v=[list(p) for row in rows for p in row];fs=[]
 for i in range(len(rows)-1):
  for k in range(n):
   a=i*n+k;b=i*n+(k+1)%n;fs.extend([(a,b,b+n),(a,b+n,a+n)])
 for i,row in enumerate([rows[0],rows[-1]]):
  center=len(v);v.append([sum(p[k] for p in row)/n for k in range(3)]);offset=0 if i==0 else (len(rows)-1)*n
  for k in range(n):fs.append((center,offset+(k+1)%n,offset+k) if i==0 else (center,offset+k,offset+(k+1)%n))
 if topology(v,fs)['signedVolume']<0:fs=[(a,c,b) for a,b,c in fs]
 return v,fs
def continuous_leg(trouser,boot,alignment):
 a=[smooth_ring(r) for r in rings(trouser,18)];b=[resample(smooth_ring(r),18) for r in rings(boot,16)]
 if alignment is None:
  trials=[(sum(math.dist(a[3][k],b[4][(direction*k+offset)%18])**2 for k in range(18)),direction,offset) for direction in [-1,1] for offset in range(18)];_,direction,offset=min(trials);alignment=(direction,offset)
 direction,offset=alignment;b=[[row[(direction*k+offset)%18] for k in range(18)] for row in b]
 # Fuse overlapping calf and boot cuff into one measured intermediate ring.
 joint=[[.5*(x+y) for x,y in zip(p,q)] for p,q in zip(a[3],b[4])]
 return ringmesh(a[:3]+[joint]+b[:4][::-1]),alignment
def defect_detail(v,old,cs,previous_cs):
 allRatios=sorted([(math.dist(v[a],v[b])/d,a,b,d) for (a,b),d in zip(edges,lengths)],reverse=True)
 ranked=allRatios[:8]+[x for x in allRatios if x[0]<.5];details=[]
 trees=[(name,tree(vv,ff),vv,ff) for name,vv,ff in cs]
 for ratio,a,b,d in ranked:
  mid=Vector([(x+y)*.5 for x,y in zip(v[a],v[b])]);nearest=[]
  for name,t,vv,ff in trees:
   co,normal,fi,distance=t.find_nearest(mid)
   if co is None:continue
   ids=ff[fi];last=previous_cs.get(name,vv);velocity=[sum(vv[j][k]-last[j][k] for j in ids)*spec['fps']/3 for k in range(3)]
   nearest.append({'name':name,'face':fi,'faceVertices':ids,'distanceMetres':distance,'normal':list(normal),'surfaceVelocity':velocity})
  details.append({'edge':[a,b],'ratio':ratio,'previousRatio':math.dist(old[a],old[b])/d,'restLength':d,'midpoint':list(mid),'edgeDirection':list((Vector(v[b])-Vector(v[a])).normalized()),'pinDistancesMetres':[min(math.dist(initial[j],initial[k]) for k in wpins) for j in (a,b)],'nearestCollider':min(nearest,key=lambda x:x['distanceMetres']) if nearest else None})
 selfTree=tree(v,faces);pairs=[(a,b) for a,b in selfTree.overlap(selfTree) if a<b and not set(faces[a])&set(faces[b])]
 normalsChanged=[]
 for i,(a,b,c) in enumerate(faces):
  oldN=(Vector(old[b])-Vector(old[a])).cross(Vector(old[c])-Vector(old[a]));newN=(Vector(v[b])-Vector(v[a])).cross(Vector(v[c])-Vector(v[a]))
  if oldN.length>1e-10 and newN.length>1e-10 and oldN.normalized().dot(newN.normalized())<0:normalsChanged.append(i)
 return {'worstEdges':details,'nonAdjacentSelfOverlapPairs':len(pairs),'selfPairs':pairs[:80],'normalReversalSincePrevious':normalsChanged[:100]}
# v14: freeze the accepted static material, use matched Smooth collision
# geometry for one-factor attachment experiments.
baseInitial=[p[:] for p in initial];baseOriginal=[p[:] for p in original];baseFaces=faces[:];baseEdges=edges[:];baseLengths=lengths[:];basePins=wpins[:];totalMass=area*density;v15=os.getenv('CHARACTER_V15_CLOTH')=='1'
def mix_vertices(v,weights):return [sum(v[i][k]*w for i,w in weights) for k in range(3)]
def refine_boundary():
 mapping=[[(i,1.)] for i in range(len(baseInitial))];split={};pinset=set(wpins)
 for a,b in baseEdges:
  if (a in pinset)!=(b in pinset):split[(a,b)]=len(mapping);mapping.append([(a,.5),(b,.5)])
 fs=[]
 for f in baseFaces:
  poly=[]
  for a,b in zip(f,f[1:]+f[:1]):
   poly.append(a);key=tuple(sorted((a,b)))
   if key in split:poly.append(split[key])
  if len(poly)==3:fs.append(f)
  else:
   c=len(mapping);mapping.append([(i,1/3) for i in f])
   fs.extend((a,b,c) for a,b in zip(poly,poly[1:]+poly[:1]))
 return mapping,fs
def geometry_audit(v,fs):
 es=sorted({tuple(sorted((f[k],f[(k+1)%3]))) for f in fs for k in range(3)})
 ls=[math.dist(v[a],v[b]) for a,b in es];areas=[];aspect=[]
 for a,b,c in fs:
  ar=(Vector(v[b])-Vector(v[a])).cross(Vector(v[c])-Vector(v[a])).length/2;areas.append(ar)
  e=[math.dist(v[a],v[b]),math.dist(v[b],v[c]),math.dist(v[c],v[a])];aspect.append(max(e)**2/max(1e-12,2*ar))
 topo=topology(v,fs)
 return {'vertices':len(v),'faces':len(fs),'edgeLengthMin':min(ls),'edgeLengthP95':percentile(ls,.95),'edgeLengthMax':max(ls),'triangleAreaMin':min(areas),'triangleAreaP05':percentile(areas,.05),'triangleAreaP95':percentile(areas,.95),'triangleAreaMax':max(areas),'aspectP95':percentile(aspect,.95),'aspectMax':max(aspect),'area':sum(areas),'topology':topo}
def even_ring(row,count):
 # Equidistant samples along the actual polygon perimeter, not uniform angle.
 lengths=[math.dist(row[i],row[(i+1)%len(row)]) for i in range(len(row))];perimeter=sum(lengths);ids=[];pos=[]
 for k in range(count):
  t=k*perimeter/count;j=0
  while j<len(row)-1 and t>lengths[j]:t-=lengths[j];j+=1
  u=t/max(1e-10,lengths[j]);ids.append([(j,1-u),((j+1)%len(row),u)]);pos.append(mix_vertices(row,ids[-1]))
 return pos,ids
def regular_pattern(mode):
 # Existing source is a seam-welded 9 x 32 annulus. Control uses a
 # ruled ellipse of matched waist/hem extents; remesh follows actual rings.
 n=len(basePins);nr=len(baseInitial)//n
 assert n*nr==len(baseInitial) and basePins==list(range(n))
 N=32;R=9
 rows=[baseInitial[i*n:(i+1)*n] for i in range(nr)]
 orig=[];mapping=[];v=[]
 first,last=rows[0],rows[-1]
 for iz in range(R):
  t=iz/(R-1);h=t*(nr-1);k=int(h);l=min(nr-1,k+1);u=h-k
  ring=[[a+(b-a)*u for a,b in zip(p,q)] for p,q in zip(rows[k],rows[l])]
  if mode=='reference':
   # Independent smooth ellipse built from anatomical measured extents.
   # Circumference and length are bounded by the original garment, not
   # increased to evade moving colliders.
   ext=[(min(p[j] for p in ring),max(p[j] for p in ring)) for j in [0,2]]
   cx=(ext[0][0]+ext[0][1])/2;cz=(ext[1][0]+ext[1][1])/2;rx=(ext[0][1]-ext[0][0])/2;rz=(ext[1][1]-ext[1][0])/2
   y=sum(p[1] for p in ring)/len(ring);a0=math.atan2((ring[0][2]-cz)/rz,(ring[0][0]-cx)/rx);a1=math.atan2((ring[1][2]-cz)/rz,(ring[1][0]-cx)/rx);direction=1 if math.sin(a1-a0)>0 else -1
   dense=[[cx+rx*math.cos(a0+direction*j*2*math.pi/256),y,cz+rz*math.sin(a0+direction*j*2*math.pi/256)] for j in range(256)]
   regular,_=even_ring(dense,N)
   # Attach to nearest original ring segment rather than assuming matching
   # angle parameterization; no changes to free-vertex shape keys.
   for p in regular:
    best=None
    for a in range(n):
     b=(a+1)%n;d=Vector(ring[b])-Vector(ring[a]);f=max(0,min(1,(Vector(p)-Vector(ring[a])).dot(d)/max(1e-12,d.length_squared)));q=Vector(ring[a])+d*f;dist=(Vector(p)-q).length
     if best is None or dist<best[0]:best=(dist,a,b,f)
    _,a,b,f=best;mapping.append([(k*n+a,(1-u)*(1-f)),(k*n+b,(1-u)*f),(l*n+a,u*(1-f)),(l*n+b,u*f)]);v.append(p)
  else:
   regular,weights=even_ring(ring,N)
   for p,ww in zip(regular,weights):
    mapping.append([(k*n+a,(1-u)*w) for a,w in ww]+[(l*n+a,u*w) for a,w in ww]);v.append(p)
 fs=[]
 for i in range(R-1):
  for j in range(N):
   a=i*N+j;b=i*N+(j+1)%N;c=a+N;d=b+N
   fs.extend([(a,b,c),(b,d,c)] if (i+j)%2==0 else [(a,b,d),(a,d,c)])
 # Maintain outward winding matching original cloth.
 a,b,c=fs[0];norm=(Vector(v[b])-Vector(v[a])).cross(Vector(v[c])-Vector(v[a]));mid=Vector(v[a]);center=Vector([sum(p[k] for p in v[:N])/N for k in range(3)])
 if norm.dot(Vector((mid.x-center.x,0,mid.z-center.z)))<0:fs=[(a,c,b) for a,b,c in fs]
 return v,mapping,fs,list(range(N))
if v15:
 layers=[]
 for i in [0,6,12,18,24]:
  data=[(x['name'],raw(x['frames'][i]),[tuple(x['indices'][k:k+3]) for k in range(0,len(x['indices']),3)]) for x in spec['colliders']]
  tu=next(x for x in data if x[0]=='tunic');tt=tree(tu[1],tu[2]);layers.append({'sourceFrame':i,'tunicAgainstLegs':{name:len(tt.overlap(tree(v,fs))) for name,v,fs in data if name!='tunic'}})
 (out/'v15-pattern-baseline.json').write_text(json.dumps({'original':geometry_audit(baseOriginal,baseFaces),'fitted':geometry_audit(baseInitial,baseFaces),'initialOverlap':beforeFit,'fittedOverlap':afterFit,'tunicLayerOverlap':layers,'surfaceDensityKgM2':density,'note':'Triangle-pair overlaps between real posed outer surfaces, including hidden overlaps; not necessarily volumetric penetration depth.'},indent=2))
results=[]
experiments=[('static',1,1,6,None),('original',2,1,18,None),('smooth',2,1,18,None),('transition',2,1,18,None),('waistband',2,1,18,None),('refined',2,1,18,None),('friction',2,1,18,None),('pin-ramp',2,1,18,None),('world',3,1,18,None)]
if v15:experiments=[('static',1,1,6,None),('smooth',2,1,18,None),('reference-static',1,1,6,None),('reference',2,1,18,None),('remesh-static',1,1,6,None),('remesh',2,1,18,None),('world',3,1,18,None)]
v17config={}
if os.getenv('CHARACTER_V17_CLOTH_CONFIG'):
 matrix=json.loads(Path(os.environ['CHARACTER_V17_CLOTH_CONFIG']).read_text())
 if not matrix.get('fullRemeshAllowed') or not matrix.get('selectedConfig') or not matrix.get('selected'):raise RuntimeError('Independent coupon matrix not qualified')
 chosenFactor=matrix['selected'];v17config=matrix['selectedConfig']
 if not all(x.get('passed') for x in matrix['validation'][chosenFactor].values()) or len(matrix['validation'][chosenFactor])!=5:raise RuntimeError('Missing five independent coupon controls')
 if len(v17config)!=1 or next(iter(v17config)) not in ['friction','tension','bend','quality','selfDistance']:raise RuntimeError('Unqualified physical factor')
 experiments=[('remesh-static',1,1,6,None),('remesh',2,1,18,None),('world',3,1,18,None)]
chosen=None
for label,stage,slow,ramp,allowed in experiments:
 if stage==2:
  if not results[0]['passed']:break
  if v15 and label in ['reference','remesh'] and not any(r['experiment']==label+'-static' and r['passed'] for r in results):continue
 if stage==3:
  valid=[r for r in results if r['stage']==2 and r['passed']]
  if not valid:break
  chosen=min(valid,key=lambda r:max(f['maxStretch'] for f in r['frames']))['experiment']
 try:
  variant=chosen if stage==3 else label
  construction=variant.replace('-static','')
  method=variant if variant in ['static','original'] else 'smooth'
  mapping=[[(i,1.)] for i in range(len(baseInitial))];faces=baseFaces[:]
  wpins=basePins[:]
  if variant=='refined':mapping,faces=refine_boundary()
  if v15 and construction in ['reference','remesh']:
   initial,mapping,faces,wpins=regular_pattern(construction);original=[mix_vertices(baseOriginal,w) for w in mapping]
  else:initial=[mix_vertices(baseInitial,w) for w in mapping];original=[mix_vertices(baseOriginal,w) for w in mapping]
  edges=sorted({tuple(sorted((f[k],f[(k+1)%3]))) for f in faces for k in range(3)})
  lengths=[math.dist(initial[a],initial[b]) for a,b in edges];assert min(lengths)>1e-6
  freeFaces=[f for f in faces if not any(i in wpins for i in f)]
  experimentArea=sum((Vector(initial[b])-Vector(initial[a])).cross(Vector(initial[c])-Vector(initial[a])).length*.5 for a,b,c in faces)
  experimentMass=experimentArea*density if v15 else totalMass
  vertexMass=experimentMass/len(initial)
  if v15:
   pre=initial_overlap(initial);auditGeometry=geometry_audit(initial,faces)
   (out/('v15-pattern-'+label+'.json')).write_text(json.dumps({'construction':construction,'geometry':auditGeometry,'initialFreeOverlap':pre,'surfaceDensity':density,'massKg':experimentMass,'positions':initial,'faces':faces,'pinIndices':wpins,'mapping':mapping},indent=2))
   if sum(pre.values()):raise RuntimeError('Physical pattern initial collision gate rejected '+label)
  graph=defaultdict(list)
  for a,b in edges:graph[a].append(b);graph[b].append(a)
  firstRing=sorted(set(j for i in wpins for j in graph[i])-set(wpins))
  # Physical one-ring transition only; the hem and all remaining cloth stay free.
  pinWeights={j:1. for j in wpins}
  if variant=='transition':
   for j in firstRing:pinWeights[j]=.22
  bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=spec['fps'];scene.gravity=(0,0,-9.81)
  # Static settling first, then local leg motion. Stage 3 replays the same
  # local simulation and explicitly applies measured root translation on export.
  warm=24 if stage==1 else 24+ramp;count=49 if stage==1 else warm+(spec['frameCount']-1)*slow+1;scene.frame_start=1;scene.frame_end=count
  times=[-1 if stage==1 or label=='A' or i<warm-ramp else max(0,min(spec['frameCount']-1,(i-warm)/slow)) for i in range(count)]
  def frame_positions(item,idx,t):
   neutral=raw(item['staticPositions'])
   if t<0:return neutral
   a=int(t);b=min(spec['frameCount']-1,a+1);u=t-a
   va=[local(p,a) for p in raw(item['frames'][a])];vb=[local(p,b) for p in raw(item['frames'][b])]
   moving=[[x+(y-x)*u for x,y in zip(p,q)] for p,q in zip(va,vb)]
   blend=max(0,min(1,(idx-(warm-ramp))/ramp));blend=blend*blend*(3-2*blend)
   return [[a+(b-a)*blend for a,b in zip(p,q)] for p,q in zip(neutral,moving)]
  expected=[]
  for idx,t in enumerate(times):
   source=[frame_positions(g,idx,t)[j] for j in unique];expected.append([mix_vertices(source,w) for w in mapping])
  for row in expected:
   for j in range(len(row)):
    row[j]=[a+b-c for a,b,c in zip(row[j],initial[j],original[j])]
  cloth=object_mesh('MerchantRobeWelded',initial,faces)
  if variant=='pin-ramp':
   # Change only the pre-walk pin driver, not collider timing or free cloth.
   for i,row in enumerate(expected):
    if 24<=i<warm:
     t=(i-24)/max(1,ramp);u=t*t*t*(t*(6*t-15)+10);old=t*t*(3-2*t)
     for j in wpins:
      if old>1e-8:row[j]=[a+(b-a)*u/old for a,b in zip(initial[j],row[j])]
  if stage>1:keys(cloth,expected,set(pinWeights))
  group=cloth.vertex_groups.new(name='PinnedSeam')
  for j,w in pinWeights.items():group.add([j],w,'REPLACE')
  if variant=='waistband':
   band=cloth.vertex_groups.new(name='ConstructiveWaistband');band.add(wpins,1,'REPLACE');band.add(firstRing,.8,'REPLACE')
  colliders=[];collider_data=[];topologies={};items=spec['colliders']
  if method in ['continuous','fine']:
   items=[i for i in items if i['name']=='tunic']
   for side in ['L','R']:
    leg=next(i for i in spec['colliders'] if i['name']=='trousers '+side);boot=next(i for i in spec['colliders'] if i['name']=='boot '+side)
    (neutral,fs),alignment=continuous_leg(raw(leg['staticPositions']),raw(boot['staticPositions']),None)
    frames=[]
    for a,b in zip(leg['frames'],boot['frames']):
     (v,_),_=continuous_leg(raw(a),raw(b),alignment);frames.append(v)
    items.append({'name':'continuous '+side,'staticPositions':neutral,'frames':frames,'indices':[j for f in fs for j in f],'continuousProxy':True})
  for item in items:
   if allowed is not None and item['name'] not in allowed:continue
   fs=[tuple(item['indices'][k:k+3]) for k in range(0,len(item['indices']),3)];frames=[frame_positions(item,idx,t) for idx,t in enumerate(times)]
   sourceTopology=topology(frames[0],fs)
   if stage>1 and item['name']!='tunic' and not item.get('continuousProxy'):
    fs,convert,proxyTopology=outer_proxy(item);frames=[convert(v) for v in frames]
    if method=='smooth':
     n=16 if item['name'].startswith('boot') else 18
     frames=[ringmesh([smooth_ring(r) for r in rings(v,n)])[0] for v in frames];fs=ringmesh([smooth_ring(r) for r in rings(raw(item['staticPositions']),n)])[1];proxyTopology=topology(frames[0],fs)
   else:proxyTopology=sourceTopology
   ob=object_mesh('Collider_'+item['name'],frames[0],fs)
   if stage>1:keys(ob,frames)
   cm=ob.modifiers.new('Collision','COLLISION');cm.settings.thickness_outer=.003 if method=='fine' else .004;cm.settings.thickness_inner=.003 if method=='fine' else .004
   if 'friction' in v17config:cm.settings.cloth_friction=v17config['friction']
   colliders.append(ob);collider_data.append((item['name'],frames,fs,ob))
   topologies[item['name']]={'original':sourceTopology,'evaluatedProxy':proxyTopology,'outerThickness':.004,'innerThickness':.004}
  # For the local experiments, compare to a truly stationary pinned seam.
  # Only E/world include the full actual animated seam.
  if label in ['A','B','C','D']:
   for row in expected:
    for j in wpins:row[j]=initial[j][:]
   if cloth.data.shape_keys:
    for key in list(cloth.data.shape_keys.key_blocks)[1:]:
     for j in wpins:key.data[j].co=cv(initial[j])
  mod=cloth.modifiers.new('Cloth','CLOTH');s=mod.settings;s.quality=v17config.get('quality',28 if method=='fine' else 16);s.mass=vertexMass;s.vertex_group_mass=group.name;s.pin_stiffness=1
  # Firm woven wool, not default stretchy fabric; no dynamic rest shape.
  for name,val in [('tension_stiffness',v17config.get('tension',35)),('compression_stiffness',35),('shear_stiffness',22),('bending_stiffness',v17config.get('bend',1.0)),('tension_damping',8),('compression_damping',8),('shear_damping',5),('bending_damping',.7),('use_dynamic_mesh',False)]:
   if hasattr(s,name):setattr(s,name,val)
  if variant=='waistband':
   s.vertex_group_structural_stiffness=band.name;s.tension_stiffness_max=55;s.compression_stiffness_max=55;s.shear_stiffness_max=30
  c=mod.collision_settings;c.use_collision=True;c.distance_min=.004;c.collision_quality=10;c.use_self_collision=True;c.self_distance_min=v17config.get('selfDistance',.004)
  if variant=='friction':c.friction=3
  cache=mod.point_cache;cache.frame_start=1;cache.frame_end=count
  if hasattr(cache,'use_disk_cache'):cache.use_disk_cache=False
  bpy.context.view_layer.objects.active=cloth;cloth.select_set(True);scene.frame_set(1);bpy.context.view_layer.update()
  rows=[];samples=[];prev={};firstDefect=None;priorSamples=[];prevCloth=initial;defects=[]
  # Sequential evaluation deliberately measures initial and settled state.
  # No all-vertex animated shape keys are applied to the free cloth.
  for frame in range(1,count+1):
   scene.frame_set(frame);bpy.context.view_layer.update();v=evaluated(cloth)
   if len(v)!=len(initial) or not all(math.isfinite(x) for p in v for x in p):raise RuntimeError('Invalid cloth surface')
   i=frame-1
   cs=[];audit={};previous_cs=dict(prev)
   for name,fs,idx,ob in collider_data:
    actual=evaluated(ob);assert len(actual)==len(fs[i])
    err=max(math.dist(a,b) for a,b in zip(actual,fs[i]));vel=max((math.dist(a,b)*spec['fps'] for a,b in zip(actual,prev.get(name,actual))),default=0)
    prev[name]=actual;top=topology(actual,idx);audit[name]={'maxEvaluatedMismatchMetres':err,'maxSurfaceSpeedMetresPerSecond':vel,'signedVolume':top['signedVolume'],'boundaryEdges':top['boundaryEdges'],'nonManifoldEdges':top['nonManifoldEdges']}
    cs.append((name,actual,idx))
   row=stats(v,expected[i],cs);row={'frame':frame,**row,'colliderAudit':audit};rows.append(row)
   if v15 and construction=='remesh':
    selfTree=tree(v,faces)
    selfPairs=[(a,b) for a,b in selfTree.overlap(selfTree) if a<b and not set(faces[a])&set(faces[b])]
    row['selfOverlapPairs']=len(selfPairs)
    row['selfOverlapIndices']=selfPairs
    row['maxPinTargetSpeed']=max((math.dist(expected[i][j],expected[max(0,i-1)][j])*spec['fps'] for j in wpins),default=0)
    if 44<=frame<=46:
     row['edgeStrainMap']=[math.dist(v[a],v[b])/d for (a,b),d in zip(edges,lengths)]
     row['edgeIndices']=edges
   # Measure contacts on the attachment triangles separately; these were
   # intentionally omitted from the historical free-surface collision gate.
   if stage>1 and 40<=frame<=48:
    boundary=[f for f in faces if any(j in wpins for j in f) and any(j not in wpins for j in f)]
    boundaryTree=tree(v,boundary);row['pinBoundaryColliderPairs']={name:len(boundaryTree.overlap(tree(vv,ff))) for name,vv,ff in cs}
   root=offsets[int(times[i])] if stage==3 and times[i]>=0 else [0,0,0]
   sample={'frame':frame,'sourceFrame':times[i],'root':root,'positions':[[x+y for x,y in zip(p,root)] for p in v],'colliders':[{'name':name,'positions':vv,'faces':ff} for name,vv,ff in cs]}
   bad=sum(row['nonSeamTrianglePairs'].values())>0 or row['maxStretch']>1.6 or row['collapsedEdges']>0
   if stage>1 and (40<=frame<=48 or (bad and firstDefect is None) or (firstDefect is not None and frame<=firstDefect+2)):
    detail=defect_detail(v,prevCloth,cs,previous_cs)
    edge=(10,42);a,b=edge
    detail['pinBoundary']={'edge':list(edge),'originalEdgeExists':edge in edges,'vertexPositions':[v[a],v[b]],'vertexVelocity':[[ (x-y)*spec['fps'] for x,y in zip(v[j],prevCloth[j])] for j in edge],'targetPositions':[expected[i][j] for j in edge],'targetVelocity':[[ (x-y)*spec['fps'] for x,y in zip(expected[i][j],expected[max(0,i-1)][j])] for j in edge],'restDistance':math.dist(initial[a],initial[b]),'distance':math.dist(v[a],v[b]),'neighborStrain':[{'edge':[j,k],'ratio':math.dist(v[j],v[k])/l} for (j,k),l in zip(edges,lengths) if j in edge or k in edge]}
    defects.append({'frame':frame,**detail})
   prevCloth=v
   if bad and firstDefect is None:
    firstDefect=frame;samples.extend(priorSamples);samples.append(sample)
   if frame==1 or (stage>1 and 40<=frame<=48) or frame==warm or frame==warm+1 or frame==count or (firstDefect is not None and frame<=firstDefect+2 and frame>firstDefect):samples.append(sample)
   priorSamples=(priorSamples+[sample])[-3:]
  # Require all settled samples to preserve weave and hem, anchor, and avoid
  # new non-seam intersections. Initial contacts are reported, not ignored.
  settled=[r for r in rows if r['frame']>= (warm+1 if stage==1 else 25)];initialPairs=sum(rows[0]['nonSeamTrianglePairs'].values())
  gates={'stretch':all(r['p95Stretch']<=1.15 and r['maxStretch']<=1.6 and not r['collapsedEdges'] for r in settled),'pin':all(r['pinErrorMetres']<=.006 for r in settled),'shape':all(.78<=r['hemRadiusRatio']<=1.22 and r['maxDeviationMetres']<=.15 for r in settled),'collision':all(sum(r['nonSeamTrianglePairs'].values())<=initialPairs and sum(r['nonSeamTrianglePairs'].values())<=10 for r in settled)}
  if v17config:
   gates['zeroExternal']=all(sum(r['nonSeamTrianglePairs'].values())==0 for r in settled)
   gates['zeroSelf']=all(r.get('selfOverlapPairs',1)==0 for r in settled)
  gates['evaluatedColliderAgreement']=all(x['maxEvaluatedMismatchMetres']<=1e-5 for r in rows for x in r['colliderAudit'].values())
  results.append({'stage':stage,'experiment':label,'passed':all(gates.values()),'gates':gates,'firstDefect':firstDefect,'topology':topologies,'defects':defects,'method':method,'variant':variant,'pinWeights':pinWeights,'transitionWidthMetres':max((min(math.dist(initial[j],initial[k]) for k in wpins) for j in firstRing),default=0),'totalMassKg':experimentMass,'vertexMassKg':vertexMass,'friction':c.friction,'quality':s.quality,'collisionThickness':c.distance_min,'frames':rows,'sampleFrames':len(samples)})
  (out/(('v15-cloth-' if v15 else 'v14-cloth-')+label+'.json')).write_text(json.dumps({'stage':stage,'experiment':label,'firstDefect':firstDefect,'topology':topologies,'defects':defects,'vertices':len(initial),'originalVertices':N,'originalToWelded':remap,'refinementMapping':mapping,'restPositions':initial,'faces':faces,'pinIndices':wpins,'pinWeights':pinWeights,'samples':samples,'diagnostics':rows,'gates':gates},indent=2))
  (out/'v11-cloth-recovery.json').write_text(json.dumps({'stages':results,'weldedSeamVertices':N-len(initial),'sourcePinCount':len(pins),'weldedPinCount':len(wpins),'gravity':list(scene.gravity),'preflight':preflight,'stage3Method':'local cloth simulation + measured world root translation; no double application','status':'passed' if results[-1]['stage']==3 and results[-1]['passed'] else 'blocked or incomplete at '+label},indent=2))
  print(json.dumps({'stage':stage,'gates':gates,'last':rows[-1]}),flush=True)
  if stage==3 and all(gates.values()):
   # The existing verified cache format remains available; no production cache
   # is published for a failed experiment.
   (out/'v11-cloth-approved-candidate.json').write_text(json.dumps({'status':'technical candidate only','source':'v11-cloth-stage-3.json','requiresArtApproval':True}))
 except Exception as exc:
  import traceback
  failure={'stage':stage,'experiment':label,'passed':False,'executionError':str(exc),'traceback':traceback.format_exc(),'frames':[]}
  results.append(failure)
  (out/(('v15-cloth-' if v15 else 'v14-cloth-')+label+'-error.json')).write_text(json.dumps(failure,indent=2))
  (out/'v11-cloth-recovery.json').write_text(json.dumps({'stages':results,'status':'execution error in '+label,'preflight':preflight},indent=2))
  print(json.dumps(failure),flush=True)

if not (results and results[0]['passed'] and results[-1]['stage']==3 and results[-1]['passed'] and not any(r.get('executionError') for r in results)):raise RuntimeError('Cloth local experiment gate rejected; world-root stage intentionally blocked')
