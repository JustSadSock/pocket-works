# Pocket Works publishing and rollback

Every application release is one coherent change set. Do not publish a half-finished directory, a version without matching cache metadata, or a changelog that does not describe the released behavior.

## Release checklist

1. Work on a dedicated branch.
2. Finish the application change inside its own directory.
3. Increment `version` in `app.config.json`.
4. Set `releaseDate` to the release date in `YYYY-MM-DD` format.
5. Replace `changelog` with concise user-visible notes for that version.
6. Change `cacheName` so it ends with the new version.
7. Mirror version, date and notes in the application Service Worker.
8. For an Enhanced application, run `npm run build:enhanced` and include its generated deployable files.
9. Validate manifests with `npm run registry:check`; do not commit a root `apps.json`.
10. Run `npm run pocketnet:check`, the affected app checks and `npm run health` when the validation environment is available. If server rules changed, run `node scripts/build-pocketnet-modules.mjs --snapshot` first and commit the new pinned version and lock atomically.
11. Open a pull request that modifies only `apps/<slug>/**` unless it is explicitly a platform change.
12. Squash-merge so `main` receives one release commit. Never push intermediate development steps straight to `main`; use an expedited but tested PR for emergency fixes.
13. Verify that Cloudflare Workers Builds publishes the exact squash SHA successfully.

## Deployment pipeline invariant

Cloudflare is the production host. Its connected build runs:

```bash
npm run deploy:site
```

and deploys the result with:

```bash
npx wrangler deploy --assets ./dist-site/
```

The packaging stage generates `dist-site/apps.json`, prepares `dist-site/` and validates the production directory. Exhaustive engine preparation, GNU Go audits, Enhanced builds, structural validators, unit tests and Forge tests belong to `npm run ci:full` in GitHub Actions.

Do not move heavy safety checks into the Cloudflare production build. Extend GitHub CI instead. The enforceable separation is documented in [`DEPLOYMENT-PIPELINE.md`](./DEPLOYMENT-PIPELINE.md); hosting configuration is documented in [`HOSTING.md`](./HOSTING.md).

No retired hosting integration is part of the release contract. Production verification is based only on the Cloudflare deployment generated from the squash commit on `main`.

## Installed PWA update lifecycle

**Production rule: application updates are applied at a document boundary, never
in the middle of an open game or PocketNet room.** A new release must not
reload the active document, replace it after `controllerchange`, or delete
its app cache while another tab is using it.

- The launcher **Check updates** action refreshes the registry and reads installed
  worker metadata. It does **not** call `registration.update()` or `SKIP_WAITING`
  for open applications. Outdated releases are reported as **on next launch**.
- A normal launch from **Home** or **Library** carries the published fingerprint.
  If the observed/verified release differs, the launcher replaces a stale
  registration and its app-scoped cache before navigation, provided the device
  is online and no other app document reports itself open.
- Production `shared/release-guard.js` checks `release.json` during gameplay,
  on return to the tab and after controller changes. It records a pending
  release but **never reloads that live document**.
- On the **next document entry**, the guard consumes a pending release and
  performs one bounded recovery if necessary. It preserves the current offline
  copy while disconnected, and avoids cache eviction when another tab of the
  same app is active. Only the new document gets the new release.
- The shared managed/enhanced update managers defer to the production guard.
  Older standalone app builds without that guard can retain their own opt-in
  update prompts until migrated.

This separation preserves a live game's network session even if a release is
published, a browser resumes the tab or the launcher checks all applications.
Client/server multiplayer compatibility must still be maintained across
published releases; the updater is not a substitute for protocol versioning.

## Cache ownership

Every application owns only caches beginning with its slug prefix. The launcher owns only `pocket-works-launcher-*` caches. Activation may delete obsolete caches inside that namespace and must never remove another application's data.

## Rollback

To roll back a faulty release:

1. Revert the single squash commit on `main`.
2. Let Cloudflare publish the resulting `main` commit automatically.
3. Publish the rollback as a new application version rather than reusing the faulty version number.
4. Use a new cache name for the rollback release.
5. Explain the rollback in `changelog`.
6. Run the complete `npm run ci:full` workflow when available and verify the resulting Cloudflare production SHA.

A previously installed faulty worker cannot be reliably replaced by publishing different bytes under the same version/cache identity. Version and cache identity must always move forward, including rollback releases.
