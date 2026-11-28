"""Optional Blender research: exact triangle-overlap counts and a pinned cape
cloth simulation. It is not a required production dependency."""
import bpy,os,json,time,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(os.environ["CHARACTER_EVIDENCE"]);src=out/"morph";t=time.perf_counter()
def bvh(p):
    v=[Vector(p["positions"][i:i+3]) for i in range(0,len(p["positions"]),3)]
    f=[p["indices"][i:i+3] for i in range(0,len(p["indices"]),3)]
    return BVHTree.FromPolygons(v,f,all_triangles=True)
# Recovery mode: static candidate only, without resurrecting previous
# wardrobe production or optional cloth simulation.
v7=src/"v7-collision-input.json"
if v7.exists():
    import subprocess
    result=[]
    for entry in json.loads(v7.read_text()):
        label=entry["label"];parts=entry["parts"];trees=[bvh(p) for p in parts];pairs=[];risks={};seams={}
        for i,p in enumerate(parts):
            for j in range(i+1,len(parts)):
                q=parts[j];hits=trees[i].overlap(trees[j])
                if not hits:continue
                a,b=p["name"],q["name"];names={a,b}
                expected=any("binding" in n or "welt" in n or "loop" in n or "clasp" in n for n in names) or (p["layer"]==0 and q["layer"]==0) or (min(p["layer"],q["layer"])==0 and any("scalp" in n or "beard" in n for n in names))
                if "waist belt" in names and "tunic" in names:expected=False
                category="attachment-review" if expected else "visible-layer-risk"
                target=seams if expected else risks
                for k,l in hits:
                    target.setdefault(a,set()).add(k);target.setdefault(b,set()).add(l)
                pairs.append({"a":a,"b":b,"trianglePairs":len(hits),"category":category})
        names=json.loads((src/("v7-"+label+"-parts.json")).read_text())
        for view in ("front","side","back","three-quarter"):
            stem="v7-"+label+"-"+view
            spec={"image":str(src/(stem+".png")),"ownership":str(src/(stem+".ownership.bin")),"output":str(out/(stem+"-overlap-map.png")),"names":names,"risks":{k:sorted(v) for k,v in risks.items()},"seams":{k:sorted(v) for k,v in seams.items()}}
            manifest=out/(stem+"-overlap-input.json");manifest.write_text(json.dumps(spec))
            count=json.loads(subprocess.check_output(["/usr/bin/python3",str(Path(__file__).with_name("overlap-image.py")),str(manifest)],text=True))
            result.append({"candidate":label,"view":view,"visibleTrianglesPixels":count,"pairs":pairs})
    v8=src/"v8-collision-input.json"
    if v8.exists():
        extra=[]
        for entry in json.loads(v8.read_text()):
            parts=entry["parts"];trees=[bvh(p) for p in parts];pairs=[]
            for i,p in enumerate(parts):
                for j in range(i+1,len(parts)):
                    q=parts[j]
                    if p["layer"]==q["layer"]==0:continue
                    hits=trees[i].overlap(trees[j])
                    if hits:pairs.append({"a":p["name"],"b":q["name"],"trianglePairs":len(hits)})
            extra.append({"label":entry["label"],"phase":entry.get("phase"),"pairs":pairs})
        (out/"v8-garment-overlap.json").write_text(json.dumps({"frames":extra,"note":"Exact BVH surface pairs, including intended contacts; not a visual approval."},indent=2))
    (out/"garment-exact-overlap.json").write_text(json.dumps({"v7":result,"note":"Actual BVH surface intersections projected to visible triangle pixels. Colored entire intersecting triangles, not precise intersection curves. Yellow attachments require review; red not automatically a confirmed defect. Same-layer pairs included. No self-intersection test."},indent=2))
    raise SystemExit(0)
