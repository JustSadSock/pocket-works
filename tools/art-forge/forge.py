"""App-owned, transactional art production. Manifests are data, not shell scripts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
ADAPTERS = {
    "pixel": {"image": ".png", "atlas": ".json"},
    "raster": {"image": ".png"},
    "vector": {"image": ".png", "vector": ".svg"},
    "krita": {"image": ".png"},
    "pixelorama": {"image": ".png"},
    "blender": {"model": ".glb", "editable": ".blend"},
    "bake": {"image": ".png"},
}
SOURCE_SUFFIX = {"pixel": ".json", "raster": ".json", "vector": ".svg",
                 "krita": ".kra", "pixelorama": ".pxo", "blender": ".py", "bake": ".blend"}
PARAMS = {"pixel": set(), "raster": {"size", "crop", "resample"},
          "vector": {"width", "height"}, "krita": set(), "pixelorama": set(),
          "blender": None, "bake": {"width", "height", "frame", "samples"}}


def command(args, env=None, timeout=180):
    try:
        return subprocess.run([str(a) for a in args], check=True, text=True,
                              capture_output=True, timeout=timeout, env=env)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f"Tool failed ({error.returncode}): {(error.stdout + error.stderr)[-4000:]}") from error


def capabilities(overrides=None):
    overrides = overrides or {}
    result = {}
    flags = {"inkscape": ("--export-filename", "--export-width"),
             "krita": ("--export", "--export-filename"),
             "pixelorama": ("--spritesheet", "--output"), "blender": ("--background", "--disable-autoexec")}
    try:
        import PIL
        result["pillow"] = {"available": True, "version": PIL.__version__}
    except ImportError:
        result["pillow"] = {"available": False, "reason": "Install Pillow"}
    for tool in flags:
        executable = overrides.get(tool) or shutil.which(tool)
        info = {"available": False, "executable": executable}
        if executable:
            try:
                env = dict(os.environ, QT_QPA_PLATFORM="offscreen")
                prefix = [executable, "--headless", "--quit", "--"] if tool == "pixelorama" else [executable]
                version = command(prefix + ["--version"], env, 20)
                help_text = command(prefix + ["--help"], env, 20)
                text = help_text.stdout + help_text.stderr
                missing = [flag for flag in flags[tool] if flag not in text]
                info.update(available=not missing, version=(version.stdout + version.stderr).strip()[:500],
                            reason="Missing CLI flags: " + ", ".join(missing) if missing else "")
            except (OSError, RuntimeError, subprocess.SubprocessError) as error:
                info["reason"] = str(error)
        else:
            info["reason"] = "Not installed; no automatic fallback"
        result[tool] = info
    return result


def local(root, value, must_exist=False):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_./-]+", value):
        raise ValueError("Expected an app-relative path")
    parts = Path(value)
    if parts.is_absolute() or ".." in parts.parts or parts == Path("."):
        raise ValueError("Path must be a non-root app-relative file: " + value)
    path = (root / parts).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Path escapes owning app: " + value)
    if must_exist and not path.is_file():
        raise ValueError("Missing source: " + value)
    return path


def positive(value, maximum, label):
    if isinstance(value, bool) or not isinstance(value, int) or not 0 < value <= maximum:
        raise ValueError(f"{label} must be an integer between 1 and {maximum}")
    return value


def plan(app, data):
    if not isinstance(data, dict) or data.get("version") != 2:
        raise ValueError("Universal Art Forge requires manifest version 2")
    if set(data) - {"version", "runtimeRoot", "index", "jobs"}:
        raise ValueError("Unknown manifest field")
    runtime = data.get("runtimeRoot")
    runtime_dir = app if runtime == "." else local(app, runtime)
    index = local(app, data.get("index"))
    if index.suffix != ".json" or not index.is_relative_to(runtime_dir):
        raise ValueError("Index must be runtime-owned JSON")
    jobs = data.get("jobs")
    if not isinstance(jobs, list) or not 0 < len(jobs) <= 128:
        raise ValueError("Expected 1–128 jobs")
    by_id, producers, sources = {}, {index: "index"}, set()
    for job in jobs:
        if not isinstance(job, dict) or set(job) - {"id", "adapter", "source", "inputs", "dependsOn", "seed", "parameters", "outputs", "budget", "provenance"}:
            raise ValueError("Unknown job field; commands/flags are forbidden")
        identity = job.get("id")
        if not isinstance(identity, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", identity) or identity in by_id:
            raise ValueError("Expected unique kebab-case job id")
        adapter = job.get("adapter")
        if adapter not in ADAPTERS:
            raise ValueError("Unknown adapter")
        source = local(app, job.get("source"))
        if source.suffix.lower() != SOURCE_SUFFIX[adapter]:
            raise ValueError("Wrong editable source format for " + adapter)
        inputs = job.get("inputs", [])
        deps = job.get("dependsOn", [])
        if not isinstance(inputs, list) or not all(isinstance(p, str) for p in inputs) or not isinstance(deps, list) or not all(isinstance(d, str) for d in deps) or len(set(deps)) != len(deps):
            raise ValueError("inputs and dependsOn must be lists; dependencies unique")
        sources.update(local(app, p) for p in [job["source"], *inputs])
        outputs = job.get("outputs")
        if not isinstance(outputs, dict) or set(outputs) != set(ADAPTERS[adapter]):
            raise ValueError("Declare exact output roles for " + adapter)
        for role, value in outputs.items():
            path = local(app, value)
            owned_editable = role == "editable" and path.is_relative_to(app / "asset-forge")
            if path in producers or path.suffix.lower() != ADAPTERS[adapter][role] or (not owned_editable and not path.is_relative_to(runtime_dir)):
                raise ValueError("Duplicate, invalid or non-runtime output: " + value)
            producers[path] = identity
        params = job.get("parameters", {})
        if not isinstance(params, dict) or (PARAMS[adapter] is not None and set(params) - PARAMS[adapter]):
            raise ValueError("Unsupported parameters for " + adapter)
        if len(json.dumps(params, allow_nan=False)) > 65536:
            raise ValueError("Parameters too large")
        seed = job.get("seed")
        if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
            raise ValueError("Explicit unsigned 32-bit seed required")
        provenance = job.get("provenance")
        if not isinstance(provenance, dict) or not all(isinstance(provenance.get(k), str) and provenance[k].strip() for k in ("author", "license", "origin")):
            raise ValueError("Author, license and origin required")
        budget = job.get("budget")
        if not isinstance(budget, dict) or set(budget) - {"maxBytes", "maxWidth", "maxHeight", "maxTriangles", "maxTextureSize"}:
            raise ValueError("Invalid budget")
        positive(budget.get("maxBytes"), 256 * 1024 * 1024, "maxBytes")
        for key in set(budget) - {"maxBytes"}:
            positive(budget[key], 1000000 if key == "maxTriangles" else 8192, key)
        if adapter == "blender" and not {"maxTriangles", "maxTextureSize"} <= set(budget):
            raise ValueError("GLB needs geometry and texture budgets")
        if adapter != "blender" and not {"maxWidth", "maxHeight"} <= set(budget):
            raise ValueError("2D needs dimension budgets")
        by_id[identity] = job
    # Resolve the entire graph before any editor is invoked.
    ordered, visiting, visited = [], set(), set()
    def visit(identity):
        if identity in visiting:
            raise ValueError("Dependency cycle")
        if identity in visited:
            return
        if identity not in by_id:
            raise ValueError("Unknown dependency: " + str(identity))
        visiting.add(identity)
        job = by_id[identity]
        for dep in job.get("dependsOn", []):
            visit(dep)
        for p in [job["source"], *job.get("inputs", [])]:
            path = local(app, p)
            producer = producers.get(path)
            if producer:
                if producer not in job.get("dependsOn", []) or producer == identity:
                    raise ValueError("Input needs explicit producer dependency: " + p)
            elif not path.is_file():
                raise ValueError("Missing editable source/input: " + p)
        visiting.remove(identity)
        visited.add(identity)
        ordered.append(job)
    for identity in by_id:
        visit(identity)
    # An output may be a dependency's input, never an original source.
    for path in sources & set(producers):
        if path.is_file() and producers[path] == "index":
            raise ValueError("Index cannot be a source")
    paths = list(producers)
    if any(a != b and a.is_relative_to(b) for a in paths for b in paths):
        raise ValueError("Nested output paths")
    return ordered, runtime_dir, index


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def json_write(path, data):
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def safe_svg(source):
    text = source.read_text(encoding="utf-8")
    if "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
        raise ValueError("SVG entities forbidden")
    root = ET.fromstring(text)
    if root.tag.split("}")[-1] != "svg":
        raise ValueError("Expected SVG")
    for node in root.iter():
        if node.tag.split("}")[-1] in {"script", "foreignObject", "image"}:
            raise ValueError("SVG must be self-contained vector paths")
        for key, value in node.attrib.items():
            if key.lower().startswith("on") or (key.split("}")[-1] == "href" and not value.startswith("#")):
                raise ValueError("Active or external SVG reference")
    if re.search(r"(?:url\(\s*['\"]?(?!#)|@import)", text, re.I):
        raise ValueError("External SVG style resource")
    return root


def pixel(source, outputs):
    from PIL import Image, ImageColor
    data = json.loads(source.read_text())
    width = positive(data.get("width"), 512, "pixel width")
    height = positive(data.get("height"), 512, "pixel height")
    palette = data.get("palette")
    if not isinstance(palette, dict) or not 1 <= len(palette) <= 256 or any(len(k) != 1 for k in palette):
        raise ValueError("Pixel palette uses single-character keys")
    colors = {key: ImageColor.getcolor(value, "RGBA") for key, value in palette.items()}
    frames = data.get("frames")
    if not isinstance(frames, list) or not 1 <= len(frames) <= 256:
        raise ValueError("Expected 1–256 pixel frames")
    if width * height * len(frames) > 16 * 1024 * 1024:
        raise ValueError("Pixel atlas exceeds allocation budget")
    sheet = Image.new("RGBA", (width * len(frames), height))
    records = []
    names = set()
    for i, frame in enumerate(frames):
        name = frame.get("name")
        if not isinstance(name, str) or not name or name in names:
            raise ValueError("Unique named frames required")
        names.add(name)
        duration = positive(frame.get("durationMs"), 60000, "durationMs")
        layers = frame.get("layers")
        if not isinstance(layers, list) or not 1 <= len(layers) <= 64:
            raise ValueError("Frame requires layers")
        image = Image.new("RGBA", (width, height))
        for layer in layers:
            rows = layer.get("rows")
            if not isinstance(rows, list) or len(rows) != height or any(not isinstance(row, str) or len(row) != width for row in rows):
                raise ValueError("Pixel rows must match exact frame size")
            rgba = Image.new("RGBA", (width, height))
            try:
                rgba.putdata([colors[c] for row in rows for c in row])
            except KeyError as error:
                raise ValueError("Unknown palette index") from error
            if layer.get("visible", True):
                image = Image.alpha_composite(image, rgba)
        sheet.paste(image, (i * width, 0))
        records.append({"name": name, "rect": [i * width, 0, width, height], "durationMs": duration,
                        "pivot": frame.get("pivot", [width / 2, height - 1]), "tag": frame.get("tag", name)})
    sheet.save(outputs["image"])
    json_write(outputs["atlas"], {"version": 1, "image": outputs["image"].name,
                                   "sampling": "nearest", "frames": records})


def raster(source, inputs, outputs, params):
    from PIL import Image
    recipe = json.loads(source.read_text())
    size = recipe.get("size")
    if not isinstance(size, list) or len(size) != 2:
        raise ValueError("Raster recipe needs size")
    size = tuple(positive(n, 4096, "raster dimension") for n in size)
    canvas = Image.new("RGBA", size)
    layers = recipe.get("layers")
    if not isinstance(layers, list) or not 1 <= len(layers) <= 64:
        raise ValueError("Raster needs 1–64 layers")
    for layer in layers:
        if layer.get("input") not in inputs or (layer.get("mask") and layer["mask"] not in inputs):
            raise ValueError("Raster layer and mask must be declared inputs")
        with Image.open(inputs[layer["input"]]) as original:
            if original.format != "PNG" or max(original.size) > 4096:
                raise ValueError("Raster input must be a bounded PNG")
            image = original.convert("RGBA")
        opacity = layer.get("opacity", 1)
        if not isinstance(opacity, (int, float)) or not 0 <= opacity <= 1:
            raise ValueError("Layer opacity must be in [0,1]")
        alpha = image.getchannel("A").point(lambda n: round(n * opacity))
        if layer.get("mask"):
            from PIL import ImageChops
            mask = Image.open(inputs[layer["mask"]]).convert("L")
            if mask.size != image.size:
                raise ValueError("Mask dimensions must match layer")
            alpha = ImageChops.multiply(alpha, mask)
        image.putalpha(alpha)
        offset = layer.get("offset", [0, 0])
        if not isinstance(offset, list) or len(offset) != 2 or not all(isinstance(n, int) and abs(n) <= 8192 for n in offset):
            raise ValueError("Invalid raster layer offset")
        canvas.alpha_composite(image, tuple(offset))
    if "crop" in params:
        crop = params["crop"]
        if not isinstance(crop, list) or len(crop) != 4 or not all(isinstance(n, int) for n in crop) or not 0 <= crop[0] < crop[2] <= size[0] or not 0 <= crop[1] < crop[3] <= size[1]:
            raise ValueError("Invalid crop")
        canvas = canvas.crop(tuple(crop))
    if "size" in params:
        size = params["size"]
        if not isinstance(size, list) or len(size) != 2:
            raise ValueError("Resize needs two dimensions")
        mode = params.get("resample", "lanczos")
        if mode not in {"nearest", "lanczos"}:
            raise ValueError("Unsupported resampling")
        canvas = canvas.resize(tuple(positive(n, 4096, "resize") for n in size),
                               Image.Resampling.NEAREST if mode == "nearest" else Image.Resampling.LANCZOS)
    canvas.save(outputs["image"])


def glb_metrics(path):
    from PIL import Image
    import io
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF" or struct.unpack_from("<II", raw, 4) != (2, len(raw)):
        raise ValueError("Invalid GLB header")
    length, kind = struct.unpack_from("<II", raw, 12)
    if kind != 0x4E4F534A or 20 + length > len(raw):
        raise ValueError("Invalid GLB JSON chunk")
    data = json.loads(raw[20:20+length])
    if any("uri" in item for item in data.get("buffers", []) + data.get("images", [])):
        raise ValueError("GLB must embed all buffers and textures")
    triangles, primitives = 0, 0
    for mesh in data.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if primitive.get("mode", 4) != 4:
                raise ValueError("Only triangulated GLB supported")
            accessor = primitive.get("indices", primitive.get("attributes", {}).get("POSITION"))
            triangles += data["accessors"][accessor]["count"] // 3
            primitives += 1
    if not triangles:
        raise ValueError("GLB has no geometry")
    max_texture = 0
    binary_start = 20 + length + 8
    for image in data.get("images", []):
        view = data["bufferViews"][image["bufferView"]]
        start = binary_start + view.get("byteOffset", 0)
        with Image.open(io.BytesIO(raw[start:start+view["byteLength"]])) as texture:
            max_texture = max(max_texture, *texture.size)
    return {"triangles": triangles, "primitives": primitives, "maxTextureSize": max_texture,
            "materials": len(data.get("materials", [])), "animations": len(data.get("animations", []))}


def validate_output(path, budget):
    from PIL import Image
    if not path.is_file() or path.stat().st_size <= 0 or path.stat().st_size > budget["maxBytes"]:
        raise ValueError("Missing, empty or over-budget output: " + path.name)
    metrics = {"bytes": path.stat().st_size, "sha256": digest(path)}
    if path.suffix == ".png":
        with Image.open(path) as image:
            if image.format != "PNG":
                raise ValueError("Expected real PNG")
            image.load()
            if image.width > budget["maxWidth"] or image.height > budget["maxHeight"]:
                raise ValueError("Texture dimensions exceed budget")
            metrics.update(width=image.width, height=image.height)
    elif path.suffix == ".glb":
        metrics.update(glb_metrics(path))
        if metrics["triangles"] > budget["maxTriangles"] or metrics["maxTextureSize"] > budget["maxTextureSize"]:
            raise ValueError("GLB geometry/texture exceeds budget")
    elif path.suffix == ".svg":
        safe_svg(path)
    elif path.suffix == ".json":
        json.loads(path.read_text())
    elif path.suffix == ".blend" and path.read_bytes()[:7] != b"BLENDER":
        # New Blender may compress saves with zstd; authoring contract uses uncompressed.
        raise ValueError("Editable output must be uncompressed BLEND")
    return metrics


def tool_for(adapter):
    return {"pixel": "pillow", "raster": "pillow", "vector": "inkscape", "bake": "blender"}.get(adapter, adapter)


def execute(job, source, inputs, outputs, caps, trusted):
    adapter, params = job["adapter"], job.get("parameters", {})
    tool = caps[tool_for(adapter)]
    if not tool["available"]:
        raise ValueError(f"{job['id']}: blocked: {tool.get('reason')}")
    executable = tool.get("executable")
    if adapter == "pixel":
        pixel(source, outputs)
    elif adapter == "raster":
        raster(source, inputs, outputs, params)
    elif adapter == "vector":
        safe_svg(source)
        shutil.copyfile(source, outputs["vector"])
        args = [executable, source, "--export-type=png", "--export-background-opacity=0", f"--export-filename={outputs['image']}"]
        for key in ("width", "height"):
            if key in params:
                args.append(f"--export-{key}={positive(params[key], 8192, key)}")
        command(args)
    elif adapter == "krita":
        command([executable, source, "--export", "--export-filename", outputs["image"]],
                dict(os.environ, QT_QPA_PLATFORM="offscreen"))
    elif adapter == "pixelorama":
        command([executable, "--headless", "--quit", "--", "--export", "--spritesheet", "--direction", "0",
                 "--output", outputs["image"], source])
    elif adapter == "blender":
        if not trusted:
            raise ValueError("Authored Python needs explicit --allow-authored-python")
        env = dict(os.environ, ART_FORGE_OUTPUTS=json.dumps({k: str(v) for k, v in outputs.items()}),
                   ART_FORGE_PARAMETERS=json.dumps(params), ART_FORGE_SEED=str(job["seed"]),
                   ASSET_FORGE_OUTPUT=str(outputs["model"]), POCKET_WORKS_ROOT=str(ROOT))
        command([executable, "--background", "--factory-startup", "--python-exit-code", "1",
                 "--python", source, "--", "--output", outputs["model"]], env, 600)
    elif adapter == "bake":
        env = dict(os.environ, ART_FORGE_PARAMETERS=json.dumps(params), ART_FORGE_OUTPUTS=json.dumps({"image": str(outputs["image"])}))
        command([executable, "--background", "--disable-autoexec", source, "--python-exit-code", "1",
                 "--python", Path(__file__).with_name("bake.py")], env, 600)


def build(app, data, caps, trusted=False):
    app = app.resolve()
    ordered, runtime, index = plan(app, data)
    for job in ordered:
        if not caps[tool_for(job["adapter"])]["available"]:
            raise ValueError("Blocked tool for " + job["id"])
        if job["adapter"] == "blender" and not trusted:
            raise ValueError("Authored Python needs explicit --allow-authored-python")
    with tempfile.TemporaryDirectory(prefix=".art-forge-", dir=app) as temporary:
        stage = Path(temporary)
        staged, entries = {}, []
        for job in ordered:
            targets = {role: local(app, path) for role, path in job["outputs"].items()}
            outputs = {role: stage / "outputs" / target.relative_to(app) for role, target in targets.items()}
            for output in outputs.values():
                output.parent.mkdir(parents=True, exist_ok=True)
            input_paths = {p: staged.get(local(app, p), local(app, p)) for p in [job["source"], *job.get("inputs", [])]}
            before = {p: digest(path) for p, path in input_paths.items()}
            execute(job, input_paths[job["source"]], input_paths, outputs, caps, trusted)
            if before != {p: digest(path) for p, path in input_paths.items()}:
                raise ValueError("Adapter modified editable sources")
            records = {}
            for role, output in outputs.items():
                location = {"source": targets[role].relative_to(app).as_posix()} if role == "editable" else {"url": targets[role].relative_to(runtime).as_posix()}
                records[role] = {**location, **validate_output(output, job["budget"])}
                staged[targets[role]] = output
            if sum(record["bytes"] for role, record in records.items() if role != "editable") > job["budget"]["maxBytes"]:
                raise ValueError("Combined runtime exports exceed byte budget")
            entries.append({"id": job["id"], "adapter": job["adapter"], "seed": job["seed"],
                            "parameters": job.get("parameters", {}), "inputs": before,
                            "provenance": job["provenance"], "tool": caps[tool_for(job["adapter"])].get("version"),
                            "outputs": records})
        document = {"version": 1, "manifestSha256": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(), "assets": entries}
        staged_index = stage / "index.json"
        json_write(staged_index, document)
        staged[index] = staged_index
        backups, published = {}, []
        try:
            for i, (target, output) in enumerate(staged.items()):
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    backup = stage / f"backup-{i}"
                    shutil.copyfile(target, backup)
                    backups[target] = backup
                os.replace(output, target)
                published.append(target)
        except OSError:
            for target in reversed(published):
                if target in backups:
                    os.replace(backups[target], target)
                else:
                    target.unlink()
            raise
    return list(staged), document


def check(app, data):
    ordered, runtime, index = plan(app, data)
    document = json.loads(index.read_text())
    if document.get("manifestSha256") != hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest():
        raise ValueError("Stale manifest; rebuild assets")
    by_id = {record["id"]: record for record in document["assets"]}
    for job in ordered:
        record = by_id[job["id"]]
        for path, expected in record["inputs"].items():
            if digest(local(app, path, True)) != expected:
                raise ValueError("Stale source: " + path)
        for role, path in job["outputs"].items():
            metrics = validate_output(local(app, path, True), job["budget"])
            if metrics["sha256"] != record["outputs"][role]["sha256"]:
                raise ValueError("Changed export: " + path)
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["capabilities", "plan", "build", "check"])
    parser.add_argument("--app")
    parser.add_argument("--blender")
    parser.add_argument("--krita")
    parser.add_argument("--pixelorama")
    parser.add_argument("--allow-authored-python", action="store_true")
    args = parser.parse_args()
    if args.operation == "capabilities":
        print(json.dumps(capabilities({"blender": args.blender, "krita": args.krita, "pixelorama": args.pixelorama}), indent=2))
        return
    if not args.app or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.app):
        parser.error("--app requires an owning app slug")
    app = (ROOT / "apps" / args.app).resolve()
    if app.parent != (ROOT / "apps").resolve():
        parser.error("App directory escapes apps/")
    data = json.loads((app / "asset-forge/manifest.json").read_text())
    if args.operation == "check":
        print(json.dumps(check(app, data), indent=2))
        return
    caps = capabilities({"blender": args.blender, "krita": args.krita, "pixelorama": args.pixelorama})
    if args.operation == "plan":
        ordered, _, _ = plan(app, data)
        print(json.dumps({"jobs": [{"id": j["id"], "adapter": j["adapter"], "tool": caps[tool_for(j["adapter"])]} for j in ordered]}, indent=2))
    else:
        paths, _ = build(app, data, caps, args.allow_authored_python)
        print("\n".join(str(p.relative_to(ROOT)) for p in paths))


if __name__ == "__main__":
    main()
