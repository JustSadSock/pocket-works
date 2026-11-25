import json,os,hashlib,urllib.request,shutil,sys,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[4];sys.path.insert(0,str(root/"tools/art-forge"))
from forge import build,capabilities
out=Path(os.environ["BOW_ART_OUTPUT"]);work=Path("/tmp/bow-battlefield");work.mkdir(exist_ok=True)
src=work/"asset-forge";src.mkdir(exist_ok=True)
url="https://raw.githubusercontent.com/gddickinson/llm_RPG/d95873eeb4bdd682b5fe2c20c963f201f1d779b7/data/creatures/horse.glb"
raw=urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"PocketWorks CC0 asset reference"}),timeout=90).read(4*1024*1024+1)
if len(raw)>4*1024*1024 or raw[:4]!=b"glTF":raise ValueError("Invalid horse source")
if hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()!="f931b71d46df91b3c897997a12c01188f6ad1c8f":raise ValueError("Horse source hash mismatch")
(src/"horse.glb").write_bytes(raw)
shutil.copyfile(Path(__file__).with_name("horse-author.py"),src/"author.py")
manifest={"version":2,"runtimeRoot":"public","index":"public/index.json","jobs":[{"id":"horse","adapter":"blender","source":"asset-forge/author.py","inputs":["asset-forge/horse.glb"],"dependsOn":[],"seed":17,"parameters":{},"outputs":{"model":"public/horse.glb","editable":"asset-forge/generated/horse.blend"},"budget":{"maxBytes":24000000,"maxTriangles":120000,"maxTextureSize":1024},"provenance":{"author":"Quaternius (original animated horse), gddickinson GLB distribution","license":"CC0","origin":url},"validation":{"requireArmature":True,"requireAnimation":True}}]}
build(work,manifest,capabilities({"blender":os.environ["BLENDER"]}),trusted=True)
shutil.copyfile(work/"public/index.json",out/"horse-forge-index.json")
(out/"horse-provenance.json").write_text(json.dumps({"url":url,"sha256":hashlib.sha256(raw).hexdigest(),"license":"CC0","original":"https://poly.pizza/m/qvTrSG9pZF"},indent=2))
source=next(Path("/tmp/bow-source").rglob("spearman.blend"))
# Isolated processes per role; never mutate the original editable source.
from concurrent.futures import ThreadPoolExecutor
def bake(kind):
    env=dict(os.environ,BOW_TROOP=kind,BOW_HORSE=str(work/"public/horse.glb"))
    subprocess.run([os.environ["BLENDER"],"--background","--disable-autoexec",str(source),"--threads","2","--python-exit-code","1","--python",str(Path(__file__).with_name("troop-bake.py"))],env=env,check=True,timeout=1500)
with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(bake,["sword","archer","knight","lightHorse"]))
