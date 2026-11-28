"""Trusted, isolated Blender authoring. Imported skinned CC0 source, not a primitive mannequin."""
import bpy, math, json, os
from mathutils import Vector, Matrix
from pathlib import Path
from math import sin, cos, pi
out=json.loads(os.environ["ART_FORGE_OUTPUTS"])
src=Path(json.loads(os.environ["ART_FORGE_INPUTS"])["asset-forge/source.glb"])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src))
rigs=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
if len(rigs)!=1: raise RuntimeError("Expected one source rig")
rig=rigs[0]
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
if not meshes: raise RuntimeError("Missing source geometry")
if not any(n.type=="TEX_IMAGE" and n.image for o in meshes for mat in o.data.materials if mat and mat.use_nodes for n in mat.node_tree.nodes):
    raise RuntimeError("Source must retain texture maps")
def find(*names):
    for name in names:
        for b in rig.pose.bones:
            if b.name.lower().replace("_","").replace(" ","").split(":")[-1].endswith(name.lower().replace("_","")): return b
    raise RuntimeError("Missing rig bone "+str(names)+"; "+str([b.name for b in rig.pose.bones]))
right=find("RightHand","Hand.R","hand_r")
left=find("LeftHand","Hand.L","hand_l")
ru=find("RightArm","RightUpperArm","upper_arm.R","upperarm_r")
lu=find("LeftArm","LeftUpperArm","upper_arm.L","upperarm_l")
rf=find("RightForeArm","RightLowerArm","forearm.R","lowerarm_r")
lf=find("LeftForeArm","LeftLowerArm","forearm.L","lowerarm_l")
rh=find("RightUpLeg","RightThigh","thigh.R","thigh_r")
lh=find("LeftUpLeg","LeftThigh","thigh.L","thigh_l")
rk=find("RightLeg","RightCalf","shin.R","calf_r")
lk=find("LeftLeg","LeftCalf","shin.L","calf_l")
head=find("Head")
# The source faces glTF +Z, which maps to Blender -Y. Source units are metres.
def point(b): return rig.matrix_world @ b.head
def aim(b,d):
    d=rig.matrix_world.inverted().to_3x3() @ Vector(d)
    mat=b.matrix.copy(); a=(mat.to_3x3()@Vector((0,1,0))).normalized()
    rot=a.rotation_difference(d.normalized()).to_matrix().to_4x4()
    pos=mat.translation.copy(); mat=rot @ mat;mat.translation=pos;b.matrix=mat
    bpy.context.view_layer.update()
def pose(name,phase=0):
    for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
    attack=name=="attack"; guard=name=="guard"; walk=name=="walk"
    lunge=max(0,sin(phase*pi*2)) if attack else 0
    aim(ru,(.10,-.55,-.75));aim(rf,(-.12,-.85,-.1-lunge*.10))
    aim(lu,(-.12,-.40,-.82));aim(lf,(.30,-.78,.20 if guard else -.06))
    if walk:
        for b,k,v in [(rh,rk,sin(phase*2*pi)),(lh,lk,-sin(phase*2*pi))]:
            aim(b,(0,-v*.37,-1));aim(k,(0,.16+max(0,-v)*.42,-1))
    elif attack:
        aim(rh,(0,-.10-lunge*.24,-1));aim(lh,(0,.12+lunge*.20,-1))
        aim(ru,(.08,-.58-lunge*.25,-.78+lunge*.43));aim(rf,(-.04,-1,-.1+lunge*.20))
    bpy.context.view_layer.update()
def material(name,color,metal=0,rough=.6,grain=120):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get("Principled BSDF")
    p.inputs["Base Color"].default_value=(*color,1);p.inputs["Metallic"].default_value=metal;p.inputs["Roughness"].default_value=rough
    tex=n.new("ShaderNodeTexNoise");tex.inputs["Scale"].default_value=grain;tex.inputs["Detail"].default_value=3
    ramp=n.new("ShaderNodeValToRGB");ramp.color_ramp.elements[0].color=(*(v*.60 for v in color),1);ramp.color_ramp.elements[1].color=(*(min(1,v*1.28) for v in color),1)
    l.new(tex.outputs["Fac"],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs["Base Color"])
    bump=n.new("ShaderNodeBump");bump.inputs["Strength"].default_value=.20;bump.inputs["Distance"].default_value=.012
    l.new(tex.outputs["Fac"],bump.inputs["Height"]);l.new(bump.outputs[0],p.inputs["Normal"])
    return m
steel=material("Hammered steel",(.38,.42,.44),.78,.30,145)
edge=material("Polished edges",(.59,.62,.63),.85,.22,100)
wood=material("Ash wood",(.29,.16,.072),0,.69,36)
hide=material("Leather",(.12,.069,.035),0,.83,95)
paint=material("Shield paint",(.13,.25,.37),0,.70,75)
rim=material("Rawhide binding",(.44,.35,.23),0,.88,110)
def surface(name,verts,faces,mat):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    for p in m.polygons:p.use_smooth=True
    return o
