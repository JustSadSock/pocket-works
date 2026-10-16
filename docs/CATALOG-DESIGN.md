# PocketWorks catalog · 0.12

The launcher is a personal collection of authored applications. Its primary verb
is opening a recognizable app; inspecting, saving and organizing remain explicit
secondary actions. The established slate/green surface and warm clay accent stay.

## Composition and artwork

- Square application marks use a common optical frame and generous spacing.
  Existing app SVGs retain their own art direction; three catalog-specific SVGs
  distinguish the painting cabinet, sentence fragments and video dubbing.
- `shared/catalog-art.js` owns launcher artwork resolution and a small consistent
  system icon set. These overrides do not change app manifests or install icons.
- Screenshots live in a separately expandable detail viewer, with `object-fit:
  contain`. A small curated set of scenic captures can fill a Home feature; form
  screenshots are never used as the identity of a catalog entry.
- Home uses the same widget DOM on desktop and phone. Continue/try and six quick
  launches share the first desktop row; portrait phones expose the secondary
  collections through an explicit button. Short phones use a horizontal feature.
- All launcher dialogs share surface, type, edge, control and backdrop rules.
  Profile card artwork and the mascot studio keep their individual content.

## Interaction contracts

- Artwork opens an app. The separate 44 px details control stays reachable at
  every density. Titles can wrap to two lines without competing with that control.
- Sort, density and multi-select live beside catalog filters. Refresh, update
  checks, diagnostics and backups live in Settings.
- Multi-select uses one manager from both catalog and archive. Administrative
  actions have an explicit personal/global scope; server authorization remains
  the authority, and global changes require their existing confirmation.
- Closing details on desktop releases that space to the collection. A selection
  outside the current filtered view cannot keep an unrelated detail on screen.
- Widget sizes have visual marks, words and a layout preview. Cancelling edits
  preserves the saved layout; drag cancellation and keyboard reordering remain.
- Launch navigation has no decorative timeout. The release handoff records the
  same recent history and return position as ordinary navigation.
- Menu motion takes 180 ms, visible catalog rearrangement 180 ms. Reduced motion
  removes travel. Off-screen entries do not run entrance animations.
- The launcher caches read-only copies of visited app icon resources in its own
  namespace; app caches, saves and account authority remain independently owned.

## Verification

`npm run validate:launcher` covers persistence, migration, release handoff,
offline readiness and social authorization. `playwright.catalog.config.ts` runs
the launcher journeys on desktop, phone, short phone, tablet, landscape and WebKit.
The catalog design journey captures Home, catalog, details, full screenshot,
settings, diagnostics, selection, editor and Pocket ID. It also tests reduced
motion, micro-density details, contextual archive panels and a real app launch
with return history. Existing tests retain bulk archive/pin confirmation and
backup, persistence, drag-cancellation and offline flows.

Run after production packaging:

```sh
npm run deploy:site
npx playwright test --config=playwright.catalog.config.ts
```

Screenshots and traces are written under `quality-artifacts/catalog/`. Compare
against the previous commit at identical viewports and inspect the rendered
frames before publication. Build-generated changes inside app directories are
not part of this platform release.
