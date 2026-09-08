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


def add_rope_coil(name, location, rope_mat, radius=0.24):
    x, y, z = location
    for ring in range(3):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=radius - ring * 0.045,
            minor_radius=0.012,
            major_segments=20,
            minor_segments=6,
            location=(x, y, z + ring * 0.006),
        )
        torus = bpy.context.active_object
        torus.name = f'{name}_{ring}'
        base.finish(torus, rope_mat)


def add_deck_life(deck_mat, rail_mat, dark_mat, iron_mat, brass_mat, rope_mat):
    # Cockpit benches make the stern feel inhabitable rather than like an empty geometric tray.
    for side in (-1, 1):
        base.box(
            f'PW_CockpitBench_{side}',
            (side * 1.13, -2.42, 1.10),
            (0.18, 0.78, 0.065),
            deck_mat,
            0.035,
        )
        base.box(
            f'PW_CockpitBenchLip_{side}',
            (side * 1.13, -2.42, 1.17),
            (0.20, 0.80, 0.018),
            rail_mat,
            0.012,
        )

    # Grating below the helm: narrow slats and a dark frame catch moving sunlight and scale the deck.
    base.box('PW_CockpitGratingFrame', (0.0, -2.46, 0.79), (0.61, 0.58, 0.026), dark_mat, 0.015)
    for index in range(7):
        x = -0.48 + index * 0.16
        base.box(f'PW_CockpitGratingSlat_{index}', (x, -2.46, 0.825), (0.035, 0.53, 0.012), deck_mat, 0.006)

    # A compact binnacle lives forward of the wheel, deliberately offset so the runtime helm remains clear.
    base.box('PW_BinnacleFoot', (-0.42, -1.42, 1.17), (0.20, 0.19, 0.055), rail_mat, 0.028)
    base.cylinder('PW_BinnacleBody', (-0.42, -1.42, 1.35), 0.145, 0.28, dark_mat, 20)
    base.cylinder('PW_BinnacleBrassRing', (-0.42, -1.42, 1.50), 0.155, 0.026, brass_mat, 24)

    # Mooring hardware and deck eyes create small high-frequency highlights without cluttering controls.
    hardware = [(-1.30, -3.32), (1.30, -3.32), (-1.18, 3.02), (1.18, 3.02)]
    for index, (x, y) in enumerate(hardware):
        _, _, sheer, _ = base.station_interp(y)
        z = sheer + 0.24
        base.cylinder(f'PW_Bollard_{index}', (x, y, z), 0.055, 0.20, iron_mat, 14)
        base.box(f'PW_BollardCap_{index}', (x, y, z + 0.11), (0.11, 0.055, 0.025), iron_mat, 0.012)

    for index, (x, y) in enumerate(((-0.88, 0.92), (0.88, 0.92), (-0.94, -0.55), (0.94, -0.55))):
        _, _, sheer, _ = base.station_interp(y)
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.065,
            minor_radius=0.011,
            major_segments=16,
            minor_segments=6,
            location=(x, y, sheer + 0.19),
            rotation=(math.pi * 0.5, 0, 0),
        )
        eye = bpy.context.active_object
        eye.name = f'PW_DeckEye_{index}'
        base.finish(eye, brass_mat)

    # Rope coils visually connect the physical sail system to believable deck work.
    add_rope_coil('PW_RopeCoilPort', (-0.92, -0.72, 1.13), rope_mat, 0.22)
    add_rope_coil('PW_RopeCoilStarboard', (0.94, 1.58, 1.17), rope_mat, 0.20)

    # A small forward tool chest gives the bow a second readable mass behind the hatch.
    base.box('PW_ForwardToolChest', (0.62, 1.38, 1.15), (0.34, 0.23, 0.14), rail_mat, 0.045)
    base.box('PW_ForwardToolChestLid', (0.62, 1.38, 1.31), (0.37, 0.26, 0.025), deck_mat, 0.02)
    base.box('PW_ForwardToolChestLatch', (0.62, 1.12, 1.24), (0.055, 0.018, 0.065), brass_mat, 0.01)


def main():
    args = parse_args()
    base.clear_scene()
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

    hull_mat = base.material('PELAGOS Oxblood Oak', (0.125, 0.034, 0.012), roughness=0.48)
    deck_mat = base.material('PELAGOS Honey Deck', (0.40, 0.205, 0.070), roughness=0.68)
    rail_mat = base.material('PELAGOS Mahogany Rail', (0.165, 0.045, 0.014), roughness=0.39)
    dark_mat = base.material('PELAGOS Tarred Timber', (0.028, 0.010, 0.005), roughness=0.56)
    iron_mat = base.material('PELAGOS Black Iron', (0.022, 0.028, 0.030), roughness=0.36, metallic=0.72)
    ivory_mat = base.material('PELAGOS Warm Ivory', (0.70, 0.57, 0.36), roughness=0.54)
    sea_green_mat = base.material('PELAGOS Sea Green Paint', (0.020, 0.155, 0.135), roughness=0.56)
    brass_mat = base.material('PELAGOS Aged Brass', (0.43, 0.225, 0.060), roughness=0.34, metallic=0.76)
    rope_mat = base.material('PELAGOS Hemp Rope', (0.30, 0.21, 0.105), roughness=0.84)

    base.build_hull(hull_mat)
    base.build_deck(deck_mat)
    base.add_structural_details(deck_mat, rail_mat, dark_mat, iron_mat)
    add_transom_closure(hull_mat, rail_mat, brass_mat)
    add_hull_surface_detail(dark_mat, ivory_mat, sea_green_mat, brass_mat)
    add_deck_life(deck_mat, rail_mat, dark_mat, iron_mat, brass_mat, rope_mat)

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
