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
    def bow_geometry(draw,tilt=0):
        p=point(L);q=point(R);p.y-=.045
        rot=Matrix.Rotation(tilt,3,'X');v=[];f=[];N=20;M=8
        for i in range(N+1):
            t=i/N;zz=(t-.5)*1.65;yy=.25*(abs(t-.5)*2)**1.8
            for j in range(M):v.append(tuple(p+rot@Vector((.020*cos(j*2*pi/M),yy+.024*sin(j*2*pi/M),zz))))
        for i in range(N):
            for j in range(M):f.append((i*M+j,i*M+(j+1)%M,(i+1)*M+(j+1)%M,(i+1)*M+j))
        bow=mesh("English longbow",v,f,wood,None)
        top=p+rot@Vector((0,.25,.825));bot=p+rot@Vector((0,.25,-.825));mid=q if draw else p+rot@Vector((0,.25,0))
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
    feet={b.name:horse_rig.matrix_world@b.tail for b in horse_rig.pose.bones}
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
    candidates={}
    for b in horse_rig.pose.bones:
        h=horse_rig.matrix_world@b.bone.head_local;t=horse_rig.matrix_world@b.bone.tail_local
        if abs(h.x)<.035 or abs(h.y)<.16 or h.z<.35 or t.z>h.z-.025:continue
        if any(q in b.name.lower() for q in ("tail","ear","head","neck")):continue
        quadrant=(1 if h.x>0 else -1,1 if h.y>0 else -1)
        if quadrant not in candidates or h.z>candidates[quadrant][0]:candidates[quadrant]=(h.z,b)
    chains={}
    for k,(_,b) in candidates.items():
        names=[b.name]+[a.name for a in b.children_recursive]
        leaf=min(names,key=lambda n:(horse_rig.matrix_world@horse_rig.pose.bones[n].bone.tail_local).z)
        chains[k]=(names,leaf)
    if len(chains)!=4 or len(set(n for a,_ in chains.values() for n in a))!=sum(len(a) for a,_ in chains.values()):
        raise ValueError("Trot requires four disjoint horse limb chains; found "+str({str(k):v[0] for k,v in chains.items()}))
    samples=[sample_horse("Walk",i/16) for i in range(16)]
    peaks={k:min(range(16),key=lambda i:samples[i][1][leaf].y) for k,(_,leaf) in chains.items()}
    def trot(phase):
        base={k:v.copy() for k,v in samples[int(phase*16)%16][0].items()}
        for k,(names,leaf) in chains.items():
            i=(peaks[k]+round(phase*16)+(0 if k[0]==k[1] else 8))%16
            for n in names:base[n]=samples[i][0][n].copy()
        return base
    gait_meta={"saddleBone":seat_bone.name,"limbChains":{str(k):v[0] for k,v in chains.items()},"trot":"diagonal phase resampling of exact Walk clip","exactClips":[exact_action(k).name for k in ("Idle","Walk","Gallop")]}
def apply_pose(frame):
    global temporary
    for o in temporary:bpy.data.objects.remove(o,do_unlink=True)
    temporary=[];pivot.rotation_euler.z=0
    rapid=41<=frame<=53
    source=5+((frame-41)//4)*4 if rapid else 1 if frame in [57,61] or frame>=65 else frame
    if horse_rig:
        if extended:
            mode="Gallop" if rapid else "Walk" if frame in [5,9,13,17] else "Idle"
            phase=((frame-41)//4%4)/4 if rapid else ((frame-5)//4%4)/4 if mode=="Walk" else ((frame-25)//4%4)/4 if frame in [25,29,33,37] else 0
            saved=trot((frame-65)/16) if frame>=65 else sample_horse(mode,phase)[0]
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
        aim(torso,(0,-lean,1))
        aim(RH,(sign*(.40 if light else .48),-.30 if light else -.18,-.72));aim(LH,(-sign*(.40 if light else .48),-.30 if light else -.18,-.72));aim(RK,(0,.38 if light else .24,-1));aim(LK,(0,.38 if light else .24,-1))
        aim(LU,(.10,-.50,-.78));aim(LF,(-.15,-.85,.02))
        if frame in [25,29,33,37]:
            if light:
                d={25:(-.65,-.25,.60),29:(-.45,-.8,.30),33:(.12,-1,-.1),37:(.30,-.55,-.5)}[frame];aim(RU,d);aim(RF,(.10,-1,.12))
            else:
                d={25:(-.10,-.60,-.20),29:(-.05,-1,.10),33:(-.02,-1,-.05),37:(-.15,-.65,-.45)}[frame];aim(RU,d);aim(RF,(0,-1,.05))
        elif frame==57 or rapid:aim(RU,(-.10,-.82,-.22));aim(RF,(0,-1,.04))
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
