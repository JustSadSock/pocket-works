#!/usr/bin/env bash
# Download from a single immutable protected-main issuer. Never obtain write credentials.
set -euo pipefail
dest="$1"
attempt="$(node scripts/ci-overhaul/universal-cross-delivery.mjs source-attempt)"
[[ "$attempt" =~ ^[0-9]+$ ]]
mkdir -p "$dest/raw" "$dest/receipts"
gh run download 46020376393 --repo "$GITHUB_REPOSITORY" --name "universal-receipts-$attempt" --dir "$dest/receipts"
gh run download 46020376393 --repo "$GITHUB_REPOSITORY" --pattern "universal-cross-proof-$attempt-*" --dir "$dest/raw"
