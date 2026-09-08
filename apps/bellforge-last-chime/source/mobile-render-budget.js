import { ShadowGenerator } from '@babylonjs/core';

const PATCH_KEY = Symbol.for('bellforge.mobileRenderBudget');

/**
 * Keep the authored city intact while preventing phone GPUs from re-rendering
 * every static street batch into the directional shadow map. Dynamic actors,
 * mechanisms and fallback meshes are never budgeted here.
 */
export function installBellforgeMobileRenderBudget() {
  if (globalThis[PATCH_KEY]) return;
  globalThis[PATCH_KEY] = true;

  if (Math.min(innerWidth, innerHeight) >= 520) return;

  const originalAddShadowCaster = ShadowGenerator.prototype.addShadowCaster;
  const staticCounts = new WeakMap();
  const STATIC_BATCH_LIMIT = 8;

  ShadowGenerator.prototype.addShadowCaster = function addBudgetedShadowCaster(mesh, includeDescendants) {
    const name = mesh?.name || '';
    const isBatchedStaticCity = name.startsWith('BridgeBatch_') || name.startsWith('StaticBatch_');

    if (isBatchedStaticCity) {
      const count = staticCounts.get(this) || 0;
      if (count >= STATIC_BATCH_LIMIT) return;
      staticCounts.set(this, count + 1);
    }

    return originalAddShadowCaster.call(this, mesh, includeDescendants);
  };
}
