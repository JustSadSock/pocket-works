import argparse, math, sys
from pathlib import Path
import bpy
from mathutils import Vector


def parse_args():
    argv=sys.argv; argv=argv[argv.index('--')+1:] if '--' in argv else []
    p=argparse.ArgumentParser(); p.add_argument('--output',required=True); return p.parse_args(argv)


def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes,bpy.data.curves,bpy.data.materials,bpy.data.armatures,bpy.data.actions,bpy.data.images):
        for block in list(coll):
            if block.users==0: coll.remove(block)


def fract(v): return v-math.floor(v)
def cell_rand(x,y): return fract(math.sin(x*127.1+y*311.7+73.31)*43758.5453123)
def smooth01(t):
    t=max(0.0,min(1.0,t)); return t*t*(3.0-2.0*t)


def make_scale_image():
    # Staggered overlapping micro-scales. Each cell receives a deterministic
    # local colour variation; unlike the former sin/cos texture this has no
    # long periodic bands that can turn the dragon into a striped cylinder.
    w=h=256; img=bpy.data.images.new('Aetherwing_ScaleTexture',width=w,height=h,alpha=True)
    px=[]; cell_w=13.0; cell_h=10.0
    for y in range(h):
        row=math.floor(y/cell_h); ly=(y-row*cell_h)/cell_h
        offset=(row&1)*cell_w*.5
        for x in range(w):
            fx=(x-offset)/cell_w; col=math.floor(fx); lx=fx-col
            # Soft teardrop/scale interior with a darker upper rim.
            dx=(lx-.5)/.52; dy=(ly-.47)/.58; d=dx*dx+dy*dy
            interior=1.0-smooth01((d-.45)/.62)
            rim=(1.0-smooth01(abs(d-.92)/.16))*0.16
            speck=(cell_rand(col,row)-.5)*.075+(cell_rand(x//3,y//3)-.5)*.028
            shade=interior*.075-rim+speck
            r=.205+shade*.62; g=.365+shade; b=.235+shade*.68
            px.extend((max(.04,min(.48,r)),max(.09,min(.62,g)),max(.05,min(.44,b)),1.0))
    img.pixels=px; img.pack(); return img


def material(name,color,rough=.68,metal=.0,image=None,emission=None,alpha=1):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,alpha);m.use_nodes=True;m.use_backface_culling=False
    bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=rough;bsdf.inputs['Metallic'].default_value=metal
    if image:
        tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear';m.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    if emission:
        bsdf.inputs['Emission Color'].default_value=(*emission,1);bsdf.inputs['Emission Strength'].default_value=2.35
    if alpha<1:
        bsdf.inputs['Alpha'].default_value=alpha;m.surface_render_method='DITHERED'
    return m


def smooth(obj,mat=None,bevel=0):
    if mat: obj.data.materials.append(mat)
    if hasattr(obj.data,'polygons'):
        for p in obj.data.polygons:p.use_smooth=True
    if bevel:
        mod=obj.modifiers.new('organic bevel','BEVEL');mod.width=bevel;mod.segments=2;mod.limit_method='ANGLE'
    return obj


def apply_scale(obj):
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.select_set(False)


def uv(name,loc,scale,mat,segments=36,rings=22):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    o=bpy.context.active_object;o.name=name;o.scale=scale;apply_scale(o);return smooth(o,mat)


def cone_between(name,a,b,r1,r2,mat,verts=20,bevel=.018):
    a=Vector(a);b=Vector(b);d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=d.length,location=(a+b)*.5)
    o=bpy.context.active_object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');o.rotation_mode='XYZ';return smooth(o,mat,bevel)


