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


def cyl(name, loc, radius, depth, mat, vertices=12, rot=(0, 0, 0), bevel_width=0.06):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    if bevel_width:
        bevel(obj, bevel_width, 2)
    apply_mat(obj, mat)
    return obj


def torus(name, loc, major, minor, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32, minor_segments=8, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    apply_mat(obj, mat)
    return obj


def collision_box(name, loc, scale, collision_mat, rot=(0, 0, 0)):
    return box(f'COL_{name}', loc, scale, collision_mat, rot, 0.0)


def platform(name, center, half, visual_mat, collision_mat, thickness=0.5):
    x, y, z = center
    sx, sz = half
    box(f'{name}_Floor', (x, y - thickness * 0.5, z), (sx, thickness * 0.5, sz), visual_mat, bevel_width=0.07)
    collision_box(f'{name}_Floor', (x, y - thickness * 0.45, z), (sx, thickness * 0.45, sz), collision_mat)


def wall(name, center, half, visual_mat, collision_mat, rot=(0, 0, 0)):
    box(name, center, half, visual_mat, rot, 0.1)
    collision_box(name, center, half, collision_mat, rot)


def ramp(name, start, end, width, visual_mat, collision_mat):
    sx, sy, sz = start
    ex, ey, ez = end
    dx, dy, dz = ex - sx, ey - sy, ez - sz
    length = math.sqrt(dx * dx + dz * dz)
    yaw = math.atan2(dx, dz)
    pitch = -math.atan2(dy, max(0.001, length))
    cx, cy, cz = (sx + ex) / 2, (sy + ey) / 2 - 0.18, (sz + ez) / 2
    box(f'{name}_RampVisual', (cx, cy, cz), (width * 0.5, 0.18, length * 0.5), visual_mat, (pitch, yaw, 0), 0.04)
    collision_box(f'{name}_Ramp', (cx, cy + 0.08, cz), (width * 0.48, 0.16, length * 0.49), collision_mat, (pitch, yaw, 0))
    steps = max(4, int(length / 1.2))
    for i in range(steps + 1):
        t = i / steps
        x = sx + dx * t
        y = sy + dy * t - 0.12
        z = sz + dz * t
        box(f'{name}_Step_{i}', (x, y, z), (width * 0.48, 0.12, 0.42), visual_mat, (0, yaw, 0), 0.025)


def arch(name, x, y, z, width, height, depth, stone, accent):
    pillar = 0.7
    box(f'{name}_L', (x - width * 0.5, y + height * 0.5, z), (pillar, height * 0.5, depth), stone, bevel_width=0.09)
    box(f'{name}_R', (x + width * 0.5, y + height * 0.5, z), (pillar, height * 0.5, depth), stone, bevel_width=0.09)
    box(f'{name}_Top', (x, y + height, z), (width * 0.5 + pillar, 0.65, depth), stone, bevel_width=0.09)
    torus(f'{name}_SunBand', (x, y + height - 0.15, z - depth - 0.04), width * 0.28, 0.08, accent, (math.pi / 2, 0, 0))


def shrine(name, x, y, z, stone, dark, bronze, glow):
    cyl(f'{name}_Base', (x, y + 0.25, z), 1.8, 0.5, dark, 10)
    cyl(f'{name}_Column', (x, y + 1.9, z), 0.62, 3.1, stone, 6)
    torus(f'{name}_Halo', (x, y + 2.4, z), 1.1, 0.08, bronze, (math.pi / 2, 0, 0))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.34, location=(x, y + 3.7, z))
    core = bpy.context.object
    core.name = f'{name}_Core'
    apply_mat(core, glow)


