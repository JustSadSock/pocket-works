"""Blender 5.2 production entrypoint for KINEMA v1.4.

This pass keeps the reliable skinned tube/shell topology from the stable build,
but rebuilds the visible human silhouette around finer anatomical sections,
soft shoulder transitions, narrower limbs, compact footwear and restrained
facial details. The source module continues to own rig/actions/export.
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


def build_character_v14(arm):
    skin = module.material('Skin', (0.56, 0.355, 0.245), 0.61, seed=5, grain=0.014)
    hair = module.material('Hair', (0.038, 0.031, 0.028), 0.82, seed=8, grain=0.024)
    jacket = module.material('Olive_Canvas', (0.205, 0.285, 0.235), 0.90, seed=12, weave=0.008, grain=0.014)
    jacket_dark = module.material('Canvas_Seams', (0.125, 0.165, 0.142), 0.92, seed=13, weave=0.006, grain=0.012)
    shirt = module.material('Cotton_Shirt', (0.61, 0.57, 0.50), 0.94, seed=17, weave=0.008, grain=0.010)
    pants = module.material('Charcoal_Twill', (0.075, 0.082, 0.080), 0.94, seed=22, weave=0.006, grain=0.012)
    leather = module.material('Boot_Leather', (0.073, 0.045, 0.033), 0.70, seed=28, grain=0.022)
    rubber = module.plain_material('Rubber_Sole', (0.024, 0.023, 0.022), 0.97)
    metal = module.plain_material('Hardware', (0.18, 0.18, 0.17), 0.34, 0.68)
    eye = module.plain_material('Eyes', (0.055, 0.048, 0.042), 0.50)
    lip = module.plain_material('Lip', (0.285, 0.145, 0.125), 0.70)

    module.torso_shell('Trouser_Hips', [
        (0.80, 0.142, 0.096, {'pelvis': 1.0}),
        (0.86, 0.156, 0.102, {'pelvis': 1.0}),
        (0.92, 0.166, 0.108, {'pelvis': 0.96, 'spine': 0.04}),
        (0.98, 0.160, 0.105, {'pelvis': 0.82, 'spine': 0.18}),
        (1.01, 0.150, 0.098, {'pelvis': 0.70, 'spine': 0.30}),
    ], pants, arm, 40)

    module.torso_shell('Field_Jacket', [
        (1.00, 0.158, 0.104, {'pelvis': 0.50, 'spine': 0.50}),
        (1.07, 0.166, 0.108, {'spine': 0.90, 'pelvis': 0.10}),
        (1.16, 0.175, 0.114, {'spine': 0.78, 'chest': 0.22}),
        (1.25, 0.188, 0.120, {'spine': 0.52, 'chest': 0.48}),
        (1.34, 0.205, 0.126, {'chest': 0.82, 'spine': 0.18}),
        (1.41, 0.218, 0.128, {'chest': 1.0}),
        (1.46, 0.202, 0.120, {'chest': 1.0}),
        (1.49, 0.150, 0.104, {'chest': 1.0}),
    ], jacket, arm, 44)

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        shoulder = module.ellipsoid(f'Shoulder_{side}', (0.205 * sign, 0.002, 1.390), (0.070, 0.064, 0.090), jacket, 28, 18)
        module.rigid_bind(shoulder, arm, f'clavicle_{side}')

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        module.tube_chain(f'Jacket_Sleeve_{side}', [
            (0.214 * sign, 0.000, 1.395),
            (0.238 * sign, -0.002, 1.335),
            (0.263 * sign, -0.006, 1.270),
            (0.288 * sign, -0.010, 1.200),
            (0.316 * sign, -0.016, 1.120),
            (0.333 * sign, -0.023, 1.035),
            (0.344 * sign, -0.029, 0.945),
            (0.351 * sign, -0.034, 0.865),
        ], [
            (0.066, 0.061), (0.064, 0.059), (0.061, 0.057), (0.058, 0.054),
            (0.055, 0.052), (0.051, 0.048), (0.047, 0.044), (0.043, 0.041),
        ], [
            {f'clavicle_{side}': 0.55, f'upper_arm_{side}': 0.45},
            {f'upper_arm_{side}': 1.0}, {f'upper_arm_{side}': 1.0}, {f'upper_arm_{side}': 1.0},
            {f'upper_arm_{side}': 0.52, f'forearm_{side}': 0.48},
            {f'forearm_{side}': 1.0}, {f'forearm_{side}': 1.0}, {f'forearm_{side}': 1.0},
        ], jacket, arm, 28)

        module.rigid_bind(module.ellipsoid(f'Hand_{side}', (0.358 * sign, -0.040, 0.790), (0.042, 0.034, 0.070), skin, 24, 16), arm, f'hand_{side}')
        module.rigid_bind(module.ellipsoid(f'Thumb_{side}', (0.329 * sign, -0.059, 0.798), (0.014, 0.016, 0.032), skin, 16, 10, (0.0, 0.28 * sign, 0.14 * sign)), arm, f'hand_{side}')

    for side, sign in [('L', -1.0), ('R', 1.0)]:
        module.tube_chain(f'Trouser_Leg_{side}', [
            (0.087 * sign, 0.000, 0.900),
            (0.090 * sign, 0.000, 0.790),
            (0.093 * sign, 0.000, 0.670),
            (0.096 * sign, 0.000, 0.535),
            (0.096 * sign, -0.002, 0.410),
            (0.095 * sign, -0.005, 0.280),
            (0.094 * sign, -0.008, 0.160),
        ], [
            (0.083, 0.078), (0.080, 0.075), (0.076, 0.071), (0.068, 0.064),
            (0.061, 0.058), (0.056, 0.053), (0.051, 0.049),
        ], [
            {f'thigh_{side}': 1.0}, {f'thigh_{side}': 1.0}, {f'thigh_{side}': 1.0},
            {f'thigh_{side}': 0.48, f'shin_{side}': 0.52},
            {f'shin_{side}': 1.0}, {f'shin_{side}': 1.0}, {f'shin_{side}': 1.0},
        ], pants, arm, 28)

        module.rigid_bind(module.ellipsoid(f'Boot_Ankle_{side}', (0.094 * sign, -0.010, 0.145), (0.056, 0.058, 0.080), leather, 24, 16), arm, f'shin_{side}')
        module.rigid_bind(module.soft_box(f'Boot_Upper_{side}', (0.094 * sign, -0.070, 0.084), (0.064, 0.102, 0.048), leather, 0.035), arm, f'foot_{side}')
        module.rigid_bind(module.soft_box(f'Boot_Toe_{side}', (0.094 * sign, -0.145, 0.066), (0.068, 0.074, 0.038), leather, 0.034), arm, f'foot_{side}')
        module.rigid_bind(module.ellipsoid(f'Boot_Sole_{side}', (0.094 * sign, -0.093, 0.028), (0.070, 0.128, 0.017), rubber, 24, 12), arm, f'foot_{side}')

    module.rigid_bind(module.ellipsoid('Shirt_Neckline', (0.0, -0.010, 1.468), (0.090, 0.078, 0.050), shirt, 28, 18), arm, 'chest')
    module.rigid_bind(module.soft_box('Zipper', (0.0, -0.120, 1.270), (0.004, 0.004, 0.198), metal, 0.003), arm, 'chest')
    for sign in (-1.0, 1.0):
        module.rigid_bind(module.soft_box(f'Chest_Pocket_{sign:+.0f}', (0.102 * sign, -0.114, 1.315), (0.040, 0.009, 0.045), jacket_dark, 0.010), arm, 'chest')
    module.rigid_bind(module.soft_box('Collar_L', (-0.052, -0.075, 1.480), (0.052, 0.022, 0.020), jacket, 0.011, (0.0, 0.0, -0.16)), arm, 'chest')
    module.rigid_bind(module.soft_box('Collar_R', (0.052, -0.075, 1.480), (0.052, 0.022, 0.020), jacket, 0.011, (0.0, 0.0, 0.16)), arm, 'chest')
    module.rigid_bind(module.soft_box('Waistband', (0.0, -0.006, 0.998), (0.150, 0.104, 0.012), jacket_dark, 0.010), arm, 'pelvis')

    module.rigid_bind(module.ellipsoid('Neck', (0.0, 0.003, 1.535), (0.055, 0.051, 0.090), skin, 28, 18), arm, 'neck')
    module.rigid_bind(module.ellipsoid('Head_Cranium', (0.0, 0.004, 1.690), (0.094, 0.084, 0.132), skin, 36, 26), arm, 'head')
    module.rigid_bind(module.ellipsoid('Jaw', (0.0, -0.008, 1.620), (0.078, 0.072, 0.080), skin, 32, 22), arm, 'head')
    for sign in (-1.0, 1.0):
        module.rigid_bind(module.ellipsoid(f'Ear_{sign:+.0f}', (0.092 * sign, 0.004, 1.657), (0.014, 0.012, 0.026), skin, 18, 12), arm, 'head')
        module.rigid_bind(module.ellipsoid(f'Eye_{sign:+.0f}', (0.032 * sign, -0.082, 1.681), (0.008, 0.004, 0.0055), eye, 16, 10), arm, 'head')
        module.rigid_bind(module.cylinder_between(f'Brow_{sign:+.0f}', (0.014 * sign, -0.084, 1.707), (0.049 * sign, -0.083, 1.710), 0.0030, hair, 10), arm, 'head')
    module.rigid_bind(module.ellipsoid('Nose', (0.0, -0.087, 1.650), (0.014, 0.018, 0.028), skin, 18, 12), arm, 'head')
    module.rigid_bind(module.ellipsoid('Lower_Lip', (0.0, -0.080, 1.615), (0.021, 0.004, 0.004), lip, 16, 10), arm, 'head')

    module.rigid_bind(module.ellipsoid('Hair_Cap', (0.0, 0.012, 1.782), (0.100, 0.087, 0.050), hair, 32, 20), arm, 'head')
    for idx, (x, y, z, sx, sy, sz) in enumerate([
        (-0.052, -0.052, 1.773, 0.032, 0.028, 0.030),
        (-0.018, -0.060, 1.782, 0.036, 0.026, 0.034),
        (0.020, -0.060, 1.780, 0.036, 0.026, 0.032),
        (0.052, -0.048, 1.768, 0.030, 0.028, 0.028),
    ]):
        module.rigid_bind(module.ellipsoid(f'Hair_Front_{idx}', (x, y, z), (sx, sy, sz), hair, 18, 12), arm, 'head')

    module.rigid_bind(module.ellipsoid('Watch_Strap', (-0.346, -0.031, 0.900), (0.041, 0.042, 0.012), leather, 18, 12), arm, 'forearm_L')
    module.rigid_bind(module.soft_box('Watch_Face', (-0.346, -0.071, 0.902), (0.015, 0.006, 0.018), metal, 0.005), arm, 'forearm_L')


module.build_character = build_character_v14
module.main()
