#!/usr/bin/env bash
# No credentials or checkout metadata are mounted into the simulation container.
set -euo pipefail
prepare_gameplay() {
  role="$1"
  [[ "$role" = source ]]
  [[ "${SHARD:-}" =~ ^[0-7]$ ]]
  out="$RUNNER_TEMP/gameplay-output-$role"
  src="$RUNNER_TEMP/gameplay-source"
  audit="$RUNNER_TEMP/gameplay-audit"
  source_sha="$(jq -er '.source' "$RENEWAL_SOURCE_JSON")"
  source_tree="$(jq -er '.sourceTree' "$RENEWAL_SOURCE_JSON")"
  [[ "$source_sha" =~ ^[a-f0-9]{40}$ && "$source_tree" =~ ^[a-f0-9]{40}$ ]]
  test "$(git -C audit-source rev-parse HEAD)" = "$source_sha"
  test "$(git -C audit-source rev-parse HEAD^{tree})" = "$source_tree"
  mkdir "$out" "$src" "$audit"
  git -C audit-source archive HEAD apps/banners-of-war shared package.json package-lock.json | tar -xf - -C "$src"
  git archive HEAD scripts/ci-overhaul | tar -xf - -C "$audit"
  tool=scripts/ci-overhaul/gameplay-renewal.mjs
  node "$tool" normalize "$PWD/audit-source" "$source_sha" "$src" renewalSource > "$RUNNER_TEMP/gameplay-source-before.json"
  node "$tool" normalize "$PWD" "$(git rev-parse HEAD)" "$audit" audit > "$RUNNER_TEMP/gameplay-audit-before.json"
  image='node@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb'
  docker pull "$image"
  config="$(docker image inspect --format '{{.Id}}' "$image")"
  opts=(--rm --network none --hostname pw-gameplay --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=128m --user "$(id -u):$(id -g)" -e TZ=UTC -e LANG=C.UTF-8 -e HOME=/tmp -e "SOURCE_SHA=$source_sha" -e GITHUB_RUN_ID -e GITHUB_RUN_ATTEMPT -e GITHUB_SHA --mount "type=bind,src=$src,dst=/work,readonly" --mount "type=bind,src=$audit,dst=/audit,readonly" -w /work)
  runtime="$(docker run "${opts[@]}" "$image" node -p 'process.version')"
  arch="$(docker run "${opts[@]}" "$image" node -p 'process.arch')"
  toolchain="$(docker run "${opts[@]}" "$image" sha256sum /usr/local/bin/node | cut -d' ' -f1)"
  kernel="$(uname -srvm | sha256sum | cut -d' ' -f1)"
  cpu="$(awk -F: '/^(vendor_id|cpu family|model[[:space:]]|model name|stepping|microcode|flags)[[:space:]]*:/{print}' /proc/cpuinfo | sort -u | sha256sum | cut -d' ' -f1)"
  echo "Measured kernel: $(uname -srvm); CPU fingerprint: $cpu"
  docker run "${opts[@]}" "$image" node /audit/scripts/ci-overhaul/gameplay-renewal.mjs measure /work > "$RUNNER_TEMP/gameplay-source-inside.json"
  docker run "${opts[@]}" "$image" node /audit/scripts/ci-overhaul/gameplay-renewal.mjs measure /audit > "$RUNNER_TEMP/gameplay-audit-inside.json"
  cmp "$RUNNER_TEMP/gameplay-source-before.json" "$RUNNER_TEMP/gameplay-source-inside.json"
  cmp "$RUNNER_TEMP/gameplay-audit-before.json" "$RUNNER_TEMP/gameplay-audit-inside.json"
  jq -n --arg repository "$GITHUB_REPOSITORY" --arg workflow '.github/workflows/gameplay-receipt-renewal.yml' --arg sourceRef "$(jq -er '.sourceRef' "$RENEWAL_SOURCE_JSON")" --argjson sourcePR 1355 --arg role "$role" --arg source "$source_sha" --arg sourceTree "$source_tree" --arg auditCommit "$(git rev-parse HEAD)" --arg auditTree "$(git rev-parse HEAD^{tree})" --arg ref "$GITHUB_REF" --arg event "$GITHUB_EVENT_NAME" --argjson shard "$SHARD" --argjson run "$GITHUB_RUN_ID" --argjson attempt "$GITHUB_RUN_ATTEMPT" --argjson sourceMount "$(cat "$RUNNER_TEMP/gameplay-source-before.json")" --argjson auditMount "$(cat "$RUNNER_TEMP/gameplay-audit-before.json")" --arg image "${image##*@sha256:}" --arg config "${config#sha256:}" --arg node "$runtime" --arg arch "$arch" --arg toolchain "$toolchain" --arg kernel "$kernel" --arg cpu "$cpu" --argjson uid "$(id -u)" --argjson gid "$(id -g)" '{schema:1,shard:$shard,repository:$repository,workflow:$workflow,role:$role,source:$source,sourceTree:$sourceTree,sourceRef:$sourceRef,sourcePR:$sourcePR,auditCommit:$auditCommit,auditTree:$auditTree,ref:$ref,event:$event,run:$run,attempt:$attempt,sourceMount:$sourceMount,auditMount:$auditMount,environment:{contract:"banners-offline-phase-v1",image:$image,config:$config,node:$node,arch:$arch,toolchain:$toolchain,kernel:$kernel,cpu:$cpu,uid:$uid,gid:$gid},productionAuthorization:false}' > "$out/manifest.json"
  docker run "${opts[@]}" --mount "type=bind,src=$out,dst=/out" "$image" node /audit/scripts/ci-overhaul/gameplay-renewal-phase.mjs plan /work /out/plan.json
}
run_gameplay_phase() {
  local phase="$1"
  [[ "$phase" = gameplay || "$phase" = performance ]]
  mkdir "$out/$phase"
  docker run "${opts[@]}" --mount "type=bind,src=$out/$phase,dst=/out" "$image" node /audit/scripts/ci-overhaul/gameplay-renewal-phase.mjs phase /work "$SHARD" "$phase" /out
}
verify_gameplay_mounts() {
  node "$tool" measure "$src" > "$RUNNER_TEMP/gameplay-source-after.json"
  node "$tool" measure "$audit" > "$RUNNER_TEMP/gameplay-audit-after.json"
  cmp "$RUNNER_TEMP/gameplay-source-before.json" "$RUNNER_TEMP/gameplay-source-after.json"
  cmp "$RUNNER_TEMP/gameplay-audit-before.json" "$RUNNER_TEMP/gameplay-audit-after.json"
}
