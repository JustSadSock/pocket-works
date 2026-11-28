"""Render original SVG evidence to PNG, compose neutral sheets, create atlas/video."""
import os,subprocess,json
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(os.environ["CHARACTER_EVIDENCE"])
def png(p):
    q=p.with_suffix(".png")
    subprocess.run(["rsvg-convert",str(p),"-o",str(q)],check=True);return q
for p in root.rglob("*.svg"):png(p)
def board(paths,name,columns):
    w=480;h=500;out=Image.new("RGB",(w*columns,h*((len(paths)+columns-1)//columns)),"#dedbd0");d=ImageDraw.Draw(out)
    for i,(p,label) in enumerate(paths):
        im=Image.open(p).convert("RGB");im.thumbnail((w,h-25));x=i%columns*w;y=i//columns*h;out.paste(im,(x+(w-im.width)//2,y+22));d.text((x+10,y+5),label,fill="#292e28")
    out.save(root/name)
for r in ("citizen","swordsman","horse","elephant"):
    board([(root/(r+"-"+s+"-"+l)/"preview.png",s+" / "+l) for s in ("low-poly","historical-miniature","anatomical-realism") for l in ("low","medium","high")],r+"-style-lod.png",3)
for r in ("citizen","swordsman","rider","elephant"):
    tags=("v01","v02","legacy-rings","implicit") if r in ("citizen","swordsman") else ("v01","v02")
    board([(root/(r+"-compare-"+tag+"-"+view+".png"),tag+" / "+view) for view in ("front","side","three-quarter") for tag in tags],r+"-geometry-comparison.png",len(tags))
board([(root/("variant-"+str(i)+".png"),"Morphology "+str(i+1)) for i in range(3)],"morphology-variants.png",3)
for r in ("citizen","horse","elephant","rider","bird"):
    subprocess.run(["ffmpeg","-y","-v","error","-framerate","16","-i",str(root/(r+"-motion")/"frame-%02d.png"),"-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(root/(r+"-motion.mp4"))],check=True)
atlas=Image.new("RGBA",(128*8,128))
for i in range(8):atlas.paste(Image.open(root/"group"/("pose-"+str(i)+".png")).convert("RGBA"),(i*128,0))
atlas.save(root/"group"/"atlas.png")
