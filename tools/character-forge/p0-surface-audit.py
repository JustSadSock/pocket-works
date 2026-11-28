"""Conservative independent Blender BVH: unresolved layer crossing blocks P0."""
import json,os,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(os.environ['CHARACTER_EVIDENCE']);d=json.loads((out/'p0-evaluated.json').read_text())
def tree(v,f):return BVHTree.FromPolygons([Vector(x) for x in v],f,all_triangles=True)
def strict(a,b,fa,fb):
    a,b=[Vector(a[i]) for i in fa],[Vector(b[i]) for i in fb]
    def cuts(x,y):
        n=(y[1]-y[0]).cross(y[2]-y[0])
        if n.length<1e-12:return False
        n.normalize();v=[(p-y[0]).dot(n) for p in x]
        return min(v)<-1e-6 and max(v)>1e-6
    return cuts(a,b) and cuts(b,a)
rest={p['name']:p for p in d['restParts']};rows=[]
for frame in d['frames']:
    body=frame['anatomy'];bf=d['sourceFaces'];bt=tree(body,bf);parts=[];garments=[p for p in frame['parts'] if p['layer']]
    trees={p['name']:tree(p['positions'],p['faces']) for p in garments}
    for p in garments:
        v=p['positions'];f=p['faces'];t=trees[p['name']];pairs=t.overlap(bt)
        crossing=sum(strict(v,body,f[a],bf[b]) for a,b in pairs)
        selfcross=sum(strict(v,v,f[a],f[b]) for a,b in t.overlap(t) if a<b and not set(f[a])&set(f[b]))
        rs=rest[p['name']]['positions'];edges={tuple(sorted((face[i],face[(i+1)%3]))) for face in f for i in range(3)}
        ratios=sorted(math.dist(v[a],v[b])/math.dist(rs[a],rs[b]) for a,b in edges if math.dist(rs[a],rs[b])>1e-6)
        parts.append({'name':p['name'],'strictBodyCrossings':crossing,'strictSelfCrossings':selfcross,'maxStretch':max(ratios,default=1),'p95Stretch':ratios[int((len(ratios)-1)*.95)] if ratios else 1,'collapsedEdges':sum(x<.1 for x in ratios)})
    overlaps=[]
    for i,p in enumerate(garments):
        for q in garments[i+1:]:
            v,f=p['positions'],p['faces'];u,g=q['positions'],q['faces'];pairs=trees[p['name']].overlap(trees[q['name']]);n=sum(strict(v,u,f[a],g[b]) for a,b in pairs)
            if n:overlaps.append({'a':p['name'],'b':q['name'],'strictCrossings':n})
    rows.append({'action':frame['action'],'phase':frame['phase'],'parts':parts,'layerCrossings':overlaps})
attachments=[]
for p in d['restParts']:
    if p['weights'] is None:continue
    influences={int(j) for row in p['weights'] for j,w in row if w>1e-6}
    attachments.append({'part':p['name'],'rigid':len(influences)==1,'influences':sorted(influences),'declared':p['attachment']})
gate=all(x['strictBodyCrossings']==0 and x['strictSelfCrossings']==0 and x['collapsedEdges']==0 and x['maxStretch']<=1.6 and x['p95Stretch']<=1.15 for r in rows for x in r['parts']) and all(not r['layerCrossings'] for r in rows)
result={'rows':rows,'attachments':attachments,'clothingGate':gate,'attachmentGate':bool(attachments) and all(x['rigid'] for x in attachments),'method':'Native posed actual triangles, full source body, strict BVH intersections, nine sampled phases per action; no seam exemptions or continuous collision claim'}
(out/'p0-surface-qa.json').write_text(json.dumps(result,indent=2))
