"""Native 1080p review camera contract: same pose, fitted fixed six-view framing."""
REVIEW_VIEWS=("front","back","side","top","angle45","game")
REVIEW_OFFSETS={"front":(0,-6,0),"back":(0,6,0),"side":(6,0,0),"top":(0,0,6),"angle45":(4,-4,1.8),"game":(0,-4,4*math.sqrt(3))}
reviewPlan={}
def review_points():
    # Whole visible character including its real equipment, excluding floor,
    # hidden source imports and unrelated scene geometry. Use evaluated
    # vertex bounds rather than object origin or static rest bound_box.
    objects=list(core)
    for q in posed_hands.values():objects.extend(q["objects"])
    objects.extend(globals().get("swordParts",[]));objects.extend(globals().get("shieldParts",[]));objects.extend(globals().get("gear",[]))
    objects.extend(o for o in sc.objects if o.type=="MESH" and not o.hide_render and o.name.startswith(("Curved forged breastplate","Kettle hat","Rolled rim")))
    pts=[]
    for o in set(objects):
        if o.hide_render:continue
        ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
        try:
            if not me or not me.vertices:continue
            vs=[ev.matrix_world@v.co for v in me.vertices]
            lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
            pts.extend((x,y,z) for x in (lo[0],hi[0]) for y in (lo[1],hi[1]) for z in (lo[2],hi[2]))
        finally:ev.to_mesh_clear()
    if not pts:raise ValueError("No visible review subjects")
    return pts
def plan_review_frames(samples):
    points=[Vector(p) for s in samples for p in s];plan={}
    for view,offset in REVIEW_OFFSETS.items():
        if view=="top":q=Matrix.Identity(3).to_quaternion()
        else:q=(-Vector(offset)).to_track_quat("-Z","Y")
        right=q@Vector((1,0,0));up=q@Vector((0,1,0));depth=q@Vector((0,0,1))
        xx=[v.dot(right) for v in points];yy=[v.dot(up) for v in points];zz=[v.dot(depth) for v in points]
        t=right*((min(xx)+max(xx))*.5)+up*((min(yy)+max(yy))*.5)+depth*((min(zz)+max(zz))*.5)
        scale=max(max(xx)-min(xx),(max(yy)-min(yy))*1920/1080)*1.12
        plan[view]={"target":vec(t),"scale":scale,"widthOccupancy":(max(xx)-min(xx))/scale,"heightOccupancy":(max(yy)-min(yy))*1920/(1080*scale)}
    reviewPlan.clear();reviewPlan.update(plan)
    (folder/"camera-fit.json").write_text(json.dumps(plan,indent=2))
(folder/"camera-spec.json").write_text(json.dumps({"views":REVIEW_OFFSETS,"size":[1920,1080],"previewSize":[480,270],"gameElevation":60,"projection":"orthographic","nativeRender":True,"frameFit":"union of evaluated subject bounds across all phases, 12% margin; fixed per view"},indent=2))
def review_render(name,view,target=None,scale=None,preview=False):
    if target is None:
        p=reviewPlan.get(view)
        t=Vector(p["target"] if p else (0,0,1.02))
        scale=p["scale"] if scale is None and p else (3.85 if scale is None else scale)
    else:t=Vector(target);scale=scale or 1
    sc.render.resolution_x=480 if preview else 1920;sc.render.resolution_y=270 if preview else 1080
    sc.render.resolution_percentage=100;sc.cycles.samples=3 if preview else 8
    cam.data.ortho_scale=scale;cam.location=t+Vector(REVIEW_OFFSETS[view])
    if view=="top":cam.rotation_euler=(0,0,0)
    else:look(cam,t)
    with (folder/"camera-frames.jsonl").open("a") as f:f.write(json.dumps({"name":name,"view":view,"scale":scale,"target":vec(t),"preview":preview})+"\n")
    sc.render.filepath=str(folder/(("preview-" if preview else "")+name+"-"+view+".png"))
    bpy.ops.render.render(write_still=True)
