"""Local armed-human study. Original human mesh, no production assets."""
import os,json,math,re,hashlib,urllib.request
from pathlib import Path
from mathutils.bvhtree import BVHTree
# Retain the proven action-detachment and actual child-axis solver.
src=Path(__file__).with_name("sword-motion.py")
exec(compile(src.read_text().split("# Distinct load, acceleration",1)[0],str(src),"exec"))
folder=out/"anatomy";folder.mkdir(exist_ok=True)
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
def hand_frame(hand):
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
if any(hand_frame(h)[0] is None for h in (R,L)):
    # Do not call a hand without anatomical finger joints a verified grip.
    # Retain source hand closeups for a separate posed-hand mesh if needed.
    audit["issues"].append("Finger chain incomplete; separate anatomically posed hand required")
    for label,h in (("right",R),("left",L)):
        target=point(h);cam.data.ortho_scale=.42;cam.location=target+Vector((.5,-.8,.35));look(cam,target)
        sc.render.filepath=str(folder/("unarticulated-"+label+".png"));bpy.ops.render.render(write_still=True)
    save()
    raise ValueError("Hand articulation unavailable; see audit")
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
def curl_hand(hand,center,axis,rad):
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
shieldParts.extend([strap,handle])
# Reproduce grip orientation relative to the forearm. Hand centre and
# longitudinal grip axis are calibrated from its actual digit roots.
leftRel=world_of(LF).inverted()@world_of(L);handleLocal=local(LF,handleCenter);handleAxis=world_of(LF).inverted().to_3x3()@la
def lock_left():
    m=rig.matrix_world.inverted()@world_of(LF)@leftRel;m.translation=L.matrix.translation;L.matrix=m;bpy.context.view_layer.update()
    c=world_pos(LF,handleLocal);a=(world_of(LF).to_3x3()@handleAxis).normalized();curl_hand(L,c,a,.014)
    return (world_pos(L,local(L,lc)) - lc).length if False else (point(L)-(world_of(LF)@leftRel).translation).length
def hold_sword(direction):
    a=(world_of(R).to_3x3()@axisLocal).normalized()
    rotate_axis(R,a,Vector((direction[0]*sign,direction[1],direction[2])))
    c=world_pos(R,gripLocal);a=(world_of(R).to_3x3()@axisLocal).normalized();curl_hand(R,c,a,radius)
# Evaluated triangle BVHs. Allow hand/grip and arm/strap contacts only,
# never blade/body, shield board/body, or weapon/shield intersections.
def geometry(o):
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
    try:
        me.calc_loop_triangles();return [ev.matrix_world@v.co for v in me.vertices],[tuple(t.vertices) for t in me.loop_triangles]
    finally:ev.to_mesh_clear()
def bvh(o):
    v,t=geometry(o);return BVHTree.FromPolygons(v,t,all_triangles=True),v,t
def inspect_contacts():
    bodies=[]
    for o in core:
        tree,vs,ts=bvh(o);names={g.index:g.name for g in o.vertex_groups}
        groups=[]
        for tri in ts:
            weights={}
            for i in tri:
                if i>=len(o.data.vertices):continue
                for g in o.data.vertices[i].groups:
                    n=names.get(g.group,"");weights[n]=weights.get(n,0)+g.weight
            groups.append(max(weights,key=weights.get) if weights else "")
        bodies.append((tree,groups))
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
def render(name,view,target=None,scale=3.4):
    t=Vector(target if target is not None else (0,0,1.02))
    offset={"front":(0,-5,1.1),"side":(5,0,1.1),"game":(0,-5,5*math.sqrt(3)),"grip":(1,-1,.35),"back":(1,1,.3)}[view]
    cam.location=t+Vector(offset);look(cam,t);cam.data.ortho_scale=scale
    sc.render.filepath=str(folder/(name+".png"));bpy.ops.render.render(write_still=True)
samples={}
for motion in ("march","strike","fast","cautious","combat-walk"):
    count=12 if motion in ("march","strike") else 8;samples[motion]=[];audit["samples"]=samples
    for i in range(count):
        reset_upright();phase=i/count;errors,stance=attack(phase) if motion=="strike" else gait(motion,phase)
        pts=mesh_points();sc.frame_set(1);bpy.context.view_layer.update();before=mesh_points()
        row={"phase":phase,"joints":snap(),"stance":stance,"maxIKResidual":max(errors),"meshAfterFrameSet":mesh_delta(pts,before),"contacts":inspect_contacts(),"bladeTip":vec(world_pos(R,tipLocal))}
        samples[motion].append(row);save()
        render(motion+"-%02d"%i,"side" if motion=="march" else "game")
        row["meshAfterRender"]=mesh_delta(before,mesh_points());save()
        if i in (0,4) and motion in ("march","strike"):
            for view in ("front","side","game"):render(motion+"-%02d-"%i+view,view)
        if motion=="strike" and i==0:
            render("sword-grip","grip",world_pos(R,gripLocal),.38)
            render("shield-enarmes","back",world_pos(LF,handleLocal),.88)
        if row["meshAfterRender"]["max"]>.005 or row["meshAfterFrameSet"]["max"]>.005:raise ValueError("Pose lost")
audit["unexpectedContacts"]=sum(c.get("unexpected",0) for rs in samples.values() for r in rs for c in r["contacts"])
audit["artisticApproval"]=False;save()
if audit["unexpectedContacts"]:raise ValueError("Equipment intersections remain; see original frames and audit")