def create_rig():
    bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0));rig=bpy.context.active_object;rig.name='AetherwingRig';rig.data.name='AetherwingRigData';edit=rig.data.edit_bones
    for b in list(edit):edit.remove(b)
    def add(name,h,t,parent=None):
        b=edit.new(name);b.head=h;b.tail=t
        if parent:b.parent=edit[parent]
        return b
    add('Root',(0,1.25,.02),(0,.05,.03))
    add('Spine',(0,.35,.08),(0,-1.25,.20),'Root')
    add('Chest',(0,-1.20,.20),(0,-2.45,.48),'Spine')
    add('Neck1',(0,-2.40,.48),(0,-3.55,.79),'Chest')
    add('Neck2',(0,-3.50,.79),(0,-4.70,.92),'Neck1')
    add('Head',(0,-4.65,.92),(0,-5.95,.82),'Neck2')
    add('Tail1',(0,1.15,.02),(0,2.85,-.02),'Root')
    add('Tail2',(0,2.80,-.02),(0,4.65,-.12),'Tail1')
    add('Tail3',(0,4.60,-.12),(0,6.55,-.30),'Tail2')
    add('Tail4',(0,6.50,-.30),(0,8.45,-.55),'Tail3')
    for side_name,side in (('L',-1),('R',1)):
        add(f'Wing{side_name}1',(side*1.05,-1.60,.69),(side*4.15,-1.28,1.18),'Chest')
        add(f'Wing{side_name}2',(side*4.15,-1.28,1.18),(side*7.25,-.18,.82),f'Wing{side_name}1')
        add(f'Wing{side_name}3',(side*7.25,-.18,.82),(side*10.05,1.38,.12),f'Wing{side_name}2')
        add(f'FrontUpper{side_name}',(side*.73,-1.82,.18),(side*.98,-1.50,-.62),'Chest')
        add(f'FrontLower{side_name}',(side*.98,-1.50,-.62),(side*1.13,-.55,-.90),f'FrontUpper{side_name}')
        add(f'FrontFoot{side_name}',(side*1.13,-.55,-.90),(side*1.22,.10,-.73),f'FrontLower{side_name}')
        add(f'HindUpper{side_name}',(side*.78,.78,-.08),(side*1.17,1.42,-.56),'Root')
        add(f'HindLower{side_name}',(side*1.17,1.42,-.56),(side*1.07,2.30,-.83),f'HindUpper{side_name}')
        add(f'HindFoot{side_name}',(side*1.07,2.30,-.83),(side*1.18,2.88,-.59),f'HindLower{side_name}')
    bpy.ops.object.mode_set(mode='OBJECT');return rig


def bind(obj,rig,bone):
    world=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=world
    mod=obj.modifiers.new('AetherwingArmature','ARMATURE');mod.object=rig
    g=obj.vertex_groups.new(name=bone);g.add(list(range(len(obj.data.vertices))),1,'REPLACE')


def membrane(name,side,rig,mat):
    sn='L' if side<0 else 'R'
    # More points along the trailing edge give a bat-like scalloped planform
    # instead of one flat pentagon. Slight vertical offsets keep a cambered read.
    pts=[
        (side*1.03,-1.62,.70), # 0 root leading
        (side*4.16,-1.28,1.18),# 1 elbow
        (side*7.26,-.18,.82),  # 2 wrist
        (side*10.06,1.38,.12), # 3 tip
        (side*8.55,2.10,-.58), # 4 trailing tip
        (side*7.05,1.72,-.96), # 5
        (side*5.55,2.03,-1.16),# 6
        (side*4.05,1.55,-1.17),# 7
        (side*2.75,.82,-.98),  # 8
        (side*1.62,-.35,-.48)  # 9 root trailing
    ]
    faces=[(0,1,9),(1,8,9),(1,7,8),(1,2,7),(2,6,7),(2,5,6),(2,3,5),(3,4,5)]
    me=bpy.data.meshes.new(name+'Mesh');me.from_pydata(pts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);smooth(o,mat)
    world=o.matrix_world.copy();o.parent=rig;o.matrix_world=world;mod=o.modifiers.new('AetherwingArmature','ARMATURE');mod.object=rig
    weights=[f'Wing{sn}1',f'Wing{sn}1',f'Wing{sn}2',f'Wing{sn}3',f'Wing{sn}3',f'Wing{sn}3',f'Wing{sn}2',f'Wing{sn}2',f'Wing{sn}1',f'Wing{sn}1']
    for idx,bone in enumerate(weights):
        g=o.vertex_groups.get(bone) or o.vertex_groups.new(name=bone);g.add([idx],1,'REPLACE')
    sol=o.modifiers.new('Membrane thickness','SOLIDIFY');sol.thickness=.042
    return o


