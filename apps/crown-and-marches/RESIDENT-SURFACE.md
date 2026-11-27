# Resident World Surface — qualification, not release

Origin: 463d7a4, artifact 15170782443. The two modes remain available; Copy is the default. Resident is accessible only through the localhost atlas-review API. It is not a published production renderer.

## Geometric proof
For a world point (x,y,z), fixed tilt t, c = sqrt(1-t²), camera center (X,Y), physical scale S and framebuffer viewport V:
- Px = Vx + Vw/2 + S(x-X)
- Py = Vy + Vh/2 - S((y-Y)c-(z-datum)t)
- clipZ = -((y-Y)t+(z-datum)c)/160

For identical scale/tilt/datum, a camera displacement shifts every projected point by a constant; the depth difference is constant and the depth order is unchanged if neither camera clips geometry. The source crop is (pad + SΔX, pad - ScΔY). Noninteger offsets, changed scale, region, LOD, knowledge or insufficient coverage cannot be cropped from the same raster. The isolated Node test verifies 3,600 projections, edge limits, fractional rejection, scale invalidation, and depth clipping guards. Floating-point shader arithmetic, antialiasing, derivatives, dithering, and depth quantization may still invalidate pixel equivalence. A geometric proof is not a raster proof.

## Prototype
RGBA8 texture plus depth buffer, 96 physical-pixel padding, nearest GPU framebuffer blit at unchanged raster phase. Bounded LRU: 48 MiB nominal attachment bytes, six entries maximum; actual driver memory overhead is not observable through WebGL. Region change disposes the GPU bank; adaptive motion LOD and restricted knowledge use fresh rendering. No readback or gl.finish in continuous motion loops. Separate diagnostic readback compares resident vs original raster with no pixel tolerance. If GPU evidence fails, do not enable the mode outside review.

## Architecture
WebKit integer translation does not always match fresh. Use a bounded exact-pose bank (32 MiB/eight entries, one current terrain identity) instead of translating raster output. It does not claim spatial translation reuse. Height queries memoize exact coordinate pairs for the current terrain and LOD (32,768 entries), without rounding; geometry and model assets remain unchanged. Canonical path commands or world-aligned tiles remain research alternatives, not claimed implemented. The legacy integer and fractional paths remain diagnostic controls.

## QA and limitations
All three modes use the same seed, DEM, camera path, assets and exact-pose architecture policy. Three 60-input sweeps per combination (two profiled, one unprofiled). Separate eight discrete poses and cold/zoom checks. Resident runs seven direct raster comparisons, portrait/fog mutation and context loss fallback. Browser screenshots and actual raster diffs are saved outside measured loops. Timer query execution is null when unavailable. RAF and paired-surface tokens are evidence of rendering opportunities, not hardware scanout; browser composition cost is not independently observable via portable Web APIs. Capture actual GPU identity; never infer hardware acceleration from engine name. Existing WebKit Apple GPU evidence is not transferable to other runners.

## Stabilization experiments (unqualified)
The original allocate/delete policy remains the control and the default. Review-only recycle reuses an evicted, same-size color/depth/framebuffer allocation without changing LRU or raster phase; prewarm reserves up to the same entry and 48 MiB attachment budget. Free allocations count toward both limits and are deleted on region/knowledge/context reset. Allocation/submit timings are CPU observations, not GPU duration. No performance winner or pixel-equivalent renderer is claimed until browser evidence exists.

Separate smoke browser suites run seven Organic configurations per engine, 300 inputs each (six 50-input segments), independent contexts, fixed seed, original 60-input matrix untouched. Raster probe isolates default versus equal-size offscreen, padded build, blit and integer hit, with dither on/off as a diagnostic only. GPU completion waits are measured outside the continuous motion loops; browser composition is not independently observable. All strict gates remain open until the actual evidence passes.

Pad 64/96/128 and 4/6 slots are compared separately; phase-diverse eviction remains experimental. The default remains LRU. Counters distinguish preallocated slot consumption, actual reassignment, rejected raster phase and insufficient padding. Exact-pose counts use the current frame's actual architecture hit bit, not a historical cumulative counter.

## QA admission recovery
16 suites: existing wealth and sinews shards share a seed dispatcher (0–1 wealth, 2–3 sinews); Resident uses one suite with eight independent browser tasks. Seeds 0–3 Chromium, 4–7 WebKit; each four-group matrix runs configs [0,1], [2,3], [4,5], [6], preserving all seven contexts per engine and 4,200 inputs. Research tasks fail for incomplete/invalid evidence or memory violations; measured speed, raster mismatches, missing reuse and frame delivery are explicit qualification failures, not hidden by successful evidence collection. The unchanged original geography gate remains strict. No policy is selected and no release qualification is implied by research task success. Selection and full selected-policy acceptance require actual cross-browser evidence.

## Presentation evidence recovery
RAF sampling used to observe the next draw's preview before its delayed receipt was published. Review input IDs now correlate immutable request, raster submission, paired overlay, next-frame opportunity and current committed receipt. A bounded journal records replacement and missed inputs; fixed three-RAF drain occurs only after each continuous segment. Node-side replay computes delivery FPS/P95 independently; raster resource counts are independent of delivery. Physical scanout and GPU completion are not inferred. All 14 long contexts and 18 original contexts remain registered. Five additional diagnostic raster comparisons per long context use a constant expanded viewport extent and integer viewport displacement with an unchanged world anchor; stable Fresh vs original is reported separately, never substituted for original strict qualification. No policy is selected.
