import argparse, math, random, sys
from pathlib import Path
import bpy
from mathutils import Vector

random.seed(734921)

def parse_args():
    argv=sys.argv; argv=argv[argv.index('--')+1:] if '--' in argv else []
    p=argparse.ArgumentParser(); p.add_argument('--output',required=True); return p.parse_args(argv)

def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes,bpy.data.curves,bpy.data.materials,bpy.data.armatures,bpy.data.actions,bpy.data.images):
        for block in list(coll):
            if block.users==0: coll.remove(block)

def make_scale_image():
    w=h=256; img=bpy.data.images.new('Aetherwing_ScaleTexture',width=w,height=h,alpha=True)
    px=[]
    for y in range(h):
        for x in range(w):
            sx=x/18.0; sy=y/14.0
            cells=(math.sin(sx+math.sin(sy*.7)*1.4)*.5+.5)*(math.cos(sy*.9)*.5+.5)
            ridge=max(0,math.sin((x+y*.43)*.35))*0.12
            n=(random.random()-.5)*.045
            r=.16+cells*.08+ridge+n; g=.29+cells*.13+ridge*.5+n; b=.20+cells*.07+n*.4
            px.extend((max(0,min(1,r)),max(0,min(1,g)),max(0,min(1,b)),1))
    img.pixels=px; img.pack(); return img

def material(name,color,rough=.65,metal=.0,image=None,emission=None,alpha=1):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,alpha); m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(*color,1); bsdf.inputs['Roughness'].default_value=rough; bsdf.inputs['Metallic'].default_value=metal
    if image:
        tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image; tex.interpolation='Linear'; m.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    if emission:
        bsdf.inputs['Emission Color'].default_value=(*emission,1); bsdf.inputs['Emission Strength'].default_value=3.0
    if alpha<1:
        bsdf.inputs['Alpha'].default_value=alpha; m.surface_render_method='DITHERED'
    return m

def smooth(obj,mat=None,bevel=0):
    if mat: obj.data.materials.append(mat)
    if hasattr(obj.data,'polygons'):
        for p in obj.data.polygons:p.use_smooth=True
    if bevel:
        mod=obj.modifiers.new('organic bevel','BEVEL');mod.width=bevel;mod.segments=2;mod.limit_method='ANGLE'
    return obj

def apply_scale(obj):
    bpy.context.view_layer.objects.active=obj; obj.select_set(True); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); obj.select_set(False)

def uv(name,loc,scale,mat,segments=32,rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc);o=bpy.context.active_object;o.name=name;o.scale=scale;apply_scale(o);return smooth(o,mat)

def cone_between(name,a,b,r1,r2,mat,verts=18):
    a=Vector(a);b=Vector(b);d=b-a;bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=d.length,location=(a+b)*.5);o=bpy.context.active_object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');o.rotation_mode='XYZ';return smooth(o,mat,.02)

def create_rig():
    bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0));rig=bpy.context.active_object;rig.name='AetherwingRig';rig.data.name='AetherwingRigData';edit=rig.data.edit_bones
    for b in list(edit):edit.remove(b)
    def add(name,h,t,parent=None):
        b=edit.new(name);b.head=h;b.tail=t
        if parent:b.parent=edit[parent]
        return b
    add('Root',(0,1,0),(0,0,0));add('Spine',(0,.8,0),(0,-1.2,.12),'Root');add('Chest',(0,-1.2,.12),(0,-2.4,.38),'Spine');add('Neck1',(0,-2.4,.38),(0,-3.25,.65),'Chest');add('Neck2',(0,-3.25,.65),(0,-4.1,.72),'Neck1');add('Head',(0,-4.1,.72),(0,-5.15,.66),'Neck2')
    add('Tail1',(0,1.0,.02),(0,2.5,.0),'Root');add('Tail2',(0,2.5,0),(0,4.1,-.05),'Tail1');add('Tail3',(0,4.1,-.05),(0,5.65,-.12),'Tail2');add('Tail4',(0,5.65,-.12),(0,7.0,-.2),'Tail3')
    for side_name,side in (('L',-1),('R',1)):
        add(f'Wing{side_name}1',(side*1.0,-1.75,.55),(side*4.1,-1.55,.78),'Chest');add(f'Wing{side_name}2',(side*4.1,-1.55,.78),(side*7.0,-.95,.55),f'Wing{side_name}1');add(f'Wing{side_name}3',(side*7.0,-.95,.55),(side*9.1,.25,.2),f'Wing{side_name}2')
        add(f'FrontUpper{side_name}',(side*.78,-1.85,.15),(side*.9,-2.0,-1.05),'Chest');add(f'FrontLower{side_name}',(side*.9,-2.0,-1.05),(side*1.05,-2.35,-2.0),f'FrontUpper{side_name}');add(f'FrontFoot{side_name}',(side*1.05,-2.35,-2.0),(side*1.06,-2.85,-2.15),f'FrontLower{side_name}')
        add(f'HindUpper{side_name}',(side*.88,.65,-.05),(side*1.15,1.0,-1.1),'Root');add(f'HindLower{side_name}',(side*1.15,1.0,-1.1),(side*1.1,.35,-2.0),f'HindUpper{side_name}');add(f'HindFoot{side_name}',(side*1.1,.35,-2.0),(side*1.15,-.3,-2.12),f'HindLower{side_name}')
    bpy.ops.object.mode_set(mode='OBJECT');return rig

