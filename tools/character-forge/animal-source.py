"""Fetch the two actual CC0 static reference meshes, preserve their originals
and extract an explicitly simplified, metrically oriented geometry study.
No external source is a required Native dependency."""
import urllib.request,hashlib,json,os,subprocess,sys
from pathlib import Path
out=Path(os.environ["CHARACTER_EVIDENCE"]);out.mkdir(parents=True,exist_ok=True)
sources={
"horse":{"page":"https://www.innerscene.com/tools/library/3d-parts/standing-horse-01d8563f","url":"https://files.innerscene.com/library/standing-horse-01d8563f/0107d59ef4ff275f0158/horse-original.glb","license":"CC0-1.0"},
"elephant":{"page":"https://www.innerscene.com/tools/library/3d-parts/african-elephant-30c02485","url":"https://www.innerscene.com/api/library/african-elephant-30c02485/download","license":"CC0-1.0"}}
result={}
for name,s in sources.items():
    with urllib.request.urlopen(urllib.request.Request(s["url"],headers={"User-Agent":"Pocket Works isolated research"}),timeout=90) as r:
        raw=r.read(20000001);url=r.geturl()
    if len(raw)>20000000 or raw[:4]!=b"glTF":raise ValueError("Invalid source "+name)
    path=out/("animal-source-"+name+".glb");path.write_bytes(raw)
    result[name]={**s,"resolvedUrl":url,"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw),"author":"Innerscene","kind":"static model; not an anatomical or rig calibration authority"}
    env=dict(os.environ,ANIMAL_INPUT=str(path),ANIMAL_OUTPUT=str(out/("animal-source-"+name+".json")),ANIMAL_NAME=name)
    subprocess.run([os.environ["BLENDER"],"--background","--factory-startup","--disable-autoexec","--python-exit-code","1","--python",str(Path(__file__).with_name("extract-animal.py"))],env=env,check=True)
(out/"animal-source-provenance.json").write_text(json.dumps(result,indent=2))
