"""Independent Blender re-import of both GLBs. No metadata-only pass."""
import bpy,os,json,math
from pathlib import Path
def measure(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    rigs=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    if len(rigs)!=1 or not meshes:raise ValueError("Unexpected rig/mesh count")
    rig=rigs[0];bones={b.name:b.parent.name if b.parent else None for b in rig.data.bones}
    triangles=0;count=0;unweighted=0;maxerr=0
    for ob in meshes:
        ob.data.calc_loop_triangles();triangles+=len(ob.data.loop_triangles)
        groups={g.index:g.name for g in ob.vertex_groups}
        for v in ob.data.vertices:
            ws=[g.weight for g in v.groups if groups.get(g.group) in bones and g.weight>0]
            count+=1
            if not ws:unweighted+=1
            else:maxerr=max(maxerr,abs(sum(ws)-1))
    actions=[{"name":a.name,"frameRange":list(a.frame_range)} for a in bpy.data.actions]
    if unweighted or maxerr>1e-3 or not actions:raise ValueError("Invalid actual reimport weights/actions")
    return {"triangles":triangles,"vertices":count,"bones":bones,"unweighted":unweighted,"maxWeightError":maxerr,"actions":actions,"compositeParent":bones.get("rider/pelvis")}
a=measure(os.environ["CHARACTER_BRIDGE_ORIGINAL"]);b=measure(os.environ["CHARACTER_BRIDGE_REIMPORT"])
result={"original":a,"roundtrip":b,"sameHierarchy":a["bones"]==b["bones"],"sameTriangles":a["triangles"]==b["triangles"],"sameActionCount":len(a["actions"])==len(b["actions"]),"sameCompositeParent":a["compositeParent"]==b["compositeParent"]}
Path(os.environ["CHARACTER_BRIDGE_REPORT"]).write_text(json.dumps(result,indent=2))
if not all(result[k] for k in ("sameHierarchy","sameTriangles","sameActionCount","sameCompositeParent")):raise ValueError("Reimport contract differs; evidence retained")
