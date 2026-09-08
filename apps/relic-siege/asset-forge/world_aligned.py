import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import world


RAMP_SPECS = (
    ('GateToCourtyard', (0.0, 0.0, -33.5), (0.0, 2.0, -29.5), 6.5),
    ('CourtyardToArchive', (-8.5, 2.0, -18.0), (-14.2, 4.0, -11.5), 4.2),
    ('CourtyardToForge', (8.5, 2.0, -18.0), (14.2, 4.0, -11.5), 4.2),
    ('CourtyardToApproach', (0.0, 2.0, -12.5), (0.0, 5.0, -10.0), 5.2),
    ('ApproachToBridge', (0.0, 5.0, 2.0), (0.0, 6.0, 3.0), 4.0),
    ('BridgeToSanctum', (0.0, 6.0, 21.5), (0.0, 8.0, 24.5), 5.2),
)


def remove_object(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        return
    mesh = obj.data if getattr(obj, 'type', None) == 'MESH' else None
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh is not None and mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def make_walkable_ramp(name, start, end, width):
    """Replace a rotated box ramp with a clean wedge collider.

    The old proxy was a rotated cuboid. Its lower top corner sat ~0.22 m above the
    lower floor, so Babylon's capsule hit the cuboid's vertical front face instead
    of entering the slope. This wedge puts the leading top edge exactly on the lower
    floor and buries its front wall below that floor. The trailing edge lands exactly
    on the authored upper-floor height.
    """
    sx, sy, sz = start
    ex, ey, ez = end
    dx, dz = ex - sx, ez - sz
    length = math.hypot(dx, dz)
    if length <= 1e-5:
        raise RuntimeError(f'Ramp {name} has zero horizontal length')

    fx, fz = dx / length, dz / length
    rx, rz = fz, -fx
    half_width = width * 0.48
    depth = 0.62

    # A small overlap buries the leading wall in the lower platform and makes the
    # final contact with the upper landing tolerant to floating point differences.
    lead_overlap = 0.34
    tail_overlap = 0.22
    lsx, lsz = sx - fx * lead_overlap, sz - fz * lead_overlap
    tex, tez = ex + fx * tail_overlap, ez + fz * tail_overlap

    vertices = [
        (lsx - rx * half_width, sy, lsz - rz * half_width),
        (lsx + rx * half_width, sy, lsz + rz * half_width),
        (tex + rx * half_width, ey, tez + rz * half_width),
        (tex - rx * half_width, ey, tez - rz * half_width),
        (lsx - rx * half_width, sy - depth, lsz - rz * half_width),
        (lsx + rx * half_width, sy - depth, lsz + rz * half_width),
        (tex + rx * half_width, ey - depth, tez + rz * half_width),
        (tex - rx * half_width, ey - depth, tez - rz * half_width),
    ]
    # Top winding points toward +game-Y before the global axis correction.
    faces = [
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]

    mesh = bpy.data.meshes.new(f'COL_{name}_Ramp_Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f'COL_{name}_Ramp', mesh)
    bpy.context.collection.objects.link(obj)

    collision_mat = bpy.data.materials.get('COLLISION_PROXY')
    if collision_mat is not None:
        obj.data.materials.append(collision_mat)
    return obj


def open_gate_ramp_landing():
    """Move the courtyard floor front edge behind the gate-ramp landing.

    The original courtyard slab began at game Z=-32 while the ramp did not reach
    courtyard height until Z=-29.5. The slab therefore formed a second invisible
    vertical wall through the ramp. Keep the rear edge fixed at Z=-12 and move only
    the front edge to Z=-29.25 for both the visible floor and collision proxy.
    """
    old_min_z = -32.0
    old_max_z = -12.0
    new_min_z = -29.25
    new_max_z = old_max_z
    old_center = (old_min_z + old_max_z) * 0.5
    new_center = (new_min_z + new_max_z) * 0.5
    scale_z = (new_max_z - new_min_z) / (old_max_z - old_min_z)

    for name in ('Courtyard_Floor', 'COL_Courtyard_Floor'):
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f'Missing courtyard floor object: {name}')
        obj.location.z += new_center - old_center
        obj.scale.z *= scale_z


def rebuild_walkable_ramps():
    for name, start, end, width in RAMP_SPECS:
        remove_object(f'COL_{name}_Ramp')
        make_walkable_ramp(name, start, end, width)
    open_gate_ramp_landing()


def align_game_axes():
    """Convert the legacy game-space-authored scene into Blender Z-up before glTF export.

    world.py intentionally describes positions as Pocket Works/Babylon (X, Y-up, Z-forward).
    Blender interprets those tuples as (X, Y, Z-up), which previously turned every floor
    into a vertical slab. Rotating the complete authored scene +90 degrees around Blender X
    maps (game X, game Y, game Z) -> (Blender X, -game Z, game Y). Blender's glTF exporter
    then performs its normal Z-up -> Y-up conversion without the fortress lying on its side.
    """
    axis_fix = Matrix.Rotation(math.pi / 2, 4, 'X')
    for obj in list(bpy.context.scene.objects):
        obj.matrix_world = axis_fix @ obj.matrix_world

    gate = bpy.data.objects.get('COL_GateYard_Floor')
    gate_ramp = bpy.data.objects.get('COL_GateToCourtyard_Ramp')
    if gate is None or gate_ramp is None:
        raise RuntimeError('Gate collision geometry missing before export')
    # After the correction, Blender Z is vertical and the gate floor must be near Z=0.
    if abs(gate.matrix_world.translation.z) > 1.0:
        raise RuntimeError(f'Gate collision proxy axis correction failed: {tuple(gate.matrix_world.translation)}')


def main():
    args = world.parse_args()
    world.clear_scene()
    world.build_world()
    rebuild_walkable_ramps()
    align_game_axes()
    world.export(args.output)


if __name__ == '__main__':
    main()
