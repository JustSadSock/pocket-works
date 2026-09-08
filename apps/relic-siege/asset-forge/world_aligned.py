import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import world


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
    if gate is None:
        raise RuntimeError('Gate collision proxy missing before export')
    # After the correction, Blender Z is vertical and the gate floor must be near Z=0.
    if abs(gate.matrix_world.translation.z) > 1.0:
        raise RuntimeError(f'Gate collision proxy axis correction failed: {tuple(gate.matrix_world.translation)}')


def main():
    args = world.parse_args()
    world.clear_scene()
    world.build_world()
    align_game_axes()
    world.export(args.output)


if __name__ == '__main__':
    main()
