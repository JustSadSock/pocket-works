"""A/B native clip comparison; unarmed target, no IK or authored motion correction."""
import os,json,math,re,struct
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
src=Path(__file__).with_name("sword-motion.py")
exec(compile(src.read_text().split("# Distinct load, acceleration",1)[0],str(src),"exec"))
folder=Path(os.environ["BOW_ART_OUTPUT"]);sc.render.resolution_x=960;sc.render.resolution_y=540;sc.cycles.samples=4
targetObjects=list(core)
for o in sc.objects:
    if o.type=="MESH":o.hide_render=o not in targetObjects
def norm0(n):
    n=re.sub("[^a-z0-9]","",n.lower().split(":")[-1])
    return n.removeprefix("mixamorig").removeprefix("bip001").removeprefix("def")
def meta(p):
    raw=p.read_bytes();size=struct.unpack_from("<I",raw,12)[0]
    if raw[:4]!=b"glTF":raise ValueError("Invalid GLB")
    return json.loads(raw[20:20+size])
files=sorted(Path("/tmp/bow-kinemiq").rglob("*.glb"))
inventory=[(p,k,a.get("name",p.stem)) for p in files for k,a in enumerate(meta(p).get("animations",[]))]
role=os.environ["BOW_REFERENCE_MOTION"]
terms={"walk":("walk",),"run":("run","jog"),"slash":("slash","swordswing","swordattack"),"guard":("swordidle","swordblock","guard"),"transition":("getup","standup","sitdown")}[role]
matches=[]
for p,k,n in inventory:
    v=norm0(n+" "+p.stem)
    if any(t in v for t in terms):matches.append((sum(t in v for t in terms)*10-8*sum(t in v for t in ("back","left","right","strafe","zombie","crouch")),str(p),k,n))
(folder/"clip-inventory.json").write_text(json.dumps([{"file":str(p),"index":k,"clip":n} for p,k,n in inventory],indent=2))
if not matches:raise ValueError("No clip "+role)
_,p,k,clip=max(matches,key=lambda x:x[0]);path=Path(p)
def import_file(path):
    before=set(sc.objects);old=set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in sc.objects if o not in before],[a for a in bpy.data.actions if a not in old]
objects,actions=import_file(path);sr=next((o for o in objects if o.type=="ARMATURE"),None)
if sr is None:raise ValueError("Clip rig missing")
action=next((a for a in actions if norm0(clip) in norm0(a.name)),None) or (actions[k] if len(actions)>k else None)
if action is None:raise ValueError("Clip action missing "+clip)
skin=[o for o in objects if o.type=="MESH" and any(m.type=="ARMATURE" for m in o.modifiers)]
if not skin:
    mannequin=next((p for p in files if "mannequin" in p.stem.lower()),None)
    if not mannequin:raise ValueError("Source mannequin missing")
    extra,_=import_file(mannequin);mr=next(o for o in extra if o.type=="ARMATURE")
    if set(b.name for b in mr.pose.bones)!=set(b.name for b in sr.pose.bones):raise ValueError("Mannequin rig mismatch")
    sr=mr;skin=[o for o in extra if o.type=="MESH" and any(m.type=="ARMATURE" for m in o.modifiers)]
if not skin:raise ValueError("No source skin")
sr.animation_data_clear();sr.animation_data_create();sr.animation_data.action=action
if len(action.slots)==1:sr.animation_data.action_slot=action.slots[0]
def find(obj,aliases):
    names={norm0(b.name):b for b in obj.pose.bones}
    for alias in aliases:
        n=norm0(alias)
        if n in names:return names[n]
        for k,b in names.items():
            if k.endswith(n):return b
    return None
pairs={"hips":["hips","pelvis"],"spine":["spine","spine01"],"chest":["spine1","spine02","chest","spine2"],"neck":["neck","neck01"],"head":["head"]}
for label,side in (("r","right"),("l","left")):
    for key,ns in {"clavicle":["shoulder","clavicle"],"upper":["arm","upperarm"],"fore":["forearm","lowerarm"],"hand":["hand"],"thigh":["upleg","thigh"],"shin":["leg","lowerleg","calf","shin"],"foot":["foot"],"toe":["toebase","toe"]}.items():
        pairs[label+key]=[side+n for n in ns]+[n+label for n in ns]+[label+n for n in ns]
