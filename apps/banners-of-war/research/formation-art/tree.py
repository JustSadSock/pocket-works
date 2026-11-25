import bpy,os,math,json
from mathutils import Vector
from pathlib import Path
from bpy_extras.object_utils import world_to_camera_view
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.environ["BOW_TREE_SOURCE"])
s=bpy.context.scene;out=Path(os.environ["BOW_ART_OUTPUT"])
objects=[o for o in s.objects if o.type=="MESH"]
if not objects:raise ValueError("No tree mesh")
pts=[o.matrix_world@Vector(p) for o in objects for p in o.bound_box]
lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)));hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)));center=(lo+hi)/2
s.render.engine="CYCLES";s.cycles.samples=12;s.cycles.use_denoising=True;s.render.film_transparent=True;s.render.image_settings.color_mode="RGBA";s.render.image_settings.file_format="PNG"
s.render.resolution_x=s.render.resolution_y=384;s.render.resolution_percentage=100
s.world=bpy.data.worlds.new("Sky");s.world.use_nodes=True;s.world.node_tree.nodes["Background"].inputs[0].default_value=(.42,.48,.54,1);s.world.node_tree.nodes["Background"].inputs[1].default_value=.42
def look(o,p):o.rotation_euler=(p-o.location).to_track_quat("-Z","Y").to_euler()
d=bpy.data.lights.new("Sun","SUN");d.energy=2.3;o=bpy.data.objects.new("Sun",d);s.collection.objects.link(o);o.location=center+Vector((-4,-5,7));look(o,center)
cam=bpy.data.objects.new("C",bpy.data.cameras.new("C"));s.collection.objects.link(cam);s.camera=cam;cam.data.type="ORTHO";cam.data.ortho_scale=max(hi-lo)*1.65;cam.location=center+Vector((0,-8,8*math.tan(math.pi/3)));look(cam,center);bpy.context.view_layer.update()
p=world_to_camera_view(s,cam,Vector((center.x,center.y,lo.z)))
s.render.filepath=str(out/"tree.png");bpy.ops.render.render(write_still=True)
(out/"tree.json").write_text(json.dumps({"anchor":[p.x*384,(1-p.y)*384],"ppm":384/cam.data.ortho_scale,"height":hi.z-lo.z}))
