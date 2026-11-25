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
assert kind in ("sword","archer","knight","lightHorse")
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
    p=point(torso);p.z=z0+human_height*.60
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
    def bow_geometry(draw):
        p=point(L);q=point(R);p.y-=.045
        v=[];f=[];N=20;M=8
        for i in range(N+1):
            t=i/N;zz=(t-.5)*1.65;yy=.25*(abs(t-.5)*2)**1.8
            for j in range(M):v.append(tuple(p+Vector((.020*cos(j*2*pi/M),yy+.024*sin(j*2*pi/M),zz))))
        for i in range(N):
            for j in range(M):f.append((i*M+j,i*M+(j+1)%M,(i+1)*M+(j+1)%M,(i+1)*M+j))
        bow=mesh("English longbow",v,f,wood,None)
        top=p+Vector((0,.25,.825));bot=p+Vector((0,.25,-.825));mid=q if draw else p+Vector((0,.25,0))
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
else:
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
    for o in human_roots:o.location.z+=1.25
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
# Eight directions and bounded reference cycle. Reuse exact human action poses for infantry.
poses=[1,5,9,13,17,21,25,29,33,37]
temporary=[]
def apply_pose(frame):
    global temporary
    for o in temporary:bpy.data.objects.remove(o,do_unlink=True)
    temporary=[]
    pivot.rotation_euler.z=0
    if horse_rig:
        mode="idle" if frame==1 or frame==21 else "gallop" if frame>=25 else "walk"
        action=next((a for k,a in horse_actions.items() if mode in k.lower()),None)
        if action is None:action=next(iter(horse_actions.values()))
        horse_rig.animation_data_create();horse_rig.animation_data.action=action
        # Imported action may use Blender 4+ slots; bind a compatible object slot explicitly.
        if hasattr(action,"slots") and len(action.slots):
            try:horse_rig.animation_data.action_slot=action.slots[0]
            except (TypeError,ValueError):pass
        a,b=action.frame_range;phase=0 if frame in [1,21] else ((frame-5)//4%4)/4
        # Evaluate horse at its own source time; rider at original pose, then keep horse pose.
        sc.frame_set(round(a+(b-a)*phase));bpy.context.view_layer.update();saved={bone.name:bone.matrix_basis.copy() for bone in horse_rig.pose.bones}
        sc.frame_set(frame)
        for b in horse_rig.pose.bones:b.matrix_basis=saved[b.name]
        # Stop automatic reevaluation overriding the sampled pose during render.
        horse_rig.animation_data.action=None
        for b in horse_rig.pose.bones:b.matrix_basis=saved[b.name]
        bpy.context.view_layer.update()
        aim(RH,(-.43,-.25,-.72));aim(LH,(.43,-.25,-.72));aim(RK,(0,.30,-1));aim(LK,(0,.30,-1))
        aim(LU,(.10,-.50,-.78));aim(LF,(-.15,-.85,.02))
        aim(RU,(-.10,-.7,-.60 if frame<25 else -.15));aim(RF,(0,-1,.12))
    else:
        sc.frame_set(frame);bpy.context.view_layer.update()
        if kind=="archer":
            draw=frame>=25
            aim(LU,(.05,-1,-.08 if draw else -.4));aim(LF,(0,-1,0))
            aim(RU,(-.6,-.25,-.3));aim(RF,(.35,-.10,.65 if draw else -.4))
            temporary=bow_geometry(draw)
        if kind=="sword" and frame>=25:
            aim(RU,(-.26,-.65,.35 if frame in [25,37] else -.15));aim(RF,(.08,-1,.40 if frame==25 else -.15))
    bpy.context.view_layer.update()
# A common physical projection. Larger cavalry frustum with same source pixel/metre.
ground=0 if horse_rig else z0
target=Vector((0,0,1.45 if horse_rig else .85));cam.location=target+Vector((0,-5,5*math.tan(pi/3)));look(cam,target)
cam.data.ortho_scale=6 if horse_rig else 4.6
resolution=384 if horse_rig else 320;sc.render.resolution_x=sc.render.resolution_y=resolution
def active_mesh():return [o for o in sc.objects if o.type=="MESH" and not o.hide_render]
records={}
for side in [0,1]:
    livery(side);clothmat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(*((.10,.22,.43) if side==0 else (.46,.12,.05)),1)
    for heading in range(8):
        for frame in poses:
            apply_pose(frame);pivot.rotation_euler.z=-heading*pi/4;bpy.context.view_layer.update()
            name=f"{side}-{heading}-{frame}";anchor=pixel((0,0,ground))
            sc.render.filepath=str(out/(name+".png"));bpy.ops.render.render(write_still=True)
            records[name]={"anchor":anchor,"pixelsPerMetre":resolution/cam.data.ortho_scale,"weaponForwardMetres":2.8 if kind=="knight" else 1.1 if kind in ["sword","lightHorse"] else .7,"renderSize":resolution}
(out/"frames.json").write_text(json.dumps({"frames":records,"kind":kind,"humanHeightMetres":human_height,"horseActions":list(horse_actions),"groundZ":ground}))
