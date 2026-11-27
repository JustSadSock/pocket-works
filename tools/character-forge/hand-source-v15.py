"""Bounded CC0 reference experiment; never a production dependency."""
import os,json,hashlib,urllib.request,math
from pathlib import Path
import bpy
from mathutils import Vector,Quaternion
out=Path(os.environ['CHARACTER_EVIDENCE'])
base='https://raw.githubusercontent.com/GodotVR/godot-xr-tools/6c6189bdfcdf855052ef1aeb9f3e0ec4c7a7eb60/addons/godot-xr-tools/hands/'
files={'License.md':('baa7dabd7c3bf93d065e9aa03b05ed3653342b34','v15-reference-license.md'),'blend/animations/animations_hand_l.blend':('c0526192f5c27a35d0ee76ffd2af46bc8eec378f','v15-reference-original.blend'),'model/hand_l.gltf':('65da8e5e86856a7315af009427444e7de00ecce7','v15-reference-original.gltf')}
sources={}
for name,(sha,filename) in files.items():
 with urllib.request.urlopen(base+name,timeout=60) as req:b=req.read(5000000)
 if hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()!=sha:raise RuntimeError('Reference blob mismatch '+name)
 (out/filename).write_bytes(b);sources[filename]={'url':base+name,'gitBlob':sha,'sha256':hashlib.sha256(b).hexdigest(),'license':'CC0-1.0','author':'DigitalN8m4r3 / Miodrag Sejic'}
bpy.ops.wm.open_mainfile(filepath=str(out/'v15-reference-original.blend'),load_ui=False,use_scripts=False)
actions=list(bpy.data.actions)
arms=[x for x in bpy.context.scene.objects if x.type=='ARMATURE']
if not arms:raise RuntimeError('Reference source has no armature')
arm=max(arms,key=lambda x:len(x.data.bones))
meshes=[x for x in bpy.context.scene.objects if x.type=='MESH' and any(m.type=='ARMATURE' and m.object==arm for m in x.modifiers)]
if not meshes:raise RuntimeError('Reference source has no skin bound to armature')
# Choose the actual authored pose names, not synthesized substitutes.
def choose(names):
 for name in names:
  for a in actions:
   if a.name.lower().strip()==name.lower():return a
 for name in names:
  for a in actions:
   if name.lower() in a.name.lower():return a
 return None
openA=choose(['Grip 5','Straight','Default pose']);closedA=choose(['Grip','Grip 1']);thumbA=choose(['OK','Pinch Tight','Pinch Flat']);pointA=choose(['Sign_Point','Sign Point','Index','Sign 1'])
inventory=[{'name':a.name,'frameRange':list(a.frame_range)} for a in actions]
(out/'v15-reference-inventory.json').write_text(json.dumps({'sources':sources,'actions':inventory,'armature':arm.name,'bones':[b.name for b in arm.data.bones],'meshes':[m.name for m in meshes],'selectedActions':{k:a.name if a else None for k,a in [('open',openA),('closed',closedA),('opposition',thumbA),('point',pointA)]}},indent=2))
if not openA or not closedA or openA==closedA:raise RuntimeError('Could not identify distinct authored open/closed actions')
def sample_action(a):
 for b in arm.pose.bones:b.matrix_basis.identity()
 ad=arm.animation_data_create();ad.action=a
 if hasattr(a,'slots') and len(a.slots):
  slots=[s for s in a.slots if s.target_id_type=='OBJECT'];ad.action_slot=slots[0] if slots else a.slots[0]
 frame=float(a.frame_range[0]);bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
 return {b.name:b.matrix_basis.copy() for b in arm.pose.bones}
opens=sample_action(openA);closed=sample_action(closedA);thumb=sample_action(thumbA) if thumbA else None;point=sample_action(pointA) if pointA else None
arm.animation_data_clear()
# Actual source surface in world space and exact source bone transforms.
def render_pose(name,bases,source):
 for b in arm.pose.bones:b.matrix_basis=bases[b.name]
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();parts=[]
 for obj in meshes:
  ev=obj.evaluated_get(dg);mesh=ev.to_mesh();mesh.calc_loop_triangles()
  positions=[list(ev.matrix_world@v.co) for v in mesh.vertices]
  # Blender coordinates -> glTF axes, for the existing diagnostic raster.
  parts.append({'name':obj.name,'component':'body','color':[.68,.4,.27],'positions':[c for p in positions for c in [p[0],p[2],-p[1]]],'indices':[int(i) for t in mesh.loop_triangles for i in t.vertices]})
  ev.to_mesh_clear()
 return {'name':name,'source':source,'parts':parts,'bones':{b.name:[[float(x) for x in row] for row in b.matrix] for b in arm.pose.bones}}
def blend(f,digits=None):
 result={}
 for b in arm.pose.bones:
  a=opens[b.name];c=closed[b.name];factor=f if digits is None or any(d in b.name.lower() for d in digits) else 0
  p=a.translation.lerp(c.translation,factor);r=a.to_quaternion().slerp(c.to_quaternion(),factor);s=a.to_scale().lerp(c.to_scale(),factor)
  from mathutils import Matrix
  result[b.name]=Matrix.LocRotScale(p,r,s)
 return result
rows=[render_pose('open',opens,openA.name)]
for f in [.25,.5,.75,1]:rows.append(render_pose('index-'+str(f),blend(f,['index']),openA.name+' / '+closedA.name+' index-only blend'))
for f in [.25,.5,.75,1]:rows.append(render_pose('four-'+str(f),blend(f,['index','middle','ring','little','pinky']),openA.name+' / '+closedA.name+' finger-only blend'))
if thumb:rows.append(render_pose('opposition',thumb,thumbA.name))
if point:rows.append(render_pose('point',point,pointA.name))
rows.append(render_pose('closed',closed,closedA.name))
(out/'v15-reference-poses.json').write_text(json.dumps({'sources':sources,'actions':inventory,'poses':rows,'limits':'Closed pose is the author\'s grip endpoint; no claim of natural fist until visual/geometry review. Original blend and glTF preserved.'}))
print(json.dumps({'poses':[{'name':x['name'],'source':x['source'],'vertices':sum(len(p['positions'])//3 for p in x['parts'])} for x in rows]}),flush=True)
