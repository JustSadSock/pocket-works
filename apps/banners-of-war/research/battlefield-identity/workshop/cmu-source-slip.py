"""Measure CMU source world-space ankle/toe travel on the SAME selected cycle.
Compare the previously measured armed adaptation separately; no forced foot lock."""
import os,json,re,math
from pathlib import Path
src=Path(__file__).with_name("sword-motion.py")
exec(compile(src.read_text().split("# Distinct load, acceleration",1)[0],str(src),"exec"))
folder=Path(os.environ["BOW_ART_OUTPUT"])
def norm(n):return re.sub("[^a-z0-9]","",n.lower())
mocap="/tmp/bow-cmu-35_01.bvh"
p=Path(__file__).with_name("retarget-walk.py")
exec(compile(p.read_text().split("# No mocap object visible",1)[0],str(p),"exec"))
result=[]
# sample at same 24 phases as IV, include actual source world ankle motion
for j in range(2):
    frames=[]
    for i in range(24):
        r=cycle[round(i/24*(len(cycle)-1))];ankle=r["legs"][j][2];toe=r["toes"][j]
        frames.append({"phase":i/24,"frame":r["frame"],"support":ankle.z-floor[j]<.035/scale,"ankle":vec(ankle),"toe":vec(toe) if toe is not None else None,"hip":vec(r["hip"])})
    def slips(key):
        ds=[]
        for a,b in zip(frames,frames[1:]):
            if a["support"] and b["support"] and a[key] is not None and b[key] is not None:
                v=Vector(b[key])-Vector(a[key]);ds.append({"forwardMetres":abs(v.dot(forward))*scale,"horizontalMetres":math.hypot(v.x,v.y)*scale})
        return {"maxForwardStep":max((d["forwardMetres"] for d in ds),default=None),"sumForward":sum(d["forwardMetres"] for d in ds),"maxHorizontalStep":max((d["horizontalMetres"] for d in ds),default=None),"sumHorizontal":sum(d["horizontalMetres"] for d in ds)}
    result.append({"ankle":slips("ankle"),"toe":slips("toe"),"frames":frames})
(folder/"cmu-source-slip.json").write_text(json.dumps({"cycleFrames":[cycle[0]["frame"],cycle[-1]["frame"]],"scale":scale,"sourceFootMotionAtTargetScale":result,"stanceRule":"same ankle-height threshold as IV; ankle/toe proxies not measured shoe sole","artisticApproval":False},indent=2))
