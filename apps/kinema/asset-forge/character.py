import argparse
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for bank in (bpy.data.meshes, bpy.data.curves, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.actions):
        for block in list(bank):
            if block.users == 0:
                bank.remove(block)


def textured_material(name, base, roughness, metallic=0.0, seed=1, weave=0.0):
    random.seed(seed)
    size = 48
    image = bpy.data.images.new(f'{name}_Albedo', width=size, height=size, alpha=True)
    pixels = []
    for y in range(size):
        for x in range(size):
            grain = (random.random() - 0.5) * 0.075
            thread = weave * (0.5 * math.sin(x * math.pi * 0.5) + 0.5 * math.sin(y * math.pi * 0.5))
            shade = grain + thread
            pixels.extend((
                max(0, min(1, base[0] + shade)),
                max(0, min(1, base[1] + shade)),
                max(0, min(1, base[2] + shade)),
                1.0
            ))
    image.pixels = pixels
    image.pack()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*base, 1)
    mat.roughness = roughness
    mat.metallic = metallic
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    principled = nodes.get('Principled BSDF')
    tex = nodes.new('ShaderNodeTexImage')
    tex.name = f'{name}_Texture'
    tex.image = image
    tex.interpolation = 'Linear'
    links.new(tex.outputs['Color'], principled.inputs['Base Color'])
    principled.inputs['Roughness'].default_value = roughness
    principled.inputs['Metallic'].default_value = metallic
    return mat


def plain_material(name, color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    mat.roughness = roughness
    mat.metallic = metallic
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return mat


def finish(obj, mat, smooth=True, bevel=0.0):
    obj.data.materials.append(mat)
    if smooth and hasattr(obj.data, 'polygons'):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if bevel > 0:
        mod = obj.modifiers.new('Micro bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
    return obj


def ellipsoid(name, loc, scale, mat, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, True)


def box(name, loc, scale, mat, bevel=0.025, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, False, bevel)


def cylinder(name, loc, radius, depth, mat, vertices=20, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, True)


def tapered(name, a, b, r1, r2, mat, vertices=18):
    a, b = Vector(a), Vector(b)
    direction = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=direction.length, location=(a + b) * 0.5)
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
    arm.show_in_front = False
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None, connected=False):
        b = arm_data.edit_bones.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
            b.use_connect = connected
        return b

    bone('root', (0, 0, 0.02), (0, 0, 0.17))
    bone('pelvis', (0, 0, 0.84), (0, 0, 1.00), 'root')
    bone('spine', (0, 0, 0.96), (0, 0, 1.22), 'pelvis')
    bone('chest', (0, 0, 1.18), (0, 0, 1.45), 'spine')
    bone('neck', (0, 0, 1.43), (0, 0, 1.56), 'chest')
    bone('head', (0, 0, 1.55), (0, -0.01, 1.79), 'neck')
    for side, x in [('L', -1), ('R', 1)]:
        sx = 0.105 * x
        bone(f'thigh_{side}', (sx, 0, 0.89), (0.12 * x, 0, 0.51), 'pelvis')
        bone(f'shin_{side}', (0.12 * x, 0, 0.51), (0.115 * x, -0.005, 0.13), f'thigh_{side}', True)
        bone(f'foot_{side}', (0.115 * x, -0.005, 0.13), (0.115 * x, -0.24, 0.095), f'shin_{side}', True)
        bone(f'upper_arm_{side}', (0.20 * x, 0, 1.40), (0.48 * x, 0, 1.25), 'chest')
        bone(f'forearm_{side}', (0.48 * x, 0, 1.25), (0.68 * x, -0.005, 1.07), f'upper_arm_{side}', True)
        bone(f'hand_{side}', (0.68 * x, -0.005, 1.07), (0.73 * x, -0.015, 0.98), f'forearm_{side}', True)
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def attach(obj, arm, bone_name):
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    return obj


