"""Project Blender BVH triangle IDs onto native visibility, using system Pillow."""
import json,sys
from array import array
from pathlib import Path
from PIL import Image
spec=json.loads(Path(sys.argv[1]).read_text())
risks={k:set(v) for k,v in spec["risks"].items()}
seams={k:set(v) for k,v in spec["seams"].items()}
im=Image.open(spec["image"]).convert("RGBA")
owners=array("I");owners.frombytes(Path(spec["ownership"]).read_bytes())
if sys.byteorder!="little":owners.byteswap()
pixels=list(im.getdata())
assert len(pixels)==len(owners)
counts={"risk":0,"attachment":0}
for k,v in enumerate(owners):
    if v==0xffffffff:continue
    name=spec["names"][v>>24];tri=v&0xffffff
    if tri in risks.get(name,()):
        pixels[k]=(220,53,46,255);counts["risk"]+=1
    elif tri in seams.get(name,()):
        pixels[k]=(226,174,45,255);counts["attachment"]+=1
im.putdata(pixels);im.save(spec["output"])
print(json.dumps(counts))
