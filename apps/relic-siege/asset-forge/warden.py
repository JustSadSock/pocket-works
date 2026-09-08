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
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        if 'Base Color' in bsdf.inputs:
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


def apply_mat(obj, mat):
    obj.data.materials.append(mat)


def bone_parent(obj, arm, bone):
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone


def part_cube(name, scale, loc, mat, arm, bone, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new('Forged edges', 'BEVEL')
    bevel.width = 0.08
    bevel.segments = 2
    apply_mat(obj, mat)
    bone_parent(obj, arm, bone)
    return obj


def part_sphere(name, radius, loc, mat, arm, bone):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    apply_mat(obj, mat)
    bone_parent(obj, arm, bone)
    return obj


def create_rig():
    arm_data = bpy.data.armatures.new('AshWardenRig')
    arm = bpy.data.objects.new('AshWardenRig', arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    root = arm_data.edit_bones.new('root')
    root.head = (0, 0, 0)
    root.tail = (0, 0, 1.1)
    spine = arm_data.edit_bones.new('spine')
    spine.head = (0, 0, 1.1)
    spine.tail = (0, 0, 2.7)
    spine.parent = root
    head = arm_data.edit_bones.new('head')
    head.head = (0, 0, 2.7)
    head.tail = (0, 0, 3.55)
    head.parent = spine
    arm_l = arm_data.edit_bones.new('arm_L')
    arm_l.head = (0, 0, 2.35)
    arm_l.tail = (-1.35, 0, 1.95)
    arm_l.parent = spine
    arm_r = arm_data.edit_bones.new('arm_R')
    arm_r.head = (0, 0, 2.35)
    arm_r.tail = (1.35, 0, 1.95)
    arm_r.parent = spine
    crown = arm_data.edit_bones.new('crown')
    crown.head = (0, 0, 3.3)
    crown.tail = (0, 0, 4.3)
    crown.parent = head

    bpy.ops.object.mode_set(mode='POSE')
    for pbone in arm.pose.bones:
        pbone.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def build_guardian(arm):
    ash = material('Warden Ash Iron', (0.08, 0.055, 0.065), metallic=0.55, roughness=0.5)
    bronze = material('Warden Bronze', (0.43, 0.17, 0.055), metallic=0.72, roughness=0.34)
    ember = material('Warden Ember', (0.7, 0.07, 0.015), metallic=0.15, roughness=0.2, emission=(1, 0.04, 0.005), strength=6.0)

    part_cube('Warden_Torso', (0.72, 0.46, 0.92), (0, 0, 1.85), ash, arm, 'spine')
    part_cube('Warden_Pelvis', (0.58, 0.4, 0.42), (0, 0, 0.82), bronze, arm, 'root')
    part_sphere('Warden_Head', 0.48, (0, 0, 3.0), ash, arm, 'head')
    part_sphere('Warden_Eye', 0.17, (0, -0.43, 3.02), ember, arm, 'head')
    part_cube('Warden_Arm_L', (0.62, 0.28, 0.3), (-0.78, 0, 2.15), ash, arm, 'arm_L', (0, 0.15, -0.25))
    part_cube('Warden_Arm_R', (0.62, 0.28, 0.3), (0.78, 0, 2.15), ash, arm, 'arm_R', (0, -0.15, 0.25))
    part_cube('Warden_Gauntlet_L', (0.28, 0.36, 0.36), (-1.5, 0, 1.85), bronze, arm, 'arm_L')
    part_cube('Warden_Gauntlet_R', (0.28, 0.36, 0.36), (1.5, 0, 1.85), bronze, arm, 'arm_R')

    for side in (-1, 1):
        for i in range(3):
            angle = side * (0.18 + i * 0.18)
            part_cube(
                f'Crown_{"L" if side < 0 else "R"}_{i}',
                (0.11, 0.14, 0.68 + i * 0.12),
                (side * (0.32 + i * 0.25), 0, 3.82 + i * 0.12),
                bronze,
                arm,
                'crown',
                (0, angle, -angle * 0.4)
            )

    bpy.ops.mesh.primitive_torus_add(major_radius=0.72, minor_radius=0.08, major_segments=24, minor_segments=8, location=(0, 0, 2.0), rotation=(math.pi / 2, 0, 0))
    halo = bpy.context.object
    halo.name = 'Warden_Chest_Ring'
    apply_mat(halo, ember)
    bone_parent(halo, arm, 'spine')


def animate(arm):
    arm.animation_data_create()
    action = bpy.data.actions.new('Warden_Awaken')
    arm.animation_data.action = action
    frames = [1, 18, 36, 54, 72]
    spine = arm.pose.bones['spine']
    head = arm.pose.bones['head']
    left = arm.pose.bones['arm_L']
    right = arm.pose.bones['arm_R']
    crown = arm.pose.bones['crown']
    for frame in frames:
        t = (frame - 1) / 71
        pulse = math.sin(t * math.tau)
        spine.rotation_euler.x = 0.06 + pulse * 0.035
        head.rotation_euler.z = pulse * 0.09
        left.rotation_euler.y = -0.35 - pulse * 0.16
        left.rotation_euler.z = -0.18 + pulse * 0.08
        right.rotation_euler.y = 0.35 + pulse * 0.16
        right.rotation_euler.z = 0.18 - pulse * 0.08
        crown.rotation_euler.y = pulse * 0.06
        for bone in (spine, head, left, right, crown):
            bone.keyframe_insert(data_path='rotation_euler', frame=frame, group=bone.name)
    arm['animation_hint'] = 'Warden_Awaken'
    action.use_fake_user = True
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 72


def export(output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format='GLB',
        export_apply=True,
        export_animations=True,
        export_materials='EXPORT'
    )
    print(f'RELIC SIEGE Ash Warden generated: {output} ({output.stat().st_size} bytes)')


def main():
    args = parse_args()
    clear_scene()
    arm = create_rig()
    build_guardian(arm)
    animate(arm)
    export(args.output)


if __name__ == '__main__':
    main()