def build_world():
    basalt = material('Basalt', (0.075, 0.065, 0.085), roughness=0.94)
    cutstone = material('Warm Cut Stone', (0.25, 0.17, 0.14), roughness=0.86)
    ashstone = material('Ash Stone', (0.13, 0.12, 0.15), roughness=0.9)
    bronze = material('Sun Bronze', (0.46, 0.21, 0.065), metallic=0.72, roughness=0.31)
    gold = material('Relic Gold', (0.9, 0.45, 0.09), metallic=0.48, roughness=0.24, emission=(1.0, 0.19, 0.02), strength=3.5)
    ember = material('Ember Glass', (0.45, 0.055, 0.015), roughness=0.2, emission=(1.0, 0.035, 0.008), strength=5.0)
    blue = material('Archive Glass', (0.04, 0.16, 0.26), metallic=0.12, roughness=0.28, emission=(0.04, 0.32, 0.85), strength=2.5)
    cloth = material('Ash Banners', (0.36, 0.055, 0.035), roughness=0.92)
    moss = material('Night Moss', (0.055, 0.13, 0.095), roughness=1.0)
    collision = material('COLLISION_PROXY', (0.0, 1.0, 0.1), roughness=1.0)

    # The playable level is a real route, not an arena: Gate -> Courtyard -> two wings -> Sun Bridge -> Sanctum.
    platform('GateYard', (0, 0, -43), (8.5, 10.5), basalt, collision)
    platform('Courtyard', (0, 2.0, -22), (13.5, 10.0), cutstone, collision)
    ramp('GateToCourtyard', (0, 0.05, -33.5), (0, 2.05, -29.5), 6.5, cutstone, collision)

    platform('ArchiveWing', (-20, 4.0, -8), (8.5, 8.5), ashstone, collision)
    platform('ForgeWing', (20, 4.0, -8), (8.5, 8.5), basalt, collision)
    ramp('CourtyardToArchive', (-8.5, 2.05, -18), (-14.2, 4.05, -11.5), 4.2, ashstone, collision)
    ramp('CourtyardToForge', (8.5, 2.05, -18), (14.2, 4.05, -11.5), 4.2, basalt, collision)

    platform('BridgeApproach', (0, 5.0, -5), (8.0, 7.0), cutstone, collision)
    ramp('CourtyardToApproach', (0, 2.05, -12.5), (0, 5.05, -10.0), 5.2, cutstone, collision)
    platform('SunBridge', (0, 6.0, 11), (4.2, 10.5), cutstone, collision)
    ramp('ApproachToBridge', (0, 5.05, 2.0), (0, 6.05, 3.0), 4.0, cutstone, collision)
    platform('Sanctum', (0, 8.0, 31), (13.0, 11.5), basalt, collision)
    ramp('BridgeToSanctum', (0, 6.05, 21.5), (0, 8.05, 24.5), 5.2, cutstone, collision)

    # Gate yard architecture.
    arch('OuterGate', 0, 0, -52.5, 7.0, 7.0, 1.1, basalt, bronze)
    for side in (-1, 1):
        wall(f'GateWall_{side}', (side * 8.8, 3.2, -43), (0.8, 3.2, 10.5), basalt, collision)
        cyl(f'GateTower_{side}', (side * 10.2, 4.0, -50.5), 2.5, 8.0, cutstone, 12)
        torus(f'GateTowerBand_{side}', (side * 10.2, 6.1, -50.5), 2.2, 0.11, bronze, (math.pi / 2, 0, 0))
    for i in range(8):
        x = -6.5 + i * 1.85
        box(f'GateFloorRune_{i}', (x, 0.04, -41), (0.6, 0.035, 1.5), bronze, bevel_width=0.02)

    # Courtyard is a readable hub with balconies and sight lines to both wings.
    for side in (-1, 1):
        wall(f'CourtSideWall_{side}', (side * 13.8, 5.1, -22), (0.7, 3.1, 10.2), basalt, collision)
        for z in (-29, -22, -15):
            cyl(f'CourtColumn_{side}_{z}', (side * 11.7, 4.8, z), 0.7, 5.6, cutstone, 10)
    cyl('CourtWell', (0, 2.45, -22), 2.3, 0.9, basalt, 12)
    torus('CourtWellBronze', (0, 2.95, -22), 2.0, 0.11, bronze, (math.pi / 2, 0, 0))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.55, location=(0, 4.1, -22))
    apply_mat(bpy.context.object, gold)

    # Archive: cool glass, shelves, broken astronomical machine.
    arch('ArchiveEntrance', -13.0, 4.0, -8, 5.2, 5.4, 0.8, ashstone, bronze)
    for row in range(4):
        z = -13.5 + row * 3.6
        for side in (-1, 1):
            box(f'ArchiveShelf_{row}_{side}', (-20 + side * 5.7, 5.6, z), (0.55, 1.6, 1.3), ashstone, bevel_width=0.05)
            for k in range(4):
                box(f'ArchiveTablet_{row}_{side}_{k}', (-20 + side * 5.4, 5.0 + k * 0.42, z), (0.3, 0.12, 0.85), blue, bevel_width=0.02)
    torus('ArchiveOrreryOuter', (-20, 6.2, -7.5), 2.6, 0.12, bronze, (math.pi / 2, 0, 0))
    torus('ArchiveOrreryInner', (-20, 6.2, -7.5), 1.7, 0.09, blue, (math.pi / 2, math.pi / 4, 0))
    shrine('ArchiveShardShrine', -20, 4.0, -2.5, cutstone, basalt, bronze, blue)

    # Forge: red light, anvils, chimneys, suspended furnace ring.
    arch('ForgeEntrance', 13.0, 4.0, -8, 5.2, 5.4, 0.8, basalt, bronze)
    for i in range(3):
        z = -13 + i * 5.2
        cyl(f'ForgeBrazier_{i}', (17, 4.6, z), 1.0, 1.2, basalt, 10)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.5, location=(17, 5.5, z))
        apply_mat(bpy.context.object, ember)
        box(f'ForgeAnvil_{i}', (23, 4.65, z), (1.3, 0.55, 0.75), cutstone, bevel_width=0.11)
    torus('ForgeFurnaceRing', (20, 7.2, -7.2), 3.0, 0.18, bronze, (math.pi / 2, 0, 0))
    for i in range(6):
        a = i * math.tau / 6
        box(f'ForgeChain_{i}', (20 + math.cos(a) * 3.0, 8.5, -7.2 + math.sin(a) * 3.0), (0.07, 1.4, 0.07), bronze, bevel_width=0.02)
    shrine('ForgeEmberShrine', 20, 4.0, -2.5, cutstone, basalt, bronze, ember)

    # Approach and bridge: intentionally exposed over the abyss.
    arch('SunBridgeGate', 0, 5.0, 1.5, 5.4, 6.0, 0.8, basalt, gold)
    for i in range(7):
        z = 4 + i * 3.0
        for side in (-1, 1):
            box(f'BridgePost_{i}_{side}', (side * 4.25, 7.1, z), (0.32, 1.1, 0.32), basalt, bevel_width=0.05)
            if i % 2 == 0:
                torus(f'BridgeHalo_{i}_{side}', (side * 4.25, 8.2, z), 0.48, 0.05, bronze, (math.pi / 2, 0, 0))
    for i in range(5):
        z = 5.0 + i * 4.2
        box(f'BridgeCrack_{i}', ((-1 if i % 2 else 1) * 1.3, 6.08, z), (1.2, 0.06, 0.12), basalt, (0, 0.2 * (i - 2), 0), 0.0)

    # Final sanctum: circular arena only at the climax, with meaningful route before it.
    cyl('SanctumDais', (0, 8.15, 32), 8.0, 0.45, cutstone, 16)
    collision_box('SanctumDais', (0, 8.1, 32), (7.2, 0.18, 7.2), collision)
    shrine('FinalRelic', 0, 8.0, 38.5, cutstone, basalt, bronze, gold)
    for i in range(8):
        a = i * math.tau / 8
        x, z = math.cos(a) * 10.3, 32 + math.sin(a) * 9.1
        cyl(f'SanctumColumn_{i}', (x, 11.3, z), 0.75, 6.2, basalt, 10)
        torus(f'SanctumColumnBand_{i}', (x, 13.1, z), 0.7, 0.06, bronze, (math.pi / 2, 0, 0))
    arch('SanctumCrown', 0, 8.0, 42.0, 8.0, 8.0, 1.1, basalt, gold)

    # Decorative banners and vegetation make spaces legible and colorful.
    for i, (x, y, z) in enumerate([(-9, 6, -22), (9, 6, -22), (-20, 8, -15), (20, 8, -15), (-5, 10, 31), (5, 10, 31)]):
        box(f'BannerPole_{i}', (x, y, z), (0.07, 2.2, 0.07), bronze, bevel_width=0.02)
        banner = box(f'Banner_{i}', (x + 0.65, y, z), (0.04, 1.25, 0.65), cloth, bevel_width=0.01)
        banner.rotation_euler.z = (-0.08 if i % 2 else 0.1)
    for i, (x, y, z) in enumerate([(-11, 2.08, -26), (10, 2.08, -17), (-25, 4.08, -4), (25, 4.08, -12), (-4, 6.08, 14), (6, 8.08, 35)]):
        box(f'MossPatch_{i}', (x, y, z), (1.5, 0.025, 0.9), moss, (0, i * 0.35, 0), 0.0)

    # Low-poly mountain silhouettes around the route; they are visual only.
    for i in range(18):
        a = i * math.tau / 18 + 0.13
        r = 58 + (i % 4) * 7
        x, z = math.cos(a) * r, math.sin(a) * r - 3
        height = 18 + (i % 5) * 5
        bpy.ops.mesh.primitive_cone_add(vertices=7 + (i % 3), radius1=12 + (i % 4) * 2, radius2=0.5, depth=height, location=(x, -5 + height * 0.5, z), rotation=(0.05 * (i % 2), 0, a * 0.17))
        mountain = bpy.context.object
        mountain.name = f'Mountain_{i}'
        apply_mat(mountain, basalt if i % 2 else ashstone)


def export(output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format='GLB',
        export_apply=True,
        export_materials='EXPORT'
    )
    print(f'RELIC SIEGE 2 fortress generated: {output} ({output.stat().st_size} bytes)')


def main():
    args = parse_args()
    clear_scene()
    build_world()
    export(args.output)


if __name__ == '__main__':
    main()
