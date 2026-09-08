import argparse
import math
import sys
from pathlib import Path

import bpy

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

import ship as base


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def add_transom_closure(mat, rail_mat, brass_mat):
    y, beam, sheer, keel = base.STATIONS[0]
    points = base.section_points(beam, sheer, keel)
    left = points[0]
    right = points[-1]
    center_z = (sheer + keel) * 0.48
    aft_y = y - 0.004

    mesh = bpy.data.meshes.new('PelagosTransomClosureMesh')
    mesh.from_pydata(
        [
            (0.0, aft_y, center_z),
            (right[0], aft_y, right[1]),
            (left[0], aft_y, left[1]),
        ],
        [],
        [(0, 1, 2)],
    )
    mesh.update()
    closure = bpy.data.objects.new('PW_TransomClosure', mesh)
    bpy.context.collection.objects.link(closure)
    base.finish(closure, mat, smooth=False)
    base.bevel(closure, 0.012, 1)

    base.box(
        'PW_TransomCap',
        (0.0, y - 0.025, sheer + 0.085),
        (beam * 0.92, 0.032, 0.055),
        rail_mat,
        0.025,
    )
    base.box(
        'PW_TransomNameBoard',
        (0.0, y - 0.047, 0.67),
        (0.80, 0.020, 0.235),
        rail_mat,
        0.035,
    )

    for x in (-0.78, 0.78):
        for z in (0.52, 0.83):
            base.cylinder(
                f'PW_TransomFastener_{x}_{z}',
                (x, y - 0.073, z),
                0.026,
                0.035,
                brass_mat,
                18,
                rotation=(math.pi * 0.5, 0, 0),
            )

    bpy.ops.object.text_add(
        location=(0.0, y - 0.076, 0.69),
        rotation=(math.pi * 0.5, 0, 0),
    )
    text = bpy.context.active_object
    text.name = 'PW_PelagosTransomLettering'
    text.data.body = 'PELAGOS'
    text.data.align_x = 'CENTER'
    text.data.align_y = 'CENTER'
    text.data.size = 0.31
    text.data.space_character = 1.05
    text.data.extrude = 0.010
    text.data.bevel_depth = 0.004
    text.data.bevel_resolution = 2
    text.data.materials.append(brass_mat)


def hull_level_point(side, station, v):
    y, beam, sheer, keel = station
    x = beam * (math.sin(v * math.pi * 0.5) ** 0.88)
    x *= 1.0 - max(0.0, v - 0.78) * 0.12
    z = keel + (sheer - keel) * (v ** 0.70)
    return (side * x * 1.008, y, z)


def add_hull_surface_detail(dark_mat, ivory_mat, sea_green_mat, brass_mat):
    # Fine longitudinal strakes catch grazing light and make the hull read as built timber,
    # instead of one glossy plastic shell.
    for side in (-1, 1):
        for index, v in enumerate((0.34, 0.51, 0.66, 0.79)):
            points = [hull_level_point(side, station, v) for station in base.STATIONS[:-1]]
            base.curve_tube(
                f'PW_HullStrake_{side}_{index}',
                points,
                0.0065,
                dark_mat,
                resolution=2,
                bevel_resolution=1,
            )

        sheer_line = [
            (side * beam * 1.010, y, sheer - 0.105)
            for y, beam, sheer, _ in base.STATIONS[:-1]
        ]
        base.curve_tube(
            f'PW_IvorySheerStripe_{side}',
            sheer_line,
            0.020,
            ivory_mat,
            resolution=2,
            bevel_resolution=2,
        )

        boot_line = [hull_level_point(side, station, 0.71) for station in base.STATIONS[1:-2]]
        base.curve_tube(
            f'PW_SeaGreenBootStripe_{side}',
            boot_line,
            0.014,
            sea_green_mat,
            resolution=2,
            bevel_resolution=2,
        )

    # Small warm-metal details produce readable highlights without turning the boat into ornament.
    base.cylinder('PW_BrassMastBand', (0.0, 0.32, 1.00), 0.247, 0.034, brass_mat, 32)
    for idx, (x, y) in enumerate(((-1.18, -1.10), (1.18, -1.10), (-1.05, 2.25), (1.05, 2.25))):
        _, _, sheer, _ = base.station_interp(y)
        base.cylinder(
            f'PW_BrassDeckPin_{idx}',
            (x, y, sheer + 0.255),
            0.032,
            0.030,
            brass_mat,
            16,
        )


def main():
    args = parse_args()
    base.clear_scene()
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

    hull_mat = base.material('PELAGOS Oxblood Oak', (0.115, 0.022, 0.006), roughness=0.42)
    deck_mat = base.material('PELAGOS Honey Deck', (0.48, 0.19, 0.045), roughness=0.64)
    rail_mat = base.material('PELAGOS Mahogany Rail', (0.20, 0.038, 0.008), roughness=0.34)
    dark_mat = base.material('PELAGOS Tarred Timber', (0.030, 0.008, 0.003), roughness=0.50)
    iron_mat = base.material('PELAGOS Black Iron', (0.020, 0.026, 0.028), roughness=0.30, metallic=0.76)
    ivory_mat = base.material('PELAGOS Warm Ivory', (0.72, 0.54, 0.30), roughness=0.48)
    sea_green_mat = base.material('PELAGOS Sea Green Paint', (0.018, 0.17, 0.145), roughness=0.50)
    brass_mat = base.material('PELAGOS Aged Brass', (0.50, 0.20, 0.045), roughness=0.27, metallic=0.82)

    base.build_hull(hull_mat)
    base.build_deck(deck_mat)
    base.add_structural_details(deck_mat, rail_mat, dark_mat, iron_mat)
    add_transom_closure(hull_mat, rail_mat, brass_mat)
    add_hull_surface_detail(dark_mat, ivory_mat, sea_green_mat, brass_mat)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format='GLB',
        export_apply=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )
    print(f'PELAGOS final Blender cutter generated: {output} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
