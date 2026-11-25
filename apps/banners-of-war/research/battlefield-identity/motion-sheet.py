"""Independent source-resolution motion sheet. Never modify source PNGs."""
import json,os
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
out=Path(os.environ["BOW_ART_OUTPUT"]);kinds=["spear","sword","archer","knight","lightHorse"]
names={1:"Ready",5:"Walk 1",9:"Walk 2",13:"Walk 3",17:"Walk 4",21:"Defence",25:"Prepare attack / draw",29:"Attack / hold",33:"Contact / release",37:"Follow-through",41:"Fast gait 1",45:"Fast gait 2",49:"Fast gait 3",53:"Fast gait 4",57:"Prepare",61:"Recover",65:"Trot 1",69:"Trot 2",73:"Trot 3",77:"Trot 4"}
ppm=42;W=320;H=245;font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",13)
def sheet(types,frames,name):
    im=Image.new("RGB",(W*len(types),H*len(frames)+35),"#a5aa90");d=ImageDraw.Draw(im)
    for i,k in enumerate(types):
        meta=json.loads((out/k/"frames.json").read_text())
        assert meta["motionRevision"]==1
        d.text((i*W+9,8),k,font=font,fill="#1c241b")
        for j,f in enumerate(frames):
            key=f"0-2-{f}";e=meta["frames"][key];src=Image.open(out/k/(key+".png")).convert("RGBA");b=src.getchannel("A").getbbox();assert b
            src=src.crop(b);scale=ppm/e["pixelsPerMetre"];src=src.resize((max(1,round(src.width*scale)),max(1,round(src.height*scale))),Image.Resampling.LANCZOS)
            x=round(i*W+W/2-(e["anchor"][0]-b[0])*scale);y=round(j*H+35+H*.73-(e["anchor"][1]-b[1])*scale)
            assert x>=i*W and x+src.width<=(i+1)*W and y>=j*H+35 and y+src.height<=(j+1)*H+35,(k,f,x,y)
            d.line((i*W+4,j*H+35+int(H*.73),(i+1)*W-4,j*H+35+int(H*.73)),fill="#68745c")
            im.paste(src,(x,y),src);d.text((i*W+8,(j+1)*H+13),names[f],font=font,fill="#1c241b")
    im.save(out/name)
sheet(kinds,list(names)[:16],"source-motion-five-roles.png");sheet(["knight","lightHorse"],list(names)[16:],"source-trot-diagonal.png")