def build(rig):
    scale_img=make_scale_image()
    scales=material('Deep green scales',(.26,.43,.28),.68,.012,scale_img)
    belly=material('Warm belly plates',(.46,.39,.23),.76)
    mem=material('Wing membrane',(.28,.13,.085),.79,.005)
    horn=material('Horn and claw',(.18,.16,.125),.72)
    eye=material('Amber eyes',(.88,.39,.055),.30,emission=(.45,.09,.008))
    dark=material('Dorsal scales',(.095,.19,.125),.78)
    vein=material('Wing veins',(.12,.105,.085),.76)
    parts=[]
    def add(o,b):parts.append((o,b));return o

    # Lean torso with overlapping chest/abdomen masses. The old 3.15-long
    # sphere dominated the rear silhouette; this keeps the creature athletic.
    add(uv('Dragon_Body',(0,.45,.10),(1.12,2.15,.92),scales,44,26),'Spine')
    add(uv('Dragon_Chest',(0,-1.35,.34),(1.43,1.50,1.16),scales,44,26),'Chest')
    add(uv('Dragon_Shoulder',(0,-1.88,.48),(1.56,.84,1.22),scales,40,24),'Chest')
    add(cone_between('Dragon_Neck1',(0,-2.00,.51),(0,-3.55,.80),.82,.57,scales,28),'Neck1')
    add(cone_between('Dragon_Neck2',(0,-3.45,.80),(0,-4.78,.91),.59,.42,scales,28),'Neck2')
    add(uv('Dragon_Head',(0,-5.22,.88),(.70,1.03,.66),scales,40,24),'Head')
    add(uv('Dragon_Muzzle',(0,-6.03,.66),(.54,.86,.38),belly,34,20),'Head')
    add(uv('Dragon_Jaw',(0,-5.98,.40),(.49,.73,.22),dark,30,16),'Head')

    # Brow, swept horns, cheek spines and bright eyes establish a readable head
    # even from the chase camera when the neck is almost aligned with the body.
    for side in (-1,1):
        add(uv(f'Dragon_Eye_{side}',(side*.32,-5.61,1.08),(.10,.14,.10),eye,20,12),'Head')
        add(cone_between(f'Dragon_Horn_{side}',(side*.31,-4.86,1.25),(side*.62,-4.05,1.82),.15,.012,horn,13),'Head')
        add(cone_between(f'Dragon_CheekHorn_{side}',(side*.48,-5.45,.88),(side*.88,-5.03,.93),.11,.01,horn,12),'Head')
        add(cone_between(f'Dragon_Brow_{side}',(side*.24,-5.55,1.19),(side*.53,-5.31,1.28),.115,.035,dark,12),'Head')

    # Long overlapping tail sections avoid the former single hard cone read.
    tail_specs=[
        ((0,1.55,.03),(0,3.00,-.03),.86,.67,'Tail1'),
        ((0,2.90,-.03),(0,4.80,-.14),.68,.47,'Tail2'),
        ((0,4.68,-.14),(0,6.68,-.33),.48,.27,'Tail3'),
        ((0,6.55,-.33),(0,8.65,-.58),.28,.035,'Tail4')]
    for i,(a,b,r1,r2,bone) in enumerate(tail_specs):add(cone_between(f'Dragon_Tail_{i}',a,b,r1,r2,scales,28),bone)

    for side_name,side in (('L',-1),('R',1)):
        p0=(side*1.05,-1.60,.69);p1=(side*4.16,-1.28,1.18);p2=(side*7.26,-.18,.82);p3=(side*10.06,1.38,.12)
        t4=(side*8.55,2.10,-.58);t5=(side*7.05,1.72,-.96);t6=(side*5.55,2.03,-1.16);t7=(side*4.05,1.55,-1.17);t8=(side*2.75,.82,-.98)
        add(cone_between(f'Dragon_WingArm_{side_name}1',p0,p1,.34,.22,scales,22),f'Wing{side_name}1')
        add(cone_between(f'Dragon_WingArm_{side_name}2',p1,p2,.225,.14,scales,20),f'Wing{side_name}2')
        add(cone_between(f'Dragon_WingFinger_{side_name}',p2,p3,.145,.028,horn,16),f'Wing{side_name}3')
        add(cone_between(f'Dragon_WingRib_{side_name}A',p1,t7,.085,.018,vein,12),f'Wing{side_name}1')
        add(cone_between(f'Dragon_WingRib_{side_name}B',p2,t6,.074,.016,vein,12),f'Wing{side_name}2')
        add(cone_between(f'Dragon_WingRib_{side_name}C',p2,t5,.062,.013,vein,12),f'Wing{side_name}3')
        add(cone_between(f'Dragon_WingRib_{side_name}D',p3,t4,.050,.010,vein,10),f'Wing{side_name}3')
        membrane(f'Dragon_WingMembrane_{side_name}',side,rig,mem)

        # Muscular limb chains; all segments overlap at joints so deformation
        # never reveals a disconnected marionette gap during runtime springs.
        for prefix,upper,lower,foot in [('Front',f'FrontUpper{side_name}',f'FrontLower{side_name}',f'FrontFoot{side_name}'),('Hind',f'HindUpper{side_name}',f'HindLower{side_name}',f'HindFoot{side_name}')]:
            if prefix=='Front':a=(side*.72,-1.78,.16);b=(side*.98,-1.50,-.62);c=(side*1.13,-.55,-.90);d=(side*1.22,.10,-.73);r=(.30,.23,.14)
            else:a=(side*.77,.78,-.08);b=(side*1.17,1.42,-.56);c=(side*1.07,2.30,-.83);d=(side*1.18,2.88,-.59);r=(.36,.26,.16)
            add(cone_between(f'Dragon_{prefix}Upper_{side_name}',a,b,r[0],r[1],scales,20),upper)
            add(cone_between(f'Dragon_{prefix}Lower_{side_name}',b,c,r[1],r[2],scales,18),lower)
            add(cone_between(f'Dragon_{prefix}Foot_{side_name}',c,d,r[2],.065,horn,15),foot)
            for ci,claw in enumerate((-.13,0,.13)):
                add(cone_between(f'Dragon_{prefix}Claw_{side_name}_{ci}',d,(d[0]+side*claw,d[1]+.32,d[2]-.055),.042,.004,horn,9),foot)

    # Smaller, denser dorsal ridge creates scale rather than fence-post spikes.
    ridge_points=[(1.65,1.02),(1.0,1.10),(.35,1.12),(-.3,1.18),(-.95,1.26),(-1.55,1.35),(-2.15,1.34),(-2.72,1.20),(-3.30,1.12),(-3.90,1.09),(-4.48,1.08)]
    for i,(y,z) in enumerate(ridge_points):
        bone='Tail1' if y>1.25 else 'Spine' if y>-.8 else 'Chest' if y>-2.4 else 'Neck1' if y>-3.6 else 'Neck2'
        height=.34+.09*(1-abs(i-5)/6);add(cone_between(f'Dragon_Dorsal_{i}',(0,y,z),(0,y,z+height),.115,.008,dark,10),bone)
    for o,b in parts:bind(o,rig,b)


