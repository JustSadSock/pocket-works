# Pocket Works Asset Forge

Asset Forge is the zero-subscription production path for app-local 3D assets in Pocket Works. ChatGPT or another repository agent authors deterministic Blender Python inside an app branch; GitHub Actions runs pinned Blender LTS on a standard hosted runner, validates the exported asset and commits the generated output back to that same feature branch.

The first supported production target is Blender-generated `.glb` / `.blend`. Runtime procedural animation and audio remain app code; they do not require external paid AI services.

## Why this exists

Visually important 3D objects should not default to runtime Babylon primitives merely because the repository agent cannot open a desktop DCC. Asset Forge gives agents a real Blender execution environment without requiring Blender on the user's phone or computer.

Typical uses:

- environment props, buildings, weapons, vehicles and stylized creatures;
- bevels, modifiers, curves, booleans, procedural geometry and materials;
- armatures, skinning, named animation actions and baked secondary motion;
- collision proxy meshes and authored LOD meshes;
- deterministic GLB export for Babylon.js applications.

Asset Forge is not a promise that arbitrary AAA organic characters can be produced automatically. Blender executes the authored scene logic; model quality still depends on the modeling/rigging logic and available source assets.

## Pinned Blender

CI uses Blender `5.2.1 LTS` from the official Blender download archive and verifies the archive against Blender's published SHA-256 list before execution.

## App-local contract

An app that wants generated Blender assets owns everything under its own directory:

```text
apps/<slug>/
├── asset-forge/
│   ├── manifest.json
│   ├── model.py
│   └── ...
└── public/
    └── models/
        └── generated-model.glb
```

This preserves the repository rule that an application PR changes only `apps/<slug>/**`.

### Manifest v1

```json
{
  "version": 1,
  "jobs": [
    {
      "name": "crab",
      "script": "crab.py",
      "output": "public/models/crab.glb",
      "requireArmature": true,
      "requireAnimation": true
    }
  ]
}
```

Rules:

- `script` is relative to `apps/<slug>/asset-forge/` and must remain inside that directory;
- `output` is relative to the app directory and may not escape it;
- v1 supports `.glb` and `.blend` outputs;
- Blender receives both `--output <absolute-path>` after `--` and the `ASSET_FORGE_OUTPUT` environment variable;
- `POCKET_WORKS_ROOT` points to the repository root;
- `requireArmature` and `requireAnimation` add re-import validation for animated GLB assets.

A Blender script should parse its app arguments after Blender's `--` delimiter and write the declared output deterministically.

## Automatic branch flow

After this platform workflow is on `main`, a normal app workflow is:

1. Create/update `apps/<slug>/asset-forge/**` on a non-`main` branch.
2. Push the branch.
3. `Blender Asset Forge` starts automatically because an app-local forge source changed.
4. The action downloads pinned Blender, executes only affected app manifests, and re-imports generated GLBs for structural validation.
5. If outputs changed, `github-actions[bot]` commits them back to the same feature branch with `Generate Blender assets`.
6. The generated-output commit does not modify `asset-forge/**`, so it does not create an infinite workflow loop.
7. The app then consumes the generated GLB normally through its own Vite/Babylon/PWA build.

This makes a single repository-agent request capable of authoring code and asset-generation source in one branch; the external CI run performs the heavier Blender execution.

## Manual smoke test

After the workflow is present on the default branch:

1. Open the repository on GitHub.
2. Select **Actions**.
3. Select **Blender Asset Forge**.
4. Select **Run workflow**.
5. Leave `app` empty and run it on `main`.

The smoke job creates a skinned mesh with an armature and animation, exports it to GLB, starts a fresh Blender process, imports the GLB back, and requires mesh geometry + armature + animation to survive the round trip. The resulting `forge-smoke.glb` is retained as a short-lived Actions artifact.

To manually rebuild a particular app, select a non-main feature branch and provide that app's slug in `app`.

## Required GitHub workflow permission for automatic commits

The automatic generation job requests only `contents: write` so it can commit generated binary assets back to the feature branch. GitHub personal repositories commonly default `GITHUB_TOKEN` to read-only.

If the generation job fails at `git push` with a permissions error, enable repository workflow write access:

**Repository → Settings → Actions → General → Workflow permissions → Read and write permissions → Save**

Do not enable `Allow GitHub Actions to create and approve pull requests`; Asset Forge does not need it.

Fork pull requests do not receive write tokens and therefore cannot use the auto-commit path. The intended workflow is same-repository app branches created by the owner/connected agent.

## Animation doctrine

For animated 3D assets:

- author a real armature when the object benefits from skeletal motion;
- export readable named actions such as `Idle`, `Walk`, `Run`, `Attack`, `Hit`, `Death` rather than one anonymous timeline;
- use Blender clips for authored motion and Babylon runtime logic for state blending, IK, foot placement, aim/look targets, springs, inertia and contact response;
- avoid baking every physical response into clips when the response should react continuously to gameplay.

## Audio doctrine

Pocket Works already has Web Audio support and Tone.js in the enhanced toolchain. Do not add a paid audio generator merely to avoid repeated samples.

Prefer, in order:

1. procedural Web Audio/Tone layers for continuous or physically simple sounds;
2. randomized pitch/gain/filter/start offset and multiple layers so repeated events do not sound identical;
3. small app-local variation banks when a recorded/transient sound is more convincing than synthesis;
4. external generation only when the requested sound cannot be produced convincingly with the first three approaches.

Footsteps, impacts, sword whooshes, wind, engines, snow/sand crunch and UI feedback should normally have controlled variation instead of replaying one identical clip.

## Security and isolation

- production generation is limited to non-main branches;
- generated outputs must remain inside the owning app;
- workflow jobs do not receive application secrets;
- app PRs must not modify the shared Asset Forge workflow or tools;
- changes to Asset Forge itself are platform work and use the `platform-change` label.
