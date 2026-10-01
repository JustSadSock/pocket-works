# Skill: Visual QA and Screenshot Sign-off

Use after visible implementation and before merge/delivery.

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
