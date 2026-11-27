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
base=raw(g['frames'][0]);pins=set(g['pinIndices']);remap={};unique=[];lookup={}
# Weld only coincident pattern vertices. Keep explicit original-to-welded mapping.
for i,p in enumerate(base):
 key=tuple(round(x,7) for x in p)
 if key not in lookup:lookup[key]=len(unique);unique.append(i)
 remap[i]=lookup[key]
faces=[tuple(remap[i] for i in g['indices'][k:k+3]) for k in range(0,len(g['indices']),3)]
assert all(len(set(f))==3 for f in faces)
wpins=sorted({remap[i] for i in pins});edges=sorted({tuple(sorted((f[k],f[(k+1)%3]))) for f in faces for k in range(3)})
initial=[base[i] for i in unique];lengths=[math.dist(initial[a],initial[b]) for a,b in edges];assert min(lengths)>1e-6
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
def stats(v,expected,colliders):
 ratio=[math.dist(v[a],v[b])/d for (a,b),d in zip(edges,lengths)]
 seam=max(math.dist(v[j],expected[j]) for j in wpins)
 center=lambda vv:[sum(x[k] for x in vv)/len(vv) for k in range(3)]
 hem=[i for i,p in enumerate(initial) if p[1]<min(x[1] for x in initial)+.035];center0=center([initial[i] for i in hem]);center1=center([v[i] for i in hem]);radius=lambda vv,c:sum(math.hypot(vv[i][0]-c[0],vv[i][2]-c[2]) for i in hem)/len(hem)
 t=tree(v,freeFaces);hits={name:len(t.overlap(tree(vs,fs))) for name,vs,fs in colliders}
 return {'p95Stretch':percentile(ratio,.95),'maxStretch':max(ratio),'collapsedEdges':sum(x<.5 for x in ratio),'pinErrorMetres':seam,'hemRadiusRatio':radius(v,center1)/radius(initial,center0),'hemHeightMetres':center1[1],'nonSeamTrianglePairs':hits,'maxDeviationMetres':max(math.dist(x,y) for x,y in zip(v,expected))}
results=[]
for stage in [1,2,3]:
 if stage>1 and not results[-1]['passed']:break
 bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=spec['fps'];scene.gravity=(0,0,-9.81)
 # Static settling first, then local leg motion. Stage 3 replays the same
 # local simulation and explicitly applies measured root translation on export.
 warm=24;count=49 if stage==1 else warm+spec['frameCount'];scene.frame_start=1;scene.frame_end=count
 times=[0 if stage==1 else max(0,min(spec['frameCount']-1,i-warm)) for i in range(count)]
 expected=[[local(raw(g['frames'][i])[j],i) for j in unique] for i in times]
 cloth=object_mesh('MerchantRobeWelded',initial,faces)
 if stage>1:keys(cloth,expected,set(wpins))
 group=cloth.vertex_groups.new(name='PinnedSeam');group.add(wpins,1,'REPLACE')
 colliders=[];collider_data=[]
 for item in spec['colliders']:
  fs=[tuple(item['indices'][k:k+3]) for k in range(0,len(item['indices']),3)];frames=[[local(p,i) for p in raw(item['frames'][i])] for i in times]
  ob=object_mesh('Collider_'+item['name'],frames[0],fs)
  if stage>1:keys(ob,frames)
  cm=ob.modifiers.new('Collision','COLLISION');cm.settings.thickness_outer=.004;cm.settings.thickness_inner=.004;colliders.append(ob);collider_data.append((item['name'],frames,fs))
 mod=cloth.modifiers.new('Cloth','CLOTH');s=mod.settings;s.quality=12;s.mass=.32;s.vertex_group_mass=group.name;s.pin_stiffness=1
 # Firm woven wool, not default stretchy fabric; no dynamic rest shape.
 for name,val in [('tension_stiffness',35),('compression_stiffness',35),('shear_stiffness',22),('bending_stiffness',1.0),('tension_damping',8),('compression_damping',8),('shear_damping',5),('bending_damping',.7),('use_dynamic_mesh',False)]:
  if hasattr(s,name):setattr(s,name,val)
 c=mod.collision_settings;c.use_collision=True;c.distance_min=.004;c.collision_quality=10;c.use_self_collision=True;c.self_distance_min=.004
 cache=mod.point_cache;cache.frame_start=1;cache.frame_end=count
 if hasattr(cache,'use_disk_cache'):cache.use_disk_cache=False
 bpy.context.view_layer.objects.active=cloth;cloth.select_set(True);scene.frame_set(1);bpy.context.view_layer.update()
 rows=[];samples=[]
 # Sequential evaluation deliberately measures initial and settled state.
 # No all-vertex animated shape keys are applied to the free cloth.
 for frame in range(1,count+1):
  scene.frame_set(frame);bpy.context.view_layer.update();v=evaluated(cloth)
  if len(v)!=len(initial) or not all(math.isfinite(x) for p in v for x in p):raise RuntimeError('Invalid cloth surface')
  i=frame-1
  if frame==1 or frame%6==1 or frame==count:
   cs=[(name,fs[i],idx) for name,fs,idx in collider_data];row=stats(v,expected[i],cs);rows.append({'frame':frame,**row})
   root=offsets[times[i]] if stage==3 else [0,0,0]
   samples.append({'frame':frame,'sourceFrame':times[i],'root':root,'positions':[[x+y for x,y in zip(p,root)] for p in v]})
 # Require all settled samples to preserve weave and hem, anchor, and avoid
 # new non-seam intersections. Initial contacts are reported, not ignored.
 settled=[r for r in rows if r['frame']>=warm+1];initialPairs=sum(rows[0]['nonSeamTrianglePairs'].values())
 gates={'stretch':all(r['p95Stretch']<=1.15 and r['maxStretch']<=1.6 and not r['collapsedEdges'] for r in settled),'pin':all(r['pinErrorMetres']<=.006 for r in settled),'shape':all(.78<=r['hemRadiusRatio']<=1.22 and r['maxDeviationMetres']<=.15 for r in settled),'collision':all(sum(r['nonSeamTrianglePairs'].values())<=initialPairs and sum(r['nonSeamTrianglePairs'].values())<=10 for r in settled)}
 results.append({'stage':stage,'passed':all(gates.values()),'gates':gates,'frames':rows,'sampleFrames':len(samples)})
 (out/('v11-cloth-stage-%d.json'%stage)).write_text(json.dumps({'stage':stage,'vertices':len(initial),'originalVertices':N,'originalToWelded':remap,'faces':faces,'pinIndices':wpins,'samples':samples,'diagnostics':rows,'gates':gates},indent=2))
 (out/'v11-cloth-recovery.json').write_text(json.dumps({'stages':results,'weldedSeamVertices':N-len(initial),'sourcePinCount':len(pins),'weldedPinCount':len(wpins),'gravity':list(scene.gravity),'stage3Method':'local cloth simulation + measured world root translation; no double application','status':'passed' if len(results)==3 and results[-1]['passed'] else 'blocked at stage '+str(stage)},indent=2))
 print(json.dumps({'stage':stage,'gates':gates,'last':rows[-1]}),flush=True)
 if stage==3 and all(gates.values()):
  # The existing verified cache format remains available; no production cache
  # is published for a failed experiment.
  (out/'v11-cloth-approved-candidate.json').write_text(json.dumps({'status':'technical candidate only','source':'v11-cloth-stage-3.json','requiresArtApproval':True}))
if not (len(results)==3 and results[-1]['passed']):raise RuntimeError('Cloth recovery gate rejected; dependent stages intentionally not run')
