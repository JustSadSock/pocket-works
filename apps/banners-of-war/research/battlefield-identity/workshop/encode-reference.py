"""Short two-view A/B comparison, retain original frames and exact clip duration."""
import os,json,subprocess,tempfile
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(os.environ["BOW_ART_OUTPUT"]);p=out/"motion-comparison.json"
if not p.is_file():raise ValueError("No original comparison result")
d=json.loads(p.read_text());n=len(d["records"])
for view in ("front","side"):
    with tempfile.TemporaryDirectory() as td:
        temp=Path(td)
        for i in range(n):
            files=[out/("%s-%02d-%s.png"%(s,i,view)) for s in ("A","B")]
            if not all(f.is_file() for f in files):raise ValueError("Incomplete original comparison frames")
            board=Image.new("RGB",(1920,580),"#c3c6bb");draw=ImageDraw.Draw(board)
            for j,f in enumerate(files):
                im=Image.open(f).convert("RGBA");bg=Image.new("RGBA",im.size,"#9aa297");bg.alpha_composite(im);board.paste(bg.convert("RGB"),(j*960,40))
                draw.text((j*960+12,12),("A — native source" if j==0 else "B — unarmed retarget")+" / "+view,fill="black")
            board.save(temp/("%03d.png"%i))
        subprocess.run(["ffmpeg","-y","-v","error","-framerate",str((n-1)/max(.1,d["duration"])),"-i",str(temp/"%03d.png"),"-c:v","libx264","-pix_fmt","yuv420p","-r","24","-movflags","+faststart",str(out/("AB-"+view+".mp4"))],check=True)
