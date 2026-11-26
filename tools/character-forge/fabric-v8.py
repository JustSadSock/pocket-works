"""Bounded CC0 photographed linen input, verified against Poly Haven file metadata."""
import os,json,urllib.request,hashlib,base64,io
from pathlib import Path
from PIL import Image,ImageFilter
out=Path(os.environ["CHARACTER_EVIDENCE"])
def fetch(url,limit):
    req=urllib.request.Request(url,headers={"User-Agent":"Pocket Works Character Forge research (CC0 materials)"})
    with urllib.request.urlopen(req,timeout=45) as r: data=r.read(limit+1)
    if len(data)>limit:raise ValueError("Asset size limit exceeded")
    return data
api="https://api.polyhaven.com/files/rough_linen"
files=json.loads(fetch(api,2_000_000))
record={"asset":"rough_linen","page":"https://polyhaven.com/a/rough_linen","license":"CC0-1.0","authors":["colormass (photography)","Rico Cilliers (processing)"],"api":api,"files":{}}
channels={}
for name,channel in [("diff","color"),("nor_gl","normal"),("rough","roughness")]:
    entry=files[name]["1k"]["jpg"];data=fetch(entry["url"],12_000_000)
    if entry.get("md5") and hashlib.md5(data).hexdigest()!=entry["md5"]:raise ValueError("Asset checksum mismatch")
    record["files"][channel]={"url":entry["url"],"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data)}
    (out/("v8-linen-original-"+channel+".jpg")).write_bytes(data)
    im=Image.open(io.BytesIO(data)).convert("RGB").resize((256,256),Image.Resampling.LANCZOS)
    if channel=="color":
        gray=im.convert("L");mean=sum(gray.getdata())/(256*256)
        im=gray.point(lambda x: max(0,min(255,229+(x-mean)*.55))).convert("RGB")
    if channel=="roughness":
        gray=im.convert("L");im=Image.merge("RGB",(Image.new("L",im.size,255),gray,Image.new("L",im.size,0)))
    channels[channel]=base64.b64encode(im.convert("RGBA").tobytes()).decode()
(out/"v8-linen.json").write_text(json.dumps({"size":256,"channels":channels,"provenance":record}))
(out/"v8-linen-provenance.json").write_text(json.dumps(record,indent=2))
