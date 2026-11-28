"""Compare raw GLB and actual Blender imports independently. Retain all
diagnostics before enforcing unchanged normalization/rig/animation gates."""
import bpy,os,json,math,struct
from pathlib import Path
report=Path(os.environ["CHARACTER_BRIDGE_REPORT"])
result={"original":{},"roundtrip":{}}
def save():report.write_text(json.dumps(result,indent=2))
def raw(path):
    blob=Path(path).read_bytes();length=struct.unpack_from("<I",blob,12)[0];doc=json.loads(blob[20:20+length]);binary=blob[28+length:]
    def accessor(i):
        a=doc["accessors"][i];v=doc["bufferViews"][a["bufferView"]];n={"SCALAR":1,"VEC4":4}[a["type"]];code={5126:"f",5123:"H",5121:"B",5125:"I"}[a["componentType"]];size=struct.calcsize("<"+code*n);offset=v.get("byteOffset",0)+a.get("byteOffset",0);stride=v.get("byteStride",size)
        values=[struct.unpack_from("<"+code*n,binary,offset+j*stride) for j in range(a["count"])]
        if a.get("normalized") and code!="f":values=[[x/({"B":255,"H":65535}[code]) for x in row] for row in values]
        return values
    count=0;zero=0;maxerr=0;maxinf=0
    for mesh in doc["meshes"]:
        for p in mesh["primitives"]:
            attr=p["attributes"];sets=[accessor(attr[k]) for k in sorted(attr) if k.startswith("WEIGHTS_")]
            if not sets:raise ValueError("Missing raw skin weights")
            for i in range(len(sets[0])):
                ws=[x for s in sets for x in s[i]];count+=1;zero+=sum(ws)<=0;maxerr=max(maxerr,abs(sum(ws)-1));maxinf=max(maxinf,sum(x>0 for x in ws))
    return {"vertices":count,"zero":zero,"maxError":maxerr,"maxInfluences":maxinf,"clips":[a.get("name") for a in doc["animations"]],"skinJoints":[len(s["joints"]) for s in doc["skins"]]}
def measure(path,key):
    result[key]["raw"]=raw(path);save()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path,merge_vertices=False)
    rigs=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    data={"rigs":[o.name for o in rigs],"meshes":[],"actions":[{"name":a.name,"frameRange":list(a.frame_range)} for a in bpy.data.actions]};result[key]["blender"]=data
    if len(rigs)!=1:save();return False
    rig=rigs[0];bones={b.name:b.parent.name if b.parent else None for b in rig.data.bones};data["bones"]=bones
    tris=0;count=0;zero=0;maxerr=0;wrong=0;maxinf=0
    for ob in meshes:
        ob.data.calc_loop_triangles();triangles=len(ob.data.loop_triangles);groups={g.index:g.name for g in ob.vertex_groups}
        mods=[m for m in ob.modifiers if m.type=="ARMATURE" and m.object==rig]
        row={"name":ob.name,"vertices":len(ob.data.vertices),"triangles":triangles,"groups":list(groups.values()),"armatureModifiers":[m.name for m in mods],"unweighted":0,"maxError":0,"invalidExamples":[],"unmatchedGroups":[]};data["meshes"].append(row)
        if not mods:
            # Blender-generated visualization helpers have no skin modifier;
            # report separately and require actual raw weighted vertex coverage.
            row["nonSkinObject"]=True
            continue
        tris+=triangles
        for v in ob.data.vertices:
            count+=1;entries=[(groups.get(g.group),g.weight) for g in v.groups if g.weight>0]
            ws=[w for name,w in entries if name in bones];unknown=[n for n,w in entries if n not in bones]
            if unknown:
                wrong+=1;row["unmatchedGroups"].extend(n for n in unknown if n not in row["unmatchedGroups"])
            err=abs(sum(ws)-1);maxerr=max(maxerr,err);maxinf=max(maxinf,len(ws));row["maxError"]=max(row["maxError"],err)
            if not ws:zero+=1;row["unweighted"]+=1
            if (not ws or err>1e-3 or unknown) and len(row["invalidExamples"])<16:row["invalidExamples"].append({"vertex":v.index,"allGroups":entries,"boneWeightSum":sum(ws)})
    data.update({"triangles":tris,"vertices":count,"unweighted":zero,"maxWeightError":maxerr,"unmatched":wrong,"maxInfluences":maxinf,"compositeParent":bones.get("rider/pelvis")})
    save();print(json.dumps({"key":key,"raw":result[key]["raw"],"blender":{k:v for k,v in data.items() if k not in ("bones","meshes")},"examples":[{k:v for k,v in r.items() if k!="groups"} for r in data["meshes"]]}),flush=True)
    r=result[key]["raw"];return bool(meshes and count==r["vertices"] and zero==0 and wrong==0 and maxerr<=1e-3 and data["actions"] and r["zero"]==0 and r["maxError"]<=1e-3 and len(data["actions"])==len(r["clips"]))
a=measure(os.environ["CHARACTER_BRIDGE_ORIGINAL"],"original");b=measure(os.environ["CHARACTER_BRIDGE_REIMPORT"],"roundtrip")
x=result["original"]["blender"];y=result["roundtrip"]["blender"]
result["checks"]={"originalValid":a,"roundtripValid":b,"sameHierarchy":x.get("bones")==y.get("bones"),"sameTriangles":x.get("triangles")==y.get("triangles"),"sameClipNames":sorted(result["original"]["raw"]["clips"])==sorted(result["roundtrip"]["raw"]["clips"]),"sameCompositeParent":x.get("compositeParent")==y.get("compositeParent"),"sameMaximumInfluences":result["original"]["raw"]["maxInfluences"]==result["roundtrip"]["raw"]["maxInfluences"]}
save()
if not all(result["checks"].values()):raise ValueError("Actual reimport contract differs; full diagnostics retained")
