# Pocket Deck — launcher and personal collection

The launcher is a native-feeling **installed PWA**, not a replacement game runtime. Existing app manifests, Service Workers, game saves and scoped caches are unchanged.

## Surfaces

- **Home** is a personalized, independently scrollable widget composition. Default: Continue, On my shelf and Just made.
- **Library** is a responsive contact sheet with three persisted density modes, the existing search/favorites/recents/offline/experimental filters, and managed refresh/update actions.
- **Archive** hides selected experiments from daily discovery without deleting their source, saves, caches or PWA registrations. Archive is reversible.
- **Project Journey** lives in the existing app detail sheet. Trial, Developing, Keep and Archive are personal labels. Next improvement is editable. A version timeline records only release versions actually inspected by this user, with their real release note; previous versions are never reconstructed fictitiously.

Each page retains a visible bottom-nav route to the others. The layout adapts to a left rail on larger screens. All three modes remain on the same launcher URL and share the same registry and application launch logic. Existing update manager, backup/diagnostics, offline inspector and release badges remain wired to the launcher.

## User widgets

Widget types: Continue, On my shelf, Just made, In progress, Rediscover, Collection by tag, Spotlight by chosen app.

Hold a non-actionable area of Home or select Customize to enter Edit layout. In the editor, move widgets via an explicit up/down control (keyboard accessible) or drag handle; cycle size between Half, Wide and Large; choose the content tag/app for Collection and Spotlight; remove or add widgets. Save commits the new layout; Cancel discards changes. Up to 20 widgets are supported.

The default is useful without configuration. An empty widget displays a meaningful next step rather than fake data. No widget has a network-side effect; all widgets reflect the actual registry, favorites, recents and personal project states.

## Personal storage

- Existing `shared/shelf-state.js` v2 (favorites, recents, search, selection) remains untouched and continues its localStorage + IndexedDB write-ahead path.
- New `shared/deck-state.js` keeps layout, widget configuration, density, archive, personal development notes and observed releases under `pocket-works:deck:v1` with redundant IndexedDB and versioned JSON export/import in Customize.
- Cross-tab storage changes are merged by record timestamp. Invalid widget IDs/types and unsafe project slugs are sanitized. Safari private mode/quota restrictions fail softly.
- No archive or layout operation deletes game data, PWA caches, or the app's repository files.

Export **both** the existing Shelf tools backup and the new Layout export before transferring to another device. Full account-based cross-device sync is not included.

## Authentic screenshot covers

The launcher never invents screenshots. `scripts/prepare-site.mjs` copies `covers/<slug>.jpg/png/webp` into `dist-site/covers` and produces `covers/index.json` referencing only files that exist. A curated CORVUS screenshot already in its repository QA evidence is included as an initial genuine cover.

`scripts/capture-covers.mjs` opens the actual production-like app in Chromium on a phone viewport, captures a JPEG after startup and rejects obvious blank/flat screens. The separately scheduled/triggered `.github/workflows/capture-app-covers.yml` incrementally captures missing apps and commits only the screenshot files, never app code. A failed/not-yet-captured app shows its own original icon, not generated cover art. Captured covers are lazily used by the Home and Library and cached on demand by the launcher Service Worker for offline viewing.

Some interactive scenes need a better manually selected frame rather than an automatic first screen. Re-run the workflow for chosen app slugs after staging the desired scene, or replace the existing cover with a genuinely captured frame. Assets are never presented as game screenshots unless actually captured from that game.

## Native feel and limitations

The shell uses viewport-aware touch targets, persistent navigation, spatially meaningful press states, focus-safe dialog controls and reduced-motion support. Launch remains a normal same-origin navigation into an independently owned PWA; the app cannot be embedded indefinitely without breaking independent Service Worker scopes.

Installing PocketWorks with Safari **Add to Home Screen** removes normal browser address chrome. The experience remains WebKit/PWA; browser-native swipe gestures, haptic support, background scheduling and system widgets do not become native iOS APIs. The Home widgets are **inside PocketWorks**, not iOS Home Screen widgets.

## Test contract

- `npm run validate:launcher`: state and launcher release invariants.
- `npm run deploy:site`: exact production packaging + existing Godot transport verification.
- `npx playwright test tests/e2e/pocket-deck.spec.ts --project=webkit-mobile-portrait`: start/genre, widget edit and persistence, archive, project note and density.
- Existing launcher stage-two/stage-three tests now intentionally enter Library before exercising legacy interactions.

Captured screenshot images cannot prove visual taste. The first launch, contact sheet, editor and detail sheet should be inspected at phone size in the Playwright artifacts before merging.
