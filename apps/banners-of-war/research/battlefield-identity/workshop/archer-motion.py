"""One independent bow cycle, never written to the atlas."""
import os,math,json
from pathlib import Path
os.environ["BOW_WORKSHOP_ROLE"]="archer"
source=Path(__file__).with_name("anatomical-motion.py")
exec(compile(source.read_text().split("# A single-handed sword",1)[0],str(source),"exec"))
folder=out/"archer-anatomy";folder.mkdir(exist_ok=True)
audit["samples"]={};audit["issues"]=[]
def save():(folder/"archer-audit.json").write_text(json.dumps(audit,indent=2))
reset()
# Source anatomy is retained. Left hand grips the riser across finger joints;
# right hand uses index/middle/ring to hook the actual moving string.
(lc,la,lf,ln,lw),_=hand_frame(L)
leftLocal=local(L,lc);leftAxis=world_of(L).inverted().to_3x3()@la
(rframe,rfingers)=hand_frame(R)
def right_hook():
    if R.name in posed_hands:return hand_frame(R)[0][0]
    f=finger_chains(R)
    return sum((point(f[k][1]) for k in ("index","middle","ring")),Vector((0,0,0)))/3
def wrist_to(b,axis,target):
    rotate_axis(b,(world_of(b).to_3x3()@axis).normalized(),target)
def make_bow(center,axis,forward,flex,nock,arrow,arrowTip):
    # English-style self bow: curved limbs, thick central grip, flexible tips.
    vs=[];fs=[];N=30;M=8
    a=axis.normalized();f=forward.normalized();side=a.cross(f).normalized()
    span=.79-.075*flex;back=.14+.24*flex
    for i in range(N+1):
        t=i/N*2-1;p=center+a*(t*span)-f*(back*abs(t)**1.8)
        r=.019*(1-.77*abs(t))
        for j in range(M):
            q=j/M*2*math.pi;vs.append(tuple(p+side*math.cos(q)*r+f*math.sin(q)*r*.78))
    for i in range(N):
        for j in range(M):fs.append((i*M+j,i*M+(j+1)%M,(i+1)*M+(j+1)%M,(i+1)*M+j))
    bow=mesh("Flexing yew bow",vs,fs,wood,None)
    top=center+a*span-f*back;bottom=center-a*span-f*back
    g=rod("Leather bow grip",center-a*.047,center+a*.047,.023,leather,None)
    string=[rod("Upper tensioned string",top,nock,.003,linen,None,8),rod("Lower tensioned string",nock,bottom,.003,linen,None,8)]
    gear=[bow,g]+string
    if arrow:
        shaft=rod("Nocked shaft",nock,arrowTip,.0045,wood,None,8);gear.append(shaft)
        d=(arrowTip-nock).normalized();head=rod("Arrow iron head",arrowTip-d*.035,arrowTip,.008,steel,None,8);gear.append(head)
    return gear,top,bottom
from mathutils.bvhtree import BVHTree
def geom(o):
    e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
    try:
        m.calc_loop_triangles();return [e.matrix_world@v.co for v in m.vertices],[tuple(t.vertices) for t in m.loop_triangles]
    finally:e.to_mesh_clear()
def collision(gear):
    bodies=[]
    for o in core:
        vs,ts=geom(o);groups={g.index:g.name for g in o.vertex_groups};labels=[]
        for tri in ts:
            w={}
            for i in tri:
                if i>=len(o.data.vertices):continue
                for v in o.data.vertices[i].groups:
                    n=groups.get(v.group,"");w[n]=w.get(n,0)+v.weight
            labels.append(max(w,key=w.get) if w else "")
        bodies.append((BVHTree.FromPolygons(vs,ts,all_triangles=True),labels))
    for name,q in posed_hands.items():
        for o in q["objects"]:
            vs,ts=geom(o);bodies.append((BVHTree.FromPolygons(vs,ts,all_triangles=True),[name]*len(ts)))
    result=[];left={b.name for b in desc(L)};right={b.name for b in desc(R)}
    for o in gear:
        vs,ts=geom(o);tree=BVHTree.FromPolygons(vs,ts,all_triangles=True)
        allowed=left if o.name.startswith("Leather bow grip") else right if ("string" in o.name or "shaft" in o.name) else set()
        for body,labels in bodies:
            hits=tree.overlap(body);bad=[labels[j] for _,j in hits if labels[j] not in allowed]
            if hits:result.append({"part":o.name,"triangles":len(hits),"unexpected":len(bad),"regions":sorted(set(bad))})
    return result
