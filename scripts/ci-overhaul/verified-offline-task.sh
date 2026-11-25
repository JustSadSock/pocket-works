#!/usr/bin/env bash
# Sourced only by the read-only receipt runner. Keep both paths identical.
set -euo pipefail
prepare_verified_task() {
  mkdir -p "$RUNNER_TEMP/receipt-input" "$RUNNER_TEMP/receipt-source" "$RUNNER_TEMP/receipt-task-output"
  out="$RUNNER_TEMP/receipt-input"
  src="$RUNNER_TEMP/receipt-source"
  taskout="$RUNNER_TEMP/receipt-task-output"
  # Archive tracked source; do not expose .git, runner credentials or home.
  git archive HEAD apps/axis-pals shared scripts package.json package-lock.json | tar -xf - -C "$src"
  mkdir -p "$src/qa-artifacts"
  node scripts/ci-overhaul/verified-mounted-inputs.mjs normalize "$GITHUB_WORKSPACE" "$(git rev-parse HEAD)" "$src" > "$RUNNER_TEMP/receipt-mount-before.json"
  mounted="$(jq -er .digest "$RUNNER_TEMP/receipt-mount-before.json")"
  [[ "$mounted" =~ ^[0-9a-f]{64}$ ]]
  docker pull node:22-bookworm-slim
  image="$(docker image inspect --format '{{index .RepoDigests 0}}' node:22-bookworm-slim)"
  config="$(docker image inspect --format '{{.Id}}' "$image")"
  [[ "$image" =~ @sha256:[0-9a-f]{64}$ ]]
  [[ "$config" =~ ^sha256:[0-9a-f]{64}$ ]]
  opts=(--rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=64m --user "$(id -u):$(id -g)" -e TZ=UTC -e LANG=C.UTF-8 -e HOME=/tmp)
  runtime="$(docker run "${opts[@]}" "$image" node -p 'process.version')"
  arch="$(docker run "${opts[@]}" "$image" node -p 'process.arch')"
  toolchain="$(docker run "${opts[@]}" "$image" sha256sum /usr/local/bin/node | cut -d' ' -f1)"
  kernel="$(uname -srvm | sha256sum | cut -d' ' -f1)"
  execution="$(git show HEAD:.github/workflows/verified-results-shadow.yml | sha256sum | cut -d' ' -f1)"
  external="$(printf '%s' 'offline;no npm install;tracked source archive;TZ=UTC;LANG=C.UTF-8;HOME=/tmp' | sha256sum | cut -d' ' -f1)"
  jq -n --arg image "${image##*@sha256:}" --arg config "${config#sha256:}" --arg node "$runtime" --arg arch "$arch" --arg toolchain "$toolchain" --arg kernel "$kernel" --arg execution "$execution" --arg external "$external"             '{contract:"readonly-offline-container-v2",imageDigest:$image,containerConfigDigest:$config,node:$node,os:"linux",arch:$arch,toolchainDigest:$toolchain,kernelDigest:$kernel,executionContractDigest:$execution,externalInputsDigest:$external}' > "$out/environment.json"
  jq -n --arg repository "$GITHUB_REPOSITORY" --arg commit "$(git rev-parse HEAD)" --arg tree "$(git rev-parse HEAD^{tree})" --arg event "$GITHUB_EVENT_NAME" --arg ref "$GITHUB_REF" --argjson mounted "$(cat "$RUNNER_TEMP/receipt-mount-before.json")" --argjson run "$GITHUB_RUN_ID" --argjson attempt "$GITHUB_RUN_ATTEMPT"             '{repository:$repository,workflow:".github/workflows/verified-results-shadow.yml",ref:$ref,commit:$commit,tree:$tree,event:$event,run:$run,attempt:$attempt,mountedInputs:$mounted}' > "$out/source.json"
  task='{"key":"axis-pals-rules","app":"axis-pals","suite":"rules","kind":"node-test","seed":null,"install":false}'
  
}
run_verified_task() {
  docker run "${opts[@]}" --mount "type=bind,src=$src,dst=/work,readonly" --mount "type=bind,src=$taskout,dst=/work/qa-artifacts" -w /work -e "PW_QA_TASK=$task" -e "EXPECTED_MOUNT_DIGEST=$mounted" "$image" sh -ec '
    node --input-type=module -e "import {mountedFingerprint} from \"./scripts/ci-overhaul/verified-mounted-inputs.mjs\"; const m=mountedFingerprint(process.cwd()); if(m.digest!==process.env.EXPECTED_MOUNT_DIGEST)throw Error(\"Container mount differs from host\"); console.log(JSON.stringify(m))"
    exec node scripts/universal-qa/run.mjs
  '
  node scripts/ci-overhaul/verified-mounted-inputs.mjs measure "$src" > "$RUNNER_TEMP/receipt-mount-after.json"
  cmp "$RUNNER_TEMP/receipt-mount-before.json" "$RUNNER_TEMP/receipt-mount-after.json"
  # Publish only the structured result; discard the raw task log.
  test -d "$taskout/axis-pals-rules" && test ! -L "$taskout/axis-pals-rules"
  test -f "$taskout/axis-pals-rules/result.json" && test ! -L "$taskout/axis-pals-rules/result.json"
  cp "$taskout/axis-pals-rules/result.json" "$out/evidence.json"
  rm -rf "$taskout"
  
}
