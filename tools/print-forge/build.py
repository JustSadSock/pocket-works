#!/usr/bin/env python3
"""Pocket Print Forge: deterministic, dimensioned print parts (millimetres)."""
import argparse
import json
import math
from pathlib import Path

import cadquery as cq
import trimesh

TYPES = {"gear_pair", "tray", "bracket", "spacer"}
LIMIT = 250.0


def number(data, name, low, high):
    raw = data.get(name)
    if not isinstance(raw, (int, float)) or isinstance(raw, bool) or not math.isfinite(raw):
        raise ValueError(f"{name}: expected a finite number")
    value = float(raw)
    if not low <= value <= high:
        raise ValueError(f"{name}: must be between {low} and {high}")
    return value


def integer(data, name, low, high):
    value = number(data, name, low, high)
    if value != int(value):
        raise ValueError(f"{name}: must be an integer")
    return int(value)


def gear_outline(teeth, module, pressure_degrees=20):
    """Standard involute flanks above the base circle; root is simplified."""
    pressure = math.radians(pressure_degrees)
    pitch = module * teeth / 2
    base = pitch * math.cos(pressure)
    root = max(module * .3, pitch - 1.25 * module)
    tip = pitch + module
    inv_pitch = math.tan(pressure) - pressure
    half_base = math.pi / (2 * teeth) + inv_pitch

    def half_angle(radius):
        if radius <= base:
            return half_base
        beta = math.acos(min(1.0, base / radius))
        return half_base - (math.tan(beta) - beta)

    result = []
    for i in range(teeth):
        center = i * 2 * math.pi / teeth
        def point(r, a):
            return (r * math.cos(center + a), r * math.sin(center + a))
        # Left flank rises; tip crosses; right flank descends.
        result.append(point(root, -half_base))
        for k in range(1, 9):
            radius = root + (tip - root) * k / 8
            result.append(point(radius, -half_angle(radius)))
        for k in range(1, 5):
            a = -half_angle(tip) + 2 * half_angle(tip) * k / 4
            result.append(point(tip, a))
        for k in range(1, 9):
            radius = tip - (tip - root) * k / 8
            result.append(point(radius, half_angle(radius)))
        result.append(point(root, math.pi / teeth))
    return result


def gear(teeth, module, thickness, bore):
    root_diameter = module * (teeth - 2.5)
    if bore >= root_diameter - 2.0:
        raise ValueError("Bore leaves less than 1 mm of web to the root circle")
    solid = cq.Workplane("XY").polyline(gear_outline(teeth, module)).close().extrude(thickness)
    return solid.faces(">Z").workplane().hole(bore)


