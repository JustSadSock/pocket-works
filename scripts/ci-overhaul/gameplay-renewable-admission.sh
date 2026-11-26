#!/usr/bin/env bash
# The trusted issuer's offline controller archives actual source bytes, not an overlay.
set -euo pipefail
outer="$PWD"
controller="$1"
source="$2"
evidence="$3"
dest="$4"
export ACTUAL_QA_SOURCE="$(git -C "$source" rev-parse HEAD)"
export ACTUAL_QA_CONTROLLER="$(git -C "$controller" rev-parse HEAD)"
export RENEWAL_SOURCE_JSON="$RUNNER_TEMP/actual-source.json"
jq -n --arg source "$ACTUAL_QA_SOURCE" --arg tree "$(git -C "$source" rev-parse HEAD^{tree})" '{source:$source,sourceTree:$tree,sourceRef:"app/banners-of-war",sourcePR:1355}' > "$RENEWAL_SOURCE_JSON"
# No tracked or untracked mutation of the actual candidate is allowed.
test -z "$(git -C "$source" status --porcelain)"
test -z "$(git -C "$controller" status --porcelain)"
mkdir "$dest"
# A separate clone avoids modifying the actual source checkout and isolates metadata.
git clone --quiet --shared --no-checkout "$source" "$controller/audit-source"
git -C "$controller/audit-source" checkout --quiet --detach "$ACTUAL_QA_SOURCE"
(
  cd "$controller"
  export GITHUB_SHA="$ACTUAL_QA_CONTROLLER"
  source scripts/ci-overhaul/gameplay-renewal-offline.sh
  prepare_gameplay source
  node "$outer/scripts/ci-overhaul/gameplay-renewable-admission.mjs" admit "$out" "$evidence" "$RUNNER_TEMP/decision.json"
  run_gameplay_phase performance
  if ! jq -e '.decision=="reuse-shadow" and .productionAuthorization==false and .allowResultReuse==false' "$RUNNER_TEMP/decision.json" >/dev/null; then run_gameplay_phase gameplay; fi
  verify_gameplay_mounts
  status=0
  node "$outer/scripts/ci-overhaul/gameplay-renewable-admission.mjs" finish "$out" "$evidence" "$dest" "$RUNNER_TEMP/decision.json" || status=$?
  if [[ "$status" = 75 ]]; then
    test ! -d "$out/gameplay"
    run_gameplay_phase gameplay
    verify_gameplay_mounts
    jq -n '{decision:"execute",reason:"Admission revoked after preflight",productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false}' > "$RUNNER_TEMP/decision.json"
    node "$outer/scripts/ci-overhaul/gameplay-renewable-admission.mjs" finish "$out" "$evidence" "$dest" "$RUNNER_TEMP/decision.json"
  elif [[ "$status" != 0 ]]; then exit "$status"; fi
  mkdir "$dest/raw" "$dest/mount-proofs"
  cp -a "$out/." "$dest/raw/"
  for name in source audit; do for stage in before inside after; do cp "$RUNNER_TEMP/gameplay-$name-$stage.json" "$dest/mount-proofs/$name-$stage.json"; done; done
)
