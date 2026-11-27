"""Full animated lower-robe cloth bake and quantized game playback cache."""
import bpy,json,math,struct,hashlib,os
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(os.environ["CHARACTER_EVIDENCE"]);spec=json.loads((out/"morph"/"v9-cloth-input.json").read_text())
def cv(v):return (float(v[0]),-float(v[2]),float(v[1]))
def gltf(v):return [float(v.x),float(v.z),float(-v.y)]
def triples(values):
 if values and isinstance(values[0],(int,float)):
  if len(values)%3:raise RuntimeError("Flat XYZ position array is not divisible by three")
  return [values[i:i+3] for i in range(0,len(values),3)]
 return values
def mesh_obj(name,positions,indices):
 mesh=bpy.data.meshes.new(name+"Mesh");verts=[cv(v) for v in triples(positions)];faces=[indices[i:i+3] for i in range(0,len(indices),3)]
 mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);return obj
def animate_shapes(obj,frames):
 basis=obj.shape_key_add(name="Basis")
 first=triples(frames[0])
 if len(first)!=len(basis.data):raise RuntimeError('Basis frame vertex count mismatch')
 for j,v in enumerate(first):basis.data[j].co=cv(v)
 for i,coords in enumerate(frames[1:],1):
  key=obj.shape_key_add(name="Pose_%02d"%i)
  coords=triples(coords)
  if len(key.data)!=len(coords):raise RuntimeError("Shape-key vertex count changed: "+obj.name)
  for j,v in enumerate(coords):key.data[j].co=cv(v)
  for frame in range(1,len(frames)+1):
   key.value=1.0 if frame==i+1 else 0.0;key.keyframe_insert(data_path="value",frame=frame)
 if obj.data.shape_keys.animation_data and obj.data.shape_keys.animation_data.action:
  from bpy_extras.anim_utils import action_get_channelbag_for_slot
  ad=obj.data.shape_keys.animation_data
  curves=ad.action.fcurves if hasattr(ad.action,'fcurves') else action_get_channelbag_for_slot(ad.action,ad.action_slot).fcurves
  if not curves:raise RuntimeError('No animated shape-key channels for '+obj.name)
  for curve in curves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'
def evaluated_positions(obj,scene,frame):
 scene.frame_set(frame);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(deps);mesh=ev.to_mesh()
 coords=[gltf(v.co) for v in mesh.vertices];ev.to_mesh_clear();return coords
def add_collision(obj):
 mod=obj.modifiers.new("ClothCollision","COLLISION")
 if hasattr(mod,"settings"):
  mod.settings.thickness_outer=.004;mod.settings.thickness_inner=.004;mod.settings.damping=.15
 return mod
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=spec["frameCount"];scene.render.fps=spec["fps"];scene.gravity=(0,0,-9.81)
clothData=spec["garment"];cloth=mesh_obj("Merchant_Robe_Simulation",clothData["positions"],clothData["indices"]);animate_shapes(cloth,clothData["frames"])
pin=cloth.vertex_groups.new(name="Pinned_Hip_Seam");pin.add(clothData["pinIndices"],1.0,'REPLACE')
colliders=[]
for item in spec["colliders"]:
 obj=mesh_obj("Collider_"+item["name"],item["positions"],item["indices"]);animate_shapes(obj,item["frames"]);add_collision(obj);obj.hide_render=True;colliders.append(obj)
mod=cloth.modifiers.new("AnimatedCloth","CLOTH");settings=mod.settings;settings.quality=spec["simulation"]["quality"];settings.mass=spec["simulation"]["mass"];settings.air_damping=1.0;settings.vertex_group_mass=pin.name;settings.pin_stiffness=1.0
collision=mod.collision_settings;collision.use_collision=True;collision.distance_min=spec["simulation"]["collisionDistance"];collision.collision_quality=8;collision.use_self_collision=True;collision.self_distance_min=spec["simulation"]["selfCollisionDistance"]
cache=mod.point_cache;cache.frame_start=1;cache.frame_end=spec["frameCount"]
if hasattr(cache,'use_disk_cache'):cache.use_disk_cache=False
elif hasattr(cache,'use_disk'):cache.use_disk=False
bpy.context.view_layer.objects.active=cloth;cloth.select_set(True)
for obj in colliders:obj.select_set(False)
scene.frame_set(1);bpy.context.view_layer.update()
try:
 with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0],active_object=cloth,object=cloth,selected_objects=[cloth],selected_editable_objects=[cloth],point_cache=cache):
  bpy.ops.ptcache.bake(bake=True)
except Exception as e:
 raise RuntimeError("Required full-robe cloth cache bake failed: "+str(e))
if not cache.is_baked:raise RuntimeError("Cloth point cache did not reach baked state")
frames=[]
for frame in range(1,spec["frameCount"]+1):
 coords=evaluated_positions(cloth,scene,frame)
 if len(coords)!=clothData["outerVertexCount"]:raise RuntimeError("Cloth evaluated vertex count changed")
 if not all(math.isfinite(x) for v in coords for x in v):raise RuntimeError("Non-finite cloth simulation output")
 frames.append(coords)
base=[list(map(float,v)) for v in triples(clothData["frames"][0])];displacements=[];corrections=[]
for i,f in enumerate(frames):
 displacements.extend(math.dist(a,b) for a,b in zip(base,f))
 corrections.extend(math.dist(a,b) for a,b in zip(triples(clothData['frames'][i]),f))
