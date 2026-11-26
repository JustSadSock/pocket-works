#!/usr/bin/env bash
# Exit 75 only on a pre-execution decline or revoked reuse; caller runs the
# original task fresh. Actual test/measurement failures remain failures.
set -euo pipefail
root="$1"
controller="$2"
evidence="$3"
output="$4"
outer="$PWD"
tool="$outer/scripts/ci-overhaul/gameplay-production-delivery.mjs"
status=0
node "$tool" eligible "$root" || status=$?
if [[ "$status" = 75 ]]; then exit 75; elif [[ "$status" != 0 ]]; then exit "$status"; fi
[[ -d "$controller/.git" && -f "$evidence/authenticated/catalog.json" ]] || exit 75
git -C "$root" diff --quiet HEAD || exit 75
[[ -z "$(git -C "$root" ls-files --others --exclude-standard -- apps/banners-of-war shared scripts package.json package-lock.json)" ]] || exit 75
issuer="$(jq -er '.auditCommit' "$evidence/authenticated/catalog.json")" || exit 75
[[ "$issuer" =~ ^[a-f0-9]{40}$ && "$(git -C "$controller" rev-parse HEAD)" == "$issuer" ]] || exit 75
# Work in an immutable clone so nested controller checkouts cannot be
# accidentally included in app input mounts.
temp="$(mktemp -d "$RUNNER_TEMP/production-delivery.XXXXXX")"
trap 'rm -rf "$temp"' EXIT
git clone --quiet --shared --no-checkout "$root" "$temp/source" || exit 75
git -C "$temp/source" checkout --quiet --detach "$GITHUB_SHA" || exit 75
export SHARD="$(jq -er '.seed' <<< "$PW_QA_TASK")"
export PW_QA_PRODUCTION_HIT_ONLY=1
status=0
bash "$outer/scripts/ci-overhaul/gameplay-renewable-admission.sh" "$controller" "$temp/source" "$evidence" "$temp/result" || status=$?
if [[ "$status" = 75 ]]; then exit 75; elif [[ "$status" != 0 ]]; then exit "$status"; fi
node "$tool" seal "$root" "$temp/result"
mkdir -p "$(dirname "$output")"
test ! -e "$output"
mv "$temp/result" "$output"
