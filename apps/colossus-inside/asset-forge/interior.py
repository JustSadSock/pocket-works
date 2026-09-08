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
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.metallic = metallic
    m.roughness = roughness
    return m


def finish(obj, material, smooth=True, bevel=0.0):
    if material:
        obj.data.materials.append(material)
    if smooth and hasattr(obj.data, 'polygons'):
        for p in obj.data.polygons:
            p.use_smooth = True
    if bevel > 0:
        mod = obj.modifiers.new('Machined edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
    return obj


def apply_scale(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def cube(name, loc, scale, material, rot=(0,0,0), bevel=.22):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    return finish(obj, material, smooth=False, bevel=bevel)


def uv(name, loc, scale, material, segments=36, rings=22):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    return finish(obj, material)


def cyl(name, loc, radius, depth, material, rot=(0,0,0), vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    return finish(obj, material, bevel=.12)


def torus(name, loc, major, minor, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=12, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    return finish(obj, material)


def tube(name, points, radius, material):
    curve = bpy.data.curves.new(name + 'Curve', 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 3
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
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
    bpy.ops.object.armature_add(enter_editmode=True, location=(0,0,0))
    rig = bpy.context.active_object
    rig.name = 'InteriorRig'
    rig.data.name = 'InteriorRigData'
    edit = rig.data.edit_bones
    for b in list(edit):
        edit.remove(b)

    def add(name, head, tail, parent=None):
        b = edit.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = edit[parent]
        return b

    add('root', (0,0,0), (0,0,2))
    add('chamber', (0,0,2), (0,0,6), 'root')
    add('heart', (0,8,5), (0,8,9), 'chamber')
    add('piston_L', (-7,3,5), (-7,8,5), 'chamber')
    add('piston_R', (7,3,5), (7,8,5), 'chamber')
    add('stabilizer', (0,18,4), (0,18,8), 'chamber')
    add('valve', (0,18,8), (0,20,8), 'stabilizer')
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind(obj, rig, bone):
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.matrix_world = world
    mod = obj.modifiers.new('InteriorArmature', 'ARMATURE')
    mod.object = rig
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')


def build(rig):
    frame = mat('Interior forged frame', (0.12, 0.15, 0.15), .72, .38)
    edge = mat('Copper ceramic edge', (0.34, 0.21, 0.12), .65, .34)
    muscle = mat('Dark synthetic muscle', (0.20, 0.055, 0.045), .06, .62)
    membrane = mat('Membrane', (0.22, 0.11, 0.10), .02, .76)
    cable_m = mat('Black cable', (0.025, 0.033, 0.034), .28, .48)
    energy = mat('Energy ceramic', (0.18, 0.64, 0.58), .12, .20)
    meshes = []

    def add(obj, bone='chamber'):
        meshes.append((obj, bone))
        return obj

    for i in range(14):
        y = -10 + i * 2.4
        add(cube(f'INT_SpineVertebra_{i+1}', (0, y, -1.1 + math.sin(i*.55)*.22), (6.8, .82, .65), frame, rot=(0,0, math.sin(i*.6)*.025), bevel=.28))
        if i < 13:
            add(cyl(f'INT_SpineJoint_{i+1}', (0, y+1.2, -.75), 1.4, 1.2, edge, rot=(math.pi/2,0,0), vertices=28))

    for i in range(8):
        y = -8 + i * 4.2
        for side_name, side in (('L',-1),('R',1)):
            add(cyl(f'INT_RibPost_{side_name}_{i+1}', (side*8.0, y, 4.2), .75, 9.0, frame, vertices=20))
            arch = torus(f'INT_RibArch_{side_name}_{i+1}', (0, y, 8.2), 8.0, .62, frame, rot=(math.pi/2,0,0))
            add(arch)
        if i % 2 == 0:
            add(cube(f'INT_Membrane_{i+1}', (0, y, 6.5), (8.7, .22, 3.6), membrane, bevel=.12))

    add(uv('INT_HeartCore', (0, 7.5, 5.8), (4.1, 3.5, 4.7), muscle, 48, 28), 'heart')
    add(torus('INT_HeartClamp_A', (0, 7.5, 5.8), 4.6, .55, edge, rot=(math.pi/2,0,0)), 'heart')
    add(torus('INT_HeartClamp_B', (0, 7.5, 5.8), 3.8, .42, frame, rot=(0,math.pi/2,0)), 'heart')
    for i, angle in enumerate((-.65, -.22, .24, .66), 1):
        x = math.sin(angle)*3.7
        add(cyl(f'INT_HeartValve_{i}', (x, 7.2, 9.7), .55, 3.2, edge, rot=(0.08*angle,0,0), vertices=20), 'heart')

    for side_name, side in (('L',-1),('R',1)):
        bone = f'piston_{side_name}'
        add(cyl(f'INT_PistonCase_{side_name}', (side*7.0, 4.5, 4.0), 2.0, 8.5, frame, rot=(math.pi/2,0,0), vertices=28), bone)
        add(cyl(f'INT_PistonRod_{side_name}', (side*7.0, 8.0, 4.0), .82, 8.0, edge, rot=(math.pi/2,0,0), vertices=24), bone)
        add(uv(f'INT_PistonJoint_{side_name}', (side*7.0, 12.0, 4.0), (2.4,2.4,2.4), frame, 30,18), bone)

    add(torus('INT_StabilizerOuter', (0, 18.0, 5.0), 5.2, .62, frame, rot=(math.pi/2,0,0)), 'stabilizer')
    add(torus('INT_StabilizerMid', (0, 18.0, 5.0), 3.5, .42, edge, rot=(math.pi/2,0,0)), 'stabilizer')
    add(uv('INT_StabilizerCore', (0, 18.0, 5.0), (2.15,1.1,2.15), energy, 36,22), 'stabilizer')
    add(cyl('INT_RepairAxle', (0, 15.9, 5.0), .65, 4.2, edge, rot=(math.pi/2,0,0), vertices=24), 'stabilizer')
    add(cube('INT_RepairLever', (0, 13.65, 7.0), (.42, .35, 2.3), edge, rot=(-.18,0,.10), bevel=.14), 'valve')
    add(torus('INT_RepairWheel', (0, 13.4, 9.0), 1.5, .26, edge, rot=(math.pi/2,0,0)), 'valve')

    tube_specs = [
        ('A', [(-7,-8,8),(-8,0,10),(-6,8,9),(-4,18,8)], .33),
        ('B', [(7,-9,7),(8,-1,9),(6,7,10),(4,18,8)], .30),
        ('C', [(-4,-10,2),(-5,0,1),(-3,10,2),(-2,18,4)], .23),
        ('D', [(4,-10,2),(5,0,1),(3,10,2),(2,18,4)], .23),
    ]
    for label, points, radius in tube_specs:
        add(tube(f'INT_Cable_{label}', points, radius, cable_m))

    for i in range(7):
        x = -6 + i*2.0
        add(tube(f'INT_HangingCable_{i+1}', [(x, 2+i*.7, 11), (x+.6*math.sin(i), 3+i*.7, 8), (x-.3, 5+i*.7, 6.5)], .12, cable_m))

    for obj, bone in meshes:
        bind(obj, rig, bone)
    return [o for o,_ in meshes]


def reset_pose(rig):
    for b in rig.pose.bones:
        b.location = (0,0,0)
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (0,0,0)
        b.scale = (1,1,1)


def key_rot(rig, bone, frame, x=0,y=0,z=0):
    b = rig.pose.bones[bone]
    b.rotation_mode = 'XYZ'
    b.rotation_euler = (x,y,z)
    b.keyframe_insert('rotation_euler', frame=frame)


def key_loc(rig, bone, frame, x=0,y=0,z=0):
    b = rig.pose.bones[bone]
    b.location = (x,y,z)
    b.keyframe_insert('location', frame=frame)


def key_scale(rig, bone, frame, x=1,y=1,z=1):
    b = rig.pose.bones[bone]
    b.scale = (x,y,z)
    b.keyframe_insert('scale', frame=frame)


def new_action(rig, name):
    reset_pose(rig)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    return act


def stash(rig, action, frame_end):
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, 1, action)
    strip.action_frame_start = 1
    strip.action_frame_end = frame_end
    track.mute = True


def animate(rig):
    pulse = new_action(rig, 'Pulse')
    for frame, a in ((1,0),(8,1),(15,.12),(28,0),(36,1),(43,.1),(60,0)):
        key_scale(rig,'heart',frame,1+.09*a,1+.08*a,1+.12*a)
        key_loc(rig,'piston_L',frame,y=.8*a)
        key_loc(rig,'piston_R',frame,y=-.55*a)
        key_rot(rig,'stabilizer',frame,y=.08*math.sin(frame*.18))
    stash(rig,pulse,60)

    fail = new_action(rig, 'Fail')
    for frame in (1,8,16,24,32,40,48,56,64):
        t=(frame-1)/63*math.tau
        jerk=max(0,math.sin(t*2.0))
        key_scale(rig,'heart',frame,1+.13*jerk,1+.06*jerk,1+.15*jerk)
        key_loc(rig,'piston_L',frame,y=1.5*math.sin(t))
        key_loc(rig,'piston_R',frame,y=-1.1*math.sin(t+.55))
        key_rot(rig,'stabilizer',frame,z=.16*math.sin(t*1.4),y=.12*math.sin(t*.7))
        key_rot(rig,'valve',frame,y=.22*math.sin(t*2.5))
    stash(rig,fail,64)

    recovered = new_action(rig, 'Recovered')
    for frame in (1,16,31,46,61):
        t=(frame-1)/60*math.tau
        beat=max(0, math.sin(t))
        key_scale(rig,'heart',frame,1+.075*beat,1+.06*beat,1+.085*beat)
        key_loc(rig,'piston_L',frame,y=.55*math.sin(t))
        key_loc(rig,'piston_R',frame,y=-.55*math.sin(t))
        key_rot(rig,'stabilizer',frame,y=.28*t)
        key_rot(rig,'valve',frame,y=.12*math.sin(t))
    stash(rig,recovered,61)

    rig.animation_data.action = fail
    bpy.context.scene.frame_start=1
    bpy.context.scene.frame_end=64
    bpy.context.scene.render.fps=30
    bpy.context.scene.frame_set(1)


def export_glb(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format='GLB', export_animations=True, export_skins=True,
        export_morph=False, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_range=False
    )
    if not output.exists() or output.stat().st_size < 60_000:
        raise RuntimeError(f'Interior GLB export unexpectedly small: {output}')


def main():
    args=parse_args()
    output=Path(args.output).resolve()
    clear_scene()
    rig=create_rig()
    build(rig)
    animate(rig)
    export_glb(output)
    print(f'COLOSSUS interior generated {output} ({output.stat().st_size} bytes)')


if __name__=='__main__':
    main()
