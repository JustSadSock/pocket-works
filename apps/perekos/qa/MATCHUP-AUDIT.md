# Magic 2.0: reproducible elemental matchup audit

This is an engineering diagnostic, **not** a win-rate balance model or live
PocketNet benchmark. It uses the production fixed-step offline combat core but
runs intentionally simple, fully deterministic policy bots in an isolated
Magic 2.0 practice court. A real network match has additional latency,
human aiming, decisions, and rune drafting.

## Run

```sh
node --test apps/perekos/tests/magic-v2-matchups.test.mjs
PEREKOS_AUDIT_OUT=qa-artifacts/perekos-matchups/report.json node apps/perekos/qa/magic-v2-matchup-audit.mjs
```

Perekos QA uploads `report.json` as a GitHub Actions artifact. The diagnostic
also prints the key totals and warnings in the workflow log.

## Protocol

- All 3×3 ordered school matchups (including mirrors).
- **Starter**, **guard**, and **pressure** executable builds from owned school
  runes and actual rule validation.
- **Closing**, **circling**, and **ranging** deterministic movement policies.
- Two repeatable seeds and symmetric starting positions on an open midcourt
  lane; both orientations swap which school holds each seat.
- Both **direct** aim and velocity-**leading** aim using *only previously
  visible* opponent position. The aim solver uses the actual basic projectile
  speeds (stone 198, fire 252, storm 365), capped extrapolation, and no access
  to hidden enemy rune books.
- Full 60 FPS physics with collision caps, HP/shield/heat, knockouts and
  bounded runtime. A repeated seed must replay exactly.
- Count active bouts and individual tactical breakdowns. Exclude any pair
  where neither mirrored bout exchanges actual HP damage; null means
  insufficient evidence, **never** an even matchup.

The `seatNeutralHpAdvantage` for school A over B is the average of
`(HP_A-left - HP_B-right - (HP_B-left - HP_A-right))/2`
across active mirrored samples. Negative values favor B. Unlike a real
population win rate, HP advantage is sensitive to policy, episode duration
and action availability.

## Interpretation

A large school advantage is a **hypothesis** requiring deeper analysis, not
permission to rebalance blindly. Compare direct and predictive aim: projectile
speed is a large confounder in bots that fire at a moving enemy's current
position. Compare close, circle and range separately: an encounter-free policy
is a test gap, not proof of fair balance. Don't tune the live combat on the
averaged value alone.

Before gameplay balance changes: use multiple human-like policies, genuine
server-authoritative complete best-of-seven rounds (including rune offers,
drafting and reconnect), and two-device latency testing when available.
If a change becomes justified, release it in a NEW immutable PocketNet
module version. NEVER alter archived v9–v20 snapshots.
