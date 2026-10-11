import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from forge import build, capabilities, check, digest, local, plan, safe_svg

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


if __name__ == "__main__":
    unittest.main()
