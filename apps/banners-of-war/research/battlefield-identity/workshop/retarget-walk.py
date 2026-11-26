"""Research-only CMU walk transfer; retain actual captured lower-body trajectories.
Arms and equipment are authored because unarmed source has no weapon contacts."""
import hashlib
mocap_path=Path(mocap);raw=mocap_path.read_bytes()
if not raw.startswith(b"HIERARCHY") or len(raw)>20*1024*1024:raise ValueError("Invalid BVH source")
before=set(sc.objects)
bpy.ops.import_anim.bvh(filepath=str(mocap_path),global_scale=.01,frame_start=1,use_fps_scale=False,update_scene_fps=False,update_scene_duration=False,axis_forward="-Z",axis_up="Y")
capture=next(o for o in sc.objects if o not in before and o.type=="ARMATURE")
capture.hide_render=True
def cb(*names):
    for name in names:
        for b in capture.pose.bones:
            if norm(b.name).endswith(norm(name)):return b
    raise ValueError("Capture bone not found "+str(names))
ch=cb("Hips");clegs=[(cb("RightUpLeg"),cb("RightLeg"),cb("RightFoot")),(cb("LeftUpLeg"),cb("LeftLeg"),cb("LeftFoot"))]
def cp(b):return capture.matrix_world@b.head
action=capture.animation_data.action;lo,hi=map(int,action.frame_range)
records=[]
for i in range(lo+2,hi+1):
    sc.frame_set(i);bpy.context.view_layer.update()
    records.append({"frame":i,"hip":cp(ch).copy(),"legs":[[cp(b).copy() for b in chain] for chain in clegs]})
if len(records)<80:raise ValueError("Capture too short")
up=Vector((0,0,1));side=sum((r["legs"][0][0]-r["legs"][1][0] for r in records),Vector((0,0,0)));side.z=0;side.normalize()
forward=up.cross(side).normalized()
travel=records[-1]["hip"]-records[0]["hip"]
if travel.dot(forward)<0:forward=-forward
def basis(v):return Vector((v.dot(side)*sign,-v.dot(forward),v.z))
# Find repeated right-foot forward-strike peaks in the moving frame.
signal=[(r["legs"][0][2]-r["hip"]).dot(forward) for r in records]
peaks=[i for i in range(5,len(signal)-5) if signal[i]>=max(signal[i-5:i+6])]
pairs=[(a,b) for a,b in zip(peaks,peaks[1:]) if 40<=b-a<=180]
if not pairs:raise ValueError("No repeated gait cycle in captured motion")
a,b=min(pairs,key=lambda q:abs(q[1]-q[0]-110))
cycle=records[a:b+1];scale=sum((point(k)-point(h)).length+(point(f)-point(k)).length for h,k,f in feet)/sum((chain[1]-chain[0]).length+(chain[2]-chain[1]).length for chain in cycle[0]["legs"])
hipMean=sum(r["hip"].z for r in cycle)/len(cycle)
floor=[min(r["legs"][j][2].z for r in cycle) for j in range(2)]
mid=[sum((r["legs"][j][2]-r["hip"]).dot(forward) for r in cycle)/len(cycle) for j in range(2)]
capture.animation_data_clear();bpy.context.view_layer.objects.active=rig
# No mocap object visible in character render.
audit["retarget"]={"source":str(mocap_path.name),"sha256":hashlib.sha256(raw).hexdigest(),"mapping":[[v.name for v in c] for c in clegs],"frames":[cycle[0]["frame"],cycle[-1]["frame"]],"scale":scale,"mode":"captured hip and leg position retarget; authored armed upper body"}
def retarget_gait(phase):
    r=cycle[min(len(cycle)-1,round(phase*(len(cycle)-1)))];shift_hips((0,0,(r["hip"].z-hipMean)*scale-.02));errors=[];stance=[]
    for j,(upper,lower,end) in enumerate(feet):
        thigh,knee,ankle=r["legs"][j];rel=ankle-r["hip"]
        dest=ankles0[j]+Vector((0,-(rel.dot(forward)-mid[j])*scale,(ankle.z-floor[j])*scale))
        preferred=basis(knee-thigh);preferred.z=0
        if preferred.length<.01:preferred=Vector((0,-1,0))
        errors.append(limb(upper,lower,end,dest,preferred));foot_orientation(j,0)
        stance.append({"support":ankle.z-floor[j]<.035/scale,"target":vec(dest),"actual":vec(point(end))})
    errors.extend([hand_target(0,(.20,-.12,-.46)),hand_target(1,(-.19,-.35,-.24))])
    hold_sword((.12,-.28,.95));lock_left()
    return errors,stance
