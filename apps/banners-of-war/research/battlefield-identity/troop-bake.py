import bpy, math, os, json
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
sc=bpy.context.scene
sc.render.engine="CYCLES";sc.cycles.device="CPU";sc.cycles.samples=10;sc.cycles.use_denoising=True
sc.render.film_transparent=True;sc.render.image_settings.file_format="PNG";sc.render.image_settings.color_mode="RGBA"
sc.view_settings.view_transform="AgX"
world=bpy.data.worlds.new("Outdoor fill");sc.world=world;world.use_nodes=True;world.node_tree.nodes["Background"].inputs[0].default_value=(.42,.48,.54,1);world.node_tree.nodes["Background"].inputs[1].default_value=.42
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat("-Z","Y").to_euler()
def light(name,pos,energy,size,color):
    d=bpy.data.lights.new(name,"AREA");d.energy=energy;d.shape="DISK";d.size=size;d.color=color;o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=pos;look(o,(0,0,.9));return o
key=light("Warm sky",(-4,-5,7),650,4,(1,.90,.74))
fill=light("Cool bounce",(4,2,5),180,5,(.70,.82,1))
cam=bpy.data.objects.new("60 degree orthographic",bpy.data.cameras.new("Orthographic"));sc.collection.objects.link(cam);sc.camera=cam;cam.data.type="ORTHO";cam.data.ortho_scale=3.5
rig=next(o for o in sc.objects if o.type=="ARMATURE")
# Rotate the entire asset about its ground origin, keep camera and lighting fixed.
pivot=bpy.data.objects.new("Ground yaw",None);sc.collection.objects.link(pivot)
for o in list(sc.objects):
    if o not in [pivot,cam,key,fill] and o.parent is None:
        m=o.matrix_world.copy();o.parent=pivot;o.matrix_world=m
target=Vector((0,0,.65));cam.location=target+Vector((0,-5,5*math.tan(pi/3)));look(cam,target)
shield=next(o for o in sc.objects if o.name.startswith("Curved shield"))
paint=shield.data.materials[0];ramp=next(n for n in paint.node_tree.nodes if n.type=="VALTORGB")
def team(side):
    color=(.14,.26,.39) if side==0 else (.42,.13,.075)
    for i,f in [(0,.6),(1,1.3)]:ramp.color_ramp.elements[i].color=(*(x*f for x in color),1)
# A = restrained material rendering. B = actual silhouette changes to gear, not whole anatomy.
# C = subsequent artistic raster processing of A, kept on same anchor.

from bpy_extras.object_utils import world_to_camera_view
sc.render.resolution_x=sc.render.resolution_y=256
sc.render.resolution_percentage=100
sc.cycles.samples=12
# +X world forward projects down in tactical camera C; source forward is Blender -Y.
# Camera sees the front at heading zero. The source's baked rig and materials are retained.
def pixel(p):
    q=world_to_camera_view(sc,cam,Vector(p))
    return [q.x*sc.render.resolution_x,(1-q.y)*sc.render.resolution_y]
weapon=[o for o in sc.objects if o.type=="MESH" and o.name.startswith(("Ash spear","Forged spear"))]
body=[o for o in sc.objects if o.type=="MESH" and o not in weapon]
def vertices(objects):
    deps=bpy.context.evaluated_depsgraph_get();result=[]
    for o in objects:
        ev=o.evaluated_get(deps);mesh=ev.to_mesh()
        if mesh is None:continue
        try:result.extend(ev.matrix_world@v.co for v in mesh.vertices)
        finally:ev.to_mesh_clear()
    if not result:raise ValueError("Empty evaluated mesh")
    return result
def bounds(objects):
    p=vertices(objects);lo=[min(v[i] for v in p) for i in range(3)];hi=[max(v[i] for v in p) for i in range(3)]
    return [Vector((x,y,z)) for x in [lo[0],hi[0]] for y in [lo[1],hi[1]] for z in [lo[2],hi[2]]]
core=[o for o in body if any(m.type=="ARMATURE" for m in o.modifiers)]
if not core:core=[o for o in body if o.name.startswith("char1")]
if not core:raise ValueError("Missing skinned human body for physical calibration")
sc.frame_set(1);bpy.context.view_layer.update()
core_points=vertices(core);z0=min(v.z for v in core_points);human_height=max(v.z for v in core_points)-z0
if not 1.4<human_height<2.3:raise ValueError(f"Invalid physical body height {human_height}; origin {z0}")
# A single physical anchor for the model, with the actual planted-foot plane.
print("Ground calibration",z0,human_height,flush=True)
# Material segmentation: original albedo contains ivory textile islands, distinct
# from the dark chainmail and skin. Mask only the bright low-chroma textile.
# Preserve original normal, metallic and roughness maps.
def mathnode(nodes,links,op,a,b):
    n=nodes.new("ShaderNodeMath");n.operation=op
    for i,v in enumerate([a,b]):
        if isinstance(v,(float,int)):n.inputs[i].default_value=v
        else:links.new(v,n.inputs[i])
    return n.outputs[0]
def textile_material():
    m=next(o.data.materials[0] for o in core if o.data.materials)
    nodes=m.node_tree.nodes;links=m.node_tree.links;p=next(n for n in nodes if n.type=="BSDF_PRINCIPLED")
    source=p.inputs["Base Color"].links[0].from_socket
    sep=nodes.new("ShaderNodeSeparateColor");links.new(source,sep.inputs[0]);r,g,b=sep.outputs[:3]
    mn=mathnode(nodes,links,"MINIMUM",mathnode(nodes,links,"MINIMUM",r,g),b)
    mx=mathnode(nodes,links,"MAXIMUM",mathnode(nodes,links,"MAXIMUM",r,g),b)
    bright=mathnode(nodes,links,"GREATER_THAN",mn,.39)
    chroma=mathnode(nodes,links,"LESS_THAN",mathnode(nodes,links,"SUBTRACT",mx,mn),.20)
    fac=mathnode(nodes,links,"MULTIPLY",bright,chroma)
    tint=nodes.new("ShaderNodeMixRGB");tint.blend_type="MULTIPLY";tint.inputs[0].default_value=1;links.new(source,tint.inputs[1])
    mix=nodes.new("ShaderNodeMixRGB");links.new(fac,mix.inputs[0]);links.new(source,mix.inputs[1]);links.new(tint.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],p.inputs["Base Color"])
    return tint
