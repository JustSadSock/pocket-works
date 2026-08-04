# TEMPO

TEMPO is a private, offline-first journal for tracking sexual wellbeing, context, experiments and perceived control without turning intimacy into a stopwatch contest.

## Version 1.0 — foundation

- quick episode logging with approximate duration bands;
- separate wellbeing check-ins;
- calendar and recent-history views;
- guided technique sessions, including stop–start and interval switching;
- structured tracking for topical products without prescribing a dose;
- median summaries, small-sample warnings and Markdown/JSON export;
- installable PWA and offline reload.

## Version 1.1 — controlled experiments

- one active experiment at a time;
- explicit baseline and intervention groups;
- sample targets of 3, 5 or 7 observations per group;
- target metrics for control, pleasure, satisfaction, repeat desire or anxiety;
- direction-aware median comparison and mixed-factor warnings;
- automatic factor review only when at least three observations exist both with and without a factor;
- custom guided protocols with user-defined steps, cycles and pause length;
- experiment data in Markdown and JSON exports.

## Version 1.2 — mobile UX and privacy

- a single clear next action on the home screen based on the amount of collected data;
- a persistent quick-entry control and larger five-tab mobile navigation;
- weekly median sparklines for control and pleasure;
- journal filters for episodes, wellbeing check-ins and practice sessions;
- compact episode/check-in forms with optional context collapsed by default, scale endpoints and a sticky save action;
- a three-step guide in the experiment creation form;
- print-ready PDF output generated from the current structured report;
- an optional 4–8 digit screen lock stored as a salted SHA-256 hash;
- full encrypted backup and restore using AES-GCM with a PBKDF2-SHA256 passphrase-derived key.

The screen lock is designed to prevent casual viewing in the app. It is not described as storage encryption. Portable backups are separately encrypted and cannot be restored without their passphrase.

## Storage model

The canonical journal remains in `pocket-works:tempo` and stores episodes, check-ins, technique sessions, products, export state and settings.

The experiment layer uses `pocket-works:tempo:phase2` for experiments, entry links and custom protocols. The privacy preferences use `pocket-works:tempo:privacy`. All three keys stay within the app-owned `pocket-works:tempo` prefix and are included in encrypted backups.

No network endpoint, analytics SDK or cloud synchronisation is used.

## Product boundary

TEMPO reports observations rather than diagnoses or proof of causation. Technique cards are educational trackers, not dosage calculators. Product sessions instruct the user to follow the exact product label and stop on unexpected burning, rash, marked numbness or partner transfer.

## Main files

- `app.js`, `core.js`, `screens.js` — journal foundation;
- `phase2.js`, `phase2-screens.js`, `phase2.css` — experiments and custom protocols;
- `phase3-core.js`, `phase3.js`, `phase3.css` — UX, trends, privacy, PDF and encrypted backup;
- `sw.js`, `manifest.webmanifest`, `app.config.json` — offline release metadata.
