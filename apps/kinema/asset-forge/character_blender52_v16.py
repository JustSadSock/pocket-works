"""KINEMA v1.6 Blender 5.2 release entrypoint.

Reuses the proven v1.5 armature, geometry and materials, then replaces only the
Idle action with a restrained asymmetric human stance: soft weight transfer,
slight elbow flex, counter-rotation through pelvis/chest and small head motion.
The locomotion actions stay untouched so the final pass cannot destabilize the
validated walk/jog/run pipeline.
"""

import math
from pathlib import Path


BASE = Path(__file__).with_name('character_blender52.py')
source = BASE.read_text(encoding='utf-8')
terminal = '\nmodule.main()\n'
if not source.endswith(terminal):
    raise RuntimeError('KINEMA v1.6 expected the v1.5 entrypoint to end in module.main().')

namespace = {
    '__file__': str(BASE),
    '__name__': 'kinema_character_v15_embedded',
}
exec(compile(source[:-len(terminal)] + '\n', str(BASE), 'exec'), namespace)
module = namespace['module']


def create_idle_v16(arm):
    action = module.bpy.data.actions.new('Idle')
    arm.animation_data_create()
    arm.animation_data.action = action
    module.reset_pose(arm)

    # One slow breathing/weight cycle. Values deliberately stay small so the
    # silhouette reads alive without turning the neutral pose into a performance.
    samples = [
        (1,   0.00,  0.00,  0.00),
        (19,  0.75,  0.65,  0.35),
        (37,  0.18,  1.00,  0.00),
        (55, -0.62, -0.70, -0.35),
        (73,  0.00,  0.00,  0.00),
    ]
    for frame, breath, sway, glance in samples:
        left_load = max(0.0, sway)
        right_load = max(0.0, -sway)
        module.pose_key(arm, frame, {
            'pelvis': (
                math.radians(0.45 + breath * 0.22),
                math.radians(sway * 0.28),
                math.radians(sway * 0.72),
            ),
            'spine': (
                math.radians(-0.65 + breath * 0.35),
                math.radians(-sway * 0.18),
                math.radians(-sway * 0.45),
            ),
            'chest': (
                math.radians(1.05 + breath * 0.52),
                math.radians(sway * 0.15),
                math.radians(-sway * 0.34),
            ),
            'neck': (
                math.radians(-0.20 - breath * 0.10),
                math.radians(glance * 0.20),
                math.radians(sway * 0.12),
            ),
            'head': (
                math.radians(-0.48 - breath * 0.12),
                math.radians(glance * 0.85 + sway * 0.18),
                math.radians(-sway * 0.18),
            ),
            'upper_arm_L': (
                math.radians(0.55 + sway * 0.30),
                0.0,
                math.radians(-0.40 - left_load * 0.30),
            ),
            'upper_arm_R': (
                math.radians(0.45 - sway * 0.22),
                0.0,
                math.radians(0.35 + right_load * 0.28),
            ),
            'forearm_L': (math.radians(5.2 + breath * 0.35), 0.0, math.radians(-0.18)),
            'forearm_R': (math.radians(4.4 - breath * 0.20), 0.0, math.radians(0.12)),
            'thigh_L': (math.radians(0.35 + left_load * 0.75), math.radians(-0.20), 0.0),
            'thigh_R': (math.radians(0.25 + right_load * 0.65), math.radians(0.18), 0.0),
            'shin_L': (math.radians(1.15 + left_load * 0.75), 0.0, 0.0),
            'shin_R': (math.radians(0.80 + right_load * 0.65), 0.0, 0.0),
            'foot_L': (math.radians(-0.28 - left_load * 0.18), 0.0, math.radians(-0.10)),
            'foot_R': (math.radians(-0.18 - right_load * 0.16), 0.0, math.radians(0.08)),
        })

    module.finalize_action(action)
    return action


module.create_idle = create_idle_v16
module.main()
