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
results=[]
experiments=[('static',1,1,6,None),('A',2,1,6,['trousers R']),('B',2,3,18,['trousers R']),('C',2,1,18,['trousers R']),('D',2,1,18,['trousers L','trousers R']),('E',2,1,18,None),('world',3,1,18,None)]
for label,stage,slow,ramp,allowed in experiments:
 if stage==2 and not results[0]['passed']:break
 if stage==3 and not all(r['passed'] for r in results):break
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
 expected=[[frame_positions(g,idx,t)[j] for j in unique] for idx,t in enumerate(times)]
 for row in expected:
  for j in range(len(row)):
   row[j]=[a+b-c for a,b,c in zip(row[j],initial[j],original[j])]
 cloth=object_mesh('MerchantRobeWelded',initial,faces)
 if stage>1:keys(cloth,expected,set(wpins))
 group=cloth.vertex_groups.new(name='PinnedSeam');group.add(wpins,1,'REPLACE')
 colliders=[];collider_data=[];topologies={}
 for item in spec['colliders']:
  if allowed is not None and item['name'] not in allowed:continue
  fs=[tuple(item['indices'][k:k+3]) for k in range(0,len(item['indices']),3)];frames=[frame_positions(item,idx,t) for idx,t in enumerate(times)]
  sourceTopology=topology(frames[0],fs)
  if stage>1 and item['name']!='tunic':
   fs,convert,proxyTopology=outer_proxy(item);frames=[convert(v) for v in frames]
  else:proxyTopology=sourceTopology
  ob=object_mesh('Collider_'+item['name'],frames[0],fs)
  if stage>1 and label!='A':keys(ob,frames)
  cm=ob.modifiers.new('Collision','COLLISION');cm.settings.thickness_outer=.004;cm.settings.thickness_inner=.004;colliders.append(ob);collider_data.append((item['name'],frames,fs,ob))
  topologies[item['name']]={'original':sourceTopology,'evaluatedProxy':proxyTopology,'outerThickness':.004,'innerThickness':.004}
 # For the local experiments, compare to a truly stationary pinned seam.
 # Only E/world include the full actual animated seam.
 if label in ['A','B','C','D']:
  for row in expected:
   for j in wpins:row[j]=initial[j][:]
  if cloth.data.shape_keys:
   for key in list(cloth.data.shape_keys.key_blocks)[1:]:
    for j in wpins:key.data[j].co=cv(initial[j])
 mod=cloth.modifiers.new('Cloth','CLOTH');s=mod.settings;s.quality=16;s.mass=vertexMass;s.vertex_group_mass=group.name;s.pin_stiffness=1
 # Firm woven wool, not default stretchy fabric; no dynamic rest shape.
 for name,val in [('tension_stiffness',35),('compression_stiffness',35),('shear_stiffness',22),('bending_stiffness',1.0),('tension_damping',8),('compression_damping',8),('shear_damping',5),('bending_damping',.7),('use_dynamic_mesh',False)]:
  if hasattr(s,name):setattr(s,name,val)
 c=mod.collision_settings;c.use_collision=True;c.distance_min=.004;c.collision_quality=10;c.use_self_collision=True;c.self_distance_min=.004
 cache=mod.point_cache;cache.frame_start=1;cache.frame_end=count
 if hasattr(cache,'use_disk_cache'):cache.use_disk_cache=False
 bpy.context.view_layer.objects.active=cloth;cloth.select_set(True);scene.frame_set(1);bpy.context.view_layer.update()
 rows=[];samples=[];prev={};firstDefect=None;priorSamples=[]
 # Sequential evaluation deliberately measures initial and settled state.
 # No all-vertex animated shape keys are applied to the free cloth.
 for frame in range(1,count+1):
  scene.frame_set(frame);bpy.context.view_layer.update();v=evaluated(cloth)
  if len(v)!=len(initial) or not all(math.isfinite(x) for p in v for x in p):raise RuntimeError('Invalid cloth surface')
  i=frame-1
  cs=[];audit={}
  for name,fs,idx,ob in collider_data:
   actual=evaluated(ob);assert len(actual)==len(fs[i])
   err=max(math.dist(a,b) for a,b in zip(actual,fs[i]));vel=max((math.dist(a,b)*spec['fps'] for a,b in zip(actual,prev.get(name,actual))),default=0)
   prev[name]=actual;top=topology(actual,idx);audit[name]={'maxEvaluatedMismatchMetres':err,'maxSurfaceSpeedMetresPerSecond':vel,'signedVolume':top['signedVolume'],'boundaryEdges':top['boundaryEdges'],'nonManifoldEdges':top['nonManifoldEdges']}
   cs.append((name,actual,idx))
  row=stats(v,expected[i],cs);row={'frame':frame,**row,'colliderAudit':audit};rows.append(row)
  root=offsets[int(times[i])] if stage==3 and times[i]>=0 else [0,0,0]
  sample={'frame':frame,'sourceFrame':times[i],'root':root,'positions':[[x+y for x,y in zip(p,root)] for p in v],'colliders':[{'name':name,'positions':vv,'faces':ff} for name,vv,ff in cs]}
  bad=sum(row['nonSeamTrianglePairs'].values())>0 or row['maxStretch']>1.6 or row['collapsedEdges']>0
  if bad and firstDefect is None:
   firstDefect=frame;samples.extend(priorSamples);samples.append(sample)
  if frame==1 or frame==warm or frame==warm+1 or frame==count or (firstDefect is not None and frame<=firstDefect+2 and frame>firstDefect):samples.append(sample)
  priorSamples=(priorSamples+[sample])[-3:]
 # Require all settled samples to preserve weave and hem, anchor, and avoid
 # new non-seam intersections. Initial contacts are reported, not ignored.
 settled=[r for r in rows if r['frame']>= (warm+1 if stage==1 else 25)];initialPairs=sum(rows[0]['nonSeamTrianglePairs'].values())
 gates={'stretch':all(r['p95Stretch']<=1.15 and r['maxStretch']<=1.6 and not r['collapsedEdges'] for r in settled),'pin':all(r['pinErrorMetres']<=.006 for r in settled),'shape':all(.78<=r['hemRadiusRatio']<=1.22 and r['maxDeviationMetres']<=.15 for r in settled),'collision':all(sum(r['nonSeamTrianglePairs'].values())<=initialPairs and sum(r['nonSeamTrianglePairs'].values())<=10 for r in settled)}
 gates['evaluatedColliderAgreement']=all(x['maxEvaluatedMismatchMetres']<=1e-5 for r in rows for x in r['colliderAudit'].values())
 results.append({'stage':stage,'experiment':label,'passed':all(gates.values()),'gates':gates,'firstDefect':firstDefect,'topology':topologies,'frames':rows,'sampleFrames':len(samples)})
 (out/('v12-cloth-'+label+'.json')).write_text(json.dumps({'stage':stage,'experiment':label,'firstDefect':firstDefect,'topology':topologies,'vertices':len(initial),'originalVertices':N,'originalToWelded':remap,'faces':faces,'pinIndices':wpins,'samples':samples,'diagnostics':rows,'gates':gates},indent=2))
 (out/'v11-cloth-recovery.json').write_text(json.dumps({'stages':results,'weldedSeamVertices':N-len(initial),'sourcePinCount':len(pins),'weldedPinCount':len(wpins),'gravity':list(scene.gravity),'preflight':preflight,'stage3Method':'local cloth simulation + measured world root translation; no double application','status':'passed' if len(results)==7 and all(r['passed'] for r in results) else 'blocked or incomplete at '+label},indent=2))
 print(json.dumps({'stage':stage,'gates':gates,'last':rows[-1]}),flush=True)
 if stage==3 and all(gates.values()):
  # The existing verified cache format remains available; no production cache
  # is published for a failed experiment.
  (out/'v11-cloth-approved-candidate.json').write_text(json.dumps({'status':'technical candidate only','source':'v11-cloth-stage-3.json','requiresArtApproval':True}))
if not (len(results)==7 and all(r['passed'] for r in results)):raise RuntimeError('Cloth local experiment gate rejected; world-root stage intentionally blocked')
