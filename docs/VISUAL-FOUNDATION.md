# Visual foundation

The first platform increment offers a small Babylon visual kit (`shared/visual-kit/`) and an app-local art direction manifest. It does not change existing applications. Apps opt in while retaining their independent bundles and offline caches.

## App contract

Create `apps/<slug>/visual.pw.json` **before building a new visual direction**. Start with `docs/examples/visual.pw.json`, change every field to describe the actual game, and run `npm run validate:visual`. The validator checks optional manifests present in existing apps; adding a file opts an app into the contract. `direction` explains the scene's premise, `shapeLanguage` its silhouettes, `palette` the allowed colors, `roughness` a PBR range, and `avoid` rejects recurring unwanted treatments. A prose value is a production constraint for the author and reviewer, not an automatically enforced pixel-level rule.

Use the manifest during asset creation, lighting decisions and screenshot review. Record art direction in the app directory so another agent can continue it without inheriting the last game's visual style.

## Current kit

`createVisualKit(BABYLON)` exposes `createForestLighting(scene, mood, options)`, `createSurface(scene, name, options)` and `flashHit(mesh, options)`. Add `@pocketworks/visual-kit` to an app workspace dependency and import it into an app-owned bundle and dispose handles during level teardown. This deliberately small API can be evaluated in two real games before adding more shared effects.

## Next increments

1. Semantic asset catalog with provenance, license, hash and verified download/cache CLI. Store fetched binaries app-locally or in a build cache; a live game must never depend on the upstream host.
2. Motion orchestration and environment composition after representative character and scene use cases exist.
3. Extend Asset Forge for recipes and add an optional compiler step with visual checks of the generated GLB.
4. Extend the existing Playwright gates to capture fixed mobile states and a contact sheet with inspectable artifacts.

Each increment gets its own platform change, and game PRs consume only capabilities that have landed on `main`.