sm={k:find(sr,v) for k,v in pairs.items()};tm={k:find(rig,v) for k,v in pairs.items()}
required=["hips","spine","head","rupper","lupper","rfore","lfore","rhand","lhand","rthigh","lthigh","rshin","lshin","rfoot","lfoot"]
missing=[k for k in required if sm[k] is None or tm[k] is None]
if missing:raise ValueError("Unmapped bones "+str(missing)+" source "+str([b.name for b in sr.pose.bones]))
mapping={};seen=set()
for k in pairs:
    if sm[k] and tm[k] and tm[k].name not in seen:mapping[k]=(sm[k],tm[k]);seen.add(tm[k].name)
ordered=sorted(mapping.items(),key=lambda v:len(v[1][1].parent_recursive))
def rest(ob,b):return ob.matrix_world@b.bone.matrix_local
def world(ob,b):return ob.matrix_world@b.matrix
def axes(ob,m):
    lr=rest(ob,m["rupper"]).translation-rest(ob,m["lupper"]).translation;lr.z=0;lr.normalize();up=Vector((0,0,1))
    return Matrix((lr,up.cross(lr),up)).transposed()
A=axes(rig,tm)@axes(sr,sm).transposed();Aq=A.to_quaternion()
scale=(rest(rig,tm["hips"]).translation-rest(rig,tm["rfoot"]).translation).length/(rest(sr,sm["hips"]).translation-rest(sr,sm["rfoot"]).translation).length
start,end=map(float,action.frame_range)
if end<=start:raise ValueError("Empty clip")
def pose(frame):
    sc.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
    for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
    for key,(sb,tb) in ordered:
        delta=world(sr,sb).to_quaternion()@rest(sr,sb).to_quaternion().inverted()
        q=Aq@delta@Aq.inverted()@rest(rig,tb).to_quaternion()
        m=world(rig,tb);tb.matrix=rig.matrix_world.inverted()@Matrix.LocRotScale(m.translation,q,m.to_scale());bpy.context.view_layer.update()
    sh,th=mapping["hips"];delta=world(sr,sh).translation-rest(sr,sh).translation
    m=th.matrix.copy();m.translation+=rig.matrix_world.inverted().to_3x3()@(A@delta*scale);th.matrix=m;bpy.context.view_layer.update()
def show(obs,yes):
    for o in obs:o.hide_render=not yes
def render(name,obs,view,fit):
    pts=vertices(obs);lo=[min(v[i] for v in pts) for i in range(3)];hi=[max(v[i] for v in pts) for i in range(3)]
    t=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,fit[0]))
    cam.location=t+Vector((0,-6,.25) if view=="front" else (6,0,.25));look(cam,t);cam.data.ortho_scale=fit[1]
    sc.render.filepath=str(folder/(name+"-"+view+".png"));bpy.ops.render.render(write_still=True)
pose(start);points=vertices(skin);sz=min(p.z for p in points);height=max(p.z for p in points)-sz
records=[];count=12
for i in range(count):
    f=start+(end-start)*i/(count-1);pose(f)
    row={"frame":f,"time":(f-start)/sc.render.fps,"source":{k:vec(world(sr,v[0]).translation) for k,v in ordered},"target":{k:vec(world(rig,v[1]).translation) for k,v in ordered},"sourceSurfaceMinZ":min(v.z for v in vertices(skin)),"targetSurfaceMinZ":min(v.z for v in vertices(core))}
    records.append(row)
    show(targetObjects,False);show(skin,True)
    for view in ("front","side"):render("A-%02d"%i,skin,view,(sz+height*.5,height*1.95))
    show(skin,False);show(targetObjects,True)
    for view in ("front","side"):render("B-%02d"%i,targetObjects,view,(z0+human_height*.5,human_height*1.95))
    (folder/"motion-comparison.json").write_text(json.dumps({"clip":clip,"sourceFile":str(path),"action":action.name,"fps":sc.render.fps,"duration":(end-start)/sc.render.fps,"mapping":{k:[a.name,b.name] for k,(a,b) in ordered},"rootScale":scale,"sourceGround":sz,"targetGround":z0,"records":records,"C":"blocked pending equipment approval","artisticApproval":False},indent=2))
