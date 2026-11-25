# QA canary rollout — phase 1

The existing Universal Pocket Works QA workflow remains active and authoritative.
The only change to the existing planner is the validated PR cap (256 instead of
20); manual and issue requests retain the cap of 20. No app source or Cloudflare
configuration is changed.

The new Pocket Works QA Canary workflow runs on this release candidate branch
and opt-in same-repository pull requests labeled `ci-canary`. It uses the real
PR merge checkout and original PR planner. The branch push preflight runs the
full smoke suites of axis-pals and crumple-yard. An infrastructure-only PR with zero original app tasks runs the explicit axis-pals/crumple-yard smoke plan, including CPU, browser and shared build. The report identifies `coverageScope: infrastructure-smoke` and `originalLegacyJobs: 0`; it does not claim full app coverage. An empty app-changing plan or an invalid plan still fails closed. No historical
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

Executor hardening: the live workflow records completed nonzero test exits for bounded retry only. Invalid evidence, crashes, timeouts, dependency/build errors and cleanup failures fail the runner job, preventing the final audit from authorizing a successful candidate. This change does not enable the production migration.

## Phase 2: staged stable delivery gate

`Pocket Works CI Gate` runs on every PR, preserving the original planner and strict evidence audit. The legacy path is the default. The optional reusable sharded path independently verifies the parent plan digest and complete current-run evidence; failed candidate jobs fail the gate. Zero original app suites are identified explicitly, not presented as app coverage. Platform checks remain separate. `delivery-policy.json` is disabled: no production route change is authorized. Future activation requires completed parity validation, verified deployment, adding the stable check to the ruleset, and an explicit reviewed policy change plus repository Actions variable `PW_QA_ROUTE=sharded`. Rollback sets the variable to `legacy` and starts a fresh run; do not bypass a failed gate. Fork and manual/issue QA retain the original executor. No result reuse or impact skipping is allowed.

## Phase 3: controlled activation

Prerequisite evidence: PR #1374 hardened Canary 45644145153 (5/5 first pass), PR #1375 stable gate validation 45647998301 and platform validation 45647998059, disposable PR #1376 legacy run 45645761313 and sharded run 45646611590, both successful on checkout a195a7c00486b16447e2197946e0cf8bedba1489 with identical five-task plan digest 81cc93f8f31b0eb33a51be22ef2f72aea0784e85f8457fb0ad6f4d0fdae91602. Trial PR closed without merging. Protected main integration commit e0dd7fcec6b5939e3e091c7f557a9d89ec8cae31.

Activation PR enables eligibility only. Keep Actions variable PW_QA_ROUTE unset or legacy until the repository ruleset requires the exact stable check Pocket Works CI Gate from GitHub Actions, Cloudflare confirms successful production publication of the integrated gate commit (or a verified descendant), and this activation PR passes all required checks and merges. Then set PW_QA_ROUTE=sharded. Fresh same-repository app PR runs use the sharded executor with unchanged original plan, verified same-run build reuse and bounded retries. Manual/issue/fork runs stay legacy. No result reuse or impact skipping. A failed sharded run blocks the gate; rollback set PW_QA_ROUTE=legacy and start a fresh run, verify plan and successful legacy gate. Do not remove the six existing platform checks. Confirm the first live app PR, its delivery verdict, merge and actual Cloudflare publication before declaring rollout complete.
