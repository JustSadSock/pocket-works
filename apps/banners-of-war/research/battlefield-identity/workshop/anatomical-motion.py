"""Local armed-human study. Original human mesh, no production assets."""
import os,json,math,re,hashlib,urllib.request
from pathlib import Path
from mathutils.bvhtree import BVHTree
# Retain the proven action-detachment and actual child-axis solver.
src=Path(__file__).with_name("sword-motion.py")
exec(compile(src.read_text().split("# Distinct load, acceleration",1)[0].replace('os.environ["BOW_TROOP"]="sword"','os.environ["BOW_TROOP"]=os.environ.get("BOW_WORKSHOP_ROLE","sword")'),str(src),"exec"))
folder=out/("retarget" if os.environ.get("BOW_WORKSHOP_MOCAP") else "anatomy");folder.mkdir(exist_ok=True)
audit["study"]="Anatomical Motion II";audit["samples"]={};audit["issues"]=[]
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
audit["sourceObjects"]=[{"name":o.name,"type":o.type,"hidden":o.hide_render,"parent":o.parent.name if o.parent else None,"bone":o.parent_bone} for o in sc.objects]
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
def make_posed_glove(hand,center,axis,rad):
    q=posed_hands[hand.name]
    for o in q["objects"]:bpy.data.objects.remove(o,do_unlink=True)
    (c,a,f,n,w),_=hand_frame(hand);wrist=world_pos(hand,q["wrist"]);length=q["length"]
    axis=Vector(axis).normalized();n=(n-axis*n.dot(axis)).normalized();f=(f-axis*f.dot(axis)-n*f.dot(n)).normalized()
    if f.length<.5:f=axis.cross(n).normalized()
    vs=[];fs=[]
    def sweep(points,radii,side):
        start=len(vs);N=10
        for j,p in enumerate(points):
            t=(points[min(j+1,len(points)-1)]-points[max(j-1,0)]).normalized();a=(side-t*side.dot(t)).normalized()
            if a.length<.5:a=t.cross(Vector((0,0,1))).normalized()
            b=t.cross(a).normalized();rx,ry=radii[j]
            for k in range(N):
                ang=2*math.pi*k/N;vs.append(tuple(p+a*rx*math.cos(ang)+b*ry*math.sin(ang)))
        for j in range(len(points)-1):
            for k in range(N):fs.append((start+j*N+k,start+j*N+(k+1)%N,start+(j+1)*N+(k+1)%N,start+(j+1)*N+k))
        fs.append(tuple(start+k for k in reversed(range(N))));fs.append(tuple(start+(len(points)-1)*N+k for k in range(N)))
    palmEnd=wrist+f*length*.55
    sweep([wrist-f*.012,wrist+f*.017,palmEnd-f*.025,palmEnd],[(w*.31,.021),(w*.39,.023),(w*.50,.024),(w*.46,.020)],axis)
    for k in range(4):
        along=(1.5-k)*w*.24;digit=rad+.011;r=.0105 if k<3 else .009
        sweep([palmEnd+axis*along-n*.009,center+axis*along+f*digit-n*.007,center+axis*along+n*digit+f*.006,center+axis*along-f*digit+n*.005],[(r,r*.88),(r,r*.88),(r*.90,r*.8),(r*.66,r*.65)],axis)
    sweep([wrist+f*length*.28+axis*w*.41,center+axis*w*.58-f*.012,center+axis*w*.42+n*(rad+.012),center+axis*w*.20+n*(rad+.012)],[(.016,.013),(.014,.012),(.012,.011),(.009,.009)],f)
    ob=mesh("Posed leather glove "+hand.name,vs,fs,leather,None)
    for poly in ob.data.polygons:poly.use_smooth=True
    attach(ob,hand);q["objects"]=[ob]
def curl_hand(hand,center,axis,rad):
    if hand.name in posed_hands:
        make_posed_glove(hand,center,axis,rad)
        return
    for name,bs in finger_chains(hand).items():
        bend_digit(bs,center,axis,rad,.78 if name=="thumb" else 1)
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
# A single-handed sword, grip crossing the closed fingers rather than
# extending longitudinally from the wrist joint.
(rc,ra,rf,rn,rw),_=hand_frame(R)
radius=max(.009,min(.016,rw*.19));gripHalf=max(.045,rw*.67)
grip=rod("Held leather grip",rc-ra*gripHalf,rc+ra*gripHalf,radius,leather,None);attach(grip,R)
guardC=rc+ra*(gripHalf+.009);guard=rod("Held crossguard",guardC-rf*.095,guardC+rf*.095,.012,steel,None);attach(guard,R)
pommel=rod("Held pommel",rc-ra*(gripHalf+.032),rc-ra*gripHalf,.023,steel,None);attach(pommel,R)
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
normal=Vector((0,-1,0));normal=(normal-arm*normal.dot(arm)).normalized()
across=arm;up=normal.cross(across).normalized()
if up.z<0:up=-up
center=(elbow+wrist)*.5+normal*.105
vs=[tuple(center+normal*.045)];faces=[];N=40
for r in (.5,1):
    for i in range(N):
        a=2*math.pi*i/N;vs.append(tuple(center+across*(.32*r*math.cos(a))+up*(.39*r*math.sin(a))+normal*.045*(1-r*r)))
