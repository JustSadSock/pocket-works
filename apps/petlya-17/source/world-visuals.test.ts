import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { VisualRig } from './world-visuals';

describe('Petlya 17 car mesh startup', () => {
  it('builds actual opponent geometry without undefined Babylon helpers', () => {
    const engine = new NullEngine({ renderWidth: 640, renderHeight: 360 });
    const scene = new Scene(engine);
    try {
      // createCar only depends on the scene; avoid constructing camera render
      // targets in a headless test. This exercises the same hull generator
      // used both for the menu prototype and all five opponent vehicles.
      const rig = Object.assign(Object.create(VisualRig.prototype), { scene }) as VisualRig;
      const shadows = { addShadowCaster: () => undefined } as unknown as ShadowGenerator;
      const car = rig.createCar(
        'startup-smoke', new Color3(.88, .32, .16), new Color3(.94, .81, .57), 0, shadows
      );
      expect(car.wheels).toHaveLength(4);
      expect(car.root.getChildMeshes().length).toBeGreaterThan(20);
      expect(scene.getMeshByName('startup-smoke-monocoque-0')).not.toBeNull();
      car.root.dispose(false, true);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
