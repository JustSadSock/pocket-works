"""Reimported GLB acceptance: authored landing feet must stay on the support."""
import bpy,sys,argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument("--input",required=True);p.add_argument("--report");args=p.parse_args(sys.argv[sys.argv.index("--")+1:])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
print('BONES',len(rig.data.bones),'CLIPS',[(a.name,list(a.frame_range)) for a in bpy.data.actions])
for track in rig.animation_data.nla_tracks:track.mute=True
act=next(a for a in bpy.data.actions if a.name.startswith('Land'))
rig.animation_data.action=act
samples=[]
for fraction in [0,.25,.5,.75,1]:
 frame=act.frame_range[0]+fraction*(act.frame_range[1]-act.frame_range[0])
 bpy.context.scene.frame_set(int(frame),subframe=frame%1);deps=bpy.context.evaluated_depsgraph_get();heights={"Foot.L":[],"Foot.R":[]}
 for obj in bpy.context.scene.objects:
  if obj.type!='MESH':continue
  groups={g.index for g in obj.vertex_groups if g.name in ['Foot.L','Foot.R']}
  if not groups:continue
  ev=obj.evaluated_get(deps);mesh=ev.to_mesh()
  for side in heights:
   group=obj.vertex_groups.get(side)
   if group:heights[side] += [(ev.matrix_world @ mesh.vertices[v.index].co).z for v in obj.data.vertices if any(g.group==group.index and g.weight>.9 for g in v.groups)]
  ev.to_mesh_clear()
 feet={}
 for side,values in heights.items():
  assert values,'Missing foot skin weights: '+side
  assert abs(min(values)+.456)<.015,(frame,side,min(values))
  feet[side]={'minFootHeight':min(values),'maxFootHeight':max(values)}
 samples.append({'frame':frame,'feet':feet})
report={'status':'passed','joints':len(rig.data.bones),'clips':len(bpy.data.actions),'supportHeight':-.456,'tolerance':.015,'samples':samples}
if args.report:Path(args.report).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
