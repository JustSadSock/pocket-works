import bpy,os,json,math,time
from pathlib import Path
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=os.environ["ANIMAL_INPUT"])
objects=[o for o in bpy.context.scene.objects if o.type=="MESH"];start=time.perf_counter()
if not objects:raise ValueError("No source geometry")
# Use actual world coordinates; retain all original source geometry on disk.
allpoints=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
lo=[min(v[i] for v in allpoints) for i in range(3)];hi=[max(v[i] for v in allpoints) for i in range(3)]
length=max((0,1),key=lambda k:hi[k]-lo[k]);side=1-length;mid=[(a+b)/2 for a,b in zip(lo,hi)]
# Head side inferred from upper body vertex distribution; report and
# retain raw source for manual review, not guaranteed anatomical orientation.
scores=[]
for sign in [-1,1]:
    pts=[v for v in allpoints if sign*(v[length]-mid[length])>(hi[length]-lo[length])*.17]
    scores.append(sum(max(0,(v.z-mid[2])/(hi[2]-lo[2])) for v in pts)/max(1,len(pts)))
sign=1 if scores[1]>=scores[0] else -1
# Preserve the right-handed basis when swapping forward and lateral axes.
sideSign=sign if length==1 else -sign
def cv(v):return [sideSign*(v[side]-mid[side]),v.z-lo[2],sign*(v[length]-mid[length])]
parts=[];originalTriangles=0
for ob in objects:ob.data.calc_loop_triangles();originalTriangles+=len(ob.data.loop_triangles)
ratio=min(1,16000/max(1,originalTriangles))
for ob in objects:
    bpy.context.view_layer.objects.active=ob
    if ratio<1:
        mod=ob.modifiers.new("Bounded geometry study","DECIMATE");mod.ratio=ratio;bpy.ops.object.modifier_apply(modifier=mod.name)
    me=ob.data;me.calc_loop_triangles()
    for materialIndex in sorted({t.material_index for t in me.loop_triangles}):
        fs=[t.vertices[:] for t in me.loop_triangles if t.material_index==materialIndex];used=sorted({i for f in fs for i in f});idx={v:i for i,v in enumerate(used)}
        positions=[cv(ob.matrix_world@me.vertices[i].co) for i in used]
        mat=me.materials[materialIndex] if materialIndex<len(me.materials) else None
        col=list(mat.diffuse_color[:3]) if mat else [.45,.38,.31]
        if mat and mat.use_nodes:
            bsdf=next((n for n in mat.node_tree.nodes if n.type=="BSDF_PRINCIPLED"),None)
            if bsdf:col=list(bsdf.inputs["Base Color"].default_value[:3])
        parts.append({"name":ob.name+" / "+(mat.name if mat else "unassigned"),"positions":[x for v in positions for x in v],"indices":[idx[i] for f in fs for i in f],"color":col})
Path(os.environ["ANIMAL_OUTPUT"]).write_text(json.dumps({"parts":parts,"worldBounds":[lo,hi],"forwardAxis":length,"forwardSign":sign,"sideSign":sideSign,"orientationScores":scores,"originalTriangles":originalTriangles,"simplifiedTriangles":sum(len(p["indices"])//3 for p in parts),"elapsedMs":(time.perf_counter()-start)*1000,"limitations":"Decimated source surface, diffuse material only; orientation heuristic must be reviewed."},separators=(",",":")))
