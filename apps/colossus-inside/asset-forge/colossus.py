import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def mat(name, color, metallic=0.0, roughness=0.55):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.metallic = metallic
    material.roughness = roughness
    return material


def apply_scale(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def finish(obj, material, smooth=True, bevel=0.0):
    if material:
        obj.data.materials.append(material)
    if smooth and hasattr(obj.data, 'polygons'):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if bevel > 0:
        modifier = obj.modifiers.new('Forged bevel', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = 'ANGLE'
    return obj


def cube(name, loc, scale, material, bevel=0.45, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    return finish(obj, material, smooth=False, bevel=bevel)


def uv(name, loc, scale, material, segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    return finish(obj, material)


def cyl(name, loc, radius, depth, material, vertices=28, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    return finish(obj, material, bevel=0.12)


def cone_between(name, start, end, r1, r2, material, vertices=24):
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=delta.length, location=(a + b) * 0.5)
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    obj.rotation_mode = 'XYZ'
    return finish(obj, material, bevel=0.08)


def torus(name, loc, major, minor, material, rot=(0, 0, 0), major_segments=48, minor_segments=12):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.active_object
    obj.name = name
    return finish(obj, material)


def cable(name, points, radius, material, bevel_resolution=2):
    curve = bpy.data.curves.new(name + 'Curve', 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 3
    curve.bevel_depth = radius
    curve.bevel_resolution = bevel_resolution
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for bp, point in zip(spline.bezier_points, points):
        bp.co = point
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def create_rig():
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    rig = bpy.context.active_object
    rig.name = 'ColossusRig'
    rig.data.name = 'ColossusRigData'
    edit = rig.data.edit_bones
    for bone in list(edit):
        edit.remove(bone)

    def add(name, head, tail, parent=None):
        bone = edit.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = edit[parent]
        return bone

    add('root', (0, 0, 0), (0, 0, 6))
    add('pelvis', (0, 0, 30), (0, 0, 44), 'root')
    add('spine_01', (0, 0, 44), (0, 0, 56), 'pelvis')
    add('spine_02', (0, 0, 56), (0, 0, 68), 'spine_01')
    add('chest', (0, 0, 68), (0, 0, 82), 'spine_02')
    add('neck', (0, 0, 82), (0, -1, 94), 'chest')
    add('head', (0, -1, 94), (0, -4, 106), 'neck')

    for side_name, side in (('L', -1), ('R', 1)):
        add(f'shoulder_{side_name}', (side * 11, 0, 78), (side * 23, 0, 76), 'chest')
        add(f'upperarm_{side_name}', (side * 23, 0, 76), (side * 37, 1, 61), f'shoulder_{side_name}')
        add(f'forearm_{side_name}', (side * 37, 1, 61), (side * 42, -2, 42), f'upperarm_{side_name}')
        add(f'hand_{side_name}', (side * 42, -2, 42), (side * 44, -7, 31), f'forearm_{side_name}')
        add(f'thigh_{side_name}', (side * 9, 0, 31), (side * 13, 1, 13), 'pelvis')
        add(f'shin_{side_name}', (side * 13, 1, 13), (side * 11, -1, -9), f'thigh_{side_name}')
        add(f'foot_{side_name}', (side * 11, -1, -9), (side * 11, -10, -12), f'shin_{side_name}')

    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind(obj, rig, bone_name):
    if not hasattr(obj.data, 'vertices'):
        return
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.matrix_world = world
    modifier = obj.modifiers.new(name='ColossusArmature', type='ARMATURE')
    modifier.object = rig
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')


def add_mesh(meshes, obj, bone):
    meshes.append((obj, bone))
    return obj


def build_colossus(rig):
    bone_metal = mat('Ancient bone metal', (0.19, 0.22, 0.21), metallic=0.65, roughness=0.38)
    armor = mat('Storm armor', (0.10, 0.125, 0.13), metallic=0.78, roughness=0.33)
    armor_edge = mat('Worn alloy edge', (0.34, 0.31, 0.25), metallic=0.83, roughness=0.29)
    tissue = mat('Sinew polymer', (0.19, 0.075, 0.06), metallic=0.08, roughness=0.58)
    cable_mat = mat('Conductive cable', (0.035, 0.047, 0.046), metallic=0.44, roughness=0.5)
    emissive = mat('Sensor ceramic', (0.18, 0.52, 0.49), metallic=0.18, roughness=0.25)
    fracture = mat('Fractured armor', (0.135, 0.15, 0.15), metallic=0.75, roughness=0.46)
    meshes = []

    add_mesh(meshes, uv('EXT_PelvisCore', (0, 0, 35), (14, 9, 9), tissue, 48, 28), 'pelvis')
    add_mesh(meshes, cube('EXT_PelvisArmor', (0, 1.2, 37), (13.5, 7.5, 4.6), armor, 1.0, rot=(0.08, 0, 0)), 'pelvis')

    spine_z = [46, 54, 62, 70, 78]
    spine_bones = ['spine_01', 'spine_01', 'spine_02', 'spine_02', 'chest']
    for i, (z, bone) in enumerate(zip(spine_z, spine_bones), start=1):
        add_mesh(meshes, torus(f'EXT_SpineRing_{i}', (0, 1.7, z), 6.4 - i * 0.25, 0.8, bone_metal, rot=(math.pi/2, 0, 0)), bone)
        add_mesh(meshes, cube(f'EXT_SpineBlock_{i}', (0, 0.5, z), (6.8, 5.3, 2.2), bone_metal, 0.55), bone)

    add_mesh(meshes, uv('EXT_ChestSinew', (0, 0, 75), (18, 11.5, 14), tissue, 52, 30), 'chest')
    plate_defs = [
        (-11.0, 4.9, 75.5, 7.0, 5.3, 2.2, -0.08),
        (0.0, 5.8, 78.0, 7.5, 6.0, 2.5, 0.0),
        (11.0, 4.9, 75.5, 7.0, 5.3, 2.2, 0.08),
        (-8.5, 5.4, 66.5, 6.0, 5.0, 2.0, 0.05),
        (4.5, 5.6, 66.0, 6.2, 5.0, 2.0, -0.06),
    ]
    for i, (x, y, z, sx, sy, sz, rz) in enumerate(plate_defs, 1):
        p = cube(f'EXT_BackPlate_{i}', (x, y, z), (sx, sy, sz), armor, 0.85, rot=(0.16, 0.02 * x, rz))
        add_mesh(meshes, p, 'chest' if z > 70 else 'spine_02')
        rail = cone_between(f'EXT_BackRail_{i}', (x - sx * .78, y + sy * .82, z + sz), (x + sx * .78, y + sy * .82, z + sz), 0.22, 0.22, armor_edge, 16)
        add_mesh(meshes, rail, 'chest' if z > 70 else 'spine_02')

    for side_name, side in (('L', -1), ('R', 1)):
        for i in range(5):
            z = 65 + i * 5
            rib = cone_between(f'EXT_Rib_{side_name}_{i+1}', (side * 4.5, 0, z), (side * (18 - i * 0.8), -0.5, z - 2.5), 1.15, 0.5, bone_metal, 20)
            add_mesh(meshes, rib, 'spine_02' if z < 72 else 'chest')

    for side_name, side in (('L', -1), ('R', 1)):
        shoulder_bone = f'shoulder_{side_name}'
        upper_bone = f'upperarm_{side_name}'
        fore_bone = f'forearm_{side_name}'
        hand_bone = f'hand_{side_name}'
        add_mesh(meshes, uv(f'EXT_ShoulderJoint_{side_name}', (side * 22, 0, 76), (7.5, 7.5, 7.5), bone_metal, 40, 24), shoulder_bone)
        add_mesh(meshes, torus(f'EXT_ShoulderCollar_{side_name}', (side * 18.5, 0.2, 77), 6.8, 0.9, armor_edge, rot=(0, math.pi/2, 0)), shoulder_bone)
        add_mesh(meshes, cube(f'EXT_ShoulderDeck_{side_name}', (side * 20.5, 5.7, 79), (7.4, 4.2, 2.2), armor, 0.7, rot=(0.12, 0, side * 0.07)), shoulder_bone)
        add_mesh(meshes, cone_between(f'EXT_UpperArm_{side_name}', (side * 24, 0, 74), (side * 36, 1, 61), 5.5, 4.2, tissue, 32), upper_bone)
        add_mesh(meshes, cube(f'EXT_UpperArmArmor_{side_name}', (side * 30, 3.2, 68), (4.7, 4.4, 7.2), armor, 0.75, rot=(side * 0.08, side * 0.12, -side * 0.5)), upper_bone)
        add_mesh(meshes, uv(f'EXT_Elbow_{side_name}', (side * 37.5, 0.5, 57), (5.2, 5.2, 5.2), bone_metal, 36, 22), fore_bone)
        add_mesh(meshes, cone_between(f'EXT_Forearm_{side_name}', (side * 38, 0, 56), (side * 42, -2, 40), 4.5, 3.2, tissue, 28), fore_bone)
        add_mesh(meshes, cube(f'EXT_ForearmArmor_{side_name}', (side * 40.5, 1.2, 48), (3.8, 4.0, 7.0), armor, 0.65, rot=(0, side * 0.12, -side * 0.22)), fore_bone)
        add_mesh(meshes, uv(f'EXT_Hand_{side_name}', (side * 43, -4, 32), (4.2, 6.0, 6.0), armor, 32, 20), hand_bone)

    for side_name, side in (('L', -1), ('R', 1)):
        thigh = f'thigh_{side_name}'
        shin = f'shin_{side_name}'
        foot = f'foot_{side_name}'
        add_mesh(meshes, uv(f'EXT_Hip_{side_name}', (side * 10.5, 0, 31), (6.5, 6.5, 6.5), bone_metal, 36, 22), thigh)
        add_mesh(meshes, cone_between(f'EXT_Thigh_{side_name}', (side * 11, 0, 27), (side * 13, 1, 10), 5.5, 4.3, tissue, 28), thigh)
        add_mesh(meshes, cube(f'EXT_ThighArmor_{side_name}', (side * 12, 3.4, 20), (5.2, 4.0, 8.0), armor, 0.8), thigh)
        add_mesh(meshes, uv(f'EXT_Knee_{side_name}', (side * 13, 0.4, 8), (5.0, 5.0, 5.0), bone_metal, 34, 20), shin)
        add_mesh(meshes, cone_between(f'EXT_Shin_{side_name}', (side * 13, 0, 5), (side * 11, -1, -9), 4.2, 3.2, tissue, 26), shin)
        add_mesh(meshes, cube(f'EXT_ShinArmor_{side_name}', (side * 12, 2.3, -1.5), (4.3, 3.5, 7.0), armor, 0.7), shin)
        add_mesh(meshes, cube(f'EXT_Foot_{side_name}', (side * 11, -6, -11), (5.2, 8.0, 2.2), armor, 0.8), foot)

    for z in (84, 88, 92):
        add_mesh(meshes, torus(f'EXT_NeckRing_{z}', (0, -0.7, z), 5.0 - (z-84)*0.12, 0.65, armor_edge, rot=(math.pi/2, 0, 0)), 'neck')
    add_mesh(meshes, uv('EXT_HeadCore', (0, -3, 101), (9.5, 8.0, 8.0), tissue, 44, 26), 'head')
    add_mesh(meshes, cube('EXT_HeadCrown', (0, 1.8, 104), (8.8, 5.8, 3.0), armor, 0.9, rot=(0.15, 0, 0)), 'head')
    add_mesh(meshes, cube('EXT_HeadDeck', (0, 5.5, 101), (7.5, 4.8, 2.0), armor, 0.8, rot=(0.05, 0, 0)), 'head')
    for side_name, side in (('L', -1), ('R', 1)):
        horn = cone_between(f'EXT_Horn_{side_name}', (side * 5.0, -1, 106), (side * 12.5, -2.5, 118), 1.15, 0.12, armor_edge, 24)
        add_mesh(meshes, horn, 'head')
        antenna = cable(f'EXT_Antenna_{side_name}', [(side*2.8, -1, 108), (side*4.2, -4, 116), (side*5.8, -2, 126)], 0.22, cable_mat)
        add_mesh(meshes, antenna, 'head')
        eye = uv(f'EXT_SensorEye_{side_name}', (side * 3.4, -10.0, 102), (1.6, 0.6, 1.6), emissive, 30, 18)
        add_mesh(meshes, eye, 'head')

    cable_specs = [('A', -9.0, 3.0), ('B', -4.0, 5.0), ('C', 4.5, 4.0), ('D', 9.5, 2.5)]
    for label, x, sag in cable_specs:
        obj = cable(f'EXT_Cable_{label}', [(x, 6.5, 62), (x*1.05, 9.0 + sag, 70), (x*0.92, 7.0, 82)], 0.3, cable_mat)
        add_mesh(meshes, obj, 'chest')

    intact = cube('EXT_FracturePlate_Intact', (-5.2, 9.1, 73.0), (4.8, 2.2, 4.0), fracture, 0.55, rot=(0.12, 0.05, -0.16))
    add_mesh(meshes, intact, 'chest')
    shard_defs = [
        (-7.8, 9.3, 75.0, 1.7, 1.8, 1.8),
        (-4.7, 9.7, 76.0, 1.8, 1.5, 1.4),
        (-2.7, 9.2, 72.5, 1.5, 1.7, 2.0),
        (-6.4, 9.8, 69.9, 1.9, 1.4, 1.3),
        (-3.8, 9.6, 70.5, 1.3, 1.5, 1.4),
    ]
    for i, (x, y, z, sx, sy, sz) in enumerate(shard_defs, 1):
        shard = cube(f'EXT_FractureShard_{i}', (x, y, z), (sx, sy, sz), fracture, 0.25, rot=(0.12+i*.03, i*.04, -0.22+i*.07))
        add_mesh(meshes, shard, 'chest')

    add_mesh(meshes, torus('EXT_HatchFrame', (5.8, 9.1, 70.2), 3.1, 0.55, armor_edge, rot=(math.pi/2, 0, 0)), 'chest')
    add_mesh(meshes, cube('EXT_HatchDoor', (5.8, 9.3, 70.2), (2.5, 0.55, 2.5), armor, 0.35, rot=(0, 0, 0.05)), 'chest')

    for i in range(6):
        x = -12 + i * 4.8
        vane = cube(f'EXT_SuspendedVane_{i+1}', (x, 8.6, 60.5 + (i%2)*2.5), (1.2, 0.45, 3.8), armor_edge, 0.22, rot=(0.08, 0.04*i, (-0.14 + i*.05)))
        add_mesh(meshes, vane, 'spine_02')

    for obj, bone in meshes:
        bind(obj, rig, bone)
    return [obj for obj, _ in meshes]


def reset_pose(rig):
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_mode = 'XYZ'
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)


def key_rot(rig, bone_name, frame, x=0, y=0, z=0):
    bone = rig.pose.bones[bone_name]
    bone.rotation_mode = 'XYZ'
    bone.rotation_euler = (x, y, z)
    bone.keyframe_insert('rotation_euler', frame=frame)


def key_loc(rig, bone_name, frame, x=0, y=0, z=0):
    bone = rig.pose.bones[bone_name]
    bone.location = (x, y, z)
    bone.keyframe_insert('location', frame=frame)


def new_action(rig, name):
    reset_pose(rig)
    action = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = action
    return action


def stash_action(rig, action, frame_end):
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, 1, action)
    strip.action_frame_start = 1
    strip.action_frame_end = frame_end
    track.mute = True


def walk_key(rig, frame, t, strain=1.0):
    step = math.sin(t)
    double = math.sin(t * 2)
    key_loc(rig, 'pelvis', frame, z=0.72 * (0.5 + 0.5 * math.cos(t * 2)) * strain)
    key_rot(rig, 'pelvis', frame, x=0.025 * double * strain, y=0.035 * step, z=0.055 * step * strain)
    key_rot(rig, 'spine_01', frame, x=-0.02 * double, y=-0.018 * step, z=-0.035 * step * strain)
    key_rot(rig, 'spine_02', frame, x=0.018 * double, y=-0.015 * step, z=-0.03 * step * strain)
    key_rot(rig, 'chest', frame, x=0.018 * double, y=0.015 * step, z=-0.022 * step * strain)
    key_rot(rig, 'neck', frame, x=-0.018 * double, y=-0.025 * step, z=0.018 * step)
    key_rot(rig, 'head', frame, x=0.012 * double, y=0.02 * step, z=0.012 * step)

    for side_name, phase in (('L', 0), ('R', math.pi)):
        s = math.sin(t + phase)
        c = math.cos(t + phase)
        lift = max(0, c)
        key_rot(rig, f'thigh_{side_name}', frame, x=0.18 * s * strain, z=0.028 * s)
        key_rot(rig, f'shin_{side_name}', frame, x=-0.28 * lift * strain + 0.05 * s)
        key_rot(rig, f'foot_{side_name}', frame, x=0.18 * lift)
        key_rot(rig, f'shoulder_{side_name}', frame, x=-0.035 * s, z=0.03 * s)
        key_rot(rig, f'upperarm_{side_name}', frame, x=-0.12 * s, y=0.025 * s)
        key_rot(rig, f'forearm_{side_name}', frame, x=0.07 * s)
        key_rot(rig, f'hand_{side_name}', frame, x=-0.04 * s)


def animate(rig):
    walk = new_action(rig, 'Walk')
    for frame in (1, 13, 25, 37, 49, 61, 73, 85, 97):
        t = (frame - 1) / 96 * math.tau
        walk_key(rig, frame, t, 1.0)
    stash_action(rig, walk, 97)

    strain = new_action(rig, 'Strain')
    for frame in (1, 13, 25, 37, 49, 61, 73, 85, 97):
        t = (frame - 1) / 96 * math.tau
        walk_key(rig, frame, t, 1.65)
        hitch = max(0.0, math.sin(t + 0.35))
        key_rot(rig, 'chest', frame, x=0.05 * hitch, y=0.02 * math.sin(t), z=-0.09 * hitch)
        key_rot(rig, 'shoulder_L', frame, x=0.12 * hitch, z=-0.14 * hitch)
        key_rot(rig, 'thigh_L', frame, x=0.25 * math.sin(t) - 0.16 * hitch, z=-0.06 * hitch)
    stash_action(rig, strain, 97)

    recover = new_action(rig, 'Recover')
    for frame, amount in ((1, 1.0), (18, 0.65), (36, 0.3), (54, 0.0)):
        key_loc(rig, 'pelvis', frame, z=0.4 * amount)
        key_rot(rig, 'pelvis', frame, x=0.05 * amount, z=-0.09 * amount)
        key_rot(rig, 'chest', frame, x=-0.04 * amount, z=0.07 * amount)
        key_rot(rig, 'head', frame, x=0.035 * amount, y=-0.025 * amount)
    stash_action(rig, recover, 54)

    rig.animation_data.action = walk
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 97
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_set(1)


def export_glb(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_morph=False,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_frame_range=False,
    )
    if not output.exists() or output.stat().st_size < 80_000:
        raise RuntimeError(f'Colossus GLB export is unexpectedly small: {output}')


def main():
    args = parse_args()
    output = Path(args.output).resolve()
    clear_scene()
    rig = create_rig()
    build_colossus(rig)
    animate(rig)
    export_glb(output)
    print(f'COLOSSUS exterior generated {output} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
