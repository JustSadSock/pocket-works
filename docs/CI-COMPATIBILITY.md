# Legacy CI compatibility and metadata migration

`app.config.json` is authoritative. `scripts/sync-app-metadata.mjs` synchronizes
app-owned install metadata and cache identities; Enhanced builds run it before
and after compilation so Vite cannot reintroduce old manifest copy. Cache
rewrites reject another app's namespace and preserve the app's worker logic.
The metadata migration is platform maintenance, not an artistic redesign.

PWA validation follows real local script entrypoints (including reachable
imports), accepts worker registration options and version query parameters,
and requires the actual entrypoints to be cached. A filename other than app.js
is valid when the HTML and offline worker both name the real file. Workbox
workers may use the equivalent explicit app prefix/version namespace.

The pre-existing CI debt at f33aa6a3 is recorded in VALIDATION-DEBT.json for
mobile, managed-update, Workshop/capability and Enhanced source contracts.
These scripts still run every check. Only the exact recorded app-specific
findings are grandfathered; platform/template findings and any new message fail.
`quality-artifacts/validation-debt/*.json` reports remaining, resolved and new
findings and is uploaded by CI. `PW_STRICT_LEGACY=1 npm run validate:all` retains
the full migration-blocking behavior. A passing regression gate does not mean
that the legacy contracts have all been implemented.

Do not expand the ledger to make a PR green. Resolve findings through app-owned
migrations and remove obsolete entries. Newly added apps cannot inherit these
exemptions because their slugs/findings are absent. Platform changes must not
silently migrate the artistic UI of all historical apps merely to install a
new optional capability. Build failures, manifest drift, missing runtime files,
new cache/registration mistakes and browser regressions remain hard failures.

Enhanced typechecking now loads the PWA virtual-module declarations and the
shared JavaScript modules' public types. The three older Babylon configurations
use the template's `skipLibCheck` setting to avoid conflicting DOM/worker and
vendor declaration files; application source still receives strict typechecking.
MELT//CRYPT's TypeScript facade resolves a separately named JavaScript runtime
instead of resolving back to itself. Plain Node assertion suites run under Node,
and SIROCCO's Vitest suite collects only its TypeScript tests. RELIC SIEGE now
checks the actual imported GLB geometry and gameplay audio streams.
