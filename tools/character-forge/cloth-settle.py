"""Independent bounded cloth simulation, not an export/import acceptance test."""
import bpy,os,json,time
from pathlib import Path
out=Path(os.environ["CHARACTER_EVIDENCE"]);src=out/"morph"
bpy.ops.wm.read_factory_settings(use_empty=True)
data=json.loads((src/"cloth-control.json").read_text())
def mesh(name,p):
    v=[(p["positions"][i],-p["positions"][i+2],p["positions"][i+1]) for i in range(0,len(p["positions"]),3)]
    f=[p["indices"][i:i+3] for i in range(0,len(p["indices"]),3)]
    m=bpy.data.meshes.new(name);m.from_pydata(v,[],f);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);return o
body=mesh("Source anatomical collider",data["collider"]);body.modifiers.new("Body collision","COLLISION")
cape=mesh("Outer cape panel",data["cape"]);pin=cape.vertex_groups.new(name="Shoulder seam")
height=max(v.co.z for v in cape.data.vertices)
pin.add([v.index for v in cape.data.vertices if v.co.z>height-.04],1.0,"REPLACE")
cloth=cape.modifiers.new("Optional cloth","CLOTH");cloth.settings.quality=5;cloth.settings.vertex_group_mass=pin.name;cloth.collision_settings.use_collision=True;cloth.collision_settings.distance_min=.006
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=12;cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=12
initial=[v.co.copy() for v in cape.data.vertices];start=time.perf_counter()
for f in range(1,13):scene.frame_set(f);bpy.context.view_layer.update()
dg=bpy.context.evaluated_depsgraph_get();ev=cape.evaluated_get(dg);verts=[v.co.copy() for v in ev.data.vertices];dist=[(a-b).length for a,b in zip(initial,verts)]
result={"frames":12,"vertices":len(verts),"elapsedMs":(time.perf_counter()-start)*1000,"maxDisplacementMetres":max(dist),"meanDisplacementMetres":sum(dist)/len(dist),"pinnedVertices":len([v for v in initial if v.z>height-.04]),"positions":[x for v in verts for x in (v.x,v.z,-v.y)],"indices":data["cape"]["indices"],"limitations":"One optional static-body cloth settle, no claim of dynamic motion or correction compatibility."}
(out/"cloth-study.json").write_text(json.dumps(result,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(out/"cloth-study.blend"),compress=False)
print(json.dumps({k:v for k,v in result.items() if k not in ("positions","indices")}))
