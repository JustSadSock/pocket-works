"""Fit an articulated, skinned external hand to the existing sleeve.
No procedural phalanx mesh; evaluate source skin on its original bone rig."""
from mathutils import Quaternion
import os
hand_file=Path(os.environ.get("BOW_HAND_SOURCE","/tmp/bow-cc0-hand.glb"))
if not hand_file.is_file():raise ValueError("Verified articulated hand source required")
before=set(sc.objects);bpy.ops.import_scene.gltf(filepath=str(hand_file))
imported=[o for o in sc.objects if o not in before]
sourceRig=next((o for o in imported if o.type=="ARMATURE"),None)
sourceMeshes=[o for o in imported if o.type=="MESH" and any(m.type=="ARMATURE" for m in o.modifiers)]
if sourceRig is None or not sourceMeshes:raise ValueError("Hand source skin not imported")
sourceRig.animation_data_clear()
for o in imported:o.hide_render=True
for b in sourceRig.pose.bones:
    for c in b.constraints:c.mute=True
sourceBase={b.name:b.matrix_basis.copy() for b in sourceRig.pose.bones}
def sp(b):return sourceRig.matrix_world@b.head
def source_update():bpy.context.view_layer.update()
def source_reset():
    for b in sourceRig.pose.bones:b.matrix_basis=sourceBase[b.name].copy()
    source_update()
source_reset()
# Support common explicit digit names and MakeHuman finger1..5 names.
digits={}
for name,idx in (("thumb",1),("index",2),("middle",3),("ring",4),("pinky",5)):
    aliases=(name,"little") if name=="pinky" else (name,)
    bs=[b for b in sourceRig.pose.bones if any(a in norm(b.name) for a in aliases) or re.search(r"finger"+str(idx)+r"(?:[^0-9]|$)",b.name.lower())]
    bs.sort(key=lambda b:len(b.parent_recursive))
    if len(bs)==3 and all(b in bs[0].children_recursive for b in bs[1:]):digits[name]=bs
if len(digits)!=5:
    roots=[b for b in sourceRig.pose.bones if len(b.children)==5]
    if len(roots)!=1:raise ValueError("Unmapped anatomical finger hierarchy: "+str(list(sourceBase)))
    wristBone=roots[0];chains=[]
    for b in wristBone.children:
        chain=[b]
        while len(chain[-1].children)==1:chain.append(chain[-1].children[0])
        if len(chain)!=3:raise ValueError("Expected three articulated phalanges")
        chains.append(chain)
    thumb=min(chains,key=lambda c:(sp(c[-1])-sp(c[0])).length);chains.remove(thumb)
    # Anatomical lateral order from thumb-side root.
    chains.sort(key=lambda c:(sp(c[0])-sp(thumb[0])).length)
    digits=dict(zip(("index","middle","ring","pinky"),chains));digits["thumb"]=thumb
wristBone=digits["middle"][0].parent
if wristBone is None:raise ValueError("Missing hand root")
sourceWrist=sp(wristBone)
sourceAcross=(sp(digits["index"][0])-sp(digits["pinky"][0])).normalized()
sourceKnuckle=sum((sp(digits[k][0]) for k in ("index","middle","ring","pinky")),Vector((0,0,0)))/4
sourceForward=sourceKnuckle-sourceWrist
sourceForward=(sourceForward-sourceAcross*sourceForward.dot(sourceAcross)).normalized()
sourcePalm=sourceAcross.cross(sourceForward).normalized()
# In the softly curved bind pose, the direction of distal finger flexion
# identifies the palmar side; fallback to the thumb only if near planar.
curlSignal=sum((sp(digits[k][-1])-sp(digits[k][0]) for k in ("index","middle","ring","pinky")),Vector((0,0,0)))
if abs(curlSignal.dot(sourcePalm))<1e-4:curlSignal=sp(digits["thumb"][-1])-sourceWrist
if curlSignal.dot(sourcePalm)<0:sourcePalm=-sourcePalm
sourceWidth=(sp(digits["index"][0])-sp(digits["pinky"][0])).length
if not .035<sourceWidth<.16:raise ValueError("Unexpected source palm width "+str(sourceWidth))
srcBasis=Matrix((sourceAcross,sourceForward,sourcePalm)).transposed()
# Source skin coordinates in metres, independent of the target rig's scale.
srcLength=max((sourceRig.matrix_world@b.tail-sourceWrist).dot(sourceForward) for b in digits["middle"])
if not .08<srcLength<.30:raise ValueError("Unexpected source hand length")
audit["articulatedHandSource"]={"file":hand_file.name,"joints":{k:[b.name for b in v] for k,v in digits.items()},"wrist":wristBone.name,"width":sourceWidth,"length":srcLength,"skinMeshes":[o.name for o in sourceMeshes]}
# Match the source palm/knuckle line to the target sleeve frame rather
# than assuming its old procedural grip centre is anatomically meaningful.
for target in (R,L):
    if target.name not in posed_hands:continue
    q=posed_hands[target.name]
    sx=max(.65,min(1.45,q["width"]*.77/sourceWidth));sy=max(.65,min(1.45,q["length"]/srcLength));sz=(sx+sy)*.5
    a0,f0,n0=q["axes"];kn=srcBasis.inverted()@(sourceKnuckle-sourceWrist)
    q["center"]=q["wrist"]+a0*(kn.x*sx)+f0*(kn.y*sy)+n0*(kn.z*sz+.018)+f0*.008
