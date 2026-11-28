# Geographic synthesis acceptance

No new artistic candidate. Original a36812a artifacts remain the visual acceptance basis. Crop overlap failure was reproduced on deterministic synthetic height arrays in all four modes; this is not a game-art result.

The acceptance-only correction makes the synthesis domain canonical (full known world at 8 samples/cell), independent of camera. This is a deliberately conservative experiment, not a production streaming solution. A 48 MiB LRU holds height buffers by cryptographic digest of all worker inputs plus DEM sample checksums. New snapshots still cost preparation and hashing. Whole-world preparation and worker peak memory must be evaluated before adoption. Camera requests crop the same global field, no per-viewport reassignment of patches or watershed seeds. Baked shadows need 8 cells of padding around each visible crop; no claim of seamless independently baked textures without that halo.

Audit: original overlap vs canonical crop overlap, repeated fresh snapshots, uncached deterministic regeneration, reverse crop order, slope extremes with original renderer screenshots, all four fog modes including derived normals, materials, lighting and final RGBA. Compare simulation serialization and direct map-buffer digests. No change to generator or production renderer.
