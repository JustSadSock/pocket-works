import argparse
import math
import sys
from pathlib import Path

import bpy


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def material(name, color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1.0)
    mat.roughness = roughness
    mat.metallic = metallic
    principled = mat.node_tree.nodes.get('Principled BSDF') if mat.node_tree else None
    if principled:
        principled.inputs['Base Color'].default_value = (*color, 1.0)
        principled.inputs['Roughness'].default_value = roughness
        principled.inputs['Metallic'].default_value = metallic
        if 'IOR' in principled.inputs:
            principled.inputs['IOR'].default_value = 1.46
    return mat


def finish(obj, mat=None, smooth=True):
    if mat is not None:
        obj.data.materials.append(mat)
    if hasattr(obj.data, 'polygons') and smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def bevel(obj, width=0.035, segments=2):
    mod = obj.modifiers.new(name='Edge softness', type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    return obj


def box(name, location, scale, mat, bevel_width=0.025, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, bevel_width, 2)
    return finish(obj, mat, smooth=False)


def cylinder(name, location, radius, depth, mat, vertices=20, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return finish(obj, mat)


def curve_tube(name, points, radius, mat, resolution=2, bevel_resolution=2):
    curve = bpy.data.curves.new(name + 'Curve', type='CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = bevel_resolution
    spline = curve.splines.new('NURBS')
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    spline.order_u = min(3, len(points))
    spline.use_endpoint_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    return obj


# x = beam, y = longitudinal (positive bow), z = vertical.
# The stern is intentionally fuller than the bow so the silhouette reads as a cutter,
# not a symmetric canoe when viewed from the chase camera.
STATIONS = [
    (-4.55, 1.18, 1.06, -0.88),
    (-4.18, 1.42, 0.93, -1.22),
    (-3.58, 1.58, 0.80, -1.45),
    (-2.80, 1.67, 0.70, -1.56),
    (-1.95, 1.72, 0.65, -1.61),
    (-1.00, 1.74, 0.63, -1.64),
    (0.00, 1.74, 0.64, -1.65),
    (1.00, 1.69, 0.68, -1.59),
    (1.90, 1.58, 0.75, -1.47),
    (2.70, 1.40, 0.85, -1.30),
    (3.35, 1.17, 0.99, -1.06),
    (3.85, 0.87, 1.15, -0.78),
    (4.25, 0.55, 1.32, -0.48),
    (4.58, 0.10, 1.48, -0.16),
]


def section_points(beam, sheer, keel, steps=9):
    left = []
    right = []
    for j in range(steps):
        v = j / (steps - 1)
        x = beam * (math.sin(v * math.pi * 0.5) ** 0.88)
        z = keel + (sheer - keel) * (v ** 0.70)
        x *= 1.0 - max(0.0, v - 0.78) * 0.12
        right.append((x, z))
        left.append((-x, z))
    return list(reversed(left)) + right[1:]


def build_hull(mat):
    vertices = []
    faces = []
    ring_size = 17
    for y, beam, sheer, keel in STATIONS:
        for x, z in section_points(beam, sheer, keel):
            vertices.append((x, y, z))
    for s in range(len(STATIONS) - 1):
        for j in range(ring_size - 1):
            a = s * ring_size + j
            b = a + 1
            c = (s + 1) * ring_size + j
            d = c + 1
            faces.append((a, c, d, b))
    for station_index, reverse in ((0, True), (len(STATIONS) - 1, False)):
        y, _, sheer, keel = STATIONS[station_index]
        center_index = len(vertices)
        vertices.append((0, y, (sheer + keel) * 0.48))
        first = station_index * ring_size
        for j in range(ring_size - 1):
            a = first + j
            b = a + 1
            faces.append((center_index, b, a) if reverse else (center_index, a, b))
    mesh = bpy.data.meshes.new('PelagosHullMesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    hull = bpy.data.objects.new('PW_Hull', mesh)
    bpy.context.collection.objects.link(hull)
    finish(hull, mat)
    bevel(hull, 0.025, 2)
    weighted = hull.modifiers.new(name='Hull normal', type='WEIGHTED_NORMAL')
    weighted.keep_sharp = True
    return hull


def build_deck(mat):
    vertices = []
    faces = []
    across = 13
    for y, beam, sheer, _ in STATIONS:
        for j in range(across):
            t = -1 + 2 * j / (across - 1)
            edge = beam * 0.955
            x = edge * t
            crown = 0.105 * (1.0 - t * t)
            vertices.append((x, y, sheer + 0.035 + crown))
    for s in range(len(STATIONS) - 1):
        for j in range(across - 1):
            a = s * across + j
            b = a + 1
            c = (s + 1) * across + j
            d = c + 1
            faces.append((a, c, d, b))
    mesh = bpy.data.meshes.new('PelagosDeckMesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    deck = bpy.data.objects.new('PW_Deck', mesh)
    bpy.context.collection.objects.link(deck)
    finish(deck, mat, smooth=False)
    bevel(deck, 0.012, 1)
    return deck


def station_interp(y):
    if y <= STATIONS[0][0]:
        return STATIONS[0]
    if y >= STATIONS[-1][0]:
        return STATIONS[-1]
    for a, b in zip(STATIONS, STATIONS[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return (
                y,
                a[1] + (b[1] - a[1]) * t,
                a[2] + (b[2] - a[2]) * t,
                a[3] + (b[3] - a[3]) * t,
            )
    return STATIONS[0]


def add_structural_details(deck_mat, rail_mat, dark_mat, iron_mat):
    for side in (-1, 1):
        cap = [(side * beam * 0.985, y, sheer + 0.12) for y, beam, sheer, _ in STATIONS[:-1]]
        rub = [(side * beam * 1.005, y, sheer - 0.34) for y, beam, sheer, _ in STATIONS[:-1]]
        curve_tube(f'PW_Caprail_{side}', cap, 0.055, rail_mat)
        curve_tube(f'PW_RubRail_{side}', rub, 0.032, rail_mat)

        hand_points = []
        for y in (-3.7, -2.7, -1.6, -0.45, 0.75, 1.85, 2.85, 3.60):
            _, beam, sheer, _ = station_interp(y)
            x = side * beam * 0.94
            z = sheer + 0.52
            hand_points.append((x, y, z))
            cylinder(f'PW_Stanchion_{side}_{y:.2f}', (x, y, sheer + 0.29), 0.026, 0.46, iron_mat, 12)
        curve_tube(f'PW_Handrail_{side}', hand_points, 0.035, rail_mat)

    for i, t in enumerate((-0.78, -0.60, -0.42, -0.24, 0.0, 0.24, 0.42, 0.60, 0.78)):
        pts = []
        for y, beam, sheer, _ in STATIONS[1:-1]:
            x = beam * 0.90 * t
            crown = 0.105 * (1.0 - t * t)
            pts.append((x, y, sheer + 0.076 + crown))
        curve_tube(f'PW_DeckSeam_{i}', pts, 0.0045, dark_mat, bevel_resolution=1)

    box('PW_CockpitFloor', (0, -2.32, 0.72), (0.66, 0.95, 0.035), dark_mat, 0.018)
    box('PW_CockpitFront', (0, -1.34, 0.88), (0.76, 0.065, 0.10), rail_mat, 0.035)
    box('PW_CockpitBack', (0, -3.30, 1.00), (0.78, 0.065, 0.10), rail_mat, 0.035)
    box('PW_CockpitPort', (-0.75, -2.32, 0.93), (0.065, 0.98, 0.10), rail_mat, 0.035)
    box('PW_CockpitStarboard', (0.75, -2.32, 0.93), (0.065, 0.98, 0.10), rail_mat, 0.035)

    box('PW_Companionway', (0, -0.92, 1.00), (0.62, 0.52, 0.18), rail_mat, 0.055, rotation=(math.radians(-3), 0, 0))
    box('PW_CompanionwayTop', (0, -0.88, 1.22), (0.68, 0.58, 0.055), deck_mat, 0.035, rotation=(math.radians(-3), 0, 0))

    box('PW_ForwardHatch', (0, 2.18, 1.06), (0.63, 0.54, 0.075), rail_mat, 0.045, rotation=(math.radians(2), 0, 0))
    for x in (-0.44, 0.0, 0.44):
        box(f'PW_HatchSlat_{x}', (x, 2.18, 1.145), (0.018, 0.48, 0.018), iron_mat, 0.008)

    keel_pts = [(0, y, keel - 0.03) for y, _, _, keel in STATIONS[1:-2]]
    curve_tube('PW_KeelBackbone', keel_pts, 0.075, dark_mat)
    curve_tube('PW_Stem', [(0, 3.55, -0.95), (0, 4.25, -0.40), (0, 4.62, 1.50)], 0.072, rail_mat)
    curve_tube('PW_Sternpost', [(0, -4.50, -0.82), (0, -4.48, 0.98)], 0.068, rail_mat)

    cylinder('PW_MastCollar', (0, 0.32, 0.92), 0.23, 0.11, dark_mat, 28)
    box('PW_BowspritBed', (0, 3.30, 1.27), (0.28, 0.72, 0.075), rail_mat, 0.03, rotation=(math.radians(4), 0, 0))

    for idx, (x, y) in enumerate(((-1.18, -1.1), (1.18, -1.1), (-1.05, 2.25), (1.05, 2.25))):
        _, _, sheer, _ = station_interp(y)
        box(f'PW_CleatBase_{idx}', (x, y, sheer + 0.18), (0.14, 0.055, 0.025), iron_mat, 0.012)
        box(f'PW_CleatBar_{idx}', (x, y, sheer + 0.23), (0.25, 0.045, 0.025), iron_mat, 0.012)

    for side in (-1, 1):
        for idx, y in enumerate((-1.55, -0.35, 0.95)):
            _, beam, sheer, _ = station_interp(y)
            x = side * beam * 1.02
            box(f'PW_Chainplate_{side}_{idx}', (x, y, sheer - 0.28), (0.025, 0.15, 0.24), iron_mat, 0.012)


def main():
    args = parse_args()
    clear_scene()
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

    hull_mat = material('PELAGOS Hull Oak', (0.15, 0.045, 0.014), roughness=0.38)
    deck_mat = material('PELAGOS Sun Deck', (0.46, 0.23, 0.075), roughness=0.62)
    rail_mat = material('PELAGOS Varnished Rail', (0.22, 0.072, 0.018), roughness=0.31)
    dark_mat = material('PELAGOS Dark Timber', (0.055, 0.014, 0.004), roughness=0.46)
    iron_mat = material('PELAGOS Black Iron', (0.025, 0.029, 0.030), roughness=0.28, metallic=0.78)

    build_hull(hull_mat)
    build_deck(deck_mat)
    add_structural_details(deck_mat, rail_mat, dark_mat, iron_mat)

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
    print(f'PELAGOS Blender cutter generated: {output} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
