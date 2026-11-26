"""Local armed-human study. Original human mesh, no production assets."""
import os,json,math,re,hashlib,urllib.request
from pathlib import Path
from mathutils.bvhtree import BVHTree
# Retain the proven action-detachment and actual child-axis solver.
src=Path(__file__).with_name("sword-motion.py")
exec(compile(src.read_text().split("# Distinct load, acceleration",1)[0].replace('os.environ["BOW_TROOP"]="sword"','os.environ["BOW_TROOP"]=os.environ.get("BOW_WORKSHOP_ROLE","sword")'),str(src),"exec"))
folder=out/("retarget" if os.environ.get("BOW_WORKSHOP_MOCAP") else "anatomy");folder.mkdir(exist_ok=True)
audit["study"]="Character Fidelity IV";audit["samples"]={};audit["issues"]=[]
def save():(folder/"anatomy-audit.json").write_text(json.dumps(audit,indent=2))
def norm(n):return re.sub("[^a-z0-9]","",n.lower())
def desc(b):
    return [b]+list(b.children_recursive)
def finger_chains(hand):
    result={}
    for digit in ("thumb","index","middle","ring","pinky"):
        aliases=(digit,"little") if digit=="pinky" else (digit,)
        bs=[b for b in desc(hand)[1:] if any(a in norm(b.name) for a in aliases)]
        bs.sort(key=lambda b:len(b.parent_recursive))
        if len(bs)>=2 and all(b in desc(bs[0]) for b in bs):result[digit]=bs
    return result
posed_hands={};pending_cuts=[]
def hand_frame(hand):
    if hand.name in posed_hands:
        q=posed_hands[hand.name];m=rig.matrix_world@hand.matrix
        return (m@q["center"],*((m.to_3x3()@v).normalized() for v in q["axes"]),q["width"]),{}
    f=finger_chains(hand)
    if not all(k in f for k in ("index","middle","ring","pinky","thumb")):
        return None,f
    a,b=point(f["index"][0]),point(f["pinky"][0]);knuckle=(a+b)*.5
    across=(a-b).normalized();forward=(knuckle-point(hand)).normalized()
    forward=(forward-across*forward.dot(across)).normalized()
    palm=across.cross(forward).normalized()
    # Thumb lies on the palmar side on the imported hand; check this on
    # rest joints, using the other side only if the sign is ambiguous.
    thumb=point(f["thumb"][-1])-point(hand)
    if palm.dot(thumb)<0:palm=-palm
    width=(a-b).length
    center=knuckle+forward*width*.12+palm*width*.30
    return (center,across,forward,palm,width),f
reset()
hand_data={}
for hand in (R,L):
    frame,chains=hand_frame(hand)
    hand_data[hand.name]={"chains":{k:[b.name for b in v] for k,v in chains.items()},"frame":None if frame is None else [vec(v) if isinstance(v,Vector) else v for v in frame]}
audit["hands"]=hand_data
save()
# Source geometry inventory: hide only identified obsolete equipment, not
# unknown body parts. This also catches a visible stale spear or its blade.
audit["sourceObjects"]=[{"name":o.name,"type":o.type,"hidden":o.hide_render,"parent":o.parent.name if o.parent else None,"bone":o.parent_bone,"bounds":[vec(o.matrix_world@Vector(v)) for v in o.bound_box] if o.type=="MESH" else None} for o in sc.objects]
obsolete=[o for o in sc.objects if o.type=="MESH" and o.name.startswith(("Ash spear","Forged spear","Sword grip","Sword crossguard","Forged sword blade","Curved shield","Shield rawhide","Shield boss"))]
for o in obsolete:o.hide_render=True
audit["retiredEquipment"]=[o.name for o in obsolete];save()
# Separate posed glove only when the source lacks digit articulation.
def separate_hand(hand):
    deps=bpy.context.evaluated_depsgraph_get();weighted=[]
    for o in core:
        names={g.index:g.name for g in o.vertex_groups};region={b.name for b in desc(hand)}
        indices=[v.index for v in o.data.vertices if sum(g.weight for g in v.groups if names.get(g.group) in region)>.65]
        if not indices:continue
        ev=o.evaluated_get(deps);me=ev.to_mesh()
        try:
            if len(me.vertices)!=len(o.data.vertices):raise ValueError("Hand topology mismatch")
            weighted.extend(ev.matrix_world@me.vertices[i].co for i in indices)
        finally:ev.to_mesh_clear()
        group=o.vertex_groups.new(name="Workshop cut "+hand.name);group.add(indices,1,"REPLACE");pending_cuts.append((o,group.name))
    if len(weighted)<12:raise ValueError("No reliable hand region "+hand.name)
    wrist=point(hand);centroid=sum(weighted,Vector((0,0,0)))/len(weighted);forward=(centroid-wrist).normalized()
    import numpy as np
    d=np.array([tuple(v-wrist) for v in weighted]);u=np.array(tuple(forward));p=d-np.outer(d@u,u);_,_,vh=np.linalg.svd(p,full_matrices=False)
    across=Vector(vh[0]).normalized();normal=across.cross(forward).normalized()
    if normal.dot(Vector((1 if point(hand).x>0 else -1,0,0)))<0:normal=-normal
    width=max(.055,min(.10,float(np.percentile(p@np.array(tuple(across)),95)-np.percentile(p@np.array(tuple(across)),5))))
    length=max(.12,min(.19,max((v-wrist).dot(forward) for v in weighted)));center=wrist+forward*length*.55+normal*width*.24
    inv=(rig.matrix_world@hand.matrix).inverted()
    posed_hands[hand.name]={"center":inv@center,"axes":[inv.to_3x3()@v for v in (across,forward,normal)],"width":width,"length":length,"wrist":inv@wrist,"objects":[]}
    audit["hands"][hand.name]["posedGlove"]={"width":width,"length":length,"maskedSourceVertices":len(weighted)}
