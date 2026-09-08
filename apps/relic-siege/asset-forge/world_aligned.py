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
    """Build a top-surface-only collision ramp for Babylon's capsule solver.

    A closed wedge still exposes a front/side triangle set to Babylon. At a coplanar
    floor transition the capsule can resolve against those vertical faces instead of
    the intended slope and stop at the ramp. A two-triangle surface has no leading,
    trailing or side wall at all: the only collision normal is the walkable slope.
    The surface is extended along the same slope so both landings overlap safely.
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
    rise_per_meter = (ey - sy) / length
    lead_overlap = 0.48
    tail_overlap = 0.48

    lead_x = sx - fx * lead_overlap
    lead_z = sz - fz * lead_overlap
    lead_y = sy - rise_per_meter * lead_overlap
    tail_x = ex + fx * tail_overlap
    tail_z = ez + fz * tail_overlap
    tail_y = ey + rise_per_meter * tail_overlap

    vertices = [
        (lead_x - rx * half_width, lead_y, lead_z - rz * half_width),
        (lead_x + rx * half_width, lead_y, lead_z + rz * half_width),
        (tail_x + rx * half_width, tail_y, tail_z + rz * half_width),
        (tail_x - rx * half_width, tail_y, tail_z - rz * half_width),
    ]
    # Before the global axis correction these wind toward +game-Y (the walkable side).
    faces = [(0, 3, 2), (0, 2, 1)]

    mesh = bpy.data.meshes.new(f'COL_{name}_Ramp_Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(f'COL_{name}_Ramp', mesh)
    bpy.context.collection.objects.link(obj)

    collision_mat = bpy.data.materials.get('COLLISION_PROXY')
    if collision_mat is not None:
        obj.data.materials.append(collision_mat)
    return obj


def open_gate_ramp_landing():
    """Keep the raised courtyard collision wall behind the ramp's upper overlap.

    The visible floor remains at its authored extent. Only the collision proxy is
    shortened, because a thick raised-floor proxy exposes a vertical front face.
    The surface ramp now overlaps the shortened landing by roughly 0.7 m.
    """
    old_min_z = -32.0
    old_max_z = -12.0
    new_min_z = -28.8
    new_max_z = old_max_z
    old_center = (old_min_z + old_max_z) * 0.5
    new_center = (new_min_z + new_max_z) * 0.5
    scale_z = (new_max_z - new_min_z) / (old_max_z - old_min_z)

    obj = bpy.data.objects.get('COL_Courtyard_Floor')
    if obj is None:
        raise RuntimeError('Missing courtyard collision floor object')
    obj.location.z += new_center - old_center
    obj.scale.z *= scale_z


def rebuild_walkable_ramps():
    for name, start, end, width in RAMP_SPECS:
        remove_object(f'COL_{name}_Ramp')
        make_walkable_ramp(name, start, end, width)
    open_gate_ramp_landing()


def align_game_axes():
    """Convert the game-space-authored scene into Blender Z-up before glTF export.

    world.py describes positions as Pocket Works/Babylon (X, Y-up, Z-forward).
    Blender interprets those tuples as (X, Y, Z-up), so the complete authored scene
    is rotated +90 degrees around Blender X before the normal glTF Z-up -> Y-up export.
    """
    axis_fix = Matrix.Rotation(math.pi / 2, 4, 'X')
    for obj in list(bpy.context.scene.objects):
        obj.matrix_world = axis_fix @ obj.matrix_world

    gate = bpy.data.objects.get('COL_GateYard_Floor')
    gate_ramp = bpy.data.objects.get('COL_GateToCourtyard_Ramp')
    if gate is None or gate_ramp is None:
        raise RuntimeError('Gate collision geometry missing before export')
    if abs(gate.matrix_world.translation.z) > 1.0:
        raise RuntimeError(f'Gate collision proxy axis correction failed: {tuple(gate.matrix_world.translation)}')
    if len(gate_ramp.data.polygons) != 2:
        raise RuntimeError('Gate walkable ramp must export as exactly two collision triangles')


def main():
    args = world.parse_args()
    world.clear_scene()
    world.build_world()
    rebuild_walkable_ramps()
    align_game_axes()
    world.export(args.output)


if __name__ == '__main__':
    main()
