import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def mat(name, color, metallic=0.0, roughness=0.6):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.metallic=metallic
    m.roughness=roughness
    return m


def finish(obj, material, smooth=True, bevel=0):
    if material: obj.data.materials.append(material)
    if smooth and hasattr(obj.data,'polygons'):
        for p in obj.data.polygons: p.use_smooth=True
    if bevel:
        mod=obj.modifiers.new('Soft edge','BEVEL'); mod.width=bevel; mod.segments=2; mod.limit_method='ANGLE'
    return obj


def apply_scale(obj):
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def uv(name, loc, scale, material, segments=28, rings=18):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj=bpy.context.active_object; obj.name=name; obj.scale=scale; apply_scale(obj)
    return finish(obj,material)


def cube(name, loc, scale, material, rot=(0,0,0), bevel=.04):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj=bpy.context.active_object; obj.name=name; obj.scale=scale; apply_scale(obj)
    return finish(obj,material,smooth=False,bevel=bevel)


def between(name,start,end,r1,r2,material,vertices=18):
    a=Vector(start); b=Vector(end); d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=d.length,location=(a+b)*.5)
    obj=bpy.context.active_object; obj.name=name; obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=d.to_track_quat('Z','Y'); obj.rotation_mode='XYZ'
    return finish(obj,material,bevel=.02)


def create_rig():
    bpy.ops.object.armature_add(enter_editmode=True, location=(0,0,0))
    rig=bpy.context.active_object; rig.name='TravelerRig'; rig.data.name='TravelerRigData'
    edit=rig.data.edit_bones
    for b in list(edit): edit.remove(b)
    def add(name,head,tail,parent=None):
        b=edit.new(name); b.head=head; b.tail=tail
        if parent: b.parent=edit[parent]
        return b
    add('root',(0,0,0),(0,0,.18))
    add('pelvis',(0,0,.78),(0,0,1.0),'root')
    add('spine',(0,0,1.0),(0,0,1.34),'pelvis')
    add('chest',(0,0,1.34),(0,0,1.57),'spine')
    add('head',(0,0,1.57),(0,0,1.88),'chest')
    for side_name,side in (('L',-1),('R',1)):
        add(f'upperarm_{side_name}',(side*.22,0,1.50),(side*.52,0,1.28),'chest')
        add(f'forearm_{side_name}',(side*.52,0,1.28),(side*.72,0,1.02),f'upperarm_{side_name}')
        add(f'hand_{side_name}',(side*.72,0,1.02),(side*.78,0,.91),f'forearm_{side_name}')
        add(f'thigh_{side_name}',(side*.13,0,.80),(side*.18,0,.42),'pelvis')
        add(f'shin_{side_name}',(side*.18,0,.42),(side*.17,0,.08),f'thigh_{side_name}')
        add(f'foot_{side_name}',(side*.17,0,.08),(side*.17,-.18,.04),f'shin_{side_name}')
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind(obj,rig,bone):
    world=obj.matrix_world.copy(); obj.parent=rig; obj.matrix_world=world
    mod=obj.modifiers.new('TravelerArmature','ARMATURE'); mod.object=rig
    group=obj.vertex_groups.new(name=bone); group.add(list(range(len(obj.data.vertices))),1,'REPLACE')


