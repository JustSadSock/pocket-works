"""Focused sword character: frozen source action, actual child-axis IK, measured render deformation.
No production atlas writes. One camera, one model, two actions."""
import bpy,os,math,json
from pathlib import Path
from mathutils import Vector,Matrix
# Reuse only the existing model/material setup; no production execution.
source=Path(__file__).resolve().parents[1]/"troop-bake.py"
os.environ["BOW_TROOP"]="sword"
exec(compile(source.read_text().split("def infantry_preview():",1)[0],str(source),"exec"))
folder=out/"focused";folder.mkdir(exist_ok=True)
sc.render.resolution_x=sc.render.resolution_y=320;sc.cycles.samples=4
sc.render.image_settings.file_format="PNG";cam.data.ortho_scale=3.65
target=Vector((0,0,1.02));cam.location=target+Vector((4,-5,2.3));look(cam,target)
livery(0)
hips=bone("Hips","Pelvis","Root")
feet=[(RH,RK,bone("RightFoot","footr")),(LH,LK,bone("LeftFoot","footl"))]
arms=[(RU,RF,R),(LU,LF,L)]
watch=[hips,torso,RU,RF,R,LU,LF,L]+[b for leg in feet for b in leg]
def vec(v):return [float(x) for x in v]
def mat(m):return [vec(row) for row in m]
def snap():
    bpy.context.view_layer.update()
    return {b.name:{"basis":mat(b.matrix_basis),"pose":mat(b.matrix),"worldHead":vec(point(b))} for b in watch}
def mesh_points():return vertices(core)
def mesh_delta(a,b):
    if len(a)!=len(b):raise ValueError("Evaluated mesh topology mismatch")
    ds=[(x-y).length for x,y in zip(a,b)]
    return {"rms":math.sqrt(sum(x*x for x in ds)/len(ds)),"max":max(ds),"changedOver2cm":sum(x>.02 for x in ds),"vertices":len(ds)}
def rotate_axis(b,axis,desired):
    if axis.length<.001 or Vector(desired).length<.001:raise ValueError("Degenerate aim "+b.name)
    inv=rig.matrix_world.inverted().to_3x3();q=(inv@axis).normalized().rotation_difference((inv@Vector(desired)).normalized())
    m=b.matrix.copy();p=m.translation.copy();m=q.to_matrix().to_4x4()@m;m.translation=p;b.matrix=m;bpy.context.view_layer.update()
def align_child(parent,child,desired):rotate_axis(parent,point(child)-point(parent),Vector(desired))
def limb(upper,lower,end,target,bend):
    a,b,c=point(upper),point(lower),point(end);l1=(b-a).length;l2=(c-b).length;d=Vector(target)-a
    if min(l1,l2,d.length)<.01:raise ValueError("Invalid limb "+upper.name)
    v=d.normalized();r=max(abs(l1-l2)+.003,min(d.length,l1+l2-.003))
    p=Vector(bend)-v*Vector(bend).dot(v)
    if p.length<.001:raise ValueError("Invalid bend")
    u=(l1*l1-l2*l2+r*r)/(2*r);mid=a+v*u+p.normalized()*math.sqrt(max(0,l1*l1-u*u))
    align_child(upper,lower,mid-a);align_child(lower,end,a+v*r-point(lower))
    return (point(end)-(a+v*r)).length
def blade():
    pts=vertices([o for o in weapon if o.name.startswith("Forged sword blade")])
    return sum(pts,Vector((0,0,0)))/len(pts)
# Reproduce the old order and prove whether it survives a forced frame evaluation.
sc.frame_set(1);bpy.context.view_layer.update();old0=snap();mesh0=mesh_points()
old_action=rig.animation_data.action if rig.animation_data else None
probe=RU.matrix.copy();q=Matrix.Rotation(.9,4,'X');p0=probe.translation.copy();probe=q@probe;probe.translation=p0;RU.matrix=probe
bpy.context.view_layer.update();old1=snap();mesh1=mesh_points()
sc.frame_set(1);bpy.context.view_layer.update();old2=snap();mesh2=mesh_points()
binding={}
for o in core:
    groups={g.index:g.name for g in o.vertex_groups}
    counts={}
    for v in o.data.vertices:
        for g in v.groups:
            if g.weight>.001:counts[groups[g.group]]=counts.get(groups[g.group],0)+1
    binding[o.name]={"weights":counts,"modifiers":[{"type":m.type,"target":getattr(getattr(m,"object",None),"name",None)} for m in o.modifiers]}
