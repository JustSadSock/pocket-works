Original prompt: Игра с довольно фиксированной камерой, 3D, управление машиной и реальными деформациями. Сохранить остальные автомобильные игры.

Selected the existing CRUMPLE YARD for its Rapier collisions, accumulated shell deformation and mechanical damage. Added a fixed world-direction follow camera as the default, with persistent chase/fixed switching in the garage and pause sheet. No other app is changed.

Pending: build, damage regression tests, Chromium/WebKit real driving and visual camera acceptance.
20 unit tests and production build passed. Chromium and WebKit at 390x844 verified driving, turning, pause/resume, camera switching, repair, persisted fixed mode and real collision with impact-wall. Shell deformation ~0.003, engine power 0.729 and steering authority 0.780 after impact; no page errors. Inspected fixed camera and crash screenshots. Remaining: PR CI, landscape/offline coverage, reviewed evidence import.

2026-10-19: Chromium landscape driving/pause passed. Offline acceptance exposed an existing Workbox activation bug: clientsClaim() was registering a listener after activate had already begun. Changed to awaited self.clients.claim(); rebuilding and repeating offline acceptance.