def lathe(name,rings,mat,center=(0,0,0),N=48):
    v=[(center[0]+rx*cos(i*2*pi/N),center[1]+ry*sin(i*2*pi/N),center[2]+z) for z,rx,ry in rings for i in range(N)]
    f=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(len(rings)-1) for i in range(N)]
    return surface(name,v,f,mat)
def attach(o,b):
    world=o.matrix_world.copy();o.parent=rig;o.parent_type="BONE";o.parent_bone=b.name;o.matrix_world=world
def shaft(name,a,b,r1,r2,mat,N=16):
    a,b=Vector(a),Vector(b);z=(b-a).normalized();x=z.cross(Vector((0,0,1)) if abs(z.z)<.9 else Vector((0,1,0))).normalized();y=z.cross(x)
    v=[tuple(p+(x*cos(i*2*pi/N)+y*sin(i*2*pi/N))*r) for p,r in [(a,r1),(b,r2)] for i in range(N)]
    f=[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]+[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]
    return surface(name,v,f,mat)
pose("idle")
# Custom, shaped late-medieval brimmed helmet: spun shell with distinct rolled brim.
hp=point(head);z=hp.z+.10
hat=lathe("Kettle hat / worked steel",[(0,.225,.26),(.018,.235,.27),(.043,.221,.253),(.085,.151,.177),(.16,.133,.153),(.23,.092,.111),(.256,.008,.009)],steel,(hp.x,hp.y-.018,z))
brim=lathe("Rolled rim",[(0,.224,.260),(.012,.237,.275),(.027,.233,.271),(.036,.22,.257)],edge,(hp.x,hp.y-.018,z))
attach(hat,head);attach(brim,head)
# Spear grip in right hand, real ash shaft and forged leaf-shaped iron blade.
p=point(right);axis=Vector((.06,-.96,.27)).normalized()
a=p-axis*.80;b=p+axis*1.15
shaft_obj=shaft("Ash spear shaft",a,b,.022,.017,wood);attach(shaft_obj,right)
v=[];x=axis.cross(Vector((0,0,1))).normalized();y=axis.cross(x)
for t,w,h in [(0,.018,.012),(.07,.055,.014),(.20,.043,.011),(.34,0.001,.001)]:
    c=b+axis*t;v.extend(tuple(c+q) for q in [x*w,y*h,-x*w,-y*h])
blade=surface("Forged spear leaf",v,[(i+j*4,(i+1)%4+j*4,(i+1)%4+(j+1)*4,i+(j+1)*4) for j in range(3) for i in range(4)],steel)
attach(blade,right)
# A compact curved painted wooden shield, an experimental late medieval infantry interpretation.
p=point(left)+Vector((-.04,-.07,-.10))
v=[tuple(p+Vector((0,-.09,0)))]
N=48
for radius in [.48,.87,1]:
    for i in range(N):
        t=i*2*pi/N;v.append(tuple(p+Vector((.32*radius*cos(t),-.09*(1-radius*radius),.40*radius*sin(t)))))
f=[(0,1+i,1+(i+1)%N) for i in range(N)]
for j in range(2):
    for i in range(N):
        k=1+j*N+i;l=1+j*N+(i+1)%N;f.append((k,l,l+N,k+N))
shield=surface("Curved shield painted wood",v,f,paint);solid=shield.modifiers.new("Boards","SOLIDIFY");solid.thickness=.018;attach(shield,left)
# Rim built from a continuous elliptical cross-section, not spheres.
rv=[];rfac=[]
for i in range(N):
    t=i*2*pi/N
    for j in range(8):
        u=j*2*pi/8;rv.append(tuple(p+Vector(((.32+.012*cos(u))*cos(t),.012*sin(u),(.40+.012*cos(u))*sin(t)))))
for i in range(N):
    for j in range(8):rfac.append((i*8+j,i*8+(j+1)%8,((i+1)%N)*8+(j+1)%8,((i+1)%N)*8+j))
ring=surface("Shield rawhide edge",rv,rfac,rim);attach(ring,left)
boss=lathe("Shield boss",[(0,.07,.07),(.02,.08,.08),(.06,.055,.055),(.073,.003,.003)],steel)
boss.rotation_euler=(pi/2,0,0);boss.location=p+Vector((0,-.085,0));attach(boss,left)
# Replace imported clips only in this test rig, author short contact and walk sequences.
rig.animation_data_clear()
for index,(name,ph) in enumerate([("idle",0),("walk",0),("walk",.25),("walk",.5),("walk",.75),("guard",0),("attack",.10),("attack",.30),("attack",.55),("attack",.80)]):
    frame=1+index*4;pose(name,ph)
    for b in rig.pose.bones:
        b.rotation_mode="QUATERNION"
        b.keyframe_insert(data_path="rotation_quaternion",frame=frame)
        b.keyframe_insert(data_path="location",frame=frame)
        b.keyframe_insert(data_path="scale",frame=frame)
sc=bpy.context.scene;sc.frame_start=1;sc.frame_end=37;sc.frame_set(1)
if rig.animation_data and rig.animation_data.action:rig.animation_data.action.name="Reference motion: idle, walk, guard, thrust"
# Pack texture source; no external asset reads at render or game runtime.
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=out["editable"],compress=False)
bpy.ops.export_scene.gltf(filepath=out["model"],export_format="GLB",export_animations=True)
