"""Actual CC0 source/morph experiment without a 3D editor; research only."""
import os,json,hashlib,urllib.request,time
from pathlib import Path
out=Path(os.environ["CHARACTER_EVIDENCE"]);out.mkdir(parents=True,exist_ok=True)
base="https://raw.githubusercontent.com/makehumancommunity/makehuman/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/"
sources={"base":("makehuman/data/3dobjs/base.obj","d26635e9326e3cca30778fd7b9c00062b03cce09"),"tall":("makehuman/data/targets/macrodetails/height/male-young-averagemuscle-averageweight-maxheight.target","1db1440ae3d7ad4259d64991047093f450fb38b0"),"short":("makehuman/data/targets/macrodetails/height/male-young-averagemuscle-averageweight-minheight.target","7208f5dcf183c0cdba3eaa1e2da8cf21e7726b84")}
records={}
def fetch(key):
    path,sha=sources[key];raw=urllib.request.urlopen(base+path,timeout=60).read(3000000)
    if hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()!=sha:raise ValueError("Source hash mismatch")
    records[key]={"url":base+path,"gitBlob":sha,"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw),"license":"CC0-1.0"}
    return raw.decode()
raw=fetch("base");verts=[];faces=[];groups={};group="default"
for line in raw.splitlines():
    fields=line.split()
    if not fields:continue
    if fields[0]=="v":verts.append([float(x) for x in fields[1:4]])
    elif fields[0]=="g":group=" ".join(fields[1:])
    elif fields[0]=="f":
        face=[int(x.split("/")[0])-1 for x in fields[1:]]
        if min(face)<0 or max(face)>=len(verts):raise ValueError("Invalid source face")
        faces.append(face);groups[group]=groups.get(group,0)+1
targets={}
for key in ("short","tall"):
    data=fetch(key);delta={}
    for line in data.splitlines():
        f=line.split()
        if not f or f[0].startswith("#"):continue
        if len(f)!=4:raise ValueError("Invalid target row")
        i=int(f[0]);v=[float(x) for x in f[1:]]
        if not 0<=i<len(verts):raise ValueError("Target topology mismatch")
        delta[i]=v
    targets[key]=delta
samples=[]
for key,weight in (("short",.65),("base",0),("tall",.65)):
    t=time.perf_counter();ds=targets.get(key,{})
    result=[[v[i]+weight*ds.get(j,[0,0,0])[i] for i in range(3)] for j,v in enumerate(verts)]
    ext=[max(v[i] for v in result)-min(v[i] for v in result) for i in range(3)]
    samples.append({"variant":key,"weight":weight,"vertexCount":len(result),"faceCount":len(faces),"extentSourceUnits":ext,"morphMs":(time.perf_counter()-t)*1000,"changedVertices":len(ds)})
    # Retain morph-ready editable data in JSON. Full original base includes
    # helper meshes; no production skin or rig is claimed.
    (out/("makehuman-"+key+".json")).write_text(json.dumps({"positions":result,"faces":faces,"groupCounts":groups},separators=(",",":")))
(out/"makehuman-report.json").write_text(json.dumps({"source":records,"samples":samples,"limitations":"Raw MakeHuman base includes helper geometry. Not a fully assembled MPFB character, not rigged or clothed. Height target applied directly, no macro blending; source units retained.","licenseEvidence":"https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md"},indent=2))
print(json.dumps(samples))
