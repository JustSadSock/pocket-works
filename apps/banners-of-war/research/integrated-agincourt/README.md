# Integrated Agincourt — protected local preview

Use the actual branch checkout; do not publish the research page or assets.
Download original candidate artifact [15244108584](https://github.com/JustSadSock/pocket-works/actions/runs/46097554811/artifacts/15244108584), extract, set BOW_ART_OUTPUT to the directory containing mixed-atlas.json. From repository root run:

```sh
BOW_ART_OUTPUT=/absolute/path/to/candidate node apps/banners-of-war/research/integrated-agincourt/server.mjs
```

Open the printed localhost URL. Existing Chronicles of War -> Agincourt -> side -> launch. The Диорама/Схема button switches representation, not state. All commands, playback, reporting and saves are native. Diagnostic layers, alternate palette, unsupported types and failed assets use the native schematic representation. Do not use a production save origin. The server binds only 127.0.0.1 and removes service worker registration from the research shell.

Camera is the shared native orthographic map in this first integration; the sprite assets are rendered from the original 60-degree camera. The existing terrain/army renderer is reused, not a second simulation. Crossbowmen are schematic, not relabelled archers. Artist acceptance and a proper common 60-degree command camera are future gates. No claim of full validation until browser evidence.
