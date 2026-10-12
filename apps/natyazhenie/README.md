# НАТЯЖЕНИЕ · v1.1

Colorful 2D elastic platformer for 2–5 friends through PocketNet, plus local same-keyboard 2P mode.

## Mechanics
- Finite tether: spring resistance after 128 world units; a hard maximum of 242 units per adjacent pair. Velocity impulses and projected constraints are shared between the browser and authoritative server.
- Anchor: hold Shift or E to brace on the ground; P2 locally holds Enter or Numpad0. Mobile has its own hold button; jumping releases anchor.
- Nine chapters add distinct pressure plate holds, spring jumps, rescue over gaps, anchor-powered hoops, moving hazards, lift, and a combined finale.
- Each plate belongs to one specific team member, not any passing avatar; its position scales with player count. Same mechanics apply to 2, 3, 4 and 5 people.
- Reversible animations for plate presses, elastic ribbon under strain, pulsing stars, moving hazards, braced anchor pose, spring compression and hoop activation.

## Rollout
Shared rules live in apps/natyazhenie/physics.js, duplicated verbatim inside server/module.ts and immutable pocketnet/module-versions/natyazhenie/v2.ts for Cloudflare bundling. New rooms use v2; sessions from v1 remain locked to their original version. No forced room reset.

## Validation
Run node apps/natyazhenie/qa.mjs to check rope length and stability, all 9 layouts at 2–5 players, anchor/beam/tension mechanics and local/online chapter transitions. The dedicated NATYAZHENIE Gameplay QA workflow runs on every related pull request and main publish.
