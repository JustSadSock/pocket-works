# Pocket Works deployment pipeline rule

This separation is a repository invariant, not an optional optimization.

## Netlify: fast production packaging only

Netlify must run exactly:

```bash
npm run deploy:site
```

`deploy:site` must remain limited to:

```bash
npm run registry:build
npm run prepare:site
npm run validate:site
```

Do not add SENTE preparation, GNU Go audits, Enhanced test suites, Forge tests, `health`, `validate:all`, browser tests or other exhaustive checks to the Netlify command. Netlify's job is to generate the registry, package already-prepared deployable assets and validate the resulting publication directory.

## GitHub Actions: exhaustive validation

The production validation workflow must run:

```bash
npm run ci:full
```

`ci:full` owns engine preparation, AI audits, Enhanced builds, all structural validators, unit tests and Forge smoke tests. Add new expensive safety checks here rather than to Netlify.

## Enhanced application releases

Because Netlify intentionally does not compile Enhanced applications, any change under an Enhanced app's `source/` directory must run `npm run build:enhanced` before merge and include the generated deployable files in the release change set.

## Enforcement

Run:

```bash
npm run validate:pipeline
```

The validator rejects changes that:

- point `netlify.toml` at a heavy command;
- add heavy steps to `deploy:site`;
- remove exhaustive checks from `ci:full`;
- make GitHub Actions use the fast deploy path instead of full CI.

Do not bypass this validator to make a deploy pass. Fix the pipeline while preserving the separation.
