"""Research-only CMU walk transfer; retain actual captured lower-body trajectories.
Arms and equipment are authored because unarmed source has no weapon contacts."""
import hashlib
mocap_path=Path(mocap);raw=mocap_path.read_bytes()
if not raw.startswith(b"HIERARCHY") or len(raw)>20*1024*1024:raise ValueError("Invalid BVH source")
# Parse BVH directly; no optional Blender importer, no source rig copied
# into the scene, and no ambiguity about the exact rotation channel order.
import re
header,motion=raw.decode("utf8",errors="strict").split("MOTION",1)
tokens=re.findall(r"[{}]|[^\s{}]+",header);index=0;joints=[]
def take(expected=None):
    global index
    t=tokens[index];index+=1
    if expected is not None and t!=expected:raise ValueError("BVH token "+repr(t)+" expected "+repr(expected))
    return t
audit["bvhHeader"]={"firstTokens":tokens[:16],"headerBytes":len(header.encode()),"format":"BVH hierarchy + MOTION"};save()
take("HIERARCHY")
def parse_joint(parent):
    typ=take();name=take()
    if typ not in ("ROOT","JOINT"):raise ValueError("Invalid BVH joint "+typ)
    take("{");take("OFFSET");offset=Vector(tuple(float(take()) for _ in range(3)))
    take("CHANNELS");n=int(take());channels=[take() for _ in range(n)]
    k=len(joints);joints.append({"name":name,"parent":parent,"offset":offset,"channels":channels})
    while tokens[index]!="}":
        if tokens[index]=="JOINT":parse_joint(k)
        elif tokens[index]=="End":
            take("End");take("Site");take("{");take("OFFSET");[take() for _ in range(3)];take("}")
        else:raise ValueError("Unexpected BVH hierarchy "+tokens[index])
    take("}")
parse_joint(-1)
def cb(*names):
    for name in names:
        for i,b in enumerate(joints):
            if norm(b["name"]).endswith(norm(name)):return i
    raise ValueError("Capture bone not found "+str(names))
ch=cb("Hips","Hip");clegs=[(cb("RightUpLeg"),cb("RightLeg"),cb("RightFoot")),(cb("LeftUpLeg"),cb("LeftLeg"),cb("LeftFoot"))]
lines=[s.strip() for s in motion.splitlines() if s.strip()]
if not lines[0].startswith("Frames:") or not lines[1].startswith("Frame Time:"):raise ValueError("Invalid BVH timing")
nframes=int(lines[0].split(":")[1]);frameTime=float(lines[1].split(":")[1])
if len(lines[2:])!=nframes or not .001<frameTime<.1:raise ValueError("Invalid BVH frame data")
count=sum(len(q["channels"]) for q in joints)
def optional_cb(*names):
    try:return cb(*names)
    except ValueError:return None
toes=[optional_cb("RightToeBase","RightToe","RightFootToe"),optional_cb("LeftToeBase","LeftToe","LeftFootToe")]
spine=cb("Spine","LowerBack");headBone=cb("Head");shoulderBones=(cb("RightArm","RightShoulder"),cb("LeftArm","LeftShoulder"));armBones=(cb("RightForeArm"),cb("LeftForeArm"))
def cv(v):return Vector((v.x,-v.z,v.y))*.01
records=[]
for i,line in enumerate(lines[2:]):
    if i<2:continue # added conversion T-pose, not captured gait
    values=[float(x) for x in line.split()]
    if len(values)!=count:raise ValueError("BVH channel count mismatch")
    matrices=[];cursor=0
    for q in joints:
        m=Matrix.Translation(q["offset"])
        for chn in q["channels"]:
            v=values[cursor];cursor+=1
            if chn.lower().endswith("position"):
                axis=Vector((0,0,0));axis["XYZ".index(chn[0].upper())]=v;m=m@Matrix.Translation(axis)
            elif chn.lower().endswith("rotation"):m=m@Matrix.Rotation(math.radians(v),4,chn[0].upper())
            else:raise ValueError("Unknown BVH channel "+chn)
        matrices.append(m if q["parent"]<0 else matrices[q["parent"]]@m)
    records.append({"frame":i,"hip":cv(matrices[ch].translation),"legs":[[cv(matrices[k].translation) for k in chain] for chain in clegs],"spine":cv(matrices[spine].translation),"head":cv(matrices[headBone].translation),"shoulders":[cv(matrices[k].translation) for k in shoulderBones],"elbows":[cv(matrices[k].translation) for k in armBones],"toes":[cv(matrices[k].translation) if k is not None else None for k in toes]})
