"""Resolve one actual CMU BVH capture, verify the source blob, keep raw data temporary."""
import json,urllib.request,hashlib,os
from pathlib import Path
def get(url,limit):
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"PocketWorks isolated research workshop"}),timeout=45) as r:data=r.read(limit+1)
    if len(data)>limit:raise ValueError("Source exceeds budget")
    return data
base="https://api.github.com/repos/una-dinosauria/cmu-mocap"
branch=json.loads(get(base+"/branches/master",500000))
rev=branch["commit"]["sha"]
tree=json.loads(get(base+"/git/trees/"+rev+"?recursive=1",12000000))
if tree.get("truncated"):raise ValueError("Truncated source inventory")
files=[x for x in tree["tree"] if x["path"].split("/")[-1].lower()=="35_01.bvh" and x["type"]=="blob"]
if len(files)!=1:raise ValueError("Cannot resolve exact CMU clip 35_01")
entry=files[0];url="https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/"+rev+"/"+entry["path"]
raw=get(url,20000000)
if not raw.startswith(b"HIERARCHY") or hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()!=entry["sha"]:raise ValueError("Unverified BVH")
path=Path("/tmp/bow-cmu-35_01.bvh");path.write_bytes(raw)
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
(out/"mocap-provenance.json").write_text(json.dumps({"clip":"35_01","source":"Carnegie Mellon Graphics Lab","original":"https://mocap.cs.cmu.edu/","conversion":"Bruce Hahne BVH via una-dinosauria/cmu-mocap","url":url,"commit":rev,"blob":entry["sha"],"sha256":hashlib.sha256(raw).hexdigest(),"use":"isolated research comparison; no raw asset distribution or game integration","terms":"https://mocap.cs.cmu.edu/faqs.php"},indent=2))
print(path)