for h in (R,L):
    if hand_frame(h)[0] is None:separate_hand(h)
for o,name in pending_cuts:
    modifier=o.modifiers.new("Replace source hand only","MASK");modifier.vertex_group=name;modifier.invert_vertex_group=True;modifier.threshold=.5
bpy.context.view_layer.update();save()
def world_of(b):return rig.matrix_world@b.matrix
def local(b,p):return world_of(b).inverted()@Vector(p)
def world_pos(b,p):return world_of(b)@Vector(p)
def bend_digit(bs,center,axis,rad,amount=1):
    # Curl around the actual cylinder, using the child joint directions,
    # not Blender-generated bone tails. Each joint bends progressively.
    for j,b in enumerate(bs[:-1]):
        a=point(b);child=bs[j+1];v=point(child)-a
        closest=center+axis*(a-center).dot(axis)
        radial=a-closest
        if radial.length<.001:continue
        tangent=axis.cross(radial).normalized()
        if tangent.dot(v)<0:tangent=-tangent
        target=(tangent*.83-radial.normalized()*.30).normalized()
        desired=v.normalized().lerp(target,amount*(.82 if j==0 else .94))
        rotate_axis(b,v,desired)
# Use the actual articulated source rig in the isolated scene. No return
# to the rejected swept-finger geometry if the import or mapping fails.
if posed_hands:
    exec(compile(Path(__file__).with_name("articulated-hand.py").read_text(),"articulated-hand.py","exec"))
def curl_hand(hand,center,axis,rad):
    if hand.name in posed_hands:
        make_posed_glove(hand,center,axis,rad)
        return
    for name,bs in finger_chains(hand).items():
        bend_digit(bs,center,axis,rad,.78 if name=="thumb" else 1)
def grip_proximity(hand,center,axis,radius,limits):
    axis=Vector(axis).normalized()
    q=posed_hands.get(hand.name);pts=[]
    if q and q["objects"]:pts=vertices(q["objects"])
    else:
        regions={b.name for b in desc(hand)}
        for o in core:
            ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();names={g.index:g.name for g in o.vertex_groups}
            try:
                for v in me.vertices:
                    if sum(g.weight for g in v.groups if names.get(g.group) in regions)>.5:pts.append(ev.matrix_world@v.co)
            finally:ev.to_mesh_clear()
    axial=[]
    for p in pts:
        d=p-center;t=d.dot(axis)
        if limits[0]<=t<=limits[1]:axial.append((t,(d-axis*t).length-radius))
    if not axial:return {"nearSurfaceVertices":0,"closestSurfaceGap":None,"contactBands":0,"vertices":len(pts)}
    near=[t for t,dist in axial if abs(dist)<=.004]
    bins={min(5,max(0,int((t-limits[0])/max(.001,limits[1]-limits[0])*6))) for t in near}
    return {"nearSurfaceVertices":len(near),"closestSurfaceGap":min(abs(dist) for _,dist in axial),"contactBands":len(bins),"vertices":len(pts),"maxSampledRadialIntrusion":max(0,-min(dist for _,dist in axial))}
def rigid_mesh(name,v,f,matl,b):
    o=mesh(name,v,f,matl,None);attach(o,b);return o
def leather_loop(name,center,axis,normal,radius,width,b):
    # Actual curved leather loop, anchored to the board at both ends.
    lateral=axis.cross(normal).normalized();vs=[];fs=[]
    for j in range(17):
        a=math.pi*j/16;p=center+normal*(math.sin(a)*radius)+lateral*(math.cos(a)*radius)
        for t in (-.5,.5):vs.append(tuple(p+axis*width*t))
    for j in range(16):fs.append((j*2,j*2+1,j*2+3,j*2+2))
    o=rigid_mesh(name,vs,fs,leather,b);m=o.modifiers.new("Leather thickness","SOLIDIFY");m.thickness=.004;return o
# Anatomical joint-frame solver. The weapon is never an IK target.
# All axes are calibrated from the actual source joints and digit roots.
from mathutils import Quaternion
def basis3(axis,side):
    x=Vector(axis).normalized();y=Vector(side)-x*Vector(side).dot(x)
    if y.length<1e-5:raise ValueError("Degenerate anatomical frame")
    y.normalize();z=x.cross(y).normalized()
    return Matrix((x,y,z)).transposed()
def set_world_rotation(b,q):
    m=world_of(b);s=m.to_scale();p=m.translation.copy()
    b.matrix=rig.matrix_world.inverted()@Matrix.LocRotScale(p,q,s)
    bpy.context.view_layer.update()
def orient(b,local_frame,axis,side):
    q=(basis3(axis,side)@local_frame.transposed()).to_quaternion()
    set_world_rotation(b,q)
def calibration(chain):
    u,f,h=chain;v=point(f)-point(u);w=point(h)-point(f)
    n=v.cross(w)
    if n.length<1e-5:n=v.cross(Vector((0,0,1)))
    if n.length<1e-5:n=v.cross(Vector((0,1,0)))
    n.normalize()
    return {"lengths":(v.length,w.length),"upper":world_of(u).to_quaternion().inverted().to_matrix()@basis3(v,n),"lower":world_of(f).to_quaternion().inverted().to_matrix()@basis3(w,n)}