def bind(obj,rig,bone):
    world=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=world;mod=obj.modifiers.new('AetherwingArmature','ARMATURE');mod.object=rig;g=obj.vertex_groups.new(name=bone);g.add(list(range(len(obj.data.vertices))),1,'REPLACE')

def membrane(name,side,rig,mat):
    pts=[(side*1.1,-1.72,.54),(side*4.15,-1.55,.77),(side*7.05,-.95,.54),(side*9.05,.25,.18),(side*5.8,.65,-.15),(side*3.0,-.1,.02)]
    verts=pts;faces=[(0,1,5),(1,2,5),(2,4,5),(2,3,4)];me=bpy.data.meshes.new(name+'Mesh');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);smooth(o,mat)
    world=o.matrix_world.copy();o.parent=rig;o.matrix_world=world;mod=o.modifiers.new('AetherwingArmature','ARMATURE');mod.object=rig
    weights=[f'Wing{side and ("L" if side<0 else "R")}1',f'Wing{("L" if side<0 else "R")}1',f'Wing{("L" if side<0 else "R")}2',f'Wing{("L" if side<0 else "R")}3',f'Wing{("L" if side<0 else "R")}2',f'Wing{("L" if side<0 else "R")}1']
    for idx,bone in enumerate(weights):
        g=o.vertex_groups.get(bone) or o.vertex_groups.new(name=bone);g.add([idx],1,'REPLACE')
    sol=o.modifiers.new('Membrane thickness','SOLIDIFY');sol.thickness=.035;return o

def build(rig):
    scale_img=make_scale_image();scales=material('Deep green scales',(.17,.31,.21),.58,.02,scale_img);belly=material('Warm belly plates',(.38,.31,.17),.72);mem=material('Wing membrane',(.30,.20,.14),.6,.01,alpha=.96);horn=material('Horn and claw',(.20,.18,.14),.52);eye=material('Amber eyes',(.8,.35,.04),.26,emission=(1,.18,.02));dark=material('Dorsal scales',(.09,.18,.13),.7)
    parts=[]
    def add(o,b):parts.append((o,b));return o
    add(uv('Dragon_Body',(0,0,.05),(1.55,3.0,1.18),scales,40,24),'Spine');add(uv('Dragon_Chest',(0,-1.6,.28),(1.72,1.75,1.35),scales,40,24),'Chest')
    add(cone_between('Dragon_Neck1',(0,-2.0,.45),(0,-3.25,.66),.95,.65,scales,24),'Neck1');add(cone_between('Dragon_Neck2',(0,-3.2,.66),(0,-4.22,.73),.66,.50,scales,24),'Neck2')
    add(uv('Dragon_Head',(0,-4.72,.69),(.82,1.08,.72),scales,36,22),'Head');add(uv('Dragon_Muzzle',(0,-5.55,.48),(.62,.82,.42),belly,32,18),'Head')
    for side in (-1,1):
        add(uv(f'Dragon_Eye_{side}',(side*.36,-5.08,1.02),(.10,.14,.10),eye,20,12),'Head');add(cone_between(f'Dragon_Horn_{side}',(side*.34,-4.55,1.26),(side*.56,-3.88,1.73),.16,.015,horn,12),'Head')
    for i,(a,b,r1,r2,bone) in enumerate([((0,1.5,.02),(0,2.8,0),1.1,.82,'Tail1'),((0,2.7,0),(0,4.2,-.05),.84,.57,'Tail2'),((0,4.1,-.05),(0,5.7,-.12),.58,.32,'Tail3'),((0,5.6,-.12),(0,7.05,-.2),.34,.06,'Tail4')]):add(cone_between(f'Dragon_Tail_{i}',a,b,r1,r2,scales,24),bone)
    for side_name,side in (('L',-1),('R',1)):
        add(cone_between(f'Dragon_WingArm_{side_name}1',(side*1.05,-1.75,.58),(side*4.2,-1.55,.8),.32,.22,scales,18),f'Wing{side_name}1');add(cone_between(f'Dragon_WingArm_{side_name}2',(side*4.1,-1.55,.78),(side*7.05,-.95,.55),.22,.15,scales,16),f'Wing{side_name}2');add(cone_between(f'Dragon_WingFinger_{side_name}',(side*7.0,-.95,.54),(side*9.1,.25,.18),.15,.04,horn,14),f'Wing{side_name}3');membrane(f'Dragon_WingMembrane_{side_name}',side,rig,mem)
        for prefix,y,upper,lower,foot in [('Front',-1.7,f'FrontUpper{side_name}',f'FrontLower{side_name}',f'FrontFoot{side_name}'),('Hind',.75,f'HindUpper{side_name}',f'HindLower{side_name}',f'HindFoot{side_name}')]:
            if prefix=='Front':a=(side*.75,-1.65,.1);b=(side*.9,-2.02,-1.05);c=(side*1.04,-2.35,-2.0);d=(side*1.06,-2.9,-2.12)
            else:a=(side*.85,.7,-.08);b=(side*1.14,1.0,-1.1);c=(side*1.08,.34,-2.0);d=(side*1.18,-.32,-2.1)
            add(cone_between(f'Dragon_{prefix}Upper_{side_name}',a,b,.33,.24,scales,18),upper);add(cone_between(f'Dragon_{prefix}Lower_{side_name}',b,c,.24,.15,scales,18),lower);add(cone_between(f'Dragon_{prefix}Foot_{side_name}',c,d,.16,.08,horn,14),foot)
            for claw in (-.16,0,.16):add(cone_between(f'Dragon_{prefix}Claw_{side_name}_{claw}',d,(d[0]+side*claw,d[1]-.35,d[2]-.08),.055,.006,horn,10),foot)
    for i,y in enumerate([1.8,1.15,.5,-.2,-.9,-1.55,-2.18,-2.8,-3.45]):
        z=1.1+(.35 if i>4 else .2);bone='Tail1' if y>1.2 else 'Spine' if y>-.8 else 'Chest' if y>-2.4 else 'Neck1';add(cone_between(f'Dragon_Dorsal_{i}',(0,y,z),(0,y,z+.55-(i*.02)),.17,.01,dark,10),bone)
    for o,b in parts:bind(o,rig,b)

