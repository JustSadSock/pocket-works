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

Exploratory browser QA exposed historical startup failures during the metadata
migration. Runtime `src/spec.js` files are retained by publication policy;
CLADA concatenates exact text fragments without inserting code into tokens;
CHANCELLERY exports its parser error; EMERGENCE LAB's clamp is available during
initialization; PALIMPSEST bounds its animation progress; and RAT tolerates the
removed legacy setup readout and checks the actual shipped plan packet length.
These failures are repaired rather than added to the validation ledger.

Lighthouse evidence also identified a launcher layout shift during late Deck
activation and two accessibility failures. The initial HTML uses its final Deck
layout, density selection updates only buttons (not the HTML root), and the
launcher viewport allows zoom. Lighthouse budgets remain unchanged.

First Service Worker installation no longer reloads an already coherent running
page. Real controller replacements keep the once-per-release reload guard.
Screen Lab resolves version-query requests against its app-owned offline cache.
Legacy catalog tests explicitly navigate from Home to Library before exercising
the catalog, retaining all their assertions.
The reset scenario dismisses the visible release digest through its normal
button before accessing the footer; it still checks both confirmation presses
and persisted favorites without forcing clicks through an overlay.

Sync waits for an activated controller and verifies that first installation did
not reload the page. Browser QA runs all four browser/orientation projects as
separate CI jobs with distinct evidence artifacts, preserving every scenario
and assertion while avoiding a combined 400-case run exceeding the 25-minute
exploratory job limit. Exploratory automation pins both its image and package
to Playwright 1.64.0. The KVARTA scenario stalled on native mouse input under
the old 1.55 runner, while the identical scenario with video enabled completes
in about four seconds under 1.64; no game input or video checks are bypassed.

The full catalog's two backdrop filters per card stalled WebKit's compositor:
JavaScript continued but animation frames and normal input stability checks
stopped. Card actions retain their dark fill without per-card backdrop blur;
images, layout and normal clicks remain intact. PETLYA 17 checks its adaptive
drawing buffer against the actual viewport and the supported 1–2 scaling budget
instead of assuming a fixed pixel count. SENTE migration fixtures are installed
before boot so a running game's pagehide autosave cannot overwrite legacy data.