if len(records)<80:raise ValueError("Capture too short")
up=Vector((0,0,1));side=sum((r["legs"][0][0]-r["legs"][1][0] for r in records),Vector((0,0,0)));side.z=0;side.normalize()
forward=up.cross(side).normalized()
travel=records[-1]["hip"]-records[0]["hip"]
if travel.dot(forward)<0:forward=-forward
def basis(v):return Vector((v.dot(side)*sign,-v.dot(forward),v.z))
# Find repeated right-foot forward-strike peaks in the moving frame.
signal=[(r["legs"][0][2]-r["hip"]).dot(forward) for r in records]
peaks=[i for i in range(5,len(signal)-5) if signal[i]>=max(signal[i-5:i+6])]
pairs=[(a,b) for a,b in zip(peaks,peaks[1:]) if .65<=(b-a)*frameTime<=1.65]
if not pairs:raise ValueError("No repeated gait cycle in captured motion")
a,b=min(pairs,key=lambda q:abs((q[1]-q[0])*frameTime-1.08))
cycle=records[a:b+1];scale=sum((point(k)-point(h)).length+(point(f)-point(k)).length for h,k,f in feet)/sum((chain[1]-chain[0]).length+(chain[2]-chain[1]).length for chain in cycle[0]["legs"])
hipMean=sum(r["hip"].z for r in cycle)/len(cycle)
rootMean=sum((r["hip"].dot(side) for r in cycle))/len(cycle)
floor=[min(r["legs"][j][2].z for r in cycle) for j in range(2)]
mid=[sum((r["legs"][j][2]-r["hip"]).dot(forward) for r in cycle)/len(cycle) for j in range(2)]
def toe_pitch(row,j):
    t=row["toes"][j]
    if t is None:return None
    v=t-row["legs"][j][2]
    return math.atan2(v.z,max(.01,v.dot(forward)))
pitchReference=[]
for j in range(2):
    q=[toe_pitch(row,j) for row in cycle if row["legs"][j][2].z-floor[j]<.025/scale and toe_pitch(row,j) is not None]
    pitchReference.append(sorted(q)[len(q)//2] if q else None)
# No mocap object visible in character render.
audit["retarget"]={"source":str(mocap_path.name),"sha256":hashlib.sha256(raw).hexdigest(),"mapping":[[joints[v]["name"] for v in c] for c in clegs],"periodSeconds":(len(cycle)-1)*frameTime,"sourceFrameTime":frameTime,"frames":[cycle[0]["frame"],cycle[-1]["frame"]],"scale":scale,"mode":"captured pelvis, lower-body trajectories and upper-body yaw/arm swing; armed hands constrained to equipment","sourceJointNames":[q["name"] for q in joints]}
def retarget_gait(phase):
    r=cycle[min(len(cycle)-1,round(phase*(len(cycle)-1)))];shift_hips(((r["hip"].dot(side)-rootMean)*scale*sign,0,(r["hip"].z-hipMean)*scale-.02));errors=[];stance=[]
    def yaw(v):return math.atan2(v.dot(forward),v.dot(side))
    pelvic=r["legs"][0][0]-r["legs"][1][0];shoulders=r["shoulders"][0]-r["shoulders"][1]
    turn(hips,max(-.28,min(.28,-yaw(pelvic)*sign)));turn(torso,max(-.30,min(.30,-(yaw(shoulders)-yaw(pelvic))*sign)))
    trunk=r["head"]-r["hip"];incline=max(-.09,min(.12,math.atan2(trunk.dot(forward),max(.05,trunk.z))))
    shoulderRoll=max(-.07,min(.07,math.atan2(shoulders.z,max(.05,abs(shoulders.dot(side))))))
    q=Quaternion(Vector((0,1,0)),shoulderRoll*sign)@Quaternion(Vector((1,0,0)),incline)@world_of(torso).to_quaternion()
    set_world_rotation(torso,q)
    for j,(upper,lower,end) in enumerate(feet):
        thigh,knee,ankle=r["legs"][j];rel=ankle-r["hip"]
        dest=ankles0[j]+Vector(((rel.dot(side)-(cycle[0]["legs"][j][2]-cycle[0]["hip"]).dot(side))*scale*sign,-(rel.dot(forward)-mid[j])*scale,(ankle.z-floor[j])*scale))
        preferred=basis(knee-thigh);preferred.z=0
        if preferred.length<.01:preferred=Vector((0,-1,0))
        support=ankle.z-floor[j]<.035/scale
        p=toe_pitch(r,j)
        # Captured toe pitch around lateral axis. In the target frame
        # forward is -Y; sign converts the source vertical toe motion.
        pitch=max(-.38,min(.38,-(p-pitchReference[j]))) if p is not None and pitchReference[j] is not None else 0
        err,contact=plant_boot(j,dest,preferred,pitch,support);errors.append(err)
        rootTravel=-(r["hip"]-cycle[0]["hip"]).dot(forward)*scale
        contact.update({"sourceAnkleHeight":ankle.z,"sourceToePitch":p,"rootRelativeY":point(end).y,"rootTravelY":rootTravel})
        stance.append(contact)
    sw=[max(-.09,min(.09,(r["elbows"][j]-r["shoulders"][j]).dot(forward)*scale*.4)) for j in range(2)]
    errors.extend([arm_pose(0,(.23,-.11-sw[0],-.45),roll=.07),arm_pose(1,(.07,-.32-sw[1]*.3,-.23),bend=(-sign,.04,-.65))])
    hold_sword(4*math.sin(2*math.pi*phase),2*math.cos(2*math.pi*phase));lock_left()
    return errors,stance
