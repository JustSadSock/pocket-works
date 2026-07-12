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
8. Regenerate `apps.json` with `npm run registry:build`.
9. Run `npm run health`.
10. Open a pull request and require a successful health workflow.
11. Squash-merge so `main` receives one release commit.
12. Verify that Netlify production is `ready` for the exact squash SHA.

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

1. Revert the single squash commit on `main`, or redeploy the last known-good Netlify deploy.
2. Publish the rollback as a new version rather than reusing the faulty version number.
3. Use a new cache name for the rollback release.
4. Explain the rollback in `changelog`.
5. Run the complete health workflow and verify the resulting production SHA.

A previously installed faulty worker cannot be reliably replaced by publishing different bytes under the same version/cache identity. Version and cache identity must always move forward, including rollback releases.
