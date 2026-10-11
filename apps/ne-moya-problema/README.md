# НЕ МОЯ ПРОБЛЕМА

Party game in Pocket Works. Quick PWA, portrait layout, 3–8 people around **one shared phone**, full offline support after the first install.

## How to play
1. Open the bureau, set 3–8 player names, start a three-incident session.
2. Hand the device to the named player. They reveal their private role and decide between three orders.
3. When everyone has decided, the shared room displays consequences and collective safety/budget/reputation.
4. Players privately accuse one colleague, passing the phone between accusations.
5. Reveal the culprit, orders, personal goals and scores. Repeat with rotating roles for three incidents.
6. The finale ranks all players, including draws.

## Mechanic
Eight rotating offices, each with three decisions, three shared metrics and one private goal. The biggest adverse action wins the 'main culprit' label; blame +2 if correct, -1 if false. Completing role goal +3; choosing major rescue +1; main culprit -1. Three selected cases are shuffled from six authored incidents. No player elimination.

All interaction state (roster, current turn/phase, decisions, accusations, ongoing standings) is saved to `pocket-works:ne-moya-problema:session:1`. Reload resumes. Audio is opt-in, synthesized locally. There is no pretend online room: the initial release is explicitly **local pass-and-play**. Each participant should keep private instructions hidden while holding the device.

## Design
Visually, a tilted illustrated miniature office occupies the upper part of the phone. All player interaction happens on a physical-feeling docket below; secret envelopes hide roles between people. Colors are institutional green, dusty cream and rusted orange. SVG scene geometry and illustration are local code; no remote images or generated filler. Three second-order scenery effects (hazard, papers, office lamps) accompany consequences.

## QA
- Test play with 3 and 8 names, all stages, repeated fast selection, wrong/right accusation, draws, reload mid-vote, reset confirmation, safe areas, small-phone scrolling and reduced-motion.
- Run `node --test apps/ne-moya-problema/data.test.mjs`.
- Run repository production-like mobile checks and inspect Playwright captures before release.
- App code only modifies `apps/ne-moya-problema/**`.
