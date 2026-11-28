"""Conservative independent Blender BVH: unresolved layer crossing blocks P0."""
import json,os,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(os.environ['CHARACTER_EVIDENCE']);d=json.loads((out/'p0-evaluated.json').read_text())
def validate(v,part,action,phase):
    for i,p in enumerate(v):
        if len(p)!=3 or not all(isinstance(x,(float,int)) and math.isfinite(x) for x in p):
            report={'part':part,'vertex':i,'coordinates':p,'action':action,'phase':phase}
            (out/'p0-invalid-geometry.json').write_text(json.dumps(report,indent=2));raise ValueError(json.dumps(report))
for p in d['restParts']:validate(p['positions'],p['name'],'rest',0)
for frame in d['frames']:
    validate(frame['anatomy'],'source anatomy',frame['action'],frame['phase'])
    for p in frame['parts']:validate(p['positions'],p['name'],frame['action'],frame['phase'])
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
        bodyhits=[(a,b) for a,b in pairs if strict(v,body,f[a],bf[b])];crossing=len(bodyhits)
        selfhits=[(a,b) for a,b in t.overlap(t) if a<b and not set(f[a])&set(f[b]) and strict(v,v,f[a],f[b])];selfcross=len(selfhits)
        rs=rest[p['name']]['positions'];edges={tuple(sorted((face[i],face[(i+1)%3]))) for face in f for i in range(3)}
        ratios=sorted(math.dist(v[a],v[b])/math.dist(rs[a],rs[b]) for a,b in edges if math.dist(rs[a],rs[b])>1e-6)
        parts.append({'name':p['name'],'strictBodyCrossings':crossing,'strictSelfCrossings':selfcross,'bodyTrianglePairs':bodyhits,'selfTrianglePairs':selfhits,'maxStretch':max(ratios,default=1),'p95Stretch':ratios[int((len(ratios)-1)*.95)] if ratios else 1,'collapsedEdges':sum(x<.1 for x in ratios)})
    overlaps=[]
    for i,p in enumerate(garments):
        for q in garments[i+1:]:
            v,f=p['positions'],p['faces'];u,g=q['positions'],q['faces'];pairs=trees[p['name']].overlap(trees[q['name']]);hits=[(a,b) for a,b in pairs if strict(v,u,f[a],g[b])]
            if hits:overlaps.append({'a':p['name'],'b':q['name'],'strictCrossings':len(hits),'trianglePairs':hits})
    rows.append({'action':frame['action'],'phase':frame['phase'],'parts':parts,'layerCrossings':overlaps})
attachments=[]
for p in d['restParts']:
    if p['weights'] is None:continue
    spec=p.get('attachmentSpec') or {};kind=spec.get('type');host=rest.get(spec.get('host'))
    influences={int(j) for row in p['weights'] for j,w in row if w>1e-6}
    rigid=len(influences)==1
    if not host or kind not in ('rigid-hardware','skinned-trim','fitted-interface'):
        attachments.append({'part':p['name'],'type':kind,'passed':False,'reason':'Unclassified or absent host'});continue
    # Stable closest rest vertex identities, never recompute the correspondence
    # in a posed frame. For trim inspect all vertices, not just the clasp.
    pts=p['positions'];hs=host['positions'];indices=range(len(pts))
    anchors=[(i,min(range(len(hs)),key=lambda j:math.dist(pts[i],hs[j]))) for i in indices]
    anchors.sort(key=lambda ij:math.dist(pts[ij[0]],hs[ij[1]]))
    if kind!='skinned-trim':anchors=anchors[:min(4,len(anchors))]
    restdist=[math.dist(pts[i],hs[j]) for i,j in anchors];maxdelta=0.;maxgap=0.;rigiderror=0.
    for f in d['frames']:
        pp=next(x['positions'] for x in f['parts'] if x['name']==p['name']);hh=next(x['positions'] for x in f['parts'] if x['name']==host['name'])
        gaps=[math.dist(pp[i],hh[j]) for i,j in anchors];maxgap=max(maxgap,min(gaps));maxdelta=max(maxdelta,max(abs(a-b) for a,b in zip(gaps,restdist)))
        if rigid:
            for i in range(len(pts)):rigiderror=max(rigiderror,abs(math.dist(pp[0],pp[i])-math.dist(pts[0],pts[i])))
    passed=maxdelta<=.006 and maxgap<=.018 and (kind!='rigid-hardware' or rigid and rigiderror<=.0001)
    attachments.append({'part':p['name'],'type':kind,'host':host['name'],'rigid':rigid,'influences':sorted(influences),'restAnchors':anchors,'maxGapMetres':maxgap,'maxGapChangeMetres':maxdelta,'maxRigidDistanceErrorMetres':rigiderror,'passed':passed})
gate=all(x['strictBodyCrossings']==0 and x['strictSelfCrossings']==0 and x['collapsedEdges']==0 and x['maxStretch']<=1.6 and x['p95Stretch']<=1.15 for r in rows for x in r['parts']) and all(not r['layerCrossings'] for r in rows)
result={'rows':rows,'attachments':attachments,'clothingGate':gate,'attachmentGate':bool(attachments) and all(x['passed'] for x in attachments),'method':'Native posed actual triangles, full source body, strict BVH intersections, nine sampled phases per action; no seam exemptions or continuous collision claim'}
(out/'p0-surface-qa.json').write_text(json.dumps(result,indent=2))
