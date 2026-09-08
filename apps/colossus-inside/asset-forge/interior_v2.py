import argparse
import math
import sys
from pathlib import Path

import bpy

import interior as base


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def add_living_stabilizer(rig):
    frame = base.mat('Phase frame', (0.13, 0.17, 0.16), .76, .34)
    copper = base.mat('Phase copper', (0.34, 0.20, 0.075), .72, .30)
    tissue = base.mat('Phase tendon', (0.22, 0.045, 0.034), .05, .66)
    ceramic = base.mat('Phase ceramic', (0.08, 0.48, 0.40), .16, .23)

    for i, x in enumerate((-3.2, 0.0, 3.2), 1):
        ring = base.torus(f'INT_PhaseRing_{i}', (x, 18.0, 5.2), 1.55, .22, copper, rot=(math.pi / 2, 0, 0))
        base.bind(ring, rig, 'stabilizer')
        core = base.uv(f'INT_PhaseCore_{i}', (x, 18.0, 5.2), (.52, .34, .52), ceramic, 28, 18)
        base.bind(core, rig, 'stabilizer')
        cradle = base.cube(f'INT_PhaseCradle_{i}', (x, 17.1, 3.65), (1.45, .50, .30), frame, rot=(.08, 0, 0), bevel=.18)
        base.bind(cradle, rig, 'stabilizer')
        for side in (-1, 1):
            tendon = base.tube(
                f'INT_PhaseTendon_{i}_{"L" if side < 0 else "R"}',
                [(x + side * 1.0, 16.7, 4.1), (x + side * 1.6, 14.2, 5.7), (side * 6.3, 10.0, 6.3)],
                .16,
                tissue,
            )
            base.bind(tendon, rig, 'chamber')

    for i, y in enumerate((11.8, 15.0, 18.4, 21.6), 1):
        arch = base.torus(f'INT_PhaseRibArch_{i}', (0, y, 7.7), 7.1 - i * .18, .48, frame, rot=(math.pi/2,0,0))
        base.bind(arch, rig, 'chamber')
        sternum = base.cube(f'INT_PhaseSternum_{i}', (0, y, 10.7), (1.15, .34, 1.8), copper, rot=(0,0,.02*(1 if i % 2 else -1)), bevel=.20)
        base.bind(sternum, rig, 'chamber')


def main():
    args = parse_args()
    output = Path(args.output).resolve()
    base.clear_scene()
    rig = base.create_rig()
    base.build(rig)
    add_living_stabilizer(rig)
    base.animate(rig)
    base.export_glb(output)
    print(f'COLOSSUS living interior generated {output} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
