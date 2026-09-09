"""Blender 5.2 production entrypoint for KINEMA v1.5.

The stable armature/action/export code remains in character.py. This production
pass replaces the wide mannequin rest pose with a relaxed human rig, then builds
higher-section clothed limbs around it: fuller thighs, narrow knees, shaped
calves, close-hanging arms, compact shoes and a less helmet-like haircut.
"""

import importlib.util
from pathlib import Path

import bpy


SCRIPT = Path(__file__).with_name('character.py')
spec = importlib.util.spec_from_file_location('kinema_character_source', SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f'Unable to load KINEMA character source: {SCRIPT}')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.finalize_action = lambda action: None


def make_rig_v15():
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
        bone(f'clavicle_{side}', (0.032 * sign, 0.0, 1.43), (0.202 * sign, 0.0, 1.405), 'chest')
        bone(f'upper_arm_{side}', (0.202 * sign, 0.0, 1.405), (0.255 * sign, -0.006, 1.165), f'clavicle_{side}')
        bone(f'forearm_{side}', (0.255 * sign, -0.006, 1.165), (0.268 * sign, -0.022, 0.920), f'upper_arm_{side}', True)
        bone(f'hand_{side}', (0.268 * sign, -0.022, 0.920), (0.273 * sign, -0.032, 0.780), f'forearm_{side}', True)
        bone(f'thigh_{side}', (0.088 * sign, 0.0, 0.91), (0.098 * sign, 0.0, 0.52), 'pelvis')
        bone(f'shin_{side}', (0.098 * sign, 0.0, 0.52), (0.094 * sign, -0.006, 0.14), f'thigh_{side}', True)
        bone(f'foot_{side}', (0.094 * sign, -0.006, 0.14), (0.094 * sign, -0.190, 0.085), f'shin_{side}', True)

    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def build_character_v15(arm):
    skin = module.material('Skin', (0.60, 0.39, 0.275), 0.62, seed=5, grain=0.013)
    hair = module.material('Hair', (0.036, 0.030, 0.027), 0.84, seed=8, grain=0.022)
    jacket = module.material('Olive_Canvas', (0.205, 0.285, 0.235), 0.90, seed=12, weave=0.008, grain=0.014)
    jacket_dark = module.material('Canvas_Seams', (0.125, 0.165, 0.142), 0.92, seed=13, weave=0.006, grain=0.012)
    shirt = module.material('Cotton_Shirt', (0.61, 0.57, 0.50), 0.94, seed=17, weave=0.008, grain=0.010)
    pants = module.material('Charcoal_Twill', (0.075, 0.082, 0.080), 0.94, seed=22, weave=0.006, grain=0.012)
    pants_detail = module.plain_material('Trouser_Seams', (0.055, 0.060, 0.059), 0.96)
    leather = module.material('Boot_Leather', (0.073, 0.045, 0.033), 0.72, seed=28, grain=0.020)
    rubber = module.plain_material('Rubber_Sole', (0.024, 0.023, 0.022), 0.97)
    metal = module.plain_material('Hardware', (0.18, 0.18, 0.17), 0.34, 0.68)
    eye = module.plain_material('Eyes', (0.050, 0.044, 0.039), 0.52)
    lip = module.plain_material('Lip', (0.285, 0.145, 0.125), 0.72)

    module.torso_shell('Trouser_Hips', [
        (0.80, 0.137, 0.094, {'pelvis': 1.0}),
        (0.85, 0.151, 0.100, {'pelvis': 1.0}),
        (0.90, 0.160, 0.105, {'pelvis': 0.98, 'spine': 0.02}),
        (0.95, 0.164, 0.107, {'pelvis': 0.92, 'spine': 0.08}),
        (0.99, 0.155, 0.101, {'pelvis': 0.78, 'spine': 0.22}),
        (1.015, 0.146, 0.096, {'pelvis': 0.68, 'spine': 0.32}),
    ], pants, arm, 44)

    module.torso_shell('Field_Jacket', [
        (0.995, 0.148, 0.100, {'pelvis': 0.48, 'spine': 0.52}),
        (1.06, 0.154, 0.104, {'spine': 0.92, 'pelvis': 0.08}),
        (1.13, 0.162, 0.108, {'spine': 0.86, 'chest': 0.14}),
        (1.20, 0.173, 0.113, {'spine': 0.70, 'chest': 0.30}),
        (1.27, 0.184, 0.117, {'spine': 0.48, 'chest': 0.52}),
        (1.34, 0.198, 0.121, {'chest': 0.82, 'spine': 0.18}),
        (1.40, 0.207, 0.122, {'chest': 1.0}),
        (1.45, 0.194, 0.114, {'chest': 1.0}),
        (1.485, 0.145, 0.098, {'chest': 1.0}),
    ], jacket, arm, 48)

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        module.rigid_bind(
            module.ellipsoid(f'Shoulder_{side}', (0.198 * sign, 0.002, 1.386), (0.058, 0.055, 0.078), jacket, 30, 20),
            arm,
            f'clavicle_{side}',
        )
        module.tube_chain(f'Jacket_Sleeve_{side}', [
            (0.202 * sign, 0.000, 1.390),
            (0.219 * sign, -0.001, 1.330),
            (0.233 * sign, -0.003, 1.270),
            (0.244 * sign, -0.006, 1.205),
            (0.254 * sign, -0.010, 1.145),
            (0.260 * sign, -0.014, 1.080),
            (0.264 * sign, -0.018, 1.015),
            (0.267 * sign, -0.021, 0.950),
            (0.269 * sign, -0.024, 0.885),
        ], [
            (0.060, 0.056), (0.059, 0.055), (0.057, 0.053),
            (0.054, 0.051), (0.051, 0.048), (0.049, 0.046),
            (0.046, 0.043), (0.043, 0.040), (0.040, 0.038),
        ], [
            {f'clavicle_{side}': 0.58, f'upper_arm_{side}': 0.42},
            {f'upper_arm_{side}': 1.0}, {f'upper_arm_{side}': 1.0}, {f'upper_arm_{side}': 1.0},
            {f'upper_arm_{side}': 0.62, f'forearm_{side}': 0.38},
            {f'upper_arm_{side}': 0.24, f'forearm_{side}': 0.76},
            {f'forearm_{side}': 1.0}, {f'forearm_{side}': 1.0}, {f'forearm_{side}': 1.0},
        ], jacket, arm, 30)
        module.rigid_bind(module.ellipsoid(f'Hand_{side}', (0.272 * sign, -0.030, 0.835), (0.037, 0.030, 0.064), skin, 26, 18), arm, f'hand_{side}')
        module.rigid_bind(module.ellipsoid(f'Thumb_{side}', (0.247 * sign, -0.047, 0.840), (0.012, 0.014, 0.028), skin, 16, 10, (0.0, 0.24 * sign, 0.12 * sign)), arm, f'hand_{side}')

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        module.tube_chain(f'Trouser_Leg_{side}', [
            (0.086 * sign, 0.000, 0.905),
            (0.089 * sign, 0.000, 0.825),
            (0.092 * sign, 0.000, 0.735),
            (0.096 * sign, 0.000, 0.635),
            (0.098 * sign, 0.000, 0.550),
            (0.098 * sign, -0.001, 0.500),
            (0.097 * sign, -0.002, 0.440),
            (0.096 * sign, -0.004, 0.365),
            (0.095 * sign, -0.006, 0.285),
            (0.094 * sign, -0.008, 0.205),
            (0.094 * sign, -0.009, 0.150),
        ], [
            (0.080, 0.074), (0.079, 0.073), (0.076, 0.070), (0.071, 0.066),
            (0.060, 0.057), (0.055, 0.053),
            (0.060, 0.057), (0.064, 0.060), (0.061, 0.057),
            (0.053, 0.050), (0.046, 0.044),
        ], [
            {f'thigh_{side}': 1.0}, {f'thigh_{side}': 1.0}, {f'thigh_{side}': 1.0}, {f'thigh_{side}': 1.0},
            {f'thigh_{side}': 0.62, f'shin_{side}': 0.38},
            {f'thigh_{side}': 0.42, f'shin_{side}': 0.58},
            {f'shin_{side}': 1.0}, {f'shin_{side}': 1.0}, {f'shin_{side}': 1.0}, {f'shin_{side}': 1.0}, {f'shin_{side}': 1.0},
        ], pants, arm, 30)
        module.rigid_bind(module.soft_box(f'Cargo_Pocket_{side}', (0.135 * sign, -0.056, 0.690), (0.037, 0.011, 0.052), pants_detail, 0.010), arm, f'thigh_{side}')
        module.rigid_bind(module.ellipsoid(f'Boot_Ankle_{side}', (0.094 * sign, -0.008, 0.142), (0.050, 0.051, 0.070), leather, 24, 16), arm, f'shin_{side}')
        module.rigid_bind(module.soft_box(f'Boot_Upper_{side}', (0.094 * sign, -0.055, 0.082), (0.057, 0.080, 0.043), leather, 0.030), arm, f'foot_{side}')
        module.rigid_bind(module.soft_box(f'Boot_Toe_{side}', (0.094 * sign, -0.117, 0.064), (0.061, 0.060, 0.034), leather, 0.030), arm, f'foot_{side}')
        module.rigid_bind(module.ellipsoid(f'Boot_Sole_{side}', (0.094 * sign, -0.077, 0.027), (0.063, 0.102, 0.015), rubber, 24, 12), arm, f'foot_{side}')

    module.rigid_bind(module.ellipsoid('Shirt_Neckline', (0.0, -0.008, 1.466), (0.084, 0.072, 0.045), shirt, 28, 18), arm, 'chest')
    module.rigid_bind(module.soft_box('Zipper', (0.0, -0.115, 1.266), (0.0035, 0.0035, 0.192), metal, 0.003), arm, 'chest')
    for sign in (-1.0, 1.0):
        module.rigid_bind(module.soft_box(f'Chest_Pocket_{sign:+.0f}', (0.098 * sign, -0.109, 1.310), (0.036, 0.008, 0.041), jacket_dark, 0.009), arm, 'chest')
    module.rigid_bind(module.soft_box('Collar_L', (-0.049, -0.070, 1.476), (0.047, 0.020, 0.018), jacket, 0.010, (0.0, 0.0, -0.15)), arm, 'chest')
    module.rigid_bind(module.soft_box('Collar_R', (0.049, -0.070, 1.476), (0.047, 0.020, 0.018), jacket, 0.010, (0.0, 0.0, 0.15)), arm, 'chest')
    module.rigid_bind(module.soft_box('Waistband', (0.0, -0.004, 0.998), (0.143, 0.096, 0.010), jacket_dark, 0.008), arm, 'pelvis')

    module.rigid_bind(module.ellipsoid('Neck', (0.0, 0.003, 1.535), (0.052, 0.048, 0.086), skin, 28, 18), arm, 'neck')
    module.rigid_bind(module.ellipsoid('Head_Cranium', (0.0, 0.005, 1.690), (0.090, 0.080, 0.128), skin, 38, 28), arm, 'head')
    module.rigid_bind(module.ellipsoid('Jaw', (0.0, -0.007, 1.620), (0.074, 0.068, 0.076), skin, 34, 24), arm, 'head')
    module.rigid_bind(module.ellipsoid('Chin', (0.0, -0.042, 1.586), (0.040, 0.035, 0.032), skin, 22, 14), arm, 'head')
    for sign in (-1.0, 1.0):
        module.rigid_bind(module.ellipsoid(f'Ear_{sign:+.0f}', (0.088 * sign, 0.005, 1.657), (0.012, 0.010, 0.024), skin, 18, 12), arm, 'head')
        module.rigid_bind(module.ellipsoid(f'Eye_{sign:+.0f}', (0.030 * sign, -0.079, 1.680), (0.0070, 0.0035, 0.0048), eye, 16, 10), arm, 'head')
        module.rigid_bind(module.cylinder_between(f'Brow_{sign:+.0f}', (0.013 * sign, -0.081, 1.705), (0.046 * sign, -0.080, 1.708), 0.0027, hair, 10), arm, 'head')
    module.rigid_bind(module.ellipsoid('Nose_Bridge', (0.0, -0.075, 1.664), (0.009, 0.012, 0.028), skin, 18, 12), arm, 'head')
    module.rigid_bind(module.ellipsoid('Nose_Tip', (0.0, -0.087, 1.644), (0.013, 0.014, 0.015), skin, 18, 12), arm, 'head')
    module.rigid_bind(module.ellipsoid('Lower_Lip', (0.0, -0.078, 1.614), (0.019, 0.0035, 0.0035), lip, 16, 10), arm, 'head')

    module.rigid_bind(module.ellipsoid('Hair_Crown', (0.0, 0.014, 1.782), (0.089, 0.078, 0.043), hair, 34, 22), arm, 'head')
    module.rigid_bind(module.ellipsoid('Hair_Back', (0.0, 0.057, 1.742), (0.078, 0.033, 0.067), hair, 28, 18), arm, 'head')
    for idx, (x, y, z, sx, sy, sz) in enumerate([
        (-0.047, -0.046, 1.772, 0.027, 0.023, 0.027),
        (-0.016, -0.052, 1.782, 0.031, 0.022, 0.030),
        (0.017, -0.052, 1.780, 0.031, 0.022, 0.029),
        (0.048, -0.043, 1.767, 0.026, 0.023, 0.025),
    ]):
        module.rigid_bind(module.ellipsoid(f'Hair_Front_{idx}', (x, y, z), (sx, sy, sz), hair, 18, 12), arm, 'head')

    module.rigid_bind(module.ellipsoid('Watch_Strap', (-0.266, -0.020, 0.938), (0.033, 0.034, 0.010), leather, 18, 12), arm, 'forearm_L')
    module.rigid_bind(module.soft_box('Watch_Face', (-0.266, -0.052, 0.940), (0.013, 0.005, 0.016), metal, 0.004), arm, 'forearm_L')


module.make_rig = make_rig_v15
module.build_character = build_character_v15
module.main()
