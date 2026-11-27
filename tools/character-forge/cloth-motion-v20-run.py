"""Matched-duration 24/48/96 FPS contact experiment for the actual right trouser."""
import hashlib,json,os,shutil,subprocess
from pathlib import Path

root=Path(os.environ["CHARACTER_EVIDENCE"])
blender=os.environ["BLENDER"]
source=root/"morph"/"v9-cloth-input.json"
if not source.exists():
    raise SystemExit("Missing v9-cloth-input.json")
spec=json.loads(source.read_text())
experiments=[("baseline-24fps",1),("subframe-48fps",2),("subframe-96fps",4)]
summary=[]
for name,factor in experiments:
    out=root/("v20-trousers-R-"+name)
    (out/"morph").mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,out/"morph"/"v9-cloth-input.json")
    config={"diagnosticOnly":True,"collider":"trousers R","timeResolution":factor,
            "friction":5.0,"selfDistance":0.0025,"proxy":"outer",
            "pinMotion":True,"colliderMotion":True}
    cfg=out/"v20-config.json"
    cfg.write_text(json.dumps(config,indent=2))
    env=os.environ.copy()
    env.update({"CHARACTER_EVIDENCE":str(out),"CHARACTER_V15_CLOTH":"1",
                "CHARACTER_V20_CLOTH_CONFIG":str(cfg)})
    cmd=[blender,"--background","--factory-startup","--disable-autoexec",
         "--python-exit-code","1","--python","tools/character-forge/cloth-recovery-v11.py"]
    with (out/"run.log").open("w") as log:
        proc=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT)
    report=out/"v11-cloth-recovery.json"
    if not report.exists():
        summary.append({"name":name,"timeResolution":factor,"fps":spec["fps"]*factor,
                        "exit":proc.returncode,"status":"missing-recovery-report"})
        continue
    data=json.loads(report.read_text())
    stage=next((x for x in data.get("stages",[]) if x.get("stage")==2),None)
    if stage is None:
        summary.append({"name":name,"timeResolution":factor,"fps":spec["fps"]*factor,
                        "exit":proc.returncode,"status":data.get("status")})
        continue
    frames=stage.get("frames",[])
    speeds=[x.get("colliderAudit",{}).get("trousers R",{}).get("maxSurfaceSpeedMetresPerSecond",0) for x in frames]
    mismatches=[x.get("colliderAudit",{}).get("trousers R",{}).get("maxEvaluatedMismatchMetres",0) for x in frames]
    contacts=[]
    for defect in stage.get("defects",[]):
        for edge in defect.get("worstEdges",[]):
            nearest=edge.get("nearestCollider") or {}
            if nearest.get("name")=="trousers R":
                contacts.append({"frame":defect.get("frame"),"edge":edge.get("edge"),
                    "stretch":edge.get("ratio"),"distanceMetres":nearest.get("distanceMetres"),
                    "relativeNormalSpeed":nearest.get("relativeNormalSpeed"),
                    "relativeTangentialSpeed":nearest.get("relativeTangentialSpeed"),
                    "surfaceVelocity":nearest.get("surfaceVelocity")})
    contacts.sort(key=lambda x:x.get("relativeTangentialSpeed") or 0,reverse=True)
    warm=(24+18)*factor
    time_scale=factor
    expected_frames=warm+(spec["frameCount"]-1)*factor+1
    first=stage.get("firstDefect")
    summary.append({"name":name,"timeResolution":factor,"fps":spec["fps"]*factor,
        "exit":proc.returncode,"status":data.get("status"),"passed":stage.get("passed"),
        "simulationFrames":len(frames),"expectedSimulationFrames":expected_frames,"frameCountMatches":len(frames)==expected_frames,
        "warmupDurationSeconds":warm/(spec["fps"]*factor),"simulationDurationSeconds":(len(frames)-1)/(spec["fps"]*factor),
        "sourceMotionDurationSeconds":(spec["frameCount"]-1)/spec["fps"],
        "firstDefect":first,"firstDefectSourceFrame":None if first is None else 1+(first-1-warm)/time_scale,
        "gates":stage.get("gates"),
        "maxStretch":max((x.get("maxStretch",0) for x in frames),default=0),
        "maxP95Stretch":max((x.get("p95Stretch",0) for x in frames),default=0),
        "maxSelfPairs":max((x.get("selfOverlapPairs",0) for x in frames),default=0),
        "maxExternalPairs":max((sum(x.get("nonSeamTrianglePairs",{}).values()) for x in frames),default=0),
        "maxRightPantSurfaceSpeed":max(speeds,default=0),
        "maxColliderMismatchMetres":max(mismatches,default=0),
        "maxRelativeTangentialSpeed":max((x.get("relativeTangentialSpeed",0) for x in contacts),default=0),
        "peakContact":contacts[0] if contacts else None,"contactSamples":contacts[:12]})
    render_env=env.copy()
    subprocess.run(["node","tools/character-forge/cloth-evidence-v12.mjs"],env=render_env,check=False)

baseline=next((x for x in summary if x["timeResolution"]==1),None)
comparisons={}
if baseline:
    for row in summary:
        if row is baseline:continue
        comparisons[row["name"]]={"maxStretchDelta":row.get("maxStretch",0)-baseline.get("maxStretch",0),
            "maxP95StretchDelta":row.get("maxP95Stretch",0)-baseline.get("maxP95Stretch",0),
            "selfPairsDelta":row.get("maxSelfPairs",0)-baseline.get("maxSelfPairs",0),
            "externalPairsDelta":row.get("maxExternalPairs",0)-baseline.get("maxExternalPairs",0),
            "surfaceSpeedDelta":row.get("maxRightPantSurfaceSpeed",0)-baseline.get("maxRightPantSurfaceSpeed",0),
            "relativeTangentialSpeedDelta":row.get("maxRelativeTangentialSpeed",0)-baseline.get("maxRelativeTangentialSpeed",0),
            "colliderMismatchDelta":row.get("maxColliderMismatchMetres",0)-baseline.get("maxColliderMismatchMetres",0)}
matrix={"version":"v0.20","diagnosticOnly":True,"productionAllowed":False,
    "method":"same source and material; 24/48/96 FPS; warm-up and transition duration scaled to preserve elapsed time",
    "sourceSha256":hashlib.sha256(source.read_bytes()).hexdigest(),
    "experiments":summary,"comparisonsAgainst24Fps":comparisons}
(root/"v20-time-resolution-matrix.json").write_text(json.dumps(matrix,indent=2))
print(json.dumps(matrix),flush=True)
if len(summary)!=len(experiments) or any(x.get("exit")!=0 or x.get("status") in ("missing-recovery-report",None) or not x.get("frameCountMatches") for x in summary):
    raise SystemExit("v0.20 time-resolution matrix incomplete or Blender execution failed")
