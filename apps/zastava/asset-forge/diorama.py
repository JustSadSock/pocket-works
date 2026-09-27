import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--output", default=os.environ.get("ASSET_FORGE_OUTPUT", "zastava_core.glb"))
args = parser.parse_args(argv)
output = os.path.abspath(args.output)
os.makedirs(os.path.dirname(output), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, roughness=0.82, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


STONE = material("Limestone", (0.56, 0.53, 0.45), 0.94)
STONE_DARK = material("Old Mortar", (0.33, 0.34, 0.31), 0.98)
WOOD = material("Oak", (0.31, 0.20, 0.13), 0.88)
WOOD_LIGHT = material("Weathered Oak", (0.49, 0.35, 0.22), 0.90)
ROOF = material("Roof Clay", (0.35, 0.19, 0.16), 0.92)
IRON = material("Iron", (0.18, 0.20, 0.19), 0.55, 0.35)
CLOTH = material("Banner", (0.37, 0.25, 0.22), 0.95)


def cube(name, loc, scale, mat, bevel=0.06):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    return obj


def prism_roof(name, loc, width, depth, height, mat):
    verts = [
        (-width/2, -depth/2, 0), (width/2, -depth/2, 0),
        (-width/2, depth/2, 0), (width/2, depth/2, 0),
        (0, -depth/2, height), (0, depth/2, height),
    ]
    faces = [
        (0, 1, 4), (2, 5, 3), (0, 4, 5, 2),
        (1, 3, 5, 4), (0, 2, 3, 1)
    ]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Roof edges", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return obj


root = bpy.data.objects.new("ZastavaCore", None)
bpy.context.collection.objects.link(root)

# Two asymmetrical gate towers: deliberately handmade rather than mirrored-perfect.
for idx, x in enumerate((-1.65, 1.65)):
    tower = cube(f"GateTower_{idx+1}", (x, -1.95, 1.55), (1.70, 1.48, 3.10), STONE, 0.09)
    tower.parent = root
    roof = prism_roof(f"TowerRoof_{idx+1}", (x, -1.95, 3.12), 2.04, 1.78, 0.68, ROOF)
    roof.rotation_euler[2] = math.radians(90)
    roof.parent = root
    for row, z in enumerate((1.20, 2.08)):
        slit = cube(f"ArrowSlit_{idx}_{row}", (x, -1.205, z), (0.12, 0.055, 0.42), STONE_DARK, 0.01)
        slit.parent = root
    cap = cube(f"StoneCap_{idx}", (x, -1.95, 2.97), (1.82, 1.60, 0.16), STONE_DARK, 0.04)
    cap.parent = root

for x in (-3.48, 3.48):
    wall = cube("CurtainWall", (x, -2.0, 1.03), (2.08, 0.86, 2.06), STONE, 0.08)
    wall.parent = root
    for tooth in range(4):
        merlon = cube("Merlon", (x - 0.72 + tooth * 0.48, -2.0, 2.22), (0.28, 0.90, 0.34), STONE, 0.03)
        merlon.parent = root

arch_left = cube("ArchLeft", (-0.93, -1.94, 2.42), (0.32, 0.90, 1.22), STONE, 0.05)
arch_right = cube("ArchRight", (0.93, -1.94, 2.42), (0.32, 0.90, 1.22), STONE, 0.05)
arch_top = cube("ArchTop", (0, -1.94, 2.87), (1.86, 0.90, 0.32), STONE, 0.05)
for obj in (arch_left, arch_right, arch_top):
    obj.parent = root

# Static winch housing and chain drums; the actual moving deck/portcullis stays runtime-driven.
winch = cube("WinchHousing", (-1.05, -1.33, 0.80), (0.82, 0.56, 0.72), WOOD, 0.05)
winch.parent = root
for x in (-1.23, -0.87):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.22, depth=0.62, location=(x, -1.02, 1.00), rotation=(math.pi/2, 0, 0))
    drum = bpy.context.object
    drum.name = "ChainDrum"
    drum.data.materials.append(IRON)
    drum.parent = root

# Small toll booth gives the foreground a recognisable silhouette.
booth = cube("TollBooth", (2.72, -2.82, 0.67), (1.28, 1.12, 1.34), WOOD_LIGHT, 0.07)
booth.parent = root
booth_roof = prism_roof("TollBoothRoof", (2.72, -2.82, 1.38), 1.52, 1.38, 0.42, ROOF)
booth_roof.rotation_euler[2] = math.radians(90)
booth_roof.parent = root
window = cube("TollWindow", (2.72, -2.245, 0.86), (0.56, 0.045, 0.42), STONE_DARK, 0.01)
window.parent = root

# Cloth banner; low-poly and intentionally heavy for a miniature-diorama read.
pole = cube("BannerPole", (-2.70, -2.25, 2.22), (0.07, 0.07, 2.70), IRON, 0.01)
pole.parent = root
banner = cube("Banner", (-2.42, -2.22, 2.92), (0.58, 0.045, 0.76), CLOTH, 0.015)
banner.rotation_euler[1] = math.radians(-4)
banner.parent = root

# Deterministic export.
for obj in bpy.context.scene.objects:
    obj.select_set(obj.type in {"MESH", "EMPTY"})
bpy.ops.export_scene.gltf(
    filepath=output,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
)
print(f"wrote {output}")
