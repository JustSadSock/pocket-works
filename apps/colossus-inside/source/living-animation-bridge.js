import { Color3, EngineStore } from '@babylonjs/core';

export function installLivingAnimationBridge() {
  const scene = EngineStore.LastCreatedScene;
  if (!scene) return;

  let interiorMode = '';
  let time = 0;
  let waited = 0;

  const setInteriorMode = (mode) => {
    if (mode === interiorMode) return;
    interiorMode = mode;
    for (const group of scene.animationGroups) {
      if (/\b(Fail|Pulse|Recovered)\b/i.test(group.name)) group.stop();
    }
    const wanted = scene.animationGroups.find((group) => group.name.toLowerCase().includes(mode.toLowerCase()));
    wanted?.start(true, mode === 'Recovered' ? 0.58 : 0.82);
  };

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.04, scene.getEngine().getDeltaTime() / 1000);
    time += dt;
    waited += dt;
    const state = globalThis.__PW_TEST_STATE__;
    if (!state?.ready) return;

    if (state.carrier === 'interior') setInteriorMode(state.repaired ? 'Recovered' : 'Fail');

    // Runtime response layered on top of Blender animation: cables and giant
    // tendons visibly load/unload with each step without replacing authored motion.
    for (const mesh of scene.meshes) {
      const name = mesh.name || '';
      if (/^scale-cable-/.test(name)) {
        mesh.scaling.y = 1 + Math.sin(time * (state.repaired ? 0.8 : 1.15) + mesh.uniqueId * 0.17) * (state.repaired ? 0.018 : 0.045);
      }
      if (/^internal-tendon-/.test(name)) {
        mesh.scaling.y = 1 + Math.sin(time * (state.repaired ? 1.4 : 2.2) + mesh.uniqueId * 0.11) * (state.repaired ? 0.025 : 0.07);
      }
      if (/^sync-core-/.test(name) && mesh.material && 'emissiveColor' in mesh.material) {
        const index = Number(name.split('-').pop()) || 0;
        const locked = (state.sync?.[index] || 0) >= 1;
        mesh.material.emissiveColor = locked ? new Color3(0.08, 0.72, 0.49) : new Color3(0.035, 0.47, 0.39);
      }
    }

    // Expose one compact QA marker so Playwright can assert that the authored
    // animation bridge actually found the Blender actions after async GLB load.
    if (waited > 1) {
      const hasFail = scene.animationGroups.some((g) => /Fail/i.test(g.name));
      const hasRecovered = scene.animationGroups.some((g) => /Recovered/i.test(g.name));
      globalThis.__PW_LIVING_LEVEL__ = {
        ready: true,
        blenderInteriorActions: hasFail && hasRecovered,
        mode: interiorMode || 'exterior'
      };
    }
  });
}