keys=[
 (0,(.18,-.22,-.35),(-.20,-.29,-.32),(0,-.10,1),(0,0,0)),
 (.20,(.04,-.40,-.10),(-.17,-.46,-.12),(0,-.10,1),(0,0,0)),
 (.42,(.23,-.05,.02),(-.12,-.61,.01),(0,-.02,1),(.01,0,-.01)),
 (.62,(.25,.04,.06),(-.12,-.61,.04),(0,0,1),(.01,0,-.01)),
 (.70,(.34,.15,.04),(-.12,-.61,.04),(0,0,1),(.01,0,-.01)),
 (1,(.18,-.22,-.35),(-.20,-.29,-.32),(0,-.10,1),(0,0,0))]
sc.render.resolution_x=sc.render.resolution_y=360;sc.cycles.samples=5
def render(name,target=(0,0,1.12),offset=(4,-5,1.8),scale=3.25):
    target=Vector(target);cam.location=target+Vector(offset);look(cam,target);cam.data.ortho_scale=scale
    sc.render.filepath=str(folder/(name+".png"));bpy.ops.render.render(write_still=True)
gear=[];rows=[];audit["samples"]["shot"]=rows
for i in range(16):
    for o in gear:bpy.data.objects.remove(o,do_unlink=True)
    reset();phase=i/16;rh,lh,axis,shift=sample_keys(phase,keys)
    shift_hips(shift);errors=[hand_target(0,rh),hand_target(1,lh)]
    a=Vector(axis).normalized();wrist_to(L,leftAxis,a);center=world_pos(L,leftLocal)
    curl_hand(L,center,a,.023)
    forward=Vector((0,-1,0));forward=(forward-a*forward.dot(a)).normalized()
    flex=max(0,min(1,(phase-.2)/.37)) if phase<.65 else max(0,1-(phase-.65)*12)
    hook=right_hook();nock=hook if .17<=phase<.65 else center-forward*(.14+.24*flex)
    # Flex is derived from measured draw distance, not independently keyed.
    if .17<=phase<.65:flex=max(0,min(1,((center-hook).dot(forward)-.14)/.42))
    if .17<=phase<.65:
        if R.name in posed_hands:curl_hand(R,nock,a,.004)
        else:
            for k in ("index","middle","ring"):
                bend_digit(finger_chains(R)[k],nock,a,.004,.7)
        hook=right_hook();nock=hook
    if R.name in posed_hands and not .17<=phase<.65:curl_hand(R,hook,a,.018)
    gear,top,bot=make_bow(center,a,forward,flex,nock,.13<=phase<.65,nock+forward*.72)
    bpy.context.view_layer.update();pts=mesh_points();sc.frame_set(1);bpy.context.view_layer.update()
    row={"phase":phase,"drawMetres":(center-nock).dot(forward),"flex":flex,"gripCenter":vec(center),"stringNock":vec(nock),"rightHook":vec(hook),"stringLength":(top-nock).length+(bot-nock).length,"maxIKResidual":max(errors),"meshAfterFrameSet":mesh_delta(pts,mesh_points()),"contacts":collision(gear)}
    rows.append(row);save();render("shot-%02d"%i)
    row["meshAfterRender"]=mesh_delta(pts,mesh_points());save()
    if i in (3,9,11):
        render("shot-%02d-front"%i,offset=(0,-5,1.2));render("shot-%02d-side"%i,offset=(5,0,1.2));render("shot-%02d-game"%i,offset=(0,-5,8.66));render("shot-%02d-grip"%i,center,(1,-1,.4),.45)
    if row["meshAfterRender"]["max"]>.005 or row["meshAfterFrameSet"]["max"]>.005:raise ValueError("Pose lost during evaluation")
audit["unexpectedContacts"]=sum(c["unexpected"] for r in rows for c in r["contacts"]);audit["artisticApproval"]=False;save()
if audit["unexpectedContacts"]:raise ValueError("Bow/body contact violations retained for review")
