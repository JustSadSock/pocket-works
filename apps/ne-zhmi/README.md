# НЕ ЖМИ! — Stage 1
First playable stage of the local co-operative robot game in Pocket Works.

## Interaction
- Start the testing course from the instrument panel.
- Operator 1 presses **ПРЫГ** (Space/W/Up Arrow).
- Operator 2 presses **РАЗВОРОТ** (R/Left Arrow/Right Arrow).
- Boltik drives on its own; cooperate to jump raised steps, avoid pits and reach the finish.
- The checkpoint after the central descent becomes the respawn point; falling increments a counter.
- Pause, restart, complete, inspect run stats and replay; best time is stored locally.

## Scope
Version 0.1 implemented the local two-button stage only. Version 0.2 adds PocketNet rooms with server-owned physics and reconnection. Procedural routes and additional abilities belong to later milestones.

## Architecture
engine.js is pure deterministic fixed-timestep simulation; renderer.js is a Canvas 2D presentation; app.js owns inputs/state/audio and uses the shared mobile runtime. Screen dimensions are handled in CSS; the camera pans on phone while preserving a world-coordinate progress bar. Rendering is uncoupled from physics.

## Tests
Run: node --test apps/ne-zhmi/engine.test.mjs
Validate: npm run registry:check
Mobile visual smoke: apps/ne-zhmi/qa.plan.json
Physics checks cover motor, jump, reversal cooldown, platform collisions, checkpoint, respawn, finish and determinism.

## Diagnostics
The built-in Pocket Works Workshop can be opened from the first or pause screen, and from the standard shortcut. It reports the current application's runtime, errors and owned storage only. Reset prompts for a second click and returns to the menu.

## Stage 2 — PocketNet
Select "Создать онлайн-комнату" or "Войти по коду" from the menu. Two players join with eight-digit codes or links. Host can swap roles and start/restart; the first operator can only jump and the second can only reverse. The server calculates all authoritative physics and sends snapshots at approximately 8–10 Hz; clients render smoothly between snapshots. If either operator stops sending heartbeats for 1.25 seconds, the world freezes until both are present again. Room state survives websocket reconnect by session token. Leave confirmation is required. No PocketLAN.

Server module: `server/module.ts`, pinned as `pocketnet/module-versions/ne-zhmi/v1.ts`. Run `node --test apps/ne-zhmi/server.test.mjs` and `npm run pocketnet:check`. The PocketNet release lock accompanies the module to ensure installed room versions remain immutable.

## Stage 3 — Mechanical Course Factory
Every locally started run or new PocketNet round now generates five safe connector modules from a catalog of twelve, using a reproducible seed. The world has three painted workshop themes, dynamic track dimensions, collision-aware timed gates and pistons, conveyors, springs and fan forces. Local replay repeats the same seed; next run generates a new layout. PocketNet locks the course in the authoritative room snapshot (server module v3), so all connected clients see the same geometry and devices.

## Stage 4 — Six operator stations
Lobby seats accept 2–6 users, role rotation moves every seat, and each player can send only their assigned mechanic. Local test mode supports 2–6 operator buttons on the same keyboard/tablet. Magnet (hold, attracts cargo and magnetic rails), brake (hold, slows the drive), push (impulse, with cooldown, launches cargo), and float (hold, lifts the balloon and reduces effective gravity) have server-authored force, charge and cooldown states. The generator uses player count as an ability-set filter so a two-person party never receives the special six-person devices. Service Worker caches new gameplay files. PocketNet v5 is pinned independently of v1–v4.

## Stage 5 — Physical personality and perceptual clarity
The visual layer now tracks rolling displacement instead of periodically rotating wheels based on frame timing; Boltik's blink, glance, antenna spring and landing compression add movement without modifying the shared physics state. Visual-only effects are bounded (max 150 particles, max 15 rings) and triggered for authoritative events; remote clients animate from server counters without sending their own positions. Audio is synthesized by `soundscape.js` (short mechanical layered notes, lazy WebAudio, mute setting persisted) and controls give optional device haptics. Hazards are indicated when the player physically approaches them; the hint never hides the course. Reduced-motion mode removes screen shake and limits particles and transitions. The renderer tracks courses by seed rather than object identity to avoid camera snaps when PocketNet sends snapshots.

## Stage 6 — modes and continuity
The game's three physical channels are **one-off** (one fast run), **party** (three authoritative circuits with a cumulative results ticket and falls), and **free workshop** (specific reproducible 32-bit course seed plus 4/5/6 sections). Local party progress persists as a validated lightweight summary; interrupted runs replay from the start of the unfinished course. The room host configures the multiplayer game mode and lab geometry before starting. Guests can view but cannot change authoritative settings. Server-reported scores are the only source of truth for online party achievements. Room snapshots include config and session results, so reconnecting users see the same ticket; completing stage 3 offers a fresh three-stage series. No additional physical buttons, transport permissions or changes to legacy PocketNet module versions are necessary.

## Stage 7 — Reliability and release audit
- Side-aware robot and cargo contacts avoid teleporting to the other side of a box.
- Post-piston recovery grace prevents immediate re-kills at checkpoints but does not disable later collisions.
- PocketNet v13 sends compact repeated movement packets without the immutable route. New rounds, victory and sync include full geometry; the client reuses the known level only when round identifiers match, otherwise requests a fresh server sync. Frozen historical v1–v12 are unchanged.
- New tests: 2,400 course variations, exact server/client physics equivalence, simulated 25-minute six-operator room with network stalls, directional box collisions, recovery, stale packets and mobile+online Playwright suites.
- No new placeholder buttons or shell-level interface changes. Existing CI errors in unrelated apps are tracked separately from application tests.

## Stage 8 — Specialist stations are never idle
The procedural route factory now plans all modules first, then places them with constraints: for each role added beyond jump/reverse, the generated course guarantees exactly one distinct section for magnet, brake, cargo push and float. Existing gap/step/island and specialist jump-heavy sections never appear adjacent. Four-to-six-section lab courses and every online crew size 2–6 use the same seed-driven contract (course generation version 3, immutable PocketNet module v15).
New tests verify 15,000 seeded combinations across crew counts and route lengths, reproducibility against the authoritative server, and actual passage through every one of the sixteen section kinds using the real fixed-timestep engine and corresponding special action. This proves each representative section can be crossed, rather than claiming all possible whole-course combinations have been formally solved. No client-side control is simulated as a fake interaction.
Shared platform unblock: the existing Chyepukha server file is pinned verbatim into immutable PocketNet v7 without editing any Chyepukha gameplay source, allowing the common registry builder to verify the version contract.

## Stage 9 — Whole-track physical verification
The procedural factory resamples overconstrained 4–6-module sets while preserving every specialist assignment, and never puts a jump-dependent obstacle immediately after a spring or upward fan. The timed press now has a quick cam-driven strike and longer raised interval. Two-player crews can time their approach with the reverse control. Four-player crews can instead hold brake for 0.22 seconds, release for 1.08 seconds of piston-only protection, and see the metallic guard on Boltik. Magnet lift ends with the physical rail; an airborne push can reach cargo. These changes are mirrored exactly on authoritative PocketNet v17.
A full-route searcher branches only on actual commandGame actions and copies legitimate fixed-timestep state; it never teleports, edits the clock, or skips a failed section. Its benchmark suite physically finishes 150 of 150 generated five-section routes (seeds 1–30; crews 2–6) without respawns. This is a reproducible regression corpus, not a mathematical proof of all possible seeds or a measure of human skill.
