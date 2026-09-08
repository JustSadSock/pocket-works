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


def mat(name, color, metallic=0.0, roughness=0.8, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = metallic
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = roughness
        if emission:
            key = 'Emission Color' if 'Emission Color' in bsdf.inputs else ('Emission' if 'Emission' in bsdf.inputs else None)
            if key:
                bsdf.inputs[key].default_value = (*emission, 1)
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = strength
    return m


def apply(obj, material):
    obj.data.materials.append(material)


def parent(obj, arm, bone):
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone


def cube(name, loc, scale, material, arm, bone, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Raider bevel', 'BEVEL')
    mod.width = 0.055
    mod.segments = 2
    apply(obj, material)
    parent(obj, arm, bone)
    return obj


def sphere(name, loc, radius, material, arm, bone):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    apply(obj, material)
    parent(obj, arm, bone)
    return obj


def create_rig():
    data = bpy.data.armatures.new('RaiderRig')
    arm = bpy.data.objects.new('RaiderRig', data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent_name=None):
        b = data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent_name:
            b.parent = data.edit_bones[parent_name]
        return b

    bone('root', (0, 0, 0), (0, 0, 0.8))
    bone('spine', (0, 0, 0.8), (0, 0, 2.0), 'root')
    bone('head', (0, 0, 2.0), (0, 0, 2.75), 'spine')
    bone('arm_L', (0, 0, 1.8), (-1.1, 0, 1.45), 'spine')
    bone('arm_R', (0, 0, 1.8), (1.1, 0, 1.45), 'spine')
    bone('leg_L', (-0.25, 0, 0.7), (-0.3, 0, -0.55), 'root')
    bone('leg_R', (0.25, 0, 0.7), (0.3, 0, -0.55), 'root')
    bone('weapon', (0.95, -0.05, 1.45), (1.1, -0.1, 0.35), 'arm_R')

    bpy.ops.object.mode_set(mode='POSE')
    for b in arm.pose.bones:
        b.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def build(arm):
    ash = mat('Raider Ash', (0.07, 0.06, 0.075), metallic=0.42, roughness=0.58)
    rust = mat('Raider Rust', (0.29, 0.075, 0.035), metallic=0.48, roughness=0.55)
    ember = mat('Raider Ember', (0.62, 0.035, 0.012), metallic=0.12, roughness=0.22, emission=(1, 0.02, 0.002), strength=4.2)
    cloth = mat('Raider Cloth', (0.15, 0.055, 0.045), roughness=0.94)

    cube('RaiderTorso', (0, 0, 1.35), (0.48, 0.32, 0.63), ash, arm, 'spine')
    cube('RaiderSkirt', (0, 0, 0.72), (0.52, 0.36, 0.3), cloth, arm, 'root')
    sphere('RaiderHead', (0, 0, 2.24), 0.38, ash, arm, 'head')
    cube('RaiderMask', (0, -0.34, 2.22), (0.3, 0.07, 0.19), rust, arm, 'head')
    sphere('RaiderEye', (0, -0.405, 2.28), 0.08, ember, arm, 'head')
    cube('RaiderArmL', (-0.65, 0, 1.55), (0.44, 0.22, 0.23), cloth, arm, 'arm_L', (0, 0, -0.25))
    cube('RaiderArmR', (0.65, 0, 1.55), (0.44, 0.22, 0.23), ash, arm, 'arm_R', (0, 0, 0.25))
    cube('RaiderLegL', (-0.24, 0, 0.1), (0.22, 0.27, 0.55), cloth, arm, 'leg_L')
    cube('RaiderLegR', (0.24, 0, 0.1), (0.22, 0.27, 0.55), cloth, arm, 'leg_R')
    cube('RaiderBlade', (1.13, -0.05, 0.55), (0.09, 0.06, 0.72), rust, arm, 'weapon', (0, 0.1, 0.18))
    cube('RaiderBladeGlow', (1.13, -0.11, 0.34), (0.04, 0.025, 0.48), ember, arm, 'weapon', (0, 0.1, 0.18))


def reset(bones):
    for b in bones:
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)


def make_action(arm, name, frames, fn):
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    for frame in frames:
        fn(frame, arm.pose.bones)
        for b in arm.pose.bones:
            b.keyframe_insert(data_path='rotation_euler', frame=frame, group=b.name)
            b.keyframe_insert(data_path='location', frame=frame, group=b.name)
    action.use_fake_user = True
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, frames[0], action)
    strip.action_frame_start = frames[0]
    strip.action_frame_end = frames[-1]
    track.mute = True


def animate(arm):
    frames = [1, 10, 20, 30, 40]

    def stalk(frame, bones):
        reset(bones)
        t = (frame - 1) / 39
        s = math.sin(t * math.tau * 2)
        bones['leg_L'].rotation_euler.x = s * 0.36
        bones['leg_R'].rotation_euler.x = -s * 0.36
        bones['spine'].rotation_euler.x = 0.12 + abs(s) * 0.04
        bones['arm_R'].rotation_euler.y = 0.3 + s * 0.08
        bones['head'].rotation_euler.z = s * 0.04

    def attack(frame, bones):
        reset(bones)
        t = (frame - 1) / 39
        wind = math.sin(min(1, t * 1.65) * math.pi)
        strike = math.sin(max(0, t - 0.36) / 0.64 * math.pi)
        bones['arm_R'].rotation_euler.y = 0.4 + wind * 1.0 - strike * 1.35
        bones['weapon'].rotation_euler.x = -wind * 0.7 + strike * 1.2
        bones['spine'].rotation_euler.z = -wind * 0.22 + strike * 0.32

    make_action(arm, 'Raider_Stalk', frames, stalk)
    make_action(arm, 'Raider_Attack', frames, attack)
    arm.animation_data.action = bpy.data.actions['Raider_Stalk']
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 40


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
    print(f'RELIC SIEGE Raider generated: {output} ({output.stat().st_size} bytes)')


def main():
    args = parse_args()
    clear_scene()
    arm = create_rig()
    build(arm)
    animate(arm)
    export(args.output)


if __name__ == '__main__':
    main()
