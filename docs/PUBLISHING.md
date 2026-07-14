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
10. Run the affected app checks and `npm run health` when the validation environment is available.
11. Open a pull request that modifies only `apps/<slug>/**` unless it is explicitly a platform change.
12. Squash-merge so `main` receives one release commit.
13. Verify that Cloudflare Workers Builds publishes the exact squash SHA successfully.

## Deployment pipeline invariant

Cloudflare is the primary production host. Its connected build runs:

```bash
npm run deploy:site
```

and deploys the result with:

```bash
npx wrangler deploy --assets ./dist-site/
```

The packaging stage generates `dist-site/apps.json`, prepares `dist-site/` and validates the production directory. Exhaustive engine preparation, GNU Go audits, Enhanced builds, structural validators, unit tests and Forge tests belong to `npm run ci:full` in GitHub Actions.

Do not move heavy safety checks into the Cloudflare production build. Extend GitHub CI instead. The enforceable separation is documented in [`DEPLOYMENT-PIPELINE.md`](./DEPLOYMENT-PIPELINE.md); hosting configuration is documented in [`HOSTING.md`](./HOSTING.md).

Netlify is a legacy fallback only. A Netlify deploy or Netlify PR check is not a release requirement and must not block merges.

## Installed PWA update lifecycle

A new Service Worker downloads and reaches the `waiting` state. It does not call `skipWaiting()` during installation.

The shared update manager:

- detects the waiting worker;
- requests its version, release date and notes through `GET_UPDATE_INFO`;
- shows a visible in-app update prompt;
- leaves the active session untouched when the user chooses **Later**;
- sends `SKIP_WAITING` only after **Update now**;
- waits for `controllerchange` and then reloads once.

This avoids silent mid-session replacement and stale mixed-version interfaces.

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
