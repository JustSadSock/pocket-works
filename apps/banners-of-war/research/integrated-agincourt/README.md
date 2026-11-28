# Integrated Agincourt — protected local preview

Use the actual branch checkout; do not publish the research page or assets.
Download original candidate artifact [15244108584](https://github.com/JustSadSock/pocket-works/actions/runs/46097554811/artifacts/15244108584), extract, set BOW_ART_OUTPUT to the directory containing mixed-atlas.json. From repository root run:

```sh
BOW_ART_OUTPUT=/absolute/path/to/candidate node apps/banners-of-war/research/integrated-agincourt/server.mjs
```

Open the printed localhost URL. Existing Chronicles of War -> Agincourt -> side -> launch. The Диорама/Схема button switches representation, not state. All commands, playback, reporting and saves are native. Diagnostic layers, alternate palette, unsupported types and failed assets use the native schematic representation. Do not use a production save origin. The server binds only 127.0.0.1 and removes service worker registration from the research shell.

Camera is the shared native orthographic map in this first integration; the sprite assets are rendered from the original 60-degree camera. The existing terrain/army renderer is reused, not a second simulation. Crossbowmen are schematic, not relabelled archers. Artist acceptance and a proper common 60-degree command camera are future gates. No claim of full validation until browser evidence.

The experimental 60° button appears with Candidate selected in Agincourt. It fits the physical terrain in the existing command map; click "Обзор" to return to the strategic projection. Toggle "Схема" to return to native representation. Diagnostic layers, alternate palette and group-command mode use the strategic fallback. Native UI and round controls still own all commands. No public preview is enabled.

## Custom Battle / experimental three-battle campaign
Same localhost command; use the main muster rather than Chronicles. Configure both armies with the army selector; choose preset or edit regiment types, training and size; select landscape, seed and conditions, deploy and issue native commands. The Candidate toggle and 60-degree camera are available for these battles; unsupported troops remain schematic. Check campaign to retain regiment IDs and actual whole survivors through three battles; at the result screen select replenishment or recruit. No production activation; no new character assets.

## Battle Rhythm / five-operation experiment
Select 1200 m for standard maneuver, 1000 m for close battle, 1400 m for wide battle. Enable Commander Campaign and choose five operations (three remains available). After each result choose an available operation and replenishment priority. New orders require confirmation; "Продолжить текущий план" deliberately executes one round without replacing old orders. The optional query `?view=candidate&fieldArt=before` restores the pre-study Candidate material appearance for matched visual review; `?view=candidate` uses current field treatment. Both use the same authoritative save. For a separately provisioned private SSH host running this server, an authenticated tunnel `ssh -N -L 4179:127.0.0.1:4179 user@private-host` allows local browser access; do not expose the server publicly. No such host is configured or verified by this work.
