from pathlib import Path
import math, sys
sys.path.insert(0,str(Path(__file__).parent))
import bpy
from forge_common import parse_args, clear_scene, painted_material, export_glb, bevel

def part(name,loc,scale,mat,roundness=.06):
    bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object; o.name=name; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); bevel(o,roundness,2); o.data.materials.append(mat); return o

def head(name,loc,scale,mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=loc); o=bpy.context.object; o.name=name; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat); return o

def rig(name):
    data=bpy.data.armatures.new(name+'Armature'); r=bpy.data.objects.new(name+'Rig',data); bpy.context.collection.objects.link(r); bpy.context.view_layer.objects.active=r; r.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    def bone(n,h,t,p=None):
        b=data.edit_bones.new(n);b.head=h;b.tail=t;b.parent=data.edit_bones[p] if p else None;return b
    bone('root',(0,0,0),(0,0,.28));bone('pelvis',(0,0,.86),(0,0,1.15),'root');bone('body',(0,0,1.15),(0,0,1.78),'pelvis');bone('head',(0,0,1.78),(0,0,2.18),'body')
    for s,sgn in [('L',1),('R',-1)]:
        bone(f'arm_{s}',(sgn*.2,0,1.65),(sgn*.62,0,1.42),'body');bone(f'forearm_{s}',(sgn*.62,0,1.42),(sgn*.9,0,1.18),f'arm_{s}');bone(f'thigh_{s}',(sgn*.17,0,.9),(sgn*.18,0,.47),'pelvis');bone(f'shin_{s}',(sgn*.18,0,.47),(sgn*.18,0,.08),f'thigh_{s}')
    bpy.ops.object.mode_set(mode='POSE')
    for p in r.pose.bones:p.rotation_mode='XYZ'
    bpy.ops.object.mode_set(mode='OBJECT');return r

def bind(o,r,b): w=o.matrix_world.copy();o.parent=r;o.parent_type='BONE';o.parent_bone=b;o.matrix_world=w

def build_person(r):
    warm=painted_material('Face_Warm',(.58,.34,.22),.82,seed=70,accent=(.72,.45,.3));coat=painted_material('Cloth_Coat',(.24,.16,.10),.94,seed=71,accent=(.42,.27,.14));shirt=painted_material('Cloth_Shirt',(.58,.26,.13),.96,seed=72,accent=(.78,.38,.18));leather=painted_material('Leather_Harness',(.19,.09,.045),.72,seed=73,accent=(.35,.17,.07));copper=painted_material('Copper_Tools',(.45,.25,.10),.45,.65,seed=74,accent=(.72,.38,.14));dark=painted_material('Hair_Dark',(.055,.035,.025),.96,seed=75,accent=(.12,.08,.05));glow=painted_material('Ceramic_Badge',(.33,.76,.66),.32,.05,seed=76,accent=(.7,1,.9),emission=(.08,.5,.42))
    pieces=[(part('Pelvis',(0,0,.98),(.28,.18,.20),coat),'pelvis'),(part('Torso',(0,0,1.43),(.38,.22,.46),shirt,.09),'body'),(part('CoatTail',(0,.08,1.02),(.36,.10,.34),coat,.05),'pelvis'),(head('Head',(0,-.01,1.98),(.25,.23,.29),warm),'head'),(head('Hair',(0,.03,2.13),(.27,.24,.14),dark),'head')]
    for s,sgn in [('L',1),('R',-1)]: pieces += [(part(f'UpperArm_{s}',(sgn*.43,0,1.53),(.18,.18,.30),coat,.08),f'arm_{s}'),(part(f'Forearm_{s}',(sgn*.73,0,1.31),(.15,.15,.27),shirt,.07),f'forearm_{s}'),(part(f'Thigh_{s}',(sgn*.17,0,.67),(.17,.19,.30),coat,.07),f'thigh_{s}'),(part(f'Shin_{s}',(sgn*.18,0,.27),(.15,.17,.28),leather,.06),f'shin_{s}')]
    pieces += [(part('ShoulderPlate',(.39,.01,1.68),(.22,.23,.08),copper,.08),'arm_L'),(part('Satchel',(-.42,.18,1.08),(.25,.13,.31),leather,.08),'pelvis'),(head('Badge',(.17,-.23,1.55),(.08,.04,.08),glow),'body'),(part('TuningFork',(-.92,-.04,1.12),(.035,.035,.32),copper,.02),'forearm_R')]
    for o,b in pieces:bind(o,r,b)

