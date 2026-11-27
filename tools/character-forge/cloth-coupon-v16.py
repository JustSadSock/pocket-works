"""v16 controlled cloth coupon: isolate a real Remesh collider trajectory.
Same wool density/settings, single smooth sphere, fixed seam, evaluated surfaces.
No production candidate is approved by this diagnostic.
"""
import bpy,os,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(os.environ['CHARACTER_EVIDENCE'])
r=json.loads((out/'v15-cloth-remesh.json').read_text())
pattern=json.loads((out/'v15-pattern-remesh.json').read_text())
spec=json.loads((out/'morph/v9-cloth-input.json').read_text())
samples={s['frame']:s for s in r['samples']}
defects={d['frame']:d for d in r['defects']}
frame=r.get('firstDefect') or 45
d=defects.get(frame) or defects.get(45)
if not d:raise RuntimeError('Missing measured Remesh failure')
edge=d['worstEdges'][0];near=edge['nearestCollider']
if not near:raise RuntimeError('Missing nearest measured collider')
name=near['name'];ids=near['faceVertices'];path=[]
for f in range(44,47):
 sample=samples[f]
 c=next(c for c in sample['colliders'] if c['name']==name)
 path.append(Vector([sum(c['positions'][i][k] for i in ids)/len(ids) for k in range(3)]))
def cv(v):return Vector((v[0],-v[2],v[1]))
delta=[cv(v-path[0]) for v in path]
density=pattern['surfaceDensity'];fps=spec['fps']
# Use the actual measured direction and displacement; a sphere substitutes only
# the local collider shape. No claim that this recreates the whole garment.
normal=cv(near['normal']).normalized()
up=Vector((0,0,1))
tangent=up.cross(normal)
if tangent.length<1e-6:tangent=Vector((1,0,0))
tangent.normalize();vertical=normal.cross(tangent).normalized()
if vertical.dot(up)<0:vertical=-vertical
radius=.04;size=.18;n=19
verts=[tuple(tangent*((i/(n-1)-.5)*size)+vertical*((.5-j/(n-1))*size)) for j in range(n) for i in range(n)]
faces=[]
for j in range(n-1):
 for i in range(n-1):
  a=j*n+i;faces.extend([(a,a+1,a+n+1),(a,a+n+1,a+n)])
edges=sorted({tuple(sorted((f[i],f[(i+1)%3]))) for f in faces for i in range(3)})
lengths=[math.dist(verts[a],verts[b]) for a,b in edges]
def evaluate(ob):
 ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh()
 v=[list(ev.matrix_world@p.co) for p in m.vertices];m.calc_loop_triangles();f=[tuple(t.vertices) for t in m.loop_triangles];ev.to_mesh_clear();return v,f
def bv(v,f):return BVHTree.FromPolygons([Vector(p) for p in v],f,all_triangles=True,epsilon=0)
zero=Vector((0,0,0));forward=delta
# Same path samples and source timing; smooth control follows equal endpoint
# displacement but with an interpolated midpoint. Reverse reverses motion.
smooth=[zero,delta[-1]*.5,delta[-1]]
reverse=[x-delta[-1] for x in reversed(delta)]
loop=forward+[delta[1],zero]+forward[1:]+[delta[1],zero]+forward[1:]
variants={'static':[zero]*3,'smooth':smooth,'recorded':forward,'reverse':reverse,'loops':loop}
result={}
for label,track in variants.items():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 scene=bpy.context.scene;scene.render.fps=fps;scene.gravity=(0,0,-9.81)
 mesh=bpy.data.meshes.new('Coupon');mesh.from_pydata(verts,[],faces);mesh.update()
 cloth=bpy.data.objects.new('Coupon',mesh);bpy.context.collection.objects.link(cloth)
 pins=cloth.vertex_groups.new(name='fixed top edge');pins.add(list(range(n)),1,'REPLACE')
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=radius,location=normal*(-radius-.008))
 sphere=bpy.context.object;start=sphere.location.copy()
 cm=sphere.modifiers.new('Smooth single collider','COLLISION');cm.settings.thickness_outer=.004;cm.settings.thickness_inner=.004
 # First settle, then apply exactly the measured displacement sequence.
 warm=24;positions=[zero]*warm+track+[track[-1]]*24
 for i,position in enumerate(positions,1):
  sphere.location=start+position;sphere.keyframe_insert(data_path='location',frame=i)
 ad=sphere.animation_data
 if ad and ad.action:
  from bpy_extras.anim_utils import action_get_channelbag_for_slot
  curves=ad.action.fcurves if hasattr(ad.action,'fcurves') else action_get_channelbag_for_slot(ad.action,ad.action_slot).fcurves
  for f in curves:
   for k in f.keyframe_points:k.interpolation='LINEAR'
 mod=cloth.modifiers.new('Cloth','CLOTH');s=mod.settings;s.quality=16;s.mass=density*size*size/len(verts);s.vertex_group_mass=pins.name;s.pin_stiffness=1
 for k,v in [('tension_stiffness',35),('compression_stiffness',35),('shear_stiffness',22),('bending_stiffness',1.0),('tension_damping',8),('compression_damping',8),('shear_damping',5),('bending_damping',.7),('use_dynamic_mesh',False)]:
  if hasattr(s,k):setattr(s,k,v)
 c=mod.collision_settings;c.use_collision=True;c.distance_min=.004;c.collision_quality=10;c.use_self_collision=True;c.self_distance_min=.004
 scene.frame_start=1;scene.frame_end=len(positions);mod.point_cache.frame_start=1;mod.point_cache.frame_end=len(positions)
 rows=[];evidence=[]
 for i in range(1,len(positions)+1):
  scene.frame_set(i);bpy.context.view_layer.update()
  v,fs=evaluate(cloth);cvv,cf=evaluate(sphere);t=bv(v,fs);other=bv(cvv,cf)
  ratios=[math.dist(v[a],v[b])/l for (a,b),l in zip(edges,lengths)]
  selfPairs=[(a,b) for a,b in t.overlap(t) if a<b and not set(fs[a])&set(fs[b])]
  ext=t.overlap(other)
  rows.append({'frame':i,'maxStretch':max(ratios),'collapsedEdges':sum(x<.5 for x in ratios),'externalPairs':len(ext),'selfPairs':len(selfPairs),'maxPinError':max(math.dist(v[j],verts[j]) for j in range(n))})
  if i in [1,warm,warm+1,warm+2,warm+3,len(positions)]:
   evidence.append({'frame':i,'vertices':v,'colliderVertices':cvv,'colliderFaces':cf,'strain':ratios,'selfPairs':selfPairs,'externalPairs':list(ext)})
 result[label]={'rows':rows,'samples':evidence,'maxStretch':max(x['maxStretch'] for x in rows),'maxSelfPairs':max(x['selfPairs'] for x in rows),'maxExternalPairs':max(x['externalPairs'] for x in rows)}
(out/'v16-cloth-coupon.json').write_text(json.dumps({'sourceFrame':frame,'sourceEdge':edge,'sourceCollider':name,'sourceFace':ids,'sourceFrames':[44,45,46],'pathMetres':[list(x) for x in delta],'densityKgM2':density,'areaM2':size*size,'massKg':density*size*size,'fps':fps,'faces':faces,'edges':edges,'rest':verts,'results':result,'qualification':'diagnostic only; full Remesh and world motion gate unchanged'},indent=2))
print(json.dumps({k:{x:v[x] for x in ['maxStretch','maxSelfPairs','maxExternalPairs']} for k,v in result.items()}),flush=True)
