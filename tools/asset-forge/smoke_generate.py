import argparse
import math
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.armatures):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def make_material():
    material = bpy.data.materials.new("ForgeOrange")
    material.diffuse_color = (0.72, 0.18, 0.045, 1.0)
    material.metallic = 0.05
    material.roughness = 0.45
    return material


def make_mesh(material):
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0.0, 0.0, 0.0))
    body = bpy.context.active_object
    body.name = "ForgeBody"
    body.scale = (1.3, 0.8, 0.45)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    bevel = body.modifiers.new(name="SoftEdges", type="BEVEL")
    bevel.width = 0.18
    bevel.segments = 3
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=bevel.name)

    body.data.materials.append(material)
    return body


def make_rig(body):
    bpy.ops.object.armature_add(enter_editmode=False, location=(0.0, 0.0, 0.0))
    rig = bpy.context.active_object
    rig.name = "ForgeRig"
    rig.data.name = "ForgeRigData"
    bone = rig.data.bones[0]
    bone.name = "Root"

    modifier = body.modifiers.new(name="ForgeArmature", type="ARMATURE")
    modifier.object = rig
    group = body.vertex_groups.new(name="Root")
    group.add(list(range(len(body.data.vertices))), 1.0, "REPLACE")

    body.parent = rig

    pose_bone = rig.pose.bones["Root"]
    pose_bone.rotation_mode = "XYZ"
    for frame, angle in ((1, -0.22), (12, 0.22), (24, -0.22)):
        bpy.context.scene.frame_set(frame)
        pose_bone.rotation_euler[2] = angle
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)

    if rig.animation_data and rig.animation_data.action:
        rig.animation_data.action.name = "ForgeIdle"

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 24
    return rig


def export_glb(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.frame_set(1)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        export_morph=False,
    )
    if not output.exists() or output.stat().st_size < 1024:
        raise RuntimeError(f"GLB export failed or is unexpectedly small: {output}")


def main() -> None:
    args = parse_args()
    output = Path(args.output).resolve()

    clear_scene()
    material = make_material()
    body = make_mesh(material)
    make_rig(body)
    export_glb(output)

    print(
        f"Asset Forge smoke generated {output} "
        f"({output.stat().st_size} bytes, Blender {bpy.app.version_string})"
    )


if __name__ == "__main__":
    main()