def build(rig):
    coat=mat('Storm coat',(0.075,0.10,0.11),.02,.74)
    cloth=mat('Inner cloth',(0.17,0.19,0.18),.01,.83)
    leather=mat('Harness leather',(0.18,0.10,0.055),.03,.68)
    metal=mat('Harness metal',(0.30,0.32,0.29),.64,.38)
    skin=mat('Skin',(0.48,0.34,0.26),.0,.76)
    visor=mat('Visor',(0.12,0.33,0.34),.12,.22)
    meshes=[]
    def add(obj,bone): meshes.append((obj,bone)); return obj
    add(uv('Traveler_Torso',(0,0,1.30),(.28,.18,.42),coat,32,20),'spine')
    add(cube('Traveler_ChestPlate',(0,-.05,1.43),(.25,.13,.22),metal,bevel=.035),'chest')
    add(uv('Traveler_Hood',(0,0,1.68),(.24,.22,.27),coat,30,18),'head')
    add(uv('Traveler_Head',(0,-.02,1.69),(.17,.15,.20),skin,28,18),'head')
    add(cube('Traveler_Visor',(0,-.15,1.72),(.15,.035,.075),visor,rot=(-.08,0,0),bevel=.02),'head')
    add(cube('Traveler_Backpack',(0,.17,1.31),(.22,.13,.30),leather,bevel=.045),'chest')
    add(cube('Traveler_Harness',(0,-.16,1.24),(.24,.035,.035),leather,bevel=.02),'spine')
    for side_name,side in (('L',-1),('R',1)):
        add(between(f'Traveler_UpperArm_{side_name}',(side*.24,0,1.49),(side*.51,0,1.28),.10,.085,coat),f'upperarm_{side_name}')
        add(between(f'Traveler_Forearm_{side_name}',(side*.51,0,1.28),(side*.72,0,1.03),.085,.065,cloth),f'forearm_{side_name}')
        add(uv(f'Traveler_Hand_{side_name}',(side*.75,-.01,.97),(.075,.06,.10),skin,20,12),f'hand_{side_name}')
        add(between(f'Traveler_Thigh_{side_name}',(side*.13,0,.78),(side*.18,0,.42),.115,.095,coat),f'thigh_{side_name}')
        add(between(f'Traveler_Shin_{side_name}',(side*.18,0,.42),(side*.17,0,.10),.09,.07,cloth),f'shin_{side_name}')
        add(cube(f'Traveler_Boot_{side_name}',(side*.17,-.075,.065),(.095,.18,.075),leather,bevel=.025),f'foot_{side_name}')
        add(cube(f'Traveler_ShoulderGuard_{side_name}',(side*.27,0,1.49),(.13,.15,.10),metal,rot=(0,0,side*.16),bevel=.03),f'upperarm_{side_name}')
    for i,side in enumerate((-1,1),1):
        add(between(f'Traveler_ScarfTail_{i}',(side*.08,.11,1.47),(side*.15,.33,1.05),.045,.025,cloth), 'chest')
    for obj,bone in meshes: bind(obj,rig,bone)


def reset_pose(rig):
    for b in rig.pose.bones:
        b.location=(0,0,0); b.rotation_mode='XYZ'; b.rotation_euler=(0,0,0); b.scale=(1,1,1)


def kr(rig,bone,frame,x=0,y=0,z=0):
    b=rig.pose.bones[bone]; b.rotation_mode='XYZ'; b.rotation_euler=(x,y,z); b.keyframe_insert('rotation_euler',frame=frame)


def kl(rig,bone,frame,x=0,y=0,z=0):
    b=rig.pose.bones[bone]; b.location=(x,y,z); b.keyframe_insert('location',frame=frame)


def new_action(rig,name):
    reset_pose(rig); a=bpy.data.actions.new(name); rig.animation_data_create(); rig.animation_data.action=a; return a


def stash(rig,a,end):
    t=rig.animation_data.nla_tracks.new(); t.name=a.name; s=t.strips.new(a.name,1,a); s.action_frame_start=1; s.action_frame_end=end; t.mute=True


def gait(rig,frame,t,speed=1.0):
    s=math.sin(t); c=math.cos(t); bob=abs(math.sin(t))*0.025*speed
    kl(rig,'pelvis',frame,z=bob)
    kr(rig,'pelvis',frame,z=.025*s*speed)
    kr(rig,'spine',frame,x=.03*math.sin(t*2)*speed,z=-.018*s)
    kr(rig,'chest',frame,z=-.02*s)
    for side_name,phase in (('L',0),('R',math.pi)):
        sw=math.sin(t+phase); lift=max(0,math.cos(t+phase))
        kr(rig,f'thigh_{side_name}',frame,x=.48*sw*speed)
        kr(rig,f'shin_{side_name}',frame,x=-.55*lift*speed+.10*sw)
        kr(rig,f'foot_{side_name}',frame,x=.18*lift)
        kr(rig,f'upperarm_{side_name}',frame,x=-.38*sw*speed,z=(.05 if side_name=='L' else -.05)*sw)
        kr(rig,f'forearm_{side_name}',frame,x=.16*max(0,-sw))


