"""Research-only CMU walk transfer; retain actual captured lower-body trajectories.
Arms and equipment are authored because unarmed source has no weapon contacts."""
import hashlib
mocap_path=Path(mocap);raw=mocap_path.read_bytes()
if not raw.startswith(b"HIERARCHY") or len(raw)>20*1024*1024:raise ValueError("Invalid BVH source")
# Parse BVH directly; no optional Blender importer, no source rig copied
# into the scene, and no ambiguity about the exact rotation channel order.
import re
header,motion=raw.decode("utf8",errors="strict").split("MOTION",1)
tokens=re.findall(r"[^\\s{}]+|[{}]",header);index=0;joints=[]
def take(expected=None):
    global index
    t=tokens[index];index+=1
    if expected is not None and t!=expected:raise ValueError("BVH token "+t+" expected "+expected)
    return t
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
ch=cb("Hips");clegs=[(cb("RightUpLeg"),cb("RightLeg"),cb("RightFoot")),(cb("LeftUpLeg"),cb("LeftLeg"),cb("LeftFoot"))]
lines=[s.strip() for s in motion.splitlines() if s.strip()]
if not lines[0].startswith("Frames:") or not lines[1].startswith("Frame Time:"):raise ValueError("Invalid BVH timing")
nframes=int(lines[0].split(":")[1]);frameTime=float(lines[1].split(":")[1])
if len(lines[2:])!=nframes or not .001<frameTime<.1:raise ValueError("Invalid BVH frame data")
count=sum(len(q["channels"]) for q in joints)
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
    records.append({"frame":i,"hip":cv(matrices[ch].translation),"legs":[[cv(matrices[k].translation) for k in chain] for chain in clegs]})
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
floor=[min(r["legs"][j][2].z for r in cycle) for j in range(2)]
mid=[sum((r["legs"][j][2]-r["hip"]).dot(forward) for r in cycle)/len(cycle) for j in range(2)]
# No mocap object visible in character render.
audit["retarget"]={"source":str(mocap_path.name),"sha256":hashlib.sha256(raw).hexdigest(),"mapping":[[joints[v]["name"] for v in c] for c in clegs],"periodSeconds":(len(cycle)-1)*frameTime,"sourceFrameTime":frameTime,"frames":[cycle[0]["frame"],cycle[-1]["frame"]],"scale":scale,"mode":"captured hip and leg position retarget; authored armed upper body"}
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
