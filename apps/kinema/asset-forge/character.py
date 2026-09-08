import argparse
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


FPS = 30
TAU = math.pi * 2.0


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for bank in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.actions,
    ):
        for block in list(bank):
            if block.users == 0:
                bank.remove(block)


def material(name, base, roughness=0.65, metallic=0.0, seed=1, weave=0.0, grain=0.028):
    random.seed(seed)
    size = 64
    image = bpy.data.images.new(f'{name}_Albedo', width=size, height=size, alpha=True)
    pixels = []
    for y in range(size):
        for x in range(size):
            noise = (random.random() - 0.5) * grain
            thread = weave * (
                0.45 * math.sin(x * math.pi * 0.5)
                + 0.45 * math.sin(y * math.pi * 0.5)
                + 0.10 * math.sin((x + y) * math.pi * 0.25)
            )
            shade = noise + thread
            pixels.extend((
                max(0.0, min(1.0, base[0] + shade)),
                max(0.0, min(1.0, base[1] + shade)),
                max(0.0, min(1.0, base[2] + shade)),
                1.0,
            ))
    image.pixels = pixels
    image.pack()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*base, 1.0)
    mat.roughness = roughness
    mat.metallic = metallic
    principled = mat.node_tree.nodes.get('Principled BSDF')
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.name = f'{name}_Texture'
    tex.image = image
    tex.interpolation = 'Linear'
    mat.node_tree.links.new(tex.outputs['Color'], principled.inputs['Base Color'])
    principled.inputs['Roughness'].default_value = roughness
    principled.inputs['Metallic'].default_value = metallic
    return mat


def plain_material(name, color, roughness=0.62, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1.0)
    mat.roughness = roughness
    mat.metallic = metallic
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1.0)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return mat


def finish(obj, mat, smooth=True, bevel=0.0):
    obj.data.materials.append(mat)
    if smooth and hasattr(obj.data, 'polygons'):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if bevel > 0.0:
        mod = obj.modifiers.new('Edge softness', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = 'ANGLE'
    return obj


def ellipsoid(name, loc, scale, mat, segments=28, rings=20, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=loc,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, True)


def soft_box(name, loc, scale, mat, bevel=0.025, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, True, bevel)


def cylinder_between(name, a, b, radius, mat, vertices=20):
    a = Vector(a)
    b = Vector(b)
    direction = b - a
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=direction.length,
        location=(a + b) * 0.5,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = direction.to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, True)


def make_rig():
    arm_data = bpy.data.armatures.new('KINEMA_Armature')
    arm = bpy.data.objects.new('KINEMA_Rig', arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None, connected=False):
        b = arm_data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
            b.use_connect = connected
        return b

    bone('root', (0.0, 0.0, 0.02), (0.0, 0.0, 0.15))
    bone('pelvis', (0.0, 0.0, 0.88), (0.0, 0.0, 1.02), 'root')
    bone('spine', (0.0, 0.0, 0.99), (0.0, 0.0, 1.23), 'pelvis')
    bone('chest', (0.0, 0.0, 1.19), (0.0, 0.0, 1.46), 'spine')
    bone('neck', (0.0, 0.0, 1.44), (0.0, 0.0, 1.57), 'chest')
    bone('head', (0.0, 0.0, 1.55), (0.0, -0.01, 1.80), 'neck')

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        bone(f'clavicle_{side}', (0.035 * sign, 0.0, 1.43), (0.225 * sign, 0.0, 1.41), 'chest')
        bone(f'upper_arm_{side}', (0.225 * sign, 0.0, 1.41), (0.325 * sign, -0.014, 1.12), f'clavicle_{side}')
        bone(f'forearm_{side}', (0.325 * sign, -0.014, 1.12), (0.355 * sign, -0.035, 0.855), f'upper_arm_{side}', True)
        bone(f'hand_{side}', (0.355 * sign, -0.035, 0.855), (0.365 * sign, -0.045, 0.715), f'forearm_{side}', True)
        bone(f'thigh_{side}', (0.10 * sign, 0.0, 0.91), (0.108 * sign, 0.0, 0.52), 'pelvis')
        bone(f'shin_{side}', (0.108 * sign, 0.0, 0.52), (0.105 * sign, -0.004, 0.14), f'thigh_{side}', True)
        bone(f'foot_{side}', (0.105 * sign, -0.004, 0.14), (0.105 * sign, -0.235, 0.085), f'shin_{side}', True)

    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def add_armature_modifier(obj, arm):
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm


