"""Pinned MakeHuman CC0 data adapter. No AGPL application code imported."""
import os,json,hashlib,urllib.request,math,time
from pathlib import Path
out=Path(os.environ["CHARACTER_EVIDENCE"]);out.mkdir(parents=True,exist_ok=True)
base="https://raw.githubusercontent.com/makehumancommunity/makehuman/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/"
sources={
"mesh":("makehuman/data/3dobjs/base.obj","d26635e9326e3cca30778fd7b9c00062b03cce09"),
"rig":("makehuman/data/rigs/default.mhskel","b02cbecae00143856410d7561adf006d83bf9b3e"),
"weights":("makehuman/data/rigs/default_weights.mhw","66185806afacf87749be8e5cf6dbf66496b2a6b0"),
"tall":("makehuman/data/targets/macrodetails/height/male-young-averagemuscle-averageweight-maxheight.target","1db1440ae3d7ad4259d64991047093f450fb38b0"),
"short":("makehuman/data/targets/macrodetails/height/male-young-averagemuscle-averageweight-minheight.target","7208f5dcf183c0cdba3eaa1e2da8cf21e7726b84"),
"heavy":("makehuman/data/targets/macrodetails/universal-male-young-averagemuscle-maxweight.target","15d495149eec197fed9ab8dda745cdfd4878ab2b"),
"light":("makehuman/data/targets/macrodetails/universal-male-young-averagemuscle-minweight.target","0a53c15a2d6cf23120c786d95b36d7a618c61acf")}
provenance={}
def fetch(k):
    path,sha=sources[k]
    with urllib.request.urlopen(base+path,timeout=60) as r:raw=r.read(3000000)
    if hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()!=sha:raise ValueError("Source hash mismatch "+k)
    provenance[k]={"url":base+path,"sha256":hashlib.sha256(raw).hexdigest(),"gitBlob":sha,"license":"CC0-1.0"}
    return raw.decode()
verts=[];faces=[];group="default";groups={};kept={}
for line in fetch("mesh").splitlines():
    f=line.split()
    if not f:continue
    if f[0]=="v":verts.append([float(x) for x in f[1:4]])
    elif f[0]=="g":group=" ".join(f[1:])
    elif f[0]=="f":
        groups[group]=groups.get(group,0)+1
        if any(g.startswith(("joint-","helper-")) for g in group.split()):continue
        q=[int(x.split("/")[0])-1 for x in f[1:]]
        if min(q)<0 or max(q)>=len(verts):raise ValueError("Invalid index")
        faces.append(q);kept[group]=kept.get(group,0)+1
used=sorted({v for f in faces for v in f})
if len(used)>=len(verts) or len(used)<8000:raise ValueError("Unexpected helper masking "+str(groups))
ids={v:i for i,v in enumerate(used)}
triangles=[ids[v] for f in faces for i in range(1,len(f)-1) for v in (f[0],f[i],f[i+1])]
rig=json.loads(fetch("rig"));weights=json.loads(fetch("weights"))
if rig["license"].upper()!="CC0" or weights["license"].upper()!="CC0":raise ValueError("Unexpected rig license")
ordered=[];pending=dict(rig["bones"])
while pending:
    ready=[n for n,b in pending.items() if b["parent"] is None or b["parent"] in ordered]
    if not ready:raise ValueError("Rig hierarchy cycle")
    for n in sorted(ready):ordered.append(n);del pending[n]
jointIds={n:i for i,n in enumerate(ordered)}
wmap={v:[] for v in used}
for name,entries in weights["weights"].items():
    if name not in jointIds:raise ValueError("Unknown source weight bone "+name)
    for v,w in entries:
        if v in wmap and w>0:wmap[v].append((jointIds[name],w))
if any(not w for w in wmap.values()):raise ValueError("Unweighted body vertices: "+str(sum(not w for w in wmap.values())))
j4=[];w4=[];discard=0
for v in used:
    allw=sorted(wmap[v],key=lambda p:-p[1]);sel=allw[:4];discard=max(discard,sum(w for _,w in allw[4:]));total=sum(w for _,w in sel)
    j4.extend([j for j,w in sel]+[0]*(4-len(sel)));w4.extend([w/total for j,w in sel]+[0]*(4-len(sel)))
