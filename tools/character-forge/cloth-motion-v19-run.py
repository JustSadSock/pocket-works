"""Run v0.19 isolated Blender transfer matrix; never grants production approval."""
import json,os,shutil,subprocess
from pathlib import Path
root=Path(os.environ["CHARACTER_EVIDENCE"]);blender=os.environ["BLENDER"]
source=root/"morph"/"v9-cloth-input.json"
if not source.exists():raise SystemExit("Missing v9-cloth-input.json")
experiments=[("vertex-keys-f5","vertex-keys",5.0),("rigid-only-f5","rigid-only",5.0),
 ("residual-only-f5","residual-only",5.0),("rigid-plus-residual-f5","rigid-plus-residual",5.0),
 ("rigid-plus-residual-f20","rigid-plus-residual",20.0)]
summary=[];recoveries={}
for name,mode,friction in experiments:
    out=root/("v19-trousers-R-"+name);(out/"morph").mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,out/"morph"/"v9-cloth-input.json")
    cfg={"diagnosticOnly":True,"collider":"trousers R","motionTransfer":mode,"friction":friction,"selfDistance":.0025,"proxy":"outer"}
    cfgpath=out/"v19-config.json";cfgpath.write_text(json.dumps(cfg,indent=2))
    env=os.environ.copy();env.update({"CHARACTER_EVIDENCE":str(out),"CHARACTER_V15_CLOTH":"1","CHARACTER_V19_CLOTH_CONFIG":str(cfgpath)})
    cmd=[blender,"--background","--factory-startup","--disable-autoexec","--python-exit-code","1","--python","tools/character-forge/cloth-recovery-v11.py"]
    with (out/"run.log").open("w") as log:proc=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT)
    rp=out/"v11-cloth-recovery.json";tp=out/"v19-motion-transfer.json"
    if not rp.exists() or not tp.exists():
        summary.append({"name":name,"mode":mode,"friction":friction,"exit":proc.returncode,"status":"missing-report"});continue
    recovery=json.loads(rp.read_text());transfer=json.loads(tp.read_text())
    stage=next((x for x in recovery.get("stages",[]) if x.get("stage")==2),None)
    if stage is None:
        summary.append({"name":name,"mode":mode,"friction":friction,"exit":proc.returncode,"status":"missing-stage-2"});continue
    frames=stage.get("frames",[]);external=[sum(x.get("nonSeamTrianglePairs",{}).values()) for x in frames]
    self_pairs=[x.get("selfOverlapPairs",0) for x in frames]
    entry={"name":name,"mode":mode,"friction":friction,"exit":proc.returncode,"status":recovery.get("status"),
        "worldGeometry":transfer.get("worldGeometry"),"gates":stage.get("gates"),"firstDefect":stage.get("firstDefect"),
        "maxStretch":max((x.get("maxStretch",0) for x in frames),default=0),
        "maxP95Stretch":max((x.get("p95Stretch",0) for x in frames),default=0),
        "maxSelfPairs":max(self_pairs,default=0),"maxExternalPairs":max(external,default=0)}
    summary.append(entry);recoveries[name]=recovery
    if proc.returncode!=0:entry["runnerFailure"]="Blender returned non-zero"
    if mode in ("vertex-keys","rigid-plus-residual") and not (transfer.get("worldGeometry") or {}).get("allFramesWithin1e-5"):
        entry["runnerFailure"]="Exact transfer did not reproduce all world-space frames"

def delta(left,right,key):
    a=next((x for x in left.get("stages",[]) if x.get("stage")==2),{}).get("frames",[])
    b=next((x for x in right.get("stages",[]) if x.get("stage")==2),{}).get("frames",[])
    if len(a)!=len(b) or not a:return {"comparable":False}
    values=[]
    for x,y in zip(a,b):
        if key=="externalPairs":vx,vy=sum(x.get("nonSeamTrianglePairs",{}).values()),sum(y.get("nonSeamTrianglePairs",{}).values())
        elif key=="selfOverlapPairs":vx,vy=x.get(key,0),y.get(key,0)
        else:vx,vy=x.get(key,0),y.get(key,0)
        values.append(abs(float(vx)-float(vy)))
    return {"comparable":True,"maxAbsoluteFrameDelta":max(values),"meanAbsoluteFrameDelta":sum(values)/len(values)}
comparisons={}
base=recoveries.get("vertex-keys-f5");split=recoveries.get("rigid-plus-residual-f5");high=recoveries.get("rigid-plus-residual-f20")
if base and split:comparisons["vertexKeysVsRigidPlusResidual"]={k:delta(base,split,k) for k in ("maxStretch","p95Stretch","pinErrorMetres","hemRadiusRatio","selfOverlapPairs","externalPairs")}
if split and high:comparisons["friction20VsFriction5"]={k:delta(split,high,k) for k in ("maxStretch","p95Stretch","pinErrorMetres","hemRadiusRatio","selfOverlapPairs","externalPairs")}
result={"version":"v0.19","diagnosticOnly":True,"productionAllowed":False,"experiments":summary,"solverComparisons":comparisons}
(root/"v19-motion-transfer-matrix.json").write_text(json.dumps(result,indent=2));print(json.dumps(result))
if len(summary)!=len(experiments) or any(x.get("status") in ("missing-report","missing-stage-2") or x.get("runnerFailure") for x in summary):
    raise SystemExit("v0.19 matrix incomplete or exact geometry reconstruction failed")
