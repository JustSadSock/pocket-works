import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from forge import build, capabilities, check, digest, local, plan, safe_svg, raster, validate_output, glb_metrics

FIXTURES = Path(__file__).with_name("fixtures")


def job(identity, adapter, source, outputs, deps=None, inputs=None):
    return {"id": identity, "adapter": adapter, "source": source, "outputs": outputs,
            "dependsOn": deps or [], "inputs": inputs or [], "seed": 19, "parameters": {},
            "budget": {"maxBytes": 4000000, "maxWidth": 1024, "maxHeight": 1024,
                       "maxTriangles": 20000, "maxTextureSize": 1024},
            "provenance": {"author": "Pocket Works", "license": "original", "origin": "Platform capability fixture"}}


def fixture_manifest(app, three_d=False):
    source = app / "asset-forge"
    source.mkdir(parents=True, exist_ok=True)
    for name in ("scout.json", "heron.svg", "harbor.py"):
        shutil.copyfile(FIXTURES / name, source / name)
    jobs = [job("scout", "pixel", "asset-forge/scout.json", {"image": "public/assets/scout.png", "atlas": "public/assets/scout.json"}),
            job("heron", "vector", "asset-forge/heron.svg", {"image": "public/assets/heron.png", "vector": "public/assets/heron.svg"})]
    recipe = {"size": [480, 560], "layers": [{"input": "public/assets/heron.png", "opacity": .85}]}
    (source / "raster.json").write_text(json.dumps(recipe))
    jobs.append(job("wash", "raster", "asset-forge/raster.json", {"image": "public/assets/wash.png"}, ["heron"], ["public/assets/heron.png"]))
    if three_d:
        jobs += [job("harbor", "blender", "asset-forge/harbor.py", {"model": "public/assets/harbor.glb", "editable": "asset-forge/generated/harbor.blend"}),
                 job("baked", "bake", "asset-forge/generated/harbor.blend", {"image": "public/assets/harbor.png"}, ["harbor"])]
        jobs[-1]["parameters"] = {"width": 512, "height": 512, "samples": 8}
    return {"version": 2, "runtimeRoot": "public", "index": "public/assets/forge-index.json", "jobs": jobs}


class ForgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = Path(self.temp.name)
        self.data = fixture_manifest(self.app)
        self.caps = {"pillow": {"available": True, "version": "test"}, "inkscape": {"available": False}}

    def tearDown(self):
        self.temp.cleanup()

    def pixel_only(self):
        data = copy.deepcopy(self.data)
        data["jobs"] = data["jobs"][:1]
        return data

    def test_pixel_exact_palette_layers_frames_and_hash_check(self):
        from PIL import Image
        data = self.pixel_only()
        build(self.app, data, self.caps)
        check(self.app, data)
        with Image.open(self.app / "public/assets/scout.png") as image:
            self.assertEqual(image.size, (32, 24))
            self.assertEqual(image.getpixel((12, 0)), (234, 208, 164, 255))
            self.assertEqual(image.getpixel((0, 0))[3], 0)
        source = self.app / "asset-forge/scout.json"
        before = digest(self.app / "public/assets/scout.png")
        source.write_text(source.read_text().replace("#aa554c", "#2244aa"))
        with self.assertRaisesRegex(ValueError, "Stale source"):
            check(self.app, data)
        build(self.app, data, self.caps)
        self.assertNotEqual(before, digest(self.app / "public/assets/scout.png"))
        check(self.app, data)

    def test_byte_and_dimension_budget_failure_preserves_exports(self):
        data = self.pixel_only()
        build(self.app, data, self.caps)
        before = digest(self.app / data["index"])
        for budget in ({"maxBytes": 1}, {"maxWidth": 1}):
            changed = copy.deepcopy(data)
            changed["jobs"][0]["budget"].update(budget)
            with self.assertRaises(ValueError):
                build(self.app, changed, self.caps)
            self.assertEqual(before, digest(self.app / data["index"]))
        self.assertFalse(list(self.app.glob(".art-forge-*")))

    def test_publication_failure_rolls_back_existing_files(self):
        data = self.pixel_only()
        build(self.app, data, self.caps)
        target = self.app / "public/assets/scout.png"
        before = digest(target)
        source = self.app / "asset-forge/scout.json"
        source.write_text(source.read_text().replace("#aa554c", "#2244aa"))
        import os
        real = os.replace
        count = 0
        def fail_second(a, b):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("Publication failure fixture")
            return real(a, b)
        with patch("forge.os.replace", fail_second):
            with self.assertRaises(OSError):
                build(self.app, data, self.caps)
        self.assertEqual(before, digest(target))

    def test_graph_orders_dependencies_not_manifest_order(self):
        data = copy.deepcopy(self.data)
        data["jobs"].reverse()
        self.assertEqual([j["id"] for j in plan(self.app, data)[0]], ["heron", "wash", "scout"])

    def test_invalid_graph_paths_and_arbitrary_commands(self):
        mutations = [lambda d: d["jobs"][0].update(command="curl evil"),
                     lambda d: d["jobs"][0].update(source="../outside.json"),
                     lambda d: d["jobs"][0]["outputs"].update(image="/tmp/escape.png"),
                     lambda d: d["jobs"][0].update(dependsOn=["missing"]),
                     lambda d: d["jobs"][0].update(dependsOn=["scout"]),
                     lambda d: d["jobs"][2].update(dependsOn=[]),
                     lambda d: d["jobs"][0]["outputs"].update(atlas="asset-forge/scout.json"),
                     lambda d: d["jobs"][0].update(seed=True)]
        for mutation in mutations:
            data = copy.deepcopy(self.data)
            mutation(data)
            with self.assertRaises(ValueError):
                plan(self.app, data)

    def test_symlink_escape(self):
        with tempfile.TemporaryDirectory() as outside:
            (self.app / "escape").symlink_to(outside)
            with self.assertRaises(ValueError):
                local(self.app, "escape/x.png")

    def test_no_silent_tool_fallback(self):
        with self.assertRaisesRegex(ValueError, "Blocked tool"):
            build(self.app, self.data, self.caps)
        self.assertFalse((self.app / "public").exists())

    def test_svg_external_and_active_content_rejected(self):
        for content in ['<script/>', '<image href="file:///etc/passwd"/>', '<path onload="evil()"/>', '<style>@import "evil";</style>', '<path fill="url(https://evil)"/>']:
            path = self.app / "bad.svg"
            path.write_text('<svg xmlns="http://www.w3.org/2000/svg">' + content + '</svg>')
            with self.assertRaises(ValueError):
                safe_svg(path)
        safe_svg(FIXTURES / "heron.svg")

    def test_python_trust_flag_is_required_before_any_build(self):
        data = fixture_manifest(self.app, True)
        caps = {"pillow": {"available": True}, "inkscape": {"available": True}, "blender": {"available": True}}
        with self.assertRaisesRegex(ValueError, "allow-authored-python"):
            build(self.app, data, caps)
        self.assertFalse((self.app / "public").exists())

    def test_index_tampering_cannot_hide_sources_or_redirect_runtime(self):
        data = self.pixel_only()
        _, document = build(self.app, data, self.caps)
        for mutation in [lambda d: d["assets"][0].update(inputs={}),
                         lambda d: d["assets"][0]["outputs"]["image"].update(url="https://evil"),
                         lambda d: d["assets"].append(d["assets"][0]),
                         lambda d: d["assets"][0].update(seed=99)]:
            changed = copy.deepcopy(document)
            mutation(changed)
            (self.app / data["index"]).write_text(json.dumps(changed))
            with self.assertRaises(ValueError):
                check(self.app, data)

    def test_raster_layers_masks_crop_and_exact_nearest_resize(self):
        from PIL import Image
        red, mask = self.app / "red.png", self.app / "mask.png"
        Image.new("RGBA", (4, 4), (255, 0, 0, 255)).save(red)
        Image.new("L", (4, 4), 128).save(mask)
        recipe = self.app / "recipe.json"
        recipe.write_text(json.dumps({"size": [8, 8], "layers": [{"input": "red.png", "mask": "mask.png", "opacity": .5, "offset": [2, 2]}]}))
        output = self.app / "composite.png"
        raster(recipe, {"red.png": red, "mask.png": mask}, {"image": output}, {"crop": [2, 2, 6, 6], "size": [8, 8], "resample": "nearest"})
        with Image.open(output) as image:
            self.assertEqual(image.size, (8, 8))
            self.assertEqual(image.getpixel((3, 3)), (255, 0, 0, 64))
        with self.assertRaisesRegex(ValueError, "declared inputs"):
            raster(recipe, {"red.png": red}, {"image": output}, {})

    def test_glb_geometry_and_texture_budget_not_just_file_extension(self):
        import struct
        data = {"asset": {"version": "2.0"}, "accessors": [{"count": 300}], "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}]}
        def write_glb(document):
            raw = json.dumps(document).encode()
            raw += b" " * (-len(raw) % 4)
            blob = b"glTF" + struct.pack("<II", 2, 20 + len(raw)) + struct.pack("<II", len(raw), 0x4E4F534A) + raw
            path = self.app / "geometry.glb"
            path.write_bytes(blob)
            return path
        path = write_glb(data)
        self.assertEqual(glb_metrics(path)["triangles"], 100)
        with self.assertRaisesRegex(ValueError, "exceeds budget"):
            validate_output(path, {"maxBytes": 10000, "maxTriangles": 99, "maxTextureSize": 512})
        data["buffers"] = [{"uri": "https://evil"}]
        with self.assertRaisesRegex(ValueError, "embed"):
            glb_metrics(write_glb(data))

    def test_unknown_palette_and_invalid_layer_sizes_fail_without_publication(self):
        data = self.pixel_only()
        source = self.app / data["jobs"][0]["source"]
        original = source.read_text()
        for malformed in [original.replace('"................"', '"?..............."', 1),
                          original.replace('"................"', '"..."', 1)]:
            source.write_text(malformed)
            with self.assertRaises(ValueError):
                build(self.app, data, self.caps)
            self.assertFalse((self.app / "public").exists())

    def test_capability_probe_failures_are_explicit_not_process_success_assumptions(self):
        with patch("forge.shutil.which", return_value="/fake/editor"), patch("forge.command", side_effect=RuntimeError("Missing shared library")):
            observed = capabilities()
        for name in ("blender", "krita", "pixelorama", "inkscape"):
            self.assertFalse(observed[name]["available"])
            self.assertIn("Missing shared library", observed[name]["reason"])

    def test_atlas_resolves_image_in_another_runtime_directory(self):
        data = self.pixel_only()
        data["jobs"][0]["outputs"]["image"] = "public/sprites/scout.png"
        build(self.app, data, self.caps)
        atlas = json.loads((self.app / "public/assets/scout.json").read_text())
        self.assertEqual(atlas["image"], "../sprites/scout.png")
        check(self.app, data)

    def test_case_and_url_delimiters_cannot_bypass_format_or_loading_validation(self):
        for output in ["public/scout.PNG", "public/a#b.png", "public/a?b.png"]:
            data = self.pixel_only()
            data["jobs"][0]["outputs"]["image"] = output
            with self.assertRaises(ValueError):
                plan(self.app, data)


if __name__ == "__main__":
    unittest.main()
