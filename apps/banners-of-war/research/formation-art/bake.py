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
    return [q.x*256,(1-q.y)*256]
weapon=[o for o in sc.objects if o.type=="MESH" and o.name.startswith(("Ash spear","Forged spear"))]
body=[o for o in sc.objects if o.type=="MESH" and o not in weapon]
def bounds(objects):
    deps=bpy.context.evaluated_depsgraph_get()
    return [o.evaluated_get(deps).matrix_world@Vector(v) for o in objects for v in o.evaluated_get(deps).bound_box]
sc.frame_set(1);bpy.context.view_layer.update()
z0=min(v.z for v in bounds(body))
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
            sc.render.filepath=str(out/(name+".png"));bpy.ops.render.render(write_still=True)
            # Isolate the body, including shield but not spear, for actual visible body height.
            for o in weapon:o.hide_render=True
            sc.render.filepath=str(out/(name+"-body.png"));bpy.ops.render.render(write_still=True)
            for o in weapon:o.hide_render=False
            records[name]={"anchor":anchor,"pixelsPerMetre":256/cam.data.ortho_scale,"weaponBounds":tips}
(out/"frames.json").write_text(json.dumps({"frames":records,"groundZ":z0,"elevation":60,"orthoScale":cam.data.ortho_scale}))
