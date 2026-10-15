# Pocket Deck — launcher and personal collection

The launcher is a native-feeling **installed PWA**, not a replacement game runtime. Existing app manifests, Service Workers, game saves and scoped caches are unchanged.

## Phone home and Pocket ID (0.10.16)

The phone launcher Home now uses the available viewport rather than creating an unnecessary vertical feed. It features one actual playable application, a horizontally scrolling Quick play rail, a prominent Pocket ID action and a More from my shelf toggle that exposes the existing editable/persistent widgets in an independently scrollable area. Library and archive remain vertically scrollable.

Touching a library game cover now **launches it**, matching Home. A separate Details action opens the existing detail drawer. Archive/organization selection is unchanged.

Pocket ID avatar badges reflect **actual** friend requests plus pending game invitations. Pocket Social routes an account-icon tap directly to the relevant requests/invitations screen when needed. A Home Pocket ID action leads guests to account creation and members directly to avatar/profile customization.

Available launcher Service Worker updates do not show a large multi-note banner/receipt. A small indicator on Settings opens an actionable Update now control. Apps keep their existing managed update semantics. No notification is invented when there is no account activity or pending update.

## Focus-first interaction (0.10.15)

The launcher separates the next action from optional information without removing functionality:

- **Home** leads with the currently relevant application, its cover and its Play action. Widget captions and catalogue codes no longer compete with game names.
- **Library** keeps search and Library / Saved / Recent filters visible. **More** contains Offline / Workshop filters, cover density, sorting, organization, refresh, app updates, and settings. When an advanced filter is selected, the More label reflects it; choosing another filter returns it to More.
- **Game details** show name, brief description, Play and Save first. **About this game** reveals version/offline facts, personal project status, notes, release history, and sharing.
- **Pocket Social** shows player card, main friendships and incoming requests; security, storage consumption, outgoing requests and blocked accounts remain available in labeled disclosure sections.
- Destructive personal-shelf reset is found in Settings and requires confirmation. The game data itself remains untouched.

These are native HTML disclosure controls (keyboard accessible, reversible) and do not change app manifests, game saves, personal cloud data or account identity. The project philosophy is *rich presentation, minimal competing decisions*; functional hints and error messages must remain visible when necessary.

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

## Authentic screenshot covers: Pocket Covers Studio

All covers remain **actual screenshots from each game**; no neural image synthesis or promotional fiction.

The `scripts/capture-covers.mjs` GitHub workflow uses isolated mobile Chromium contexts with blocked service workers and no player authentication. It takes five frames by default (configurable 3–8), scores contrast, entropy, edge density, exposure, and focal detail, and publishes only screenshots passing the content gate. It does not click arbitrary buttons or enter online lobbies. If none passes, it keeps the previous image or authentic icon.

A game can expose a **staged gameplay composition** by detecting `?pw-cover=1` and installing the optional API below. Each frame can use a different representative camera/scene configuration:

```js
if (new URLSearchParams(location.search).has('pw-cover')) {
  // Never mutate real saves or interact with a public multiplayer session.
  window.PocketWorksCover = {
    async prepare({index}) {
      await prepareRealPlayableScene(index); // Game-owned, deterministic.
      await waitForSceneToRender();
    }
  };
}
```

The capture runner calls `prepare({index})` for each candidate and captures the real rendered game. A game can set `document.documentElement.dataset.pwCoverReady = 'true'` to indicate it is in a capture-specific composition. **КОМНАТКА** implements the actual Babylon.js room rather than photographing its launcher. Existing games with no staged hook first attempt a bounded two-step, browser-local gameplay entry using a conservative multilingual button classifier (singleplayer, training, art canvas, game start). PocketNet rooms, invitations, account actions, payments, destructive operations, and external navigation are explicitly excluded. Only then does timed candidate sampling begin. Apps can opt in unambiguously with `data-pw-cover-start`.

After a capture-engine improvement, previously failed games are retried once automatically, identified by `captureEngine` in the manifest. For each failed capture, diagnostics include the top candidate's rejection reasons, image-content measurements, and whether gameplay entry succeeded. The workflow retains rejected real screenshots as a short-lived private CI artifact (`cover-failure-diagnostics`) instead of publishing them. This makes repairs possible without lowering the quality bar.

The automatically committed `covers/manifest.json` records each app's last captured Git revision, attempts, evaluation results, and SHA-256. Capture runs after app changes, on the nightly schedule, and through manual workflow dispatch; changed revisions are recaptured even if a previous cover exists. Failed frames and regressions keep the existing published image; rejected revisions retry after a 48-hour cooldown. No manual gallery or extra launcher management screen is necessary.

When `OPENAI_API_KEY` is supplied as an optional GitHub Actions secret, a vision model (`PW_COVER_VISION_MODEL`, default `gpt-4.1-mini`) compares the genuine candidates to the existing cover, penalizes non-gameplay/title/error frames, and chooses the best. Without a secret or when AI review fails, deterministic local image analysis remains functional. AI may **rank/reject** screenshots only; it never generates fictional artwork.

The assembler copies `covers/<slug>.(jpg|png|webp)` to `dist-site/covers/<slug>-<content-sha12>.<ext>`. `covers/index.json` references these immutable paths, so browser and PWA caches cannot return the previous image when the underlying art changes. The Home, Library, and game detail cover loads continue to fall back to the original icon. The cover manifest is metadata, not exposed as user-facing UI.

Quality checks: `npm run test:covers`, `npm run deploy:site`, and mobile Pocket Deck Playwright tests. Optional review decisions are not treated as guarantees of artistic quality.