for i in range(N):faces.append((0,1+i,1+(i+1)%N));faces.append((1+i,1+N+i,1+N+(i+1)%N,1+(i+1)%N))
board=rigid_mesh("Forearm targe / painted boards",vs,faces,paint,LF);m=board.modifiers.new("Wood thickness","SOLIDIFY");m.thickness=.018
shieldParts=[board]
for i in range(N):
    a=2*math.pi*i/N;b=2*math.pi*(i+1)/N
    p=lambda q:center+across*(.32*math.cos(q))+up*(.39*math.sin(q))
    rim=rod("Targe rawhide rim",p(a),p(b),.009,leather,None,6);attach(rim,LF);shieldParts.append(rim)
# Back of shield: two loops, the proximal arm enarme and fixed distal grip.
forearmCenter=elbow+(wrist-elbow)*.32+normal*.07
strap=leather_loop("Forearm enarme",forearmCenter,arm,-normal,.095,.046,LF)
handleCenter=lc
handle=rod("Fixed shield hand grip",handleCenter-la*.054,handleCenter+la*.054,.014,leather,None);attach(handle,LF)
for sign0 in (-1,1):
    end=handleCenter+la*sign0*.054
    mount=end+normal*.11
    o=rod("Shield grip bracket",end,mount,.012,leather,None);attach(o,LF);shieldParts.append(o)
# Both ends of the enarme are visibly fastened to the wooden board.
# Attach rivets at the true back-facing board surface.
for sgn in (-1,1):
    end=forearmCenter+arm.cross(-normal).normalized()*.095*sgn
    back=end+normal*((center-end).dot(normal)+.022)
    anchor=rod("Enarme riveted tab",end,back,.015,leather,None,8);attach(anchor,LF);shieldParts.append(anchor)
    pin=rod("Enarme rivet",back-normal*.006,back+normal*.01,.009,steel,None,8);attach(pin,LF);shieldParts.append(pin)
shieldParts.extend([strap,handle])
# Reproduce grip orientation relative to the forearm. Hand centre and
# longitudinal grip axis are calibrated from its actual digit roots.
leftRel=world_of(LF).inverted()@world_of(L);handleLocal=local(LF,handleCenter);handleAxis=world_of(LF).inverted().to_3x3()@la
def lock_left():
    m=rig.matrix_world.inverted()@world_of(LF)@leftRel;m.translation=L.matrix.translation;L.matrix=m;bpy.context.view_layer.update()
    c=world_pos(LF,handleLocal);a=(world_of(LF).to_3x3()@handleAxis).normalized();curl_hand(L,c,a,.014)
    return (point(L)-(world_of(LF)@leftRel).translation).length
def hold_sword(direction):
    a=(world_of(R).to_3x3()@axisLocal).normalized()
    rotate_axis(R,a,Vector((direction[0]*sign,direction[1],direction[2])))
    c=world_pos(R,gripLocal);a=(world_of(R).to_3x3()@axisLocal).normalized();curl_hand(R,c,a,radius)
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
    result=[];rightNames={b.name for b in desc(R)};leftNames={b.name for b in desc(L)}
    for o in swordParts+shieldParts:
        tree,_,_=bvh(o);allowed=rightNames if o==grip else leftNames if o==handle else {LF.name} if o==strap else set()
        for bodyTree,labels in bodies:
            hits=tree.overlap(bodyTree);bad=[labels[j] for _,j in hits if labels[j] not in allowed]
            if hits:result.append({"equipment":o.name,"triangles":len(hits),"allowed":len(hits)-len(bad),"unexpected":len(bad),"regions":sorted(set(bad))})
    for a in swordParts:
        at,_,_=bvh(a)
        for b in shieldParts:
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
def gait(motion,phase):
    period,stride,lift,drop,lean=gaits[motion];wave=math.sin(2*math.pi*phase)
    shift_hips((.018*sign*wave,0,-drop+.012*math.cos(4*math.pi*phase)))
    turn(hips,.045*wave);turn(torso,-.07*wave)
    if lean:rotate_axis(torso,rig.matrix_world.to_3x3()@torso.matrix.to_3x3()@Vector((0,1,0)),Vector((0,-lean,1)))
    errors=[];stance=[]
    for j,(upper,lower,end) in enumerate(feet):
        t=(phase+j*.5)%1;support=t<.60;u=t/.60 if support else (t-.60)/.40
        y=-stride*.5+stride*u if support else stride*.5-stride*(u*u*(3-2*u))
        z=0 if support else lift*math.sin(math.pi*u)
        dest=ankles0[j]+Vector((0,y,z));errors.append(limb(upper,lower,end,dest,(0,-1,0)))
        angle=(-.18*max(0,1-u*5)+.24*max(0,(u-.78)/.22)) if support else .18*math.cos(math.pi*u)
        foot_orientation(j,angle)
        stance.append({"support":support,"target":vec(dest),"actual":vec(point(end)),"rootRelativeY":point(end).y,"rootTravelY":-stride*phase/.60})
    errors.extend([hand_target(0,(.20,-.12+.065*wave,-.46)),hand_target(1,(-.19,-.35-.035*wave,-.24))])
    hold_sword((.12,-.28,.95));lock_left()
    return errors,stance