def build_warden(r):
    iron=painted_material('Warden_Iron',(.06,.08,.09),.42,.82,seed=90,accent=(.16,.20,.19));copper=painted_material('Warden_Copper',(.42,.22,.08),.4,.75,seed=91,accent=(.72,.38,.12));verd=painted_material('Warden_Verdigris',(.08,.38,.35),.58,.45,seed=92,accent=(.18,.62,.55));eye=painted_material('Warden_Eye',(.68,.18,.08),.24,.08,seed=93,accent=(1,.4,.12),emission=(.85,.08,.02))
    pieces=[(part('Body',(0,0,1.35),(.39,.28,.53),iron,.12),'body'),(part('ChestPlate',(0,-.29,1.42),(.34,.07,.34),verd,.08),'body'),(head('Head',(0,0,1.94),(.29,.25,.26),copper),'head'),(head('Eye',(0,-.24,1.94),(.13,.04,.08),eye),'head')]
    for s,sgn in [('L',1),('R',-1)]: pieces += [(part(f'Arm_{s}',(sgn*.49,0,1.48),(.18,.18,.35),copper,.09),f'arm_{s}'),(part(f'Forearm_{s}',(sgn*.79,0,1.22),(.16,.16,.30),iron,.08),f'forearm_{s}'),(part(f'Thigh_{s}',(sgn*.19,0,.68),(.19,.22,.31),iron,.08),f'thigh_{s}'),(part(f'Shin_{s}',(sgn*.20,0,.27),(.17,.20,.28),copper,.07),f'shin_{s}')]
    for o,b in pieces:bind(o,r,b)

def reset(r):
    for b in r.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
def action(r,n):reset(r);a=bpy.data.actions.new(n);r.animation_data_create();r.animation_data.action=a;return a
def key(r,b,f,x=0,y=0,z=0):p=r.pose.bones[b];p.rotation_euler=(x,y,z);p.keyframe_insert('rotation_euler',frame=f,group=b)
def lift(r,b,f,z=0):p=r.pose.bones[b];p.location=(0,0,z);p.keyframe_insert('location',frame=f,group=b)
def stash(r,a,e):t=r.animation_data.nla_tracks.new();t.name=a.name;s=t.strips.new(a.name,1,a);s.action_frame_start=1;s.action_frame_end=e;t.mute=True

def animate(r,warden=False):
    idle=action(r,'Idle')
    for f,p in [(1,0),(24,1),(48,0),(72,-1),(96,0)]:lift(r,'body',f,.018*p);key(r,'head',f,y=.04*p,z=.025*p)
    stash(r,idle,96)
    for name,amp,frames in [('Walk',.5,[1,9,17,25,33]),('Run',.78,[1,6,11,16,21])]:
        a=action(r,name);end=frames[-1]
        for f in frames:
            t=(f-1)/max(1,end-1)*math.tau;lift(r,'pelvis',f,(.025 if name=='Walk' else .055)*abs(math.sin(t)))
            for s,ph in [('L',0),('R',math.pi)]:q=math.sin(t+ph);key(r,f'thigh_{s}',f,x=amp*q);key(r,f'shin_{s}',f,x=-amp*.7*max(0,q));key(r,f'arm_{s}',f,x=-amp*.65*q);key(r,f'forearm_{s}',f,x=-amp*.25*abs(q))
        stash(r,a,end)
    talk=action(r,'Point' if warden else 'Talk')
    for f,p in [(1,0),(9,1),(24,1),(36,0)]:key(r,'arm_R',f,x=-.95*p,z=-.34*p);key(r,'forearm_R',f,x=-.48*p);key(r,'head',f,y=-.08*p)
    stash(r,talk,36)
    gesture=action(r,'Gesture')
    for f,p in [(1,0),(8,1),(18,1),(28,0)]:key(r,'arm_L',f,x=-.62*p,z=.42*p);key(r,'forearm_L',f,x=-.7*p)
    stash(r,gesture,28);r.animation_data.action=idle;bpy.context.scene.frame_end=96;bpy.context.scene.render.fps=30

def main():
    args=parse_args();clear_scene();is_warden='warden' in Path(args.output).name.lower();r=rig('Warden' if is_warden else 'Bellwright');build_warden(r) if is_warden else build_person(r);animate(r,is_warden);export_glb(args.output,animations=True)
if __name__=='__main__':main()
