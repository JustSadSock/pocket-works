import argparse
import math
import sys
from pathlib import Path

import bpy


def parse_args():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    return parser.parse_args(args)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        pass


def material(name, color, metallic=0.0, roughness=0.75, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        if 'Base Color' in bsdf.inputs:
            bsdf.inputs['Base Color'].default_value = (*color, 1.0)
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = metallic
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = roughness
        if emission:
            key = 'Emission Color' if 'Emission Color' in bsdf.inputs else ('Emission' if 'Emission' in bsdf.inputs else None)
            if key:
                bsdf.inputs[key].default_value = (*emission, 1.0)
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = strength
    return m


def apply_mat(obj, mat):
    if obj.data and hasattr(obj.data, 'materials'):
        obj.data.materials.append(mat)


def bevel(obj, width=0.12, segments=2):
    mod = obj.modifiers.new('Worn bevels', 'BEVEL')
    mod.width = width
    mod.segments = segments


def box(name, loc, scale, mat, rot=(0, 0, 0), bevel_width=0.08):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_width:
        bevel(obj, bevel_width)
    apply_mat(obj, mat)
    return obj


def cyl(name, loc, radius, depth, mat, vertices=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    bevel(obj, 0.06, 2)
    apply_mat(obj, mat)
    return obj


def torus(name, loc, major, minor, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32, minor_segments=8, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    apply_mat(obj, mat)
    return obj


def build_world():
    basalt = material('Basalt', (0.11, 0.085, 0.095), roughness=0.92)
    cutstone = material('Cut Stone', (0.21, 0.16, 0.15), roughness=0.88)
    bronze = material('Sun Bronze', (0.42, 0.20, 0.07), metallic=0.72, roughness=0.32)
    gold = material('Relic Gold', (0.74, 0.35, 0.08), metallic=0.5, roughness=0.28, emission=(1.0, 0.22, 0.025), strength=2.6)
    ember = material('Ember Glass', (0.34, 0.055, 0.018), metallic=0.08, roughness=0.26, emission=(1.0, 0.06, 0.01), strength=4.2)
    cloth = material('Ash Banners', (0.25, 0.055, 0.035), roughness=0.9)

    # Monumental central dais and relic.
    cyl('Citadel_Dais', (0, -0.5, 0), 5.9, 1.0, basalt, 16)
    cyl('Relic_Platform', (0, 0.18, 0), 3.35, 0.55, cutstone, 12)
    for r, y in ((2.4, 0.65), (1.8, 1.3), (1.15, 2.0)):
        torus(f'Relic_Ring_{r}', (0, y, 0), r, 0.10 if r > 1.2 else 0.08, bronze, (math.pi / 2, 0, 0))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.72, location=(0, 2.0, 0))
    core = bpy.context.object
    core.name = 'Solar_Relic_Core'
    apply_mat(core, gold)
    for i in range(6):
        a = i * math.tau / 6
        box(f'Relic_Fin_{i}', (math.cos(a) * 1.0, 2.0, math.sin(a) * 1.0), (0.12, 0.08, 0.62), bronze, (0, -a, a), 0.03)

    # Three authored obelisks exactly aligned to gameplay coordinates.
    pylon_positions = [(0, 12), (10.4, -6), (-10.4, -6)]
    for idx, (x, z) in enumerate(pylon_positions, 1):
        cyl(f'Obelisk_{idx}_Base', (x, 0.22, z), 1.65, 0.44, basalt, 10)
        cyl(f'Obelisk_{idx}_Shaft', (x, 2.15, z), 0.58, 3.9, cutstone, 6)
        cyl(f'Obelisk_{idx}_Cap', (x, 4.05, z), 0.9, 0.35, bronze, 6)
        torus(f'Obelisk_{idx}_Halo', (x, 2.7, z), 1.1, 0.07, bronze, (math.pi / 2, 0, 0))
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.28, location=(x, 4.48, z))
        apply_mat(bpy.context.object, ember)
        # Broken shrine fins give each landmark a readable silhouette.
        for j in range(4):
            a = j * math.pi / 2 + idx * 0.19
            box(f'Obelisk_{idx}_Fin_{j}', (x + math.cos(a) * 1.45, 1.0, z + math.sin(a) * 1.45), (0.22, 0.95 + 0.12 * j, 0.48), basalt, (0, -a, 0), 0.06)

    # Circular monastery wall, alternating towers and broken crenellations.
    for i in range(20):
        a = i * math.tau / 20
        r = 18.5
        x, z = math.cos(a) * r, math.sin(a) * r
        height = 2.5 + (i % 4) * 0.32
        box(f'Wall_{i}', (x, height / 2 - 0.05, z), (2.7, height / 2, 0.72), basalt, (0, -a + math.pi / 2, 0), 0.12)
        if i % 5 == 0:
            cyl(f'Tower_{i}', (x, 2.7, z), 2.0, 5.4, cutstone, 10)
            torus(f'Tower_Band_{i}', (x, 4.6, z), 1.72, 0.12, bronze, (math.pi / 2, 0, 0))
        elif i % 3 != 1:
            box(f'Crenel_{i}', (x, height + 0.45, z), (0.55, 0.5, 0.82), cutstone, (0, -a + math.pi / 2, 0), 0.05)

    # Inner processional path and standing stones create depth without runtime primitives.
    for i in range(12):
        a = i * math.tau / 12 + math.pi / 12
        x, z = math.cos(a) * 8.3, math.sin(a) * 8.3
        box(f'Procession_Slab_{i}', (x, 0.08, z), (1.8, 0.12, 0.88), cutstone, (0, -a + math.pi / 2, 0), 0.04)
        if i % 2 == 0:
            box(f'Rune_Stone_{i}', (math.cos(a) * 14.0, 1.4, math.sin(a) * 14.0), (0.42, 1.4, 0.85), basalt, (0, -a, 0), 0.1)
            torus(f'Rune_Halo_{i}', (math.cos(a) * 14.0, 2.65, math.sin(a) * 14.0), 0.62, 0.055, bronze, (math.pi / 2, 0, 0))

    # Tattered banners are thickened planes to stay visible in mobile GLB rendering.
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        x, z = math.cos(a) * 16.2, math.sin(a) * 16.2
        box(f'Banner_Pole_{i}', (x, 3.1, z), (0.07, 2.5, 0.07), bronze, bevel_width=0.02)
        banner = box(f'Banner_{i}', (x + math.cos(a + math.pi / 2) * 0.62, 3.4, z + math.sin(a + math.pi / 2) * 0.62), (0.03, 1.35, 0.62), cloth, (0, -a, 0), 0.01)
        banner.rotation_euler.z = (0.08 if i % 2 else -0.1)


def export(output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format='GLB',
        export_apply=True,
        export_materials='EXPORT'
    )
    print(f'RELIC SIEGE fortress generated: {output} ({output.stat().st_size} bytes)')


def main():
    args = parse_args()
    clear_scene()
    build_world()
    export(args.output)


if __name__ == '__main__':
    main()