strike=[
 (0,(.29,-.29,-.23),(-.19,-.44,-.14),(.35,-.50,.80),(0,0,-.055)),
 (.22,(.40,.02,.20),(-.20,-.43,-.13),(.56,.35,.75),(.05,.045,-.065)),
 (.36,(.39,-.12,.30),(-.20,-.48,-.08),(.38,-.25,.89),(.04,0,-.075)),
 (.50,(.18,-.52,.02),(-.25,-.34,-.13),(.36,-.91,-.14),(-.045,-.12,-.085)),
 (.66,(.17,-.34,-.24),(-.19,-.41,-.15),(.28,-.60,-.50),(-.025,-.075,-.065)),
 (1,(.29,-.29,-.23),(-.19,-.44,-.14),(.35,-.50,.80),(0,0,-.055))]
def attack(phase):
    rh,lh,d,delta=sample_keys(phase,strike);shift_hips((delta[0]*sign,delta[1],delta[2]));turn(hips,.20*math.sin(2*math.pi*phase));turn(torso,.34*math.sin(2*math.pi*phase))
    errors=[]
    for j,(upper,lower,end) in enumerate(feet):
        errors.append(limb(upper,lower,end,ankles0[j]+Vector((0,-.17 if j==0 else .16,0)),(0,-1,0)));foot_orientation(j,0)
    errors.extend([hand_target(0,rh),hand_target(1,lh)]);hold_sword(d);lock_left()
    return errors,[]
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
    return {"feet":result,"hipsZ":point(hips).z,"headZ":point(bone("Head")).z}
def render(name,view,target=None,scale=3.4):
    t=Vector(target if target is not None else (0,0,1.02))
    offset={"front":(0,-5,1.1),"side":(5,0,1.1),"game":(0,-5,5*math.sqrt(3)),"grip":(1,-1,.35),"back":(1,1,.3)}[view]
    cam.location=t+Vector(offset);look(cam,t);cam.data.ortho_scale=scale
    sc.render.filepath=str(folder/(name+".png"));bpy.ops.render.render(write_still=True)
samples={}
mocap=os.environ.get("BOW_WORKSHOP_MOCAP")
if mocap:
    exec(compile(Path(__file__).with_name("retarget-walk.py").read_text(),"retarget-walk.py","exec"))
    motions=("retarget-march",)
else:motions=("march","strike","fast","cautious","combat-walk")
for motion in motions:
    count=12 if motion in ("march","strike","retarget-march") else 8;samples[motion]=[];audit["samples"]=samples
    for i in range(count):
        reset_upright();phase=i/count;errors,stance=retarget_gait(phase) if motion=="retarget-march" else attack(phase) if motion=="strike" else gait(motion,phase)
        pts=mesh_points();sc.frame_set(1);bpy.context.view_layer.update();before=mesh_points()
        row={"phase":phase,"joints":snap(),"stance":stance,"maxIKResidual":max(errors),"footContact":feet_audit(),"meshAfterFrameSet":mesh_delta(pts,before),"contacts":inspect_contacts(),"bladeTip":vec(world_pos(R,tipLocal))}
        samples[motion].append(row);save()
        render(motion+"-%02d"%i,"side" if motion in ("march","retarget-march") else "game")
        row["meshAfterRender"]=mesh_delta(before,mesh_points());save()
        if i in (0,4) and motion in ("march","strike"):
            for view in ("front","side","game"):render(motion+"-%02d-"%i+view,view)
        if motion=="strike" and i==0:
            render("sword-grip","grip",world_pos(R,gripLocal),.38)
            render("shield-enarmes","back",world_pos(LF,handleLocal),.88)
        if row["meshAfterRender"]["max"]>.005 or row["meshAfterFrameSet"]["max"]>.005:raise ValueError("Pose lost")
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
if audit["unexpectedContacts"]:raise ValueError("Equipment intersections remain; see original frames and audit")
