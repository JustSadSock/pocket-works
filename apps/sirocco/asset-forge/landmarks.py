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


def material(name, color, roughness=0.94):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*color, 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def assign_weathered_materials(obj, materials, height_span, phase=0.0):
    for mat in materials:
        obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        z = poly.center.z
        nz = poly.normal.z
        stripe = math.sin(z * 5.4 + phase) + 0.45 * math.sin(z * 11.7 - phase * 0.7)
        if nz < -0.18:
            poly.material_index = 2
        elif stripe > 0.95:
            poly.material_index = 1
        elif stripe < -1.0:
            poly.material_index = 3
        elif z > height_span * 0.72 and poly.normal.x > 0.15:
            poly.material_index = 4
        else:
            poly.material_index = 0


def ring_mesh(name, rings, segments, materials, phase=0.0):
    verts = []
    faces = []
    for ri, (z, rx, ry, lean_x, lean_y) in enumerate(rings):
        for i in range(segments):
            a = i / segments * math.tau
            macro = 1.0 + 0.055 * math.sin(a * 3.0 + phase + ri * 0.72)
            micro = 1.0 + 0.026 * math.sin(a * 7.0 - ri * 0.83) + 0.012 * math.sin(a * 13.0 + ri)
            x = lean_x + math.cos(a) * rx * macro * micro
            y = lean_y + math.sin(a) * ry * (1.0 + 0.042 * math.cos(a * 5.0 + ri)) * micro
            verts.append((x, y, z))
    for r in range(len(rings) - 1):
        for i in range(segments):
            n = (i + 1) % segments
            a = r * segments + i
            b = r * segments + n
            c = (r + 1) * segments + n
            d = (r + 1) * segments + i
            faces.append((a, b, c, d))
    bottom = len(verts)
    verts.append((rings[0][3], rings[0][4], rings[0][0]))
    top = len(verts)
    verts.append((rings[-1][3], rings[-1][4], rings[-1][0]))
    for i in range(segments):
        n = (i + 1) % segments
        faces.append((bottom, n, i))
        a = (len(rings) - 1) * segments + i
        b = (len(rings) - 1) * segments + n
        faces.append((top, a, b))
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    assign_weathered_materials(obj, materials, rings[-1][0], phase)
    bev = obj.modifiers.new('WindSoftenedEdges', 'BEVEL')
    bev.width = 0.055
    bev.segments = 2
    return obj


def add_strata_ring(name, location, radius_x, radius_y, mat, yaw=0.0, thickness=0.028):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius_x,
        minor_radius=thickness,
        major_segments=30,
        minor_segments=5,
        location=location,
        rotation=(0.0, 0.0, yaw),
    )
    torus = bpy.context.active_object
    torus.name = name
    torus.scale.y = max(0.2, radius_y / max(radius_x, 0.001))
    torus.data.materials.append(mat)
    return torus


def add_spire(materials, strata_mat):
    rings = [
        (0.0, 2.55, 2.00, 0.0, 0.0),
        (0.65, 2.43, 1.94, 0.05, -0.02),
        (1.45, 2.28, 1.78, 0.11, -0.05),
        (2.3, 2.00, 1.52, 0.22, -0.09),
        (3.2, 1.66, 1.25, 0.37, -0.11),
        (4.2, 1.39, 1.03, 0.53, -0.08),
        (5.2, 1.16, 0.86, 0.69, -0.04),
        (6.15, 0.92, 0.68, 0.84, 0.03),
        (6.95, 0.67, 0.49, 0.96, 0.08),
        (7.55, 0.42, 0.34, 1.04, 0.11),
        (7.95, 0.22, 0.20, 1.08, 0.13),
    ]
    obj = ring_mesh('PW_WindSpire', rings, 24, materials, phase=0.4)
    obj.rotation_euler[2] = math.radians(-8)
    for idx, z in enumerate((0.72, 1.38, 2.12, 2.94, 3.86, 4.84, 5.76, 6.58)):
        radius = max(0.28, 2.42 - z * 0.285)
        add_strata_ring(
            f'PW_SpireStrata_{idx:02d}',
            (0.10 + z * 0.125, -0.07 + z * 0.018, z),
            radius,
            radius * 0.78,
            strata_mat,
            math.radians(-8),
            0.026,
        )
    return obj


