# PocketWorks Asset Registry

`assets/catalog.json` indexes vetted assets by meaning, source, palette, style and intended use. It stores **metadata only**, not binary packs. The first provider adapter uses Poly Haven's public API for models, textures and HDRIs. The CLI displays Poly Haven provenance in its local lock; game authors should retain that credit in asset notes. Poly Haven's assets are CC0, while the live API asks clients to identify themselves and credit Poly Haven.

## Use

```sh
npm run pw:asset -- list
npm run pw:asset -- find wood
npm run pw:asset -- add material_warm_wood_01 --app my-game --dry-run
npm run pw:asset -- add material_warm_wood_01 --app my-game
npm run pw:asset -- verify material_warm_wood_01 --app my-game
```

`add` resolves the selected 1k or 2k file and its dependencies through Poly Haven's file manifest. It verifies upstream size and MD5 during download, caches the file under ignored `.cache/pw-assets/`, copies it into the app directory and writes `asset.lock.json` with SHA-256 values. `--offline` uses cached manifests and files only. `verify` checks the installed files against the lock without network access.

Enhanced games receive files in `apps/<slug>/public/assets/registry/<id>/`; Quick and Godot games use `apps/<slug>/assets/registry/<id>/`. Commit **only the specific assets a game actually uses** to its app PR. The app bundles/caches them for offline play; runtime code never requests the provider API. Do not add assets to a shared Service Worker cache or to a platform PR.

The `rock_coast_01` entry is high-poly source art and must be simplified and measured on a phone before use. The catalog does not claim it is game-ready. `dimensions.unit: unknown` intentionally avoids inventing a Blender scale for source models.

## Provider growth

Kenney, ambientCG and Quaternius are candidates for new adapters, after pinning a stable official download URL, recording their per-pack terms and validating archive extraction. Do not put an arbitrary ZIP URL in the catalog and silently trust archive paths. Mixamo needs an account, so it cannot be a headless anonymous CLI source.
