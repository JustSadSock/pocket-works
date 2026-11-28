"""Ray trace actual visible evaluated mesh surfaces near the face; compare cutaways."""
head=bone("Head");at=point(head);objs=[o for o in sc.objects if o.type=="MESH" and not o.hide_render]
trees=[]
for o in objs:
    try:
        vs,ts,labels=geometry(o,True)
        trees.append((o,BVHTree.FromPolygons(vs,ts,all_triangles=True)))
    except (ValueError,RuntimeError):
        continue
hits=[]
for dx in (-.045,0,.045):
    for dz in (-.045,0,.045,.09):
        origin=at+Vector((dx,-1,dz));choices=[]
        for o,tree in trees:
            loc,n,i,dist=tree.ray_cast(origin,Vector((0,1,0)),2)
            if loc is not None:choices.append((dist,o,loc))
        if choices:
            dist,o,loc=min(choices,key=lambda x:x[0])
            hits.append({"object":o.name,"position":vec(loc),"materialSlots":[m.name for m in o.data.materials if m],"originalCore":o in core,"parent":o.parent.name if o.parent else None,"bone":o.parent_bone})
audit["faceRayHits"]=hits;save()
review_render("face-original","front",at,.46)
for name in sorted({r["object"] for r in hits if not r["originalCore"]}):
    o=bpy.data.objects.get(name)
    if not o:continue
    o.hide_render=True
    try:review_render("face-without-"+re.sub("[^a-zA-Z0-9]+","-",name),"front",at,.46)
    finally:o.hide_render=False