textile=textile_material()
def livery(side,rear=False):
    # Opt-in Banners-only painted miniature finish. No source rig or geometry changes.
    if os.environ.get("BOW_HISTORICAL_MINIATURE")=="1" and os.environ.get("BOW_TROOP")=="spear":
        wool=((.36,.49,.62),(.64,.30,.20))[side] if not rear else ((.48,.57,.61),(.67,.43,.29))[side]
        textile.inputs[2].default_value=(*wool,1)
        color=((.11,.24,.36),(.40,.16,.085))[side] if not rear else ((.23,.35,.42),(.49,.27,.13))[side]
        for i,f in [(0,.73),(1,1.32)]:ramp.color_ramp.elements[i].color=(*(min(1,x*f) for x in color),1)
        return
    textile.inputs[2].default_value=((*((.18,.34,.68) if side==0 else (.72,.14,.075)),1) if not rear else (*((.32,.48,.69) if side==0 else (.69,.32,.15)),1))
    color=(.09,.19,.38) if side==0 else (.48,.095,.042)
    if rear:color=(.19,.32,.46) if side==0 else (.48,.22,.075)
    for i,f in [(0,.65),(1,1.45)]:ramp.color_ramp.elements[i].color=(*(min(1,x*f) for x in color),1)
def mat(name,color,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get("Principled BSDF");p.inputs["Base Color"].default_value=(*color,1);p.inputs["Roughness"].default_value=.63;p.inputs["Metallic"].default_value=metal;return m
banner_mat=mat("Woven banner",(.1,.2,.5));trim=mat("Gold dyed linen",(.72,.51,.16));sword_mat=mat("Officer's worked steel",(.43,.47,.49),.85);pole_mat=mat("Ash standard pole",(.26,.14,.058))
def mesh(name,v,f,material,parent):
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);sc.collection.objects.link(o);o.data.materials.append(material);o.parent=parent;return o
def rod(name,a,b,r,material,parent,n=12):
    a,b=Vector(a),Vector(b);z=(b-a).normalized();x=z.cross(Vector((0,1,0)) if abs(z.z)>.9 else Vector((0,0,1))).normalized();y=z.cross(x)
    v=[tuple(p+r*(x*cos(i*2*pi/n)+y*sin(i*2*pi/n))) for p in [a,b] for i in range(n)]
    f=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    return mesh(name,v,f,material,parent)

from mathutils import Matrix
kind=os.environ["BOW_TROOP"]
assert kind in ("spear","sword","archer","knight","lightHorse")
extended=os.environ.get("BOW_MOTION_REV")=="1"
out=out/kind;out.mkdir(parents=True,exist_ok=True)
sc.cycles.samples=10
if os.environ.get("BOW_HISTORICAL_MINIATURE")=="1" and kind=="spear":
    # A broader daylight key and restrained cool fill preserve mail/cloth contrast.
    key.data.energy=780;key.data.size=5;key.data.color=(1,.94,.83)
    fill.data.energy=230;fill.data.color=(.79,.86,1)
    world.node_tree.nodes["Background"].inputs[1].default_value=.48
    sc.cycles.samples=16
# Retain the original human skin, textures, helmet, rig and pose clips.
sc.frame_set(1);pivot.rotation_euler.z=0;bpy.context.view_layer.update()
def bone(*names):
    for name in names:
        for b in rig.pose.bones:
            if b.name.lower().replace("_","").replace(".","").endswith(name.lower().replace("_","").replace(".","")):return b
    raise ValueError("Missing human bone "+str(names))
def point(b):return rig.matrix_world@b.head
def attach(o,b):
    bpy.context.view_layer.update();m=o.matrix_world.copy();o.parent=rig;o.parent_type="BONE";o.parent_bone=b.name;o.matrix_world=m
def aim(b,d):
    d=rig.matrix_world.inverted().to_3x3()@Vector(d)
    m=b.matrix.copy();axis=(m.to_3x3()@Vector((0,1,0))).normalized();rot=axis.rotation_difference(d.normalized()).to_matrix().to_4x4();pos=m.translation.copy();m=rot@m;m.translation=pos;b.matrix=m;bpy.context.view_layer.update()
R=bone("RightHand","handr");L=bone("LeftHand","handl")
RU=bone("RightArm","RightUpperArm","upperarmr");LU=bone("LeftArm","LeftUpperArm","upperarml")
RF=bone("RightForeArm","RightLowerArm","forearmr");LF=bone("LeftForeArm","LeftLowerArm","forearml")
RH=bone("RightUpLeg","RightThigh","thighr");LH=bone("LeftUpLeg","LeftThigh","thighl")
RK=bone("RightLeg","RightCalf","shinr");LK=bone("LeftLeg","LeftCalf","shinl")
torso=bone("Spine1","Spine","chest")
steel=mat("Hammered plate",(.45,.49,.52),.78);leather=mat("Oiled saddle leather",(.18,.079,.034));wood=mat("Yew heartwood",(.37,.20,.085));linen=mat("Linen string",(.68,.61,.43));clothmat=mat("Dyed wool",(.14,.26,.39))
# Actual metal shell fitted to the source torso, with front curvature and rolled lower edges.
def plate():
    p=point(torso);p.z+=.06
    v=[];f=[]
    for j,(zz,rx,ry) in enumerate([(-.22,.19,.12),(-.16,.22,.15),(-.04,.24,.17),(.12,.25,.16),(.23,.20,.11)]):
        for i in range(19):
            a=pi+i*pi/18;v.append(tuple(p+Vector((rx*cos(a),ry*sin(a)-.025,zz))))
    for j in range(4):
        for i in range(18):
            a=j*19+i;f.append((a,a+1,a+20,a+19))
    o=mesh("Curved forged breastplate",v,f,steel,None);m=o.modifiers.new("Steel thickness","SOLIDIFY");m.thickness=.018
    for f in o.data.polygons:f.use_smooth=True
    attach(o,torso);return o
def sword():
    p=point(R);axis=Vector((.03,-.93,.36)).normalized()
    grip=rod("Sword grip",p-axis*.08,p+axis*.12,.024,leather,None);x=axis.cross(Vector((0,0,1))).normalized();cross=rod("Sword crossguard",p+axis*.11-x*.11,p+axis*.11+x*.11,.018,steel,None)
    start=p+axis*.13;end=start+axis*.77;y=axis.cross(x);v=[]
    for c,ww,tt in [(start,.043,.012),(start+axis*.65,.026,.008),(end,.001,.001)]:v.extend(tuple(c+t) for t in [x*ww,y*tt,-x*ww,-y*tt])
    blade=mesh("Forged sword blade",v,[(j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i) for j in range(2) for i in range(4)],steel,None)
    for o in [grip,cross,blade]:attach(o,R)
    return [grip,cross,blade]
