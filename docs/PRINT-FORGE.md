# Print Forge CAD / printer models

This is a deterministic CAD production extension to Blender Asset Forge. No text-to-3D services or generative models are used.

## Jobs

An app owns input specs under `apps/<slug>/print-jobs/*.json` and generated artifacts under `apps/<slug>/print-exports/<job-name>/`.

Supported job types:

- `gear_pair`: `teeth_a`, `teeth_b` (integers 17–100), `module_mm`, `thickness_mm`, `bore_mm`.
- `tray`: `width_mm`, `depth_mm`, `height_mm`, `wall_mm`.
- `bracket`: `width_mm`, `length_mm`, `height_mm`, `thickness_mm`, `hole_mm`.
- `spacer`: `outer_diameter_mm`, `bore_mm`, `height_mm`.

Use millimetres. `model.step` contains editable CAD solids, individual `.stl` files contain 3D printable surfaces, and `report.json` contains watertight checks, volumes and dimensions.

GitHub Actions runs `tools/print-forge/build.py` using pinned CadQuery and Trimesh and checks generated STL meshes. It builds sample gear/tray/bracket geometry for platform PRs. Feature-branch changes inside `print-jobs` trigger the generator; the workflow commits outputs back to that feature branch, never main.

Manual rebuild: **Actions → Print Forge CAD → Run workflow**, choose the feature branch and enter the app slug.

## Mechanics

The Pocket Forge 3D app includes a browser-based **kinematic gear simulator**. Angles are constrained by the exact gear ratio `-teeth_a / teeth_b`; there is no physical contact solver, friction or finite-element analysis. Gear meshes use simplified root geometry, no fillets or undercut for teeth <17, and are *not* certification of manufacturability. Print validation requires actual material/printer settings and a slicer test.

## Isolation and security

All workflow inputs are untrusted. JSON numeric fields are bounded, output directories are derived from safe branch-controlled app and job slugs, and the process executes only the platform-owned CAD implementation (never arbitrary Python provided in a job JSON). No secrets enter model-building processes. Exported files are GitHub Actions artifacts (14 days) and are also committed to the owning app feature branch.

## CI limitations

CadQuery geometry and watertight mesh checks do not replace a slicer, dimension inspection or mechanical strength testing. Avoid claiming accurate strength, torque, service life or load ratings from kinematic motion.
