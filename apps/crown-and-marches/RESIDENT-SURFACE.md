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