def add_shelf(materials, strata_mat):
    rings = [
        (0.0, 3.55, 1.72, 0.0, 0.0),
        (0.45, 3.42, 1.62, -0.06, 0.02),
        (0.92, 3.30, 1.51, -0.10, 0.03),
        (1.38, 3.18, 1.42, -0.14, 0.05),
        (1.84, 2.98, 1.28, -0.18, 0.08),
        (2.28, 2.65, 1.10, -0.22, 0.10),
        (2.62, 2.22, 0.91, -0.28, 0.12),
        (2.90, 1.72, 0.72, -0.35, 0.14),
    ]
    obj = ring_mesh('PW_ErodedShelf', rings, 26, materials, phase=1.1)
    obj.location = (6.4, 0.2, 0.0)
    obj.rotation_euler[2] = math.radians(14)
    for idx, z in enumerate((0.58, 1.08, 1.62, 2.15, 2.58)):
        radius = max(1.4, 3.42 - z * 0.53)
        add_strata_ring(
            f'PW_ShelfStrata_{idx:02d}',
            (6.34 - z * 0.07, 0.23 + z * 0.025, z),
            radius,
            radius * 0.47,
            strata_mat,
            math.radians(14),
            0.024,
        )
    return obj


def add_balanced_stone(materials):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=(-5.8, 0.2, 1.95))
    obj = bpy.context.active_object
    obj.name = 'PW_BalancedStone'
    for v in obj.data.vertices:
        p = v.co
        wave = 1.0 + 0.13 * math.sin(p.x * 4.7 + p.z * 2.1) + 0.065 * math.cos(p.y * 6.2 - p.z)
        p.x *= 2.15 * wave
        p.y *= 1.28 * (1.0 + 0.09 * math.sin(p.z * 5.0))
        p.z *= 1.72 * (1.0 + 0.06 * math.cos(p.x * 3.0))
    for mat in materials:
        obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
        if poly.normal.z < -0.25:
            poly.material_index = 2
        elif math.sin(poly.center.z * 7.0 + poly.center.x * 1.7) > 0.75:
            poly.material_index = 1
        elif poly.normal.x > 0.45:
            poly.material_index = 4
        else:
            poly.material_index = 0
    obj.rotation_euler = (math.radians(-7), math.radians(10), math.radians(-14))

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(-5.92, 0.14, 0.50))
    base = bpy.context.active_object
    base.name = 'PW_BalancedStoneFoot'
    base.scale = (1.28, 0.94, 0.60)
    for mat in materials:
        base.data.materials.append(mat)
    for poly in base.data.polygons:
        poly.use_smooth = True
        poly.material_index = 2 if poly.normal.z < 0.15 else 0
    return obj


def add_base_scree(materials):
    points = [
        (-3.4, -1.6, 0.18, 0.38), (-2.7, 1.4, 0.14, 0.28), (-1.4, -2.05, 0.12, 0.22),
        (2.15, -1.65, 0.13, 0.26), (3.4, 1.25, 0.17, 0.33), (5.0, -1.55, 0.14, 0.29),
        (8.35, 1.25, 0.15, 0.31), (-7.45, -0.72, 0.11, 0.23), (-4.2, 1.62, 0.13, 0.25),
    ]
    for idx, (x, y, z, scale) in enumerate(points):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0, location=(x, y, z))
        pebble = bpy.context.active_object
        pebble.name = f'PW_Scree_{idx:02d}'
        pebble.scale = (scale * 1.45, scale, scale * 0.62)
        pebble.rotation_euler = (0.15 * idx, 0.23 * idx, 0.41 * idx)
        for mat in materials:
            pebble.data.materials.append(mat)
        for poly in pebble.data.polygons:
            poly.use_smooth = True
            poly.material_index = 3 if idx % 3 == 0 else 0


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)

    sandstone = material('SiroccoSandstoneBase', (0.46, 0.235, 0.105), 0.965)
    sunface = material('SiroccoSunFace', (0.61, 0.345, 0.165), 0.94)
    undercut = material('SiroccoUndercut', (0.245, 0.105, 0.050), 0.985)
    iron = material('SiroccoIronStain', (0.35, 0.135, 0.060), 0.97)
    pale = material('SiroccoPaleWeathering', (0.69, 0.42, 0.22), 0.95)
    strata = material('SiroccoStrata', (0.72, 0.39, 0.17), 0.945)
    materials = [sandstone, sunface, undercut, iron, pale]

    add_spire(materials, strata)
    add_shelf(materials, strata)
    add_balanced_stone(materials)
    add_base_scree(materials)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH':
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            for mod in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)
            obj.select_set(False)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format='GLB',
        export_apply=True,
        export_materials='EXPORT',
        export_yup=True,
    )


if __name__ == '__main__':
    main()
