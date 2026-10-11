"""Real native KRA/PXO loading and source edits, not mocked export commands.

PXO fixture schema follows Pixelorama v1.2.3 Project.deserialize/OpenSave:
https://github.com/Orama-Interactive/Pixelorama/tree/v1.2.3/src/Classes
ORA is imported then saved as an actual layered KRA by Krita itself.
"""
import argparse
import io
import json
import os
from pathlib import Path
import tempfile
import zipfile
from PIL import Image

from forge import build, capabilities, command, check, digest, krita_args
from test_forge import job


def make_pxo(path, color):
    layer = {"name": "Authored color layer", "type": 0, "visible": True, "opacity": 1.0, "blend_mode": 0, "parent": -1}
    data = {"pixelorama_version": "v1.2.3-stable", "pxo_version": 7, "size_x": 16, "size_y": 16,
            "color_mode": 5, "layers": [layer], "frames": [{"cels": [{"opacity": 1.0}], "duration": 1.0}],
            "fps": 8, "current_frame": 0, "current_layer": 0, "tags": []}
    image = Image.new("RGBA", (16, 16), color)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("mimetype", "application/x-pixelorama")
        archive.writestr("data.json", json.dumps(data))
        archive.writestr("image_data/frames/1/layer_1", image.tobytes())


def make_kra(path, color, krita):
    ora = path.with_suffix(".ora")
    with zipfile.ZipFile(ora, "w") as archive:
        archive.writestr("mimetype", "image/openraster")
        archive.writestr("stack.xml", '<image w="32" h="32" name="Layered study"><stack><layer name="Stroke" src="data/stroke.png" x="0" y="0" opacity="1" visibility="visible" composite-op="svg:src-over"/><layer name="Paper" src="data/paper.png" x="0" y="0" opacity="1" visibility="visible" composite-op="svg:src-over"/></stack></image>')
        for name, fill in [("stroke", color), ("paper", (240, 230, 210, 255))]:
            image = Image.new("RGBA", (32, 32), (0, 0, 0, 0) if name == "stroke" else fill)
            if name == "stroke":
                from PIL import ImageDraw
                ImageDraw.Draw(image).line([(6, 26), (17, 7), (26, 23)], fill=fill, width=4)
            stream = io.BytesIO()
            image.save(stream, format="PNG")
            archive.writestr("data/" + name + ".png", stream.getvalue())
    # This is actual native save, not a ZIP pretending to be KRA.
    command([*krita_args(krita), ora, "--export", "--export-filename", path], dict(os.environ, QT_QPA_PLATFORM="offscreen"))
    with zipfile.ZipFile(path) as archive:
        assert "maindoc.xml" in archive.namelist()
        assert archive.read("maindoc.xml").count(b'nodetype="paintlayer"') == 2


parser = argparse.ArgumentParser()
parser.add_argument("--pixelorama")
parser.add_argument("--krita")
args = parser.parse_args()
if not args.pixelorama and not args.krita:
    parser.error("Select at least one actual native editor")
caps = capabilities({"pixelorama": args.pixelorama, "krita": args.krita})
for adapter, executable, suffix in [("pixelorama", args.pixelorama, ".pxo"), ("krita", args.krita, ".kra")]:
    if not executable:
        continue
    assert caps[adapter]["available"], caps[adapter]
    with tempfile.TemporaryDirectory(prefix="pw-native-editor-") as temporary:
        app = Path(temporary)
        (app / "asset-forge").mkdir()
        source = app / ("asset-forge/study" + suffix)
        make = (lambda color: make_pxo(source, color)) if adapter == "pixelorama" else (lambda color: make_kra(source, color, executable))
        make((40, 90, 110, 255))
        data = {"version": 2, "runtimeRoot": "public", "index": "public/assets/index.json", "jobs": [job("native", adapter, "asset-forge/study" + suffix, {"image": "public/assets/study.png"})]}
        build(app, data, caps)
        check(app, data)
        first = digest(app / "public/assets/study.png")
        with Image.open(app / "public/assets/study.png") as image:
            assert image.size == ((16, 16) if adapter == "pixelorama" else (32, 32)), image.size
            if adapter == "pixelorama":
                assert image.convert("RGBA").getpixel((8, 8)) == (40, 90, 110, 255), image.convert("RGBA").getpixel((8, 8))
        make((180, 70, 35, 255))
        build(app, data, caps)
        check(app, data)
        assert digest(app / "public/assets/study.png") != first
        print(adapter, "native source edit/export verified:", caps[adapter]["version"])
