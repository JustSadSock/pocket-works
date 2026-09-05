# Анатомия власти

An offline political laboratory for Pocket Works. Change institutions, inspect six factions, and fork a state into two counterfactual histories receiving identical external shocks. No win/loss loop, API keys, network model calls, or external artwork.

## Main loop

1. Choose one of four fictional starting states.
2. Inspect five indicators and their annual causal contributions.
3. Fork history; adjust seven policies separately for A and B.
4. Advance one or five years synchronously. An explicit shock applies to the first year of a five-year batch; subsequent years use the shared seeded sequence.
5. Compare curves, exact values and chronicles. Undo the latest action or export a JSON report.

The diagram is a relationship overview, not a literal causal graph with fitted edge weights. Numeric contributions are in the selected indicator panel. All model assumptions are explained in the Russian “О модели” panel; formulas live in `model.js`.

## Model limitations

This is an authored, fictional system, not an empirically calibrated political/economic forecast. Policies influence prosperity, knowledge, inequality, stability and treasury through deterministic annual equations. Faction influence is normalized. Fast policy changes create a one-year stability penalty. Metric saturation is intentional (0–100, treasury −100–100). There are no hidden coup rolls or regime transitions; crisis headlines describe current indicators.

State is stored under `pocket-works:power-anatomy:session:v1`. Invalid state falls back safely. History retains 201 samples, the chronicle 60 entries, and undo 25 in-memory checkpoints. Maximum session length is 10,000 years. JSON export is an archive, not an import format supported by the UI.

## Files and integration

- `app.config.json`: launcher registration and release identity.
- `model.js`: pure simulation, faction model and saved-state validator.
- `app.js`: UI, branching, persistence and exports.
- `styles.css`: editorial cream/green visual system with an interactive pentagonal anatomy diagram.
- `sw.js`: app-scoped offline shell and managed updates.
- `icons/`: original crown/network symbol, SVG and PNG install icons.

Uses the shared mobile runtime, update manager and Workshop diagnostics. The launcher return link is always visible. No files outside this app are changed.

## Verification

Run from the repository root:

```sh
node --test apps/power-anatomy/model.test.mjs
node --check apps/power-anatomy/app.js
npm run registry:check
```

Six model tests cover immutability/reproducibility, lagged education benefits, independent forks, crisis mitigation, 250-year extreme-policy bounds across all scenarios, and corrupt saves. A separate temporary JSDOM harness verified launch, year advancement, undo, independent sliders, synchronized shocks, chart/journal rendering, cause selection, scenario recovery, diagnostics, persistence and malformed-save recovery.

Repository config/mobile/update validators were run: no power-anatomy findings remain; unrelated existing applications fail the repository-wide checks. Local browser navigation was blocked by the available cloud browser (`ERR_BLOCKED_BY_CLIENT`); visual/mobile and real-browser offline validation could not be completed locally. Do not interpret DOM tests as visual or device verification.
