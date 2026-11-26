"""Static anatomical archery workshop. No animation until the anchor pose is accepted."""
import os,math,json
from pathlib import Path
os.environ["BOW_WORKSHOP_ROLE"]="archer"
source=Path(__file__).with_name("anatomical-motion.py")
exec(compile(source.read_text().split("# A single-handed sword",1)[0],str(source),"exec"))
folder=out/"archer-anatomy";folder.mkdir(exist_ok=True)
audit["study"]="Static archery integrity III";audit["samples"]={};audit["issues"]=[]
def save():(folder/"archer-audit.json").write_text(json.dumps(audit,indent=2))
exec(compile(Path(__file__).with_name("review-cameras.py").read_text(),"review-cameras.py","exec"))
reset()
# The shooting axis lies along the shoulders, to the bow-side of the
# character; the draw hand anchors near the jaw, not at the other shoulder.
forward=Vector((-sign,0,0));up=Vector((0,0,1));side=Vector((0,-1,0))
head=bone("Head");watch.append(head)
def rotate_head():
    # Turn head toward the target while keeping neck/head upright.
    axis=rig.matrix_world.inverted().to_3x3()@Vector((0,0,1))
    m=head.matrix.copy();p=m.translation.copy()
    m=Matrix.Rotation(-sign*math.radians(72),4,axis)@m;m.translation=p;head.matrix=m
    bpy.context.view_layer.update()
rotate_head()
def weighted_head():
    pts=[];names0={b.name for b in desc(head)}
    for o in core:
        e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
        try:
            names={g.index:g.name for g in o.vertex_groups}
            for v in m.vertices:
                if sum(g.weight for g in v.groups if names.get(g.group) in names0)>.5:pts.append(e.matrix_world@v.co)
        finally:e.to_mesh_clear()
    return pts
face=weighted_head()
if len(face)<10:raise ValueError("Cannot locate actual head surface")
zs=sorted(v.z for v in face);jawZ=zs[int(len(zs)*.29)]
# The contact is just OUTSIDE the jaw surface in the front-facing direction
# of the trunk. Arrow stays clear of the cheek and passes toward the target.
near=[v for v in face if abs(v.z-jawZ)<.045]
if not near:near=face
jaw=Vector((point(head).x+sign*.045,min(v.y for v in near)-.020,jawZ+.015))
def hook():
    if R.name in posed_hands:return hand_frame(R)[0][0]
    digits=finger_chains(R)
    p=[]
    for name in ("index","middle","ring"):
        bs=digits[name]
        a,b=point(bs[1]),point(bs[min(2,len(bs)-1)])
        p.append(a.lerp(b,.45))
    return sum(p,Vector((0,0,0)))/len(p)
def fit_contact(i,goal,bend,kind):
    u,f,h=arms[i];goal=Vector(goal);target=goal-(hand_frame(h)[0][0]-point(h))
    err=0
    for k in range(8):
        offset=target-point(u)
        err=arm_pose(i,(offset.x*sign,offset.y,offset.z),bend=bend)
        neutral_hand(h,f,up)
        c,a,_,_,_=hand_frame(h)[0]
        if kind=="string":
            # Right wrist remains neutral; fingers form a hook around the
            # common nocking line. The capture point follows actual digits.
            curl_hand(h,c,up,.004)
            actual=hook()
        else:
            curl_hand(h,c,up,.019)
            actual=hand_frame(h)[0][0]
        diff=goal-actual
        if diff.length<.006:break
        target+=diff*.75
    return {"goal":vec(goal),"actual":vec(actual),"error":(goal-actual).length,"ikResidual":err}
right=fit_contact(0,jaw,-forward+Vector((0,-.10,.28)),"string")
nock=hook()
# Arrow support is slightly above and alongside the bow grip. The two
# hands share ONE line of action. Choose reachable draw length from anatomy.
offset=side*.024+up*.045
leftBest=None
for draw in (.72,.69,.66,.63,.60,.57,.54,.51):
    desired=nock+forward*draw-offset
    r=fit_contact(1,desired,Vector((0,.22,-.30)),"bow")
    if leftBest is None or r["error"]<leftBest[0]:leftBest=(r["error"],draw)
    if r["error"]<.012:break
draw=leftBest[1];left=fit_contact(1,nock+forward*draw-offset,Vector((0,.22,-.30)),"bow")
center=hand_frame(L)[0][0];rest=center+offset
delta=rest-nock;draw=delta.dot(forward);offaxis=(delta-forward*draw).length
# Inextensible string and approximately inextensible wooden limbs.
# Both endpoints and the nock are solved together, never animated independently.
def limb_arc(span,back):
    pts=[Vector((span*i/40,back*(i/40)**1.8)) for i in range(41)]
    return sum((b-a).length for a,b in zip(pts,pts[1:]))
restSpan=.79;restBack=.16;limbTarget=limb_arc(restSpan,restBack)
braceNock=center-forward*restBack+offset
def ends(span,back):
    return center+up*span-forward*back,center-up*span-forward*back
def string_length(span,back,p):
    top,bot=ends(span,back);return (top-p).length+(bot-p).length
stringTarget=string_length(restSpan,restBack,braceNock)
def span_for(back):
    if string_length(0,back,nock)>stringTarget:return None
    lo,hi=0,stringTarget*.5
    for i in range(40):
        m=(lo+hi)*.5
        if string_length(m,back,nock)>stringTarget:hi=m
        else:lo=m
    return (lo+hi)*.5
options=[]
for i in range(901):
    back=.16+i*.0006;span=span_for(back)
    if span is not None:options.append((abs(limb_arc(span,back)-limbTarget),back,span))
