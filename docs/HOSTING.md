# Pocket Works hosting

Pocket Works production is published through Cloudflare Workers Builds.

## Production contract

- Worker: `pocket-works`
- Production branch: `main`
- Non-production branch builds: disabled
- Build command: `npm run deploy:site`
- Deploy command: `npx wrangler deploy --assets ./dist-site/`
- Worker configuration: `wrangler.jsonc`
- Static asset directory: `dist-site/`
- Production source of truth: the latest successful Cloudflare deployment from `main`

## Build sequence

```text
push or squash merge to main
→ Cloudflare clones the repository
→ dependencies are installed
→ npm run deploy:site
→ dist-site is assembled and validated
→ Wrangler publishes dist-site to the pocket-works Worker
```

`npm run deploy:site` performs only production packaging:

```bash
npm run prepare:site
npm run validate:site
```

The build generates `dist-site/apps.json` from app-owned `app.config.json` files. The registry is not committed at the repository root.

## Worker configuration

`wrangler.jsonc` must retain:

```json
{
  "name": "pocket-works",
  "compatibility_date": "2026-07-14",
  "assets": {
    "directory": "./dist-site"
  }
}
```

Advance `compatibility_date` only as an explicit platform change after verifying the current Worker runtime behavior.

## Validation responsibilities

Cloudflare production packaging verifies that deployable assets can be assembled. Exhaustive validation remains a GitHub CI responsibility:

```bash
npm run ci:full
```

Do not move engine audits, full Forge smoke tests, Playwright or Lighthouse into the production deployment command.

When GitHub-hosted Actions minutes are unavailable, required status checks may remain disabled temporarily. Application PRs must still respect the isolated `apps/<slug>/**` boundary and document their targeted checks.

## Deployment verification

After a squash merge:

1. find the build for the exact `main` commit;
2. confirm the build and deploy stages succeeded;
3. open the Worker URL;
4. verify the launcher and affected application;
5. confirm the installed PWA offers the expected versioned update.

## Rollback

Revert the faulty squash commit on `main`. Application rollback releases must still increment their version and cache identity. Cloudflare then publishes the new revert commit through the same production path.
