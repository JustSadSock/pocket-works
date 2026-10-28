# Pocket Forge 3D (v1.0.0)

PocketWorks offline-first parametric print studio. Every STL exported by the browser has millimetre dimensions, closed triangulated surfaces, and inward bore/wall faces. The application supports:

- **Gear pair** (17–90 teeth, 20° involute, root simplified): gear A and gear B as separately downloadable binary STL.
- **Tray** (five sides, open top, adjustable wall/floor): watertight STL.
- **Spacer** (annular cylinder): watertight STL.
- **Kinematic gear bench:** drag either gear to turn the other, start/pause, reverse, vary RPM, zero rotation. Angular speed is determined by tooth count and direction; no collision solver, torque calculation, stress analysis or FEA.
- **3D orbit:** projected triangulated CAD meshes, finger/mouse drag to orbit, zoom controls and scroll zoom.
- **Geometry report:** triangle count, signed mesh volume and watertight edge incidence.
- **Persistence:** current project in namespaced localStorage, JSON import/export compatible with platform CAD runner. Offline Service Worker and PocketWorks integration.

## CAD runner

The platform-owned `.github/workflows/print-forge.yml` reads files under `apps/print-forge/print-jobs/*.json` and runs `tools/print-forge/build.py` on GitHub Actions with CadQuery + Trimesh. Outputs (STL, STEP, report) are committed to the feature branch in `apps/print-forge/print-exports/<job>/`. Current starter jobs exercise gears, tray and spacer. Manual run on a feature branch is supported.

The browser's standalone STL and the GitHub CAD engine are intentionally separate paths. Exporting JSON does not automatically start GitHub Actions; upload/commit the job file to trigger the CI runner. The web app remains fully usable without GitHub or connectivity.

## Engineering limitations

Involute sides above the base circle are modelled parametrically, but the root is simplified and tooth clearance/backlash is not automatically compensated. The kinematic bench is a **constraint demonstration**, not a physical contact, load, bearing, friction or fatigue simulation. Mesh watertightness does not guarantee a successful print. Use a slicer and verify fit/tolerances for your actual printer.

## Tests

Run `node --test apps/print-forge/geometry.test.mjs` from the repository root.