armFrames=[calibration(c) for c in arms]
shieldNormalLocal=None
def arm_pose(i,offset,bend=None,roll=0):
    u,f,h=arms[i];cal=armFrames[i];a=point(u)
    target=a+Vector((offset[0]*sign,offset[1],offset[2]))
    d=target-a;v=d.normalized();l1,l2=cal["lengths"]
    r=max(abs(l1-l2)+.018,min(l1+l2-.012,d.length))
    pref=Vector(bend if bend is not None else ((sign if i==0 else -sign),.08,-.70))
    pref-=v*pref.dot(v)
    if pref.length<1e-5:raise ValueError("Degenerate elbow plane")
    pref.normalize();z=(l1*l1-l2*l2+r*r)/(2*r)
    elbow=a+v*z+pref*math.sqrt(max(0,l1*l1-z*z));end=a+v*r
    va=elbow-a;vb=end-elbow;n=va.cross(vb).normalized()
    orient(u,cal["upper"],va,n)
    # The forearm can rotate axially, but the wrist will retain its calibrated
    # relation to it. Left shield surface must always face away from chest.
    vb=end-point(f);axis=vb.normalized()
    if i==1 and shieldNormalLocal is not None:
        outward=Vector((-sign*.35,-1,.04))
        orient(f,basis3(cal["lower"].col[0],shieldNormalLocal),axis,outward)
    else:
        side=Quaternion(axis,roll)@n
        orient(f,cal["lower"],axis,side)
    return (point(h)-end).length
def neutral_hand(hand,forearm,across_hint):
    (c,across,forward,palm,w),_=hand_frame(hand)
    source=world_of(hand).to_quaternion().inverted().to_matrix()@basis3(forward,across)
    axis=(point(hand)-point(forearm)).normalized()
    orient(hand,source,axis,Vector(across_hint))
def lock_hand(hand,forearm,rel):
    m=rig.matrix_world.inverted()@world_of(forearm)@rel
    m.translation=hand.matrix.translation.copy();hand.matrix=m;bpy.context.view_layer.update()
def relative_q(hand,forearm):
    return (world_of(forearm).to_quaternion().inverted()@world_of(hand).to_quaternion()).normalized()
# Fit both pieces of equipment in a real guard pose, not the old source idle.
reset()
arm_pose(0,(.30,-.24,-.30),roll=0)
arm_pose(1,(.09,-.31,-.24),bend=(-sign,.04,-.65))
neutral_hand(R,RF,(0,0,1))
neutral_hand(L,LF,(0,0,1))
rightRel=world_of(RF).inverted()@world_of(R)
rightNeutral=relative_q(R,RF)

# A single-handed sword, grip crossing the closed fingers rather than
# extending longitudinally from the wrist joint.
(rc,ra,rf,rn,rw),_=hand_frame(R)
radius=max(.009,min(.016,rw*.19))
curl_hand(R,rc,ra,radius)
def hand_surface(hand):
    q=posed_hands.get(hand.name)
    if q and q["objects"]:return vertices(q["objects"])
    names0={b.name for b in desc(hand)};result=[]
    for o in core:
        ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();names={g.index:g.name for g in o.vertex_groups}
        try:
            for v in me.vertices:
                if sum(g.weight for g in v.groups if names.get(g.group) in names0)>.55:result.append(ev.matrix_world@v.co)
        finally:ev.to_mesh_clear()
    if not result:raise ValueError("No evaluated hand surface")
    return result
rightSurface=hand_surface(R)
extent=[(p-rc).dot(ra) for p in rightSurface]
gripMin=min(extent)-.014;gripMax=max(extent)+.014
# The guard and pommel must be beyond the entire posed hand, including
# the thumb, not a guessed length derived from wrist width.
grip=rod("Held leather grip",rc+ra*gripMin,rc+ra*gripMax,radius,leather,None);attach(grip,R)
guardC=rc+ra*(gripMax+.013);guard=rod("Held crossguard",guardC-rf*.095,guardC+rf*.095,.010,steel,None);attach(guard,R)
pommel=rod("Held pommel",rc+ra*(gripMin-.034),rc+ra*(gripMin-.003),.021,steel,None);attach(pommel,R)
audit["swordGripFit"]={"handAxialExtent":[min(extent),max(extent)],"gripEnds":[gripMin,gripMax],"guardAxialClearance":gripMax+.013-.010-max(extent),"sourceHandVertices":len(rightSurface)}
start=guardC+ra*.015;tip=start+ra*.78
v=[]
for c,w,t in ((start,.030,.009),(start+ra*.65,.020,.006),(tip,.001,.001)):
    v.extend(tuple(c+q) for q in (rf*w,rn*t,-rf*w,-rn*t))
