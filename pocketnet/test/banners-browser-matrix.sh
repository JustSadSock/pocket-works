#!/usr/bin/env bash
# Ten independent local Workers, real Pocket ID registration, unchanged production limits.
# Sequential: Wrangler uses internal sockets in addition to the external HTTPS port.
set -euo pipefail
wrangler=${1:?Wrangler executable required}
root=$(pwd)
out="$root/test-results/banners-network"
mkdir -p "$out"
scratch=$(mktemp -d)
source pocketnet/test/local-worker-process.sh
cleanup_matrix() {
  local rc=$?
  trap - EXIT
  if worker_stop; then rm -rf "$scratch"; else rc=1; fi
  exit "$rc"
}
trap cleanup_matrix EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
formats=(duel 2vAI 2v1 2v2 3vAI)
projects=(mobile-chromium mobile-webkit)
run_case() {
  local project=$1 format=$2 port=$3
  local name="$project-$format"
  local dest="$out/$name" state="$scratch/$name"
  mkdir -p "$dest" "$state" || return 1
  local url="https://127.0.0.1:$port"
  worker_start "$wrangler" "$port" "$dest/worker.log" --persist-to "$state" --local-protocol https || return 1
  for i in {1..100}; do
    if curl --connect-timeout 1 --max-time 2 -kfsS "$url/pocket-id/config" >/dev/null 2>&1; then break; fi
    if ! worker_group_live && ! kill -0 "$worker_pid" 2>/dev/null; then tail -n 50 "$dest/worker.log"; return 1; fi
    sleep 1
  done
  curl --connect-timeout 1 --max-time 3 -kfsS "$url/pocket-id/config" >/dev/null || return 1
  local file grep
  if [[ "$format" == duel ]]; then file=network-real.spec.ts; grep='two real Pocket ID clients complete and reconnect'
  else file=network-allied.spec.ts; grep="Allied $format independent mobile clients finish and recover"; fi
  echo "BANNERS_BROWSER_START $name port=$port"
  # JSON report is independent of Playwright's cleaned screenshot/trace directory.
  POCKETNET_TEST_URL="$url" PLAYWRIGHT_JSON_OUTPUT_FILE="$dest/report.json" \
    node_modules/.bin/playwright test --config apps/banners-of-war/qa/network-real.config.ts \
      --project "$project" --grep "$grep" "$file" --output "$dest/artifacts" --reporter=line,json >"$dest/playwright.log" 2>&1 || {
        cat "$dest/playwright.log"; tail -n 80 "$dest/worker.log"; return 1;
      }
  node --input-type=module - "$dest/report.json" <<'JS' || return 1
import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
const {expected,unexpected,flaky,skipped}=report.stats;
if(expected!==1||unexpected!==0||flaky!==0||skipped!==0)throw Error('Expected one clean pass: '+JSON.stringify(report.stats));
JS
  cat "$dest/playwright.log"
  echo "BANNERS_BROWSER_PASS $name"
}
# Run every format in each browser, but never start a second Wrangler while the
# previous process group or listening port remains alive. A cleanup failure is
# fatal, because subsequent results would no longer be isolated.
failed=0
passed=0
for i in "${!formats[@]}"; do
  for j in "${!projects[@]}"; do
    if run_case "${projects[j]}" "${formats[i]}" "$((8791+2*i+j))"; then
      passed=$((passed+1))
    else
      failed=$((failed+1))
    fi
    worker_stop || exit 1
  done
done
echo "BANNERS_BROWSER_MATRIX passed=$passed failed=$failed"
test "$passed" -eq 10 && test "$failed" -eq 0