def rigid_bind(obj, arm, bone_name):
    add_armature_modifier(obj, arm)
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    return obj


def weighted_mesh(name, verts, faces, mat, arm, weights, smooth=True):
    mesh = bpy.data.meshes.new(f'{name}_Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, mat, smooth)
    add_armature_modifier(obj, arm)
    groups = {}
    for vertex_index, weight_map in enumerate(weights):
        for bone_name, value in weight_map.items():
            if value <= 0.0:
                continue
            if bone_name not in groups:
                groups[bone_name] = obj.vertex_groups.new(name=bone_name)
            groups[bone_name].add([vertex_index], float(value), 'REPLACE')
    return obj


def torso_shell(name, rings, mat, arm, segments=28):
    verts = []
    faces = []
    weights = []
    for z, rx, ry, weight_map in rings:
        for j in range(segments):
            t = TAU * j / segments
            shoulder = 1.0 + 0.025 * math.cos(t * 2.0)
            verts.append((math.cos(t) * rx * shoulder, math.sin(t) * ry, z))
            weights.append(dict(weight_map))
    for i in range(len(rings) - 1):
        for j in range(segments):
            a = i * segments + j
            b = i * segments + (j + 1) % segments
            c = (i + 1) * segments + (j + 1) % segments
            d = (i + 1) * segments + j
            faces.append((a, b, c, d))
    bottom = len(verts)
    verts.append((0.0, 0.0, rings[0][0]))
    weights.append(dict(rings[0][3]))
    top = len(verts)
    verts.append((0.0, 0.0, rings[-1][0]))
    weights.append(dict(rings[-1][3]))
    for j in range(segments):
        faces.append((bottom, (j + 1) % segments, j))
        a = (len(rings) - 1) * segments + j
        b = (len(rings) - 1) * segments + (j + 1) % segments
        faces.append((top, a, b))
    return weighted_mesh(name, verts, faces, mat, arm, weights, True)


def tube_chain(name, points, radii, ring_weights, mat, arm, segments=18):
    pts = [Vector(p) for p in points]
    verts = []
    faces = []
    weights = []
    for i, p in enumerate(pts):
        if i == 0:
            tangent = (pts[1] - p).normalized()
        elif i == len(pts) - 1:
            tangent = (p - pts[i - 1]).normalized()
        else:
            tangent = (pts[i + 1] - pts[i - 1]).normalized()
        helper = Vector((0.0, 1.0, 0.0))
        if abs(tangent.dot(helper)) > 0.92:
            helper = Vector((1.0, 0.0, 0.0))
        axis_x = helper.cross(tangent).normalized()
        axis_y = tangent.cross(axis_x).normalized()
        rx, ry = radii[i]
        for j in range(segments):
            theta = TAU * j / segments
            offset = axis_x * (math.cos(theta) * rx) + axis_y * (math.sin(theta) * ry)
            verts.append(tuple(p + offset))
            weights.append(dict(ring_weights[i]))
    for i in range(len(pts) - 1):
        for j in range(segments):
            a = i * segments + j
            b = i * segments + (j + 1) % segments
            c = (i + 1) * segments + (j + 1) % segments
            d = (i + 1) * segments + j
            faces.append((a, b, c, d))
    for end_i in (0, len(pts) - 1):
        center = len(verts)
        verts.append(tuple(pts[end_i]))
        weights.append(dict(ring_weights[end_i]))
        start = end_i * segments
        for j in range(segments):
            a = start + j
            b = start + (j + 1) % segments
            faces.append((center, b, a) if end_i == 0 else (center, a, b))
    return weighted_mesh(name, verts, faces, mat, arm, weights, True)


def build_character(arm):
    skin = material('Skin', (0.57, 0.36, 0.25), 0.58, seed=5, grain=0.018)
    hair = material('Hair', (0.045, 0.035, 0.030), 0.78, seed=8, grain=0.035)
    jacket = material('Olive_Canvas', (0.22, 0.30, 0.245), 0.88, seed=12, weave=0.010, grain=0.020)
    jacket_dark = material('Canvas_Seams', (0.145, 0.19, 0.16), 0.9, seed=13, weave=0.008, grain=0.018)
    shirt = material('Cotton_Shirt', (0.59, 0.55, 0.47), 0.92, seed=17, weave=0.012, grain=0.014)
    pants = material('Charcoal_Twill', (0.085, 0.095, 0.092), 0.92, seed=22, weave=0.009, grain=0.018)
    leather = material('Boot_Leather', (0.095, 0.055, 0.035), 0.66, seed=28, grain=0.035)
    rubber = plain_material('Rubber_Sole', (0.028, 0.026, 0.024), 0.95)
    metal = plain_material('Hardware', (0.20, 0.19, 0.17), 0.30, 0.72)
    eye_white = plain_material('Sclera', (0.67, 0.62, 0.55), 0.47)
    iris = plain_material('Iris', (0.075, 0.105, 0.085), 0.34)
    lip = plain_material('Lip', (0.34, 0.16, 0.13), 0.63)

    torso_shell('Trouser_Hips', [
        (0.82, 0.165, 0.125, {'pelvis': 1.0}),
        (0.88, 0.195, 0.140, {'pelvis': 1.0}),
        (0.96, 0.205, 0.145, {'pelvis': 0.9, 'spine': 0.1}),
        (1.00, 0.195, 0.135, {'pelvis': 0.75, 'spine': 0.25}),
    ], pants, arm)
    torso_shell('Field_Jacket', [
        (1.00, 0.198, 0.133, {'pelvis': 0.55, 'spine': 0.45}),
        (1.07, 0.205, 0.140, {'spine': 0.90, 'pelvis': 0.10}),
        (1.20, 0.218, 0.148, {'spine': 0.65, 'chest': 0.35}),
        (1.34, 0.240, 0.158, {'chest': 0.82, 'spine': 0.18}),
        (1.43, 0.252, 0.158, {'chest': 1.0}),
        (1.49, 0.205, 0.142, {'chest': 1.0}),
    ], jacket, arm)

    rigid_bind(ellipsoid('Shirt_Neckline', (0.0, -0.018, 1.475), (0.115, 0.108, 0.075), shirt, 24, 16), arm, 'chest')
    rigid_bind(soft_box('Zipper', (0.0, -0.155, 1.275), (0.006, 0.006, 0.215), metal, 0.004), arm, 'chest')
    for sign in (-1.0, 1.0):
        rigid_bind(soft_box(f'Chest_Pocket_{sign:+.0f}', (0.125 * sign, -0.151, 1.335), (0.058, 0.014, 0.063), jacket_dark, 0.014), arm, 'chest')
        rigid_bind(soft_box(f'Pocket_Flap_{sign:+.0f}', (0.125 * sign, -0.168, 1.395), (0.064, 0.010, 0.020), jacket, 0.009), arm, 'chest')
    rigid_bind(soft_box('Collar_L', (-0.070, -0.110, 1.495), (0.075, 0.036, 0.030), jacket, 0.016, (0.0, 0.0, -0.22)), arm, 'chest')
    rigid_bind(soft_box('Collar_R', (0.070, -0.110, 1.495), (0.075, 0.036, 0.030), jacket, 0.016, (0.0, 0.0, 0.22)), arm, 'chest')

    bpy.ops.mesh.primitive_torus_add(major_radius=0.185, minor_radius=0.018, major_segments=28, minor_segments=8, location=(0.0, 0.0, 1.005))
    belt = bpy.context.object
    belt.name = 'Leather_Belt'
    belt.scale.y = 0.73
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(belt, leather, True)
    rigid_bind(belt, arm, 'pelvis')
    rigid_bind(soft_box('Belt_Buckle', (0.0, -0.142, 1.005), (0.030, 0.010, 0.025), metal, 0.006), arm, 'pelvis')

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        tube_chain(f'Trouser_Leg_{side}', [
            (0.100 * sign, 0.0, 0.91),
            (0.105 * sign, 0.0, 0.70),
            (0.108 * sign, 0.0, 0.52),
            (0.106 * sign, -0.005, 0.33),
            (0.105 * sign, -0.008, 0.155),
        ], [(0.118, 0.112), (0.112, 0.105), (0.103, 0.096), (0.087, 0.083), (0.073, 0.070)], [
            {f'thigh_{side}': 1.0},
            {f'thigh_{side}': 1.0},
            {f'thigh_{side}': 0.45, f'shin_{side}': 0.55},
            {f'shin_{side}': 1.0},
            {f'shin_{side}': 1.0},
        ], pants, arm, 20)
        rigid_bind(soft_box(f'Cargo_Pocket_{side}', (0.145 * sign, -0.095, 0.685), (0.055, 0.022, 0.078), pants, 0.014), arm, f'thigh_{side}')
        rigid_bind(ellipsoid(f'Boot_Ankle_{side}', (0.105 * sign, -0.015, 0.145), (0.086, 0.088, 0.105), leather, 22, 16), arm, f'shin_{side}')
        rigid_bind(soft_box(f'Boot_Upper_{side}', (0.105 * sign, -0.095, 0.086), (0.092, 0.145, 0.062), leather, 0.035), arm, f'foot_{side}')
        rigid_bind(soft_box(f'Boot_Toe_{side}', (0.105 * sign, -0.205, 0.070), (0.095, 0.105, 0.050), leather, 0.036), arm, f'foot_{side}')
        rigid_bind(soft_box(f'Boot_Sole_{side}', (0.105 * sign, -0.135, 0.027), (0.102, 0.188, 0.020), rubber, 0.014), arm, f'foot_{side}')
        for row in range(4):
            rigid_bind(cylinder_between(f'Boot_Lace_{side}_{row}', (0.055 * sign, -0.116 - row * 0.030, 0.132), (0.155 * sign, -0.116 - row * 0.030, 0.132), 0.004, jacket_dark, 10), arm, f'foot_{side}')

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        tube_chain(f'Jacket_Sleeve_{side}', [
            (0.222 * sign, 0.0, 1.415),
            (0.270 * sign, -0.006, 1.285),
            (0.325 * sign, -0.014, 1.120),
            (0.345 * sign, -0.025, 0.985),
            (0.355 * sign, -0.035, 0.858),
        ], [(0.108, 0.100), (0.105, 0.096), (0.096, 0.090), (0.084, 0.078), (0.073, 0.068)], [
            {f'clavicle_{side}': 0.35, f'upper_arm_{side}': 0.65},
            {f'upper_arm_{side}': 1.0},
            {f'upper_arm_{side}': 0.45, f'forearm_{side}': 0.55},
            {f'forearm_{side}': 1.0},
            {f'forearm_{side}': 1.0},
        ], jacket, arm, 20)
        rigid_bind(ellipsoid(f'Hand_{side}', (0.360 * sign, -0.041, 0.790), (0.064, 0.052, 0.090), skin, 22, 16), arm, f'hand_{side}')
        rigid_bind(ellipsoid(f'Thumb_{side}', (0.314 * sign, -0.067, 0.802), (0.025, 0.026, 0.050), skin, 18, 12, (0.0, 0.35 * sign, 0.18 * sign)), arm, f'hand_{side}')

    rigid_bind(ellipsoid('Neck', (0.0, 0.002, 1.535), (0.068, 0.064, 0.102), skin, 24, 16), arm, 'neck')
    rigid_bind(ellipsoid('Head_Cranium', (0.0, 0.000, 1.675), (0.112, 0.098, 0.145), skin, 32, 24), arm, 'head')
    rigid_bind(ellipsoid('Jaw', (0.0, -0.010, 1.610), (0.098, 0.090, 0.092), skin, 28, 20), arm, 'head')
    for sign in (-1.0, 1.0):
        rigid_bind(ellipsoid(f'Ear_{sign:+.0f}', (0.110 * sign, 0.0, 1.655), (0.021, 0.017, 0.038), skin, 18, 12), arm, 'head')

    rigid_bind(ellipsoid('Hair_Cap', (0.0, 0.012, 1.775), (0.122, 0.105, 0.072), hair, 30, 18), arm, 'head')
    for index, (x, y, z, sx, sy, sz) in enumerate([
        (-0.070, -0.072, 1.764, 0.046, 0.040, 0.040),
        (-0.025, -0.088, 1.782, 0.050, 0.035, 0.048),
        (0.025, -0.088, 1.778, 0.052, 0.036, 0.044),
        (0.070, -0.070, 1.765, 0.045, 0.038, 0.038),
    ]):
        rigid_bind(ellipsoid(f'Hair_Front_{index}', (x, y, z), (sx, sy, sz), hair, 18, 12), arm, 'head')

    for sign in (-1.0, 1.0):
        rigid_bind(ellipsoid(f'Eye_{sign:+.0f}', (0.038 * sign, -0.094, 1.684), (0.025, 0.011, 0.012), eye_white, 18, 12), arm, 'head')
        rigid_bind(ellipsoid(f'Iris_{sign:+.0f}', (0.038 * sign, -0.104, 1.684), (0.010, 0.005, 0.010), iris, 16, 10), arm, 'head')
        rigid_bind(cylinder_between(f'Brow_{sign:+.0f}', (0.014 * sign, -0.105, 1.714), (0.060 * sign, -0.103, 1.718), 0.0055, hair, 10), arm, 'head')
    rigid_bind(ellipsoid('Nose', (0.0, -0.108, 1.655), (0.022, 0.027, 0.034), skin, 20, 14), arm, 'head')
    rigid_bind(ellipsoid('Lower_Lip', (0.0, -0.102, 1.615), (0.036, 0.009, 0.008), lip, 18, 10), arm, 'head')
    rigid_bind(ellipsoid('Watch_Strap', (-0.355, -0.035, 0.880), (0.078, 0.070, 0.025), leather, 20, 12), arm, 'forearm_L')
    rigid_bind(soft_box('Watch_Face', (-0.355, -0.102, 0.885), (0.026, 0.010, 0.030), metal, 0.008), arm, 'forearm_L')


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)


