"""Versioned offline acoustic package backend. Research only; no physical calibration."""
import hashlib, json, math, pathlib, sys, copy
import numpy as np
import scipy
from acoustic_resynthesis import render, SR, BANDS, HOP

ROOT=pathlib.Path(__file__).resolve().parent
MAX_BYTES=24*1024*1024
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def bounded(v,lo,hi):
    if type(v) not in (int,float) or not math.isfinite(v) or not lo<=v<=hi:
        raise ValueError("Invalid numeric control")
    return v
def engines():
    return {"version":1,"resynthesisSha256":sha(ROOT/"acoustic_resynthesis.py"),
            "authoringSha256":sha(pathlib.Path(__file__)),"numpy":np.__version__,"scipy":scipy.__version__}
def local_file(root,name):
    if not isinstance(name,str) or not name or "\\" in name or any(p in ("",".","..") for p in name.split("/")):
        raise ValueError("Invalid dependency path")
    p=(root/name).resolve()
    if not p.is_relative_to(root) or not p.is_file() or p.stat().st_size>64*1024*1024:
        raise ValueError("Invalid dependency")
    return p
def load_package(file):
    file=pathlib.Path(file).resolve()
    if file.stat().st_size>MAX_BYTES:raise ValueError("Package too large")
    p=json.loads(file.read_text())
    if p.get("version")!=1 or p.get("engine")!=engines() or p.get("approval")!="research-only":
        raise ValueError("Unsupported or unpinned acoustic package")
    if not isinstance(p.get("scope"),str) or not p["scope"].strip() or not isinstance(p.get("limitations"),str) or not p["limitations"].strip():
        raise ValueError("Missing applicability")
    deps=p.get("dependencies")
    if not isinstance(deps,list) or not 1<=len(deps)<=16:raise ValueError("Missing dependencies")
    for d in deps:
        if d.get("license") not in ("CC0-1.0","public-domain","original") or d.get("redistribution") is not True:
            raise ValueError("Unqualified dependency rights")
        for k in ("creator","provenance","rightsEvidence"):
            if not isinstance(d.get(k),str) or not d[k].strip():raise ValueError("Missing dependency provenance")
        if d["license"]!="original" and not str(d.get("sourceUrl","")).startswith("https://"):
            raise ValueError("Missing source URL")
        if sha(local_file(file.parent,d["path"]))!=d.get("sha256"):raise ValueError("Dependency checksum mismatch")
    if type(p.get("seed")) is not int:raise ValueError("Missing package seed")
    bounded(p["seed"],0,2**32-1)
    if not isinstance(p.get("controls"),dict):raise ValueError("Missing controls")
    return p
def curve(points,u,lo=0,hi=4):
    if not isinstance(points,list) or not 2<=len(points)<=64:raise ValueError("Invalid curve")
    for a,b in points:bounded(a,0,1);bounded(b,lo,hi)
    if points[0][0]!=0 or points[-1][0]!=1 or any(a[0]>=b[0] for a,b in zip(points,points[1:])):
        raise ValueError("Curve must span normalized time 0..1")
    return np.interp(u,[p[0] for p in points],[p[1] for p in points])
def edit_model(model,c):
    m=copy.deepcopy(model)
    n=m["frames"]
    if type(n) is not int or not 1024<=n<=SR*12 or m.get("bands")!=BANDS.tolist():raise ValueError("Invalid model shape")
    if not isinstance(m.get("tracks"),list) or len(m["tracks"])>32:raise ValueError("Invalid track count")
    tracks=c.get("tracks",{})
    if not isinstance(tracks,dict) or any(k not in {str(i) for i in range(len(m["tracks"]))} for k in tracks):
        raise ValueError("Unknown trajectory")
    for i,tr in enumerate(m["tracks"]):
        a=np.array(tr,float)
        local=tracks.get(str(i),{})
        if not isinstance(local,dict) or set(local)-{"frequency","amplitude"}:raise ValueError("Unknown track control")
        u=np.clip(a[:,0]*HOP/n,0,1)
        for key,col,lo,hi in [("frequency",1,.5,2),("amplitude",2,0,4)]:
            if key in local:a[:,col]*=curve(local[key],u,lo,hi)
        a[:,1]=np.clip(a[:,1],0,SR/2)
        m["tracks"][i]=a.tolist()
    noise=np.array(m["noise"],float)
    bands=c.get("noiseBands",{})
    if not isinstance(bands,dict) or any(k not in {str(i) for i in range(len(BANDS)-1)} for k in bands):
        raise ValueError("Unknown noise band")
    u=np.clip(np.arange(len(noise))*HOP/n,0,1)
    for k,v in bands.items():noise[:,int(k)]*=curve(v,u)**2
    m["noise"]=noise.tolist()
    if "excitation" in c:
        env=np.array(m["rms1ms"],float)
        m["rms1ms"]=(env*curve(c["excitation"],np.linspace(0,1,len(env)))).tolist()
    return m
def synthesize(p,overrides=None,seed=None):
    c={**p["controls"],**(overrides or {})}
    if set(c)-{"gain","size","duration","noiseMix","modalMix","tracks","noiseBands","excitation","tonalEnvelope","noiseEnvelope"}:
        raise ValueError("Unknown acoustic control")
    a,b=render(edit_model(p["model"],c),p["seed"] if seed is None else seed,
        **{k:c[k] for k in ("gain","size","duration","noiseMix","modalMix") if k in c})
    u=np.linspace(0,1,len(a))
    if "tonalEnvelope" in c:a*=curve(c["tonalEnvelope"],u)
    if "noiseEnvelope" in c:b*=curve(c["noiseEnvelope"],u)
    if not np.isfinite(a+b).all() or np.max(abs(a+b))>64:raise ValueError("Invalid rendered amplitude")
    return a,b
def main():
    file,seed,controls,component,n=sys.argv[1:]
    n=int(n)
    if not 1<=n<=SR*12:raise ValueError("Invalid layer size")
    if len(controls)>65536:raise ValueError("Controls too large")
    p=load_package(file)
    a,b=synthesize(p,json.loads(controls),int(seed))
    x={"mix":lambda:a+b,"tonal":lambda:a,"noise":lambda:b}[component]()
    # Match recipe layer length, never silently time-stretch.
    x=np.pad(x[:n],(0,max(0,n-len(x))))
    sys.stdout.buffer.write(x.astype("<f8").tobytes())
if __name__=="__main__":main()