def animate(rig):
    idle=new_action(rig,'Idle')
    for frame,phase in ((1,0),(20,1),(40,0),(60,-1),(80,0)):
        kl(rig,'chest',frame,z=.012*phase); kr(rig,'head',frame,y=.035*phase); kr(rig,'upperarm_L',frame,z=.018*phase); kr(rig,'upperarm_R',frame,z=-.018*phase)
    stash(rig,idle,80)

    walk=new_action(rig,'Walk')
    for frame in (1,7,13,19,25,31,37): gait(rig,frame,(frame-1)/36*math.tau,.72)
    stash(rig,walk,37)

    run=new_action(rig,'Run')
    for frame in (1,5,9,13,17,21,25): gait(rig,frame,(frame-1)/24*math.tau,1.22)
    stash(rig,run,25)

    brace=new_action(rig,'Brace')
    for frame,a in ((1,0),(10,1),(28,1),(40,0)):
        kr(rig,'spine',frame,x=.20*a); kr(rig,'chest',frame,x=.12*a); kr(rig,'thigh_L',frame,x=-.18*a,z=.12*a); kr(rig,'thigh_R',frame,x=.12*a,z=-.10*a)
        kr(rig,'upperarm_L',frame,x=-.62*a,z=-.30*a); kr(rig,'forearm_L',frame,x=-.45*a); kr(rig,'upperarm_R',frame,x=-.55*a,z=.22*a); kr(rig,'forearm_R',frame,x=-.38*a)
    stash(rig,brace,40)

    hang=new_action(rig,'Hang')
    for frame,a in ((1,0),(8,1),(30,1),(42,0)):
        kr(rig,'chest',frame,x=.18*a); kr(rig,'upperarm_L',frame,x=-1.45*a,z=-.35*a); kr(rig,'upperarm_R',frame,x=-1.45*a,z=.35*a); kr(rig,'forearm_L',frame,x=-.55*a); kr(rig,'forearm_R',frame,x=-.55*a); kr(rig,'thigh_L',frame,x=.18*a); kr(rig,'thigh_R',frame,x=-.16*a)
    stash(rig,hang,42)

    climb=new_action(rig,'Climb')
    for frame,a in ((1,0),(8,.55),(16,1),(26,.45),(38,0)):
        kl(rig,'root',frame,z=.18*a); kr(rig,'spine',frame,x=.34*a); kr(rig,'upperarm_L',frame,x=-1.25*a,z=-.18*a); kr(rig,'forearm_L',frame,x=-.75*a); kr(rig,'thigh_R',frame,x=-.65*a); kr(rig,'shin_R',frame,x=.55*a)
    stash(rig,climb,38)

    fall=new_action(rig,'Fall')
    for frame,a in ((1,0),(8,1),(24,1),(36,0)):
        kr(rig,'spine',frame,x=-.18*a); kr(rig,'upperarm_L',frame,x=-.5*a,z=-.65*a); kr(rig,'upperarm_R',frame,x=-.5*a,z=.65*a); kr(rig,'thigh_L',frame,x=.28*a,z=.16*a); kr(rig,'thigh_R',frame,x=-.22*a,z=-.14*a)
    stash(rig,fall,36)

    rig.animation_data.action=idle
    bpy.context.scene.frame_start=1; bpy.context.scene.frame_end=80; bpy.context.scene.render.fps=30; bpy.context.scene.frame_set(1)


def export_glb(output):
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_animations=True,export_skins=True,export_morph=False,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False)
    if not output.exists() or output.stat().st_size < 35_000: raise RuntimeError(f'Player GLB unexpectedly small: {output}')


def main():
    args=parse_args(); output=Path(args.output).resolve(); clear_scene(); rig=create_rig(); build(rig); animate(rig); export_glb(output); print(f'COLOSSUS traveler generated {output} ({output.stat().st_size} bytes)')


if __name__=='__main__': main()