def pose_key(arm, frame, rotations=None, locations=None):
    rotations = rotations or {}
    locations = locations or {}
    for name, rot in rotations.items():
        pb = arm.pose.bones.get(name)
        if not pb:
            continue
        pb.rotation_euler = rot
        pb.keyframe_insert(data_path='rotation_euler', frame=frame, group=name)
    for name, loc in locations.items():
        pb = arm.pose.bones.get(name)
        if not pb:
            continue
        pb.location = loc
        pb.keyframe_insert(data_path='location', frame=frame, group=name)


def finalize_action(action):
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = 'BEZIER'
            point.handle_left_type = 'AUTO_CLAMPED'
            point.handle_right_type = 'AUTO_CLAMPED'


def create_idle(arm):
    action = bpy.data.actions.new('Idle')
    arm.animation_data_create()
    arm.animation_data.action = action
    reset_pose(arm)
    for frame, breath, sway in [(1, 0.0, 0.0), (19, 1.0, 1.0), (37, 0.0, 0.0), (55, -0.65, -1.0), (73, 0.0, 0.0)]:
        pose_key(arm, frame, {
            'spine': (math.radians(-1.0 + breath * 0.5), 0.0, math.radians(sway * 0.6)),
            'chest': (math.radians(1.2 + breath * 0.7), 0.0, math.radians(-sway * 0.45)),
            'head': (math.radians(-0.6), math.radians(sway * 0.4), math.radians(sway * 0.2)),
            'upper_arm_L': (math.radians(1.0 + sway * 0.6), 0.0, math.radians(-1.0)),
            'upper_arm_R': (math.radians(1.0 - sway * 0.6), 0.0, math.radians(1.0)),
            'forearm_L': (math.radians(2.0), 0.0, 0.0),
            'forearm_R': (math.radians(2.0), 0.0, 0.0),
        }, {'pelvis': (0.0, 0.0, breath * 0.0035)})
    finalize_action(action)
    return action