targets={}
for k in ("short","tall","heavy","light"):
    target={}
    for line in fetch(k).splitlines():
        f=line.split()
        if not f or f[0].startswith("#"):continue
        i=int(f[0]);delta=list(map(float,f[1:]))
        if not 0<=i<len(verts) or len(delta)!=3:raise ValueError("Invalid morph")
        target[i]=delta
    targets[k]=target
def role(n):
    k=n.split(".")[0]
    exact={"root":"pelvis","upperleg01":"leg.upper","lowerleg01":"leg.lower","foot":"foot","upperarm01":"arm.upper","lowerarm01":"arm.lower","wrist":"hand","head":"head","spine03":"spine"}
    if k in exact:return exact[k]
    if k.startswith("finger"):return "digit"
    if k.startswith(("special","eye","jaw","mouth","tongue","levator","orbicular")):return "face"
    return "anatomical"
def minus(a,b):return [x-y for x,y in zip(a,b)]
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def normal(v):
    l=math.sqrt(sum(x*x for x in v)) or 1
    return [x/l for x in v]
samples=[]
for name,morph in [("base",{}),("short-light",{"short":.45,"light":.5}),("tall-heavy",{"tall":.35,"heavy":.55})]:
    start=time.perf_counter();vs=[v[:] for v in verts]
    for k,amount in morph.items():
        for i,d in targets[k].items():vs[i]=[x+amount*y for x,y in zip(vs[i],d)]
    floor=min(vs[v][1] for v in used);mid=(min(vs[v][0] for v in used)+max(vs[v][0] for v in used))/2
    def standard(v):return [(v[0]-mid)*.1,(v[1]-floor)*.1,v[2]*.1]
    def marker(k):
        indices=rig["joints"][k]
        if not indices:raise ValueError("Empty joint marker")
        return standard([sum(vs[v][i] for v in indices)/len(indices) for i in range(3)])
    joints=[]
    for n in ordered:
        bone=rig["bones"][n];p=marker(bone["head"]);tail=marker(bone["tail"]);parent=jointIds[bone["parent"]] if bone["parent"] else -1
        joints.append({"id":len(joints),"name":n,"parent":parent,"position":p,"local":p if parent<0 else minus(p,joints[parent]["position"]),"role":role(n),"axis":[1,0,0],"limitDegrees":35 if role(n) in ("spine","face","hand") else 85,"sourceTail":tail})
    positions=[standard(vs[v]) for v in used];normals=[[0,0,0] for v in used]
    for i in range(0,len(triangles),3):
        a,b,c=triangles[i:i+3];n=cross(minus(positions[b],positions[a]),minus(positions[c],positions[a]))
        for k in (a,b,c):normals[k]=[x+y for x,y in zip(normals[k],n)]
    m={"spec":{"version":2,"recipe":"makehuman","family":"humanoid","style":"anatomical-realism","lod":"source","seed":17,"morphology":morph,"actions":["idle","walk"],"budget":{"maxBytes":32000000,"maxTriangles":150000,"maxJoints":512},"provenance":[{"author":"MakeHuman community","license":"CC0-1.0","origin":base}]},"joints":joints,"parts":[{"name":"MakeHuman source body","component":"body","color":[.57,.36,.25],"positions":[x for v in positions for x in v],"normals":[x for v in normals for x in normal(v)],"indices":triangles,"joints":j4,"weights":w4,"binding":0}],"contacts":[],"sockets":[],"components":[{"name":"human","family":"humanoid","root":0,"template":"makehuman-hm08-default"}],"approval":"unreviewed"}
    (out/("makehuman-"+name+".json")).write_text(json.dumps(m,separators=(",",":")))
    samples.append({"variant":name,"vertices":len(used),"triangles":len(triangles)//3,"joints":len(joints),"digitBones":sum(j["role"]=="digit" for j in joints),"faceBones":sum(j["role"]=="face" for j in joints),"heightMetres":max(v[1] for v in positions),"maxDiscardedWeight":discard,"morphRigMs":(time.perf_counter()-start)*1000})
(out/"makehuman-adapter.json").write_text(json.dumps({"sources":provenance,"groups":groups,"retainedGroups":kept,"removedVertices":len(verts)-len(used),"samples":samples,"limitations":"Original weights truncated to four and normalized; local rotation axes provisional, no original bone roll, facial correctives or clothing yet."},indent=2))
print(json.dumps(samples))
