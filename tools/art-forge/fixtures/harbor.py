"""Authored workshop-scale lighthouse. Editable Blender scene + embedded GLB."""
import json
import math
import os
import random
import bpy
from mathutils import Vector

outputs = json.loads(os.environ["ART_FORGE_OUTPUTS"])
params = json.loads(os.environ["ART_FORGE_PARAMETERS"])
random.seed(int(os.environ["ART_FORGE_SEED"]))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness, metallic=0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return result

stone = material("Warm limestone", (.57, .48, .34), .82)
brick = material("Oxide roof", tuple(params.get("roofColor", [.34, .12, .08])), .68)
brass = material("Weathered brass", (.34, .29, .12), .32, .7)
dark = material("Recessed timber", (.07, .11, .12), .72)
sea = material("Glazed sea ceramic", (.055, .25, .27), .23)

def cylinder(name, radius, depth, z, mat, vertices=32, taper=None):
    if taper:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=taper, depth=depth, location=(0, 0, z))
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0, 0, z))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Cut stone edge", "BEVEL")
    bevel.width = .025
    bevel.segments = 2
    obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    return obj

cylinder("Oval glazed tidal plinth", 2.1, .20, -.08, sea, 64).scale.y = .72
cylinder("Rock shelf", 1.5, .18, .08, stone, 7).scale.y = .7
cylinder("Tower footing", .65, .23, .28, stone)
cylinder("Tapered lighthouse wall", .52, 2.1, 1.40, stone, taper=.38)
for z in (.48, 1.05, 1.66, 2.38):
    cylinder("Masonry string course", .55 - z * .06, .07, z, brass)
cylinder("Lantern walkway", .64, .12, 2.52, stone)
cylinder("Lantern sill", .38, .08, 2.64, brass)
cylinder("Lantern dark interior", .28, .48, 2.92, dark)
for i in range(8):
    angle = i * math.tau / 8
    obj = cylinder("Lantern mullion", .025, .50, 2.92, brass, 8)
    obj.location.x, obj.location.y = .36 * math.cos(angle), .36 * math.sin(angle)
cylinder("Copper conical cap", .56, .43, 3.34, brick, taper=.025)
cylinder("Roof finial", .025, .27, 3.63, brass, 8)
for z in (1.0, 1.7):
    # Individual deeply set openings with stone lintels, not painted dots.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -.47 + z * .035, z))
    obj = bpy.context.object
    obj.name = "Recessed seaward window"
    obj.scale = (.15, .04, .28)
    obj.data.materials.append(dark)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -.49 + z * .035, z + .16))
    obj = bpy.context.object
    obj.name = "Window lintel"
    obj.scale = (.23, .1, .06)
    obj.data.materials.append(stone)
for i in range(5):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(.92, -.85 + i * .12, .15 + i * .045))
    obj = bpy.context.object
    obj.name = "Quayside stair"
    obj.scale = (.58, .25, .09)
    obj.data.materials.append(stone)
    bevel = obj.modifiers.new("Worn stair edge", "BEVEL")
    bevel.width, bevel.segments = .025, 2
for i in range(4):
    obj = cylinder("Mooring bollard", .055, .2, .25, brass, 12)
    obj.location.x, obj.location.y = -.9 + i * .6, -1.02
    cylinder("Bollard head", .08, .05, .37, brass, 12).location = (obj.location.x, obj.location.y, .37)

scene = bpy.context.scene
scene.world.color = (.22, .22, .22)
for name, position, energy, size in [("North window key", (2, -4, 7), 550, 4), ("Sky fill", (-4, 1, 4), 180, 5)]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size = energy, "DISK", size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector((0, 0, 1.4)) - obj.location).to_track_quat("-Z", "Y").to_euler()
camera = bpy.data.cameras.new("Orthographic asset camera")
obj = bpy.data.objects.new("Orthographic asset camera", camera)
scene.collection.objects.link(obj)
obj.location = (5, -8, 5)
obj.rotation_euler = (Vector((0, 0, 1.5)) - obj.location).to_track_quat("-Z", "Y").to_euler()
camera.type, camera.ortho_scale = "ORTHO", 5.0
scene.camera = obj
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = True
bpy.ops.wm.save_as_mainfile(filepath=outputs["editable"], compress=False)
bpy.ops.export_scene.gltf(filepath=outputs["model"], export_format="GLB", export_cameras=False, export_lights=False, export_apply=True)