horse_objects=[];horse_root=None;horse_rig=None;horse_actions={};human_roots=list(pivot.children)
if kind=="archer":
    for o in body:
        if o.name.startswith(("Curved shield","Shield rawhide","Shield boss","Kettle hat","Rolled rim")):o.hide_render=True
    for o in weapon:o.hide_render=True
    # Hand-held full-length yew bow, string and quiver. Draw the string to the real right hand.
    def bow_geometry(draw,tilt=0,flex=0):
        p=point(L);q=point(R);p.y-=.045
        rot=Matrix.Rotation(tilt,3,'X');v=[];f=[];N=20;M=8
        for i in range(N+1):
            t=i/N;zz=(t-.5)*(1.65-.14*flex);yy=(.25+.13*flex)*(abs(t-.5)*2)**1.8
            for j in range(M):v.append(tuple(p+rot@Vector((.020*cos(j*2*pi/M),yy+.024*sin(j*2*pi/M),zz))))
        for i in range(N):
            for j in range(M):f.append((i*M+j,i*M+(j+1)%M,(i+1)*M+(j+1)%M,(i+1)*M+j))
        bow=mesh("English longbow",v,f,wood,None)
        top=p+rot@Vector((0,.25+.13*flex,.825-.07*flex));bot=p+rot@Vector((0,.25+.13*flex,-.825+.07*flex));mid=q if draw else p+rot@Vector((0,.25,0))
        st1=rod("Upper bowstring",top,mid,.004,linen,None,6);st2=rod("Lower bowstring",mid,bot,.004,linen,None,6)
        result=[bow,st1,st2]
        if draw and (p-q).length>.05:result.append(rod("Nocked arrow",q,p+(p-q).normalized()*.27,.006,wood,None,8))
        return result
    p=point(torso)+Vector((.20,.18,-.30));q=p+Vector((.14,.03,.60))
    quiver=rod("Leather arrow bag",p,q,.083,leather,None);attach(quiver,torso)
    for i in range(6):
        v=q+Vector((.038*cos(i*pi/3),.038*sin(i*pi/3),0));o=rod("Arrow shaft",v,v+Vector((.04,0,.24)),.007,wood,None,8);attach(o,torso)
elif kind=="sword":
    for o in weapon:o.hide_render=True
    weapon=sword();plate()
elif kind in ("knight","lightHorse"):
    # Imported independent skinned horse model. Normalize using actual evaluated mesh,
    # not by scaling the rider or using a foot soldier as cavalry.
    before=set(sc.objects);bpy.ops.import_scene.gltf(filepath=os.environ["BOW_HORSE"])
    added=[o for o in sc.objects if o not in before];horse_objects=[o for o in added if o.type=="MESH"];horse_rig=next((o for o in added if o.type=="ARMATURE"),None)
    if not horse_objects or not horse_rig:raise ValueError("Horse source must have mesh and rig")
    horse_root=bpy.data.objects.new("Horse at physical metre scale",None);sc.collection.objects.link(horse_root);horse_root.parent=pivot
    for o in added:
        if o.parent is None:
            m=o.matrix_world.copy();o.parent=horse_root;o.matrix_world=m
    bpy.context.view_layer.update()
    # Orient by the head bone relative to the mesh centre; head points toward local -Y.
    hp=next((b for b in horse_rig.pose.bones if "head" in b.name.lower()),None)
    if hp is None:raise ValueError("Horse head bone missing")
    pts=vertices(horse_objects);lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)));c=(lo+hi)/2
    v=horse_rig.matrix_world@hp.head-c
    angle=math.atan2(v.y,v.x);horse_root.rotation_euler.z=-pi/2-angle
    horse_root.scale=(2.12/(hi.z-lo.z),)*3;bpy.context.view_layer.update()
    pts=vertices(horse_objects);lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)))
    horse_root.location=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z));bpy.context.view_layer.update()
    # Rider mounted at the saddle. Existing skinned legs are articulated around the mount.
    hips=bone('Hips','Pelvis','Root');lift=1.66-point(hips).z
    for o in human_roots:o.location.z+=lift
    bpy.context.view_layer.update()
    for o in body:
        if kind=="lightHorse" and o.name.startswith(("Curved shield","Shield rawhide","Shield boss")):o.hide_render=True
    if kind=="knight":plate()
    if kind=="lightHorse":
        for o in weapon:o.hide_render=True
        weapon=sword()
    # Saddle cloth is a curved mesh over the barrel, no modification of horse topology.
    v=[];f=[]
    for i in range(17):
        a=-pi/2+i*pi/16
        for j in range(5):v.append((.48*sin(a),-.22+j*.19,1.28+.36*cos(a)))
    for i in range(16):
        for j in range(4):k=i*5+j;f.append((k,k+5,k+6,k+1))
    saddle=mesh("Wool saddle cloth",v,f,clothmat,pivot);solid=saddle.modifiers.new("Cloth thickness","SOLIDIFY");solid.thickness=.016
    for f in saddle.data.polygons:f.use_smooth=True
    seat=mesh("Leather saddle seat",[(-.22,-.20,1.66),(.22,-.20,1.66),(.26,.28,1.65),(-.26,.28,1.65)],[(0,1,2,3)],leather,pivot);solid=seat.modifiers.new("Saddle leather","SOLIDIFY");solid.thickness=.06
    # Keep imported animation actions and sample existing clips, not random leg deformation.
    if horse_rig.animation_data:
        for track in horse_rig.animation_data.nla_tracks:
            for strip in track.strips:
                if strip.action:horse_actions[strip.action.name]=strip.action
            track.mute=True
        if horse_rig.animation_data.action:horse_actions[horse_rig.animation_data.action.name]=horse_rig.animation_data.action
    for action in bpy.data.actions:
        if any(q in action.name.lower() for q in ("gallop","walk","trot","idle","attack")) and action.name!="Reference motion: idle, walk, guard, thrust":horse_actions.setdefault(action.name,action)
    if not horse_actions:raise ValueError("Missing horse motion clips")
    print("Horse actions",list(horse_actions),flush=True)
