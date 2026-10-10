# ТУШЬ / Ночной тираж

Original offline 3D comic rooftop brawler. Three chapters, each with three escalating enemy waves; the final wave confronts the Главный редактор. Move, strike and dash through ink gang members. Telegraph rings warn before melee and ranged attacks. Dashing grants brief invulnerability and inflicts two damage. Combos multiply score. Progress between chapters, best score and sound preference are namespaced in local storage. Reload returns to the unlocked chapter; a live fight is restarted.

## Controls

Left virtual stick / WASD / arrows: move. БЕЙ / J / Space: auto-oriented melee strike. РЫВОК / K / Shift: directional dash, or auto-target dash when stationary. Pause and visibility loss stop combat. Start, pause and completion offer a labelled Pocket Works exit. Audio is optional randomized Web Audio synthesis. Reduced motion removes camera shake and hit-stop.

## Authored assets and runtime

`asset-forge/author.py` produces `assets/courier.json`: original hand-designed faceted courier with cape, hood, nib mask, eight-bone armature and skin weights. Regenerate using Python 3; the final mesh is committed. Runtime named animation clips Idle, Run, Attack and Hit deform one skinned mesh. Environment has composed roof props, inked architecture, printed signage, toon values and screen-space print dots. No third-party artwork. Three.js 0.186.1 is app-local, bundled from the official npm distribution; MIT licence in vendor/THREE-LICENSE.txt. Root dependencies are unchanged.

## QA

`node apps/inkbreak/tests/gameplay.mjs` runs Chromium and WebKit phone/landscape gameplay, combat through completion, pause/resume, persisted progression, reduced motion and Chromium offline reload against `dist-site`. Requires the runtime Playwright installation. `qa/` contains generated evidence; those files are excluded from the production site.
