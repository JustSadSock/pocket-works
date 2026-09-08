import argparse
import math
import sys
from pathlib import Path

import bpy

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

import ship as base
import ship_final as final


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def emissive_material(name, color, strength=2.0):
    mat = base.material(name, color, roughness=0.26, metallic=0.0)
    principled = mat.node_tree.nodes.get('Principled BSDF') if mat.node_tree else None
    if principled:
        emission_key = 'Emission Color' if 'Emission Color' in principled.inputs else 'Emission'
        if emission_key in principled.inputs:
            principled.inputs[emission_key].default_value = (*color, 1.0)
        if 'Emission Strength' in principled.inputs:
            principled.inputs['Emission Strength'].default_value = strength
    return mat


def make_empty(name, location):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = 0.12
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


def parent_local(obj, parent):
    obj.parent = parent
    return obj


def torus(name, location, major_radius, minor_radius, mat, rotation=(0, 0, 0), major_segments=20, minor_segments=7):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    return base.finish(obj, mat)


def cone(name, location, radius1, radius2, depth, mat, vertices=20, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    return base.finish(obj, mat)


def add_companionway_joinery(deck_mat, rail_mat, dark_mat, brass_mat):
    # Layered doors and trim make the companionway read as built joinery rather than one box.
    for side in (-1, 1):
        base.box(
            f'PW_CompanionDoor_{side}',
            (side * 0.30, -1.455, 1.015),
            (0.265, 0.018, 0.135),
            dark_mat,
            0.018,
        )
        base.box(
            f'PW_CompanionDoorPanel_{side}',
            (side * 0.30, -1.476, 1.015),
            (0.205, 0.010, 0.090),
            rail_mat,
            0.012,
        )
        base.cylinder(
            f'PW_CompanionHandle_{side}',
            (side * 0.11, -1.493, 1.015),
            0.018,
            0.026,
            brass_mat,
            14,
            rotation=(math.pi * 0.5, 0, 0),
        )

    # Narrow anti-slip treads across the companionway roof catch the sun at oblique chase angles.
    for index, y in enumerate((-1.23, -1.02, -0.81, -0.60)):
        base.box(
            f'PW_CompanionRoofTread_{index}',
            (0.0, y, 1.292 + (y + 0.92) * 0.018),
            (0.59, 0.025, 0.010),
            deck_mat,
            0.006,
        )


def add_belaying_rails(rail_mat, brass_mat, rope_mat):
    # A cutter should visibly explain where all that running rigging goes.
    for side in (-1, 1):
        x = side * 0.96
        base.box(
            f'PW_PinRail_{side}',
            (x, 0.18, 1.105),
            (0.075, 0.62, 0.045),
            rail_mat,
            0.026,
        )
        for index, y in enumerate((-0.28, -0.05, 0.18, 0.41, 0.64)):
            base.cylinder(
                f'PW_BelayingPin_{side}_{index}',
                (x, y, 1.255),
                0.024,
                0.28,
                brass_mat,
                14,
            )
            base.cylinder(
                f'PW_BelayingPinGrip_{side}_{index}',
                (x, y, 1.405),
                0.036,
                0.045,
                rail_mat,
                14,
            )

        # A short laid rope snakes from each rail toward the mast collar.
        base.curve_tube(
            f'PW_PinRailLead_{side}',
            [
                (x, -0.34, 1.14),
                (side * 0.74, -0.10, 1.11),
                (side * 0.43, 0.18, 1.04),
                (side * 0.24, 0.32, 1.01),
            ],
            0.010,
            rope_mat,
            resolution=2,
            bevel_resolution=1,
        )


def add_hawse_and_scuppers(dark_mat, iron_mat, brass_mat):
    # Hawse rings give the bow a convincing anchor-working area.
    for side in (-1, 1):
        torus(
            f'PW_HawseRing_{side}',
            (side * 1.08, 3.28, 0.91),
            0.115,
            0.024,
            brass_mat,
            rotation=(0, math.pi * 0.5, 0),
            major_segments=22,
        )
        base.cylinder(
            f'PW_HawseDark_{side}',
            (side * 1.071, 3.28, 0.91),
            0.082,
            0.035,
            dark_mat,
            18,
            rotation=(0, math.pi * 0.5, 0),
        )

        # Scuppers are shallow dark recesses: no expensive booleans, but enough parallax to read as openings.
        for index, y in enumerate((-2.88, -1.92, -0.92, 0.10, 1.10, 2.06)):
            _, beam, sheer, _ = base.station_interp(y)
            base.box(
                f'PW_Scupper_{side}_{index}',
                (side * beam * 1.018, y, sheer - 0.035),
                (0.018, 0.085, 0.035),
                dark_mat,
                0.010,
            )

    # A compact bow roller and keeper visually connect the anchors to the foredeck hardware.
    base.box('PW_BowRollerCheekPort', (-0.16, 3.86, 1.34), (0.045, 0.24, 0.11), iron_mat, 0.018)
    base.box('PW_BowRollerCheekStarboard', (0.16, 3.86, 1.34), (0.045, 0.24, 0.11), iron_mat, 0.018)
    base.cylinder('PW_BowRoller', (0.0, 3.88, 1.35), 0.10, 0.27, brass_mat, 20, rotation=(0, math.pi * 0.5, 0))


def add_compass(rail_mat, ivory_mat, dark_mat, brass_mat):
    # The card itself is named intentionally; Babylon counter-rotates it against ship heading.
    card = base.cylinder('PW_CompassCard', (-0.42, -1.42, 1.515), 0.113, 0.018, ivory_mat, 28)
    card.rotation_euler[2] = 0.0
    base.box('PW_CompassNorth', (-0.42, -1.42, 1.538), (0.018, 0.076, 0.008), dark_mat, 0.006)
    base.box('PW_CompassEastWest', (-0.42, -1.42, 1.537), (0.073, 0.016, 0.007), brass_mat, 0.005)
    base.cylinder('PW_CompassGlassRim', (-0.42, -1.42, 1.548), 0.126, 0.016, brass_mat, 28)


def add_bell(rail_mat, dark_mat, brass_mat):
    stand = base.box('PW_BellStand', (0.62, 0.12, 1.40), (0.055, 0.20, 0.30), rail_mat, 0.024)
    stand.rotation_euler[1] = math.radians(-4)
    pivot = make_empty('PW_BellPivot', (0.62, 0.12, 1.68))
    bell = cone('PW_Bell', (0, 0, -0.095), 0.115, 0.072, 0.19, brass_mat, 24)
    parent_local(bell, pivot)
    lip = torus('PW_BellLip', (0, 0, -0.18), 0.112, 0.013, brass_mat, major_segments=24)
    parent_local(lip, pivot)
    clapper = base.cylinder('PW_BellClapper', (0, 0, -0.18), 0.019, 0.20, dark_mat, 12)
    parent_local(clapper, pivot)
    clapper.rotation_euler[0] = math.radians(6)
    base.cylinder('PW_BellCrown', (0.62, 0.12, 1.78), 0.052, 0.055, brass_mat, 18)


def add_lantern(name, side, rail_mat, iron_mat, brass_mat, glow_mat):
    x = side * 1.10
    y = -3.52
    z = 1.68
    # The bracket stays fixed to the quarter rail while the authored lantern pivot swings below it.
    base.box(f'PW_{name}Bracket', (x, y + 0.06, z + 0.16), (0.045, 0.11, 0.035), iron_mat, 0.016)
    hook = torus(f'PW_{name}Hook', (x, y, z + 0.06), 0.072, 0.014, iron_mat, rotation=(math.pi * 0.5, 0, 0), major_segments=18)
    pivot = make_empty(f'PW_{name}Pivot', (x, y, z))

    cage = base.cylinder(f'PW_{name}Cage', (0, 0, -0.22), 0.105, 0.34, brass_mat, 12)
    parent_local(cage, pivot)
    cap = cone(f'PW_{name}Cap', (0, 0, -0.025), 0.12, 0.055, 0.13, brass_mat, 16)
    parent_local(cap, pivot)
    base_cap = base.cylinder(f'PW_{name}Base', (0, 0, -0.405), 0.12, 0.06, brass_mat, 16)
    parent_local(base_cap, pivot)
    glow = base.cylinder(f'PW_{name}Glow', (0, 0, -0.22), 0.066, 0.205, glow_mat, 16)
    parent_local(glow, pivot)
    for bar_index, angle in enumerate((0, math.pi * 0.5, math.pi, math.pi * 1.5)):
        bx = math.cos(angle) * 0.095
        by = math.sin(angle) * 0.095
        bar = base.cylinder(f'PW_{name}Bar_{bar_index}', (bx, by, -0.22), 0.010, 0.31, iron_mat, 8)
        parent_local(bar, pivot)
    return pivot


def add_sheet_block(name, side, rail_mat, iron_mat, brass_mat):
    pivot = make_empty(f'PW_{name}Pivot', (side * 0.86, -3.04, 1.19))
    shell = base.box(f'PW_{name}Shell', (0, 0, 0), (0.070, 0.115, 0.045), rail_mat, 0.032)
    parent_local(shell, pivot)
    wheel = base.cylinder(f'PW_{name}Sheave', (0, 0, 0), 0.060, 0.100, brass_mat, 18, rotation=(0, math.pi * 0.5, 0))
    parent_local(wheel, pivot)
    strap = torus(f'PW_{name}Strap', (0, 0, 0.10), 0.055, 0.010, iron_mat, rotation=(math.pi * 0.5, 0, 0), major_segments=16)
    parent_local(strap, pivot)
    return pivot


def add_quarter_life(rail_mat, dark_mat, iron_mat, brass_mat, rope_mat, glow_mat):
    add_bell(rail_mat, dark_mat, brass_mat)
    add_lantern('LanternPort', -1, rail_mat, iron_mat, brass_mat, glow_mat)
    add_lantern('LanternStarboard', 1, rail_mat, iron_mat, brass_mat, glow_mat)
    add_sheet_block('SheetBlockPort', -1, rail_mat, iron_mat, brass_mat)
    add_sheet_block('SheetBlockStarboard', 1, rail_mat, iron_mat, brass_mat)

    # Quarter chocks and short rope tails break up the long stern deck without becoming clutter.
    for side in (-1, 1):
        base.box(f'PW_QuarterChock_{side}', (side * 1.27, -3.55, 1.22), (0.105, 0.07, 0.055), iron_mat, 0.022)
        base.curve_tube(
            f'PW_QuarterRopeTail_{side}',
            [
                (side * 1.20, -3.40, 1.25),
                (side * 1.04, -3.18, 1.20),
                (side * 0.93, -2.92, 1.16),
            ],
            0.012,
            rope_mat,
            resolution=2,
            bevel_resolution=1,
        )


def add_deck_fastening_detail(dark_mat, brass_mat):
    # Sparse fasteners provide scale cues without turning the deck into dotted noise.
    y_positions = (-3.15, -2.15, -1.08, 0.02, 1.18, 2.35, 3.28)
    for row, y in enumerate(y_positions):
        _, beam, sheer, _ = base.station_interp(y)
        for side in (-1, 1):
            x = side * min(1.15, beam * 0.63)
            base.cylinder(
                f'PW_DeckFastener_{row}_{side}',
                (x, y, sheer + 0.153),
                0.013,
                0.012,
                brass_mat if row in (0, 6) else dark_mat,
                10,
            )


def main():
    args = parse_args()
    base.clear_scene()
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

    hull_mat = base.material('PELAGOS Oxblood Oak', (0.125, 0.034, 0.012), roughness=0.46)
    deck_mat = base.material('PELAGOS Honey Deck', (0.40, 0.205, 0.070), roughness=0.66)
    rail_mat = base.material('PELAGOS Mahogany Rail', (0.165, 0.045, 0.014), roughness=0.37)
    dark_mat = base.material('PELAGOS Tarred Timber', (0.028, 0.010, 0.005), roughness=0.56)
    iron_mat = base.material('PELAGOS Black Iron', (0.022, 0.028, 0.030), roughness=0.34, metallic=0.74)
    ivory_mat = base.material('PELAGOS Warm Ivory', (0.70, 0.57, 0.36), roughness=0.52)
    sea_green_mat = base.material('PELAGOS Sea Green Paint', (0.020, 0.155, 0.135), roughness=0.52)
    brass_mat = base.material('PELAGOS Aged Brass', (0.43, 0.225, 0.060), roughness=0.31, metallic=0.78)
    rope_mat = base.material('PELAGOS Hemp Rope', (0.30, 0.21, 0.105), roughness=0.86)
    glow_mat = emissive_material('PELAGOS Lantern Glow', (1.0, 0.24, 0.035), 2.6)

    base.build_hull(hull_mat)
    base.build_deck(deck_mat)
    base.add_structural_details(deck_mat, rail_mat, dark_mat, iron_mat)
    final.add_transom_closure(hull_mat, rail_mat, brass_mat)
    final.add_hull_surface_detail(dark_mat, ivory_mat, sea_green_mat, brass_mat)
    final.add_deck_life(deck_mat, rail_mat, dark_mat, iron_mat, brass_mat, rope_mat)

    add_companionway_joinery(deck_mat, rail_mat, dark_mat, brass_mat)
    add_belaying_rails(rail_mat, brass_mat, rope_mat)
    add_hawse_and_scuppers(dark_mat, iron_mat, brass_mat)
    add_compass(rail_mat, ivory_mat, dark_mat, brass_mat)
    add_quarter_life(rail_mat, dark_mat, iron_mat, brass_mat, rope_mat, glow_mat)
    add_deck_fastening_detail(dark_mat, brass_mat)

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
    print(f'PELAGOS crafted Blender cutter generated: {output} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
