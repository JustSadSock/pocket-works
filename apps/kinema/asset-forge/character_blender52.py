"""Blender 5.2 production entrypoint for KINEMA v1.3.

The source module owns the stable armature, animation actions and exporter.
This entrypoint replaces the old primitive-by-primitive visual body with
continuous metaball-authored clothing/head volumes, then converts them to
weighted meshes. The result keeps the lightweight app-local pipeline while
removing the toy/block construction visible in earlier mobile QA passes.
"""

import importlib.util
import math
from pathlib import Path

import bpy


SCRIPT = Path(__file__).with_name('character.py')
spec = importlib.util.spec_from_file_location('kinema_character_source', SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f'Unable to load KINEMA character source: {SCRIPT}')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

# Blender 5.2 removed the legacy Action.fcurves facade. The original pass only
# edits interpolation handles; authored poses/action ranges remain unchanged.
module.finalize_action = lambda action: None


def deselect_all():
    bpy.ops.object.select_all(action='DESELECT')


def meta_mesh(name, parts, mat, resolution=0.026, threshold=0.62):
    """Create one smooth organic mesh from overlapping anisotropic metaballs.

    parts entries are (location_xyz, radius, scale_xyz). Keeping torso/limbs as
    one converted surface removes the visible hard seams at shoulders/hips.
    """
    data = bpy.data.metaballs.new(f'{name}_Meta')
    data.resolution = resolution
    data.render_resolution = max(0.016, resolution * 0.68)
    data.threshold = threshold
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for loc, radius, scale in parts:
        elem = data.elements.new()
        elem.type = 'ELLIPSOID'
        elem.co = loc
        elem.radius = radius
        elem.size_x = scale[0]
        elem.size_y = scale[1]
        elem.size_z = scale[2]
        elem.stiffness = 2.0
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.name = name
    module.finish(obj, mat, True)
    return obj


def bind_by_function(obj, arm, weight_fn):
    module.add_armature_modifier(obj, arm)
    groups = {}
    for index, vertex in enumerate(obj.data.vertices):
        weight_map = weight_fn(vertex.co)
        total = sum(max(0.0, float(value)) for value in weight_map.values()) or 1.0
        for bone_name, value in weight_map.items():
            value = max(0.0, float(value)) / total
            if value <= 0.0001:
                continue
            if bone_name not in groups:
                groups[bone_name] = obj.vertex_groups.new(name=bone_name)
            groups[bone_name].add([index], value, 'REPLACE')
    return obj


def torso_weights(co):
    z = co.z
    if z < 1.07:
        return {'pelvis': 0.72, 'spine': 0.28}
    if z < 1.22:
        t = (z - 1.07) / 0.15
        return {'spine': 1.0 - 0.32 * t, 'chest': 0.32 * t}
    if z < 1.38:
        t = (z - 1.22) / 0.16
        return {'spine': 0.48 * (1.0 - t), 'chest': 0.52 + 0.48 * t}
    return {'chest': 1.0}


def jacket_weights(co):
    x, z = co.x, co.z
    ax = abs(x)
    if ax < 0.205 or z > 1.445:
        return torso_weights(co)
    side = 'L' if x < 0.0 else 'R'
    if z > 1.33:
        t = min(1.0, max(0.0, (ax - 0.205) / 0.10))
        return {'chest': 0.55 * (1.0 - t), f'clavicle_{side}': 0.45 + 0.25 * t, f'upper_arm_{side}': 0.20 * t}
    if z > 1.17:
        return {f'upper_arm_{side}': 0.92, f'clavicle_{side}': 0.08}
    if z > 1.02:
        t = (1.17 - z) / 0.15
        return {f'upper_arm_{side}': 1.0 - 0.60 * t, f'forearm_{side}': 0.60 * t}
    return {f'forearm_{side}': 1.0}


def trouser_weights(co):
    x, z = co.x, co.z
    if z > 0.88 and abs(x) < 0.095:
        return {'pelvis': 1.0}
    side = 'L' if x < 0.0 else 'R'
    if z > 0.63:
        return {f'thigh_{side}': 0.92, 'pelvis': 0.08}
    if z > 0.45:
        t = (0.63 - z) / 0.18
        return {f'thigh_{side}': 1.0 - 0.68 * t, f'shin_{side}': 0.68 * t}
    return {f'shin_{side}': 1.0}


def rigid_meta(name, parts, mat, arm, bone, resolution=0.024, threshold=0.62):
    obj = meta_mesh(name, parts, mat, resolution, threshold)
    module.rigid_bind(obj, arm, bone)
    return obj


