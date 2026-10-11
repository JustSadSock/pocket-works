"""Fixed render script; reuses the existing packed-data/CPU bake validation."""
import json
import os
from pathlib import Path
import runpy

params = json.loads(os.environ["ART_FORGE_PARAMETERS"])
for frame in json.loads(os.environ["ANIMATION_FRAMES"]):
    os.environ["ART_FORGE_PARAMETERS"] = json.dumps({**params, "frame": frame})
    os.environ["ART_FORGE_OUTPUTS"] = json.dumps({"image": str(Path(os.environ["ANIMATION_DIRECTORY"]) / f"{frame:06d}.png")})
    runpy.run_path(str(Path(__file__).with_name("bake.py")))
