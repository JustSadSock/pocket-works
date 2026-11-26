"""Compare same physical patch and projection to the rejected Workshop II original."""
import os,json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
out=Path(os.environ["BOW_ART_OUTPUT"]);old=Path("/tmp/bow-relief-control")
def find(name):
    p=list(old.rglob(name))
    if len(p)!=1:raise ValueError("Missing unique control "+name)
    return p[0]
a=json.loads(find("relief-study.json").read_text());b=json.loads((out/"relief-study.json").read_text())
if a["physicalHash"]!=b["physicalHash"] or a["camera"]!=b["camera"]:raise ValueError("Control scene mismatch")
p=find("historic-relief-tactical.png");q=out/"historic-relief-tactical.png"
im=Image.new("RGB",(1920,720),"#d7d9d0");d=ImageDraw.Draw(im);font=ImageFont.truetype("DejaVuSans.ttf",24)
for x,name,src in [(0,"Workshop II — rejected",p),(960,"Workshop III — local study",q)]:
    with Image.open(src) as a0:
        pic=a0.convert("RGB");pic.thumbnail((950,640),Image.Resampling.LANCZOS);im.paste(pic,(x+5,55))
    d.text((x+18,15),name,font=font,fill="#28312b")
im.save(out/"matched-relief-comparison.png")
(out/"matched-relief.json").write_text(json.dumps({"samePhysicalHash":True,"sameCamera":True,"controlSHA256":hashlib.sha256(p.read_bytes()).hexdigest(),"candidateSHA256":hashlib.sha256(q.read_bytes()).hexdigest(),"controlArtifact":15081585122,"artisticApproval":False},indent=2))
