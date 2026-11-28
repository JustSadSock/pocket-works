"""Compose original v8 evidence, no generated illustrations or visual substitution."""
import os,json,subprocess,time
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(os.environ["CHARACTER_EVIDENCE"]);start=time.perf_counter()
roles=["artisan","merchant","infantry","legionary"]
def board(names,filename,cols=4,size=512):
    rows=(len(names)+cols-1)//cols
    im=Image.new("RGB",(size*cols,(size+28)*rows),"#dedad0");d=ImageDraw.Draw(im)
    for i,(label,path) in enumerate(names):
        x=i%cols*size;y=i//cols*(size+28)
        a=Image.open(path).convert("RGB");a.thumbnail((size,size),Image.Resampling.LANCZOS)
        im.paste(a,(x+(size-a.width)//2,y+28+(size-a.height)//2));d.text((x+12,y+7),label,fill="#393a32")
    im.save(out/filename)
for view in ["front","side","three-quarter"]:
    board([(r,out/("v8-"+r+"-"+view+".png")) for r in roles],"v8-roles-"+view+".png")
morphs=json.loads((out/"v8-report.json").read_text())["morphs"]
board([(r["name"],out/("v8-morph-"+r["name"]+".png")) for r in morphs if r["passed"]],"v8-morphs.png",3,420)
material=[(c,out/("v8-fabric-"+c+"-comparison.png")) for c in "ABC" if (out/("v8-fabric-"+c+"-comparison.png")).exists()]
board(material,"v8-fabric-comparison.png",3,640)
for r in roles:
    im=Image.open(out/("v8-"+r+"-three-quarter.png"));w,h=im.size
    for n,b in {"head":(.23,.04,.77,.31),"torso":(.19,.18,.82,.64),"hem":(.20,.47,.80,.81)}.items():
        im.crop(tuple(round(x*(w if i%2==0 else h)) for i,x in enumerate(b))).save(out/("v8-"+r+"-close-"+n+".png"))
for kind in ["sprite","silhouette"]:
    boardim=Image.new("RGB",(720,620),"#b2b4a2");d=ImageDraw.Draw(boardim)
    metrics=[]
    for i,r in enumerate(roles):
        d.text((10,30+i*146+54),r,fill="#30352e")
        for j,px in enumerate([18,32,64,128]):
            x=[115,205,320,490][j]
            if i==0:d.text((x,8),str(px)+" px",fill="#30352e")
            im=Image.open(out/("v8-"+r+"-"+kind+".png")).convert("RGBA").resize((px,px),Image.Resampling.LANCZOS)
            im.save(out/("v8-"+r+"-"+kind+"-"+str(px)+".png"));boardim.paste(im,(x,30+i*146+(128-px)//2),im)
            metrics.append({"role":r,"size":px,"opaquePixels":sum(v>127 for v in im.getchannel("A").getdata()),"bounds":im.getchannel("A").getbbox()})
    boardim.save(out/("v8-"+kind+"-actual-size.png"));(out/("v8-"+kind+"-metrics.json")).write_text(json.dumps(metrics,indent=2))
folder=out/"v8-human-motion"
subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-framerate","12","-i",str(folder/"%02d.png"),"-vf","tpad=stop_mode=clone:stop_duration=0.15","-c:v","libx264","-pix_fmt","yuv420p",str(out/"v8-human-walk.mp4")],check=True)
board([(str(i/12),folder/(str(i).zfill(2)+".png")) for i in [0,3,6,9]],"v8-human-key-phases.png",4,384)
(out/"v8-evidence-raster.json").write_text(json.dumps({"compositionMs":(time.perf_counter()-start)*1000},indent=2))
