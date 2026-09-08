import { EngineStore } from '@babylonjs/core';
import { installColossusVisualOverhaul } from './colossus-visual-overhaul.js';
import { applyColossusVisualSafety } from './colossus-visual-safety.js';

export function installColossusVisualOverhaulWhenReady() {
  const scene = EngineStore.LastCreatedScene;
  if (!scene) {
    requestAnimationFrame(installColossusVisualOverhaulWhenReady);
    return;
  }

  const ready = () => Boolean(
    scene.getTransformNodeByName('carrier-back') &&
    scene.getTransformNodeByName('carrier-shoulder') &&
    scene.getTransformNodeByName('carrier-head')
  );

  const install = () => {
    installColossusVisualOverhaul();
    applyColossusVisualSafety(scene);
  };

  if (ready()) {
    install();
    return;
  }

  let frames = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    frames += 1;
    if (ready()) {
      scene.onBeforeRenderObservable.remove(observer);
      install();
      return;
    }
    if (frames > 360) {
      scene.onBeforeRenderObservable.remove(observer);
      console.warn('[COLOSSUS] Visual overhaul carriers were not ready within 360 frames.');
    }
  });
}
