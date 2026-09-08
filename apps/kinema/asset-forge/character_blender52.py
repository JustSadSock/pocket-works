"""Blender 5.2 production entrypoint for the KINEMA character.

The authored source stays readable in character.py. This entrypoint handles the
Blender 5.2 layered-Action compatibility change and applies the v1.2 proportion
pass used by the production GLB: slimmer weighted limbs, a less boxy torso,
human-scale hands/feet and restrained facial features.
"""

import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).with_name('character.py')
spec = importlib.util.spec_from_file_location('kinema_character_source', SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f'Unable to load KINEMA character source: {SCRIPT}')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

# Blender 5.2 removed the legacy Action.fcurves facade. The pass in the source
# only changes interpolation handles, so skipping it does not alter authored
# poses, action ranges or skinning.
module.finalize_action = lambda action: None

_original_torso_shell = module.torso_shell
_original_tube_chain = module.tube_chain
_original_ellipsoid = module.ellipsoid
_original_soft_box = module.soft_box
_original_cylinder_between = module.cylinder_between


def torso_shell_v12(name, rings, mat, arm, segments=28):
    if name == 'Field_Jacket':
        # Human torso: narrow waist, readable chest/shoulders, much less barrel depth.
        tuned = []
        for z, rx, ry, weights in rings:
            if z >= 1.40:
                x_factor = 0.89
            elif z >= 1.18:
                x_factor = 0.91
            else:
                x_factor = 0.88
            tuned.append((z, rx * x_factor, ry * 0.73, weights))
        rings = tuned
    elif name == 'Trouser_Hips':
        rings = [(z, rx * 0.88, ry * 0.76, weights) for z, rx, ry, weights in rings]
    return _original_torso_shell(name, rings, mat, arm, segments)


def tube_chain_v12(name, points, radii, ring_weights, mat, arm, segments=18):
    if name.startswith('Jacket_Sleeve_'):
        # The old sleeves read as inflated cylinders. Keep the bones, shrink only girth.
        factors = (0.72, 0.72, 0.70, 0.68, 0.66)
        radii = [(rx * factors[min(i, 4)], ry * factors[min(i, 4)]) for i, (rx, ry) in enumerate(radii)]
    elif name.startswith('Trouser_Leg_'):
        factors = (0.76, 0.76, 0.78, 0.80, 0.82)
        radii = [(rx * factors[min(i, 4)], ry * factors[min(i, 4)]) for i, (rx, ry) in enumerate(radii)]
    return _original_tube_chain(name, points, radii, ring_weights, mat, arm, segments)


def ellipsoid_v12(name, loc, scale, mat, segments=28, rings=20, rotation=(0.0, 0.0, 0.0)):
    sx, sy, sz = scale
    if name.startswith('Hand_'):
        scale = (sx * 0.74, sy * 0.68, sz * 0.80)
    elif name.startswith('Thumb_'):
        scale = (sx * 0.72, sy * 0.72, sz * 0.76)
    elif name.startswith('Boot_Ankle_'):
        scale = (sx * 0.82, sy * 0.80, sz * 0.88)
    elif name == 'Neck':
        scale = (sx * 0.90, sy * 0.86, sz * 0.96)
    elif name == 'Head_Cranium':
        scale = (sx * 0.88, sy * 0.88, sz * 0.96)
    elif name == 'Jaw':
        scale = (sx * 0.86, sy * 0.86, sz * 0.93)
    elif name.startswith('Ear_'):
        scale = (sx * 0.78, sy * 0.78, sz * 0.82)
    elif name == 'Hair_Cap':
        scale = (sx * 0.88, sy * 0.84, sz * 0.82)
        loc = (loc[0], loc[1] + 0.004, loc[2] - 0.006)
    elif name.startswith('Hair_Front_'):
        scale = (sx * 0.74, sy * 0.72, sz * 0.72)
        loc = (loc[0], loc[1] + 0.012, loc[2] - 0.010)
    elif name.startswith('Eye_'):
        scale = (sx * 0.58, sy * 0.58, sz * 0.62)
        loc = (loc[0] * 0.92, loc[1] + 0.006, loc[2])
    elif name.startswith('Iris_'):
        scale = (sx * 0.56, sy * 0.60, sz * 0.56)
        loc = (loc[0] * 0.92, loc[1] + 0.004, loc[2])
    elif name == 'Nose':
        scale = (sx * 0.82, sy * 0.76, sz * 0.90)
        loc = (loc[0], loc[1] + 0.005, loc[2])
    elif name == 'Lower_Lip':
        scale = (sx * 0.70, sy * 0.68, sz * 0.72)
        loc = (loc[0], loc[1] + 0.004, loc[2])
    elif name == 'Shirt_Neckline':
        scale = (sx * 0.88, sy * 0.80, sz * 0.86)
    elif name == 'Watch_Strap':
        scale = (sx * 0.72, sy * 0.72, sz * 0.75)
    return _original_ellipsoid(name, loc, scale, mat, segments, rings, rotation)


def soft_box_v12(name, loc, scale, mat, bevel=0.025, rotation=(0.0, 0.0, 0.0)):
    sx, sy, sz = scale
    if name.startswith('Boot_Upper_'):
        scale = (sx * 0.78, sy * 0.72, sz * 0.90)
        loc = (loc[0], -0.075, loc[2] + 0.004)
    elif name.startswith('Boot_Toe_'):
        scale = (sx * 0.80, sy * 0.72, sz * 0.84)
        loc = (loc[0], -0.168, loc[2])
    elif name.startswith('Boot_Sole_'):
        scale = (sx * 0.78, sy * 0.75, sz * 0.80)
        loc = (loc[0], -0.112, loc[2] + 0.003)
    elif name.startswith('Chest_Pocket_'):
        scale = (sx * 0.80, sy * 0.82, sz * 0.82)
    elif name.startswith('Pocket_Flap_'):
        scale = (sx * 0.82, sy * 0.82, sz * 0.82)
    elif name == 'Belt_Buckle':
        scale = (sx * 0.82, sy * 0.86, sz * 0.82)
    elif name == 'Watch_Face':
        scale = (sx * 0.78, sy * 0.78, sz * 0.78)
    return _original_soft_box(name, loc, scale, mat, bevel, rotation)


def cylinder_between_v12(name, a, b, radius, mat, vertices=20):
    if name.startswith('Brow_'):
        center = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5)
        a = tuple(center[i] + (a[i] - center[i]) * 0.82 for i in range(3))
        b = tuple(center[i] + (b[i] - center[i]) * 0.82 for i in range(3))
        radius *= 0.72
    elif name.startswith('Boot_Lace_'):
        center_x = (a[0] + b[0]) * 0.5
        a = (center_x + (a[0] - center_x) * 0.72, a[1] + 0.018, a[2] - 0.004)
        b = (center_x + (b[0] - center_x) * 0.72, b[1] + 0.018, b[2] - 0.004)
        radius *= 0.78
    return _original_cylinder_between(name, a, b, radius, mat, vertices)


module.torso_shell = torso_shell_v12
module.tube_chain = tube_chain_v12
module.ellipsoid = ellipsoid_v12
module.soft_box = soft_box_v12
module.cylinder_between = cylinder_between_v12
module.main()
