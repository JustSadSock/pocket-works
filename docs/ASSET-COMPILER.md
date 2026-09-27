# App-local GLB compiler

An Enhanced app can opt into automatic compilation before its Vite build by creating `apps/<slug>/asset-compiler.json`:

```json
{
  "version": 1,
  "jobs": [
    {
      "source": "assets/source/hero.glb",
      "output": "public/models/hero.glb",
      "profile": "animated",
      "textureSize": 1024
    }
  ]
}
```

`npm run assets:compile -- --app <slug>` runs glTF Transform 4.5.0, optimizes for mobile with WebP textures up to 1024px and Meshopt geometry, validates the resulting GLB with Khronos glTF Validator, then writes `asset-compiler.lock.json` with input/output SHA-256 and sizes. `build:enhanced` invokes it automatically for apps with a manifest. Keep the source and generated output app-local and commit the output to the game branch when offline install needs it.

The `animated` profile avoids mesh simplification and scene flattening so named gameplay nodes and armatures remain addressable. The `static` profile allows conservative geometry simplification. Both profiles avoid joining/pruning nodes; aggressive merging can silently break attachments, material overrides or collision proxies. Inspect the result and test named animations in Babylon before shipping. WebP compression helps network size but does not guarantee lower texture memory; runtime profiling is still required. KTX2 remains a later, opt-in profile after a verified mobile decoder path and texture memory comparison.

Blender Asset Forge remains the source production path. This compiler processes its generated GLB; it does not change the existing Blender workflow or pretend to retarget characters automatically.