bladeObj=rigid_mesh("Held forged blade",v,[(j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i) for j in range(2) for i in range(4)]+[(0,3,2,1),(8,9,10,11)],steel,R)
swordParts=[grip,guard,pommel,bladeObj];gripLocal=local(R,rc);axisLocal=world_of(R).inverted().to_3x3()@ra;tipLocal=local(R,tip)
# Shield board follows forearm rather than wrist. Its inner surface is
# offset from the actual arm; the fist holds the distal fixed loop.
(lc,la,lf,ln,lw),_=hand_frame(L)
elbow=point(LF);wrist=point(L);arm=(wrist-elbow).normalized()
normal=Vector((-sign*.35,-1,.04));normal=(normal-arm*normal.dot(arm)).normalized()
across=arm;up=normal.cross(across).normalized()
if up.z<0:across=-across;up=-up
# Exterior side and a physical clearance measured along its outward normal.
center=elbow+(wrist-elbow)*.58+normal*.145
shieldNormalLocal=world_of(LF).to_quaternion().inverted()@normal
shieldCenterLocal=local(LF,center)
shieldFit={"normal":vec(shieldNormalLocal),"center":vec(shieldCenterLocal),"halfWidth":.265,"halfHeight":.325}
audit["shieldFit"]=shieldFit
vs=[tuple(center+normal*.045)];faces=[];N=40
for r in (.5,1):
    for i in range(N):
        a=2*math.pi*i/N;vs.append(tuple(center+across*(.265*r*math.cos(a))+up*(.325*r*math.sin(a))+normal*.045*(1-r*r)))
for i in range(N):faces.append((0,1+i,1+(i+1)%N));faces.append((1+i,1+N+i,1+N+(i+1)%N,1+(i+1)%N))
board=rigid_mesh("Forearm targe / painted boards",vs,faces,paint,LF);m=board.modifiers.new("Wood thickness","SOLIDIFY");m.thickness=.018
shieldParts=[board]
for i in range(N):
    a=2*math.pi*i/N;b=2*math.pi*(i+1)/N
    p=lambda q:center+across*(.265*math.cos(q))+up*(.325*math.sin(q))
    rim=rod("Targe rawhide rim",p(a),p(b),.009,leather,None,6);attach(rim,LF);shieldParts.append(rim)
# Preserve accepted board orientation. Fit the rear hardware to the
# measured cross-section of the actual guard-pose forearm and closed hand.
forearmCenter=elbow+(wrist-elbow)*.30
side=arm.cross(normal).normalized();strapVerts=[];strapFaces=[]
armSamples=[]
for o in core:
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();names={g.index:g.name for g in o.vertex_groups}
    try:
        for v in me.vertices:
            if sum(g.weight for g in v.groups if names.get(g.group)==LF.name)<.38:continue
            p=ev.matrix_world@v.co
            if abs((p-forearmCenter).dot(arm))<.047:armSamples.append(p)
    finally:ev.to_mesh_clear()
if len(armSamples)<8:raise ValueError("Cannot measure forearm for strap")
# Fit a radial envelope per angle; the strap is 3 mm outside the
# measured sleeve rather than a fixed radius through the arm.
radial=[Vector(((p-forearmCenter).dot(side),(p-forearmCenter).dot(normal))) for p in armSamples]
def arm_envelope(theta):
    v=Vector((math.cos(theta),-math.sin(theta)))
    radius=max(0,max(p.dot(v) for p in radial))+.006
    return forearmCenter+side*v.x*radius+normal*v.y*radius
for k in range(33):
    t=math.pi*k/32;p=arm_envelope(t)
    for sgn in (-1,1):strapVerts.append(tuple(p+arm*.019*sgn))
for k in range(32):strapFaces.append((k*2,k*2+1,k*2+3,k*2+2))
strap=rigid_mesh("Forearm enarme inner loop",strapVerts,strapFaces,leather,LF)
mod=strap.modifiers.new("Leather thickness","SOLIDIFY");mod.thickness=.003
handleCenter=lc
curl_hand(L,handleCenter,la,.014)
leftSurface=hand_surface(L)
leftExt=[(p-handleCenter).dot(la) for p in leftSurface]
handleMin=min(leftExt)-.018;handleMax=max(leftExt)+.018
handle=rod("Fixed shield hand grip",handleCenter+la*handleMin,handleCenter+la*handleMax,.014,leather,None);attach(handle,LF)
def mount_to_back(p):
    u=(p-center).dot(across);v=(p-center).dot(up);r=math.hypot(u/.265,v/.325)
    if r>.91:u*=.91/r;v*=.91/r;r=.91
    return center+across*u+up*v+normal*(.045*(1-r*r)-.018)
for sgn in (-1,1):
    end=handleCenter+la*(handleMax if sgn>0 else handleMin)
    # Keep the bracket outside the measured hand envelope before
    # turning toward the board. This avoids routing through the thumb.
    elbowMount=end+la*sgn*.014;mount=mount_to_back(elbowMount)
    for a0,b0 in ((end,elbowMount),(elbowMount,mount)):
        o=rod("Shield grip bracket",a0,b0,.007,leather,None,10);attach(o,LF);shieldParts.append(o)
    end=arm_envelope(0 if sgn>0 else math.pi);mount=mount_to_back(end+side*.008*sgn)
    anchor=rod("Enarme riveted tab",end,mount,.008,leather,None,10);attach(anchor,LF);shieldParts.append(anchor)
    pin=rod("Enarme rivet",mount-normal*.003,mount+normal*.024,.008,steel,None,8);attach(pin,LF);shieldParts.append(pin)
audit["shieldHardwareFit"]={"forearmSamples":len(armSamples),"handleExtent":[handleMin,handleMax],"measuredHandExtent":[min(leftExt),max(leftExt)],"strapClearance":.006}
shieldParts.extend([strap,handle])
leftRel=world_of(LF).inverted()@world_of(L)
leftNeutral=relative_q(L,LF)
handleLocal=local(LF,handleCenter);handleAxis=world_of(LF).inverted().to_3x3()@la
def lock_left():
    lock_hand(L,LF,leftRel)
    c=world_pos(LF,handleLocal);a=(world_of(LF).to_3x3()@handleAxis).normalized();curl_hand(L,c,a,.014)
    return (point(L)-(world_of(LF)@leftRel).translation).length
