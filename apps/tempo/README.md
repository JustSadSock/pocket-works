# TEMPO

TEMPO is a private, offline-first journal for tracking sexual wellbeing, context, experiments and perceived control without turning intimacy into a stopwatch contest.

## Version 1 scope

- quick episode logging with approximate duration bands;
- separate wellbeing check-ins;
- calendar and recent-history views;
- guided technique sessions, including stop–start and interval switching;
- structured tracking for topical products without prescribing a dose;
- trend summaries based on medians and small-sample warnings;
- Markdown and JSON export for later analysis;
- local-only storage under `pocket-works:tempo`;
- installable PWA and offline reload.

## Data model

The canonical local document uses schema version 1 and stores:

- `episodes` — sexual or training episodes;
- `checkIns` — libido, energy, mood and spontaneous-response snapshots;
- `techniqueSessions` — guided practice results;
- `products` — user-entered product labels and application notes;
- `exportState` — timestamp of the most recent export;
- `settings` — privacy and display preferences.

No network endpoint, analytics SDK or cloud synchronisation is used.

## Safety boundary

Technique cards are educational trackers, not dosage calculators. Product sessions instruct the user to follow the exact product label, record the active ingredient and stop on unexpected burning, rash, marked numbness or partner transfer. The app does not recommend prescription medicines.

## Files

- `index.html` — application shell and accessible surfaces;
- `styles.css` — paper-led mobile visual system;
- `app.js` — state, rendering, analytics, guided sessions and export;
- `manifest.webmanifest` — standalone PWA identity;
- `sw.js` — app-scoped offline cache;
- `icons/icon.svg` — neutral TEMPO mark.
