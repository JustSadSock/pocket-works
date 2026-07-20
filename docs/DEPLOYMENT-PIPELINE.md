# Pocket Works deployment pipeline rule

This separation is a repository invariant, not an optional optimization.

## Cloudflare Workers: reproducible production assembly

Cloudflare Workers Builds is the production deployment path. The connected build must run:

```bash
npm run deploy:site
```

and publish the resulting static directory with:

```bash
npx wrangler deploy --assets ./dist-site/
```

`wrangler.jsonc` owns the Worker name, compatibility date and static asset directory.

`deploy:site` must remain limited to:

```bash
npm run build:enhanced
npm run prepare:site
npm run validate:site
```

`build:enhanced` compiles every published Enhanced application and promotes its deployable output into the owning app directory. `prepare:site` then discovers each `apps/<slug>/app.config.json`, generates `dist-site/apps.json` and assembles the deployable directory.

Do not add SENTE preparation, GNU Go audits, Enhanced test suites, Forge tests, `health`, `validate:all`, browser tests or other exhaustive checks to the Cloudflare build. Cloudflare's job is to produce current Enhanced assets, validate the publication directory and distribute the resulting static site.

## GitHub Actions: exhaustive validation

The production validation workflow must run:

```bash
npm run ci:full
```

`ci:full` owns engine preparation, AI audits, Enhanced builds, all structural validators, unit tests and Forge smoke tests. Add new expensive safety checks here rather than to the Cloudflare production command.

When hosted Actions minutes are temporarily unavailable, required status checks may be disabled at the repository ruleset level. This does not change application ownership boundaries or permit mixed app/platform PRs.

## Enhanced application releases

Enhanced source remains the release source of truth. Generated files may still be committed for local inspection and immediate previews, but production no longer depends on them being present or current: Cloudflare always runs `npm run build:enhanced` before assembling `dist-site/`.

## Retired deployment paths

Cloudflare Workers Builds is the only supported hosting path. Repository validation must not read configuration from retired providers, and statuses produced by disconnected or historical integrations must not be required for merge or release verification.

## Enforcement

Run:

```bash
npm run validate:pipeline
```

The validator must preserve these principles:

- `deploy:site` compiles Enhanced apps and then performs focused production packaging;
- generated registry output stays in `dist-site/` and is never committed at the repository root;
- exhaustive validation remains in `ci:full`;
- GitHub Actions does not substitute the production deploy path for full CI;
- `wrangler.jsonc` targets the `pocket-works` Worker and `./dist-site` assets;
- Cloudflare deploys only the validated `dist-site/` assets.

Do not bypass this validator to make a deployment pass. Fix the pipeline while preserving the separation.
