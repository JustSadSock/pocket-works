# Fog of Conquest — faithful PocketWorks port

This is the original browser strategy from [JustSadSock/Fog-Of-Conquest](https://github.com/JustSadSock/Fog-Of-Conquest), with the original `index.html`, `js/` game rules, `css/style.css`, original pixel sprite pack in `assets/`, complete illustrated pack in `assets(ai)/`, original icon and language files. Game rules are deliberately **not replaced** by the earlier `engine.js` reinterpretation.

## Modes preserved
- Four map sizes (5×8, 10×15, 20×30, 20×60), original layered height-map generator, resource placement, balanced starts.
- Two-player hot-seat, seven AI presets (0–6), and the original extended/beta mode with the BOG unit.
- Swordsmen, archers, heavy infantry, cavalry, mage/healer, beta BOG; all original combat and movement values.
- Bases, barracks, stables, mage towers, mills, forts, capture, combat retaliation, ranged attacks and income.
- Original explored/visible fog model and line of sight, classic / illustrated / simplified renderers.
- Built-in tutorial, language selector, manual saves, autosave slot, match replay, playback speed, replay video export when the browser supports MediaRecorder.

## PocketWorks changes
- `pocket-adapter.css` / `pocket-adapter.js`: launcher return links, minimum 30px mobile cell size, native scrollable battlefield, cancel-selection button, safe areas.
- `js/ui.js`: fixed-slot autosave and mobile cell sizing; original combat, economy and unit definitions retained.
- `js/worldGen.js`: repairs an invalid diagonal connectivity fallback and checks connectivity after terrain balancing.
- `sw.js`: versioned application offline cache including original sprite packs.
- Original 512×512 game icon is the PWA icon.

## Networking caveat — NOT RELEASE READY
The original `js/network.js` and `js/lobby.js` use the root WebSocket endpoint and cannot safely be connected to PocketNet as written. The preceding PocketWorks v1 module (`server/module.ts`, immutable v1 snapshot) is a **different ruleset**: it must not be presented as a faithful port. The legacy online button is hidden until a PocketNet v2 module accepts the original battle actions, validates authority, projects fog individually and retains asynchronous rooms across disconnections. This is tracked as a release blocker, not a cosmetic follow-up.

## Verification
```sh
node --test apps/fog-of-conquest/test/original-port.test.mjs
node apps/fog-of-conquest/test/port-browser.mjs
```
Do not merge this draft until mobile/desktop browser QA and faithful PocketNet v2 are validated.
