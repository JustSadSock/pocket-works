"""Rasterize original SVG candidates; actual-size sprite strips and neutral
multi-camera evidence. No generated illustration replaces the model."""
import os,subprocess,json,time
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(os.environ["CHARACTER_EVIDENCE"])
t=time.perf_counter()
for f in out.rglob("*.svg"):subprocess.run(["rsvg-convert",str(f),"-o",str(f.with_suffix(".png"))],check=True)
rasterMs=(time.perf_counter()-t)*1000
def board(names,file,cols=3):
    paths=[(out/(n+".png"),n) for n in names]
    if not all(p.is_file() for p,n in paths):return
    w,h=480,500;im=Image.new("RGB",(w*cols,h*((len(paths)+cols-1)//cols)),"#dedbd0");d=ImageDraw.Draw(im)
    for i,(p,n) in enumerate(paths):
        a=Image.open(p).convert("RGB");a.thumbnail((w,h-30));x=i%cols*w;y=i//cols*h;im.paste(a,(x+(w-a.width)//2,y+26));d.text((x+8,y+7),n,fill="#30342d")
    im.save(out/file)
board(["method-"+m+"-"+v for v in ("front","side","three-quarter") for m in ("pattern","template","hybrid")],"garment-methods.png")
board(["identity-"+n+"-three-quarter" for n in ("base","young-woman","older-woman","older-man","tall-heavy","short-light")],"six-identities.png",3)
for kit in ("tunic","warrior"):
    board(["style-"+kit+"-"+s+"-"+v for v in ("front","side","three-quarter") for s in ("low-poly","historical-miniature","anatomical-realism")],kit+"-styles.png")
for name,variants in [("horse",("base","courser","draft","pony","elder")),("elephant",("base","massive","compact","longTrunk","light"))]:
    board([name+"-"+n+"-side" for n in variants],name+"-morphs.png",5)
    board([name+"-"+r+"-"+v for v in ("front","side","three-quarter") for r in ("old","new")],name+"-anatomy.png",2)
    board(["source-"+name+"-"+n+"-side" for n in (("base","draft","courser") if name=="horse" else ("base","massive","light"))],name+"-source-morphs.png",3)
for view in ("front","side"):
    board([r+"-"+v+"-"+view for r in ("static","phase-0","phase-4","phase-8","phase-12") for v in ("source","target")],"retarget-"+view+".png",2)
    if (out/("cycle-00-target-"+view+".png")).exists():
        subprocess.run(["ffmpeg","-y","-v","error","-framerate","16","-i",str(out/("cycle-%02d-target-"+view+".png")),"-c:v","libx264","-pix_fmt","yuv420p",str(out/("retarget-"+view+".mp4"))],check=True)
for folder in out.glob("sprites-*"):
    data=json.loads((folder/"metadata.json").read_text());size=data["size"];t=time.perf_counter();atlas=Image.new("RGBA",(data["atlasWidth"],data["atlasHeight"]))
    for f in data["frames"]:
        im=Image.open(folder/(str(f["direction"])+"-"+str(f["index"])+".png")).convert("RGBA");atlas.paste(im,(f["rect"][0],f["rect"][1]))
    atlas.save(folder/"atlas.png");data["atlasBytes"]=(folder/"atlas.png").stat().st_size;data["packMs"]=(time.perf_counter()-t)*1000;(folder/"metadata.json").write_text(json.dumps(data,indent=2))
for folder in out.glob("*-motion"):
    for view in ("front","side"):
        if (folder/(view+"-00.png")).exists():subprocess.run(["ffmpeg","-y","-v","error","-framerate","8" if folder.name.startswith("garment-") else "16","-i",str(folder/(view+"-%02d.png")),"-c:v","libx264","-pix_fmt","yuv420p",str(out/(folder.name+"-"+view+".mp4"))],check=True)
files=sorted(out.glob("readability-*.png"))
if files:
    # Exact-size pixel footprints, no rescaling up in the result.
    w=900;row=156;im=Image.new("RGB",(w,row*len(files)+28),"#b0b3a1");d=ImageDraw.Draw(im);metrics=[]
    for x,s in zip((335,400,488,620),(18,32,64,128)):d.text((x,5),str(s)+" px",fill="#30342d")
    for i,p in enumerate(files):
        src=Image.open(p).convert("RGBA");y=28+row*i;d.text((8,y+65),p.stem[12:],fill="#30342d")
        for x,s in zip((335,400,488,620),(18,32,64,128)):
            a=src.resize((s,s),Image.Resampling.LANCZOS);im.paste(a,(x,y+(row-s)//2),a);alpha=a.getchannel("A");metrics.append({"frame":p.stem,"size":s,"alphaBounds":alpha.getbbox(),"occupiedPixels":sum(1 for v in alpha.getdata() if v>127)})
    im.save(out/"actual-size-readability.png");(out/"readability-metrics.json").write_text(json.dumps(metrics,indent=2))
(out/"raster-v4.json").write_text(json.dumps({"rasterMs":rasterMs,"svgCount":len(list(out.rglob("*.svg")))},indent=2))
