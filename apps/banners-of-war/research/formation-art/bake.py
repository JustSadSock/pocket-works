import bpy, math, os, json
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
sc=bpy.context.scene
sc.render.engine="CYCLES";sc.cycles.device="CPU";sc.cycles.samples=10;sc.cycles.use_denoising=True
sc.render.film_transparent=True;sc.render.image_settings.file_format="PNG";sc.render.image_settings.color_mode="RGBA"
sc.view_settings.view_transform="AgX"
world=bpy.data.worlds.new("Outdoor fill");sc.world=world;world.use_nodes=True;world.node_tree.nodes["Background"].inputs[0].default_value=(.42,.48,.54,1);world.node_tree.nodes["Background"].inputs[1].default_value=.42
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat("-Z","Y").to_euler()
def light(name,pos,energy,size,color):
    d=bpy.data.lights.new(name,"AREA");d.energy=energy;d.shape="DISK";d.size=size;d.color=color;o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=pos;look(o,(0,0,.9));return o
key=light("Warm sky",(-4,-5,7),650,4,(1,.90,.74))
fill=light("Cool bounce",(4,2,5),180,5,(.70,.82,1))
cam=bpy.data.objects.new("60 degree orthographic",bpy.data.cameras.new("Orthographic"));sc.collection.objects.link(cam);sc.camera=cam;cam.data.type="ORTHO";cam.data.ortho_scale=3.5
rig=next(o for o in sc.objects if o.type=="ARMATURE")
# Rotate the entire asset about its ground origin, keep camera and lighting fixed.
pivot=bpy.data.objects.new("Ground yaw",None);sc.collection.objects.link(pivot)
for o in list(sc.objects):
    if o not in [pivot,cam,key,fill] and o.parent is None:
        m=o.matrix_world.copy();o.parent=pivot;o.matrix_world=m
target=Vector((0,0,.65));cam.location=target+Vector((0,-5,5*math.tan(pi/3)));look(cam,target)
shield=next(o for o in sc.objects if o.name.startswith("Curved shield"))
paint=shield.data.materials[0];ramp=next(n for n in paint.node_tree.nodes if n.type=="VALTORGB")
def team(side):
    color=(.14,.26,.39) if side==0 else (.42,.13,.075)
    for i,f in [(0,.6),(1,1.3)]:ramp.color_ramp.elements[i].color=(*(x*f for x in color),1)
# A = restrained material rendering. B = actual silhouette changes to gear, not whole anatomy.
# C = subsequent artistic raster processing of A, kept on same anchor.

from bpy_extras.object_utils import world_to_camera_view
sc.render.resolution_x=sc.render.resolution_y=256
sc.render.resolution_percentage=100
sc.cycles.samples=12
# +X world forward projects down in tactical camera C; source forward is Blender -Y.
# Camera sees the front at heading zero. The source's baked rig and materials are retained.
def pixel(p):
    q=world_to_camera_view(sc,cam,Vector(p))
    return [q.x*sc.render.resolution_x,(1-q.y)*sc.render.resolution_y]
weapon=[o for o in sc.objects if o.type=="MESH" and o.name.startswith(("Ash spear","Forged spear"))]
body=[o for o in sc.objects if o.type=="MESH" and o not in weapon]
def vertices(objects):
    deps=bpy.context.evaluated_depsgraph_get();result=[]
    for o in objects:
        ev=o.evaluated_get(deps);mesh=ev.to_mesh()
        if mesh is None:continue
        try:result.extend(ev.matrix_world@v.co for v in mesh.vertices)
        finally:ev.to_mesh_clear()
    if not result:raise ValueError("Empty evaluated mesh")
    return result
def bounds(objects):
    p=vertices(objects);lo=[min(v[i] for v in p) for i in range(3)];hi=[max(v[i] for v in p) for i in range(3)]
    return [Vector((x,y,z)) for x in [lo[0],hi[0]] for y in [lo[1],hi[1]] for z in [lo[2],hi[2]]]
core=[o for o in body if any(m.type=="ARMATURE" for m in o.modifiers)]
if not core:core=[o for o in body if o.name.startswith("char1")]
if not core:raise ValueError("Missing skinned human body for physical calibration")
sc.frame_set(1);bpy.context.view_layer.update()
core_points=vertices(core);z0=min(v.z for v in core_points);human_height=max(v.z for v in core_points)-z0
if not 1.4<human_height<2.3:raise ValueError(f"Invalid physical body height {human_height}; origin {z0}")
# A single physical anchor for the model, with the actual planted-foot plane.
print("Ground calibration",z0,human_height,flush=True)
# Common camera frustum preflight: include all evaluated body and weapon bounds.
# Increasing the frustum does not change metres per source pixel.
max_extent=0
for heading in range(8):
    pivot.rotation_euler.z=-heading*pi/4
    for frame in [1,5,9,13,17,21,25,29,33,37]:
        sc.frame_set(frame);bpy.context.view_layer.update()
        for v in bounds(body+weapon):
            p=world_to_camera_view(sc,cam,v)
            max_extent=max(max_extent,abs(p.x-.5),abs(p.y-.5))
factor=max(1.0,2.24*max_extent)
cam.data.ortho_scale*=factor
resolution=math.ceil(256*factor/32)*32
sc.render.resolution_x=sc.render.resolution_y=resolution
bpy.context.view_layer.update()
records={}
cloth=[m for m in bpy.data.materials if m.use_nodes and any(x in m.name.lower() for x in ("cloth","gambeson","tunic","fabric"))]
base_cloth={m.name:m.diffuse_color[:] for m in cloth}
for side in [0,1]:
    team(side)
    for heading in range(8):
        pivot.rotation_euler.z=-heading*pi/4
        for frame in [1,5,9,13,17,21,25,29,33,37]:
            sc.frame_set(frame);bpy.context.view_layer.update()
            name=f"{side}-{heading}-{frame}"
            anchor=pixel((0,0,z0))
            points=bounds(weapon);body_pts=bounds(body)
            tips=[pixel(v) for v in points]
            direction=Vector((sin(-heading*pi/4),-cos(-heading*pi/4),0))
            verts=vertices(weapon)
            reach=max((v.dot(direction) for v in verts),default=0)
            sc.render.filepath=str(out/(name+".png"));bpy.ops.render.render(write_still=True)
            # Isolate the body, including shield but not spear, for actual visible body height.
            mask=f"0-{heading}-{frame}-body.png"
            if side==0:
                for o in weapon:o.hide_render=True
                sc.render.filepath=str(out/mask);bpy.ops.render.render(write_still=True)
                for o in weapon:o.hide_render=False
            records[name]={"anchor":anchor,"pixelsPerMetre":resolution/cam.data.ortho_scale,"weaponBounds":tips,"weaponForwardMetres":reach,"bodyWorldHeight":max(v.z for v in vertices(core))-min(v.z for v in vertices(core)),"bodyMask":mask,"renderSize":resolution}
            if frame in [1,21]:
                # Restricted veteran shield finish; shared mesh, no new troop type.
                color=(.20,.29,.34) if side==0 else (.37,.23,.10)
                for i,f in [(0,.6),(1,1.3)]:ramp.color_ramp.elements[i].color=(*(x*f for x in color),1)
                sc.render.filepath=str(out/(name+"-v.png"));bpy.ops.render.render(write_still=True)
                records[name+"-v"]={**records[name]}
                team(side)
(out/"frames.json").write_text(json.dumps({"frames":records,"groundZ":z0,"humanHeightMetres":human_height,"elevation":60,"orthoScale":cam.data.ortho_scale,"renderSize":resolution,"framingFactor":factor}))