audit={"originalAction":old_action.name if old_action else None,"sourceConstraints":{b.name:[{"name":c.name,"type":c.type,"mute":c.mute,"influence":c.influence} for c in b.constraints] for b in rig.pose.bones},"drivers":[f.data_path for f in rig.animation_data.drivers] if rig.animation_data else [],"nla":[t.name for t in rig.animation_data.nla_tracks] if rig.animation_data else [],"binding":binding,"oldOrder":{"before":old0,"afterEdit":old1,"afterFrameSet":old2,"editMeshDelta":mesh_delta(mesh0,mesh1),"resetMeshDelta":mesh_delta(mesh0,mesh2)}}
def save(): (folder/"pose-audit.json").write_text(json.dumps(audit,indent=2))
save()
# Preserve evaluated starting pose then remove the conflicting animation source
# in this disposable Blender scene only. Explicitly verify no re-evaluation loss.
base={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
rig.animation_data_clear()
for b in rig.pose.bones:
    for c in b.constraints:c.mute=True
def reset():
    sc.frame_set(1)
    for b in rig.pose.bones:b.matrix_basis=base[b.name].copy()
    bpy.context.view_layer.update()
reset()
sign=1 if point(R).x>point(L).x else -1
hip0=point(hips).copy();ankles=[point(end).copy() for _,_,end in feet]
shoulders=[point(upper).copy() for upper,_,_ in arms]
foot_world=[rig.matrix_world@leg[2].matrix for leg in feet]
def shift_hips(delta):
    m=hips.matrix.copy();m.translation+=rig.matrix_world.inverted().to_3x3()@Vector(delta);hips.matrix=m;bpy.context.view_layer.update()
def foot_orientation(i,angle):
    b=feet[i][2];m=rig.matrix_world.inverted()@Matrix.Rotation(angle,4,'X')@foot_world[i]
    m.translation=b.matrix.translation;b.matrix=m;bpy.context.view_layer.update()
def hand_target(i,offset):
    upper,lower,end=arms[i];return limb(upper,lower,end,point(upper)+Vector((offset[0]*sign,offset[1],offset[2])),(sign if i==0 else -sign,.12,-.35))
def weapon_aim(v):rotate_axis(R,blade()-point(R),Vector((v[0]*sign,v[1],v[2])))
def sample_keys(t,keys):
    i=next((i for i in range(len(keys)-1) if t<=keys[i+1][0]),len(keys)-2);a,b=keys[i:i+2];f=(t-a[0])/(b[0]-a[0]);f=f*f*(3-2*f)
    return [tuple(x+(y-x)*f for x,y in zip(v,w)) for v,w in zip(a[1:],b[1:])]
# Distinct load, acceleration, impact, follow-through and return.
keys=[
 (0,(.30,-.28,-.23),(-.20,-.38,-.12),(.15,-.65,.75),(0,0,0)),
 (.22,(.40,.04,.20),(-.24,-.42,-.13),(.48,.25,.84),(.055,.07,-.045)),
 (.37,(.40,-.12,.31),(-.22,-.47,-.08),(.36,-.25,.89),(.045,.01,-.065)),
 (.51,(-.12,-.56,-.02),(-.20,-.34,-.10),(-.85,-.50,-.10),(-.07,-.17,-.095)),
 (.66,(-.31,-.25,-.29),(-.23,-.40,-.13),(-.65,-.36,-.67),(-.04,-.11,-.07)),
 (1,(.30,-.28,-.23),(-.20,-.38,-.12),(.15,-.65,.75),(0,0,0))]
audit["samples"]={};reference={}
for motion,count in (("march",12),("strike",12)):
    samples=[];audit["samples"][motion]=samples
    for i in range(count):
        reset();phase=i/count;errors=[]
        if motion=="march":
            shift_hips((.025*sign*math.sin(2*math.pi*phase),0,-.035+.024*math.cos(4*math.pi*phase)))
            for j,(upper,lower,end) in enumerate(feet):
                t=(phase+j*.5)%1
                # Support half sweeps back along the ground; swing clears ground.
                y=-.26+1.04*t if t<.5 else .26-1.04*(t-.5)
                lift=0 if t<.5 else .14*math.sin(math.pi*(t-.5)*2)
                target=ankles[j]+Vector((0,y,lift))
                errors.append(limb(upper,lower,end,target,(0,-1,0)));foot_orientation(j,0 if t<.5 else -.22*math.sin(2*math.pi*(t-.5)))
            wave=math.sin(phase*2*math.pi)
            errors.append(hand_target(0,(.26,-.19+.12*wave,-.35)))
            errors.append(hand_target(1,(-.21,-.37-.06*wave,-.20)))
            weapon_aim((.12,-.62,.78))
        else:
            rh,lh,d,delta=sample_keys(phase,keys);shift_hips((delta[0]*sign,delta[1],delta[2]))
            # Torso twist about vertical, then knee and hand targets in world space.
            angle=.28*math.sin(2*math.pi*phase)
            m=torso.matrix.copy();p=m.translation.copy();axis=rig.matrix_world.inverted().to_3x3()@Vector((0,0,1));m=Matrix.Rotation(angle,4,axis)@m;m.translation=p;torso.matrix=m;bpy.context.view_layer.update()
            for j,(upper,lower,end) in enumerate(feet):
                target=ankles[j]+Vector((0,-.19 if j==0 else .16,0))
                errors.append(limb(upper,lower,end,target,(0,-1,0)));foot_orientation(j,0)
            errors.extend([hand_target(0,rh),hand_target(1,lh)]);weapon_aim(d)
        bpy.context.view_layer.update()
        a=snap();pts=mesh_points();tip=blade()
        if i==0:reference[motion]=(pts,tip)
        # A redundant frame evaluation must not erase the authored pose.
        sc.frame_set(1);bpy.context.view_layer.update();before=mesh_points()
        record={"phase":phase,"joints":a,"meshFromFirst":mesh_delta(reference[motion][0],pts),"meshAfterFrameSet":mesh_delta(pts,before),"weaponTravel":(tip-reference[motion][1]).length,"weaponTip":vec(tip),"maxIKResidual":max(errors)}
        samples.append(record);save()
        if record["meshAfterFrameSet"]["max"]>.005:raise ValueError("Authored deformation erased by frame evaluation")
        sc.render.filepath=str(folder/(motion+"-%02d.png"%i));bpy.ops.render.render(write_still=True)
        record["meshAfterRender"]=mesh_delta(before,mesh_points());save()
        if record["meshAfterRender"]["max"]>.005:raise ValueError("Authored deformation erased by render")
    if max(r["meshFromFirst"]["rms"] for r in samples)<.035:raise ValueError("Insufficient evaluated mesh movement "+motion)
    if motion=="strike" and max(r["weaponTravel"] for r in samples)<.55:raise ValueError("Insufficient measured sword travel")
    if max(r["maxIKResidual"] for r in samples)>.12:raise ValueError("Excessive IK residual "+motion)
audit["validated"]=True;save()
