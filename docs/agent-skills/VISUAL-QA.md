# Skill: Visual QA and Screenshot Sign-off

Use after visible implementation and before merge/delivery.

## Required browser feedback loop: Playwright

For any agent who creates or modifies a visible interface, **Playwright screenshots are a required design instrument**, not just regression evidence. Do not decide that an interface is beautiful from code, screenshots imagined from code, or a green CI badge. You must **open the actual captured frames and inspect them**. This rule applies to CSS, Canvas, WebGL, Godot web exports, menus, level visuals, HUDs, and responsive UI.

**Minimum workflow (every material visual change):**

1. **Baseline:** capture the current rendering with the same app state, content, viewport and browser. Preserve the baseline instead of judging changes from memory.
2. **Make a meaningful structural change:** work on shape, layout, object geometry, material behavior, lighting and interaction — not merely hue/gradient/box-shadow changes. Prefer genuine authored geometry/assets for important spatial objects; decorative CSS imitations do not constitute a physical redesign.
3. **Launch Playwright on real app code:** use the relevant app-specific Playwright script, `npm run test:e2e`, or the repository's Universal QA `visual`/`browser-node` suite. Capture the **actual opt-in experimental theme** when a theme switch exists; do not accidentally sign off the classic/default mode.
4. **Capture desktop + phone:** at minimum a real mobile emulation (390×844 portrait or the application's supported target) and desktop (1366×768 or app-specific target). Include a short phone (320×568), tablet, and landscape when layout or clipping risk warrants it. Verify screenshots are from the changed commit, not stale cached assets.
5. **Inspect every screenshot:** actually open the resulting PNG/WebP files with an available image viewer or image-reading tool. Do not substitute log reading, pixel metrics, file existence, or test pass/fail. Compare with baseline for design quality, depth, spacing, silhouettes, typography, usable hit targets and absence of visual noise.
6. **Exercise the real flow:** inspect the first screen, a meaningful interaction, a dense/active state and a result, error or empty state. For motion, use video, tracing or before/after interaction screenshots; one static frame is insufficient.
7. **Write down observed defects, fix root causes, recapture.** If it looks like the previous design with different colors, rewrite geometry or composition instead of adding texture, glows, borders or shadows. Do not declare a redesign finished while a significant defect is visible.
8. **Sign off only on evidence from the final commit.** Include where screenshots/artifacts were stored and what states and viewports were reviewed. Say explicitly when browser execution, image opening or genuine visual inspection was unavailable.

**Using GitHub Actions when the agent has no local browser:**

- Read `docs/UNIVERSAL-QA.md`; choose the app's `apps/<slug>/qa.plan.json` visual suite for automatic desktop/mobile Chromium + WebKit screenshots or its app-owned `browser-node` flow for multiple screens.
- Launch `Universal Pocket Works QA` through `workflow_dispatch` on the correct branch; if the user is the repo owner and issue launch is appropriate, an owner-authored issue titled `[qa] pocket-works` with body `{"app":"zamazka","suite":"real-flow","profile":"deep"}` is a working model **for Zamazka only**. Issue-triggered tests always run on `main`.
- Wait for the actual workflow, fetch its `qa-<app>-<suite>` artifact, extract the screenshots, **open and assess them**, revise and rerun. Check the commit SHA and timestamp. A generated screenshot without review is not evidence of satisfactory craft.
- After triggering a Universal QA run, follow its mandatory ETA protocol and report the real run link with a forecast in the current chat; do not fabricate timing.
- An automated runner cannot certify beauty: it can validate state, geometry, errors and record images. The agent must make the artistic judgment from the rendered output.

## 1. Never sign off from code alone

A green build is not visual validation. Render the real product and inspect screenshots from representative states.

At minimum capture:
- first frame;
- active/typical interaction;
- a dense or stressful state;
- a modal/menu state if present;
- completion/error/empty state where relevant.

## 2. Test target viewports

For mobile-first Pocket Works apps, include the intended portrait/landscape phone size and safe areas. Also test at least one materially different supported viewport when the layout is responsive.

Do not rely only on a desktop browser resized by intuition.

## 3. Use real content

Lorem ipsum, repeated placeholder names and toy values hide layout defects.

Test:
- long labels;
- short labels;
- high/low numbers;
- empty lists;
- maximum visible inventory/resource counts;
- localization-sensitive strings when relevant.

## 4. Audit in passes

### Pass A — composition and hierarchy
Ask:
- where does the eye go first?
- is the primary action obvious?
- are there dead zones?
- is the playfield obscured?
- do groups read without excessive boxes?
- does the screen have a coherent visual rhythm?

### Pass B — craft and defects
Check:
- clipping;
- safe-area collisions;
- blurry canvas;
- stretched assets;
- inconsistent radii/borders;
- weak contrast;
- misaligned baselines;
- accidental scroll;
- overlapping labels;
- broken focus/pressed/disabled states;
- missing loading/error states;
- visual pop-in;
- animation discontinuity.

### Pass C — anti-slop
Check whether the result fell back to:
- gradient/glass/card defaults;
- same layout as recent apps;
- excessive helper text;
- ornamental metrics;
- generic iconography;
- arbitrary glow;
- indistinct typography;
- repeated card geometry.

If yes, fix the dominant cause rather than adding more polish.

## 5. Compare before/after when redesigning

Capture comparable states before and after major visual work. Confirm the change improved:
- hierarchy;
- clarity;
- identity;
- responsiveness;
- perceived quality.

Do not accept "different" as equivalent to "better."

## 6. Limit polish loops

Use bounded review:
1. implementation;
2. one full screenshot audit;
3. batch fixes;
4. one confirmation pass.

If major problems remain, the issue is probably structural and should be redesigned rather than micro-tuned indefinitely.

## 7. Check motion in context

A static screenshot cannot validate:
- easing;
- feedback latency;
- camera feel;
- hit-stop;
- transition continuity;
- gesture conflict.

Exercise the real interaction path and inspect the resulting states.

## 8. Console/network sanity

Visual sign-off also requires:
- no uncaught console errors;
- no missing assets;
- no failed critical requests;
- no stale service-worker behavior masking broken resources.

## 9. Final question

Before merge, ask:

"If the logo/title disappeared, would this still look like this specific product, and would a first-time user understand what to do?"

If either answer is no, the visual work is not done.
