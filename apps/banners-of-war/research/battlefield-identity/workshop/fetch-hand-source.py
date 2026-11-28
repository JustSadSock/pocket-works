"""Acquire the exact CC0 MakeHuman-derived articulated hand, never a procedural substitute."""
import hashlib,json,os,struct,urllib.request
from pathlib import Path
url="https://files.innerscene.com/library/posable-anatomical-right-hand-f6098b4f/c28ad5ff8fafd424275f/hand-posable.glb"
page="https://www.innerscene.com/tools/library/3d-parts/posable-anatomical-right-hand-f6098b4f"
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"PocketWorks CC0 anatomy workshop"}),timeout=60) as f:raw=f.read(5*1024*1024+1)
if len(raw)>5*1024*1024 or len(raw)<20:raise ValueError("Hand source size")
magic,version,total,chunk,kind=struct.unpack_from("<4sIIII",raw)
if magic!=b"glTF" or version!=2 or total!=len(raw) or kind!=0x4e4f534a:raise ValueError("Not a complete GLB 2.0")
meta=json.loads(raw[20:20+chunk]);nodes=meta.get("nodes",[]);skins=meta.get("skins",[])
if not skins or not meta.get("meshes") or max(len(s["joints"]) for s in skins)<16:raise ValueError("Missing articulated source skeleton")
path=Path("/tmp/bow-cc0-hand.glb");path.write_bytes(raw)
(out/"hand-source-provenance.json").write_text(json.dumps({"source":url,"page":page,"author":"Innerscene; MakeHuman/MPFB CC0 base","license":"CC0","sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw),"joints":[[nodes[i].get("name",str(i)) for i in s["joints"]] for s in skins],"use":"isolated art candidate only; retain source body"},indent=2))