def create_gait(arm, name, frames, leg_deg, arm_deg, knee_deg, bob, lean_deg, stride_twist_deg):
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    reset_pose(arm)
    for i in range(9):
        frame = 1 + (frames - 1) * i / 8
        phase = TAU * i / 8
        swing = math.sin(phase)
        cross = math.cos(phase)
        knee_l = max(0.0, -swing) * knee_deg + max(0.0, cross) * knee_deg * 0.18
        knee_r = max(0.0, swing) * knee_deg + max(0.0, -cross) * knee_deg * 0.18
        lift = abs(math.sin(phase * 2.0)) * bob
        twist = math.sin(phase) * stride_twist_deg
        pose_key(arm, frame, {
            'pelvis': (math.radians(0.5), 0.0, math.radians(twist * 0.55)),
            'spine': (math.radians(lean_deg * 0.35), 0.0, math.radians(-twist * 0.35)),
            'chest': (math.radians(lean_deg), 0.0, math.radians(-twist * 0.55)),
            'head': (math.radians(-lean_deg * 0.55), 0.0, math.radians(twist * 0.18)),
            'thigh_L': (math.radians(swing * leg_deg), math.radians(-1.2), math.radians(0.5)),
            'thigh_R': (math.radians(-swing * leg_deg), math.radians(1.2), math.radians(-0.5)),
            'shin_L': (math.radians(knee_l), 0.0, 0.0),
            'shin_R': (math.radians(knee_r), 0.0, 0.0),
            'foot_L': (math.radians(-swing * leg_deg * 0.22 - knee_l * 0.12), 0.0, 0.0),
            'foot_R': (math.radians(swing * leg_deg * 0.22 - knee_r * 0.12), 0.0, 0.0),
            'upper_arm_L': (math.radians(-swing * arm_deg), 0.0, math.radians(-1.5)),
            'upper_arm_R': (math.radians(swing * arm_deg), 0.0, math.radians(1.5)),
            'forearm_L': (math.radians(5.0 + max(0.0, swing) * arm_deg * 0.22), 0.0, 0.0),
            'forearm_R': (math.radians(5.0 + max(0.0, -swing) * arm_deg * 0.22), 0.0, 0.0),
        }, {'pelvis': (0.0, 0.0, lift)})
    finalize_action(action)
    return action


