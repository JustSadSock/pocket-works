# CARAPACE FORGE

A tiny Pocket Works comparison game built to make the difference between runtime Babylon.js primitive assembly and offline Blender-authored assets obvious on a phone.

The player controls one crab in a small tide-pool arena. A/B mode swaps the same gameplay state between a deliberately simple Babylon primitive crab and a Blender Asset Forge crab with a modeled shell, articulated armature and authored animation clips. Collect all pearls and use the claw attack while switching modes to compare silhouette, joints, animation and secondary motion directly.

The Blender source is app-local under `asset-forge/`; GitHub Actions generates `public/models/forge-crab.glb` and validates the armature/animations before the app consumes it.
