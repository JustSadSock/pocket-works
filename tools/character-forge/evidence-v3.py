import os,subprocess,json,time
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(os.environ["CHARACTER_EVIDENCE"])
for f in out.rglob("*.svg"):
    subprocess.run(["rsvg-convert",str(f),"-o",str(f.with_suffix(".png"))],check=True)
def board(names,filename,cols=3):
    paths=[(out/(n+".png"),n) for n in names]
    if not all(p.is_file() for p,n in paths):return
    w,h=480,500;im=Image.new("RGB",(w*cols,h*((len(paths)+cols-1)//cols)),"#dedbd0");d=ImageDraw.Draw(im)
    for i,(p,n) in enumerate(paths):
        tile=Image.open(p).convert("RGB");tile.thumbnail((w,h-30));x=i%cols*w;y=i//cols*h;im.paste(tile,(x+(w-tile.width)//2,y+26));d.text((x+8,y+7),n,fill="#30342d")
    im.save(out/filename)
board(["standard-"+s+"-"+v for v in ("front","side","three-quarter") for s in ("low-poly","historical-miniature","anatomical-realism")],"artistic-standards.png")
board(["native-citizen-front","standard-anatomical-realism-front","standard-historical-miniature-front","source-warrior-front"],"human-comparison.png",4)
board(["morph-"+n+"-front" for n in ("base","young-woman","older-woman","older-man","tall-heavy","short-light")],"human-morphs.png",3)
for name,variants in [("horse",("base","courser","draft","pony","elder")),("elephant",("base","massive","compact","longTrunk","light"))]:
    board([name+"-"+n+"-side" for n in variants],name+"-morphs.png",5)
    board([name+"-"+r+"-"+v for v in ("front","side","three-quarter") for r in ("old","new")],name+"-anatomy.png",2)
for folder in out.glob("sprites-*"):
    data=json.loads((folder/"metadata.json").read_text());size=data["size"];t=time.perf_counter();atlas=Image.new("RGBA",(data["atlasWidth"],data["atlasHeight"]))
    for f in data["frames"]:
        im=Image.open(folder/(str(f["direction"])+"-"+str(f["index"])+".png")).convert("RGBA");atlas.paste(im,(f["rect"][0],f["rect"][1]))
    atlas.save(folder/"atlas.png");data["atlasBytes"]=(folder/"atlas.png").stat().st_size;data["packMs"]=(time.perf_counter()-t)*1000;(folder/"metadata.json").write_text(json.dumps(data,indent=2))
for folder in out.glob("*-motion"):
    for view in ("front","side"):
        if (folder/(view+"-00.png")).exists():subprocess.run(["ffmpeg","-y","-v","error","-framerate","16","-i",str(folder/(view+"-%02d.png")),"-c:v","libx264","-pix_fmt","yuv420p",str(out/(folder.name+"-"+view+".mp4"))],check=True)
if (out/"capture-front-00.png").exists():
    for view in ("front","side"):
        board([r+"-"+view+"-"+str(i).zfill(2) for i in (0,4,8,12) for r in ("procedural","capture")],"capture-"+view+"-comparison.png",2)
