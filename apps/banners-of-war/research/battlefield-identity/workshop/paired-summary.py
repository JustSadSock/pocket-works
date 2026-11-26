"""Compare all four matched runs without suppressing the 30 FPS requirement."""
import json,os,statistics
from pathlib import Path
root=Path(os.environ["BOW_PAIR_ROOT"]);runs={};violations=[];mismatches=[]
for name in ("baseline-cold","current-cold","current-warm","baseline-warm"):
    p=root/name/"paired-result.json"
    if not p.is_file():violations.append(name+": missing result");continue
    r=json.loads(p.read_text());runs[name]=r
    for v in r["violations"]:violations.append(name+": "+v)
def config(r):
    e=r["env"];a=e["audio"]
    return {"browser":r["browser"],"ua":e["ua"],"dpr":e["dpr"],"canvas":e["canvas"],"css":e["css"],"viewport":e["viewport"],"audioEnabled":a.get("enabled"),"audioSettings":a.get("settings"),"physical":r["physicalSHA256"],"assets":r["assets"],"cpu":r["cpu"][0]["model"],"parallelism":r["parallelism"],"cpuQuota":r["start"].get("/sys/fs/cgroup/cpu.max")}
if runs:
    first=next(iter(runs.values()));reference=config(first)
    for name,r in runs.items():
        for k,v in config(r).items():
            if v!=reference[k]:mismatches.append({"run":name,"field":k,"actual":v,"expected":reference[k]})
def zoom(r):return [a["fps"] for a in r["r"]["results"] if a["motion"]=="zoom" and a["mode"]=="auto"]
rates={n:zoom(r) for n,r in runs.items()}
hashes={n:(root/n/"runtime-sha256.txt").read_text() if (root/n/"runtime-sha256.txt").is_file() else None for n in runs}
summary={"matchedEnvironment":len(runs)==4 and not mismatches,"mismatches":mismatches,"fps":rates,"meanFPS":{n:statistics.mean(v) for n,v in rates.items() if v},"runtimeHashes":hashes,"allRuntimeHashesIdentical":len(hashes)==4 and len(set(hashes.values()))==1,"violations":violations,"minimumFPS":30,"thresholdChanged":False,"interpretation":"Cold and warm results are separate protocols; a causal conclusion requires matching configuration and inspection of timing and cgroup records."}
(root/"paired-summary.json").write_text(json.dumps(summary,indent=2));print(json.dumps({k:v for k,v in summary.items() if k!="runtimeHashes"},indent=2))
if violations or mismatches:raise SystemExit("Paired performance requirement not met; evidence retained")
