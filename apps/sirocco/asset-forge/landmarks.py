import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(argv)


def material(name, color, roughness=0.92):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*color, 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def ring_mesh(name, rings, segments, mat, phase=0.0):
    verts = []
    faces = []
    for ri, (z, rx, ry, lean_x, lean_y) in enumerate(rings):
        for i in range(segments):
            a = i / segments * math.tau
            ripple = 1.0 + 0.045 * math.sin(a * 3.0 + phase + ri * 0.72) + 0.025 * math.sin(a * 7.0 - ri)
            x = lean_x + math.cos(a) * rx * ripple
            y = lean_y + math.sin(a) * ry * (1.0 + 0.035 * math.cos(a * 5.0 + ri))
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
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    bev = obj.modifiers.new('WindSoftenedEdges', 'BEVEL')
    bev.width = 0.06
    bev.segments = 2
    return obj


def add_spire(mat):
    rings = [
        (0.0, 2.55, 2.00, 0.0, 0.0),
        (0.7, 2.40, 1.92, 0.05, -0.02),
        (1.8, 2.15, 1.64, 0.16, -0.08),
        (3.0, 1.72, 1.30, 0.33, -0.10),
        (4.2, 1.38, 1.04, 0.52, -0.08),
        (5.5, 1.08, 0.78, 0.73, -0.02),
        (6.8, 0.78, 0.55, 0.92, 0.08),
        (7.8, 0.32, 0.28, 1.05, 0.12),
    ]
    obj = ring_mesh('PW_WindSpire', rings, 18, mat, phase=0.4)
    obj.rotation_euler[2] = math.radians(-8)
    return obj


def add_shelf(mat):
    rings = [
        (0.0, 3.4, 1.6, 0.0, 0.0),
        (0.55, 3.25, 1.50, -0.08, 0.02),
        (1.15, 3.10, 1.38, -0.12, 0.04),
        (1.9, 2.85, 1.22, -0.16, 0.06),
        (2.45, 2.30, 0.95, -0.20, 0.10),
        (2.85, 1.65, 0.72, -0.24, 0.13),
    ]
    obj = ring_mesh('PW_ErodedShelf', rings, 20, mat, phase=1.1)
    obj.location = (6.4, 0.2, 0.0)
    obj.rotation_euler[2] = math.radians(14)
    return obj


def add_balanced_stone(mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=(-5.8, 0.2, 1.8))
    obj = bpy.context.active_object
    obj.name = 'PW_BalancedStone'
    for v in obj.data.vertices:
        p = v.co
        wave = 1.0 + 0.12 * math.sin(p.x * 4.7 + p.z * 2.1) + 0.06 * math.cos(p.y * 6.2 - p.z)
        p.x *= 2.1 * wave
        p.y *= 1.25 * (1.0 + 0.08 * math.sin(p.z * 5.0))
        p.z *= 1.65 * (1.0 + 0.05 * math.cos(p.x * 3.0))
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.rotation_euler = (math.radians(-7), math.radians(10), math.radians(-14))

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(-5.9, 0.12, 0.48))
    base = bpy.context.active_object
    base.name = 'PW_BalancedStoneFoot'
    base.scale = (1.15, 0.88, 0.58)
    base.data.materials.append(mat)
    for poly in base.data.polygons:
        poly.use_smooth = True
    return obj


def add_strata(obj, mat):
    # Thin inset rings catch grazing sunlight and create authored sediment layers.
    for idx, z in enumerate((0.8, 1.65, 2.55, 3.55, 4.65, 5.75)):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=max(0.32, 2.15 - z * 0.22),
            minor_radius=0.035,
            major_segments=28,
            minor_segments=5,
            location=(0.15 + z * 0.11, -0.08 + z * 0.018, z),
            rotation=(0.0, 0.0, math.radians(-8)),
        )
        torus = bpy.context.active_object
        torus.name = f'PW_Strata_{idx:02d}'
        torus.scale.y = 0.78
        torus.data.materials.append(mat)


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sandstone = material('SiroccoSandstone', (0.43, 0.19, 0.075), 0.96)
    strata = material('SiroccoStrata', (0.57, 0.285, 0.115), 0.93)
    spire = add_spire(sandstone)
    add_shelf(sandstone)
    add_balanced_stone(sandstone)
    add_strata(spire, strata)

    # Apply transforms/modifiers before export for predictable mobile runtime cost.
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