recovery=src/"v6-static-collision-input.json"
if recovery.exists():
    rows=[]
    for frame in json.loads(recovery.read_text()):
        parts=frame["parts"];trees=[bvh(p) for p in parts];pairs=[]
        for i,p in enumerate(parts):
            for j in range(i+1,len(parts)):
                q=parts[j];hits=trees[i].overlap(trees[j])
                if hits:pairs.append({"a":p["name"],"b":q["name"],"trianglePairs":len(hits),"classification":"covered-anatomy-contact" if min(p["layer"],q["layer"])==0 else "requires-visible-review"})
        rows.append({"label":"rest","pairs":pairs})
    (out/"garment-exact-overlap.json").write_text(json.dumps({"v6":{"frames":rows,"elapsedMs":(time.perf_counter()-t)*1000,"note":"Static triangle intersections, includes intended attachments. No artistic approval."}},indent=2))
    raise SystemExit(0)
rows=[]
for frame in json.loads((src/"garment-collision-input.json").read_text()):
    parts=frame["parts"];trees=[bvh(p) for p in parts];pairs=[]
    for i,p in enumerate(parts):
        for j in range(i+1,len(parts)):
            q=parts[j]
            if p["layer"]==q["layer"]:continue
            hits=trees[i].overlap(trees[j])
            if hits:pairs.append({"a":p["name"],"b":q["name"],"trianglePairs":len(hits),"aTriangles":len({x[0] for x in hits}),"bTriangles":len({x[1] for x in hits})})
    rows.append({"phase":frame["phase"],"pairs":pairs})
(out/"garment-exact-overlap.json").write_text(json.dumps({"frames":rows,"elapsedMs":(time.perf_counter()-t)*1000,"note":"Surface triangle overlaps include intended seam contacts and concealed layers. Not a watertight signed-volume or self-intersection test."},indent=2))
# V5 keeps the raw triangle pairs while separating seam candidates from
# body contacts and potentially visible interpenetration. A proximity
# classification is not a visibility proof; review actual renders.
v5path=src/"garment-v5-collision-input.json"
if v5path.exists():
    v5rows=[];start=time.perf_counter()
    def point(p,i):
        ids=p["indices"][3*i:3*i+3];return tuple(sum(p["positions"][3*j+k] for j in ids)/3 for k in range(3))
    def classify(p,q,i,j):
        a,b=p["name"],q["name"]
        if min(p["layer"],q["layer"])==0:return "covered-anatomy-contact"
        if a.startswith("boot ") and b.startswith("trousers "):return classify(q,p,j,i)
        if a.startswith("trousers ") and b.startswith("boot ") and not b.startswith("boot welt") and a[-1]==b[-1]:
            upper=max(q["positions"][1::3]);y=(point(p,i)[1]+point(q,j)[1])/2
            if abs(y-upper)<.05:return "boot-cuff-seam-candidate"
        if (a=="shirt" and b=="quilted") or (b=="shirt" and a=="quilted"):return "protective-layer-crossing"
        if a.startswith(b+" ") or b.startswith(a+" "):
            if any(x in a+" "+b for x in (" binding"," hem"," welt"," nasal")):return "binding-seam-candidate"
        if {"waist belt","belt clasp"}=={a,b}:return "hardware-attachment-candidate"
        if "waist belt" in (a,b):
            belt=p if a=="waist belt" else q;other=q if a=="waist belt" else p
            if other["name"] in ("tunic","shirt","quilted"):
                return "belt-attachment-candidate"
        return "unclassified-visible-risk"
    for frame in json.loads(v5path.read_text()):
        parts=frame["parts"];trees=[bvh(p) for p in parts];pairs=[]
        for i,p in enumerate(parts):
            for j in range(i+1,len(parts)):
                q=parts[j];hits=trees[i].overlap(trees[j])
                if not hits:continue
                kinds={}
                for x,y in hits:
                    kind=classify(p,q,x,y);kinds[kind]=kinds.get(kind,0)+1
                pairs.append({"a":p["name"],"b":q["name"],"trianglePairs":len(hits),"classification":kinds})
        v5rows.append({"kit":frame["kit"],"label":frame["label"],"phase":frame["phase"],"pairs":pairs})
    report_path=out/"garment-exact-overlap.json";report=json.loads(report_path.read_text())
    report["v5"]={"frames":v5rows,"elapsedMs":(time.perf_counter()-start)*1000,"note":"Includes same-layer pairs; seam candidates are approximate classification, not a visual pass or self-intersection check."}
    report_path.write_text(json.dumps(report,indent=2))
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
