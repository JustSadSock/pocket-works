"""Deterministic, app-parameterized Blender primitives. Run inside Blender, never in game JS."""
import argparse
import json
import math
import os
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def material(name, color, roughness=0.8, metallic=0.0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color[:3], 1.0)
    result.roughness = roughness
    result.metallic = metallic
    return result


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def bevel(obj, width=0.04, segments=2):
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("Authored edge highlights", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")


def rock(config, rng):
    radius = float(config.get("radius", 1.0))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius)
    obj = bpy.context.object
    obj.name = "Rock_Author"
    stretch = config.get("stretch", [1.2, 0.8, 0.7])
    obj.scale = tuple(float(v) for v in stretch)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for vertex in obj.data.vertices:
        radial = vertex.co.normalized()
        vertex.co += radial * radius * rng.uniform(-0.14, 0.14)
    obj.data.materials.append(material("Stone_Matte", config.get("color", [0.42, 0.45, 0.43])))
    return obj


def tree(config, rng):
    height = float(config.get("height", 4.0))
    trunk = material("Trunk_Bark", config.get("bark", [0.29, 0.19, 0.12]))
    leaves = material("Foliage_Matte", config.get("foliage", [0.22, 0.35, 0.19]))
    bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=height * 0.09, radius2=height * 0.04, depth=height * 0.76, location=(0, 0, height * 0.38))
    stem = bpy.context.object
    stem.name = "Tree_Trunk"
    stem.data.materials.append(trunk)
    for index in range(5):
        z = height * (0.52 + index * 0.1)
        angle = index * 2.39996
        extent = height * (0.35 - index * 0.035)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=extent, location=(math.cos(angle) * extent * 0.22, math.sin(angle) * extent * 0.22, z))
        crown = bpy.context.object
        crown.name = f"Tree_Crown_{index:02d}"
        crown.scale = (1.0, 0.85, 0.62)
        for vertex in crown.data.vertices:
            vertex.co *= rng.uniform(0.9, 1.1)
        crown.data.materials.append(leaves)
    return stem


def weapon(config, rng):
    length = float(config.get("length", 1.3))
    blade = material("Blade_Satin", config.get("blade", [0.68, 0.72, 0.73]), 0.34, 0.75)
    grip = material("Grip_Leather", config.get("grip", [0.27, 0.16, 0.1]))
    # Tapered blade mesh with a raised center ridge catches authored highlights.
    w = length * 0.045
    vertices = [(-w, 0, 0), (0, -w * 0.25, 0), (w, 0, 0), (-w * 0.65, 0, length * 0.82), (0, -w * 0.18, length * 0.82), (w * 0.65, 0, length * 0.82), (0, 0, length)]
    faces = [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 6), (4, 5, 6), (2, 1, 0), (0, 3, 6, 5, 2)]
    mesh = bpy.data.meshes.new("Sword_Blade_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Sword_Blade", mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(blade)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -length * 0.03))
    guard = bpy.context.object
    guard.name = "Sword_Guard"
    guard.scale = (w * 4, w * 0.65, w * 0.45)
    guard.data.materials.append(blade)
    bevel(guard, w * 0.15)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=w * 0.56, depth=length * 0.2, location=(0, 0, -length * 0.16))
    handle = bpy.context.object
    handle.name = "Sword_Grip"
    handle.data.materials.append(grip)
    return obj


def building_module(config, rng):
    width, depth, height = (float(v) for v in config.get("size", [3, 2.5, 2.8]))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, height * 0.5))
    wall = bpy.context.object
    wall.name = "Building_Wall"
    wall.scale = (width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    wall.data.materials.append(material("Limewashed_Stone", config.get("wall", [0.66, 0.62, 0.53])))
    bevel(wall, min(width, depth, height) * 0.025)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -depth * 0.51, height * 0.32))
    door = bpy.context.object
    door.name = "Building_Door_Visual"
    door.scale = (width * 0.25, depth * 0.03, height * 0.64)
    door.data.materials.append(material("Door_Wood", [0.3, 0.2, 0.12]))
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=width * 0.72, radius2=0, depth=height * 0.42, location=(0, 0, height * 1.2), rotation=(0, 0, math.pi * 0.25))
    roof = bpy.context.object
    roof.name = "Building_Roof"
    roof.data.materials.append(material("Roof_Tile", config.get("roof", [0.35, 0.23, 0.19])))
    return wall


def collision_proxy(config):
    size = config.get("size", [1, 1, 1])
    bpy.ops.mesh.primitive_cube_add(size=1)
    proxy = bpy.context.object
    proxy.name = "COLLISION_Proxy"
    proxy.scale = tuple(float(v) for v in size)
    proxy.hide_render = True
    return proxy


def add_lod(obj, ratio=0.45):
    duplicate = obj.copy()
    duplicate.data = obj.data.copy()
    bpy.context.collection.objects.link(duplicate)
    duplicate.name = f"{obj.name}_LOD1"
    bpy.context.view_layer.objects.active = duplicate
    modifier = duplicate.modifiers.new("LOD1_Decimate", "DECIMATE")
    modifier.ratio = max(0.1, min(1.0, float(ratio)))
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    duplicate.hide_render = True
    return duplicate


RECIPES = {"rock": rock, "tree": tree, "weapon": weapon, "buildingModule": building_module}


def build_asset(recipe_path, output):
    data = json.loads(Path(recipe_path).read_text(encoding="utf-8"))
    kind = data.get("type")
    if kind not in RECIPES:
        raise ValueError(f"Unknown recipe: {kind}")
    seed = int(data.get("seed", 1))
    clear_scene()
    primary = RECIPES[kind](data.get("parameters", {}), random.Random(seed))
    if data.get("lod"):
        add_lod(primary, data["lod"].get("ratio", 0.45))
    if data.get("collision"):
        collision_proxy(data["collision"])
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_apply=True)
    if not output.exists() or output.stat().st_size < 500:
        raise RuntimeError("Recipe GLB export failed")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    build_asset(args.recipe, args.output)


if __name__ == "__main__":
    main()
