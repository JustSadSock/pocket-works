import bpy,os,math,json
from mathutils import Vector
from pathlib import Path
from bpy_extras.object_utils import world_to_camera_view
kind=os.environ["BOW_TREE_KIND"]
s=bpy.context.scene;out=Path(os.environ["BOW_ART_OUTPUT"])
objects=[o for o in s.objects if o.type=="MESH"]
if not objects:raise ValueError("No tree mesh")
pts=[o.matrix_world@Vector(p) for o in objects for p in o.bound_box]
lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)));hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)));center=(lo+hi)/2
s.render.engine="CYCLES";s.cycles.samples=12;s.cycles.use_denoising=True;s.render.film_transparent=True;s.render.image_settings.color_mode="RGBA";s.render.image_settings.file_format="PNG"
s.render.resolution_x=s.render.resolution_y=384;s.render.resolution_percentage=100
s.world=bpy.data.worlds.new("Sky");s.world.use_nodes=True;s.world.node_tree.nodes["Background"].inputs[0].default_value=(.42,.48,.54,1);s.world.node_tree.nodes["Background"].inputs[1].default_value=.85
# The previous baked tree had 52–73% near-black opaque pixels. Keep genuine leaf
# texture, remove black atlas padding and restore diffuse foliage lighting.
diagnostics=[]
for m in bpy.data.materials:
    if not m.use_nodes:continue
    nodes=m.node_tree.nodes;links=m.node_tree.links
    p=next((n for n in nodes if n.type=="BSDF_PRINCIPLED"),None)
    if not p:continue
    color=p.inputs["Base Color"]
    diagnostics.append({"material":m.name,"colorLinked":bool(color.links),"alphaLinked":bool(p.inputs["Alpha"].links),"metallic":p.inputs["Metallic"].default_value})
    for name,value in [("Metallic",0),("Roughness",.83),("Specular IOR Level",.25)]:
        if name in p.inputs:
            socket=p.inputs[name]
            for link in list(socket.links):links.remove(link)
            socket.default_value=value
    if color.links:
        src=color.links[0].from_socket
        # Near-black texture padding, not shadows produced by lighting, becomes transparent.
        bw=nodes.new("ShaderNodeRGBToBW");links.new(src,bw.inputs[0])
        valid=nodes.new("ShaderNodeMath");valid.operation="GREATER_THAN";valid.inputs[1].default_value=.008;links.new(bw.outputs[0],valid.inputs[0])
        alpha=p.inputs["Alpha"]
        if alpha.links:
            previous=alpha.links[0].from_socket
            mul=nodes.new("ShaderNodeMath");mul.operation="MULTIPLY";links.new(previous,mul.inputs[0]);links.new(valid.outputs[0],mul.inputs[1]);links.new(mul.outputs[0],alpha)
        else:links.new(valid.outputs[0],alpha)
        if "Emission Color" in p.inputs:
            links.new(src,p.inputs["Emission Color"]);p.inputs["Emission Strength"].default_value=.12
(out/(kind+"-materials.json")).write_text(json.dumps(diagnostics,indent=2))

def look(o,p):o.rotation_euler=(p-o.location).to_track_quat("-Z","Y").to_euler()
d=bpy.data.lights.new("Sun","SUN");d.energy=2.0;o=bpy.data.objects.new("Sun",d);s.collection.objects.link(o);o.location=center+Vector((-4,-5,7));look(o,center)
cam=bpy.data.objects.new("C",bpy.data.cameras.new("C"));s.collection.objects.link(cam);s.camera=cam;cam.data.type="ORTHO";cam.data.ortho_scale=max(hi-lo)*1.65;cam.location=center+Vector((0,-8,8*math.tan(math.pi/3)));look(cam,center);bpy.context.view_layer.update()
p=world_to_camera_view(s,cam,Vector((center.x,center.y,lo.z)))
s.render.filepath=str(out/(kind+".png"));bpy.ops.render.render(write_still=True)
(out/(kind+".json")).write_text(json.dumps({"anchor":[p.x*384,(1-p.y)*384],"ppm":384/cam.data.ortho_scale,"height":hi.z-lo.z}))
