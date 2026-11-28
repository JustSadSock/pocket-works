"""Research-only contact measurements. Distances are geometric, not solver impulses."""
import math
from mathutils import Vector
from mathutils.geometry import closest_point_on_tri
from mathutils.bvhtree import BVHTree

WATCH=((106,138),(107,139),(138,139),(106,139),(170,171))
def barycentric(p,a,b,c):
    u=b-a;v=c-a;w=p-a
    uu=u.dot(u);uv=u.dot(v);vv=v.dot(v);wu=w.dot(u);wv=w.dot(v)
    det=uu*vv-uv*uv
    if det<=1e-20:raise ValueError("degenerate contact triangle")
    y=(wu*vv-wv*uv)/det;z=(wv*uu-wu*uv)/det
    return (1-y-z,y,z)

def area(v,f):
    a,b,c=[Vector(v[i]) for i in f]
    return (b-a).cross(c-a).length*.5

def closed_winding(point,vs,fs):
    solid=0.
    for f in fs:
        a,b,c=[Vector(vs[i])-point for i in f]
        la,lb,lc=a.length,b.length,c.length
        solid+=2*math.atan2(a.dot(b.cross(c)),la*lb*lc+a.dot(b)*lc+b.dot(c)*la+c.dot(a)*lb)
    return solid/(4*math.pi)

class ContactSurface:
    def __init__(self,vs,fs,previous,fps):
        self.v=[Vector(p) for p in vs];self.f=fs;self.old=[Vector(p) for p in previous];self.fps=fps
        self.bvh=BVHTree.FromPolygons(self.v,fs,all_triangles=True,epsilon=0.)
        self.adj={}
        for i,f in enumerate(fs):
            for a,b in zip(f,f[1:]+f[:1]):self.adj.setdefault(tuple(sorted((a,b))),[]).append(i)
        self.normals=[(self.v[b]-self.v[a]).cross(self.v[c]-self.v[a]).normalized() for a,b,c in fs]
        self.closed=all(len(x)==2 for x in self.adj.values())
    def nearest(self,p,velocity,independent=False):
        p=Vector(p);q,n,fi,d=self.bvh.find_nearest(p)
        if q is None:raise RuntimeError("empty contact surface")
        ids=self.f[fi];a,b,c=[self.v[j] for j in ids];w=barycentric(q,a,b,c)
        mapped=sum((self.v[j]*x for j,x in zip(ids,w)),Vector((0,0,0)))
        old=sum((self.old[j]*x for j,x in zip(ids,w)),Vector((0,0,0)))
        sv=(mapped-old)*self.fps;rel=Vector(velocity)-sv;normal=self.normals[fi];normalSpeed=rel.dot(normal)
        adjacent=set(j for x,y in zip(ids,ids[1:]+ids[:1]) for j in self.adj[tuple(sorted((x,y)))] if j!=fi)
        angles=[math.degrees(math.acos(max(-1.,min(1.,normal.dot(self.normals[j]))))) for j in adjacent]
        inside=abs(closed_winding(p,self.v,self.f))>.5 if self.closed and d>1e-7 else None
        out={'face':fi,'faceVertices':list(ids),'point':list(q),'distanceMetres':d,'insideClosedProxy':inside,
             'penetrationMetres':d if inside else (0. if inside is False else None),'normal':list(normal),'barycentric':list(w),
             'surfaceVelocity':list(sv),'relativeNormalSpeed':normalSpeed,'relativeTangentialSpeed':(rel-normal*normalSpeed).length,
             'contactPointPrevious':list(old),'dihedralMaxDegrees':max(angles,default=0.),
             'barycentricReconstructionErrorMetres':(q-mapped).length,'directSolverImpulse':None}
        if independent:
            # Exhaustive triangle projection, not the BVH result. Face identity can tie on a shared edge.
            brute=min((p-closest_point_on_tri(p,*[self.v[j] for j in f])).length for f in self.f)
            out['independentDistanceErrorMetres']=abs(brute-d)
            if abs(brute-d)>2e-6 or (q-mapped).length>2e-6 or min(w)<-1e-4 or abs(sum(w)-1)>1e-5:
                raise RuntimeError("Independent contact projection disagrees")
        return out

