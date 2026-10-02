# PocketWorks Visual Kit

Small, optional Babylon primitives for consistent lighting, materials and hit feedback. No assets, remote services or global Babylon state. A level owns and disposes its lighting handle.

```js
import { createVisualKit } from '@pocketworks/visual-kit';
import * as BABYLON from '@babylonjs/core';

const visual = createVisualKit(BABYLON);
const lighting = visual.createForestLighting(scene, 'overcast', { fogDensity: 0.8 });
const stone = visual.createSurface(scene, 'stone', { color: '#737d79', roughness: 0.94 });
const cancelFlash = visual.flashHit(targetMesh);
// On level teardown:
cancelFlash();
lighting.dispose();
stone.dispose();
```

For a Vite app add `"@pocketworks/visual-kit": "0.1.0"` to its package dependencies. Cache the resulting app bundle under the app's own Service Worker scope. The module does not force a visual style: values are local decisions from `visual.pw.json`.

The first release covers only these three primitives. Particles, water, terrain, post-processing and compositing need separate performance and mobile screenshots before becoming shared APIs.
