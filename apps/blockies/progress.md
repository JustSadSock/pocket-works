Original prompt: Добавить Blocky / Blockies в PocketWorks.

Source game retained. Extracted the original falling-block engine into an isolated PocketNet room runtime, with persisted RNG and complete snapshots. Online client actions no longer mutate the authoritative board locally. Tests and visual records pending.

2026-10-19: completed source restoration, app-specific mobile layout corrections, original artwork/icon and app-local design/reference documentation. Functional scenarios and inspected captures are recorded by the acceptance scripts. Remaining release work: offline/landscape acceptance, current capture provenance, CI and merge.

Пользователь остановил дальнейшую полировку и разрешил перенос с известными проблемами. См. KNOWN_ISSUES.md; не тратить следующий запуск на повтор уже перечисленных проверок.

2026-10-19 (v0.1.1 candidate): complete scoped static audit; fixes in game.js for RAF lifecycle, visible background pause, held-key release, online ownership of touch/gamepads, no phantom local online restart, server-authoritative lobby ready UI, HTML-safe nicknames and disconnect feedback. Added ROADMAP.md and Playwright regression scenarios. Server engine untouched. Browser/CI and true two-client validation remain release blockers.

2026-10-19 (v0.1.2 candidate): PocketNet v2 stable ownership slots while the round is active, explicit unanimous server-side rematch state machine, preserving teammates' locked blocks after deliberate leave, reconnect seat retention through PocketNet, and UI vote progress. New board tests and Playwright result/vote regression added. Still pending: browser CI, true multi-browser resilience under latency, autonomous server tick and disconnected-seat grace.

2026-10-19 (v0.1.3 candidate): stage-II feel & physics pass: server/client equivalent bounded wall kicks with tested locked/active blockers, per-player ghost landing projection, short reduced-motion-safe impact, independent DAS/ARR key/gamepad/pointer sources, touch pointer capture including cancelled pointers and pause/restart cleanup. Added isolated server cases and Playwright ghost/hold/multi-source scenarios. Pinned immutable PocketNet Blockies v3. Remaining acceptance: CI browser/mobile tests, true multi-browser lag, SRS/lock-delay engine unification.

2026-10-19 (v0.1.4 candidate): Shared deterministic 7-bag shuffle with persisted queue, a once-per-lock Hold exchange per player, keyboard/gamepad/touch bindings, two-slot per-player previews, PocketNet immutable v4 and unit/browser regression coverage. Await full CI and interactive double-client release validation.

2026-10-19 (v0.1.5 candidate): PocketNet v5 freezes absent pieces after a heartbeat grace and expires idle active slots after 60 seconds without deleting the locked well; rejoin works at results. Browser reports absence in nonblocking status and safely stays on the playing screen after reconnect. Server snapshots now include exact cleared-row ownership for physics-grounded line-clear fragments; client/server physics parity has an independent 11-rule test. CI pending.

2026-10-19 (v0.1.6 candidate): Extracted a pinned shared pure engine module for collision, wall kicks, spawn, bag, line clears and scoring, used by both browser and server module v6. Added autonomous DO alarm per-second ticking for active Blockies rooms (no player pulses necessary), with an earliest-deadline guard so chatty clients cannot starve alarms. Added unit/alarm integration regressions, and offline service-worker cache for the shared engine. Pending CI and 2-client latency acceptance.

2026-10-19 (v0.1.7 candidate): Removed both duplicate Player classes and introduced a single immutable player-core-v1.js imported by client and PocketNet v7. UI/audio/network side effects are now adapters. Versioned state revision and round-scoped commands prevent reordered snapshots and stale input from replaying into a subsequent round. Added isolated server and Playwright two-page ownership tests. Pending CI and real live-WebSocket load acceptance.

2026-10-20 (v0.1.8 candidate): Added a data-only bounded replay archive with solo/local/online frame capture, timeline player, last-match persistence and JSON import/export. Node Pocket Server now runs authoritative Blockies ticks and emits full shared state; a true WebSocket integration suite exercises two sessions, board synchronization, dropped connection, rejoin and stale round input. Pending CI and staged Cloudflare socket tests.