mins=[min(v[k] for frame in frames for v in frame) for k in range(3)]
maxs=[max(v[k] for frame in frames for v in frame) for k in range(3)]
def quant(v,k):
 span=maxs[k]-mins[k]
 return max(0,min(65535,round((v-mins[k])/span*65535))) if span>1e-12 else 0
buf=bytearray()
for frame in frames:
 for v in frame:
  for k in range(3):buf.extend(struct.pack('<H',quant(v[k],k)))
decoded=[];maxError=0.0;squared=0.0;count=0
for frame in frames:
 row=[]
 for v in frame:
  d=[]
  for k in range(3):
   span=maxs[k]-mins[k];q=quant(v[k],k);x=mins[k]+q/65535*span if span>1e-12 else mins[k];d.append(x);err=abs(x-v[k]);maxError=max(maxError,err);squared+=err*err;count+=1
  row.append(d)
 decoded.append(row)
cachePath=out/"v9-cloth-game-cache.bin";cachePath.write_bytes(buf)
meta={"format":"PocketWorksClothCacheV1","encoding":"uint16-normalized-xyz","axis":"glTF Y-up","frameCount":len(frames),"fps":spec["fps"],"vertexCount":len(frames[0]),"triangleCount":len(clothData["indices"])//3,"bounds":{"min":mins,"max":maxs},"frameStrideBytes":len(frames[0])*6,"file":cachePath.name,"sha256":hashlib.sha256(buf).hexdigest(),"maxQuantizationErrorMetres":maxError,"rmsQuantizationErrorMetres":math.sqrt(squared/count)}
(out/"v9-cloth-game-cache.json").write_text(json.dumps(meta,indent=2))
# Verify the simulated surface remains close to the moving tunic/trouser/boot
# colliders. This is a proximity diagnostic, not a signed-volume proof.
clearance=[]
for frame in range(1,spec["frameCount"]+1):
 scene.frame_set(frame);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();trees=[]
 for obj in colliders:
  ev=obj.evaluated_get(deps);me=ev.to_mesh();verts=[v.co.copy() for v in me.vertices];polys=[p.vertices[:] for p in me.polygons];trees.append(BVHTree.FromPolygons(verts,polys,all_triangles=False,epsilon=1e-6));ev.to_mesh_clear()
 pts=[Vector(cv(v)) for v in decoded[frame-1]];distances=[]
 for p in pts:
  hits=[tree.find_nearest(p) for tree in trees];valid=[x[3] for x in hits if x and x[3] is not None]
  if valid:distances.append(min(valid))
 clearance.append({"frame":frame,"minDistance":min(distances) if distances else None,"nearContactVertices":sum(x<.006 for x in distances)})
# Alembic is a reusable DCC cache; the quantized binary is the runtime cache.
for obj in bpy.context.selected_objects:obj.select_set(False)
cloth.select_set(True);bpy.context.view_layer.objects.active=cloth
abc=out/"v9-cloth-simulation.abc"
args=dict(filepath=str(abc),selected=True,start=1,end=spec['frameCount'],flatten=False,uvs=True,normals=True)
properties=bpy.ops.wm.alembic_export.get_rna_type().properties.keys()
if 'export_hair' in properties:args['export_hair']=False
if 'export_particles' in properties:args['export_particles']=False
if bpy.ops.wm.alembic_export(**args)!={'FINISHED'} or not abc.exists() or abc.stat().st_size==0:raise RuntimeError('Alembic export failed')
blend=out/"v9-cloth-simulation.blend";bpy.ops.wm.save_as_mainfile(filepath=str(blend))
report={"status":"baked","frames":len(frames),"fps":spec["fps"],"durationSeconds":(len(frames)-1)/spec["fps"],"garment":"complete merchant lower robe outer surface","vertices":len(frames[0]),"triangles":len(clothData["indices"])//3,"pinnedVertices":len(clothData["pinIndices"]),"colliders":[x["name"] for x in spec["colliders"]],"settings":{"quality":settings.quality,"mass":settings.mass,"pinStiffness":settings.pin_stiffness,"collisionDistance":collision.distance_min,"collisionQuality":collision.collision_quality,"selfCollision":collision.use_self_collision,"selfCollisionDistance":collision.self_distance_min},"maxDisplacementMetres":max(displacements),"meanDisplacementMetres":sum(displacements)/len(displacements),"maxCorrectionFromSkinMetres":max(corrections),"meanCorrectionFromSkinMetres":sum(corrections)/len(corrections),"displacementAxis":"glTF Y-up, compared in the same coordinate system","gameCache":meta,"colliderClearance":clearance,"blendBytes":blend.stat().st_size,"alembicBytes":abc.stat().st_size,"note":"Full garment surface driven by 25 actual skeletal poses, colliding with animated tunic, trousers and boots. No runtime simulation dependency."}
(out/"v9-cloth-simulation-report.json").write_text(json.dumps(report,indent=2))
print(json.dumps({"frames":len(frames),"vertices":len(frames[0]),"maxDisplacement":report["maxDisplacementMetres"],"quantizationError":maxError,"blendBytes":report["blendBytes"],"abcBytes":report["alembicBytes"]}))
