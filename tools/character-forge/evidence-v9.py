"""Original v0.9 evidence boards and motion videos; no generated art substitutes."""
import json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(__import__('os').environ["CHARACTER_EVIDENCE"])
roles=["artisan","merchant","infantry","legionary"]
def board(items,filename,cols=4,size=512,bg="#dedad0"):
 rows=(len(items)+cols-1)//cols;im=Image.new("RGB",(size*cols,(size+30)*rows),bg);d=ImageDraw.Draw(im)
 for i,(label,path) in enumerate(items):
  x=i%cols*size;y=i//cols*(size+30);a=Image.open(path).convert("RGBA");a.thumbnail((size,size),Image.Resampling.LANCZOS);im.paste(a,(x+(size-a.width)//2,y+30+(size-a.height)//2),a);d.text((x+10,y+8),label,fill="#30352e")
 im.save(out/filename)
for view in ["front","side","back","three-quarter"]:
 board([(r,out/("v9-"+r+"-"+view+".png")) for r in roles],"v9-roles-"+view+".png",4,512)
for kind in ["head","cloth","metal"]:
 board([(r,out/("v9-"+r+"-close-"+kind+".png")) for r in roles if (out/("v9-"+r+"-close-"+kind+".png")).exists()],"v9-closeups-"+kind+".png",4,512)
morphs=["base","young-woman","older-woman","older-man","tall-heavy","short-light"]
board([(x,out/("v9-morph-"+x+"-matched.png")) for x in morphs],"v9-morph-six.png",3,420)
board([("historical-miniature",out/"v9-merchant-three-quarter.png"),("low-poly",out/"v9-merchant-low-poly.png")],"v9-style-merchant.png",2,640)
for view in ["front","side","back","three-quarter"]:
 for size in [18,32,64,128]:
  board([(r,out/("v9-silhouette-"+r+"-"+view+"-"+str(size)+".png")) for r in roles],"v9-silhouettes-"+view+"-"+str(size)+".png",4,180,bg="#e8e6df")
folder=out/"v9-human-motion"
subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-framerate","24","-i",str(folder/"%02d.png"),"-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(out/"v9-human-walk-1x.mp4")],check=True)
subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",str(out/"v9-human-walk-1x.mp4"),"-filter:v","setpts=2*PTS","-r","24","-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(out/"v9-human-walk-05x.mp4")],check=True)
board([(str(i/24),folder/(str(i).zfill(2)+".png")) for i in [0,3,6,9,12,15,18,21,24]],"v9-human-walk-key-phases.png",3,384)
report=json.loads((out/"v9-report.json").read_text())
metrics=json.loads((out/"v9-silhouette-iou.json").read_text())
(out/"v9-evidence-index.json").write_text(json.dumps({"roles":roles,"views":["front","side","back","three-quarter"],"silhouetteSizes":[18,32,64,128],"silhouettePairCount":len(metrics),"morphs":morphs,"humanVideos":["v9-human-walk-1x.mp4","v9-human-walk-05x.mp4"],"clothInput":report["cloth"],"contact":report["humanMotion"]["contactGate"]},indent=2))
