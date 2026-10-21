# Port verification — 21 October 2026

Runtime and manifest tested from `b74795eb518e0d83fddf9ce3ca035baedded6179`. Subsequent changes in this release only improve QA capture and preserve reviewed evidence; the displayed app is unchanged.

Passed the complete browser journey on Chromium 390×844, 320×568 and 1366×768, plus WebKit 390×844 and 1366×768. Each viewport checks all ten chapters on both accounts, seasonal hero selection, duo filtering, empty search, the Loki detail dialog, the final development verdict and checklist persistence after reload. Chromium additionally verifies offline reload with an active app-scoped service worker. No page exceptions or failed same-origin critical requests were observed. See `local-result.json`.

Inspected actual first/action/settled frames, progression, duo, recommendation, empty and modal screenshots across these viewports. Also inspected extracted frames of the recorded account-switch interaction. Confirmed readable document hierarchy, working chapter navigation, contained horizontal table scrolling and no page-width overflow. The original report's editorial design is preserved. Optional external hero portraits appear after loading and are absent offline; all evidence remains available.

The initial QA attempt selected an SVG group by its bounding box; the real table button is used in the complete journey. A first CI journey lacked its own preview server; the app-owned runner now starts the repository preview when needed. Python's preview server caused inconsistent service-worker reload timing on Windows; final validation uses the repository's Node preview, matching CI.

App registry, manifest identity, JavaScript syntax and creative metadata pass. Reviewed frames and the short interaction recording are retained with SHA-256 provenance in `../visual-memory/`.

The first full repository CI run additionally failed on existing, unrelated checks: Blockies lacks viewport-fit=cover; Zamazka's host-configured timer test reports "no author shrink feedback at 225". App changes do not alter either product or shared infrastructure. These failures are distinct from this app's own browser validation and must not be represented as a completely green repository health run.
