import argparse
import math
import sys
from pathlib import Path

import bpy

import colossus as base


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def add_traversal_anatomy(rig):
    armor = base.mat('Traversal storm armor', (0.14, 0.17, 0.16), metallic=0.80, roughness=0.31)
    edge = base.mat('Traversal brass edge', (0.34, 0.25, 0.10), metallic=0.82, roughness=0.28)
    bone = base.mat('Traversal bone alloy', (0.22, 0.23, 0.20), metallic=0.64, roughness=0.40)
    tissue = base.mat('Traversal tendon polymer', (0.19, 0.055, 0.042), metallic=0.06, roughness=0.60)

    # The playable dorsal route is no longer a generic road. These paired
    # overlapping scutes are authored directly into the chest/spine skeleton.
    sections = [
        (-11.0, 4.7, 65.0, 5.4, 4.0, 0.60, 'spine_02'),
        (-5.8, 5.1, 68.0, 5.7, 4.2, 0.66, 'spine_02'),
        (-0.5, 5.5, 71.0, 6.0, 4.3, 0.70, 'chest'),
        (4.9, 5.7, 74.0, 6.0, 4.2, 0.72, 'chest'),
        (10.1, 5.8, 77.0, 5.6, 4.0, 0.70, 'chest'),
    ]
    for i, (x, y, z, sx, sy, sz, bone_name) in enumerate(sections, 1):
        for side in (-1, 1):
            px = side * (sx * 0.60) + x * 0.12
            plate = base.cube(
                f'EXT_TraversalScute_{i}_{"L" if side < 0 else "R"}',
                (px, y, z),
                (sx * 0.53, sy, sz),
                armor,
                bevel=0.56,
                rot=(0.10 + i * 0.008, side * 0.025, side * 0.035),
            )
            base.bind(plate, rig, bone_name)
        keel = base.cube(f'EXT_DorsalKeel_{i}', (x * 0.10, y + 3.7, z), (0.42, 0.50, sy * 0.84), edge, bevel=0.18)
        base.bind(keel, rig, bone_name)

    # Shoulder landmarks provide a visually obvious physical destination.
    for side_name, side in (('L', -1), ('R', 1)):
        shoulder_bone = f'shoulder_{side_name}'
        collar = base.torus(f'EXT_TraversalShoulderHalo_{side_name}', (side * 20.2, 5.9, 79.0), 4.1, 0.32, edge, rot=(math.pi / 2, 0, 0), major_segments=40, minor_segments=10)
        base.bind(collar, rig, shoulder_bone)
        cup = base.cyl(f'EXT_TraversalShoulderCup_{side_name}', (side * 20.2, 5.1, 79.0), 2.8, 1.2, bone, vertices=20, rot=(math.pi / 2, 0, 0))
        base.bind(cup, rig, shoulder_bone)
        for j in range(3):
            rail = base.cyl(f'EXT_TraversalRail_{side_name}_{j}', (side * (16.3 + j * 1.2), 7.0, 76.5 + j * 1.3), 0.18, 6.8, edge, vertices=12, rot=(math.pi / 2, side * 0.12, 0))
            base.bind(rail, rig, shoulder_bone)

    # Human-scale cues: cables are deliberately enormous next to the traveler.
    for i in range(6):
        x = -11.0 + i * 4.4
        points = [
            (x, 5.2, 62 + i * 2.2),
            (x + math.sin(i) * 1.8, 7.3, 67 + i * 2.0),
            (x * 0.55, 6.4, 73 + i * 1.8),
        ]
        cable = base.cable(f'EXT_LoadTendon_{i+1}', points, 0.30 + (i % 2) * 0.07, tissue, bevel_resolution=2)
        base.bind(cable, rig, 'spine_02' if i < 3 else 'chest')

    # A neck ladder-like mechanical channel makes the final climb legible.
    for i in range(5):
        z = 83.5 + i * 2.2
        rung = base.cube(f'EXT_NeckClimbRung_{i+1}', (0, 5.0, z), (3.0 - i * 0.22, 0.38, 0.34), edge, bevel=0.16)
        base.bind(rung, rig, 'neck')


def main():
    args = parse_args()
    output = Path(args.output).resolve()
    base.clear_scene()
    rig = base.create_rig()
    base.build_colossus(rig)
    add_traversal_anatomy(rig)
    base.animate(rig)
    base.export_glb(output)
    print(f'COLOSSUS living exterior generated {output} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
