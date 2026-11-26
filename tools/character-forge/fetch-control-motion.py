import urllib.request,hashlib,os,json
from pathlib import Path
url="https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/09a07f54f3bbb58797325f009282d0b2048a2871/data/035/35_01.bvh"
with urllib.request.urlopen(url,timeout=60) as r:raw=r.read(1000000)
if hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()!="69a4da6da3f96a7ebfd348c931d0bf576f7ac427":raise ValueError("CMU source hash mismatch")
Path("/tmp/character-cmu.bvh").write_bytes(raw)
out=Path(os.environ["CHARACTER_EVIDENCE"]);out.mkdir(parents=True,exist_ok=True)
(out/"mocap-source.json").write_text(json.dumps({"url":url,"sha256":hashlib.sha256(raw).hexdigest(),"source":"CMU Graphics Lab, 35_01; BVH conversion via una-dinosauria","terms":"https://mocap.cs.cmu.edu/faqs.php","researchOnly":True},indent=2))
