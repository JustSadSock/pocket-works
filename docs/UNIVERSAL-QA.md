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
- **visual:** captures actual rendered screenshots on mobile/tablet/desktop; Quick apps are served directly from their isolated source directory, enhanced apps require their production build in Chromium/WebKit, detects HTTP failure, unhandled errors, horizontal overflow. Supports click/fill/visible/screenshot interactions. Screenshots are not automatic aesthetic judgments.
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

## Required visual review by app/visual agents

Visual agents must use **Playwright to see what they actually built**. For any visible change, capture a baseline, render the changed commit, download/open the screenshots from the `qa-<app>-<suite>` artifact and visually compare at least desktop and mobile. Inspect the first frame, active interaction and result; check actual geometry, lighting/materials, clipping, contrast and visual noise. Record concrete defects, fix them and rerun. A successful GitHub Actions job is not enough. Check `docs/agent-skills/VISUAL-QA.md` for the full mandatory protocol.

An app-owned `visual` suite captures entry states and scripted clicks; an app-owned `browser-node` Playwright script can switch the experimental theme, execute a full scenario and save meaningful screenshots with `PW_QA_OUTPUT_DIR` or an app-specific artifact directory. **A visual suite that captures only the classic/default appearance cannot validate an experimental redesign.** Issue-triggered runs check `main`, while `workflow_dispatch` can check an intended branch. Always check the run's head SHA and read screenshots rather than relying on job success.

## Workflow for agents

1. Modify one application inside apps/<slug>/.
2. Add or extend local tests and/or its qa.plan.json.
3. Open an application-only PR; automatic smoke generates logs and browser evidence.
4. For deep tests of unmerged PR code use workflow_dispatch selecting the PR branch in GitHub. Issue event tests main, not PR branch.
5. Read raw data and screenshots; fix defects; rerun. Passing browser smoke does not imply visual sign-off.

For larger experiments, run multiple batches of up to 20 independent shards. Scheduling overhead and service quotas may limit acceleration.


## Agent protocol: immediately announce the expected completion time

**Mandatory after every agent-initiated Universal QA run, including deep sweeps and UI tests.** Do not silently start an action and wait for it to complete. Once GitHub has created the actual workflow run, post a compact message **in the user's current chat** with its link, start time, approximate local completion clock time and uncertainty. This is a forecast, not a promise or an automatically scheduled message.

### How to obtain the estimate

1. **Trigger and identify the real workflow run.** Record its numeric GitHub Actions run ID from the new run (not the Issue number or job ID). Distinguish a run on main from a PR-branch run.
2. **Read authoritative timestamps.** GitHub Actions run \`created_at\` indicates when the request entered GitHub's queue. \`jobs[].started_at\` indicates actual runner execution; do not conflate the two. A job is not started merely because the run's status says \`queued\`. For an exact ETA inspect the REST API run and run-job endpoint, not just the shell script's execution log.
3. **Estimate duration using evidence.** Prefer 2–8 prior successful runs of the **same app + suite + job kind + installation requirements** and, when possible, the same number of shards. Use an upper historical percentile (about P80), not the fastest run. Account for runner startup, optional dependency installs, Playwright browser startup, upload and summary time. For *parallel* batches the workflow ends when the slowest shard and aggregation finish: **do not multiply one shard's duration by 16 or 20**. If no comparable data is available, label the estimate rough and use the test-kind fallback.
4. **Calculate a clock time.** Base the forecast on the actual run request/queue timestamp and observed job start times, then format it in the **user's current local timezone** (default for the Ukrainian workflow: \`Europe/Kyiv\`, with DST). Use an explicit calendar date when the predicted finish is after midnight. Never present a past clock time for an unfinished test; if the previous forecast has expired, recalculate using the current running/queued jobs.
5. **Report in chat immediately** after the run can be identified and its task matrix becomes visible. Include both the central ETA and a reasonable interval, or state clearly that GitHub has not exposed enough information yet. Do not misrepresent the request timestamp as the moment all 16 jobs actually started. If a check fails early, report failure rather than an ETA.
6. **On the next interaction or when explicitly asked**, refresh the status/ETA. Chat messages cannot be delivered later without a separate, explicitly requested scheduling/notification mechanism; neither the GitHub workflow nor these instructions autonomously send a later ChatGPT message.

### Built-in estimator for agents with a shell

Use the zero-dependency, read-only tool in the repository after acquiring the **actual run ID**:

~~~bash
node scripts/universal-qa/eta.mjs --run=38641936470 --tz=Europe/Kyiv
~~~

For structured output:

~~~bash
node scripts/universal-qa/eta.mjs --run=38641936470 --tz=Europe/Kyiv --json
~~~

The script queries GitHub Actions REST API for the workflow's run, tasks and recent comparable successful runs. It uses actual \`created_at\`, \`started_at\`, \`completed_at\` timestamps. The current workflow state determines whether it reports a predicted finish, the actual completion time, or **"awaiting-job-matrix"**. It returns a wider interval when estimates are based on fallbacks. It does not submit any write requests to GitHub and does not start tests. Public repositories work without a token within GitHub's anonymous rate limit; \`GITHUB_TOKEN\` can be provided for authenticated read access. If GitHub rate-limits or fails to return timestamps, say so rather than invent a completion time.

Agents without terminal access can use the connected GitHub repository reader / read-only REST endpoints:
- \`GET /repos/JustSadSock/pocket-works/actions/runs/{run_id}\`
- \`GET /repos/JustSadSock/pocket-works/actions/runs/{run_id}/jobs?per_page=100\`
- \`GET /repos/JustSadSock/pocket-works/actions/workflows/universal-qa.yml/runs?status=completed&per_page=20\`

Use the same estimation logic and report in the chat. **An ETA in a GitHub job summary is not a chat notification; the agent itself must write to the current conversation.**

### Example chat update (illustrative times, not live measurements)

> Запустил Universal QA для «Живой истории»: 16 параллельных симуляций по 100 лет.
> 
> Заявка создана в 01:32, выполнение началось в 01:33 (Киев). **Ожидаемое окончание — около 01:45**, возможный диапазон 01:42–01:51. Это оценка по предыдущим похожим прогонам.
> 
> GitHub Actions: ссылка на конкретный запуск.

If the run is not started, say “в очереди GitHub” and only give an approximate completion range if there is credible historical evidence. If the history is sparse, state explicitly that confidence is low. A falsified precise time is worse than a clearly stated wide range.
