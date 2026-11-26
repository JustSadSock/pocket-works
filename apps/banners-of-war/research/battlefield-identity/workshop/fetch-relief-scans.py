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
    for kind in ("diff","disp"):
        entry=meta[kind]["1k"].get("jpg")
        if not entry:raise ValueError("Missing verified 1K JPEG "+name+" "+kind)
        raw=get(entry["url"],8000000)
        if entry.get("size") and len(raw)!=entry["size"]:raise ValueError("Scan size mismatch")
        if not entry.get("md5") or hashlib.md5(raw).hexdigest()!=entry["md5"]:raise ValueError("Scan digest mismatch")
        if raw[:2]!=b"\xff\xd8":raise ValueError("Expected JPEG")
        (out/(name+"-"+kind+".jpg")).write_bytes(raw)
        records.append({"asset":name,"map":kind,"source":entry["url"],"sha256":hashlib.sha256(raw).hexdigest(),"license":"CC0","page":"https://polyhaven.com/a/"+name})
(out/"local-scans.json").write_text(json.dumps(records,indent=2))
