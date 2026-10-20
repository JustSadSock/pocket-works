# Known limits and release review — version 1.3.0

This release focuses on visually authored moving/detaching components and richer environment geometry while retaining the existing Rapier vehicle and deformation physics.

- The improved vehicle shapes remain deterministic procedural meshes, not hand-sculpted photoreal CAD or continuous finite-element crash simulation.
- Small detail meshes are visual only; the physical hull is a compact Rapier cuboid. Decorative bodies do not create hidden collision surfaces.
- Glass is a tinted, non-detachable overlay. Separate windshield/side-window crack geometry and internal cabin damage remain future craft opportunities.
- The paint distress and geometry deformation are persistent for a vehicle until repair, not permanently saved across reloads.
- Performance on low-memory WebKit devices, prolonged repeated crashes and detachment behavior require independent rendered QA evidence before claiming a fully verified art release.
- qa.plan.json now specifies garage, drive and pause screenshots. Review the actual images rather than trusting build exit status alone.
- Mini Car 3D and every other Pocket Works application were deliberately left unchanged.