if not options:raise ValueError("No fixed-length bow configuration")
arcError,back,span=min(options);top,bot=ends(span,back)
gear=[];verts=[];faces=[];N=64;M=10
for i in range(N+1):
    t=i/N*2-1;p=center+up*(t*span)-forward*(back*abs(t)**1.8);r=.019*(1-.78*abs(t))
    for j in range(M):
        q=j/M*math.tau;verts.append(tuple(p+side*math.cos(q)*r+forward*math.sin(q)*r*.78))
for i in range(N):
    for j in range(M):faces.append((i*M+j,i*M+(j+1)%M,(i+1)*M+(j+1)%M,(i+1)*M+j))
# Separate wood core and leather grip; both share the same centerline.
bow=mesh("Bent yew limbs",verts,faces,wood,None)
for p in bow.data.polygons:p.use_smooth=True
gear.append(bow);gear.append(rod("Bow grip leather",center-up*.048,center+up*.048,.020,leather,None))
gear.extend([rod("String upper",top,nock,.0028,linen,None,8),rod("String lower",nock,bot,.0028,linen,None,8)])
# Arrow lies along measured nock/rest, so it cannot point independently.
arrowAxis=delta.normalized();tip=nock+arrowAxis*max(.76,delta.length+.07)
gear.append(rod("Arrow shaft",nock,tip-arrowAxis*.025,.004,wood,None,8))
gear.append(rod("Arrow head",tip-arrowAxis*.035,tip,.007,steel,None,8))
# Genuine skin/gear intersections, with intended pressure contacts localized.
def geom(o,labels=False):
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh()
    try:
        m.calc_loop_triangles();vs=[ev.matrix_world@v.co for v in m.vertices];ts=[tuple(t.vertices) for t in m.loop_triangles]
        if not labels:return vs,ts
        names={g.index:g.name for g in o.vertex_groups};regions=[]
        for tri in ts:
            w={}
            for i in tri:
                for g in m.vertices[i].groups:
                    name=names.get(g.group,"")
                    if not name.startswith("Workshop cut "):w[name]=w.get(name,0)+g.weight
            regions.append(max(w,key=w.get) if w else "")
        return vs,ts,regions
    finally:ev.to_mesh_clear()
def collision():
    bodies=[]
    for o in core:
        vs,ts,labels=geom(o,True);bodies.append((BVHTree.FromPolygons(vs,ts,all_triangles=True),vs,ts,labels))
    for name,q in posed_hands.items():
        for o in q["objects"]:
            vs,ts=geom(o);bodies.append((BVHTree.FromPolygons(vs,ts,all_triangles=True),vs,ts,[name]*len(ts)))
    result=[];Lnames={b.name for b in desc(L)};Rnames={b.name for b in desc(R)}
    for o in gear:
        vs,ts=geom(o);tree=BVHTree.FromPolygons(vs,ts,all_triangles=True)
        for body,bvs,bts,labels in bodies:
            hits=tree.overlap(body);bad=[]
            for _,j in hits:
                p=sum((bvs[k] for k in bts[j]),Vector((0,0,0)))/3
                # Only hand region within the actual grip/arrow rest or
                # finger-hook region is allowed, not all of the arm.
                allowed=(labels[j] in Lnames and (p-center).length<.09 and o.name in ("Bent yew limbs","Bow grip leather","Arrow shaft")) or (labels[j] in Rnames and (p-nock).length<.065 and (o.name.startswith("String") or o.name=="Arrow shaft"))
                if not allowed:bad.append(labels[j])
            if hits:result.append({"part":o.name,"triangles":len(hits),"unexpected":len(bad),"regions":sorted(set(bad))})
    return result
bpy.context.view_layer.update();pts=mesh_points();sc.frame_set(1);bpy.context.view_layer.update()
elbow=point(RF);backVector=elbow-nock;elbowError=(backVector-forward*backVector.dot(forward)).length
wristBend=[math.degrees((point(h)-point(f)).angle(hand_frame(h)[0][2])) for f,h in ((RF,R),(LF,L))]
row={"phase":"full-draw","joints":snap(),"jawAnchor":vec(jaw),"rightContact":right,"leftContact":left,"bowGrip":vec(center),"arrowRest":vec(rest),"stringNock":vec(nock),"arrowTip":vec(tip),"topTip":vec(top),"bottomTip":vec(bot),"drawMetres":draw,"lateralError":offaxis,"arrowAngleDegrees":math.degrees(arrowAxis.angle(forward)),"elbowLineError":elbowError,"elbowBehindNock":-backVector.dot(forward),"wristBendDegrees":wristBend,"stringLength":string_length(span,back,nock),"braceStringLength":stringTarget,"limbLengthError":arcError,"meshAfterFrameSet":mesh_delta(pts,mesh_points()),"contacts":collision()}
audit["samples"]["anchor"]=[row];save()
for view in REVIEW_VIEWS:
    review_render("key-anchor",view)
review_render("bow-grip","angle45",center,.55)
review_render("string-fingers","angle45",nock,.45)
review_render("string-anchor","top",nock,.65)
row["meshAfterRender"]=mesh_delta(pts,mesh_points())
bad=offaxis>.025 or row["arrowAngleDegrees"]>3 or right["error"]>.03 or left["error"]>.025 or not .45<draw<.82 or row["elbowBehindNock"]<=.03 or elbowError>.16 or max(wristBend)>30 or abs(row["stringLength"]-stringTarget)>.001 or arcError>.006 or row["meshAfterRender"]["max"]>.005 or row["meshAfterFrameSet"]["max"]>.005 or any(c["unexpected"] for c in row["contacts"])
audit["staticGate"]={"pass":not bad,"animationDeferred":True,"reason":"Full draw static pose must receive visual approval before a shot cycle"};audit["artisticApproval"]=False;save()
if bad:raise ValueError("Full draw anatomical integrity gate failed; original native 1080p views retained")
