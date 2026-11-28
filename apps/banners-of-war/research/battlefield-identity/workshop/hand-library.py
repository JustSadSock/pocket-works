"""Six static authored poses on the accepted Innerscene skin."""
import os,json
from pathlib import Path
source=Path(__file__).with_name("anatomical-motion.py")
exec(compile(source.read_text().split("# A single-handed sword",1)[0],str(source),"exec"))
folder=Path(os.environ["BOW_ART_OUTPUT"])/"hand-library";folder.mkdir(exist_ok=True)
exec(compile(Path(__file__).with_name("review-cameras.py").read_text(),"review-cameras.py","exec"))
reset()
for o in sc.objects:
    if o.type=="MESH":o.hide_render=True
for pose in json.loads(Path(__file__).with_name("hand-poses.json").read_text()):
    os.environ["BOW_HAND_POSE"]=pose
    c,ax,f,n,w=hand_frame(R)[0];curl_hand(R,c,ax,.012)
    objects=posed_hands[R.name]["objects"]
    for o in objects:o.hide_render=False
    pts=vertices(objects);lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)));hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    center=(lo+hi)*.5;scale=max(.32,(hi-lo).length*1.8)
    for view in ("front","side","angle45","back"):review_render(pose,view,center,scale,preview=True)
    audit.setdefault("poseLibrary",{})[pose]={"fit":posed_hands[R.name]["fit"],"joints":{k:[vec(p) for p in v] for k,v in posed_hands[R.name]["jointWorld"].items()},"approved":False}
    (folder/"pose-library.json").write_text(json.dumps(audit["poseLibrary"],indent=2))
