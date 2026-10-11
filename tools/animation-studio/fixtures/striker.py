"""Original two-bone mechanical striker, weighted meshes and authored action."""
import bpy
import json
import math
import os
from mathutils import Vector

outputs=json.loads(os.environ["ART_FORGE_OUTPUTS"])
bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=25
def mat(name,color,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get("Principled BSDF");p.inputs["Base Color"].default_value=(*color,1);p.inputs["Metallic"].default_value=metal;p.inputs["Roughness"].default_value=.38 if metal else .68
    return m
copper=mat("Copper casing",(.45,.15,.06),.65);steel=mat("Graphite steel",(.10,.13,.15),.7);ivory=mat("Porcelain socket",(.72,.66,.48));wood=mat("Oak base",(.20,.11,.06))
def box(name,location,scale,material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
    b=o.modifiers.new("Machined bevel","BEVEL");b.width=.045;b.segments=3
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
    o.modifiers.new("Surface normals","WEIGHTED_NORMAL");return o
box("Workshop oak plinth",(.8,0,.05),(3.8,1.8,.18),wood)
box("Socket pedestal",(0,0,.36),(.65,.72,.45),ivory)
box("Anvil foot",(1.9,0,.38),(.8,.85,.5),steel)
box("Anvil contact plate",(1.9,0,.68),(1.0,.95,.16),copper)
bpy.ops.object.armature_add(location=(0,0,0));rig=bpy.context.object;rig.name="StrikerRig"
bpy.ops.object.mode_set(mode="EDIT");upper=rig.data.edit_bones[0];upper.name="Shoulder";upper.head=(0,0,.6);upper.tail=(0,0,1.8)
lower=rig.data.edit_bones.new("Elbow");lower.head=upper.tail;lower.tail=(0,0,2.8);lower.parent=upper;lower.use_connect=True
bpy.ops.object.mode_set(mode="OBJECT")
def weighted(o,bone):
    group=o.vertex_groups.new(name=bone);group.add(list(range(len(o.data.vertices))),1,"REPLACE")
    modifier=o.modifiers.new("Weighted rig","ARMATURE");modifier.object=rig;o.parent=rig
weighted(box("Upper copper link",(0,0,1.2),(.24,.32,1.1),copper),"Shoulder")
weighted(box("Lower steel link",(0,0,2.3),(.18,.24,.9),steel),"Elbow")
weighted(box("Copper mallet head",(0,0,2.8),(.56,.48,.3),copper),"Elbow")
for z,bone in ((.62,"Shoulder"),(1.8,"Elbow")):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.19,location=(0,0,z));o=bpy.context.object;o.name="Porcelain joint";o.data.materials.append(ivory);weighted(o,bone)
for frame,a,b in ((1,-.25,.15),(6,-.40,.30),(13,1.0,1.0),(15,.91,.9),(20,-.10,.28),(25,-.25,.15)):
    for name,angle in (("Shoulder",a),("Elbow",b)):
        bone=rig.pose.bones[name];bone.rotation_mode="XYZ";bone.rotation_euler=(0,0,-angle);bone.keyframe_insert(data_path="rotation_euler",frame=frame)
rig.animation_data.action.name="Strike"
bpy.ops.object.camera_add(location=(5,-7,4.5));camera=bpy.context.object;camera.name="Bake camera";camera.rotation_euler=(Vector((.8,0,1.3))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type="ORTHO";camera.data.ortho_scale=5.2;scene.camera=camera
for location,power,size in (((1,-3,5),650,4),((-3,1,3),400,3)):
    bpy.ops.object.light_add(type="AREA",location=location);o=bpy.context.object;o.data.energy=power;o.data.shape="DISK";o.data.size=size;o.rotation_euler=(Vector((.8,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
scene.world.color=(.22,.22,.22);scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=outputs["editable"],compress=False)
bpy.ops.export_scene.gltf(filepath=outputs["model"],export_format="GLB",export_animations=True,export_frame_range=True,export_force_sampling=True,export_apply=False)