## Native feel and limitations

The shell uses viewport-aware touch targets, persistent navigation, spatially meaningful press states, focus-safe dialog controls and reduced-motion support. Launch remains a normal same-origin navigation into an independently owned PWA; the app cannot be embedded indefinitely without breaking independent Service Worker scopes.

Installing PocketWorks with Safari **Add to Home Screen** removes normal browser address chrome. The experience remains WebKit/PWA; browser-native swipe gestures, haptic support, background scheduling and system widgets do not become native iOS APIs. The Home widgets are **inside PocketWorks**, not iOS Home Screen widgets.

## Test contract

- `npm run validate:launcher`: state and launcher release invariants.
- `npm run deploy:site`: exact production packaging + existing Godot transport verification.
- `npx playwright test tests/e2e/pocket-deck.spec.ts --project=webkit-mobile-portrait`: start/genre, widget edit and persistence, archive, project note and density.
- Existing launcher stage-two/stage-three tests now intentionally enter Library before exercising legacy interactions.

Captured screenshot images cannot prove visual taste. The first launch, contact sheet, editor and detail sheet should be inspected at phone size in the Playwright artifacts before merging.


## Global archive (administrator-controlled)

The personal archive remains per-device. In addition, `GET /pocket-id/global-archive`
returns the authoritative globally archived game slugs to all visitors, including
guests. The launcher displays the union of global and personal archive entries.
Personal restore never overrides global archive; global restore never undoes a
user's personal archive. Games, saves and source files remain intact.

The global list persists in the SQLite-backed `PocketIdentity` Durable Object.
A server-authorized administrator sees **Archive for everyone** in game details
and bulk organization, and **Restore for everyone** on archived games.
Both actions require confirmation and call `POST /pocket-id/global-archive`
with the current HttpOnly session. Authorization is checked server-side using
the Pocket ID UUID allowlist and matching Origin. Changes reach other online
users on next refresh/focus (at most around 90 seconds while the launcher is
visible). The last successful archive snapshot is cached for offline display;
the cache cannot grant write access.

One-time permission grant: sign into the intended Pocket ID account, read
its `user.id` from `GET /pocket-id/me`, and set `POCKET_ADMIN_ACCOUNT_IDS`
in the Cloudflare Worker configuration to that UUID (or comma-separated UUIDs).
Redeploy the Worker after configuration changes. Neither the public repository
nor browser code contains the administrator UUID or any recovery credentials.
Without a configured UUID, no account can manage the global archive.


### Redeemable administrator role

The owner can now activate a single-use administrator entitlement without
manually configuring `POCKET_ADMIN_ACCOUNT_IDS`. In Pocket Social open the
profile, expand **Аккаунт и безопасность**, select **Настройки Pocket ID**, then
expand **Код активации**. The redeemed role persists on the account and enables
bulk **Archive for everyone** and per-game **Restore for everyone** after
server verification. The existing UUID allowlist remains an optional alternative.


## Home bulk organizer (0.10.19)

Home now has a **Выбрать** action beside Edit. It opens an independent modal
catalogue without scrolling or replacing the ordinary mobile Home. The catalogue
is searchable and includes every game, not just the highlighted Home tiles.
Users can select up to 100 games, select all matching search results, clear the
selection and switch between Library and Archive. Switching sections clears the
selection, preventing invisible games from being changed accidentally.

Actions apply to exactly the selected games: save/unsave favorites (one shelf
write for the batch); move into/restore from the personal archive (with a
reversible confirmation); and for a server-verified Pocket ID administrator,
archive/restore games **for everyone** via the existing confirmed POST API.
Shared archive changes must be acknowledged by the server. Users can cancel
both kinds of confirmation without altering games. The archive view includes
globally and locally archived titles. A personal restore never overrides a
shared archival decision. The selection dialogue scrolls internally and shows
live counts and status without altering the focus-first Home layout.

Browser QA: `tests/e2e/pocket-deck.spec.ts` exercises saving, cancelling,
personal bulk archive/restore and an authenticated-like mocked global batch
request with a single list of game slugs.

## Globally pinned games (administrator-controlled)

Pocket ID administrators may **Pin for everyone** or **Unpin for everyone** from
game details, Library Organize, and the Home **Выбрать** multi-select catalogue.
They use the same authenticated account role as global archive management.
Every write requests confirmation, requires a same-origin session, and checks
the administrator entitlement or server allowlist in the Durable Object;
ordinary users and guests cannot modify pins.

The `PocketIdentity` SQLite `global_pins` table stores the shared set.
`GET /pocket-id/global-archive` includes `pinned` (ordered newest-first)
alongside `archived` and `canManage`. Administrator changes use
`POST /pocket-id/global-pins` with
`{"slugs":["game-slug"],"pinned":true|false}`, up to 100 validated slugs.
The response contains the same shared snapshot. Unpinning preserves each
person's saved games, recent history, archives and game saves.

Globally pinned active games are placed **first in Library**, regardless of
the selected secondary sort. A clear PINNED mark appears on Home and Library
artwork, including the small-cover layout. Home **Quick play** gives pinned
games priority while its main Continue Playing game remains personal.
Globally archived games remain in Archive even if they are pinned.
Online clients refresh the read-only snapshot on focus, reconnection, and
while visible; the last snapshot is cached for offline presentation but
never grants permission to change server state.

Security smoke checks: `pocket-id/test/edge.mjs`; mobile UI, guest access,
bulk pin, unpin, library priority, and confirmation:
`tests/e2e/pocket-deck.spec.ts`.
