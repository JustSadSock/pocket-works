# Trace Mosaic

Original distributed-tile mosaic and blocking-trail rules, artwork catalog, scoring, timed round and replay preserved. Online rooms require 3–5 players as in the original and use PocketNet. Explicit offline solo practice assigns all fragments to one player and saves the round. The original rules execute on the server online and in the same browser module for solo practice.

## Quality and follow-up
Client release: 0.2.0; authoritative PocketNet module: immutable v4. Source and server simulations stay identical.
Run `npm run test:trace-mosaic` for scoring, cancellation, fixed finish bonuses, path validation and 3/5 player round coverage.
Detailed audit and priorities: [ROADMAP.md](./ROADMAP.md).
Source-level regression checks passed, but real-browser multi-client and iOS WebKit acceptance still needs to run.
\nStage 1 reconnect/reallocation details: [STAGE1-RELIABILITY.md](./STAGE1-RELIABILITY.md).\n