def watch_edges(v,old,rest,faces,edges,pins,cs,previous,source_cs,previous_source,fps):
    surfaces={name:ContactSurface(vv,ff,previous.get(name,vv),fps) for name,vv,ff in cs}
    originals={name:ContactSurface(vv,ff,previous_source.get(name,vv),fps) for name,vv,ff in source_cs}
    rows=[]
    # Watch the exact named edges plus the four worst active edges; preserve removed edge identity.
    rank=sorted(edges,key=lambda e:math.dist(v[e[0]],v[e[1]])/math.dist(rest[e[0]],rest[e[1]]),reverse=True)
    for a,b in dict.fromkeys((*WATCH,*rank[:4])):
        if (a,b) not in edges:
            rows.append({'edge':[a,b],'present':False});continue
        ids=(a,b);incident=[f for f in faces if a in f or b in f]
        near=[(x,y) for x,y in edges if a in (x,y) or b in (x,y)]
        samples=[]
        for u in (0.,.5,1.):
            q=Vector(v[a]).lerp(Vector(v[b]),u);q0=Vector(old[a]).lerp(Vector(old[b]),u);vel=(q-q0)*fps
            contacts={name:s.nearest(q,vel,independent=(u==.5)) for name,s in surfaces.items()}
            original={name:s.nearest(q,vel,independent=(u==.5)) for name,s in originals.items()}
            samples.append({'edgeFraction':u,'position':list(q),'velocity':list(vel),'proxy':contacts,'sourceOuter':original})
        rows.append({'edge':[a,b],'present':True,'ratio':math.dist(v[a],v[b])/math.dist(rest[a],rest[b]),
                     'pinDistancesMetres':[min(math.dist(rest[j],rest[k]) for k in pins) for j in ids],
                     'incidentAreas':[{'face':list(f),'ratio':area(v,f)/max(area(rest,f),1e-12)} for f in incident],
                     'neighborStretch':[{'edge':[x,y],'ratio':math.dist(v[x],v[y])/math.dist(rest[x],rest[y])} for x,y in near],
                     'samples':samples})
    return rows

def bounded_proxy(rows,kind,limit=.002):
    # Fixed ring count and correspondence. No global scaling or garment clearance increase.
    vv=[[Vector(p) for p in row] for row in rows];n=len(vv[0])
    centers=[sum(row,Vector((0,0,0)))/n for row in vv];result=[]
    for i,row in enumerate(vv):
        target=[]
        tangent=(centers[min(i+1,len(vv)-1)]-centers[max(i-1,0)]).normalized()
        for j,p in enumerate(row):
            if kind=='bounded-smooth':
                q=(row[(j-1)%n]+row[(j+1)%n])*.5
                # At the caps the change is inward only, avoiding a fictitious expanded body.
                if i in (0,len(vv)-1):q=q.lerp(centers[i],.1)
            elif kind=='axis-section':
                radial=p-centers[i];q=p-tangent*radial.dot(tangent)
            else:raise ValueError(kind)
            delta=q-p
            if delta.length>limit:delta=delta.normalized()*limit
            # For smoothing, never move radially away from the measured section center.
            if (p+delta-centers[i]).length>(p-centers[i]).length:delta=Vector((0,0,0))
            target.append(list(p+delta))
        result.append(target)
    return result

def flip_diagonal(faces,a,b):
    hits=[i for i,f in enumerate(faces) if a in f and b in f]
    if len(hits)!=2:raise ValueError("expected exactly two triangles at diagonal")
    i,j=hits;f=faces[i]
    if f[(f.index(a)+1)%3]!=b:a,b=b,a
    c=next(x for x in f if x not in (a,b));d=next(x for x in faces[j] if x not in (a,b))
    if c==d:raise ValueError("degenerate diagonal")
    out=list(faces);out[i]=(c,d,b);out[j]=(d,c,a)
    return out

def selftest():
    vs=[(0,0,0),(2,0,0),(0,2,0)];old=[(0,0,0),(1,0,0),(0,1,0)]
    s=ContactSurface(vs,[(0,1,2)],old,2)
    r=s.nearest((.4,.6,.3),(0,0,0),True)
    assert abs(r['distanceMetres']-.3)<1e-6
    assert max(abs(a-b) for a,b in zip(r['surfaceVelocity'],(.4,.6,0)))<1e-6
    assert r['insideClosedProxy'] is None
    assert flip_diagonal([(0,1,2),(1,0,3)],0,1)==[(2,3,1),(3,2,0)]
