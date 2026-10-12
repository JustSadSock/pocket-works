# Universal Art Forge — v2 contract

This is a production interface, not an art generator or collection of styles.
Agents choose a medium from the Art Bible, author editable app-local sources,
inspect tool capabilities, build exports, load them in the game and review actual
frames. No editor installation or subscription is required on the user's device.

## Commands

```
python3 tools/art-forge/forge.py capabilities
python3 tools/art-forge/forge.py plan --app my-game
python3 tools/art-forge/forge.py build --app my-game
python3 tools/art-forge/forge.py build --app my-game --allow-authored-python
```

Production manifests remain `apps/<slug>/asset-forge/manifest.json`. Version 1
Blender manifests remain supported unchanged by the original runner. Version 2:

```json
{
  "version": 2,
  "runtimeRoot": "public",
  "index": "public/assets/forge-index.json",
  "jobs": [{
    "id": "scout",
    "adapter": "pixel",
    "source": "asset-forge/scout.json",
    "dependsOn": [],
    "seed": 17,
    "parameters": {},
    "outputs": {"image": "public/assets/scout.png", "atlas": "public/assets/scout.json"},
    "budget": {"maxBytes": 100000, "maxWidth": 512, "maxHeight": 512},
    "provenance": {"author": "Pocket Works project agent", "license": "original", "origin": "Authored for this project"}
  }]
}
```

`source` and optional `inputs` are app-relative. Outputs, index and sources must
be distinct, contained paths (including symlinks). Editable BLEND outputs live in
`asset-forge/generated/`, are recorded as source paths and are not published or
precached. Dependencies are a DAG; a job
must explicitly depend on the producer of each input. Jobs cannot supply commands,
executables, extra CLI flags or environment variables. Runtime exports must be
under `runtimeRoot`; `runtimeRoot: "."` supports Quick/Godot apps. The generated index
contains runtime-relative URLs, hashes, dimensions/geometry budgets, source
hashes, seed, parameters, provenance and actual tool version. It is an offline
precache input, not an automatic change to somebody else's worker or renderer.

All outputs build in a private staging directory. Validation failure leaves the
previous exports and index untouched. Publication rolls back on an IO failure.
Editor builds have timeouts. Source files are never overwritten. A changed source
must be rebuilt; check mode checks source hashes and exported hashes. Determinism
means identical inputs/settings/tool versions, not identical bytes across arbitrary
editor versions. `.blend` files may carry editor timestamps; compare exported
geometry/render properties in addition to hashes.

## Adapters and limitations

| Adapter | Editable source | Operations |
| --- | --- | --- |
| `pixel` | Layered JSON, palette and per-frame pixel rows | Composite layers, exact palette, horizontal atlas, tags/pivots/durations |
| `raster` | Layer recipe JSON + PNG layers | Alpha composition, opacity, masks, crop, resize; no invented painting |
| `vector` | SVG | Preserve SVG; Inkscape PNG export, transparent background |
| `krita` | KRA | Krita CLI flattened PNG export; animation sequences deferred to Stage III |
| `pixelorama` | PXO | Headless CLI horizontal spritesheet PNG; native tags remain in PXO |
| `blender` | Authored Python + declared inputs | Save editable BLEND + GLB using explicit output contract |
| `bake` | BLEND (including a dependency output) | Fixed background rendering, orthographic camera preserved, transparent PNG |

`capabilities` probes installed tools and their relevant help flags. An absent
editor is a **blocked job**, never a silently selected alternative. Pixel and
raster need Pillow. Vector PNG needs Inkscape. Krita/Pixelorama/Blender availability
is separate from artistic fitness. New adapters are platform changes; add format,
parameter, containment and real-tool round-trip tests before listing support.

Krita 5.2 forces the XCB platform even for CLI export. The adapter uses a private
`xvfb-run -a` display when no display is configured; CI installs Xvfb and xauth.
An installation without a usable native/virtual display is reported unavailable.
No user desktop session or account login is involved.

Every generated GLB is re-imported by a fresh Blender process before publication.
`validation: {"requireArmature": true, "requireAnimation": true}` adds the existing
Asset Forge skeletal/animation requirements. File size, triangles and embedded
texture dimensions are also checked; successful generation alone is insufficient.

Blender Python is executable repository code, not an untrusted data format.
Running it requires `--allow-authored-python`; this flag is a trust acknowledgement,
**not a sandbox**. Only trusted same-repository authors should use it. Do not run
untrusted source with credentials, network access or write tokens. Blender receives
`ART_FORGE_OUTPUTS` (JSON mapping role→staged absolute path), `ART_FORGE_PARAMETERS`,
`ART_FORGE_SEED` and `ASSET_FORGE_OUTPUT` (GLB path for compatible scripts).
Use `ART_FORGE_INPUTS` (declared app-relative path→current staged absolute path)
for textures/models produced by earlier jobs; do not read last build's public
files. Declare every helper script and imported texture in `inputs` so freshness
covers the complete authoring graph. Pack textures into the BLEND source for
portable baking, and embed them in GLB for offline use. Use
`--python-exit-code 1` so failures cannot masquerade as successful generation.
Baking uses `--disable-autoexec` and the platform's own fixed export script.

Professional authoring remains in the editors: brushes, UV work, topology, rigs,
materials, lighting and silhouette choices are not replaced by this API. This
version does not claim full unattended brush painting, arbitrary photorealism,
animation orchestration or automatic aesthetic scoring.

## Integration and acceptance

Enhanced apps load URLs from the index after Vite copies `public/`; Quick apps
serve the committed **runtime exports**, not editable inputs. Pocket Works
`prepare-site` explicitly excludes every `asset-forge/` source directory from
published files. Therefore never fetch or service-worker-precache an editable
`asset-forge/sprites.json`, `asset-forge/*.svg`, `.blend` or other source URL from
a shipped app. Runtime paths must point to the manifest's exported URLs such as
`assets/creatures.png` and `assets/forge-index.json`. Test these paths in
`dist-site` and test an offline boot before release. Godot imports the same committed GLB/PNG. Cache the index and
every indexed URL in the app's own worker. The Forge does not rewrite workers or
register demo apps. Existing v1 builds and production hosting stay unchanged.

Platform fixtures under `tools/art-forge/fixtures/` are capability tests, not
future app skins. Build them into temporary app-owned test directories; verify
source edits change exports, invalid jobs preserve prior exports, then inspect
pixel, authored illustration, GLB and 2.5D loading on Chromium and WebKit offline.
Separate demonstration-game PRs may exercise the six roadmap briefs later.