def build_character_v13(arm):
    skin = module.material('Skin', (0.56, 0.355, 0.245), 0.61, seed=5, grain=0.014)
    hair = module.material('Hair', (0.038, 0.031, 0.028), 0.82, seed=8, grain=0.024)
    jacket = module.material('Olive_Canvas', (0.205, 0.285, 0.235), 0.90, seed=12, weave=0.008, grain=0.014)
    jacket_dark = module.material('Canvas_Seams', (0.125, 0.165, 0.142), 0.92, seed=13, weave=0.006, grain=0.012)
    shirt = module.material('Cotton_Shirt', (0.61, 0.57, 0.50), 0.94, seed=17, weave=0.008, grain=0.010)
    pants = module.material('Charcoal_Twill', (0.075, 0.082, 0.080), 0.94, seed=22, weave=0.006, grain=0.012)
    leather = module.material('Boot_Leather', (0.073, 0.045, 0.033), 0.70, seed=28, grain=0.022)
    rubber = module.plain_material('Rubber_Sole', (0.024, 0.023, 0.022), 0.97)
    metal = module.plain_material('Hardware', (0.18, 0.18, 0.17), 0.34, 0.68)
    eye = module.plain_material('Eyes', (0.060, 0.052, 0.045), 0.48)
    lip = module.plain_material('Lip', (0.285, 0.145, 0.125), 0.70)

    jacket_parts = [
        ((0.0, 0.018, 1.055), 0.205, (1.00, 0.63, 0.74)),
        ((0.0, 0.014, 1.195), 0.225, (1.00, 0.63, 0.78)),
        ((0.0, 0.008, 1.330), 0.245, (1.00, 0.62, 0.72)),
        ((0.0, 0.006, 1.420), 0.230, (1.00, 0.60, 0.48)),
    ]
    for sign in (-1.0, 1.0):
        jacket_parts.extend([
            ((0.205 * sign, 0.005, 1.395), 0.125, (0.82, 0.72, 0.88)),
            ((0.258 * sign, -0.002, 1.285), 0.103, (0.74, 0.72, 1.24)),
            ((0.305 * sign, -0.012, 1.145), 0.094, (0.70, 0.70, 1.34)),
            ((0.334 * sign, -0.023, 1.015), 0.082, (0.68, 0.68, 1.22)),
            ((0.348 * sign, -0.032, 0.902), 0.073, (0.68, 0.68, 1.10)),
        ])
    jacket_obj = meta_mesh('Field_Jacket', jacket_parts, jacket, 0.024, 0.64)
    bind_by_function(jacket_obj, arm, jacket_weights)

    trouser_parts = [
        ((0.0, 0.012, 0.930), 0.182, (1.00, 0.69, 0.72)),
        ((0.0, 0.008, 0.855), 0.165, (1.00, 0.68, 0.58)),
    ]
    for sign in (-1.0, 1.0):
        trouser_parts.extend([
            ((0.086 * sign, 0.002, 0.790), 0.112, (0.82, 0.78, 1.25)),
            ((0.092 * sign, 0.001, 0.655), 0.105, (0.78, 0.76, 1.35)),
            ((0.096 * sign, 0.000, 0.515), 0.096, (0.76, 0.74, 1.28)),
            ((0.096 * sign, -0.002, 0.375), 0.083, (0.74, 0.72, 1.35)),
            ((0.095 * sign, -0.006, 0.225), 0.072, (0.72, 0.70, 1.45)),
        ])
    trouser_obj = meta_mesh('Trousers', trouser_parts, pants, 0.022, 0.64)
    bind_by_function(trouser_obj, arm, trouser_weights)

    module.rigid_bind(module.ellipsoid('Shirt_Neckline', (0.0, -0.008, 1.470), (0.095, 0.082, 0.055), shirt, 28, 18), arm, 'chest')
    module.rigid_bind(module.soft_box('Zipper', (0.0, -0.142, 1.270), (0.0045, 0.004, 0.205), metal, 0.003), arm, 'chest')
    for sign in (-1.0, 1.0):
        module.rigid_bind(module.soft_box(f'Chest_Pocket_{sign:+.0f}', (0.105 * sign, -0.134, 1.310), (0.046, 0.010, 0.052), jacket_dark, 0.010), arm, 'chest')
    module.rigid_bind(module.soft_box('Collar_L', (-0.055, -0.086, 1.478), (0.057, 0.025, 0.022), jacket, 0.012, (0.0, 0.0, -0.18)), arm, 'chest')
    module.rigid_bind(module.soft_box('Collar_R', (0.055, -0.086, 1.478), (0.057, 0.025, 0.022), jacket, 0.012, (0.0, 0.0, 0.18)), arm, 'chest')

    bpy.ops.mesh.primitive_torus_add(major_radius=0.158, minor_radius=0.012, major_segments=32, minor_segments=8, location=(0.0, 0.0, 0.997))
    belt = bpy.context.object
    belt.name = 'Leather_Belt'
    belt.scale.y = 0.70
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    module.finish(belt, leather, True)
    module.rigid_bind(belt, arm, 'pelvis')
    module.rigid_bind(module.soft_box('Belt_Buckle', (0.0, -0.116, 0.997), (0.022, 0.008, 0.018), metal, 0.005), arm, 'pelvis')

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        rigid_meta(f'Boot_{side}', [
            ((0.095 * sign, -0.010, 0.145), 0.072, (0.86, 0.86, 1.10)),
            ((0.095 * sign, -0.070, 0.090), 0.075, (0.90, 1.25, 0.72)),
            ((0.095 * sign, -0.145, 0.068), 0.070, (0.94, 1.42, 0.62)),
        ], leather, arm, f'foot_{side}', 0.020, 0.67)
        module.rigid_bind(module.ellipsoid(f'Boot_Sole_{side}', (0.095 * sign, -0.092, 0.029), (0.071, 0.142, 0.020), rubber, 26, 14), arm, f'foot_{side}')
        for row in range(3):
            y = -0.070 - row * 0.030
            module.rigid_bind(module.cylinder_between(f'Boot_Lace_{side}_{row}', (0.060 * sign, y, 0.123), (0.130 * sign, y, 0.123), 0.0026, jacket_dark, 10), arm, f'foot_{side}')

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        rigid_meta(f'Hand_{side}', [
            ((0.355 * sign, -0.040, 0.820), 0.050, (0.82, 0.72, 1.08)),
            ((0.358 * sign, -0.044, 0.775), 0.046, (0.80, 0.70, 1.00)),
        ], skin, arm, f'hand_{side}', 0.018, 0.68)
        module.rigid_bind(module.ellipsoid(f'Thumb_{side}', (0.326 * sign, -0.064, 0.798), (0.016, 0.018, 0.036), skin, 18, 12, (0.0, 0.28 * sign, 0.14 * sign)), arm, f'hand_{side}')

    module.rigid_bind(module.ellipsoid('Neck', (0.0, 0.004, 1.535), (0.056, 0.052, 0.092), skin, 28, 18), arm, 'neck')
    rigid_meta('Head', [
        ((0.0, 0.008, 1.690), 0.105, (0.88, 0.82, 1.30)),
        ((0.0, -0.010, 1.620), 0.086, (0.90, 0.82, 0.92)),
        ((0.0, -0.077, 1.654), 0.030, (0.56, 0.95, 0.92)),
    ], skin, arm, 'head', 0.018, 0.67)
    for sign in (-1.0, 1.0):
        module.rigid_bind(module.ellipsoid(f'Ear_{sign:+.0f}', (0.092 * sign, 0.004, 1.656), (0.014, 0.012, 0.027), skin, 18, 12), arm, 'head')
        module.rigid_bind(module.ellipsoid(f'Eye_{sign:+.0f}', (0.033 * sign, -0.092, 1.681), (0.0085, 0.0045, 0.0060), eye, 16, 10), arm, 'head')
        module.rigid_bind(module.cylinder_between(f'Brow_{sign:+.0f}', (0.014 * sign, -0.094, 1.707), (0.050 * sign, -0.093, 1.711), 0.0032, hair, 10), arm, 'head')
    module.rigid_bind(module.ellipsoid('Lower_Lip', (0.0, -0.096, 1.617), (0.024, 0.0045, 0.0045), lip, 18, 10), arm, 'head')

    rigid_meta('Hair', [
        ((0.0, 0.018, 1.782), 0.088, (1.05, 0.88, 0.65)),
        ((-0.036, -0.034, 1.773), 0.058, (0.92, 0.78, 0.68)),
        ((0.018, -0.046, 1.782), 0.060, (0.98, 0.72, 0.70)),
        ((0.052, -0.020, 1.765), 0.050, (0.82, 0.78, 0.68)),
    ], hair, arm, 'head', 0.018, 0.70)

    module.rigid_bind(module.ellipsoid('Watch_Strap', (-0.350, -0.032, 0.894), (0.047, 0.048, 0.014), leather, 20, 12), arm, 'forearm_L')
    module.rigid_bind(module.soft_box('Watch_Face', (-0.350, -0.078, 0.898), (0.018, 0.007, 0.021), metal, 0.006), arm, 'forearm_L')


module.build_character = build_character_v13
module.main()
