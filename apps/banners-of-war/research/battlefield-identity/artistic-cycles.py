"""Encode original rendered frames as timed, unmodified-scale review clips."""
import os,json,subprocess,hashlib,tempfile
from pathlib import Path
from PIL import Image
out=Path(os.environ["BOW_ART_OUTPUT"])
results=[];missing=[]
def encode(kind,name,folder,count,period,pattern,loop=True):
    files=[folder/(pattern%i) for i in range(count)]
    if not all(p.is_file() for p in files):
        missing.append({"role":kind,"motion":name,"available":sum(p.is_file() for p in files),"expected":count})
        return
    if not .15<=period<=8:raise ValueError("Unexpected cycle period "+str((kind,name,period)))
    # Use a neutral studio floor colour and keep original pixels at their native size.
    # The only operation is alpha compositing; no generative enhancement or interpolation.
    with tempfile.TemporaryDirectory() as d:
        tmp=Path(d);loops=3 if loop else 1
        for i in range(count*loops):
            with Image.open(files[i%count]) as src:
                im=Image.new("RGBA",src.size,(157,163,137,255));im.alpha_composite(src.convert("RGBA"));im.convert("RGB").save(tmp/("%04d.png"%i))
        file=out/("cycle-"+kind+"-"+name+".mp4")
        subprocess.run(["ffmpeg","-v","error","-y","-framerate",str(count/period),"-i",str(tmp/"%04d.png"),"-c:v","libx264","-preset","fast","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart",str(file)],check=True)
        probe=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(file)]))
        duration=float(probe["format"]["duration"])
        if abs(duration-period*loops)>max(.2,period/count):raise ValueError("Video timing mismatch "+file.name)
        results.append({"role":kind,"motion":name,"periodSeconds":period,"loops":loops,"framesPerCycle":count,"duration":duration,"file":file.name,"sourceSHA256":[hashlib.sha256(p.read_bytes()).hexdigest() for p in files]})
for kind in ("spear","sword","archer"):
    folder=out/kind/"artistic-preview"
    for name,count,period in (("march",12,1.15),("combat",16,1.45 if kind!="archer" else 2.2),("defence",12,1.25)):
        encode(kind,name,folder,count,period,name+"-%02d.png")
for kind in ("knight","lightHorse"):
    folder=out/kind/"gait-diagnostic";report=out/kind/"horse-rig-preflight.json"
    periods=json.loads(report.read_text()).get("diagnosticPeriodsSeconds",{}) if report.is_file() else {}
    for name in ("walk","trot","gallop","charge"):
        if name in periods:encode(kind,name,folder,8,periods[name],name+"-%d.png",loop=name!="charge")
        else:missing.append({"role":kind,"motion":name,"reason":"validated diagnostic period absent"})
(out/"artistic-cycle-index.json").write_text(json.dumps({"clips":results,"missing":missing,"sourceFramesRetained":True},indent=2))
print("Artistic cycle evidence:",len(results),"videos;",len(missing),"missing")
if missing:raise SystemExit("Incomplete artistic evidence; partial clips retained")
