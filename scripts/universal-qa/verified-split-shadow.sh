#!/usr/bin/env bash
set -euo pipefail
shard="$1"
dest="$2"
[[ "$shard" =~ ^[0-7]$ ]]
original=45d6ce53df3cd5013a605bba972d94f1c0cd8dce
controller=2521b436264b904b4c7e88ac9e00a59c0cbbc688
outer="$PWD"
evidence="$PW_QA_VERIFIED_EVIDENCE"
# Only the platform overlay is excluded; all other source inputs must match.
scope=(apps/banners-of-war shared package.json package-lock.json scripts ':(exclude)scripts/universal-qa' ':(exclude)scripts/ci-overhaul')
if ! git diff --quiet "$original" HEAD -- "${scope[@]}" || ! git diff --quiet HEAD -- "${scope[@]}" || [[ -n "$(git ls-files --others -- "${scope[@]}")" ]]; then
  echo 'Unmatched candidate scope'; exit 75
fi
if [[ ! -f "$evidence/authenticated.json" ]] || [[ "$(git -C "$PW_QA_VERIFIED_CONTROLLER" rev-parse HEAD 2>/dev/null || true)" != "$controller" ]]; then
  echo 'No authenticated evidence or immutable controller'; exit 75
fi
export SHARD="$shard"
(
  cd "$PW_QA_VERIFIED_CONTROLLER"
  outer_sha="$GITHUB_SHA"
  export GITHUB_SHA="$controller"
  source scripts/ci-overhaul/verified-gameplay-offline.sh
  prepare_gameplay source
  GITHUB_SHA="$outer_sha" node "$outer/scripts/ci-overhaul/gameplay-admission-policy.mjs" admit "$out" "$evidence" "$RUNNER_TEMP/verified-split-decision.json"
  # Invalid evidence may fall back only before starting a phase.
  if jq -e '.reason=="Authenticated evidence unavailable"' "$RUNNER_TEMP/verified-split-decision.json" >/dev/null; then exit 75; fi
  run_gameplay_phase performance
  if ! jq -e '.decision=="reuse-shadow" and .productionAuthorization==false and .allowResultReuse==false' "$RUNNER_TEMP/verified-split-decision.json" >/dev/null; then run_gameplay_phase gameplay; fi
  verify_gameplay_mounts
)
node scripts/ci-overhaul/gameplay-admission-policy.mjs finish "$RUNNER_TEMP/gameplay-output-source" "$evidence" "$RUNNER_TEMP/gameplay-output-source/policy-report.json" "$RUNNER_TEMP/verified-split-decision.json"
cp -a "$RUNNER_TEMP/gameplay-output-source/." "$dest/"
