import argparse
import math
import sys
from pathlib import Path

import bpy


def parse_args():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(args)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def material(name, color, metallic=0.0, roughness=0.75, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        if 'Base Color' in bsdf.inputs:
            bsdf.inputs['Base Color'].default_value = (*color, 1.0)
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = metallic
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = roughness
        if emission:
            key = 'Emission Color' if 'Emission Color' in bsdf.inputs else ('Emission' if 'Emission' in bsdf.inputs else None)
            if key:
                bsdf.inputs[key].default_value = (*emission, 1.0)
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def apply_mat(obj, mat):
    obj.data.materials.append(mat)


def bake_object_transform(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def skin_to_bone(obj, arm, bone_name):
    # Keep every rigid stylised piece in armature space. The previous pipeline used
    # BONE parenting on objects already positioned in world space, so the exported
    # bone transform was applied a second time and characters exploded apart.
    bake_object_transform(obj)
    obj.parent = arm
    obj.parent_type = 'OBJECT'
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    modifier = obj.modifiers.new('Armature Deform', 'ARMATURE')
    modifier.object = arm


def cube(name, loc, scale, mat, arm, bone, rot=(0, 0, 0), bevel=0.055):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if bevel:
        mod = obj.modifiers.new('Forged bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    apply_mat(obj, mat)
    skin_to_bone(obj, arm, bone)
    return obj


def sphere(name, loc, radius, mat, arm, bone, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    apply_mat(obj, mat)
    skin_to_bone(obj, arm, bone)
    return obj


def cylinder(name, loc, radius, depth, mat, arm, bone, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    apply_mat(obj, mat)
    skin_to_bone(obj, arm, bone)
    return obj


def torus(name, loc, major, minor, mat, arm, bone, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=24,
        minor_segments=7,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    apply_mat(obj, mat)
    skin_to_bone(obj, arm, bone)
    return obj


def create_rig(name, warden=False):
    data = bpy.data.armatures.new(f'{name}Rig')
    arm = bpy.data.objects.new(f'{name}Rig', data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def add_bone(bone_name, head, tail, parent=None):
        bone = data.edit_bones.new(bone_name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = data.edit_bones[parent]
        return bone

    if warden:
        add_bone('root', (0, 0, 0), (0, 0, 1.05))
        add_bone('spine', (0, 0, 1.05), (0, 0, 2.7), 'root')
        add_bone('head', (0, 0, 2.7), (0, 0, 3.55), 'spine')
        add_bone('arm_L', (0, 0, 2.35), (-1.35, 0, 1.95), 'spine')
        add_bone('arm_R', (0, 0, 2.35), (1.35, 0, 1.95), 'spine')
        add_bone('leg_L', (-0.34, 0, 0.9), (-0.4, 0, -0.62), 'root')
        add_bone('leg_R', (0.34, 0, 0.9), (0.4, 0, -0.62), 'root')
        add_bone('crown', (0, 0, 3.3), (0, 0, 4.3), 'head')
    else:
        add_bone('root', (0, 0, 0), (0, 0, 0.85))
        add_bone('spine', (0, 0, 0.85), (0, 0, 2.15), 'root')
        add_bone('head', (0, 0, 2.15), (0, 0, 2.95), 'spine')
        add_bone('arm_L', (0, 0, 1.92), (-1.18, 0, 1.52), 'spine')
        add_bone('arm_R', (0, 0, 1.92), (1.18, 0, 1.52), 'spine')
        add_bone('leg_L', (-0.29, 0, 0.78), (-0.34, 0, -0.62), 'root')
        add_bone('leg_R', (0.29, 0, 0.78), (0.34, 0, -0.62), 'root')
        add_bone('weapon', (0.9, -0.12, 1.52), (1.08, -0.16, 0.42), 'arm_R')

    bpy.ops.object.mode_set(mode='POSE')
    for pose_bone in arm.pose.bones:
        pose_bone.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def reset_pose(bones):
    for bone in bones:
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def make_action(arm, name, frames, sampler):
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    for frame in frames:
        reset_pose(arm.pose.bones)
        sampler(frame, arm.pose.bones)
        for bone in arm.pose.bones:
            bone.keyframe_insert(data_path='rotation_euler', frame=frame, group=bone.name)
            bone.keyframe_insert(data_path='location', frame=frame, group=bone.name)
    action.use_fake_user = True
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, frames[0], action)
    strip.action_frame_start = frames[0]
    strip.action_frame_end = frames[-1]
    track.mute = True
    return action


def build_keeper(arm):
    cloth = material('Keeper Indigo Cloth', (0.055, 0.105, 0.19), roughness=0.92)
    leather = material('Keeper Leather', (0.18, 0.07, 0.045), roughness=0.82)
    bronze = material('Keeper Bronze', (0.54, 0.26, 0.07), metallic=0.68, roughness=0.34)
    sun = material('Keeper Sun', (0.9, 0.43, 0.08), metallic=0.32, roughness=0.22, emission=(1.0, 0.14, 0.015), strength=3.8)
    skin = material('Keeper Face', (0.46, 0.28, 0.22), roughness=0.78)

    cube('KeeperTorso', (0, 0, 1.5), (0.52, 0.34, 0.72), cloth, arm, 'spine', bevel=0.08)
    cube('KeeperBelt', (0, 0, 0.92), (0.56, 0.38, 0.16), leather, arm, 'root', bevel=0.04)
    sphere('KeeperHead', (0, 0, 2.48), 0.39, skin, arm, 'head')
    cube('KeeperHood', (0, 0.05, 2.55), (0.5, 0.42, 0.48), cloth, arm, 'head', bevel=0.12)
    cube('KeeperFaceMask', (0, -0.39, 2.42), (0.34, 0.07, 0.18), bronze, arm, 'head', bevel=0.03)
    sphere('KeeperEyeL', (-0.13, -0.43, 2.49), 0.055, sun, arm, 'head', 1)
    sphere('KeeperEyeR', (0.13, -0.43, 2.49), 0.055, sun, arm, 'head', 1)
    cube('KeeperArmL', (-0.7, 0, 1.72), (0.48, 0.24, 0.25), cloth, arm, 'arm_L', (0, 0.05, -0.25))
    cube('KeeperArmR', (0.7, 0, 1.72), (0.48, 0.24, 0.25), cloth, arm, 'arm_R', (0, -0.05, 0.25))
    cube('KeeperGauntletL', (-1.2, 0, 1.48), (0.25, 0.3, 0.28), bronze, arm, 'arm_L')
    cube('KeeperGauntletR', (1.2, 0, 1.48), (0.25, 0.3, 0.28), bronze, arm, 'arm_R')
    cube('KeeperLegL', (-0.28, 0, 0.25), (0.26, 0.31, 0.65), leather, arm, 'leg_L')
    cube('KeeperLegR', (0.28, 0, 0.25), (0.26, 0.31, 0.65), leather, arm, 'leg_R')
    cube('KeeperBootL', (-0.28, -0.12, -0.46), (0.3, 0.43, 0.18), bronze, arm, 'leg_L', bevel=0.05)
    cube('KeeperBootR', (0.28, -0.12, -0.46), (0.3, 0.43, 0.18), bronze, arm, 'leg_R', bevel=0.05)
    cylinder('KeeperGlaiveShaft', (1.22, -0.08, 0.82), 0.065, 2.0, bronze, arm, 'weapon', (0.08, 0, 0.18))
    cube('KeeperGlaiveBlade', (1.16, -0.08, -0.18), (0.11, 0.07, 0.55), sun, arm, 'weapon', (0, 0.22, 0.08), 0.03)
    torus('KeeperGlaiveRing', (1.2, -0.08, 0.2), 0.26, 0.05, sun, arm, 'weapon', (math.pi / 2, 0, 0))

    frames = [1, 12, 24, 36, 48]

    def idle(frame, bones):
        t = (frame - 1) / 47
        s = math.sin(t * math.tau)
        bones['spine'].rotation_euler.x = 0.025 + s * 0.018
        bones['head'].rotation_euler.z = s * 0.025
        bones['arm_R'].rotation_euler.y = 0.16 + s * 0.03
        bones['arm_L'].rotation_euler.y = -0.12 - s * 0.025

    def walk(frame, bones):
        t = (frame - 1) / 47
        s = math.sin(t * math.tau * 2)
        bones['leg_L'].rotation_euler.x = s * 0.45
        bones['leg_R'].rotation_euler.x = -s * 0.45
        bones['arm_L'].rotation_euler.x = -s * 0.28
        bones['arm_R'].rotation_euler.x = s * 0.2
        bones['spine'].location.z = abs(s) * 0.05

    def attack(frame, bones):
        t = (frame - 1) / 47
        wind = math.sin(min(1, t * 1.4) * math.pi)
        follow = math.sin(max(0, t - 0.35) / 0.65 * math.pi)
        bones['spine'].rotation_euler.z = -0.25 * wind + 0.38 * follow
        bones['arm_R'].rotation_euler.y = 0.25 + 1.1 * wind - 1.25 * follow
        bones['arm_R'].rotation_euler.x = -0.35 * wind
        bones['weapon'].rotation_euler.x = -0.55 * wind + 1.35 * follow
        bones['arm_L'].rotation_euler.y = -0.35 * wind

    actions = [
        make_action(arm, 'Keeper_Idle', frames, idle),
        make_action(arm, 'Keeper_Walk', frames, walk),
        make_action(arm, 'Keeper_Attack', frames, attack),
    ]
    return actions, 48


def build_raider(arm):
    ash = material('Raider Ash', (0.07, 0.06, 0.075), metallic=0.42, roughness=0.58)
    rust = material('Raider Rust', (0.29, 0.075, 0.035), metallic=0.48, roughness=0.55)
    ember = material('Raider Ember', (0.62, 0.035, 0.012), metallic=0.12, roughness=0.22, emission=(1, 0.02, 0.002), strength=4.2)
    cloth = material('Raider Cloth', (0.15, 0.055, 0.045), roughness=0.94)

    cube('RaiderTorso', (0, 0, 1.35), (0.48, 0.32, 0.63), ash, arm, 'spine')
    cube('RaiderSkirt', (0, 0, 0.72), (0.52, 0.36, 0.3), cloth, arm, 'root')
    sphere('RaiderHead', (0, 0, 2.24), 0.38, ash, arm, 'head', 1)
    cube('RaiderMask', (0, -0.34, 2.22), (0.3, 0.07, 0.19), rust, arm, 'head')
    sphere('RaiderEye', (0, -0.405, 2.28), 0.08, ember, arm, 'head', 1)
    cube('RaiderArmL', (-0.65, 0, 1.55), (0.44, 0.22, 0.23), cloth, arm, 'arm_L', (0, 0, -0.25))
    cube('RaiderArmR', (0.65, 0, 1.55), (0.44, 0.22, 0.23), ash, arm, 'arm_R', (0, 0, 0.25))
    cube('RaiderLegL', (-0.24, 0, 0.1), (0.22, 0.27, 0.55), cloth, arm, 'leg_L')
    cube('RaiderLegR', (0.24, 0, 0.1), (0.22, 0.27, 0.55), cloth, arm, 'leg_R')
    cube('RaiderBlade', (1.13, -0.05, 0.55), (0.09, 0.06, 0.72), rust, arm, 'weapon', (0, 0.1, 0.18))
    cube('RaiderBladeGlow', (1.13, -0.11, 0.34), (0.04, 0.025, 0.48), ember, arm, 'weapon', (0, 0.1, 0.18))

    frames = [1, 10, 20, 30, 40]

    def stalk(frame, bones):
        t = (frame - 1) / 39
        s = math.sin(t * math.tau * 2)
        bones['leg_L'].rotation_euler.x = s * 0.36
        bones['leg_R'].rotation_euler.x = -s * 0.36
        bones['spine'].rotation_euler.x = 0.12 + abs(s) * 0.04
        bones['arm_R'].rotation_euler.y = 0.3 + s * 0.08
        bones['head'].rotation_euler.z = s * 0.04

    def attack(frame, bones):
        t = (frame - 1) / 39
        wind = math.sin(min(1, t * 1.65) * math.pi)
        strike = math.sin(max(0, t - 0.36) / 0.64 * math.pi)
        bones['arm_R'].rotation_euler.y = 0.4 + wind * 1.0 - strike * 1.35
        bones['weapon'].rotation_euler.x = -wind * 0.7 + strike * 1.2
        bones['spine'].rotation_euler.z = -wind * 0.22 + strike * 0.32

    actions = [
        make_action(arm, 'Raider_Stalk', frames, stalk),
        make_action(arm, 'Raider_Attack', frames, attack),
    ]
    return actions, 40


def build_warden(arm):
    ash = material('Warden Ash Iron', (0.08, 0.055, 0.065), metallic=0.55, roughness=0.5)
    bronze = material('Warden Bronze', (0.43, 0.17, 0.055), metallic=0.72, roughness=0.34)
    ember = material('Warden Ember', (0.7, 0.07, 0.015), metallic=0.15, roughness=0.2, emission=(1, 0.04, 0.005), strength=6.0)
    dark = material('Warden Cloth', (0.11, 0.045, 0.05), roughness=0.9)

    cube('WardenTorso', (0, 0, 1.85), (0.72, 0.46, 0.92), ash, arm, 'spine', bevel=0.08)
    cube('WardenPelvis', (0, 0, 0.82), (0.58, 0.4, 0.42), bronze, arm, 'root', bevel=0.08)
    sphere('WardenHead', (0, 0, 3.0), 0.48, ash, arm, 'head')
    sphere('WardenEye', (0, -0.43, 3.02), 0.17, ember, arm, 'head', 1)
    cube('WardenArmL', (-0.78, 0, 2.15), (0.62, 0.28, 0.3), ash, arm, 'arm_L', (0, 0.15, -0.25), 0.08)
    cube('WardenArmR', (0.78, 0, 2.15), (0.62, 0.28, 0.3), ash, arm, 'arm_R', (0, -0.15, 0.25), 0.08)
    cube('WardenGauntletL', (-1.5, 0, 1.85), (0.28, 0.36, 0.36), bronze, arm, 'arm_L', bevel=0.07)
    cube('WardenGauntletR', (1.5, 0, 1.85), (0.28, 0.36, 0.36), bronze, arm, 'arm_R', bevel=0.07)
    cube('WardenLegL', (-0.34, 0, 0.12), (0.28, 0.34, 0.72), dark, arm, 'leg_L')
    cube('WardenLegR', (0.34, 0, 0.12), (0.28, 0.34, 0.72), dark, arm, 'leg_R')
    cube('WardenBootL', (-0.36, -0.14, -0.58), (0.35, 0.46, 0.2), bronze, arm, 'leg_L')
    cube('WardenBootR', (0.36, -0.14, -0.58), (0.35, 0.46, 0.2), bronze, arm, 'leg_R')

    for side in (-1, 1):
        for index in range(3):
            angle = side * (0.18 + index * 0.18)
            cube(
                f'WardenCrown_{"L" if side < 0 else "R"}_{index}',
                (side * (0.32 + index * 0.25), 0, 3.82 + index * 0.12),
                (0.11, 0.14, 0.68 + index * 0.12),
                bronze,
                arm,
                'crown',
                (0, angle, -angle * 0.4),
                0.04,
            )
    torus('WardenChestRing', (0, 0, 2.0), 0.72, 0.08, ember, arm, 'spine', (math.pi / 2, 0, 0))

    frames = [1, 18, 36, 54, 72]

    def awaken(frame, bones):
        t = (frame - 1) / 71
        pulse = math.sin(t * math.tau)
        bones['spine'].rotation_euler.x = 0.06 + pulse * 0.035
        bones['head'].rotation_euler.z = pulse * 0.09
        bones['arm_L'].rotation_euler.y = -0.35 - pulse * 0.16
        bones['arm_L'].rotation_euler.z = -0.18 + pulse * 0.08
        bones['arm_R'].rotation_euler.y = 0.35 + pulse * 0.16
        bones['arm_R'].rotation_euler.z = 0.18 - pulse * 0.08
        bones['crown'].rotation_euler.y = pulse * 0.06
        bones['leg_L'].rotation_euler.x = pulse * 0.08
        bones['leg_R'].rotation_euler.x = -pulse * 0.08

    actions = [make_action(arm, 'Warden_Awaken', frames, awaken)]
    return actions, 72


def export(output, arm, actions, frame_end):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if actions:
        arm.animation_data.action = actions[0]
    bpy.context.scene.frame_set(1)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frame_end
    reset_pose(arm.pose.bones)
    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format='GLB',
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_materials='EXPORT',
    )
    print(f'RELIC SIEGE skinned actor generated: {output} ({output.stat().st_size} bytes)')


def main():
    args = parse_args()
    output = Path(args.output)
    stem = output.stem.lower()
    clear_scene()

    if stem == 'keeper':
        arm = create_rig('Keeper')
        actions, frame_end = build_keeper(arm)
    elif stem == 'ash-raider':
        arm = create_rig('Raider')
        actions, frame_end = build_raider(arm)
    elif stem == 'ash-warden':
        arm = create_rig('AshWarden', warden=True)
        actions, frame_end = build_warden(arm)
    else:
        raise SystemExit(f'Unsupported actor output: {output.name}')

    export(args.output, arm, actions, frame_end)


if __name__ == '__main__':
    main()
