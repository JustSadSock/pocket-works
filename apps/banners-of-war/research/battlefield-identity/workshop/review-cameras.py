"""Native 1080p review camera contract shared by all isolated human probes."""
REVIEW_VIEWS=("front","back","side","top","angle45","game")
REVIEW_OFFSETS={"front":(0,-6,0),"back":(0,6,0),"side":(6,0,0),"top":(0,0,6),"angle45":(4,-4,1.8),"game":(0,-4,4*math.sqrt(3))}
# Source tactical camera is orthographic, 60 degrees above the ground.
# The camera remains fixed over the cycle; close-ups alone target equipment.
(folder/"camera-spec.json").write_text(json.dumps({"views":REVIEW_OFFSETS,"size":[1920,1080],"previewSize":[480,270],"scaleMetres":3.85,"target":[0,0,1.02],"gameElevation":60,"projection":"orthographic","nativeRender":True},indent=2))
def review_render(name,view,target=None,scale=3.85,preview=False):
    t=Vector((0,0,1.02) if target is None else target)
    sc.render.resolution_x=480 if preview else 1920
    sc.render.resolution_y=270 if preview else 1080
    sc.render.resolution_percentage=100;sc.cycles.samples=3 if preview else 8
    # Fixed closer framing. Project evaluated visible bounds and expand
    # only when needed so the entire research object remains in the image.
    cam.data.ortho_scale=scale;cam.location=t+Vector(REVIEW_OFFSETS[view])
    if view=="top":cam.rotation_euler=(0,0,0)
    else:look(cam,t)
    # Record the target and chosen scale per frame; close-ups are explicit.
    (folder/"camera-frames.jsonl").open("a").write(json.dumps({"name":name,"view":view,"scale":scale,"target":vec(t),"preview":preview})+"\n")
    sc.render.filepath=str(folder/(("preview-" if preview else "")+name+"-"+view+".png"))
    bpy.ops.render.render(write_still=True)
