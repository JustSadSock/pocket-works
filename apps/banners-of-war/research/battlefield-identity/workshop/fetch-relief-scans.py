"""Fetch bounded 1K source scans from Poly Haven, checking provider digests."""
import json,urllib.request,hashlib,os
from pathlib import Path
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
def get(url,limit):
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"PocketWorks workshop (CC0 source review)"}),timeout=60) as f:data=f.read(limit+1)
    if len(data)>limit:raise ValueError("File budget exceeded")
    return data
records=[]
for name in ("forest_floor","stony_dirt_path"):
    api="https://api.polyhaven.com/files/"+name
    meta=json.loads(get(api,2000000))
    # API map labels are Diffuse and Displacement; filename suffixes are diff/disp.
    # Record the complete provider schema and resolve only semantically equivalent maps.
    (out/(name+"-provider-schema.json")).write_text(json.dumps(meta,indent=2))
    for kind,aliases in (("diff",("diffuse","diff","albedo","basecolor")),("disp",("displacement","disp","height"))):
        keys=[k for k in meta if k.lower().replace("_","").replace(" ","") in aliases]
        if len(keys)!=1:raise ValueError("Missing or ambiguous "+kind+" map for "+name+": "+str(list(meta)))
        formats=meta[keys[0]].get("1k",{})
        ext=next((k for k in ("jpg","png","exr") if k in formats),None)
        if ext is None:raise ValueError("No verified 1K format "+name+" "+kind+": "+str(list(formats)))
        entry=formats[ext]
        raw=get(entry["url"],8000000)
        if entry.get("size") and len(raw)!=entry["size"]:raise ValueError("Scan size mismatch")
        if not entry.get("md5") or hashlib.md5(raw).hexdigest()!=entry["md5"]:raise ValueError("Scan digest mismatch")
        signatures={"jpg":b"\xff\xd8","png":b"\x89PNG\r\n\x1a\n","exr":b"\x76\x2f\x31\x01"}
        if not raw.startswith(signatures[ext]):raise ValueError("File format mismatch "+ext)
        filename=name+"-"+kind+"."+ext
        (out/filename).write_bytes(raw)
        records.append({"asset":name,"map":kind,"providerMap":keys[0],"file":filename,"source":entry["url"],"sha256":hashlib.sha256(raw).hexdigest(),"license":"CC0","page":"https://polyhaven.com/a/"+name})
(out/"local-scans.json").write_text(json.dumps(records,indent=2))