def reset_pose(rig):
    for b in rig.pose.bones:b.location=(0,0,0);b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.scale=(1,1,1)


def kr(rig,bone,frame,x=0,y=0,z=0):
    b=rig.pose.bones[bone];b.rotation_mode='XYZ';b.rotation_euler=(x,y,z);b.keyframe_insert('rotation_euler',frame=frame)


def kl(rig,bone,frame,x=0,y=0,z=0):
    b=rig.pose.bones[bone];b.location=(x,y,z);b.keyframe_insert('location',frame=frame)


def action(rig,name):
    reset_pose(rig);a=bpy.data.actions.new(name);rig.animation_data_create();rig.animation_data.action=a;return a


def stash(rig,a,end):
    t=rig.animation_data.nla_tracks.new();t.name=a.name;s=t.strips.new(a.name,1,a);s.action_frame_start=1;s.action_frame_end=end;t.mute=True


def wings(rig,frame,amount,fold=0,twist=0):
    for side_name,side in (('L',-1),('R',1)):
        kr(rig,f'Wing{side_name}1',frame,x=side*(-.10+amount*.62),y=fold*.22,z=side*(.04+twist))
        kr(rig,f'Wing{side_name}2',frame,x=side*(-.06+amount*.42),y=fold*.34,z=side*(-.05+twist*.45))
        kr(rig,f'Wing{side_name}3',frame,x=side*(-.03+amount*.22),y=fold*.48,z=side*(-.08+twist*.25))


