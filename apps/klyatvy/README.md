# КЛЯТВЫ — Живая хроника

An offline-first mobile political strategy for Pocket Works. Twelve illustrated fiefs, seven sworn houses, two independent marches, dynamic oaths, intrigue, season-based decisions, marching levies, rebellions, and a 16-year campaign.

## Play
Start from the opening royal atlas. Tap territories and inspect houses, negotiate obligations (tax, levies, term and autonomy), drag the royal seal or tap its signing control to offer the charter. Houses can accept or refuse based on their interests; rejection has consequences. Gifts, levies, audits, court reforms, council edicts, war expeditions and event choices shape loyalty, control and treasury. Advance the season to collect dues, resolve politics and military affairs. Win by keeping the crown and kingdom stable for 64 seasons; lose if legitimacy or stability collapses. Touch map mode buttons for de jure / actual / oaths. Archive stores signed charters and events. All gameplay works offline.

## Technical
All app-owned sources under apps/klyatvy; CSS + accessible DOM for documents and popovers, decorative SVG strategic map. No remote assets. Scoped storage key `pocket-works:klyatvy:save-v1`, versioned own SW, shared mobile runtime and update manager. Sound defaults off. `window.__KLYATVY_QA__()` reveals current sanitized state.

## QA
Test first launch, select land, sign charter via tap or drag, request soldiers, advance seasons, resolve incident, review archive, enact reform, conduct campaign on hostile territory, pause/resume and reload with persistence; test 375×812 and 390×844 portrait, landscape fallback, reduced motion, console and offline reload.