# TEMPO

TEMPO is a private, offline-first journal for tracking sexual wellbeing, context, experiments and perceived control without turning intimacy into a stopwatch contest.

## Version 1.0 foundation

- quick episode logging with approximate duration bands;
- separate wellbeing check-ins;
- calendar and recent-history views;
- guided technique sessions, including stop–start and interval switching;
- structured tracking for topical products without prescribing a dose;
- trend summaries based on medians and small-sample warnings;
- Markdown and JSON export;
- installable PWA and offline reload.

## Version 1.1 — controlled experiments

The second implementation phase adds a separate local research layer without changing the canonical journal schema:

- one active experiment at a time;
- explicit baseline and intervention groups;
- sample targets of 3, 5 or 7 observations per group;
- target metrics for control, pleasure, satisfaction, repeat desire or anxiety;
- median comparison with direction-aware interpretation;
- warnings when episode type, technique, product or context also changed between groups;
- automatic factor review only when at least three observations exist both with and without a factor;
- custom guided protocols with user-defined steps, cycles and pause length;
- experiment and protocol data in Markdown and JSON exports.

The application deliberately does not claim statistical significance. A result is labelled as insufficient, preliminary or repeating; it remains an observation rather than a diagnosis or proof of causation.

## Storage model

The canonical journal remains in `pocket-works:tempo` and stores:

- `episodes` — sexual or training episodes;
- `checkIns` — libido, energy, mood and spontaneous-response snapshots;
- `techniqueSessions` — guided practice results;
- `products` — user-entered product labels and application notes;
- `exportState` — timestamp of the most recent export;
- `settings` — privacy and display preferences.

The second phase uses the app-owned namespace `pocket-works:tempo:phase2` and stores:

- `experiments` — hypotheses, factors, target metrics, sample goals and status;
- `links` — explicit links between journal entries and baseline/intervention groups;
- `customProtocols` — user-created guided procedures.

Both namespaces are covered by the app-owned reset and diagnostics prefix. No network endpoint, analytics SDK or cloud synchronisation is used.

## Safety boundary

Technique cards are educational trackers, not dosage calculators. Product sessions instruct the user to follow the exact product label, record the active ingredient and stop on unexpected burning, rash, marked numbness or partner transfer. The app does not recommend prescription medicines.

## Files

- `index.html` — application shell and five-section navigation;
- `styles.css` — paper-led mobile visual system;
- `phase2.css` — experiment and custom-protocol surfaces;
- `app.js` — state, interaction, guided sessions and export orchestration;
- `core.js` — canonical journal normalization and summaries;
- `phase2.js` — experiment state, evaluation and combined export;
- `screens.js` — foundation screens and forms;
- `phase2-screens.js` — experiment and custom-protocol UI;
- `protocols.js` — built-in technique definitions;
- `manifest.webmanifest` — standalone PWA identity;
- `sw.js` — app-scoped offline cache;
- `icons/icon.svg` — neutral TEMPO mark.
