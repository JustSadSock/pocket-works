import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.armatures,
        bpy.data.actions,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def material(name, color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.roughness = roughness
    mat.metallic = metallic
    return mat


def finish_mesh(obj, mat, smooth=True):
    if mat:
        obj.data.materials.append(mat)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def apply_scale(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def uv(name, location, scale, mat, segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    return finish_mesh(obj, mat)


def tapered_between(name, start, end, r1, r2, mat, vertices=20):
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=r1,
        radius2=r2,
        depth=delta.length,
        location=(a + b) * 0.5,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    return finish_mesh(obj, mat)


def torus(name, location, scale, mat):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=1.0,
        minor_radius=0.055,
        major_segments=64,
        minor_segments=12,
        location=location,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    return finish_mesh(obj, mat)


def create_rig():
    bpy.ops.object.armature_add(enter_editmode=True, location=(0.0, 0.0, 0.0))
    rig = bpy.context.active_object
    rig.name = "CrabRig"
    rig.data.name = "CrabRigData"
    rig.show_in_front = True

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

    add("root", (0, 0, 0), (0, 0, 0.28))
    add("body", (0, 0, 0.28), (0, 0, 0.78), "root")

    leg_y = (-0.68, -0.23, 0.24, 0.65)
    for side_name, side in (("L", -1.0), ("R", 1.0)):
        for index, y in enumerate(leg_y, start=1):
            outer_y = y + (index - 2.5) * 0.045
            upper = f"leg_{side_name}_{index}_upper"
            lower = f"leg_{side_name}_{index}_lower"
            add(upper, (side * 0.86, y, 0.46), (side * 1.62, outer_y, 0.30), "body")
            add(lower, (side * 1.62, outer_y, 0.30), (side * 2.30, outer_y + 0.10, 0.08), upper)

        claw = f"claw_{side_name}"
        pincer_a = f"pincer_{side_name}_a"
        pincer_b = f"pincer_{side_name}_b"
        add(claw, (side * 0.70, 0.70, 0.55), (side * 1.35, 1.08, 0.68), "body")
        add(pincer_a, (side * 1.35, 1.08, 0.68), (side * 1.72, 1.52, 0.74), claw)
        add(pincer_b, (side * 1.35, 1.08, 0.68), (side * 1.58, 1.58, 0.48), claw)

    add("eye_L", (-0.40, 0.72, 0.63), (-0.48, 1.05, 1.00), "body")
    add("eye_R", (0.40, 0.72, 0.63), (0.48, 1.05, 1.00), "body")

    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def bind(obj, rig, bone_name):
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.matrix_world = world
    modifier = obj.modifiers.new(name="CrabArmature", type="ARMATURE")
    modifier.object = rig
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")


def build_crab(rig):
    shell = material("Carapace vermilion", (0.58, 0.115, 0.055), roughness=0.34, metallic=0.02)
    shell_light = material("Carapace highlights", (0.86, 0.28, 0.12), roughness=0.39)
    shell_dark = material("Joint burgundy", (0.23, 0.035, 0.025), roughness=0.48)
    underside = material("Warm underside", (0.62, 0.31, 0.20), roughness=0.58)
    eye_mat = material("Wet black eyes", (0.008, 0.006, 0.004), roughness=0.12)

    meshes = []
    carapace = uv("Carapace", (0, 0, 0.61), (1.52, 1.06, 0.43), shell, 56, 32)
    meshes.append((carapace, "body"))
    belly = uv("Underbody", (0, -0.02, 0.36), (1.22, 0.84, 0.27), underside, 40, 22)
    meshes.append((belly, "body"))
    rim = torus("Shell rim", (0, 0, 0.60), (1.39, 0.94, 0.42), shell_dark)
    meshes.append((rim, "body"))

    # Low-relief plates break the perfect-sphere look and catch grazing light.
    for idx, (x, y, s) in enumerate((
        (-0.76, -0.20, 0.18), (-0.34, -0.43, 0.15), (0.18, -0.47, 0.17),
        (0.68, -0.18, 0.16), (-0.58, 0.27, 0.13), (0.02, 0.20, 0.16), (0.57, 0.31, 0.12),
    )):
        plate = uv(f"ShellPlate{idx+1}", (x, y, 0.91), (s * 1.3, s, s * 0.22), shell_light, 24, 12)
        meshes.append((plate, "body"))

    # Eyes and stalks.
    for side_name, side in (("L", -1.0), ("R", 1.0)):
        stalk = tapered_between(
            f"EyeStalk_{side_name}",
            (side * 0.40, 0.72, 0.66),
            (side * 0.48, 1.05, 1.00),
            0.075,
            0.055,
            shell_dark,
            18,
        )
        meshes.append((stalk, f"eye_{side_name}"))
        eye = uv(f"Eye_{side_name}", (side * 0.49, 1.07, 1.03), (0.13, 0.12, 0.12), eye_mat, 28, 16)
        meshes.append((eye, f"eye_{side_name}"))

    leg_y = (-0.68, -0.23, 0.24, 0.65)
    for side_name, side in (("L", -1.0), ("R", 1.0)):
        for index, y in enumerate(leg_y, start=1):
            outer_y = y + (index - 2.5) * 0.045
            knee = (side * 1.62, outer_y, 0.30)
            foot = (side * 2.30, outer_y + 0.10, 0.08)
            upper = tapered_between(
                f"Leg_{side_name}_{index}_Upper",
                (side * 0.86, y, 0.46),
                knee,
                0.16,
                0.105,
                shell,
                24,
            )
            lower = tapered_between(
                f"Leg_{side_name}_{index}_Lower",
                knee,
                foot,
                0.11,
                0.055,
                shell_dark,
                22,
            )
            joint = uv(
                f"Leg_{side_name}_{index}_Joint",
                knee,
                (0.14, 0.14, 0.12),
                shell_light,
                20,
                12,
            )
            meshes.extend((
                (upper, f"leg_{side_name}_{index}_upper"),
                (lower, f"leg_{side_name}_{index}_lower"),
                (joint, f"leg_{side_name}_{index}_upper"),
            ))

        palm = uv(
            f"ClawPalm_{side_name}",
            (side * 1.34, 1.10, 0.68),
            (0.42, 0.34, 0.27),
            shell,
            36,
            20,
        )
        arm = tapered_between(
            f"ClawArm_{side_name}",
            (side * 0.70, 0.70, 0.55),
            (side * 1.34, 1.10, 0.68),
            0.22,
            0.18,
            shell_dark,
            24,
        )
        pincer_a = tapered_between(
            f"PincerA_{side_name}",
            (side * 1.36, 1.14, 0.71),
            (side * 1.75, 1.55, 0.78),
            0.18,
            0.055,
            shell_light,
            28,
        )
        pincer_b = tapered_between(
            f"PincerB_{side_name}",
            (side * 1.34, 1.11, 0.64),
            (side * 1.60, 1.60, 0.47),
            0.16,
            0.05,
            shell,
            28,
        )
        meshes.extend((
            (arm, f"claw_{side_name}"),
            (palm, f"claw_{side_name}"),
            (pincer_a, f"pincer_{side_name}_a"),
            (pincer_b, f"pincer_{side_name}_b"),
        ))

    for obj, bone_name in meshes:
        bind(obj, rig, bone_name)


def reset_pose(rig):
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)


def key_rot(rig, bone_name, frame, x=0.0, y=0.0, z=0.0):
    bone = rig.pose.bones[bone_name]
    bone.rotation_mode = "XYZ"
    bone.rotation_euler = (x, y, z)
    bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)


def key_loc(rig, bone_name, frame, x=0.0, y=0.0, z=0.0):
    bone = rig.pose.bones[bone_name]
    bone.location = (x, y, z)
    bone.keyframe_insert(data_path="location", frame=frame, group=bone_name)


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


def animate(rig):
    # Idle: breathing shell, asymmetric claw drift and eye curiosity.
    idle = new_action(rig, "Idle")
    for frame, phase in ((1, 0.0), (16, 1.0), (32, 0.0), (48, -1.0), (64, 0.0)):
        key_loc(rig, "body", frame, z=0.025 * phase)
        key_rot(rig, "body", frame, z=0.025 * phase)
        key_rot(rig, "claw_L", frame, x=0.05 * phase, z=-0.035 * phase)
        key_rot(rig, "claw_R", frame, x=-0.035 * phase, z=0.028 * phase)
        key_rot(rig, "eye_L", frame, y=0.055 * phase)
        key_rot(rig, "eye_R", frame, y=-0.045 * phase)
    stash_action(rig, idle, 64)

    # Scuttle: four-beat alternating legs and a small lateral body load transfer.
    scuttle = new_action(rig, "Scuttle")
    for frame in (1, 7, 13, 19, 25):
        t = (frame - 1) / 24.0 * math.tau
        key_loc(rig, "body", frame, z=0.035 + 0.025 * math.sin(t * 2.0))
        key_rot(rig, "body", frame, y=0.035 * math.sin(t), z=0.06 * math.sin(t))
        for side_name, side_phase in (("L", 0.0), ("R", math.pi)):
            for index in range(1, 5):
                phase = t + side_phase + (index % 2) * math.pi
                swing = math.sin(phase)
                lift = max(0.0, math.cos(phase))
                key_rot(rig, f"leg_{side_name}_{index}_upper", frame, x=0.12 * lift, y=0.40 * swing, z=0.06 * swing)
                key_rot(rig, f"leg_{side_name}_{index}_lower", frame, x=-0.22 * lift, y=-0.48 * swing, z=-0.04 * swing)
        key_rot(rig, "claw_L", frame, y=-0.07 * math.sin(t))
        key_rot(rig, "claw_R", frame, y=0.07 * math.sin(t))
    stash_action(rig, scuttle, 25)

    pinch = new_action(rig, "Pinch")
    for frame, close in ((1, 0.0), (5, 0.35), (9, 1.0), (13, 0.65), (19, 0.0)):
        key_loc(rig, "body", frame, z=0.035 * math.sin(close * math.pi))
        key_rot(rig, "claw_L", frame, x=-0.13 * close, y=0.12 * close, z=-0.18 * close)
        key_rot(rig, "claw_R", frame, x=-0.13 * close, y=-0.12 * close, z=0.18 * close)
        key_rot(rig, "pincer_L_a", frame, z=0.52 * close)
        key_rot(rig, "pincer_L_b", frame, z=-0.66 * close)
        key_rot(rig, "pincer_R_a", frame, z=-0.52 * close)
        key_rot(rig, "pincer_R_b", frame, z=0.66 * close)
    stash_action(rig, pinch, 19)

    celebrate = new_action(rig, "Celebrate")
    for frame, phase in ((1, 0.0), (8, 1.0), (16, 0.15), (24, 1.0), (32, 0.15), (40, 0.0)):
        key_loc(rig, "body", frame, z=0.18 * phase)
        key_rot(rig, "body", frame, x=-0.07 * phase, z=0.045 * math.sin(frame * 0.45))
        key_rot(rig, "claw_L", frame, x=-0.70 * phase, y=0.18 * phase, z=-0.28 * phase)
        key_rot(rig, "claw_R", frame, x=-0.70 * phase, y=-0.18 * phase, z=0.28 * phase)
        key_rot(rig, "pincer_L_a", frame, z=0.35 * phase)
        key_rot(rig, "pincer_L_b", frame, z=-0.40 * phase)
        key_rot(rig, "pincer_R_a", frame, z=-0.35 * phase)
        key_rot(rig, "pincer_R_b", frame, z=0.40 * phase)
    stash_action(rig, celebrate, 40)

    rig.animation_data.action = idle
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 64
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_set(1)


def export_glb(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        export_morph=False,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_range=False,
    )
    if not output.exists() or output.stat().st_size < 16_000:
        raise RuntimeError(f"Crab GLB export is unexpectedly small: {output}")


def main():
    args = parse_args()
    output = Path(args.output).resolve()
    clear_scene()
    rig = create_rig()
    build_crab(rig)
    animate(rig)
    export_glb(output)
    print(f"CARAPACE FORGE generated {output} ({output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
