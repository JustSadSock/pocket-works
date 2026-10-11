"""Real editor round trips in temporary app ownership; never registers a game."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile

from forge import build, capabilities, check, digest
from test_forge import fixture_manifest

parser = argparse.ArgumentParser()
parser.add_argument("--blender", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
destination = Path(args.output).resolve()
if destination.exists():
    raise ValueError("Use a fresh evidence output directory")
caps = capabilities({"blender": args.blender})
print(json.dumps(caps, indent=2))
with tempfile.TemporaryDirectory(prefix="pw-art-smoke-") as temporary:
    app = Path(temporary) / "app"
    app.mkdir()
    manifest = fixture_manifest(app, True)
    outputs, first = build(app, manifest, caps, trusted=True)
    check(app, manifest)
    originals = {entry["id"]: entry["outputs"] for entry in first["assets"]}
    # Actual editable-source revisions, not replacing already exported resources.
    changes = {"scout.json": ("#aa554c", "#2244aa"), "heron.svg": ("#718781", "#a56852"),
               "harbor.py": (".34, .12, .08", ".12, .28, .34")}
    for name, (before, after) in changes.items():
        source = app / "asset-forge" / name
        text = source.read_text()
        assert before in text
        source.write_text(text.replace(before, after))
    try:
        check(app, manifest)
    except ValueError:
        pass
    else:
        raise AssertionError("Source edit was not detected")
    destination.mkdir(parents=True)
    shutil.copytree(app / "public", destination / "before")
    _, second = build(app, manifest, caps, trusted=True)
    check(app, manifest)
    for entry in second["assets"]:
        role = "model" if entry["id"] == "harbor" else "image"
        assert entry["outputs"][role]["sha256"] != originals[entry["id"]][role]["sha256"], entry["id"]
    # Re-import the produced model through an independent Blender process.
    from forge import command
    verify = Path(__file__).resolve().parents[1] / "asset-forge/verify_glb.py"
    command([args.blender, "--background", "--factory-startup", "--python-exit-code", "1",
             "--python", verify, "--", "--input", app / "public/assets/harbor.glb"], timeout=180)
    shutil.copytree(app / "public", destination / "after")
    shutil.copytree(app / "asset-forge", destination / "source")
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2))
print("Verified editable-source revision, export, re-import and stale detection:", destination)
