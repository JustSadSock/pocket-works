from pathlib import Path
from PIL import Image,ImageDraw
import subprocess,json,os
out=Path(os.environ["CHARACTER_EVIDENCE"]);folder=out/"v9-cloth-motion"
subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-framerate","24","-i",str(folder/"%02d.png"),"-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(out/"v9-merchant-cloth-walk.mp4")],check=True)
indices=[0,6,12,18,24];items=[]
for i in indices:
 p=folder/(str(i).zfill(2)+".png");items.append((i,p))
size=480;im=Image.new("RGB",(size*len(items),size+30),"#dedad0");d=ImageDraw.Draw(im)
for k,(frame,path) in enumerate(items):
 a=Image.open(path).convert("RGBA");a.thumbnail((size,size));im.paste(a,(k*size+(size-a.width)//2,30+(size-a.height)//2),a);d.text((k*size+10,8),"Frame "+str(frame),fill="#30352e")
im.save(out/"v9-merchant-cloth-key-phases.png")
