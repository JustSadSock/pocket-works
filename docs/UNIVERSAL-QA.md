# Universal QA — Pocket Works

Shared GitHub-hosted testing with app-owned configurations, intended for agents.
The repository remains public and the workflows do not run on the user's home computer.

## Entry points

Workflow: https://github.com/JustSadSock/pocket-works/actions/workflows/universal-qa.yml

- **Automatic PR smoke:** changes to an application trigger tests for that app only, including generic browser evidence if no manifest exists.
- **Manual deep runs:** GitHub Actions → Universal Pocket Works QA → Run workflow. Set app to a slug, suite to all or a suite id, profile to smoke/deep.
- **Agent-controlled run:** create an Issue as account JustSadSock with exact title **[qa] pocket-works** and JSON body: {"app":"living-history","suite":"century","profile":"deep"}. No arbitrary commands from Issue bodies are evaluated.
- At most 20 task shards in one run; split larger experiments into separate requests. CPU shards run on GitHub-hosted machines (max 20) and browser shards use hosted Playwright image (max 8). GitHub's concurrency limits govern actual throughput.

## Contract for app agents

Every application can opt in by adding apps/<slug>/qa.plan.json. Do not edit .github, package.json or global scripts in an app PR. Changing QA controller is a platform PR and requires the platform-change label.

~~~json
{
  "schema": 1,
  "suites": [
    {"id":"regression","kind":"node-test","files":["model.test.mjs"],"tier":"smoke"},
    {"id":"sweep","kind":"node","entry":"qa/experiment.mjs","tier":"deep",
     "args":["--seed={seed}","--output={output}/metrics.json"],"seeds":[11,29,413,7777]},
    {"id":"visual","kind":"visual","tier":"smoke",
     "viewports":["mobile","desktop"],"ready":"#main",
     "steps":[{"action":"click","selector":"#open-settings"},
              {"action":"visible","selector":"#settings-dialog"},
              {"action":"screenshot"}]},
    {"id":"journey","kind":"playwright","tier":"deep","files":["qa/journey.spec.ts"]}
  ]
}
~~~

Kinds:
- **node-test:** Node native tests, files inside app ending .test.mjs.
- **node:** one app-local .mjs script per seed (or one if no seeds). Scripts should be deterministic and validate CLI flags. Output folder is supplied as {output} plus PW_QA_OUTPUT_DIR; files there become artifacts.
- **browser-node:** .mjs requiring browser runtime, same entry/args/seeds as node, executes in browser container. Works with existing authored Playwright scripts.
- **visual:** captures actual rendered screenshots on mobile/tablet/desktop in Chromium/WebKit, detects HTTP failure, unhandled errors, horizontal overflow. Supports click/fill/visible/screenshot interactions. Screenshots are not automatic aesthetic judgments.
- **playwright:** app-local qa/*.spec.ts or .spec.js with Playwright tests. Shared config starts a preview server and runs Chromium mobile, WebKit mobile, Chromium desktop. Traces, screenshots and videos are uploaded on failure.

Node suites that import npm packages can opt into dependency installation with install: true; dependency-free suites skip npm install for speed.

QA details stay inside the app: test code, selectors, thresholds, experiment seeds and parameters. No shared workflow edit is needed. Without qa.plan.json, discovery uses *.test.mjs files up to two subfolders deep and generic visual capture for apps with index.html.

Tier:
- **smoke:** smoke suites (default), runs automatically on app PR.
- **deep:** includes deep suites, explicitly requested.

Outputs:
- Each task uploads qa-<app>-<suite>[-<seed>] artifact with console.log, result.json and raw measurements/screenshots/traces.
- Separate qa-summary-<run-id> artifact contains SUMMARY.md and summary.json, listing passes/failures/missing shards.
- GitHub Actions Step Summary shows planned jobs and consolidated results.

## Security and limits

- Read-only token (contents: read), no deployment secrets or production writes.
- All QA jobs use GitHub-hosted Linux workers, never home self-hosted runner.
- Issue launches are allowed only for owner as actor and original issue author, exact title, JSON with only app/suite/profile. Never publish secrets in an issue.
- Node runs via spawn, without shell, for existing app-local files; unknown paths and unsafe inputs rejected.
- Application tests are executable untrusted code; these workflows must stay secret-free.
- 45-minute job timeout, max 20 tasks/request; deep opt-in.
- Artifacts retained for seven days, publicly accessible where GitHub makes them available.
- Keep PR checks fast. Do not automatically launch a large seed sweep after every code change.

## Workflow for agents

1. Modify one application inside apps/<slug>/.
2. Add or extend local tests and/or its qa.plan.json.
3. Open an application-only PR; automatic smoke generates logs and browser evidence.
4. For deep tests of unmerged PR code use workflow_dispatch selecting the PR branch in GitHub. Issue event tests main, not PR branch.
5. Read raw data and screenshots; fix defects; rerun. Passing browser smoke does not imply visual sign-off.

For larger experiments, run multiple batches of up to 20 independent shards. Scheduling overhead and service quotas may limit acceleration.
