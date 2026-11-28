"""Historical Miniature candidate: preserve source pixels and physical anchors."""
import os,json,hashlib,subprocess,tempfile
from pathlib import Path
from PIL import Image
out=Path(os.environ["BOW_ART_OUTPUT"])
variant=os.environ["BOW_VARIANT"]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write_json(path,value):path.write_text(json.dumps(value,indent=2)+"\n")
# Terrain material finish is baked once, not an extra runtime filter.
# Preserve authored texture detail, alpha, dimensions, and existing physical geography.
def grade(path,target,strength,contrast):
    im=Image.open(path).convert("RGBA")
    result=[]
    for r,g,b,a in im.getdata():
        lum=.2126*r+.7152*g+.0722*b
        # restrained warm mineral/vegetation palette, retaining texture luminance
        result.append(tuple(round(max(0,min(255,lum+(c-lum)*contrast+(t-128)*strength))) for c,t in zip((r,g,b),target))+(a,))
    im.putdata(result);im.save(path)
assets=["grass","sparse","road","stone","tree1","tree2","tree3","bush"]
before={n:digest(out/(n+".png")) for n in assets}
if variant=="candidate":
    for n,target,strength,contrast in [
      ("grass",(116,142,91),.18,.84),("sparse",(143,143,103),.14,.82),
      ("road",(158,139,110),.13,.83),("stone",(145,142,127),.10,.88),
      ("tree1",(102,137,92),.16,.86),("tree2",(102,137,92),.16,.86),
      ("tree3",(102,137,92),.16,.86),("bush",(107,140,89),.16,.84)]:
        grade(out/(n+".png"),target,strength,contrast)
write_json(out/"recovery-materials.json",{"variant":variant,"before":before,"after":{n:digest(out/(n+".png")) for n in assets},"physicalGeographyChanged":False})
# Source frame video: existing native rig poses, not invented intermediate images.
# Static waiting is explicitly a hold, not a fabricated breathing cycle.
folder=out/"spear";meta=json.loads((folder/"frames.json").read_text())
review=out/"recovery-native";review.mkdir(exist_ok=True)
clips=[]
for name,poses,period in [("march",[5,9,13,17],1.12),("run",[41,45,49,53],.65),("waiting",[1],2),("combat",[25,29,33,37],1.15)]:
    for side in [0,1]:
        for heading in [0,2]:
            files=[folder/f"{side}-{heading}-{f}.png" for f in poses]
            for p in files:
                with Image.open(p) as im:
                    im.verify()
            if len(poses)>1 and len(set(map(digest,files)))<2:raise ValueError("Identical animation frames "+name)
            with tempfile.TemporaryDirectory() as d:
                tmp=Path(d);fps=30;count=round(period*fps);loops=1 if name=="waiting" else 3
                for i in range(count*loops):
                    src=files[min(len(files)-1,(i%count)*len(files)//count)]
                    with Image.open(src) as im:
                        bg=Image.new("RGBA",im.size,(164,165,144,255));bg.alpha_composite(im.convert("RGBA"))
                        bg.convert("RGB").save(tmp/f"{i:04d}.png")
                dest=review/f"{name}-{side}-{heading}.mp4"
                subprocess.run(["ffmpeg","-v","error","-y","-framerate",str(fps),"-i",str(tmp/"%04d.png"),"-vf","pad=ceil(iw/2)*2:ceil(ih/2)*2","-c:v","libx264","-crf","18","-pix_fmt","yuv420p",str(dest)],check=True)
            clips.append({"motion":name,"side":side,"heading":heading,"file":dest.name,"nativePoses":poses,"sha256":[digest(p) for p in files],"durationSeconds":count*loops/fps,"interpolation":False})
write_json(review/"index.json",{"variant":variant,"clips":clips,"source":"Existing Banners spearman rig and source poses; waiting is a held pose, run is existing authored rapid gait.","motionRevision":meta.get("motionRevision")})
