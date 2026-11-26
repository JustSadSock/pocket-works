"""Separate stage metrics from end-to-end acceptance. No FPS gate changes."""
import json,os,statistics,math
from pathlib import Path
root=Path(os.environ["BOW_PAIR_ROOT"]);results={}
def stats(a):
    a=[x for x in a if isinstance(x,(int,float)) and math.isfinite(x)]
    if not a:return None
    a.sort();return {"mean":statistics.mean(a),"p95":a[int((len(a)-1)*.95)],"max":a[-1],"count":len(a)}
def cg(r):
    def parse(t):return {k:int(v) for k,v in (x.split() for x in t.splitlines())}
    a=parse(r["start"].get("/sys/fs/cgroup/cpu.stat",""));b=parse(r["end"].get("/sys/fs/cgroup/cpu.stat",""))
    return {k:b[k]-v for k,v in a.items() if k in b}
for name in ("baseline-cold","current-cold","current-warm","baseline-warm"):
    p=root/name/"paired-result.json"
    if not p.is_file():continue
    r=json.loads(p.read_text());rows=[]
    for a in r["r"]["results"]:
        prof=a.get("profile",[])
        metrics={k:stats([p.get(k) for p in prof]) for k in ("geometryMs","contactMs","positionMs","sortMs","composeMs","audioMs","drawCalls","scaleHits","scaleMisses","scaleMs","scaledBytes")}
        rows.append({"motion":a["motion"],"policy":a["mode"],"fps":a["fps"],"frameInterval":stats(a.get("intervals",[])),"drawMeanMs":a["drawMs"],"groundMeanMs":a["groundMs"],"unaccountedWallTimeEstimateMs":max(0,1000/a["fps"]-a["drawMs"]),"stages":metrics})
    f=root/name/"canvas-readback-diagnostic.json"
    readback=json.loads(f.read_text()) if f.is_file() else None
    results[name]={"cpuDelta":cg(r),"cpuQuota":r["start"].get("/sys/fs/cgroup/cpu.max"),"loadBefore":r["start"].get("/proc/loadavg"),"loadAfter":r["end"].get("/proc/loadavg"),"browser":r["browser"],"dpr":r["env"]["dpr"],"canvas":r["env"]["canvas"],"rows":rows,"readback":readback}
(root/"stage-profile-summary.json").write_text(json.dumps({"runs":results,"order":["baseline-cold","current-cold","current-warm","baseline-warm"],"minimumFPS":30,"notes":"Stage timers overlap; do not sum blindly. Unaccounted wall time includes browser scheduling/compositor/raster and cannot identify one cause. Readback is a separate post-test diagnostic. Cold/warm and different atlas variants are not interchangeable."},indent=2))
for name,r in results.items():
    print(name,[(x["motion"],round(x["fps"],2),round(x["drawMeanMs"],2),round(x["unaccountedWallTimeEstimateMs"],2)) for x in r["rows"] if x["policy"]=="auto"])