def make_models(job):
    kind = job.get("type")
    if kind not in TYPES:
        raise ValueError("type: expected gear_pair, tray, bracket or spacer")
    if kind == "gear_pair":
        a = integer(job, "teeth_a", 17, 100)
        b = integer(job, "teeth_b", 17, 100)
        m = number(job, "module_mm", 0.8, 5.0)
        h = number(job, "thickness_mm", 2, 30)
        bore = number(job, "bore_mm", 2, 40)
        if m * (max(a, b) + 2) > LIMIT:
            raise ValueError("Gear outside 250 mm design envelope")
        one, two = gear(a, m, h, bore), gear(b, m, h, bore)
        distance = m * (a + b) / 2
        assembly = cq.Compound.makeCompound([one.val(), two.val().translate((distance, 0, 0))])
        return {"gear-a": one, "gear-b": two}, assembly, {
            "ratio": round(b / a, 5),
            "center_distance_mm": round(distance, 4),
            "pressure_angle_deg": 20,
            "note": "Involute approximation with simplified root; check backlash and fit on the printer."
        }
    if kind == "spacer":
        od = number(job, "outer_diameter_mm", 4, 150)
        bore = number(job, "bore_mm", 1, 100)
        h = number(job, "height_mm", 1, 100)
        if bore >= od - 2.0:
            raise ValueError("Spacer must have at least 1 mm radial wall")
        obj = cq.Workplane("XY").circle(od / 2).circle(bore / 2).extrude(h)
        return {"spacer": obj}, obj.val(), {}
    if kind == "tray":
        w = number(job, "width_mm", 20, LIMIT)
        d = number(job, "depth_mm", 20, LIMIT)
        h = number(job, "height_mm", 6, 150)
        wall = number(job, "wall_mm", 1.2, 8)
        if wall * 2 >= min(w, d) or wall >= h:
            raise ValueError("Wall thickness incompatible with outer dimensions")
        outer = cq.Workplane("XY").box(w, d, h, centered=(True, True, False))
        inner = cq.Workplane("XY").box(w-2*wall, d-2*wall, h-wall+2,
                                                 centered=(True, True, False)).translate((0,0,wall))
        obj = outer.cut(inner)
        return {"tray": obj}, obj.val(), {"open_top": True}
    w = number(job, "width_mm", 20, LIMIT)
    length = number(job, "length_mm", 20, LIMIT)
    height = number(job, "height_mm", 15, 150)
    thick = number(job, "thickness_mm", 2, 12)
    hole = number(job, "hole_mm", 2, 12)
    if min(w, length) < max(20, 4*hole) or height < 2*hole + thick:
        raise ValueError("Bracket dimensions are too small for mounting holes")
    base = cq.Workplane("XY").box(w, length, thick, centered=(True, True, False))
    upright = cq.Workplane("XY").box(w, thick, height, centered=(True, True, False)).translate((0,(length-thick)/2,0))
    obj = base.union(upright)
    for x in (-w/4, w/4):
        obj = obj.cut(cq.Solid.makeCylinder(hole/2, thick+2, cq.Vector(x,-length/4,-1)))
        obj = obj.cut(cq.Solid.makeCylinder(hole/2, thick+2,
                          cq.Vector(x, length/2-thick-1, height*.6), cq.Vector(0,1,0)))
    return {"bracket": obj}, obj.val(), {"mounting_holes": 4}


def validate_stl(path):
    mesh = trimesh.load_mesh(str(path), process=True)
    if mesh.is_empty or len(mesh.faces) == 0 or not mesh.is_watertight:
        raise ValueError(f"{path.name}: export is empty or not watertight")
    if not mesh.is_winding_consistent or mesh.volume <= 0:
        raise ValueError(f"{path.name}: inverted/non-positive geometry")
    if any(not math.isfinite(float(v)) or v <= 0 or v > LIMIT+2 for v in mesh.extents):
        raise ValueError(f"{path.name}: invalid dimensions")
    return {"triangles": int(len(mesh.faces)), "volume_mm3": round(float(mesh.volume), 2),
            "size_mm": [round(float(v), 3) for v in mesh.extents], "watertight": True}


def build(job_path, output_dir):
    job = json.loads(Path(job_path).read_text(encoding="utf-8"))
    if not isinstance(job, dict):
        raise ValueError("Job must be a JSON object")
    output_dir.mkdir(parents=True, exist_ok=True)
    models, assembly, facts = make_models(job)
    checks = {}
    for name, model in models.items():
        output = output_dir / (name + ".stl")
        cq.exporters.export(model, str(output), exportType="STL",
                            tolerance=0.05, angularTolerance=0.12)
        checks[output.name] = validate_stl(output)
    cq.exporters.export(assembly, str(output_dir / "model.step"), exportType="STEP")
    report = {"schema": 1, "type": job["type"], "units": "mm", "files": checks,
              "facts": facts, "analysis": "Geometry check only; not FEA, load or print guarantee."}
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    cli = argparse.ArgumentParser()
    cli.add_argument("--job", type=Path, required=True)
    cli.add_argument("--out", type=Path, required=True)
    args = cli.parse_args()
    print(json.dumps(build(args.job, args.out), indent=2))