def reset_pose(rig):
    for b in rig.pose.bones:b.location=(0,0,0);b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.scale=(1,1,1)

def kr(rig,bone,frame,x=0,y=0,z=0):
    b=rig.pose.bones[bone];b.rotation_mode='XYZ';b.rotation_euler=(x,y,z);b.keyframe_insert('rotation_euler',frame=frame)

def kl(rig,bone,frame,x=0,y=0,z=0):
    b=rig.pose.bones[bone];b.location=(x,y,z);b.keyframe_insert('location',frame=frame)

def action(rig,name):reset_pose(rig);a=bpy.data.actions.new(name);rig.animation_data_create();rig.animation_data.action=a;return a

def stash(rig,a,end):
    t=rig.animation_data.nla_tracks.new();t.name=a.name;s=t.strips.new(a.name,1,a);s.action_frame_start=1;s.action_frame_end=end;t.mute=True

def wings(rig,frame,amount,fold=0,twist=0):
    for side_name,side in (('L',-1),('R',1)):
        kr(rig,f'Wing{side_name}1',frame,x=side*(-.10+amount*.62),y=fold*.22,z=side*(.04+twist));kr(rig,f'Wing{side_name}2',frame,x=side*(-.06+amount*.42),y=fold*.34,z=side*(-.05+twist*.45));kr(rig,f'Wing{side_name}3',frame,x=side*(-.03+amount*.22),y=fold*.48,z=side*(-.08+twist*.25))

def animate(rig):
    glide=action(rig,'Glide')
    for f,a in ((1,0),(30,.04),(60,0),(90,-.04),(120,0)):wings(rig,f,.05,0,a);kr(rig,'Chest',f,x=a*.25);stash(rig,glide,120) if f==120 else None
    flap=action(rig,'Flap')
    for f,a in ((1,-.28),(7,.08),(13,.62),(19,.16),(25,-.28)):wings(rig,f,a,0,.03*math.sin(f));kl(rig,'Chest',f,z=-.10 if a>.5 else .02);kr(rig,'Spine',f,x=.04 if a>.5 else -.02)
    stash(rig,flap,25)
    climb=action(rig,'Climb')
    for f,a in ((1,0),(12,1),(30,1),(45,0)):wings(rig,f,.26*a,-.10*a,.04*a);kr(rig,'Chest',f,x=-.15*a);kr(rig,'Head',f,x=.11*a)
    stash(rig,climb,45)
    dive=action(rig,'Dive')
    for f,a in ((1,0),(10,1),(42,1),(55,0)):wings(rig,f,-.05,.78*a,-.03*a);kr(rig,'Chest',f,x=.08*a);kr(rig,'Head',f,x=-.09*a)
    stash(rig,dive,55)
    brake=action(rig,'Brake')
    for f,a in ((1,0),(7,1),(24,1),(38,0)):wings(rig,f,.5*a,-.24*a,.18*a);kr(rig,'Chest',f,x=-.22*a);kr(rig,'Head',f,x=.14*a);kl(rig,'Root',f,y=.10*a)
    stash(rig,brake,38)
    rig.animation_data.action=glide;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=120;bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(1)

def export(output):
    output.parent.mkdir(parents=True,exist_ok=True);bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_apply=True,export_animations=True,export_skins=True,export_morph=False,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False)
    if not output.exists() or output.stat().st_size<120000:raise RuntimeError(f'Dragon GLB unexpectedly small: {output}')

def main():
    args=parse_args();out=Path(args.output).resolve();clear();rig=create_rig();build(rig);animate(rig);export(out);print(f'AETHERWING dragon generated: {out} ({out.stat().st_size} bytes)')
if __name__=='__main__':main()
