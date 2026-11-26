"""All-role BVH intersection audit with rendered face visibility and bounded signed-depth estimates."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(__import__('os').environ["CHARACTER_EVIDENCE"])
data=json.loads((out/"morph"/"v9-collision-input.json").read_text())
def tree(part):
    verts=[Vector(v) for v in part["positions"]]
    faces=[part["indices"][i:i+3] for i in range(0,len(part["indices"]),3)]
    return BVHTree.FromPolygons(verts,faces,all_triangles=True,epsilon=1e-6),verts,faces
def centroid(v):
    return (v[0]+v[1]+v[2])/3
def normal(v):
    n=(v[1]-v[0]).cross(v[2]-v[0])
    return n.normalized() if n.length>1e-10 else Vector((0,1,0))
def inside(t,p):
    dirs=[Vector((1,.173,.071)).normalized(),Vector((.137,1,.239)).normalized(),Vector((.193,.113,1)).normalized()]
    votes=0
    for d in dirs:
        origin=p+d*1e-5;hits=0
        for _ in range(48):
            loc,n,idx,dist=t.ray_cast(origin,d)
            if loc is None:break
            hits+=1;origin=loc+d*1e-4
        votes+=hits%2
    return votes>=2
def depth_samples(ta,va,fa,tb,vb,fb,pairs):
    maximum=0.0;samples=0;inside_count=0
    for ia,ib in pairs:
        triA=[va[i] for i in fa[ia]];triB=[vb[i] for i in fb[ib]]
        ca,cb=centroid(triA),centroid(triB)
        for point,n,other in [(ca,normal(triA),tb),(cb,normal(triB),ta)]:
            for sign in [-1,1]:
                sample=point+n*(.001*sign)
                if inside(other,sample):
                    hit=other.find_nearest(sample)
                    if hit and hit[3] is not None:
                        maximum=max(maximum,float(hit[3]));inside_count+=1
        samples+=1
    return maximum,samples,inside_count
def classify(a,b,visible,depth):
    names=(a["name"]+" "+b["name"]).lower()
    structural=any(x in names for x in ["mail","brigandine","lorica","plate","gambeson","strap","lining","hinge","rim","boss","pteryx","tasset","spaulder","vambrace"])
    if visible and depth>.005:return "visible-penetration"
    if structural and not visible:return "designed-layering-concealed"
    if not visible:return "concealed-intersection"
    if depth<.003:return "visible-near-contact"
    return "visible-overlap-unconfirmed"
results=[];visibleRisks=[]
for frame in data["frames"]:
    parts=frame["parts"];trees=[]
    for p in parts:trees.append(tree(p))
    viewSets={view:[set(x) for x in arr] for view,arr in frame["visible"].items()}
    pairsOut=[]
    for i,a in enumerate(parts):
        for j in range(i+1,len(parts)):
            b=parts[j]
            ta,va,fa=trees[i];tb,vb,fb=trees[j]
            # Actual triangle intersection, not AABB-only contact.
            hits=ta.overlap(tb)
            if not hits:continue
            visViews=[]
            for view,sets in viewSets.items():
                if any(x in sets[i] for x,y in hits) and any(y in sets[j] for x,y in hits):visViews.append(view)
            depth,samples,insideCount=depth_samples(ta,va,fa,tb,vb,fb,hits)
            cls=classify(a,b,visViews,depth)
            row={"a":a["name"],"b":b["name"],"aLayer":a["layer"],"bLayer":b["layer"],"aRegion":a["region"],"bRegion":b["region"],"trianglePairs":len(hits),"visibilityViews":visViews,"depthEstimateMetres":depth,"depthSamples":samples,"insideSamples":insideCount,"classification":cls}
            pairsOut.append(row)
            if cls=="visible-penetration":visibleRisks.append({"role":frame["role"],"phase":frame["phase"],**row})
    counts={}
    for x in pairsOut:counts[x["classification"]]=counts.get(x["classification"],0)+x["trianglePairs"]
    results.append({"role":frame["role"],"phase":frame["phase"],"pairCount":len(pairsOut),"trianglePairCount":sum(x["trianglePairs"] for x in pairsOut),"classifications":counts,"pairs":pairsOut})
report={"revision":"v0.9","method":"Blender BVHTree triangle-pair intersections; depth estimated by three-ray parity and nearest surface; visibility from actual depth-buffer raster face ownership at 128px.","frames":results,"visiblePenetrations":visibleRisks,"artAcceptance":"rejected" if visibleRisks else "no visible penetrations detected at tested views and phases","limitations":["Signed depth is a bounded interior-sample estimate, not a volumetric Boolean intersection.","Face visibility is sampled at 128px in four orthographic/perspective views.","Concealed structural overlap is reported separately from visible intersection."]}
(out/"v9-garment-collision.json").write_text(json.dumps(report,indent=2))
(out/"v9-visible-penetrations.json").write_text(json.dumps(visibleRisks,indent=2))
print(json.dumps({"frames":len(results),"pairs":sum(x["pairCount"] for x in results),"trianglePairs":sum(x["trianglePairCount"] for x in results),"visiblePenetrations":len(visibleRisks),"acceptance":report["artAcceptance"]}))