def create_directional_action(arm, name, frames, side=0.0, backward=False, pivot=0.0):
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    reset_pose(arm)
    for i in range(9):
        frame = 1 + (frames - 1) * i / 8
        phase = TAU * i / 8
        swing = math.sin(phase)
        if pivot:
            pose_key(arm, frame, {
                'pelvis': (0.0, 0.0, math.radians(pivot * swing * 10.0)),
                'chest': (0.0, 0.0, math.radians(-pivot * swing * 6.0)),
                'thigh_L': (math.radians(swing * 8.0), 0.0, math.radians(-pivot * 5.0)),
                'thigh_R': (math.radians(-swing * 8.0), 0.0, math.radians(pivot * 5.0)),
            }, {'pelvis': (0.0, 0.0, abs(math.sin(phase * 2.0)) * 0.010)})
        elif side:
            pose_key(arm, frame, {
                'pelvis': (0.0, math.radians(-side * 2.0), math.radians(-side * 3.0)),
                'thigh_L': (math.radians(swing * 7.0), math.radians(side * 12.0), 0.0),
                'thigh_R': (math.radians(-swing * 7.0), math.radians(side * 12.0), 0.0),
                'upper_arm_L': (math.radians(-swing * 8.0), 0.0, 0.0),
                'upper_arm_R': (math.radians(swing * 8.0), 0.0, 0.0),
            }, {'pelvis': (0.0, 0.0, abs(math.sin(phase * 2.0)) * 0.012)})
        else:
            direction = -1.0 if backward else 1.0
            pose_key(arm, frame, {
                'thigh_L': (math.radians(swing * 18.0 * direction), 0.0, 0.0),
                'thigh_R': (math.radians(-swing * 18.0 * direction), 0.0, 0.0),
                'shin_L': (math.radians(max(0.0, -swing) * 24.0), 0.0, 0.0),
                'shin_R': (math.radians(max(0.0, swing) * 24.0), 0.0, 0.0),
                'upper_arm_L': (math.radians(-swing * 13.0 * direction), 0.0, 0.0),
                'upper_arm_R': (math.radians(swing * 13.0 * direction), 0.0, 0.0),
            }, {'pelvis': (0.0, 0.0, abs(math.sin(phase * 2.0)) * 0.012)})
    finalize_action(action)
    return action


