# КРОССЛАЙН · 5×5 Arena

Port of JustSadSock/5x5 to Pocket Works as an independent Quick PWA.

Rules: 5×5 battlefield, two fighters at (0,2) and (4,2), five private commands each round, at most four rounds. Moves resolve simultaneously before attacks and shields. Each plan allows a single attack with one or more orthogonal adjacent directions, and a single shield. Attack directions cannot be used as movement directions within the same plan. Repeating a move direction is permitted. In round four, the outer perimeter collapses after the first beat.

Modes: solo against sampled-plan AI (five levels), pass-and-play, authoritative PocketNet duels with pinned v1 server module, private planning, reconnect and durable round replays. Replay scrub, speeds 1×–5×, JSON export, optional WebM export.

Server source: server/module.ts. Immutable copy: pocketnet/module-versions/crossline-5x5/v1.ts. The server validates five actions and expected revision, scores and resolves all combat; viewForPlayer prevents pre-reveal plan leaks.

Check with: node --experimental-strip-types --test apps/crossline-5x5/tests/*.test.mjs
Then npm run registry:check, npm run build:pocketnet, npm run prepare:site, npm run validate:site.

Manual E2E: complete four nonlethal rounds; verify collapse after round-four first beat; test shield and mutual attacks; create/join an online room from two browsers; confirm that B cannot see A's pending actions; refresh browser A after submitting a plan; verify same room/seat/ready flag after reconnection; test replay and exports.