# Preserve the same models, weapons, projection and lighting. Select exact source
# horse actions (Gallop, not Gallop_Jump; Idle, not Idle_HitReact).
poses=[1,5,9,13,17,21,25,29,33,37]
if extended:poses += [41,45,49,53,57,61]+([65,69,73,77] if horse_rig else [])
temporary=[];gait_meta={};horse_cache={}
def exact_action(name):
    matches=[a for k,a in horse_actions.items() if k.rsplit("|",1)[-1].lower()==name.lower()]
    if not matches:raise ValueError("Required exact horse clip "+name+" unavailable: "+str(list(horse_actions)))
    return sorted(matches,key=lambda a:(len(a.name),a.name))[0]
def sample_horse(name,phase):
    phase=phase%1;key=(name,round(phase,5))
    if key in horse_cache:return horse_cache[key]
    action=exact_action(name);horse_rig.animation_data_create();horse_rig.animation_data.action=action
    if hasattr(action,"slots") and len(action.slots):
        try:horse_rig.animation_data.action_slot=action.slots[0]
        except (TypeError,ValueError):pass
    lo,hi=action.frame_range;sc.frame_set(math.floor(lo+(hi-lo)*phase),subframe=(lo+(hi-lo)*phase)%1);bpy.context.view_layer.update()
    matrices={b.name:b.matrix_basis.copy() for b in horse_rig.pose.bones}
    feet={b.name:horse_rig.matrix_world@b.head for b in horse_rig.pose.bones}
    horse_cache[key]=(matrices,feet);return matrices,feet