def animate(rig):
    glide=action(rig,'Glide')
    for f,a in ((1,0),(30,.04),(60,0),(90,-.04),(120,0)):
        wings(rig,f,.04,0,a);kr(rig,'Chest',f,x=a*.22);kr(rig,'Neck1',f,y=-a*.18);kr(rig,'Tail2',f,y=a*.22)
        if f==120:stash(rig,glide,120)
    flap=action(rig,'Flap')
    for f,a in ((1,-.28),(7,.08),(13,.62),(19,.16),(25,-.28)):
        wings(rig,f,a,0,.03*math.sin(f));kl(rig,'Chest',f,z=-.105 if a>.5 else .02);kr(rig,'Spine',f,x=.045 if a>.5 else -.022);kr(rig,'Neck1',f,x=-.025 if a>.5 else .012);kr(rig,'Tail1',f,x=.018 if a>.5 else -.012)
    stash(rig,flap,25)
    climb=action(rig,'Climb')
    for f,a in ((1,0),(12,1),(30,1),(45,0)):
        wings(rig,f,.26*a,-.10*a,.04*a);kr(rig,'Chest',f,x=-.15*a);kr(rig,'Head',f,x=.11*a);kr(rig,'Tail1',f,x=.055*a)
    stash(rig,climb,45)
    dive=action(rig,'Dive')
    for f,a in ((1,0),(10,1),(42,1),(55,0)):
        wings(rig,f,-.05,.78*a,-.03*a);kr(rig,'Chest',f,x=.08*a);kr(rig,'Head',f,x=-.09*a);kr(rig,'Tail1',f,x=-.055*a)
    stash(rig,dive,55)
    brake=action(rig,'Brake')
    for f,a in ((1,0),(7,1),(24,1),(38,0)):
        wings(rig,f,.5*a,-.24*a,.18*a);kr(rig,'Chest',f,x=-.22*a);kr(rig,'Head',f,x=.14*a);kl(rig,'Root',f,y=.10*a);kr(rig,'Tail1',f,x=.08*a)
    stash(rig,brake,38)
    rig.animation_data.action=glide;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=120;bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(1)


def export(output):
    output.parent.mkdir(parents=True,exist_ok=True);bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_apply=True,export_animations=True,export_skins=True,export_morph=False,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False)
    if not output.exists() or output.stat().st_size<140000:raise RuntimeError(f'Dragon GLB unexpectedly small: {output}')


def main():
    args=parse_args();out=Path(args.output).resolve();clear();rig=create_rig();build(rig);animate(rig);export(out);print(f'AETHERWING dragon generated: {out} ({out.stat().st_size} bytes)')
if __name__=='__main__':main()
