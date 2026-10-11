"""All v2 applications must commit current generated exports and their index."""
import json
from forge import ROOT, check

count = 0
for manifest in sorted((ROOT / "apps").glob("*/asset-forge/manifest.json")):
    data = json.loads(manifest.read_text())
    if data.get("version") == 2:
        check(manifest.parents[1], data)
        count += 1
print(f"Art Forge: {count} v2 app source/export contracts verified; v1 unchanged")