if horse_rig and extended:
    # Saddle and rider follow the same real torso bone, rather than independently
    # bobbing at an arbitrary frequency. Bind at the existing calibrated seat.
    torso_candidates=[b for b in horse_rig.pose.bones if any(k in b.name.lower() for k in ("spine","body","chest","pelvis","hips")) and not any(k in b.name.lower() for k in ("tail","leg","neck","head"))]
    if not torso_candidates:torso_candidates=[b for b in horse_rig.pose.bones if len(b.children)>=2]
    if not torso_candidates:raise ValueError("No saddle attachment bone")
    seat_bone=min(torso_candidates,key=lambda b:((horse_rig.matrix_world@b.head)-Vector((0,.05,1.66))).length)
    seat_ref=Vector((0,.05,1.66));seat_local=(horse_rig.matrix_world@seat_bone.matrix).inverted()@seat_ref
    for o in (saddle,seat):
        world_matrix=o.matrix_world.copy();o.parent=horse_rig;o.parent_type="BONE";o.parent_bone=seat_bone.name;o.matrix_world=world_matrix
    human_base={o.name:o.location.copy() for o in human_roots}
    # Derive four limb chains from the actual rest skeleton. Resample the Walk
    # animation with diagonal pairs in phase. This is an authored trot candidate,
    # not a claim that the imported model contains a native Trot action.
    # GLTF joint heads are anatomical joints; Blender's generated bone tails
    # and roll are not anatomical endpoints. Inspect normalized rest transforms.
    world=horse_rig.matrix_world.copy()
    bones={b.name:b for b in horse_rig.pose.bones}
    rest={n:world@b.bone.head_local for n,b in bones.items()}
    audit=out/("horse-rig-preflight.json" if os.environ.get("BOW_RIG_PREFLIGHT") else "horse-rig-production.json")
    report={"rig":horse_rig.name,"rigWorld":[list(r) for r in world],
        "horseRootWorld":[list(r) for r in horse_root.matrix_world],
        "bones":[{"name":n,"parent":b.parent.name if b.parent else None,
                  "head":list(rest[n]),"tail":list(world@b.bone.tail_local),
                  "restMatrix":[list(r) for r in b.bone.matrix_local],
                  "worldAxes":[list(r) for r in (world@b.bone.matrix_local).to_3x3()],
                  "deform":b.bone.use_deform} for n,b in bones.items()]}
    def save_audit():
        audit.write_text(json.dumps(report,indent=2))
    save_audit()
    print("Actual imported horse hierarchy",json.dumps(report),flush=True)
    # Pinned CC0 Quaternius rig, source blob f931b71d46df91b3c897997a12c01188f6ad1c8f.
    # Explicit anatomy from the original preflight; controllers never identify limbs.
    anatomy={
        "FL":("FrontShoulder.L","FrontUpperLeg.L","FrontLowerLeg.L"),
        "FR":("FrontShoulder.R","FrontUpperLeg.R","FrontLowerLeg.R"),
        "BL":("BackShoulder.L","BackLeg.L","BackUpperLeg.L","BackLowerLeg.L"),
        "BR":("BackShoulder.R","BackLeg.R","BackUpperLeg.R","BackLowerLeg.R")}
    controls={"FL":("IKFrontLeg.L","FF.L","PoleTarget.L"),
              "FR":("IKFrontLeg.R","FF.R","PoleTarget.R"),
              "BL":("IKBackLeg.L","FFB.L","PoleTargetBack.L"),
              "BR":("IKBackLeg.R","FFB.R","PoleTargetBack.R")}
    report["anatomy"]=anatomy;report["controllers"]=controls
    report["constraints"]={n:[{"type":c.type,"name":c.name,"targetBone":getattr(c,"subtarget","")} for c in b.constraints] for n,b in bones.items()}
    save_audit()
    for k,names in anatomy.items():
        for n in names+controls[k]:
            if n not in bones:raise ValueError("Pinned rig bone absent: "+n)
        for parent,child in zip(names,names[1:]):
            if bones[child].parent!=bones[parent]:raise ValueError("Unexpected anatomical hierarchy "+child)
        h=rest[names[-1]]
        if (h.x>0)!=(k[1]=="L") or (h.y<0)!=(k[0]=="F") or rest[names[0]].z-h.z<.22:
            raise ValueError("Unexpected anatomical orientation "+k)
    all_names=[n for k in anatomy for n in anatomy[k]+controls[k]]
    if len(set(all_names))!=len(all_names):raise ValueError("Overlapping horse limb mapping")
    # Binding evidence: count actual positive weights, not the Blender deform flag.
    # Select fixed low, weighted hoof vertices in the source mesh for gait testing.
    weights={n:0.0 for n in bones};weighted_counts={n:0 for n in bones}
    candidates={k:[] for k in anatomy}
    for o in horse_objects:
        groups={g.index:g.name for g in o.vertex_groups}
        if not any(m.type=="ARMATURE" and m.object==horse_rig for m in o.modifiers):continue
        for v in o.data.vertices:
            influence={groups.get(g.group,""):g.weight for g in v.groups if g.weight>0}
            for n,w in influence.items():
                if n in weights:weights[n]+=w;weighted_counts[n]+=1
            p=o.matrix_world@v.co
            for k in anatomy:
                score=sum(influence.get(n,0) for n in anatomy[k]+controls[k])
                if score>.55 and (p.x>0)==(k[1]=="L") and (p.y<0)==(k[0]=="F"):
                    candidates[k].append((p.z,o.name,v.index))
    report["skinWeights"]={n:{"weightSum":weights[n],"vertices":weighted_counts[n]} for n in bones}
    markers={}
    for k,items in candidates.items():
        items.sort()
        if not items or sum(weights[n] for n in anatomy[k])<=0:raise ValueError("Missing anatomical skin binding "+k)
        z=items[0][0]
        markers[k]=[(o,i) for h,o,i in items if h<=z+.10][:64]
        if not markers[k]:raise ValueError("No skinned hoof vertices "+k)
    report["hoofMarkers"]=markers
    # Inspect exact slot/channel data, retaining controls only as auxiliary
    # motion channels synchronized to their own anatomical chain.
    def action_channels(action):
        channels=set()
        for layer in getattr(action,"layers",[]):
            for strip in layer.strips:
                for bag in getattr(strip,"channelbags",[]):
                    channels.update(fc.data_path for fc in bag.fcurves)
        return sorted(channels)
    report["animationChannels"]={mode:action_channels(exact_action(mode)) for mode in ("Idle","Walk","Gallop")}
    save_audit()
    def measured_hooves():
        deps=bpy.context.evaluated_depsgraph_get();points={}
        for name in {o for m in markers.values() for o,i in m}:
            ob=bpy.data.objects[name].evaluated_get(deps);me=ob.to_mesh()
            try:
                if len(me.vertices)!=len(bpy.data.objects[name].data.vertices):raise ValueError("Horse mesh topology changed")
                points[name]={i:ob.matrix_world@me.vertices[i].co for m in markers.values() for o,i in m if o==name}
            finally:ob.to_mesh_clear()
        return {k:sum((points[o][i] for o,i in m),Vector((0,0,0)))/len(m) for k,m in markers.items()}
    def apply_horse_matrices(matrices):
        horse_rig.animation_data.action=None
        for b in horse_rig.pose.bones:b.matrix_basis=matrices[b.name].copy()
        bpy.context.view_layer.update()
    samples=[sample_horse("Walk",i/16)[0] for i in range(16)]
    walk=[]
    for m in samples:
        apply_horse_matrices(m);walk.append(measured_hooves())
    report["walkHoofTrajectories"]={k:[list(s[k]) for s in walk] for k in anatomy}
    save_audit()
    for k in anatomy:
        ys=[s[k].y for s in walk]
        if max(ys)-min(ys)<.05:raise ValueError("Walk lacks skinned hoof travel "+k)
    peaks={k:min(range(16),key=lambda i:walk[i][k].y) for k in anatomy}
    def trot(phase):
        frame=round(phase*16)%16
        base={n:v.copy() for n,v in samples[frame].items()}
        for k in anatomy:
            i=(peaks[k]+frame+(0 if k in ("FL","BR") else 8))%16
            for n in anatomy[k]+controls[k]:base[n]=samples[i][n].copy()
        return base
    trot_points=[]
    for i in range(16):
        apply_horse_matrices(trot(i/16));trot_points.append(measured_hooves())
    report["trotHoofTrajectories"]={k:[list(s[k]) for s in trot_points] for k in anatomy}
    actual={k:min(range(16),key=lambda i:trot_points[i][k].y) for k in anatomy}
    def phase_distance(a,b):return min((a-b)%16,(b-a)%16)
    report["trotPeakPhases"]=actual
    save_audit()
    for k in anatomy:
        ys=[s[k].y for s in trot_points]
        if max(ys)-min(ys)<.05:raise ValueError("Trot lacks skinned hoof travel "+k)
    if phase_distance(actual["FL"],actual["BR"])>3 or phase_distance(actual["FR"],actual["BL"])>3 or phase_distance(actual["FL"],actual["FR"])<5:
        raise ValueError("Measured trot is not diagonal: "+str(actual))
    gallop=[]
    for i in range(16):
        m=sample_horse("Gallop",i/16)[0];apply_horse_matrices(m);gallop.append(measured_hooves())
    report["gallopHoofTrajectories"]={k:[list(s[k]) for s in gallop] for k in anatomy}
    save_audit()
    for k in anatomy:
        if max(s[k].y for s in gallop)-min(s[k].y for s in gallop)<.05:raise ValueError("Gallop lacks skinned hoof travel "+k)
    gait_meta={"saddleBone":seat_bone.name,"limbChains":anatomy,"controllerChains":controls,"trot":"diagonal phase resampling of exact Walk clip, measured on actual skinned hoof vertices","exactClips":[exact_action(k).name for k in ("Idle","Walk","Gallop")]}
    report["verifiedMapping"]=gait_meta
    save_audit()
    print("Validated horse limb chains",json.dumps(gait_meta),flush=True)
