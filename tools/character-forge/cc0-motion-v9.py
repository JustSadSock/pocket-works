"""Inspect one licensed CC0 walk clip in Blender and compare its root/foot timing."""
import bpy,json,zipfile,re,hashlib,math,os
from pathlib import Path
from mathutils import Vector
out=Path(os.environ["CHARACTER_EVIDENCE"]);archive=out/"morph"/"v9-cc0-motions.zip"
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
with zipfile.ZipFile(archive) as z:
 files=[x for x in z.namelist() if x.lower().endswith(".glb")]
 if not files:raise RuntimeError("CC0 animation archive contains no GLB files")
 target=out/"cc0-motion";target.mkdir(exist_ok=True)
 candidates=sorted(files,key=lambda x:(0 if re.search(r"walk",x,re.I) else 1,x))
 extracted=[]
 for name in candidates:
  dest=target/Path(name).name
  dest.write_bytes(z.read(name));extracted.append((name,dest))
def norm(s):return re.sub(r'[^a-z0-9]','',s.lower())
def findbone(arm,patterns):
 for p in arm.pose.bones:
  n=norm(p.name)
  if any(re.search(x,n) for x in patterns):return p
 return None
chosen=None;chosenAction=None;armature=None
for original,path in extracted:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 try:bpy.ops.import_scene.gltf(filepath=str(path))
 except Exception:continue
 arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
 actions=list(bpy.data.actions)
 walk=next((a for a in actions if re.search('walk',a.name,re.I)),None)
 if walk is None and re.search('walk',original,re.I) and actions:walk=actions[0]
 if walk and arms:
  chosen=(original,path);chosenAction=walk;armature=arms[0];break
if not chosen:raise RuntimeError("No walk action could be resolved from the verified CC0 GLB pack")
armature.animation_data_create();armature.animation_data.action=chosenAction
left=findbone(armature,[r'leftfoot$',r'footleft$',r'leftankle$',r'ankleleft$',r'lfoot$'])
right=findbone(armature,[r'rightfoot$',r'footright$',r'rightankle$',r'ankleright$',r'rfoot$'])
root=findbone(armature,[r'^hips$',r'^pelvis$',r'^root$',r'^mixamorig:hips$'])
if not left or not right or not root:raise RuntimeError("Could not identify bilateral feet and root on CC0 rig: "+str([p.name for p in armature.pose.bones]))
start,end=map(float,chosenAction.frame_range);fps=30;scene=bpy.context.scene;scene.render.fps=fps
frames=[]
for frame in range(math.floor(start),math.ceil(end)+1):
 scene.frame_set(frame);bpy.context.view_layer.update();mw=armature.matrix_world
 def pos(p):return mw@p.matrix.translation
 frames.append({"frame":frame,"root":list(pos(root)),"left":list(pos(left)),"right":list(pos(right))})
allz=[x[s][2] for x in frames for s in ['left','right']];ground=min(allz);height=max((mw@p.matrix).translation.z for p in armature.pose.bones)-min((mw@p.matrix).translation.z for p in armature.pose.bones);height=max(height,.1)
def footstats(key):
 rows=[];windows=[];active=False;first=None;last=None
 for i,x in enumerate(frames):
  p=Vector(x[key]);velocity=0 if i==0 else (p-Vector(frames[i-1][key])).length*fps
  contact=p.z-ground<height*.035 and velocity<height*.08
  rows.append({"frame":x["frame"],"height":p.z-ground,"velocity":velocity,"contact":contact})
  if contact and not active:first=x["frame"];active=True
  if not contact and active:windows.append({"start":first,"end":last});active=False
  if contact:last=x["frame"]
 if active:windows.append({"start":first,"end":last})
 return {"contactRatio":sum(x["contact"] for x in rows)/len(rows),"windows":windows,"samples":rows}
leftStats,rightStats=footstats('left'),footstats('right')
rootTravel=(Vector(frames[-1]['root'])-Vector(frames[0]['root']));rootTravel.z=0
duration=(frames[-1]['frame']-frames[0]['frame'])/fps
authored=json.loads((out/"morph"/"v9-report.json").read_text())["humanMotion"]
authoredRatio=sum(1 for f in json.loads((out/"morph"/"v9-human-contact.json").read_text()) for x in f["feet"] if x["stance"])/max(1,sum(len(f["feet"]) for f in json.loads((out/"morph"/"v9-human-contact.json").read_text())))
report={"source":"KinemIQ Free Game Animations, derived from Quaternius Universal Animation Library","license":"CC0-1.0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/","archive":"KinemIQ_Free_Animations_CC0_GLB.zip","archiveSha256":digest,"sourceFile":chosen[0],"action":chosenAction.name,"rig":armature.name,"fps":fps,"frameRange":[start,end],"sampleFrames":len(frames),"durationSeconds":duration,"heightMetres":height,"rootTravelMetres":rootTravel.length,"rootSpeedMetresPerSecond":rootTravel.length/max(duration,1e-6),"feet":{"left":leftStats,"right":rightStats},"authored":{"clip":"Pocket Works artisan walk v0.9","durationSeconds":1.12,"rootTravelMetres":authored["rootTravelMetres"],"maxHorizontalDrift":authored["maxHorizontalDrift"],"maxGroundError":authored["maxGroundError"],"maxSoleRange":authored["maxSoleRange"],"contactGate":authored["contactGate"],"stanceRatio":authoredRatio},"comparison":{"cc0MeanFootContactRatio":(leftStats["contactRatio"]+rightStats["contactRatio"])/2,"authoredNominalStanceDuty":.62,"rootSpeedDifference":rootTravel.length/max(duration,1e-6)-authored["rootTravelMetres"]/1.12},"note":"Reference clip is measured on its native rig. Contact ratios use normalized foot height and world-space velocity; this is comparative, not a retargeting acceptance test."}
(out/"v9-cc0-motion-comparison.json").write_text(json.dumps(report,indent=2))
print(json.dumps({"clip":chosen[0],"action":chosenAction.name,"frames":len(frames),"speed":report["rootSpeedMetresPerSecond"],"contact":report["comparison"]["cc0MeanFootContactRatio"]}))
