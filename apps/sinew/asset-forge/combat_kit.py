import bpy
import math
import os
import sys


def output_path():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--output' in args:
        return os.path.abspath(args[args.index('--output') + 1])
    return os.path.abspath(os.environ['ASSET_FORGE_OUTPUT'])


def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


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


def uv_sphere(name, scale, mat, location=(0, 0, 0), segments=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(8, segments // 2), location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, 0.006)


def torus(name, major, minor, mat, rotation=(0, 0, 0), location=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=40, minor_segments=10, rotation=rotation, location=location)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, 0)


def join_into(active, others):
    bpy.ops.object.select_all(action='DESELECT')
    active.select_set(True)
    for obj in others:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    active.select_set(False)
    return active


def tapered_blade(name, steel):
    # Diamond-ish tapered longsword blade, one authored metre along local Z.
    verts = [
        (-0.034, -0.009, -0.50), (0.034, -0.009, -0.50),
        (-0.034, 0.009, -0.50), (0.034, 0.009, -0.50),
        (-0.006, -0.006, 0.50), (0.006, -0.006, 0.50),
        (-0.006, 0.006, 0.50), (0.006, 0.006, 0.50),
    ]
    faces = [
        (0, 1, 5, 4), (2, 6, 7, 3),
        (0, 4, 6, 2), (1, 3, 7, 5),
        (0, 2, 3, 1), (4, 5, 7, 6),
    ]
    mesh = bpy.data.meshes.new(f'{name}_Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, steel, 0.004)


def build():
    reset_scene()
    steel = material('Steel', (0.43, 0.49, 0.52), 0.66, 0.29)
    dark = material('DarkSteel', (0.12, 0.15, 0.16), 0.62, 0.38)
    leather = material('Leather', (0.20, 0.075, 0.035), 0.02, 0.72)
    red = material('OxideRed', (0.47, 0.055, 0.025), 0.08, 0.55)
    blue = material('IndigoBlue', (0.055, 0.13, 0.28), 0.08, 0.55)
    brass = material('Brass', (0.52, 0.30, 0.08), 0.68, 0.30)
    wood = material('AshWood', (0.24, 0.095, 0.035), 0.0, 0.72)

    # Weapon: tapered Blender mesh rather than a rectangular Babylon-like box.
    blade = tapered_blade('Kit_Blade', steel)
    fuller = cube('Kit_Blade_Ridge', (0.014, 0.023, 0.78), dark, 0.003)
    guard = cube('Kit_Guard', (0.30, 0.038, 0.052), dark, 0.012)
    guard_tip_l = uv_sphere('GuardTipL', (0.032, 0.032, 0.032), brass, (-0.145, 0, 0), 16)
    guard_tip_r = uv_sphere('GuardTipR', (0.032, 0.032, 0.032), brass, (0.145, 0, 0), 16)
    join_into(guard, [guard_tip_l, guard_tip_r])
    grip = cyl('Kit_Grip', 0.032, 1.0, leather, vertices=16, rotation=(math.pi / 2, 0, 0), bevel=0.006)
    pommel = uv_sphere('Kit_Pommel', (0.055, 0.055, 0.070), brass)

    # Shield: wood core + joined steel rivets, separate tintable paint geometry.
    face = cyl('Kit_ShieldFace', 0.45, 0.065, wood, vertices=48, bevel=0.012)
    face.rotation_euler.x = math.pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    rivets = []
    for i in range(12):
        angle = i / 12 * math.tau
        rivets.append(uv_sphere(
            f'ShieldRivet{i:02d}',
            (0.018, 0.018, 0.012),
            dark,
            (math.cos(angle) * 0.365, math.sin(angle) * 0.365, 0.045),
            12,
        ))
    join_into(face, rivets)
    rim = torus('Kit_ShieldRim', 0.425, 0.024, dark, rotation=(math.pi / 2, 0, 0))
    boss = uv_sphere('Kit_ShieldBoss', (0.125, 0.125, 0.060), steel)
    boss.location.z = 0.060
    ring = torus('Kit_ShieldPaintRing', 0.29, 0.032, red, rotation=(math.pi / 2, 0, 0), location=(0, 0, 0.038))
    slash = cube('Kit_ShieldSlash', (0.105, 0.018, 0.56), red, 0.015, location=(0, 0, 0.043))
    slash.rotation_euler.y = math.radians(-28)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # Cuirass with joined lamellar ribs and brass studs; remains one runtime attachment.
    chest = cube('Kit_ChestPlate', (0.50, 0.46, 0.15), steel, 0.035)
    chest.scale.x = 1.06
    chest.scale.y = 1.02
    ribs = []
    for y in (-0.15, -0.05, 0.05, 0.15):
        ribs.append(cube(f'ChestRib{y:+.2f}', (0.44, 0.030, 0.025), dark, 0.006, location=(0, y, 0.087)))
    for x in (-0.19, 0.19):
        for y in (-0.15, -0.05, 0.05, 0.15):
            ribs.append(uv_sphere('ChestStud', (0.014, 0.014, 0.010), brass, (x, y, 0.102), 12))
    join_into(chest, ribs)

    waist = cube('Kit_ChestBand', (0.43, 0.10, 0.18), brass, 0.018)
    waist.location.y = -0.18
    tabard = cube('Kit_Tabard', (0.30, 0.54, 0.045), red, 0.014)
    tabard.location.z = 0.085
    pauldron_l = uv_sphere('Kit_PauldronL', (0.16, 0.075, 0.13), steel)
    pauldron_r = uv_sphere('Kit_PauldronR', (0.16, 0.075, 0.13), steel)

    helmet = cyl('Kit_Helmet', 0.16, 0.24, dark, vertices=32, bevel=0.018)
    brow = torus('HelmetBrow', 0.145, 0.012, steel, location=(0, 0, -0.045))
    join_into(helmet, [brow])
    helmet_tip = cyl('Kit_HelmetCone', 0.13, 0.20, dark, vertices=32, bevel=0.01)
    helmet_tip.scale.z = 0.65
    helmet_tip.location.z = 0.17
    nasal = cube('Kit_Nasal', (0.045, 0.18, 0.035), steel, 0.008, location=(0, -0.10, -0.055))
    crest = cube('Kit_Crest', (0.035, 0.12, 0.26), red, 0.01, location=(0, 0, 0.22))

    greave = cube('Kit_Greave', (0.14, 0.33, 0.07), steel, 0.025)
    greave_ridge = cube('GreaveRidge', (0.022, 0.28, 0.018), brass, 0.004, location=(0, 0, 0.043))
    join_into(greave, [greave_ridge])
    boot = cube('Kit_Boot', (0.18, 0.11, 0.31), leather, 0.025)

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