def build_actions(arm):
    actions = [
        create_idle(arm),
        create_gait(arm, 'Walk', 31, 24.0, 18.0, 30.0, 0.014, 1.6, 4.0),
        create_gait(arm, 'Jog', 25, 34.0, 28.0, 46.0, 0.025, 5.0, 6.0),
        create_gait(arm, 'Run', 19, 46.0, 42.0, 68.0, 0.042, 10.0, 8.0),
        create_directional_action(arm, 'WalkBack', 31, backward=True),
        create_directional_action(arm, 'StrafeLeft', 29, side=-1.0),
        create_directional_action(arm, 'StrafeRight', 29, side=1.0),
        create_directional_action(arm, 'PivotLeft', 25, pivot=-1.0),
        create_directional_action(arm, 'PivotRight', 25, pivot=1.0),
    ]
    arm.animation_data.action = None
    return actions


def export_glb(output):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 73
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format='GLB',
        use_selection=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_skins=True,
        export_def_bones=True,
        export_materials='EXPORT',
        export_apply=False,
    )


def main():
    parsed = parse_args()
    clear_scene()
    arm = make_rig()
    build_character(arm)
    actions = build_actions(arm)
    if len(actions) < 9:
        raise RuntimeError('KINEMA expected at least nine animation actions.')
    export_glb(parsed.output)
    print(f'KINEMA exported {len(actions)} animation actions to {parsed.output}')


if __name__ == '__main__':
    main()
