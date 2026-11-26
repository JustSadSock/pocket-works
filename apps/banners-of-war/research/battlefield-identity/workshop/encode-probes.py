"""Encode only complete local source cycles; retain all raw PNGs and diagnostics."""
import json,os,subprocess,tempfile,hashlib
from pathlib import Path
from PIL import Image
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
clips=[];missing=[]
spec={"sword":[("sword/anatomy","march",12,1.08),("sword/anatomy","strike",12,1.5),("sword/anatomy","fast",8,.84),("sword/anatomy","cautious",8,1.60),("sword/anatomy","combat-walk",8,1.38)],"archer":[("archer/archer-anatomy","shot",16,2.2)],"retarget":[("sword/retarget","retarget-march",12,1.08)]}
for folder,name,count,period in spec[os.environ["BOW_WORKSHOP_JOB"]]:
    folder=out/folder
    if name=="retarget-march" and (folder/"anatomy-audit.json").is_file():
        data=json.loads((folder/"anatomy-audit.json").read_text());period=data.get("retarget",{}).get("periodSeconds",period)
    frames=[folder/("%s-%02d.png"%(name,i)) for i in range(count)]
    if not all(f.is_file() for f in frames):
        missing.append({"motion":name,"available":sum(f.is_file() for f in frames),"expected":count});continue
    with tempfile.TemporaryDirectory() as temp:
        temp=Path(temp);loops=3
        for i in range(count*loops):
            with Image.open(frames[i%count]) as im:
                rgb=Image.new("RGBA",im.size,(158,164,140,255));rgb.alpha_composite(im.convert("RGBA"));rgb.convert("RGB").save(temp/("%04d.png"%i))
        video=folder/(name+".mp4")
        subprocess.run(["ffmpeg","-y","-v","error","-framerate",str(count/period),"-i",str(temp/"%04d.png"),"-c:v","libx264","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart",str(video)],check=True)
        clips.append({"motion":name,"file":str(video.relative_to(out)),"period":period,"frames":count,"sourceHashes":[hashlib.sha256(p.read_bytes()).hexdigest() for p in frames]})
(out/"clip-index.json").write_text(json.dumps({"clips":clips,"missing":missing,"rawFramesRetained":True},indent=2))
if missing:raise SystemExit("Incomplete artistic probes")