def hold_sword(flex=0,deviation=0):
    # Conservative independent wrist degrees of freedom in the calibrated
    # anatomical frame, never a world-space sword aiming command.
    lock_hand(R,RF,rightRel)
    _,across,forward,palm,_=hand_frame(R)[0]
    flex=max(-18,min(18,flex));deviation=max(-10,min(10,deviation))
    q=Quaternion(palm,math.radians(deviation))@Quaternion(across,math.radians(flex))@world_of(R).to_quaternion()
    set_world_rotation(R,q)
    c=world_pos(R,gripLocal);axis=(world_of(R).to_3x3()@axisLocal).normalized();curl_hand(R,c,axis,radius)
def shield_audit():
    n=(world_of(LF).to_quaternion()@shieldNormalLocal).normalized()
    c=world_pos(LF,shieldCenterLocal);armMid=(point(LF)+point(L))*.5
    outward=(armMid-point(torso)).normalized();front=Vector((0,-1,0))
    return {"faceNormal":vec(n),"boardCenter":vec(c),"forearmMid":vec(armMid),"outwardDot":n.dot(outward),"forwardDot":n.dot(front),"armOnBackMetres":(c-armMid).dot(n),"handleError":(world_pos(LF,handleLocal)-hand_frame(L)[0][0]).length}
# Evaluated triangle BVHs. Allow hand/grip and arm/strap contacts only,
# never blade/body, shield board/body, or weapon/shield intersections.
def geometry(o,with_labels=False):
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
    try:
        me.calc_loop_triangles();v=[ev.matrix_world@v.co for v in me.vertices];t=[tuple(t.vertices) for t in me.loop_triangles]
        if not with_labels:return v,t
        names={g.index:g.name for g in o.vertex_groups};labels=[]
        for tri in t:
            weights={}
            for i in tri:
                for group in me.vertices[i].groups:
                    name=names.get(group.group,"")
                    if name.startswith("Workshop cut "):continue
                    weights[name]=weights.get(name,0)+group.weight
            labels.append(max(weights,key=weights.get) if weights else "")
        return v,t,labels
    finally:ev.to_mesh_clear()
def bvh(o):
    v,t=geometry(o);return BVHTree.FromPolygons(v,t,all_triangles=True),v,t
def inspect_contacts():
    bodies=[]
    for o in core:
        vs,ts,labels=geometry(o,True);bodies.append((BVHTree.FromPolygons(vs,ts,all_triangles=True),labels))
    for name,q in posed_hands.items():
        for o in q["objects"]:
            tree,_,tris=bvh(o);bodies.append((tree,[name]*len(tris)))
    for o in sc.objects:
        if o.type!="MESH" or o.hide_render or o in core or o in swordParts or o in shieldParts or o.name.startswith("Imported articulated glove"):continue
        if o.name.startswith(("Curved forged breastplate","Kettle hat","Rolled rim")):
            tree,_,tris=bvh(o);bodies.append((tree,["rigid armour: "+o.name]*len(tris)))
    result=[];rightNames={b.name for b in desc(R)};leftNames={b.name for b in desc(L)}
    for o in swordParts+shieldParts:
        if o.hide_render:continue
        tree,vs,tris=bvh(o)
        allowed=rightNames if o==grip else leftNames if o==handle else {LF.name} if o==strap else set()
        for bodyTree,labels in bodies:
            hits=tree.overlap(bodyTree)
            if not hits:continue
            bad=[];depths=[];near=0
            for k,j in hits:
                label=labels[j]
                # A signed nearest-surface estimate is useful but not a
                # watertight solid proof. Never waive forbidden-region
                # intersections; allow only localized shallow intended contact.
                penetrations=[]
                for vi in tris[k]:
                    p=vs[vi];loc,norm0,idx,dist=bodyTree.find_nearest(p)
                    if loc is not None and norm0 is not None:penetrations.append(max(0,-(p-loc).dot(norm0)))
                depth=max(penetrations,default=0);depths.append(depth)
                if label in allowed and depth<=.002:near+=1
                else:bad.append(label)
            result.append({"equipment":o.name,"triangles":len(hits),"allowedSurfaceContacts":near,"unexpected":len(bad),"regions":sorted(set(bad)),"maxEstimatedPenetrationMetres":max(depths,default=0),"estimateNotSolidProof":True})
    for a in swordParts:
        if a.hide_render:continue
        at,_,_=bvh(a)
        for b in shieldParts:
            if b.hide_render:continue
            bt,_,_=bvh(b);n=len(at.overlap(bt))
            if n:result.append({"equipment":a.name+"/"+b.name,"unexpected":n,"triangles":n})
    return result
# Upright gait from actual leg length; stance travel is linear in the
# moving reference frame, swing has separate toe clearance and heel strike.
reset()
for b in [hips,torso]+[x for chain in feet for x in chain]:
    b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