def build_character(arm):
    skin = textured_material('Skin', (0.63, 0.43, 0.31), 0.54, seed=5, weave=0.0)
    hair = textured_material('Hair', (0.075, 0.055, 0.043), 0.72, seed=8)
    jacket = textured_material('Sage_Jacket', (0.25, 0.34, 0.27), 0.82, seed=12, weave=0.018)
    jacket_dark = textured_material('Jacket_Seams', (0.16, 0.22, 0.18), 0.86, seed=13, weave=0.012)
    shirt = textured_material('Cotton_Shirt', (0.62, 0.57, 0.48), 0.9, seed=17, weave=0.025)
    pants = textured_material('Charcoal_Trousers', (0.105, 0.115, 0.11), 0.91, seed=22, weave=0.018)
    leather = textured_material('Boot_Leather', (0.105, 0.065, 0.045), 0.64, seed=28)
    sole = plain_material('Rubber_Sole', (0.035, 0.032, 0.03), 0.92)
    eye_white = plain_material('Eyes', (0.76, 0.72, 0.66), 0.42)
    iris = plain_material('Iris', (0.12, 0.20, 0.16), 0.34)
    metal = plain_material('Hardware', (0.18, 0.17, 0.15), 0.31, 0.7)

    # Pelvis, shirt and layered field jacket.
    attach(ellipsoid('Pelvis volume', (0, 0, 0.93), (0.205, 0.145, 0.18), pants), arm, 'pelvis')
    attach(box('Shirt torso', (0, 0.015, 1.29), (0.205, 0.125, 0.245), shirt, 0.055), arm, 'chest')
    attach(box('Jacket back', (0, 0.055, 1.31), (0.235, 0.075, 0.27), jacket, 0.045), arm, 'chest')
    attach(box('Jacket left panel', (-0.115, -0.075, 1.31), (0.115, 0.055, 0.265), jacket, 0.035), arm, 'chest')
    attach(box('Jacket right panel', (0.115, -0.075, 1.31), (0.115, 0.055, 0.265), jacket, 0.035), arm, 'chest')
    attach(box('Jacket hem', (0, -0.005, 1.055), (0.235, 0.14, 0.025), jacket_dark, 0.015), arm, 'spine')
    attach(box('Zipper', (0, -0.137, 1.30), (0.008, 0.006, 0.225), metal, 0.002), arm, 'chest')
    for x in (-0.15, 0.15):
        attach(box('Chest pocket', (x, -0.142, 1.36), (0.066, 0.014, 0.07), jacket_dark, 0.008), arm, 'chest')
        attach(box('Pocket flap', (x, -0.16, 1.425), (0.073, 0.013, 0.018), jacket, 0.006), arm, 'chest')
    attach(box('Collar L', (-0.075, -0.105, 1.505), (0.075, 0.045, 0.035), jacket, 0.012, (0, 0, -0.25)), arm, 'chest')
    attach(box('Collar R', (0.075, -0.105, 1.505), (0.075, 0.045, 0.035), jacket, 0.012, (0, 0, 0.25)), arm, 'chest')
    attach(cylinder('Belt', (0, 0, 1.00), 0.215, 0.05, leather, 28), arm, 'pelvis')
    attach(box('Belt buckle', (0, -0.19, 1.00), (0.038, 0.012, 0.032), metal, 0.005), arm, 'pelvis')

    # Legs, cargo pockets and articulated boots.
    for side, sx in [('L', -1), ('R', 1)]:
        attach(tapered(f'Trouser thigh {side}', (0.115*sx, 0, 0.90), (0.12*sx, 0, 0.52), 0.125, 0.105, pants), arm, f'thigh_{side}')
        attach(tapered(f'Trouser shin {side}', (0.12*sx, 0, 0.53), (0.115*sx, 0, 0.16), 0.108, 0.082, pants), arm, f'shin_{side}')
        attach(box(f'Cargo pocket {side}', (0.155*sx, -0.088, 0.66), (0.067, 0.025, 0.09), pants, 0.012), arm, f'thigh_{side}')
        attach(box(f'Knee seam {side}', (0.12*sx, -0.102, 0.52), (0.085, 0.012, 0.018), jacket_dark, 0.004), arm, f'shin_{side}')
        attach(ellipsoid(f'Boot ankle {side}', (0.115*sx, -0.005, 0.14), (0.095, 0.10, 0.115), leather), arm, f'shin_{side}')
        attach(box(f'Boot body {side}', (0.115*sx, -0.095, 0.075), (0.105, 0.18, 0.07), leather, 0.025), arm, f'foot_{side}')
        attach(box(f'Boot sole {side}', (0.115*sx, -0.105, 0.025), (0.112, 0.19, 0.025), sole, 0.012), arm, f'foot_{side}')
        for i in range(4):
            attach(box(f'Boot lace {side} {i}', (0.115*sx, -0.235 + i*0.04, 0.125), (0.07, 0.008, 0.006), jacket_dark, 0.002), arm, f'foot_{side}')

    # Sleeves, hands and watch.
    for side, sx in [('L', -1), ('R', 1)]:
        attach(tapered(f'Upper sleeve {side}', (0.20*sx, 0, 1.42), (0.47*sx, 0, 1.25), 0.12, 0.10, jacket), arm, f'upper_arm_{side}')
        attach(ellipsoid(f'Elbow {side}', (0.48*sx, 0, 1.245), (0.105, 0.10, 0.105), jacket), arm, f'forearm_{side}')
        attach(tapered(f'Fore sleeve {side}', (0.49*sx, 0, 1.245), (0.675*sx, 0, 1.075), 0.098, 0.075, jacket), arm, f'forearm_{side}')
        attach(cylinder(f'Cuff {side}', (0.675*sx, 0, 1.075), 0.08, 0.055, jacket_dark, 20, (0, math.pi/2, 0)), arm, f'forearm_{side}')
        attach(ellipsoid(f'Hand {side}', (0.71*sx, -0.005, 1.015), (0.07, 0.052, 0.10), skin), arm, f'hand_{side}')
    attach(cylinder('Watch strap', (-0.675, -0.002, 1.075), 0.084, 0.028, leather, 20, (0, math.pi/2, 0)), arm, 'forearm_L')
    attach(box('Watch face', (-0.676, -0.075, 1.08), (0.025, 0.012, 0.032), metal, 0.004), arm, 'forearm_L')

    # Neck and expressive head detail.
    attach(cylinder('Neck', (0, 0, 1.535), 0.083, 0.145, skin, 22), arm, 'neck')
    attach(ellipsoid('Head', (0, 0, 1.69), (0.132, 0.115, 0.175), skin, 28, 20), arm, 'head')
    attach(ellipsoid('Jaw', (0, -0.018, 1.61), (0.112, 0.10, 0.095), skin, 24, 16), arm, 'head')
    attach(ellipsoid('Nose', (0, -0.116, 1.695), (0.026, 0.038, 0.045), skin, 16, 10), arm, 'head')
    for side, sx in [('L', -1), ('R', 1)]:
        attach(ellipsoid(f'Ear {side}', (0.132*sx, 0, 1.69), (0.027, 0.015, 0.048), skin, 14, 10), arm, 'head')
        attach(ellipsoid(f'Eye white {side}', (0.047*sx, -0.106, 1.724), (0.028, 0.012, 0.015), eye_white, 14, 8), arm, 'head')
        attach(ellipsoid(f'Iris {side}', (0.047*sx, -0.118, 1.724), (0.009, 0.005, 0.009), iris, 12, 8), arm, 'head')
        attach(box(f'Brow {side}', (0.047*sx, -0.115, 1.755), (0.035, 0.008, 0.007), hair, 0.003, (0, 0, -0.08*sx)), arm, 'head')
    attach(box('Mouth shadow', (0, -0.113, 1.625), (0.035, 0.005, 0.006), hair, 0.002), arm, 'head')

    # Overlapping hair clumps create a readable cut instead of a helmet sphere.
    hair_points = [
        (-0.08, -0.01, 1.845, .075, .085, .055), (0, -0.025, 1.862, .085, .085, .06),
        (0.08, -0.005, 1.845, .075, .08, .055), (-0.105, 0.025, 1.805, .055, .07, .08),
        (0.105, 0.025, 1.805, .055, .07, .08), (-0.055, 0.07, 1.83, .075, .06, .07),
        (0.055, 0.07, 1.83, .075, .06, .07), (0, 0.10, 1.80, .10, .045, .075)
    ]
    for i, (x, y, z, sx, sy, sz) in enumerate(hair_points):
        attach(ellipsoid(f'Hair clump {i}', (x, y, z), (sx, sy, sz), hair, 18, 12), arm, 'head')


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def pose_key(arm, frame, rotations=None, locations=None):
    rotations = rotations or {}
    locations = locations or {}
    for name, rot in rotations.items():
        pb = arm.pose.bones[name]
        pb.rotation_euler = rot
        pb.keyframe_insert('rotation_euler', frame=frame, group=name)
    for name, loc in locations.items():
        pb = arm.pose.bones[name]
        pb.location = loc
        pb.keyframe_insert('location', frame=frame, group=name)


