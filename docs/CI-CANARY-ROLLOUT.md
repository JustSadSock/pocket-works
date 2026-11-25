# QA canary rollout — phase 1

The existing Universal Pocket Works QA workflow remains active and authoritative.
The only change to the existing planner is the validated PR cap (256 instead of
20); manual and issue requests retain the cap of 20. No app source or Cloudflare
configuration is changed.

The new Pocket Works QA Canary workflow runs on this release candidate branch
and opt-in same-repository pull requests labeled `ci-canary`. It uses the real
PR merge checkout and original PR planner. The branch push preflight runs the
full smoke suites of axis-pals and crumple-yard. A PR with zero applicable tasks
fails the experimental plan instead of claiming app coverage. No historical
results are accepted. Builds are sealed against the same tree/run/attempt.
First-pass failures are retained; retries are bounded and independently audited.
The new check is not a deployment gate and must not be made required yet.

Before switching: confirm preflight and live PR runs; verify branch protection
and required check identities with repository administrator; validate actual
Cloudflare publication with legacy checks still enabled. Do not remove legacy
checks until a separately reviewed migration. Rollback: remove ci-canary label
for future PR executions, or disable the optional workflow; legacy remains
unchanged. Verified Results and Impact Engine skipping are not enabled.
Adaptive scheduling and Observatory libraries remain advisory; this workflow
uses fixed six-worker pools and reports measured phase durations.

Historical evidence: integrated run 45483925251 (180/180), independent replay
45485063517 (50/50), rollback drill 45498339187, protected receipt lab 45490754186.
