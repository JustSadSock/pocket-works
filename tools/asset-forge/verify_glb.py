import argparse
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--require-armature", action="store_true")
    parser.add_argument("--require-animation", action="store_true")
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def main() -> None:
    args = parse_args()
    source = Path(args.input).resolve()
    if not source.exists() or source.stat().st_size < 1024:
        raise RuntimeError(f"Missing or invalid GLB: {source}")

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    actions = list(bpy.data.actions)
    vertices = sum(len(obj.data.vertices) for obj in meshes)

    if not meshes or vertices == 0:
        raise RuntimeError("GLB re-import contains no mesh geometry")
    if args.require_armature and not armatures:
        raise RuntimeError("GLB re-import contains no armature")
    if args.require_animation and not actions:
        raise RuntimeError("GLB re-import contains no animation actions")

    print(
        "Asset Forge GLB verified: "
        f"meshes={len(meshes)}, vertices={vertices}, "
        f"armatures={len(armatures)}, actions={len(actions)}, "
        f"bytes={source.stat().st_size}"
    )


if __name__ == "__main__":
    main()
