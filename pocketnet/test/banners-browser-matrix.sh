#!/usr/bin/env bash
# Ten independent local Workers, real Pocket ID registration, unchanged production limits.
# Two cases at a time; separate ports, SQLite persistence, browser traces and reports.
set -euo pipefail
wrangler=${1:?Wrangler executable required}
root=$(pwd)
out="$root/test-results/banners-network"
mkdir -p "$out"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
formats=(duel 2vAI 2v1 2v2 3vAI)
projects=(mobile-chromium mobile-webkit)
run_case() (
  set -euo pipefail
  local project=$1 format=$2 port=$3
  local name="$project-$format" pid=""
  local dest="$out/$name" state="$scratch/$name"
  mkdir -p "$dest" "$state"
  local url="https://127.0.0.1:$port"
  cleanup() {
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  "$wrangler" dev --local --ip 127.0.0.1 --port "$port" --persist-to "$state" --local-protocol https >"$dest/worker.log" 2>&1 &
  pid=$!
  for i in {1..100}; do
    if curl -kfsS "$url/pocket-id/config" >/dev/null 2>&1; then break; fi
    if ! kill -0 "$pid" 2>/dev/null; then tail -n 50 "$dest/worker.log"; exit 1; fi
    sleep 1
  done
  curl -kfsS "$url/pocket-id/config" >/dev/null
  local file grep
  if [[ "$format" == duel ]]; then file=network-real.spec.ts; grep='two real Pocket ID clients complete and reconnect'
  else file=network-allied.spec.ts; grep="Allied $format independent mobile clients finish and recover"; fi
  echo "BANNERS_BROWSER_START $name port=$port"
  # JSON report is independent of Playwright's cleaned screenshot/trace directory.
  POCKETNET_TEST_URL="$url" PLAYWRIGHT_JSON_OUTPUT_FILE="$dest/report.json" \
    node_modules/.bin/playwright test --config apps/banners-of-war/qa/network-real.config.ts \
      --project "$project" --grep "$grep" "$file" --output "$dest/artifacts" --reporter=line,json >"$dest/playwright.log" 2>&1 || {
        cat "$dest/playwright.log"; tail -n 80 "$dest/worker.log"; exit 1;
      }
  node --input-type=module - "$dest/report.json" <<'JS'
import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
const {expected,unexpected,flaky,skipped}=report.stats;
if(expected!==1||unexpected!==0||flaky!==0||skipped!==0)throw Error('Expected one clean pass: '+JSON.stringify(report.stats));
JS
  cat "$dest/playwright.log"
  echo "BANNERS_BROWSER_PASS $name"
)
# Pair browsers for the same format. Wait for BOTH and accumulate failures, never
# skip later formats because an earlier case failed. Port assignments are fixed.
failed=0
for i in "${!formats[@]}"; do
  pids=()
  for j in "${!projects[@]}"; do
    run_case "${projects[j]}" "${formats[i]}" "$((8791+2*i+j))" &
    pids+=("$!")
  done
  for p in "${pids[@]}"; do if ! wait "$p"; then failed=$((failed+1)); fi; done
done
echo "BANNERS_BROWSER_MATRIX passed=$((10-failed)) failed=$failed"
test "$failed" -eq 0
