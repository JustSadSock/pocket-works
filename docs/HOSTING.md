# Pocket Works hosting

Pocket Works production is deployed through **Cloudflare Workers Builds** from the private GitHub repository.

## Primary production pipeline

- Connected repository: `JustSadSock/pocket-works`
- Production branch: `main`
- Non-production branch builds: disabled
- Build command: `npm run deploy:site`
- Deploy command: `npx wrangler deploy --assets ./dist-site/`
- Worker configuration: `/wrangler.jsonc`
- Static asset directory: `dist-site/`

Each squash merge into `main` triggers a Cloudflare build. The build assembles and validates the complete static publication directory, then deploys it as Worker static assets.

## Configuration contract

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

## Deployment responsibilities

Cloudflare is responsible for production packaging and distribution, not exhaustive quality assurance.

The Cloudflare build runs:

```bash
npm run deploy:site
```

That command must remain limited to assembling `dist-site/`, generating `dist-site/apps.json` from application manifests and validating the deployable output.

GitHub Actions owns exhaustive validation through:

```bash
npm run ci:full
```

When GitHub-hosted Actions minutes are unavailable, required status checks may remain disabled temporarily. Application PRs must still respect the isolated `apps/<slug>/**` boundary and document their targeted checks.

## Netlify status

Netlify is no longer the primary deployment target. Existing Netlify configuration and historical deploys may remain temporarily as a legacy fallback, but:

- Netlify checks must not block merges;
- agents must not describe Netlify as production;
- new deployment work must target Cloudflare Workers;
- the current production source of truth is the latest successful Cloudflare deployment from `main`.

## Rollback

Prefer reverting the faulty squash commit on `main`. Cloudflare will publish the resulting commit automatically.

A release rollback must still advance application version and cache identity. Do not publish different bytes under an already released Service Worker cache version.
