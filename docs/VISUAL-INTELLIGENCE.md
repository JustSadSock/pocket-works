# Visual Intelligence — Stage I

This is an art-production contract, not a shared theme. Agents author and select
art directions; the tools preserve evidence and expose comparisons. No script
claims to research, understand art, or make an aesthetic judgment by itself.

## Before production

1. Run `npm run visual:memory -- catalog`. Read the newest five entries and inspect
   available images, motion, visual-direction documents and explicit feedback.
   The catalog includes every current app; missing evidence is not a good rating.
   Covers are legacy captures with unknown state/commit, not final proof.
2. Research at least three genuine references. Use source pages and images from
   real games, art or film; record URL, inspection date, visible observation,
   transferable principle, concrete use and what must not be copied. Search
   tools vary by agent environment. If inaccessible, record the blocker and keep
   the brief draft rather than fabricating research.
3. Forge creates `art-bible.json` alongside the compatible v2 direction. Explore
   three concepts that differ in medium, composition, interaction and motion.
   At least three axes must differ per pair; changing names/prose to pass is not
   divergence. Select one and explain why both others were rejected.
4. Plan focal assets: tool, app-relative editable source, distinct export,
   integration, licensing/provenance, byte budget and visible acceptance test.
   List tools with observed availability and fallback when unavailable/unverified.
   This stage does not install or promise functioning editor adapters.
5. Specify viewport, texture/triangle budgets, FPS, observable risks, comparison
   products and initial/action/settled captures. Set ready only after review.

New apps require the Art Bible in the existing creative CI gate. Legacy apps
are grandfathered unless they opt in with a Bible; visible redesigns still
require the existing v2 direction. No mass migration or shared artistic tokens.

## Compare actual images

Install Pillow in the tool environment (CI pins it), then run:

```sh
python tools/visual-intelligence/images.py --output quality-artifacts/comparison covers/horugvi.jpg covers/zastava.jpg covers/miniature-lab.jpg
```

Open `contact-sheet.png` and `comparison.json`. Palette, spatial luminance,
edge distribution, average-hash distance and aspect mismatch are independent
diagnostics. Compare equivalent states and viewports. A low difference suggests
inspection, not rejection; a high difference does not prove quality. Inspect
moving recordings separately. No aggregate beauty score or publication threshold.

## Preserve a real capture and feedback

Use the existing production-like Playwright visual-direction test for captures
and videos. Import selected files after inspecting them:

```sh
npm run visual:memory -- record your-slug /tmp/capture-manifest.json
```

Manifest fields: `commit` (40-character tested SHA), `viewport` ([width,height]),
`engine`, `state`, `action` (actual action), `files` (local image/video paths).
Optional `feedback` has `author` (`user` or `reviewer`), exact `text` and `source`
(conversation link/date or review location). Never convert a reviewer opinion
into a user rating. A capture may contain multiple frames and its video.

Files are copied into the owning app's `visual-memory/` under SHA-256 names;
`memory.json` stores provenance and links feedback to the capture. Reimporting
the same capture is idempotent. Commit reviewed evidence in the owning app PR,
including its motion where material. Do not retain unrelated videos or use
expiring CI artifacts as the only durable history. This foundation does not
mass-import captures into existing apps; release compatibility repairs are
documented separately in CI-COMPATIBILITY.md. The archive becomes richer with
each subsequent app release.

## Acceptance and boundaries

Executable checks reject draft decisions, identical concept axes, missing
research, unknown tool capability without fallback, escaping asset paths and
missing capture provenance. Tests cover real image transformations separately.
The agent remains responsible for actually inspecting references, selecting a
sensible direction, matching the shipped assets to its Bible, and screenshot/
motion review. This foundation cannot guarantee future artistic quality from
text validation alone. Stages II–IV are specified in ART-PRODUCTION-ROADMAP.md.