upright={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
ankles0=[point(end).copy() for _,_,end in feet];hip0=point(hips).copy()
foot_world=[world_of(leg[2]).copy() for leg in feet]
def reset_upright():
    reset()
    for b in rig.pose.bones:b.matrix_basis=upright[b.name].copy()
    bpy.context.view_layer.update()
def turn(b,angle):
    m=b.matrix.copy();p=m.translation.copy();axis=rig.matrix_world.inverted().to_3x3()@Vector((0,0,1));m=Matrix.Rotation(angle,4,axis)@m;m.translation=p;b.matrix=m;bpy.context.view_layer.update()
gaits={"march":(1.08,.59,.09,.018,.02),"fast":(.84,.71,.15,.038,.07),"cautious":(1.60,.35,.065,.11,.15),"combat-walk":(1.38,.39,.08,.075,.08)}
def boot_surface(end):
    region={b.name for b in desc(end)};pts=[]
    for o in core:
        ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();names={g.index:g.name for g in o.vertex_groups}
        try:
            for v in me.vertices:
                if sum(g.weight for g in v.groups if names.get(g.group) in region)>.55:pts.append(ev.matrix_world@v.co)
        finally:ev.to_mesh_clear()
    if len(pts)<8:raise ValueError("No evaluated boot surface "+end.name)
    return pts
def plant_boot(j,dest,bend,pitch,support):
    upper,lower,end=feet[j];goal=Vector(dest);first=None;res=0
    for iteration in range(6):
        res=limb(upper,lower,end,goal,bend);foot_orientation(j,pitch)
        lowest=min(p.z for p in boot_surface(end));error=lowest-z0
        if first is None:first=error
        if support:
            if abs(error)<.004:break
            goal.z-=max(-.06,min(.06,error*.9))
        elif error<-.003:goal.z+=min(.05,-error+.003)
        else:break
    return res,{"beforeSoleOffset":first,"afterSoleOffset":lowest-z0,"support":support,"target":vec(goal),"actual":vec(point(end)),"pitch":pitch}
def gait(motion,phase):
    period,stride,lift,drop,lean=gaits[motion];wave=math.sin(2*math.pi*phase)
    shift_hips((.018*sign*wave,0,-drop+.012*math.cos(4*math.pi*phase)))
    turn(hips,.045*wave);turn(torso,-.07*wave)
    if lean:set_world_rotation(torso,Quaternion(Vector((1,0,0)),lean)@world_of(torso).to_quaternion())
    errors=[];stance=[]
    for j,(upper,lower,end) in enumerate(feet):
        t=(phase+j*.5)%1;support=t<.60;u=t/.60 if support else (t-.60)/.40
        y=-stride*.5+stride*u if support else stride*.5-stride*(u*u*(3-2*u))
        z=0 if support else lift*math.sin(math.pi*u)
        dest=ankles0[j]+Vector((0,y,z))
        angle=(-.18*max(0,1-u*5)+.24*max(0,(u-.78)/.22)) if support else .18*math.cos(math.pi*u)
        err,contact=plant_boot(j,dest,(0,-1,0),angle,support);errors.append(err)
        contact.update({"rootRelativeY":point(end).y,"rootTravelY":-stride*phase/.60});stance.append(contact)
    errors.extend([arm_pose(0,(.23,-.11+.065*wave,-.45),roll=.10*wave),arm_pose(1,(.07,-.32-.035*wave,-.23),bend=(-sign,.04,-.65))])
    hold_sword(4*wave,2*math.sin(2*math.pi*phase+.7));lock_left()
    return errors,stance
# One conservative diagonal cut, with a continuous elbow plane. The
# authored variables are wrist position relative to shoulder, elbow-plane
# preference, pelvis/chest rotation and forearm pronation, NOT blade direction.
strike=[
 # phase, right hand from shoulder, left guard, pelvis displacement,
 # pelvis yaw, chest relative yaw, forearm pronation, trunk lean
 (0,(.30,-.24,-.30),(.09,-.31,-.24),(0,0,-.040),(0,0,0,0)),
 (.19,(.39,.045,.16),(.09,-.34,-.22),(.045,.065,-.045),(.16,.18,-.19,-.035)),
 (.32,(.34,-.055,.31),(.08,-.35,-.20),(.025,.025,-.060),(.02,.35,-.14,.005)),
 (.42,(.25,-.33,.20),(.09,-.35,-.22),(-.015,-.055,-.065),(-.25,.08,.06,.065)),
 (.53,(.06,-.51,-.025),(.11,-.32,-.24),(-.045,-.125,-.075),(-.32,-.20,.24,.085)),
 (.68,(.075,-.34,-.29),(.08,-.33,-.23),(-.03,-.080,-.055),(-.18,-.22,.15,.035)),
 (.84,(.22,-.26,-.31),(.09,-.32,-.24),(-.012,-.03,-.045),(-.06,-.08,.04,.01)),
 (1,(.30,-.24,-.30),(.09,-.31,-.24),(0,0,-.040),(0,0,0,0))]
def attack(phase):
    rh,lh,delta,rot=sample_keys(phase,strike);shift_hips((delta[0]*sign,delta[1],delta[2]))
    turn(hips,rot[0]*sign);turn(torso,rot[1]*sign)
    set_world_rotation(torso,Quaternion(Vector((1,0,0)),rot[3])@world_of(torso).to_quaternion())
    errors=[];stance=[]
    for j,(upper,lower,end) in enumerate(feet):
        target=ankles0[j]+Vector((0,-.17 if j==0 else .16,0))
        pitch=0 if j==0 else .14*math.sin(math.pi*max(0,min(1,(phase-.20)/.62)))**2
        err,contact=plant_boot(j,target,(0,-1,0),pitch,True);errors.append(err);stance.append(contact)
    errors.extend([arm_pose(0,rh,bend=(sign,.10,-.72),roll=rot[2]),arm_pose(1,lh,bend=(-sign,.04,-.65))])
    flex=sample_keys(phase,[(0,(0,0)),(.22,(-11,4)),(.38,(-15,3)),(.53,(16,-7)),(.70,(9,-4)),(1,(0,0))])[0]
    hold_sword(*flex);lock_left()
    return errors,stance
def feet_audit():
    # Derive actual ground contact from the skinned foot regions, not just
    # the ankle targets. This includes boots/toe geometry.
    result=[]
    for upper,lower,end in feet:
        regions={b.name for b in desc(end)};points=[]
        for o in core:
            ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();names={g.index:g.name for g in o.vertex_groups}
            try:
                for v in me.vertices:
                    if sum(g.weight for g in v.groups if names.get(g.group) in regions)>.55:points.append(ev.matrix_world@v.co)
            finally:ev.to_mesh_clear()
        a=point(upper)-point(lower);b=point(end)-point(lower)
        result.append({"kneeDegrees":math.degrees(a.angle(b)),"lowestSurfaceZ":min((v.z for v in points),default=None),"toeYRange":[min(v.y for v in points),max(v.y for v in points)] if points else None,"footVertices":len(points)})
    return {"feet":result,"hipsZ":point(hips).z,"headZ":point(bone("Head")).z,"sourceGroundZ":z0,"wrists":[{"hand":h.name,"forearmToPalmDegrees":math.degrees((point(h)-point(f)).angle(hand_frame(h)[0][2]))} for f,h in ((RF,R),(LF,L))]}
# All views share exact camera target, fixed orthographic scale and pose.
exec(compile(Path(__file__).with_name("review-cameras.py").read_text(),"review-cameras.py","exec"))
# Static equipment candidate: independently visible rear/side views and
# an explicitly isolated hardware-only view (not a claimed game render).
reset_upright()
arm_pose(0,(.30,-.24,-.30),roll=0)
arm_pose(1,(.09,-.31,-.24),bend=(-sign,.04,-.65))
hold_sword();lock_left()
bpy.context.view_layer.update()
staticContacts=inspect_contacts()
staticPose=shield_audit()
staticPose.update({"swordGripContact":grip_proximity(R,world_pos(R,gripLocal),(world_of(R).to_3x3()@axisLocal).normalized(),radius,(gripMin,gripMax)),"shieldGripContact":grip_proximity(L,world_pos(LF,handleLocal),(world_of(LF).to_3x3()@handleAxis).normalized(),.014,(handleMin,handleMax)),"contacts":staticContacts,"rightWrist":vec(relative_q(R,RF)),"leftWrist":vec(relative_q(L,LF)),"gripSource":audit.get("articulatedHandSource"),"wristAngles":feet_audit()["wrists"]})
staticBad=any(c.get("unexpected",0)>0 for c in staticContacts) or staticPose["outwardDot"]<.10 or staticPose["forwardDot"]<.35 or staticPose["handleError"]>.035 or any(staticPose[k]["contactBands"]<2 or staticPose[k]["nearSurfaceVertices"]<3 for k in ("swordGripContact","shieldGripContact"))
audit["staticEquipment"]={"pass":not staticBad,"pose":staticPose,"artisticApproval":False};audit["samples"]={"static-equipment":[{"phase":0,"joints":snap(),"bladeTip":vec(world_pos(R,tipLocal)),"shield":staticPose}]}
save()
if os.environ.get("BOW_WORKSHOP_MOTION")=="static-gear" or staticBad:
    plan_review_frames([review_points()])
    for view in REVIEW_VIEWS:review_render("key-static-equipment",view)
    for view in ("angle45","side","top","back"):
        review_render("grip-static",view,world_pos(R,gripLocal),.58)
        review_render("sleeve-seam",view,point(R),.44)
        review_render("shield-mounted",view,world_pos(LF,shieldCenterLocal),1.25)
    # Show the actual attached hardware without obscuring torso. Restore
    # visibility immediately. This is a diagnostic cutaway, not a render of
    # an invisible human presented as an artistic candidate.
    retain=set(shieldParts+posed_hands.get(L.name,{}).get("objects",[]))
    hidden=[o for o in sc.objects if o.type=="MESH" and not o.hide_render and o not in retain]
    for o in hidden:o.hide_render=True
    try:
        for view in ("back","side","top","angle45"):review_render("shield-isolated-hardware",view,world_pos(LF,shieldCenterLocal),1.25)
    finally:
        for o in hidden:o.hide_render=False
    save()
    if staticBad and os.environ.get("BOW_WORKSHOP_MOTION") not in ("march","retarget-march"):
        raise ValueError("Static equipment fit rejected; armed strike production withheld")
    if staticBad:
        # Independent gait-only comparison: rejected sword and shield are
        # hidden. Never claim this as a successful armed motion candidate.
        for o in swordParts+shieldParts:o.hide_render=True
        audit["gaitOnlyDueToEquipmentRejection"]=True;save()
samples={}
requested=os.environ.get("BOW_WORKSHOP_MOTION")
mocap=os.environ.get("BOW_WORKSHOP_MOCAP")
if requested=="static-gear":motions=()
elif mocap:
    exec(compile(Path(__file__).with_name("retarget-walk.py").read_text(),"retarget-walk.py","exec"))
    motions=("retarget-march",)
else:
    requested=os.environ.get("BOW_WORKSHOP_MOTION")
    motions=(requested,) if requested in ("march","strike") else ("march","strike")
for motion in motions:
    count=24 if motion in ("march","strike","retarget-march") else 16;samples[motion]=[];audit["samples"]=samples;reviewBounds=[]
    for i in range(count):
        reset_upright();phase=i/count;errors,stance=retarget_gait(phase) if motion=="retarget-march" else attack(phase) if motion=="strike" else gait(motion,phase)
        pts=mesh_points();sc.frame_set(1);bpy.context.view_layer.update();before=mesh_points()
        row={"phase":phase,"joints":snap(),"stance":stance,"maxIKResidual":max(errors),"footContact":feet_audit(),"meshAfterFrameSet":mesh_delta(pts,before),"contacts":inspect_contacts(),"bladeTip":vec(world_pos(R,tipLocal)),"rightWristRelative":vec(relative_q(R,RF)),"leftWristRelative":vec(relative_q(L,LF)),"shield":shield_audit(),"armRelative":{b.name:vec(relative_q(b,b.parent)) for b in (RU,RF,LU,LF) if b.parent}}
        samples[motion].append(row);reviewBounds.append(review_points());save()
        review_render(motion+"-%02d"%i,"side" if motion!="strike" else "angle45",preview=True)
        row["meshAfterRender"]=mesh_delta(before,mesh_points());save()
        if row["meshAfterRender"]["max"]>.005 or row["meshAfterFrameSet"]["max"]>.005:raise ValueError("Pose lost")
    # Quaternion geodesic angle includes the loop closure and is invariant
    # under q/-q representation. No unwrapped Euler artefacts.
    def qangle(a,b):return math.degrees(2*math.acos(min(1,max(0,abs(Quaternion(a).normalized().dot(Quaternion(b).normalized()))))))
    checks={}
    for field in ("rightWristRelative","leftWristRelative"):
        q=[r[field] for r in samples[motion]]
        gaps=[qangle(a,b) for a,b in zip(q,q[1:]+q[:1])]
        checks[field]={"maxStepDegrees":max(gaps),"pathDegrees":sum(gaps),"neutralDeviation":max(qangle(q[0],x) for x in q)}
    audit.setdefault("continuity",{})[motion]=checks
    bad=any(c["maxStepDegrees"]>12 or c["neutralDeviation"]>25 or c["pathDegrees"]>90 for c in checks.values())
    if motion=="strike":bad=bad or checks["rightWristRelative"]["pathDegrees"]<12
    for field in samples[motion][0]["armRelative"]:
        q=[r["armRelative"][field] for r in samples[motion]]
        gaps=[qangle(a,b) for a,b in zip(q,q[1:]+q[:1])]
        checks[field]={"maxStepDegrees":max(gaps),"pathDegrees":sum(gaps)}
        bad=bad or max(gaps)>45
    bad=bad or any(abs(s["afterSoleOffset"])>.012 if s["support"] else s["afterSoleOffset"]<-.006 for r in samples[motion] for s in r["stance"] if "afterSoleOffset" in s)
    bad=bad or any(max(w["forearmToPalmDegrees"] for w in r["footContact"]["wrists"])>35 for r in samples[motion])
    bad=bad or staticBad or any(r["shield"]["outwardDot"]<.10 or r["shield"]["forwardDot"]<.35 or r["shield"]["armOnBackMetres"]<.07 or r["shield"]["handleError"]>.035 or r["maxIKResidual"]>.025 or any(c.get("unexpected",0) for c in r["contacts"]) for r in samples[motion])
    audit.setdefault("preflight",{})[motion]={"pass":not bad,"samples":count,"strictContactGate":True}
    save()
    # Capture native six-view local evidence even when the integrity gate
    # rejects the pose. This is a single character/action, never an atlas.
    # A rejected cycle remains visibly marked as rejected in the manifest.
    def pose_at(i):
        reset_upright();p=i/count
        return retarget_gait(p) if motion=="retarget-march" else attack(p) if motion=="strike" else gait(motion,p)
    import shutil
    plan_review_frames(reviewBounds)
    for i in range(count):
        pose_at(i)
        for view in REVIEW_VIEWS:
            name=motion+"-%02d"%i
            review_render(name,view)
            if i in (0,count//4,count//2,3*count//4):
                shutil.copyfile(folder/(name+"-"+view+".png"),folder/("key-"+name+"-"+view+".png"))
        if motion=="strike" and i in (0,count//4,count//2,3*count//4):
            review_render("grip-"+motion+"-%02d"%i,"angle45",world_pos(R,gripLocal),.52)
            review_render("shield-rear-"+motion+"-%02d"%i,"back",world_pos(LF,shieldCenterLocal),1.25)
    save()
# Audit foot slip in the world frame during consecutive stance samples.
for motion,rows in samples.items():
    slip=[]
    for left,right in zip(rows,rows[1:]):
        for a,b in zip(left["stance"],right["stance"]):
            if a.get("support") and b.get("support") and "rootTravelY" in a and "rootTravelY" in b:
                slip.append(abs((b["actual"][1]+b["rootTravelY"])-(a["actual"][1]+a["rootTravelY"])))
    audit.setdefault("footSlipMetres",{})[motion]=max(slip,default=None)
audit["unexpectedContacts"]=sum(c.get("unexpected",0) for rs in samples.values() for r in rs for c in r["contacts"])
audit["artisticApproval"]=False;save()
if not all(r["pass"] for r in audit.get("preflight",{}).values()):raise ValueError("Anatomical integrity gate failed; retained original diagnostic and 1080p key poses")
