# Visual QA runner

Build the site with `npm run deploy:site`, then run `npm run pw:visual-test -- <slug>`. The runner opens the production-like preview in Chromium and WebKit at fixed portrait and landscape mobile sizes. It saves PNGs, a standalone SVG contact sheet and `report.json` under ignored `quality-artifacts/visual/<slug>/`. It reports console errors, failed requests, interactive controls outside the viewport, undersized targets and document overflow. A nonzero exit code indicates console, request or control clipping problems. Review the screenshots **visually**; these heuristics cannot judge composition, excessive darkness in a canvas, identical materials or z-fighting.

An app can define `apps/<slug>/visual-scenes.json` to capture more than launch:

```json
{
  "version": 1,
  "scenes": [
    { "name": "initial" },
    { "name": "playing", "steps": [
      { "action": "click", "selector": "[data-test=start]" },
      { "action": "waitFor", "selector": "[data-test=game-canvas]" },
      { "action": "pause", "ms": 400 }
    ] }
  ]
}
```

Each scene begins at the app's entry URL. Selectors should be stable and representative of the real user flow. `path` can target another route inside the same app. An app may publish `window.__PW_VISUAL_METRICS__` with draw calls and texture memory; the runner records it verbatim without inventing metrics. Inspect renderer diagnostics separately where unavailable. The runner blocks Service Workers for deterministic screenshots; offline lifecycle QA remains in the existing Playwright suite.

Use `--url http://127.0.0.1:4173` if a preview is already running. The command requires local Playwright browser binaries (`npx playwright install chromium webkit`); CI should provision both before invoking it.

The `Visual Pipeline` PR gate runs these checks and captures a fixed mobile smoke sheet from Screen Lab. It validates the runner in CI; each consuming game must still supply its own meaningful scenes and inspect its own outputs.
