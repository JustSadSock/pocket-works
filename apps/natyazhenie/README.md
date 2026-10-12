# НАТЯЖЕНИЕ

Bright canvas-based PocketWorks co-op platformer for two to five players.

## Playing
Create a PocketNet room, copy the eight-character code or invitation link, wait for at least one friend, and start. The host starts new runs and restarts the current stage. All six stages share the same authored chapter layout, with activation plates, stretch thresholds and team geometry adjusted for the current capacity. Every player must reach the exit after completing its puzzle.

PC: A/D or left/right to move; W, Space or up to jump. Mobile: on-screen left/right/jump. Same-keyboard local mode: P1 uses A/D + W/Space, P2 uses arrow keys. Escape pauses. Both local and online complete all six stages.

## Realtime
Server rules: server/module.ts (immutable PocketNet snapshot v1). The Durable Object performs fixed, bounded substeps on input heartbeats, validates action rate and sender, and broadcasts a throttle-limited authoritative state. Rendering stays on requestAnimationFrame independently of network packets. The local player uses speculative physics and convergence towards an ahead-of-snapshot authoritative estimate; peers use velocity extrapolation (up to 120 ms) with exponential settling. Dropouts fall back to a local connection indicator and PocketNet reconnects with the same room token.

## Acceptance
- Node tests: node apps/natyazhenie/qa.mjs
- Levels checked independently for all 2, 3, 4, 5 player capacities: pad separation, floor support, gap width, gate clearance, and rope requirements.
- First to sixth chapter require the intended plate/star/stretch task; merely running right does not unlock a gate.
- Service Worker caches only app-owned files and required shared runtime; no PocketLAN imports.
- The latest server snapshot must exactly match server/module.ts; publish together with the lock update.

The game intentionally favors clear silhouettes, responsive controls and limited screen copy.
