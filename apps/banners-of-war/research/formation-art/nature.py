"""Reuse accepted surface bytes and prepare small licensed models through Universal Art Forge."""
import json,os,hashlib,urllib.request,sys,shutil,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[4];sys.path.insert(0,str(root/"tools/art-forge"))
from forge import build,capabilities
out=Path(os.environ["BOW_ART_OUTPUT"]);work=Path("/tmp/bow-composition-nature");work.mkdir(exist_ok=True)
baseline=Path("/tmp/bow-terrain-baseline")
for name in ["grass.png","sparse.png","road.png","stone.png","terrain-provenance.json"]:
    found=list(baseline.rglob(name))
    if len(found)!=1:raise ValueError("Missing accepted terrain asset "+name)
    shutil.copyfile(found[0],out/name)
sources=json.loads((out/"terrain-provenance.json").read_text())
source_base="https://raw.githubusercontent.com/anshaneja5/skyline-run/0c41526d8d4130c37c15e219c2c3737fa8cb4ad8/public/assets/models/"
def get(name,limit=2*1024*1024):
    req=urllib.request.Request(source_base+name,headers={"User-Agent":"PocketWorks CC0 asset reference"})
    with urllib.request.urlopen(req,timeout=60) as r:raw=r.read(limit+1)
    if len(raw)>limit:raise ValueError("Asset exceeds 2 MiB: "+name)
    return raw
(work/"asset-forge").mkdir(exist_ok=True)
shutil.copyfile(Path(__file__).with_name("tree-author.py"),work/"asset-forge/author.py")
jobs=[]
for kind,expected in [("tree1","80bd662cc51f983986f4e201463dc3a729a6cd4a"),("tree2","0197de65879eb650247c8d56ac52da34489938cb"),("tree3","828786b4bdb5224a8b3672f5e5d6cebe1c65bd93"),("bush","84b4153c17e988a658e56d4093b0028d1b034c3f")]:
    name=kind+".glb";raw=get(name)
    git_hash=hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
    if git_hash!=expected or raw[:4]!=b"glTF":raise ValueError("Unverified model "+name)
    (work/"asset-forge"/name).write_bytes(raw)
    sources.append({"id":kind,"author":"Quaternius","license":"CC0","origin":"https://quaternius.itch.io/stylized-nature-megakit","url":source_base+name,"sha256":hashlib.sha256(raw).hexdigest(),"sourceBytes":len(raw)})
    jobs.append({"id":kind,"adapter":"blender","source":"asset-forge/author.py","inputs":["asset-forge/"+name],"dependsOn":[],"seed":17,"parameters":{"kind":kind},"outputs":{"model":"public/"+name,"editable":"asset-forge/generated/"+kind+".blend"},"budget":{"maxTriangles":80000,"maxTextureSize":512,"maxBytes":4000000},"provenance":{"author":"Quaternius","license":"CC0","origin":source_base+name}})
build(work,{"version":2,"runtimeRoot":"public","index":"public/index.json","jobs":jobs},capabilities({"blender":os.environ["BLENDER"]}),trusted=True)
for job in jobs:
    kind=job["id"]
    subprocess.run([os.environ["BLENDER"],"--background","--disable-autoexec",str(work/job["outputs"]["editable"]),"--python-exit-code","1","--python",str(Path(__file__).with_name("tree.py"))],env=dict(os.environ,BOW_TREE_KIND=kind),check=True,timeout=300)
shutil.copyfile(work/"public/index.json",out/"nature-forge-index.json")
(out/"terrain-provenance.json").write_text(json.dumps(sources,indent=2))
