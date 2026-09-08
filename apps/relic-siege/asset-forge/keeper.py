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
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
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
    return m


def apply_mat(obj, mat):
    obj.data.materials.append(mat)


def bone_parent(obj, arm, bone):
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone


def cube(name, loc, scale, mat, arm, bone, rot=(0, 0, 0), bevel=0.06):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Keeper bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    apply_mat(obj, mat)
    bone_parent(obj, arm, bone)
    return obj


def sphere(name, loc, radius, mat, arm, bone):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    apply_mat(obj, mat)
    bone_parent(obj, arm, bone)
    return obj


def cylinder(name, loc, radius, depth, mat, arm, bone, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    apply_mat(obj, mat)
    bone_parent(obj, arm, bone)
    return obj


def create_rig():
    data = bpy.data.armatures.new('KeeperRig')
    arm = bpy.data.objects.new('KeeperRig', data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None):
        b = data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = data.edit_bones[parent]
        return b

    bone('root', (0, 0, 0), (0, 0, 0.9))
    bone('spine', (0, 0, 0.9), (0, 0, 2.2), 'root')
    bone('head', (0, 0, 2.2), (0, 0, 3.0), 'spine')
    bone('arm_L', (0, 0, 1.95), (-1.2, 0, 1.55), 'spine')
    bone('arm_R', (0, 0, 1.95), (1.2, 0, 1.55), 'spine')
    bone('leg_L', (-0.3, 0, 0.8), (-0.34, 0, -0.65), 'root')
    bone('leg_R', (0.3, 0, 0.8), (0.34, 0, -0.65), 'root')
    bone('weapon', (0.9, -0.15, 1.55), (1.1, -0.2, 0.5), 'arm_R')

    bpy.ops.object.mode_set(mode='POSE')
    for p in arm.pose.bones:
        p.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def build(arm):
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
    sphere('KeeperEyeL', (-0.13, -0.43, 2.49), 0.055, sun, arm, 'head')
    sphere('KeeperEyeR', (0.13, -0.43, 2.49), 0.055, sun, arm, 'head')

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
    bpy.ops.mesh.primitive_torus_add(major_radius=0.26, minor_radius=0.05, major_segments=20, minor_segments=6, location=(1.2, -0.08, 0.2), rotation=(math.pi / 2, 0, 0))
    ring = bpy.context.object
    ring.name = 'KeeperGlaiveRing'
    apply_mat(ring, sun)
    bone_parent(ring, arm, 'weapon')


def add_action(arm, name, frames, sampler):
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    for frame in frames:
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


def reset_pose(bones):
    for b in bones:
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)


def animate(arm):
    frames = [1, 12, 24, 36, 48]

    def idle(frame, bones):
        reset_pose(bones)
        t = (frame - 1) / 47
        s = math.sin(t * math.tau)
        bones['spine'].rotation_euler.x = 0.025 + s * 0.018
        bones['head'].rotation_euler.z = s * 0.025
        bones['arm_R'].rotation_euler.y = 0.16 + s * 0.03
        bones['arm_L'].rotation_euler.y = -0.12 - s * 0.025

    def walk(frame, bones):
        reset_pose(bones)
        t = (frame - 1) / 47
        s = math.sin(t * math.tau * 2)
        bones['leg_L'].rotation_euler.x = s * 0.45
        bones['leg_R'].rotation_euler.x = -s * 0.45
        bones['arm_L'].rotation_euler.x = -s * 0.28
        bones['arm_R'].rotation_euler.x = s * 0.2
        bones['spine'].location.z = abs(s) * 0.05

    def attack(frame, bones):
        reset_pose(bones)
        t = (frame - 1) / 47
        wind = math.sin(min(1, t * 1.4) * math.pi)
        follow = math.sin(max(0, t - 0.35) / 0.65 * math.pi)
        bones['spine'].rotation_euler.z = -0.25 * wind + 0.38 * follow
        bones['arm_R'].rotation_euler.y = 0.25 + 1.1 * wind - 1.25 * follow
        bones['arm_R'].rotation_euler.x = -0.35 * wind
        bones['weapon'].rotation_euler.x = -0.55 * wind + 1.35 * follow
        bones['arm_L'].rotation_euler.y = -0.35 * wind

    add_action(arm, 'Keeper_Idle', frames, idle)
    add_action(arm, 'Keeper_Walk', frames, walk)
    add_action(arm, 'Keeper_Attack', frames, attack)
    arm.animation_data.action = bpy.data.actions['Keeper_Idle']
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 48


def export(output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format='GLB',
        export_apply=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_materials='EXPORT'
    )
    print(f'RELIC SIEGE Keeper generated: {output} ({output.stat().st_size} bytes)')


def main():
    args = parse_args()
    clear_scene()
    arm = create_rig()
    build(arm)
    animate(arm)
    export(args.output)


if __name__ == '__main__':
    main()
