Original prompt: Добавить Blocky / Blockies в PocketWorks.

Source game retained. Extracted the original falling-block engine into an isolated PocketNet room runtime, with persisted RNG and complete snapshots. Online client actions no longer mutate the authoritative board locally. Tests and visual records pending.

2026-10-19: completed source restoration, app-specific mobile layout corrections, original artwork/icon and app-local design/reference documentation. Functional scenarios and inspected captures are recorded by the acceptance scripts. Remaining release work: offline/landscape acceptance, current capture provenance, CI and merge.

Пользователь остановил дальнейшую полировку и разрешил перенос с известными проблемами. См. KNOWN_ISSUES.md; не тратить следующий запуск на повтор уже перечисленных проверок.

2026-10-19 (v0.1.1 candidate): complete scoped static audit; fixes in game.js for RAF lifecycle, visible background pause, held-key release, online ownership of touch/gamepads, no phantom local online restart, server-authoritative lobby ready UI, HTML-safe nicknames and disconnect feedback. Added ROADMAP.md and Playwright regression scenarios. Server engine untouched. Browser/CI and true two-client validation remain release blockers.

2026-10-19 (v0.1.2 candidate): PocketNet v2 stable ownership slots while the round is active, explicit unanimous server-side rematch state machine, preserving teammates' locked blocks after deliberate leave, reconnect seat retention through PocketNet, and UI vote progress. New board tests and Playwright result/vote regression added. Still pending: browser CI, true multi-browser resilience under latency, autonomous server tick and disconnected-seat grace.