def apply_pose(frame,diagnostic_phase=None,charge_progress=None):
    global temporary
    for o in temporary:bpy.data.objects.remove(o,do_unlink=True)
    temporary=[];pivot.rotation_euler.z=0
    rapid=41<=frame<=53
    source=5+((frame-41)//4)*4 if rapid else 1 if frame in [57,61] or frame>=65 else frame
    if horse_rig:
        if extended:
            mode="Gallop" if rapid else "Walk" if frame in [5,9,13,17] else "Idle"
            phase=((frame-41)//4%4)/4 if rapid else ((frame-5)//4%4)/4 if mode=="Walk" else ((frame-25)//4%4)/4 if frame in [25,29,33,37] else 0
            phase=diagnostic_phase if diagnostic_phase is not None else phase
            saved=trot(diagnostic_phase if diagnostic_phase is not None else (frame-65)/16) if frame>=65 else sample_horse(mode,phase)[0]
            if charge_progress is not None:
                p=max(0,min(1,(charge_progress-.16)/.68));p=p*p*(3-2*p)
                idle=sample_horse("Idle",0)[0];gallop=sample_horse("Gallop",phase)[0]
                saved={n:idle[n].lerp(gallop[n],p) for n in idle}
            for o in human_roots:o.location=human_base[o.name].copy()
        else:
            mode="Idle" if frame in [1,21] else "Gallop" if frame>=25 else "Walk"
            saved=sample_horse(mode,0 if frame in [1,21] else ((frame-5)//4%4)/4)[0]
        sc.frame_set(source);horse_rig.animation_data.action=None
        for bone in horse_rig.pose.bones:bone.matrix_basis=saved[bone.name].copy()
        bpy.context.view_layer.update()
        if extended:
            delta=horse_rig.matrix_world@seat_bone.matrix@seat_local-seat_ref
            for o in human_roots:o.location=human_base[o.name]+delta
            bpy.context.view_layer.update()
        sign=1 if point(RH).x>point(LH).x else -1;light=kind=="lightHorse"
        # Different seat, posture and weapon carriage for heavy and light cavalry.
        lean=.30 if rapid and light else .18 if rapid else .12 if frame>=65 else .04
        if charge_progress is not None:lean=.04+(.30 if light else .18)*charge_progress
        aim(torso,(0,-lean,1))
        aim(RH,(sign*(.40 if light else .48),-.30 if light else -.18,-.72));aim(LH,(-sign*(.40 if light else .48),-.30 if light else -.18,-.72));aim(RK,(0,.38 if light else .24,-1));aim(LK,(0,.38 if light else .24,-1))
        aim(LU,(.10,-.50,-.78));aim(LF,(-.15,-.85,.02))
        if frame in [25,29,33,37]:
            if light:
                d={25:(-.65,-.25,.60),29:(-.45,-.8,.30),33:(.12,-1,-.1),37:(.30,-.55,-.5)}[frame];aim(RU,d);aim(RF,(.10,-1,.12))
            else:
                d={25:(-.10,-.60,-.20),29:(-.05,-1,.10),33:(-.02,-1,-.05),37:(-.15,-.65,-.45)}[frame];aim(RU,d);aim(RF,(0,-1,.05))
        elif frame==57 or rapid:
            p=charge_progress if charge_progress is not None else 1
            aim(RU,(-.10,-.43-.39*p,-.68+.46*p));aim(RF,(0,-.75-.25*p,.22-.18*p))
        elif frame==61:aim(RU,(-.12,-.45,-.68));aim(RF,(0,-.7,-.25))
        else:aim(RU,(-.10,-.7,-.60));aim(RF,(0,-1,.12))
    else:
        sc.frame_set(source);bpy.context.view_layer.update()
        if rapid:
            ph=(frame-41)/16;stride=sin(ph*2*pi)
            aim(RH,(0,-stride*.63,-1));aim(LH,(0,stride*.63,-1));aim(RK,(0,.12+max(0,-stride)*.68,-1));aim(LK,(0,.12+max(0,stride)*.68,-1));aim(torso,(0,-.13,1))
        if kind=="archer":
            draw=frame in [25,29,57];lift=frame in [25,29,33,37,57]
            aim(LU,(.05,-1,-.04 if lift else -.55));aim(LF,(0,-1,.06 if lift else -.25))
            right={57:(-.50,-.48,-.16),25:(-.60,-.24,.05),29:(-.66,-.17,.17),33:(-.78,.22,.08),37:(-.58,.10,-.30)}
            aim(RU,right.get(frame,(-.24,-.40,-.78)));aim(RF,(.35,-.10,.65 if draw else -.42))
            temporary=bow_geometry(draw,0 if lift else -.65)
            for o in temporary:o.parent=pivot
        elif kind=="sword" and frame in [25,29,33,37,57,61]:
            d={57:(-.35,-.30,.45),25:(-.45,-.20,.78),29:(-.26,-.80,.35),33:(.18,-1,-.14),37:(.25,-.55,-.42),61:(-.10,-.48,-.72)}[frame]
            aim(RU,d);aim(RF,(.08,-1,.36 if frame in [57,25] else -.12))
        elif kind=="spear" and frame in [57,61]:
            aim(RU,(.08,-.45,-.52 if frame==57 else -.75));aim(RF,(-.08,-1,.06 if frame==57 else -.16))
        if frame==21:
            aim(LU,(-.10,-.72,-.43));aim(LF,(.30,-.78,.30))
    bpy.context.view_layer.update()
# Original 864 infantry renders remain byte-identical. These independently
# authored preview cycles are not included in the production atlas.
def infantry_preview():
    global temporary
    folder=out/"artistic-preview";folder.mkdir(exist_ok=True)
    sc.render.resolution_x=sc.render.resolution_y=384;sc.cycles.samples=5
    target=Vector((0,0,1.0));cam.location=target+Vector((0,-5,2.9));look(cam,target)
    cam.data.ortho_scale=4.2;livery(0)
    apply_pose(1);base={o.name:o.location.copy() for o in human_roots}
    feet=[(RH,RK,bone("RightFoot","footr")),(LH,LK,bone("LeftFoot","footl"))]
    sign=1 if point(R).x>point(L).x else -1
    ground_targets=[point(foot).copy() for _,_,foot in feet]
    ground_targets[0].y+=.11;ground_targets[1].y-=.11
    foot_dirs=[(rig.matrix_world@foot.tail-point(foot)).normalized() for _,_,foot in feet]
    # Two-bone analytic reach, with a preferred knee/elbow plane. The support
    # ankle remains at the measured source foot plane through weight transfer.
    def solve(upper,lower,end,target,bend):
        a=point(upper);b=point(lower);c=point(end)
        l1=(b-a).length;l2=(c-b).length;d=Vector(target)-a
        if min(l1,l2,d.length)<.01:raise ValueError("Invalid human joint chain")
        v=d.normalized();r=max(abs(l1-l2)+.002,min(d.length,l1+l2-.002))
        p=Vector(bend)-v*Vector(bend).dot(v)
        if p.length<.001:p=v.cross(Vector((0,0,1)))
        if p.length<.001:p=v.cross(Vector((0,1,0)))
        u=(l1*l1-l2*l2+r*r)/(2*r);mid=a+v*u+p.normalized()*math.sqrt(max(0,l1*l1-u*u))
        aim(upper,mid-a);aim(lower,(a+v*r)-point(lower))
        return (point(end)-(a+v*r)).length
    def weapon_aim(direction):
        visible=[o for o in weapon if o.name.startswith(("Forged spear","Forged sword blade")) and not o.hide_render]
        if not visible:raise ValueError("Missing visible attack weapon")
        points=vertices(visible);tip=sum(points,Vector((0,0,0)))/len(points)
        desired=rig.matrix_world.inverted().to_3x3()@Vector(direction)
        actual=rig.matrix_world.inverted().to_3x3()@(tip-point(R))
        rot=actual.normalized().rotation_difference(desired.normalized()).to_matrix().to_4x4()
        m=R.matrix.copy();p=m.translation.copy();m=rot@m;m.translation=p;R.matrix=m;bpy.context.view_layer.update()
    # Keyed artistic beats are distinct across roles. Values are authored hand
    # positions relative to the actual torso, not arbitrary sprite offsets.
    # right hand x, forward y, height z; shield/bow hand; torso lean; shift.
    keys={
      "spear":[
        (0.0,(.31,-.18,.10),(-.30,-.36,.17),(.02,-.04,1),(0,0,0),(.12,-.65,.76)),
        (.23,(.32,.03,.13),(-.27,-.48,.22),(.12,.04,1),(.025,.055,-.04),(.02,-.98,.18)),
        (.48,(.23,-.65,.19),(-.31,-.38,.20),(-.05,-.28,1),(-.025,-.15,-.08),(.015,-1,.035)),
        (.61,(.26,-.56,.13),(-.30,-.41,.16),(-.03,-.20,1),(-.018,-.10,-.06),(.04,-1,.10)),
        (1.0,(.31,-.18,.10),(-.30,-.36,.17),(.02,-.04,1),(0,0,0),(.12,-.65,.76))],
      "sword":[
        (0.0,(.32,-.24,.10),(-.28,-.38,.20),(.02,-.04,1),(0,0,0),(.35,-.62,.70)),
        (.25,(.44,.08,.40),(-.28,-.49,.25),(.24,.02,1),(.04,.025,-.04),(.40,.20,.89)),
        (.49,(.06,-.58,.20),(-.30,-.34,.15),(-.24,-.20,1),(-.05,-.12,-.055),(-.78,-.58,-.24)),
        (.67,(-.12,-.37,-.08),(-.25,-.43,.18),(-.17,-.08,1),(-.03,-.055,-.025),(-.65,-.45,-.55)),
        (1.0,(.32,-.24,.10),(-.28,-.38,.20),(.02,-.04,1),(0,0,0),(.35,-.62,.70))],
      "archer":[
        (0.0,(.24,-.20,-.11),(-.25,-.31,-.15),(0,0,1),(0,0,0),0),
        (.21,(.04,-.43,.08),(-.22,-.51,.12),(.02,-.06,1),(0,-.025,-.025),.12),
        (.42,(.22,-.07,.30),(-.17,-.67,.30),(.12,.02,1),(.015,0,-.03),.85),
        (.58,(.25,-.04,.31),(-.17,-.68,.30),(.13,.015,1),(.015,0,-.03),1),
        (.66,(.40,.17,.32),(-.17,-.68,.30),(.13,.015,1),(.015,0,-.03),0),
        (.79,(.31,.06,.16),(-.20,-.52,.19),(.06,0,1),(0,0,-.01),0),
        (1.0,(.24,-.20,-.11),(-.25,-.31,-.15),(0,0,1),(0,0,0),0)]}
    def interpolated(p,beats):
        j=next((i for i in range(len(beats)-1) if p<=beats[i+1][0]),len(beats)-2)
        a,b=beats[j],beats[j+1];t=max(0,min(1,(p-a[0])/(b[0]-a[0])));t=t*t*(3-2*t)
        return [tuple(x+(y-x)*t for x,y in zip(v,w)) if isinstance(v,tuple) else v+(w-v)*t for v,w in zip(a[1:],b[1:])]
    def clear_gear():
        global temporary
        for o in temporary:bpy.data.objects.remove(o,do_unlink=True)
        temporary=[]
    def reset():
        for o in human_roots:o.location=base[o.name].copy()
        apply_pose(1)
    # Native authored walk key poses, interpolated in local joint space,
    # not shifted copies of the same sprite. Closed seam 17 -> 5.
    walks=[]
    for frame in (5,9,13,17):
        apply_pose(frame);walks.append({b.name:b.matrix_basis.copy() for b in rig.pose.bones})
    errors=[];poses_meta=[]
    for motion,count in (("march",12),("combat",16),("defence",12)):
        for n in range(count):
            phase=n/count;reset()
            if motion=="march":
                j=int(phase*4);f=phase*4-j
                for b in rig.pose.bones:b.matrix_basis=walks[j][b.name].lerp(walks[(j+1)%4][b.name],f)
                bpy.context.view_layer.update()
                if kind=="archer":
                    clear_gear();temporary=bow_geometry(False,-.65)
                    for o in temporary:o.parent=pivot
            else:
                if motion=="combat":rh,lh,lean,shift,action=interpolated(phase,keys[kind])
                else:
                    brace=math.sin(pi*phase)**2
                    rh,lh,lean,shift,action=interpolated(.0,keys[kind])
                    rh=(rh[0],rh[1]-.14*brace,rh[2]+.08*brace)
                    lh=(lh[0],lh[1]-.15*brace,lh[2]+.16*brace)
                    lean=(.02,-.14*brace,1);shift=(0,-.035*brace,-.095*brace)
                    if kind!="archer":action=(.05,-.95,.30) if kind=="spear" else (.25,-.55,.85)
                for o in human_roots:o.location=base[o.name]+Vector((shift[0]*sign,shift[1],shift[2]))
                bpy.context.view_layer.update();aim(torso,(lean[0]*sign,lean[1],lean[2]))
                for j,(upper,lower,foot) in enumerate(feet):
                    errors.append(solve(upper,lower,foot,ground_targets[j],(0,-1,0)));aim(foot,foot_dirs[j])
                chest=point(torso)
                hand=lambda v:chest+Vector((v[0]*sign,v[1],v[2]))
                errors.append(solve(RU,RF,R,hand(rh),(sign,.18,-.25)))
                errors.append(solve(LU,LF,L,hand(lh),(-sign,.05,-.30)))
                if kind=="archer":
                    clear_gear();draw=motion=="combat" and .13<=phase<.625
                    temporary=bow_geometry(draw,-.6*(1-min(1,action+.15)),min(1,max(0,action)))
                    for o in temporary:o.parent=pivot
                else:weapon_aim((action[0]*sign,action[1],action[2]))
            bpy.context.view_layer.update()
            poses_meta.append({"motion":motion,"phase":phase,"rightHand":list(point(R)),"leftHand":list(point(L)),"feet":[list(point(v[2])) for v in feet]})
            pivot.rotation_euler.z=-pi/3;bpy.context.view_layer.update()
            sc.render.filepath=str(folder/(motion+"-%02d.png"%n));bpy.ops.render.render(write_still=True)
    (folder/"choreography.json").write_text(json.dumps({"role":kind,"samples":poses_meta,"maxJointResidual":max(errors,default=0),"controlFramesUnmodified":True},indent=2))
# Short, independently retained visual diagnostic before expensive production.
if os.environ.get("BOW_INFANTRY_PREVIEW"):
    if horse_rig:raise ValueError("Infantry preview must not use mounted rig")
    infantry_preview()
elif os.environ.get("BOW_RIG_PREFLIGHT"):
    if not horse_rig or not extended:raise ValueError("Preflight requires mounted extended rig")
    folder=out/"gait-diagnostic";folder.mkdir(exist_ok=True)
    sc.render.resolution_x=sc.render.resolution_y=320;sc.cycles.samples=5
    cam.data.ortho_scale=4.8;target=Vector((0,0,1.4))
    cam.location=target+Vector((0,-5,3.4));look(cam,target)
    livery(0)
    for gait,frame in (("walk",5),("trot",65),("gallop",41),("charge",41)):
        for i in range(8):
            apply_pose(frame,i/8,i/7 if gait=="charge" else None);pivot.rotation_euler.z=-pi/2;bpy.context.view_layer.update()
            sc.render.filepath=str(folder/(gait+"-"+str(i)+".png"))
            bpy.ops.render.render(write_still=True)
    report["diagnosticRendered"]=True
    fps=sc.render.fps/sc.render.fps_base
    report["diagnosticPeriodsSeconds"]={name.lower():float(exact_action(name).frame_range[1]-exact_action(name).frame_range[0])/fps for name in ("Walk","Gallop")}
    report["diagnosticPeriodsSeconds"]["trot"]=report["diagnosticPeriodsSeconds"]["walk"]*.72
    report["diagnosticPeriodsSeconds"]["charge"]=1.6
    save_audit()
else:
    # A common physical projection. Larger cavalry frustum with same source pixel/metre.
    ground=0 if horse_rig else z0
    target=Vector((0,0,1.45 if horse_rig else .85));cam.location=target+Vector((0,-5,5*math.tan(pi/3)));look(cam,target)
    cam.data.ortho_scale=7.0 if horse_rig else 5.0
    resolution=384 if horse_rig else 320;sc.render.resolution_x=sc.render.resolution_y=resolution
    def active_mesh():return [o for o in sc.objects if o.type=="MESH" and not o.hide_render]
    records={}
    # Common enclosing frustum for actual evaluated mesh extents, no clipping or physical scaling.
    max_extent=0
    for h in range(8):
        for f in poses:
            apply_pose(f);pivot.rotation_euler.z=-h*pi/4;bpy.context.view_layer.update()
            for v in bounds(active_mesh()):
                q=world_to_camera_view(sc,cam,v);max_extent=max(max_extent,abs(q.x-.5),abs(q.y-.5))
    factor=max(1,2.20*max_extent,1.18 if horse_rig else 1.12);cam.data.ortho_scale*=factor;resolution=math.ceil(resolution*factor/32)*32;sc.render.resolution_x=sc.render.resolution_y=resolution
    for side in [0,1]:
        livery(side);clothmat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(*((.10,.22,.43) if side==0 else (.46,.12,.05)),1)
        for heading in range(8):
            for frame in poses:
                apply_pose(frame);pivot.rotation_euler.z=-heading*pi/4;bpy.context.view_layer.update()
                name=f"{side}-{heading}-{frame}";anchor=pixel((0,0,ground))
                sc.render.filepath=str(out/(name+".png"));bpy.ops.render.render(write_still=True)
                direction=Vector((sin(-heading*pi/4),-cos(-heading*pi/4),0))
                visible_weapons=[o for o in weapon if not o.hide_render]
                reach=max((v.dot(direction) for v in vertices(visible_weapons)),default=0) if visible_weapons else 0
                records[name]={"anchor":anchor,"pixelsPerMetre":resolution/cam.data.ortho_scale,"weaponForwardMetres":reach,"renderSize":resolution}
            # Bounded additional command representatives, using real existing human/mount.
            for role in ["banner","officer"]:
                apply_pose(1);bpy.context.view_layer.update()
                hand=point(R);z=hand.z
                for o in weapon:o.hide_render=True
                for o in temporary:o.hide_render=True
                if role=="banner":
                    pole=rod("Regimental standard",hand+Vector((0,0,-.7)),hand+Vector((0,0,1.15)),.025,wood,pivot)
                    vv=[tuple(hand+Vector((i*.07,.07*sin(i*.5+j*.4),1.10-j*.09-i*.007))) for i in range(11) for j in range(8)]
                    ff=[(i*8+j,(i+1)*8+j,(i+1)*8+j+1,i*8+j+1) for i in range(10) for j in range(7)]
                    banner=mesh("Woven regimental colour",vv,ff,clothmat,pivot);md=banner.modifiers.new("Cloth","SOLIDIFY");md.thickness=.004
                    gear=[pole,banner]
                else:
                    # Gold-coloured fabric sash drapes across torso, not metal recolour.
                    z=point(torso).z;vv=[(-.22,-.17,z+.30),(-.15,-.18,z+.34),(.23,-.20,z-.18),(.16,-.20,z-.22)]
                    sash=mesh("Officer textile sash",vv,[(0,1,2,3)],linen,pivot);md=sash.modifiers.new("Sash thickness","SOLIDIFY");md.thickness=.012
                    gear=[sash]
                    for o in weapon:
                        if kind!="archer":o.hide_render=False
                pivot.rotation_euler.z=-heading*pi/4;bpy.context.view_layer.update()
                name=f"{side}-{heading}-1-{role}";sc.render.filepath=str(out/(name+".png"));bpy.ops.render.render(write_still=True)
                records[name]={**records[f"{side}-{heading}-1"],"role":role}
                for o in gear:bpy.data.objects.remove(o,do_unlink=True)
                for o in weapon:o.hide_render=kind=="archer"
    (out/"frames.json").write_text(json.dumps({"frames":records,"kind":kind,"humanHeightMetres":human_height,"horseActions":list(horse_actions),"groundZ":ground,"motionRevision":1 if extended else 0,"gait":gait_meta,"poses":poses}))
