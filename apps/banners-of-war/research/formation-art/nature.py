"""Retrieve bounded CC0 textures, record exact source hash, run Forge raster adapter in scratch space."""
import json,os,hashlib,urllib.request,sys
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[4];sys.path.insert(0,str(root/"tools/art-forge"))
from forge import build,capabilities
out=Path(os.environ["BOW_ART_OUTPUT"]);work=Path("/tmp/bow-formation-nature");work.mkdir(exist_ok=True)
def get(url,limit=25000000):
    req=urllib.request.Request(url,headers={"User-Agent":"PocketWorks Formation Art reference (CC0 assets)"})
    with urllib.request.urlopen(req,timeout=90) as r:raw=r.read(limit+1)
    if len(raw)>limit:raise ValueError("Asset exceeds budget")
    return raw
jobs=[];sources=[]
for kind,id in [("grass","leafy_grass"),("sparse","sparse_grass"),("road","grass_path_2"),("stone","aerial_grass_rock")]:
    data=json.loads(get("https://api.polyhaven.com/files/"+id))
    # Poly Haven uses both human-readable channel labels ("Diffuse") and short ids.
    maps=next((v for k,v in data.items() if k.lower().replace("_","").replace(" ","") in {"diff","diffuse","albedo","color","colour","col","basecolor"} and isinstance(v,dict)),None)
    if not maps:raise ValueError("Missing diffuse "+id+"; available channels: "+str(list(data)))
    variants=maps.get("1k") or maps.get("2k") or {}
    entry=variants.get("jpg") or variants.get("png")
    if not entry or not isinstance(entry.get("url"),str):raise ValueError("No supported diffuse export "+id)
    raw=get(entry["url"]);f=work/(kind+".source")
    f.write_bytes(raw);im=Image.open(f).convert("RGBA");im.save(work/(kind+".png"))
    recipe={"size":list(im.size),"layers":[{"input":kind+".png"}]}
    (work/(kind+".json")).write_text(json.dumps(recipe))
    jobs.append({"id":kind,"adapter":"raster","source":kind+".json","inputs":[kind+".png"],"dependsOn":[],"seed":17,"parameters":{"size":[512,512]},"outputs":{"image":"public/"+kind+".png"},"budget":{"maxWidth":1024,"maxHeight":1024,"maxBytes":4000000},"provenance":{"author":"Poly Haven contributors","license":"CC0","origin":"https://polyhaven.com/a/"+id}})
    sources.append({"id":id,"url":entry["url"],"sha256":hashlib.sha256(raw).hexdigest()})
manifest={"version":2,"runtimeRoot":"public","index":"public/index.json","jobs":jobs}
# Forge recipe syntax is validated by platform; no procedural noise fallback.
build(work,manifest,capabilities(),trusted=False)
import shutil
for job in jobs:shutil.copyfile(work/job["outputs"]["image"],out/(job["id"]+".png"))
(out/"terrain-provenance.json").write_text(json.dumps(sources,indent=2))

# A separate foliage source; its actual mesh, not an elliptical canopy, is rasterized.
try:
    data=json.loads(get("https://api.polyhaven.com/files/tree_small_02"))
    spec=data["gltf"]["1k"]["gltf"]
    td=work/"tree";td.mkdir(exist_ok=True)
    def save(rel,entry):
        target=(td/rel).resolve()
        if not target.is_relative_to(td.resolve()):raise ValueError("Unsafe dependency")
        target.parent.mkdir(parents=True,exist_ok=True)
        raw=get(entry["url"],80000000)
        target.write_bytes(raw)
        sources.append({"id":"tree_small_02","url":entry["url"],"sha256":hashlib.sha256(raw).hexdigest()})
    save("tree.gltf",spec)
    for name,entry in spec.get("include",{}).items():save(name,entry)
    import subprocess
    env=dict(os.environ,BOW_TREE_SOURCE=str(td/"tree.gltf"))
    subprocess.run([os.environ["BLENDER"],"--background","--factory-startup","--python-exit-code","1","--python",str(Path(__file__).with_name("tree.py"))],env=env,check=True,timeout=600)
except Exception as e:
    (out/"tree-blocker.json").write_text(json.dumps({"error":str(e),"fallback":"none; foliage omitted rather than fabricated"}))
(out/"terrain-provenance.json").write_text(json.dumps(sources,indent=2))
