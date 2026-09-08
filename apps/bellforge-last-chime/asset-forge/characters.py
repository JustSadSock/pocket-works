from pathlib import Path
import math
import sys
sys.path.insert(0, str(Path(__file__).parent))
import bpy
from forge_common import parse_args, clear_scene, painted_material, export_glb, bevel


def cube(name, loc, scale, mat, roundness=.05):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, roundness, 2)
    obj.data.materials.append(mat)
    return obj


def sphere(name, loc, scale, mat, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, loc, radius, depth, mat, rotation=(0, 0, 0), vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel(obj, min(radius * .22, .045), 2)
    return obj


def cone(name, loc, radius1, radius2, depth, mat, rotation=(0, 0, 0), vertices=12):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel(obj, min(radius1 * .16, .035), 2)
    return obj


def rig(name):
    data = bpy.data.armatures.new(name + 'Armature')
    arm = bpy.data.objects.new(name + 'Rig', data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(n, h, t, parent=None):
        b = data.edit_bones.new(n)
        b.head = h
        b.tail = t
        b.parent = data.edit_bones[parent] if parent else None
        return b

    bone('root', (0, 0, 0), (0, 0, .24))
    bone('pelvis', (0, 0, .84), (0, 0, 1.08), 'root')
    bone('spine', (0, 0, 1.08), (0, 0, 1.42), 'pelvis')
    bone('chest', (0, 0, 1.42), (0, 0, 1.70), 'spine')
    bone('neck', (0, 0, 1.70), (0, 0, 1.84), 'chest')
    bone('head', (0, 0, 1.84), (0, 0, 2.17), 'neck')

    for side, sign in [('L', 1), ('R', -1)]:
        bone(f'arm_{side}', (sign * .22, 0, 1.62), (sign * .56, 0, 1.47), 'chest')
        bone(f'forearm_{side}', (sign * .56, 0, 1.47), (sign * .82, -.01, 1.23), f'arm_{side}')
        bone(f'hand_{side}', (sign * .82, -.01, 1.23), (sign * .92, -.04, 1.10), f'forearm_{side}')
        bone(f'thigh_{side}', (sign * .17, 0, .88), (sign * .18, 0, .50), 'pelvis')
        bone(f'shin_{side}', (sign * .18, 0, .50), (sign * .19, 0, .13), f'thigh_{side}')
        bone(f'foot_{side}', (sign * .19, 0, .13), (sign * .19, -.23, .06), f'shin_{side}')

    bpy.ops.object.mode_set(mode='POSE')
    for pose_bone in arm.pose.bones:
        pose_bone.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def bind(obj, arm, bone_name):
    world = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    obj.matrix_world = world


def build_bellwright(arm):
    face = painted_material('Face_Warm', (.58, .34, .22), .82, seed=70, accent=(.74, .47, .31))
    coat = painted_material('Cloth_Coat', (.22, .14, .09), .94, seed=71, accent=(.43, .27, .14))
    shirt = painted_material('Cloth_Shirt', (.62, .27, .13), .96, seed=72, accent=(.82, .42, .19))
    scarf = painted_material('Cloth_Scarf', (.18, .38, .36), .9, seed=77, accent=(.31, .64, .58))
    leather = painted_material('Leather_Harness', (.18, .08, .04), .72, seed=73, accent=(.36, .17, .07))
    copper = painted_material('Copper_Tools', (.45, .25, .10), .45, .65, seed=74, accent=(.74, .40, .15))
    dark = painted_material('Hair_Dark', (.05, .032, .022), .96, seed=75, accent=(.12, .075, .05))
    eye = painted_material('Eye_Dark', (.025, .03, .03), .82, seed=78, accent=(.07, .09, .08))
    glow = painted_material('Ceramic_Badge', (.33, .76, .66), .32, .05, seed=76, accent=(.7, 1, .9), emission=(.08, .5, .42))

    pieces = [
        (cube('Pelvis', (0, .01, .98), (.29, .18, .19), coat, .08), 'pelvis'),
        (cube('LowerTorso', (0, .015, 1.26), (.34, .20, .25), shirt, .09), 'spine'),
        (cube('UpperTorso', (0, .01, 1.52), (.39, .22, .25), shirt, .10), 'chest'),
        (cube('CoatTail_L', (.19, .10, 1.02), (.17, .10, .34), coat, .055), 'pelvis'),
        (cube('CoatTail_R', (-.19, .10, 1.02), (.17, .10, .34), coat, .055), 'pelvis'),
        (cube('Scarf', (0, -.21, 1.69), (.25, .055, .10), scarf, .05), 'chest'),
        (sphere('Head', (0, -.01, 1.98), (.25, .23, .29), face), 'head'),
        (sphere('HairCap', (0, .035, 2.13), (.27, .24, .14), dark), 'head'),
        (cube('HairBack', (0, .16, 1.99), (.22, .08, .20), dark, .075), 'head'),
        (sphere('Eye_L', (.085, -.218, 2.01), (.035, .018, .038), eye, 1), 'head'),
        (sphere('Eye_R', (-.085, -.218, 2.01), (.035, .018, .038), eye, 1), 'head'),
        (cone('Nose', (0, -.255, 1.96), .04, .015, .10, face, rotation=(math.pi / 2, 0, 0), vertices=10), 'head'),
        (cube('Belt', (0, -.005, 1.10), (.34, .205, .045), leather, .035), 'pelvis'),
        (cube('Buckle', (0, -.22, 1.10), (.07, .025, .06), copper, .025), 'pelvis'),
        (cube('ShoulderPlate', (.42, -.01, 1.65), (.20, .22, .07), copper, .075), 'arm_L'),
        (cube('Satchel', (-.43, .18, 1.08), (.24, .13, .30), leather, .08), 'pelvis'),
        (sphere('Badge', (.17, -.232, 1.54), (.08, .035, .08), glow), 'chest'),
    ]

    for side, sign in [('L', 1), ('R', -1)]:
        pieces += [
            (cube(f'UpperArm_{side}', (sign * .43, 0, 1.53), (.16, .17, .28), coat, .08), f'arm_{side}'),
            (cube(f'Forearm_{side}', (sign * .70, -.01, 1.34), (.14, .145, .24), shirt, .07), f'forearm_{side}'),
            (sphere(f'Hand_{side}', (sign * .87, -.035, 1.16), (.11, .09, .12), face, 1), f'hand_{side}'),
            (cube(f'Thigh_{side}', (sign * .17, .01, .69), (.17, .18, .28), coat, .07), f'thigh_{side}'),
            (cube(f'Shin_{side}', (sign * .18, 0, .30), (.145, .155, .27), leather, .06), f'shin_{side}'),
            (cube(f'Boot_{side}', (sign * .19, -.11, .085), (.155, .24, .09), leather, .055), f'foot_{side}'),
        ]

    pieces += [
        (cylinder('TuningForkStem', (-.91, -.04, 1.10), .028, .28, copper, rotation=(0, 0, 0), vertices=10), 'hand_R'),
        (cylinder('TuningForkProngA', (-.86, -.04, .94), .021, .23, copper, vertices=10), 'hand_R'),
        (cylinder('TuningForkProngB', (-.96, -.04, .94), .021, .23, copper, vertices=10), 'hand_R'),
        (cube('HarnessStrapA', (.10, -.225, 1.38), (.035, .025, .30), leather, .02), 'spine'),
        (cube('HarnessStrapB', (-.10, -.225, 1.38), (.035, .025, .30), leather, .02), 'spine'),
    ]

    for obj, bone_name in pieces:
        bind(obj, arm, bone_name)


def build_warden(arm):
    iron = painted_material('Warden_Iron', (.055, .075, .085), .40, .82, seed=90, accent=(.16, .20, .19))
    copper = painted_material('Warden_Copper', (.42, .22, .08), .40, .76, seed=91, accent=(.72, .38, .12))
    verd = painted_material('Warden_Verdigris', (.08, .38, .35), .58, .45, seed=92, accent=(.18, .62, .55))
    rubber = painted_material('Warden_Joint', (.035, .04, .042), .72, .35, seed=94, accent=(.08, .09, .09))
    eye = painted_material('Warden_Eye', (.68, .18, .08), .24, .08, seed=93, accent=(1, .4, .12), emission=(.85, .08, .02))

    pieces = [
        (cube('WardenPelvis', (0, .01, .98), (.30, .22, .22), iron, .10), 'pelvis'),
        (cube('WardenSpine', (0, .02, 1.27), (.34, .25, .25), iron, .11), 'spine'),
        (cube('WardenBody', (0, .015, 1.53), (.43, .30, .31), iron, .13), 'chest'),
        (cube('ChestPlate', (0, -.31, 1.54), (.36, .07, .29), verd, .08), 'chest'),
        (cylinder('BackBoiler', (0, .30, 1.47), .24, .56, copper, vertices=14), 'chest'),
        (sphere('WardenHead', (0, 0, 1.94), (.29, .25, .26), copper), 'head'),
        (cube('Visor', (0, -.235, 1.96), (.22, .045, .075), iron, .04), 'head'),
        (sphere('WardenEye', (0, -.285, 1.96), (.13, .03, .075), eye), 'head'),
        (cube('Jaw', (0, -.20, 1.82), (.19, .08, .07), iron, .035), 'head'),
        (cube('Shoulder_L', (.43, 0, 1.65), (.21, .24, .10), verd, .08), 'arm_L'),
        (cube('Shoulder_R', (-.43, 0, 1.65), (.21, .24, .10), verd, .08), 'arm_R'),
        (cylinder('Exhaust_L', (.22, .34, 1.66), .045, .35, copper, rotation=(math.radians(12), 0, 0), vertices=10), 'chest'),
        (cylinder('Exhaust_R', (-.22, .34, 1.66), .045, .35, copper, rotation=(math.radians(12), 0, 0), vertices=10), 'chest'),
    ]

    for side, sign in [('L', 1), ('R', -1)]:
        pieces += [
            (sphere(f'ElbowJoint_{side}', (sign * .61, -.005, 1.44), (.11, .11, .11), rubber, 1), f'arm_{side}'),
            (cube(f'Arm_{side}', (sign * .45, 0, 1.53), (.18, .19, .29), copper, .09), f'arm_{side}'),
            (cube(f'Forearm_{side}', (sign * .72, -.01, 1.32), (.16, .17, .27), iron, .08), f'forearm_{side}'),
            (cube(f'Fist_{side}', (sign * .88, -.04, 1.14), (.13, .12, .14), copper, .06), f'hand_{side}'),
            (cube(f'Thigh_{side}', (sign * .19, .01, .69), (.19, .22, .29), iron, .08), f'thigh_{side}'),
            (cube(f'Knee_{side}', (sign * .19, -.17, .49), (.14, .06, .12), verd, .045), f'shin_{side}'),
            (cube(f'Shin_{side}', (sign * .20, 0, .29), (.17, .20, .27), copper, .07), f'shin_{side}'),
            (cube(f'Foot_{side}', (sign * .20, -.13, .075), (.18, .26, .09), iron, .055), f'foot_{side}'),
        ]

    for obj, bone_name in pieces:
        bind(obj, arm, bone_name)


def reset(arm):
    for bone in arm.pose.bones:
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)


def action(arm, name):
    reset(arm)
    act = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = act
    return act


def rot(arm, bone_name, frame, x=0, y=0, z=0):
    bone = arm.pose.bones[bone_name]
    bone.rotation_euler = (x, y, z)
    bone.keyframe_insert('rotation_euler', frame=frame, group=bone_name)


def loc(arm, bone_name, frame, x=0, y=0, z=0):
    bone = arm.pose.bones[bone_name]
    bone.location = (x, y, z)
    bone.keyframe_insert('location', frame=frame, group=bone_name)


def stash(arm, act, end):
    track = arm.animation_data.nla_tracks.new()
    track.name = act.name
    strip = track.strips.new(act.name, 1, act)
    strip.action_frame_start = 1
    strip.action_frame_end = end
    track.mute = True


def animate_idle(arm, warden):
    act = action(arm, 'Idle')
    end = 120
    for frame in range(1, end + 1, 15):
        phase = (frame - 1) / (end - 1) * math.tau
        breathe = math.sin(phase)
        sway = math.sin(phase * .5)
        loc(arm, 'pelvis', frame, z=(.010 if warden else .018) * breathe)
        rot(arm, 'spine', frame, x=.012 * breathe, z=.018 * sway)
        rot(arm, 'chest', frame, y=.015 * sway, z=-.012 * sway)
        rot(arm, 'neck', frame, y=.025 * sway)
        rot(arm, 'head', frame, x=.012 * breathe, y=.035 * sway, z=.018 * math.sin(phase * .75))
        servo = .025 if warden else .012
        rot(arm, 'forearm_L', frame, x=servo * math.sin(phase * 1.3))
        rot(arm, 'forearm_R', frame, x=-servo * math.sin(phase * 1.25))
    stash(arm, act, end)
    return act


def animate_locomotion(arm, name, amp, end, warden):
    act = action(arm, name)
    stride_lift = .028 if name == 'Walk' else .060
    chest_amp = .055 if name == 'Walk' else .09
    for frame in range(1, end + 1, 3):
        phase = (frame - 1) / (end - 1) * math.tau
        stride = math.sin(phase)
        bounce = abs(math.sin(phase))
        loc(arm, 'pelvis', frame, z=stride_lift * bounce)
        rot(arm, 'pelvis', frame, z=.035 * math.sin(phase + math.pi / 2))
        rot(arm, 'spine', frame, x=(-.04 if name == 'Run' else -.015) + .025 * bounce, z=-chest_amp * stride)
        rot(arm, 'chest', frame, z=chest_amp * stride)
        rot(arm, 'head', frame, x=-.018 * bounce, z=-.018 * stride)

        for side, phase_offset in [('L', 0), ('R', math.pi)]:
            q = math.sin(phase + phase_offset)
            forward = max(0, q)
            backward = max(0, -q)
            rot(arm, f'thigh_{side}', frame, x=amp * q)
            rot(arm, f'shin_{side}', frame, x=-amp * (.72 * forward + .20 * backward))
            rot(arm, f'foot_{side}', frame, x=(.18 if name == 'Walk' else .30) * backward - (.10 if name == 'Walk' else .16) * forward)
            arm_scale = .55 if warden else .72
            rot(arm, f'arm_{side}', frame, x=-amp * arm_scale * q, z=(.04 if side == 'L' else -.04))
            rot(arm, f'forearm_{side}', frame, x=-amp * .25 * abs(q) - (.08 if name == 'Run' else .02))
            rot(arm, f'hand_{side}', frame, x=.05 * q)
    stash(arm, act, end)


def animate_talk(arm, warden):
    name = 'Point' if warden else 'Talk'
    act = action(arm, name)
    keyframes = [(1, 0), (8, .72), (18, 1), (30, .78), (42, 0)]
    for frame, power in keyframes:
        rot(arm, 'chest', frame, y=-.06 * power, z=.04 * power)
        rot(arm, 'head', frame, y=-.10 * power, z=.035 * power)
        rot(arm, 'arm_R', frame, x=-1.00 * power, z=-.38 * power)
        rot(arm, 'forearm_R', frame, x=-.56 * power, y=.08 * power)
        rot(arm, 'hand_R', frame, x=.22 * power, z=-.10 * power)
        if not warden:
            rot(arm, 'arm_L', frame, x=-.28 * power, z=.20 * power)
            rot(arm, 'forearm_L', frame, x=-.35 * power)
    stash(arm, act, 42)


def animate_gesture(arm):
    act = action(arm, 'Gesture')
    for frame, power in [(1, 0), (7, .55), (15, 1), (24, .82), (34, 0)]:
        rot(arm, 'chest', frame, z=-.055 * power)
        rot(arm, 'head', frame, y=.08 * power)
        rot(arm, 'arm_L', frame, x=-.76 * power, z=.52 * power)
        rot(arm, 'forearm_L', frame, x=-.78 * power, z=.12 * power)
        rot(arm, 'hand_L', frame, x=.18 * power)
    stash(arm, act, 34)


def animate_alert(arm):
    act = action(arm, 'Alert')
    for frame, power in [(1, 0), (6, 1), (14, .7), (22, 1), (30, 0)]:
        rot(arm, 'spine', frame, x=-.10 * power)
        rot(arm, 'chest', frame, x=-.06 * power)
        rot(arm, 'head', frame, x=.08 * power)
        rot(arm, 'arm_L', frame, x=-.45 * power, z=.18 * power)
        rot(arm, 'arm_R', frame, x=-.45 * power, z=-.18 * power)
        rot(arm, 'forearm_L', frame, x=-.55 * power)
        rot(arm, 'forearm_R', frame, x=-.55 * power)
    stash(arm, act, 30)


def animate(arm, warden=False):
    idle = animate_idle(arm, warden)
    animate_locomotion(arm, 'Walk', .58 if not warden else .50, 37, warden)
    animate_locomotion(arm, 'Run', .92 if not warden else .78, 25, warden)
    animate_talk(arm, warden)
    animate_gesture(arm)
    animate_alert(arm)
    arm.animation_data.action = idle
    bpy.context.scene.frame_end = 120
    bpy.context.scene.render.fps = 30


def main():
    args = parse_args()
    clear_scene()
    is_warden = 'warden' in Path(args.output).name.lower()
    arm = rig('Warden' if is_warden else 'Bellwright')
    build_warden(arm) if is_warden else build_bellwright(arm)
    animate(arm, is_warden)
    export_glb(args.output, animations=True)


if __name__ == '__main__':
    main()