save()
def source_rotate(b,axis,angle):
    # Rotate the original articulated joint in its current world frame.
    m=b.matrix.copy();p=m.translation.copy();v=sourceRig.matrix_world.inverted().to_3x3()@axis
    m=Matrix.Rotation(angle,4,v.normalized())@m;m.translation=p;b.matrix=m;source_update()
def flex_source(name,angles):
    chain=digits[name]
    for j,b in enumerate(chain):
        axis0=(sp(chain[j+1])-sp(b)).normalized() if j<2 else (sourceRig.matrix_world@b.tail-sp(b)).normalized()
        # Curl toward palmar side. The axis is kept transverse to phalanx.
        bend=sourcePalm if name!="thumb" else (sourcePalm-sourceAcross*.8).normalized()
        ax=axis0.cross(bend)
        if ax.length<.01:ax=sourceAcross
        source_rotate(b,ax,math.radians(angles[j]))
def make_posed_glove(hand,center,axis,rad):
    q=posed_hands[hand.name]
    for o in q["objects"]:bpy.data.objects.remove(o,do_unlink=True)
    q["objects"]=[];source_reset()
    c,across,forward,normal,w=hand_frame(hand)[0]
    wrist=world_pos(hand,q["wrist"])
    # Keep index/thumb at the upper end of the grip in both mirrored hands.
    axis=Vector(axis).normalized()
    if axis.dot(across)<0:axis=-axis
    f=(forward-axis*forward.dot(axis)).normalized()
    n=(normal-axis*normal.dot(axis)-f*normal.dot(f)).normalized()
    if n.length<.5:raise ValueError("Invalid target hand frame")
    targetBasis=Matrix((axis,f,n)).transposed()
    # Source palm width is knuckle-center distance; original weighted
    # hand width includes exterior surface. Fit length and knuckle width
    # independently with conservative scale, preserving finger ratios.
    sx=max(.65,min(1.45,w*.77/sourceWidth));sy=max(.65,min(1.45,q["length"]/srcLength))
    sz=(sx+sy)*.5
    transform=targetBasis@Matrix.Diagonal(Vector((sx,sy,sz)))@srcBasis.inverted()
    gripAxis=axis
    # Vary flexion for cylinder grip or three-finger string hook. No
    # mesh segments or finger translation; deformation comes from skin.
    if rad<.008:
        poses={"index":(34,55,24),"middle":(38,57,28),"ring":(42,58,30),"pinky":(52,58,32),"thumb":(18,20,15)}
    else:
        k=max(0,min(1,(.023-rad)/.014))
        poses={name:(49+12*k+i*3,55+12*k,23+10*k) for i,name in enumerate(("index","middle","ring","pinky"))}
        poses["thumb"]=(24,34,21)
    for name,angles in poses.items():flex_source(name,angles)
    # Use the source wrist and target sleeve junction; no translating the
    # entire hand to fake a contact. A narrow sleeve seam is preserved.
    for o in sourceMeshes:
        ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
        try:
            vs=[]
            for v in me.vertices:
                p=ev.matrix_world@v.co-sourceWrist;along=p.dot(sourceForward)
                # Bury only the proximal cap under the existing sleeve;
                # blend the adjustment away across the wrist, not fingers.
                seam=max(0,min(1,(.025-along)/.025))
                vs.append(tuple(wrist+transform@p-f*(.012*seam)))
            fs=[tuple(p.vertices) for p in me.polygons]
            if transform.determinant()<0:fs=[tuple(reversed(p)) for p in fs]
        finally:ev.to_mesh_clear()
        ob=mesh("Imported articulated glove "+hand.name,vs,fs,leather,None)
        for p in ob.data.polygons:p.use_smooth=True
        attach(ob,hand);q["objects"].append(ob)
    # True digit positions are available for archery hook and equipment fit.
    q["jointWorld"]={k:[wrist+transform@(sp(b)-sourceWrist) for b in chain] for k,chain in digits.items()}
    q["fit"]={"scale":[sx,sy,sz],"fingerAngles":poses,"wrist":vec(wrist),"gripCenter":vec(center)}
def imported_hook(hand,toward):
    q=posed_hands[hand.name]
    if not q.get("jointWorld"):return hand_frame(hand)[0][0]
    toward=Vector(toward).normalized();trees=[]
    for o in q["objects"]:
        ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
        try:
            me.calc_loop_triangles();vs=[ev.matrix_world@v.co for v in me.vertices];ts=[tuple(t.vertices) for t in me.loop_triangles]
            trees.append(BVHTree.FromPolygons(vs,ts,all_triangles=True))
        finally:ev.to_mesh_clear()
    contacts=[]
    for k in ("index","middle","ring"):
        p=q["jointWorld"][k][1].lerp(q["jointWorld"][k][2],.35);hits=[]
        for tree in trees:
            hit,n,index,dist=tree.ray_cast(p+toward*.05,-toward,.085)
            if hit is not None:hits.append((dist,hit))
        if not hits:raise ValueError("No evaluated hook surface on "+k)
        contacts.append(min(hits,key=lambda t:t[0])[1]+toward*.003)
    q["hookSurfaceContacts"]=[vec(v) for v in contacts]
    return contacts[1]
