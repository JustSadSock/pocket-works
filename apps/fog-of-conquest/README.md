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

## PocketNet: source rules, not a remake
The original generator, original unit/building constants, movement points, attacks,
retaliation, capture damage, healing, training costs and turn economy are embedded
in `server/module.ts`, not replaced with the obsolete alternative `engine.js`.
The two-client protocol sends intents (move, attack, heal, spawn, end) to
the authoritative server. The server validates ownership, range, terrain and
gold; `viewForPlayer` hides unknown terrain, enemy units, opponent resources,
and privately projects explored fog. Commands include revision checks.

The immutable PocketNet `v4.ts` snapshot (with v2/v3 preserved), `modules.lock.json` activation
and hub room-retention support are published in the same atomic release.
Disconnected users can rejoin with their saved guest token and room ID;
inactive rooms are retained for up to six days, subject to platform quotas,
which are not a guarantee of long-term storage. Explicitly leaving a game
is a forfeit; simply losing network connectivity is not.

## Verification
```sh
node --test apps/fog-of-conquest/test/original-port.test.mjs
node apps/fog-of-conquest/test/port-browser.mjs
```
Run `node --test apps/fog-of-conquest/test/stage0.test.mjs apps/fog-of-conquest/test/stage1.test.mjs` for critical save / beta regressions. Run the original browser gameplay QA after changes; confirm both desktop and mobile states and two-client PocketNet integration. Original offline local modes do not require an internet connection.

## Post-port audit and roadmap
- [Defect register / audit (18 October 2026)](./AUDIT-2026-10-18.md)
- [Prioritized remediation and improvements roadmap](./ROADMAP.md)

## Stage 1 rules and AI (v1.3.0)

AI healers prioritize injured allies, and AI movement spends only points proven legal by the original computeZone. After a side loses all military buildings, its five rescue turns tick only when that side ends its turn. Each side maintains frozen last-seen building intelligence without live opponent updates; v4 offline saves include this memory. Optional seeded worlds support reproducible regression tests. PocketNet uses a new immutable v4 ruleset and keeps active v2/v3 games on their pinned version. Full completed-match AI soak testing remains open (FOG-018).

## Mobile tactical atlas (v1.4.0)

`pocket-map.js` and `pocket-map.css` add pinch/double-tap/button zoom on the existing original canvas, a side-private minimap, a quick centering action, responsive focus-first HUD and a private hotseat handoff curtain. Client hit testing uses the actual rendered canvas size, so changing CSS scale does not change legal movement or attacks. Fog memory used by the minimap never reads current invisible enemy information. Rule text is still accessible via the main menu. Regression tests: `qa/stage2.spec.ts`.

## PocketNet reconnect & command safety v1.5.0

Current module is immutable `pocketnet/module-versions/fog-of-conquest/v5.ts`. Earlier rooms continue using their original pinned snapshots. A deliberate leave forfeits an active match, but a WebSocket disconnect retains the player's seat. Leaving a lobby transfers host rights to the remaining member. Client commands carry unique request IDs and expected revisions; the authoritative module confirms each successful order privately, deduplicates replays, and synchronizes authoritative private state on stale requests. Auth changes invalidate old asynchronous operations and room-not-found/expired snapshots produce clear exit actions. See `test/stage3.test.mjs` and `qa/stage3.spec.ts`. Full real-Worker disconnect matrix and action-effects replay remain open.

## Private battle observations & real Worker QA (v1.5.1)

`battle-events.js` / `battle-events.css` implement a non-mutating history of the last 96 server-observed actions per side and a 12-action battlefield highlight replay. The v6 PocketNet module emits only authenticated side-targeted packets, drops hidden unit positions, private HP and even action-counter gaps, and projects only the requesting seat's journal in `viewForPlayer`. Prior versions remain immutable. `pocketnet/test/fog-real-worker.mjs` tests actual Wrangler local SQLite Durable Object, WebSocket authority, 10 reconnects, a complete surrender and lobby succession. `qa/worker-flow.spec.ts` performs the real-Worker flow through two browser contexts. To run: start `wrangler dev --local --port 8787` with site assets, then run both scripts. The tests are also in PocketNet Edge CI.

## Sound, relief and capture (v1.6.0)

`pocket-audio.js` synthesizes a low-key Web Audio chord bed and offline sound effects in response to user gestures. It replaces all remote samplelib MP3s and respects the existing independent music/SFX mute and volume settings. The sound context is released when the app closes. `pocket-visual.js` gives original terrain sprites low-contrast relief and overlays action flashes without consulting hidden cells. Combat marks are disabled for reduced-motion users. The WebM replay exporter has codec and browser support checks, an explicit recording stop, MediaStream cleanup and revoked Blob URLs. `qa/stage4.spec.ts` captures matrix screenshots and tests renderer fog safety, mute persistence and unsupported recorder fallback.

## Stable offline saves and replay archive (v1.7.0)

Offline save schema v5 supports `replayArchive`: a 20-event checkpoint plus unit/building/state deltas; only the latest 1200 events are kept. `FogSaveSchema.normalize` expands and validates archives before the running match is changed. Legacy v4 replay arrays are accepted and round-trip to v5. Settings allow a user to export the current local match; the save picker can export any slot and import an offline JSON save as a **new** slot without overwriting the game. Imported files must be ≤3 MiB, pass full validation, and cannot originate from PocketNet. Retired legacy WebSocket and old remake entry have been removed. PocketNet rulesets v1–v6 have not changed. See `test/stage5.test.mjs` and `qa/stage5.spec.ts`.

## Shared original rules kernel v1.8.0

`js/rules-core.js` is used for local movement points, combat calculations, income, unspent-movement healing and grace-period victories. To keep PocketNet rules snapshots fully immutable, the exact `FogRuleKernel` block is embedded in `server/module.ts` and pinned as `pocketnet/module-versions/fog-of-conquest/v7.ts`; `test/stage5-parity.test.mjs` enforces textual identity and randomized comparisons against v6. The only intentional change is the cavalry defense modifier: enemy troops use a building's protection only when the building is theirs, matching the original local client. Earlier PocketNet versions stay pinned and active rooms are not migrated. See `qa/stage5-parity.spec.ts` for real browser checks.

## Command and fog parity (v1.9.0)

`FogRuleKernel` now implements recruitment validation, mage healing validation, capture of destroyed buildings, line-of-sight and side-private fog projection as well as movement, combat and turn economy. The local client and immutable PocketNet v8 embed identical routines. Earlier pinned v1–v7 rooms are unchanged. Regression coverage includes seeded vision comparison against v7, hidden-building privacy, valid/invalid heals, real production-building recruitment, army caps, and destroyed-base capture. Source-of-truth tests live in `test/stage5-commands.test.mjs`.

## Full AI campaign QA and fog module (v1.10.0)

The source `js/ai.js` is exercised unmodified in headless procedurally generated campaigns via `test/marathon-sim.mjs`, with the opposing commander using real authoritative `originalAction()` requests. `stage6-marathon.test.mjs` tests 20 seeds for each of seven AI tiers across four map sizes with 60-half-turn horizons and real early victories; invariants include money, army health, board bounds, fog, recruitment and combat. These run as a dedicated required Fog CI job. The extracted `js/fog-controller.js` owns local visibility projection and immutable historical building observations, never reconstituting private PocketNet data.