def action(arm, name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    reset_pose(arm)
    return act


def idle_action(arm):
    action(arm, 'Idle')
    for frame, phase in [(1, 0), (25, math.pi/2), (49, math.pi), (73, 3*math.pi/2), (97, 2*math.pi)]:
        pose_key(arm, frame, {
            'spine': (0.008*math.sin(phase), 0, 0.006*math.sin(phase)),
            'chest': (-0.012*math.sin(phase), 0, -0.006*math.sin(phase)),
            'head': (0.006*math.sin(phase), 0, 0.012*math.sin(phase*0.5)),
            'upper_arm_L': (0.03, 0.015, -0.03), 'upper_arm_R': (0.03, -0.015, 0.03)
        }, {'chest': (0, 0, 0.007*(1-math.cos(phase)))})


def gait_action(arm, name, frames, hip, arm_swing, knee, bob, lean, reverse=False):
    action(arm, name)
    sign = -1 if reverse else 1
    for frame, phase in [(1, 0), (frames//4+1, math.pi/2), (frames//2+1, math.pi), (3*frames//4+1, 3*math.pi/2), (frames+1, 2*math.pi)]:
        s = math.sin(phase) * sign
        lift_l = max(0, math.sin(phase))
        lift_r = max(0, -math.sin(phase))
        pose_key(arm, frame, {
            'pelvis': (0, 0.018*math.sin(phase*2), 0.025*math.sin(phase)),
            'spine': (lean, 0, -0.018*math.sin(phase)),
            'chest': (-lean*0.35, 0, 0.025*math.sin(phase)),
            'head': (-lean*0.25, 0, -0.012*math.sin(phase)),
            'thigh_L': (hip*s, 0, 0.015),
            'thigh_R': (-hip*s, 0, -0.015),
            'shin_L': (-knee*lift_l, 0, 0),
            'shin_R': (-knee*lift_r, 0, 0),
            'foot_L': (0.20*lift_l - 0.08*(1-lift_l), 0, 0),
            'foot_R': (0.20*lift_r - 0.08*(1-lift_r), 0, 0),
            'upper_arm_L': (-arm_swing*s, 0.025, -0.05),
            'upper_arm_R': (arm_swing*s, -0.025, 0.05),
            'forearm_L': (-0.18 - abs(s)*0.18, 0, 0),
            'forearm_R': (-0.18 - abs(s)*0.18, 0, 0)
        }, {'pelvis': (0, 0, bob*(0.5-0.5*math.cos(phase*2)))})


def strafe_action(arm, name, direction):
    action(arm, name)
    frames = 34
    for frame, phase in [(1, 0), (9, math.pi/2), (18, math.pi), (26, 3*math.pi/2), (35, 2*math.pi)]:
        s = math.sin(phase)
        pose_key(arm, frame, {
            'pelvis': (0, 0, direction*0.06*s), 'spine': (0.02, 0, -direction*0.045),
            'thigh_L': (0.25*s, direction*0.06, 0), 'thigh_R': (-0.25*s, direction*0.06, 0),
            'upper_arm_L': (-0.28*s, 0, -0.04), 'upper_arm_R': (0.28*s, 0, 0.04)
        }, {'pelvis': (direction*0.012*s, 0, 0.012*(1-math.cos(phase*2)))})


def pivot_action(arm, name, direction):
    action(arm, name)
    for frame, phase in [(1, 0), (8, math.pi/2), (16, math.pi), (23, 3*math.pi/2), (31, 2*math.pi)]:
        s = math.sin(phase)
        pose_key(arm, frame, {
            'pelvis': (0, 0, direction*0.10*s), 'chest': (0, 0, -direction*0.12*s),
            'thigh_L': (0.18*s, 0, 0), 'thigh_R': (-0.18*s, 0, 0),
            'upper_arm_L': (-0.20*s, 0, 0), 'upper_arm_R': (0.20*s, 0, 0)
        })


def build_actions(arm):
    idle_action(arm)
    gait_action(arm, 'Walk', 34, 0.52, 0.43, 0.72, 0.022, 0.018)
    gait_action(arm, 'Jog', 28, 0.68, 0.63, 1.00, 0.043, 0.055)
    gait_action(arm, 'Run', 24, 0.84, 0.82, 1.22, 0.068, 0.105)
    gait_action(arm, 'WalkBack', 36, 0.42, 0.36, 0.62, 0.018, -0.012, reverse=True)
    strafe_action(arm, 'StrafeLeft', -1)
    strafe_action(arm, 'StrafeRight', 1)
    pivot_action(arm, 'PivotLeft', -1)
    pivot_action(arm, 'PivotRight', 1)
    arm.animation_data.action = bpy.data.actions['Idle']


def export_glb(output):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    requested = {
        'filepath': str(output), 'export_format': 'GLB', 'use_selection': False,
        'export_yup': True, 'export_apply': True, 'export_materials': 'EXPORT',
        'export_animations': True, 'export_animation_mode': 'ACTIONS',
        'export_force_sampling': True, 'export_bake_animation': True,
        'export_skins': True, 'export_def_bones': True,
        'export_image_format': 'AUTO', 'export_keep_originals': False
    }
    kwargs = {k: v for k, v in requested.items() if k in props}
    bpy.ops.export_scene.gltf(**kwargs)


def main():
    parsed = args()
    clear_scene()
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.context.scene.render.fps = 30
    rig = make_rig()
    build_character(rig)
    build_actions(rig)
    export_glb(parsed.output)
    print('KINEMA exported:', parsed.output)
    print('Actions:', ', '.join(action.name for action in bpy.data.actions))


if __name__ == '__main__':
    main()
