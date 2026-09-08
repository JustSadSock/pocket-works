import bpy
import math
import os
import sys
from mathutils import Vector


def output_path():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--output' in args:
        return os.path.abspath(args[args.index('--output') + 1])
    return os.path.abspath(os.environ['ASSET_FORGE_OUTPUT'])


def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        pass


def material(name, color, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def finish(obj, mat, bevel=0.0):
    obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new('EdgeSoftening', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle()
    obj.select_set(False)
    return obj


def cube(name, scale, mat, bevel=0.01, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] * 0.5, scale[1] * 0.5, scale[2] * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, bevel)


def cyl(name, radius, depth, mat, vertices=32, location=(0, 0, 0), rotation=(0, 0, 0), bevel=0.01):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, bevel)


def uv_sphere(name, scale, mat, location=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, 0.008)


def torus(name, major, minor, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=40, minor_segments=10, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, 0)


def build():
    reset_scene()
    steel = material('Steel', (0.34, 0.39, 0.42), 0.86, 0.25)
    dark = material('DarkSteel', (0.09, 0.115, 0.12), 0.8, 0.34)
    leather = material('Leather', (0.20, 0.075, 0.035), 0.02, 0.72)
    red = material('OxideRed', (0.47, 0.055, 0.025), 0.08, 0.55)
    blue = material('IndigoBlue', (0.055, 0.13, 0.28), 0.08, 0.55)
    brass = material('Brass', (0.52, 0.30, 0.08), 0.72, 0.28)
    wood = material('AshWood', (0.24, 0.095, 0.035), 0.0, 0.72)

    # Unit sword pieces. Runtime aligns/scales these to the physical blade anchors.
    blade = cube('Kit_Blade', (0.065, 0.020, 1.0), steel, 0.012)
    tip = cube('Kit_Blade_Ridge', (0.018, 0.026, 0.84), dark, 0.006)
    guard = cube('Kit_Guard', (0.30, 0.038, 0.052), dark, 0.012)
    grip = cyl('Kit_Grip', 0.032, 1.0, leather, vertices=16, rotation=(math.pi / 2, 0, 0), bevel=0.006)
    pommel = uv_sphere('Kit_Pommel', (0.055, 0.055, 0.070), brass)

    # Shield authored around +Z normal; runtime aligns this to the physical shield plane.
    face = cyl('Kit_ShieldFace', 0.45, 0.065, wood, vertices=48, bevel=0.012)
    face.rotation_euler.x = math.pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    rim = torus('Kit_ShieldRim', 0.425, 0.024, dark, rotation=(math.pi / 2, 0, 0))
    boss = uv_sphere('Kit_ShieldBoss', (0.125, 0.125, 0.060), steel)
    boss.location.z = 0.060
    ring = torus('Kit_ShieldPaintRing', 0.29, 0.032, red, rotation=(math.pi / 2, 0, 0))
    ring.location.z = 0.038
    slash = cube('Kit_ShieldSlash', (0.105, 0.018, 0.56), red, 0.015, location=(0, 0, 0.043))
    slash.rotation_euler.y = math.radians(-28)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # Stylised armor pieces, centered for attachment to runtime bones.
    chest = cube('Kit_ChestPlate', (0.50, 0.46, 0.15), steel, 0.035)
    chest.scale.x = 1.06
    chest.scale.y = 1.02
    waist = cube('Kit_ChestBand', (0.43, 0.10, 0.18), brass, 0.018)
    waist.location.y = -0.18
    tabard = cube('Kit_Tabard', (0.30, 0.54, 0.045), red, 0.014)
    tabard.location.z = 0.085
    pauldron_l = uv_sphere('Kit_PauldronL', (0.16, 0.075, 0.13), steel)
    pauldron_r = uv_sphere('Kit_PauldronR', (0.16, 0.075, 0.13), steel)
    helmet = cyl('Kit_Helmet', 0.16, 0.24, dark, vertices=32, bevel=0.018)
    helmet_tip = cyl('Kit_HelmetCone', 0.13, 0.20, dark, vertices=32, bevel=0.01)
    helmet_tip.scale.z = 0.65
    helmet_tip.location.z = 0.17
    nasal = cube('Kit_Nasal', (0.045, 0.18, 0.035), steel, 0.008, location=(0, -0.10, -0.055))
    crest = cube('Kit_Crest', (0.035, 0.12, 0.26), red, 0.01, location=(0, 0, 0.22))
    greave = cube('Kit_Greave', (0.14, 0.33, 0.07), steel, 0.025)
    boot = cube('Kit_Boot', (0.18, 0.11, 0.31), leather, 0.025)

    # Alternate color chips let runtime tint factions by swapping materials if desired.
    chip_red = cube('Kit_ColorRed', (0.04, 0.04, 0.04), red, 0.004, location=(3, 0, 0))
    chip_blue = cube('Kit_ColorBlue', (0.04, 0.04, 0.04), blue, 0.004, location=(3.1, 0, 0))
    chip_red.hide_render = True
    chip_blue.hide_render = True

    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            obj['sinew_asset'] = True

    out = output_path()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True)
    print(f'SINEW Blender combat kit exported to {out}')


if __name__ == '__main__':
    build()
