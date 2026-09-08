import { Color3, DirectionalLight, EngineStore, HemisphericLight, PointLight, Vector3 } from '@babylonjs/core';

function emissiveFor(name) {
  if (/sensor|beacon/i.test(name)) return new Color3(0.05, 0.52, 0.38);
  if (/edge/i.test(name)) return new Color3(0.14, 0.105, 0.038);
  if (/bone/i.test(name)) return new Color3(0.13, 0.135, 0.108);
  if (/tissue/i.test(name)) return new Color3(0.075, 0.020, 0.016);
  if (/heart/i.test(name)) return new Color3(0.12, 0.018, 0.012);
  if (/player/i.test(name)) return new Color3(0.14, 0.105, 0.060);
  if (/cloth/i.test(name)) return new Color3(0.075, 0.078, 0.066);
  if (/interior/i.test(name)) return new Color3(0.095, 0.105, 0.090);
  if (/armor/i.test(name)) return new Color3(0.105, 0.125, 0.112);
  return null;
}

export function installColossusVisualTuning() {
  const scene = EngineStore.LastCreatedScene;
  if (!scene) return;

  // The authored palette is intentionally dark, but real Playwright captures from
  // Chromium/WebKit showed the traversal surface collapsing almost completely to
  // black. Keep the storm background dark while guaranteeing readable silhouettes,
  // plate gaps and the player on mobile GPUs.
  scene.ambientColor = new Color3(0.46, 0.47, 0.42);
  scene.imageProcessingConfiguration.exposure = 1.55;
  scene.imageProcessingConfiguration.contrast = 1.02;
  scene.fogDensity = Math.min(scene.fogDensity || 0.0036, 0.0020);
  scene.fogColor = new Color3(0.12, 0.15, 0.155);

  const skyFill = new HemisphericLight('cross-browser-sky-fill', new Vector3(0.20, 1, 0.18), scene);
  skyFill.intensity = 1.35;
  skyFill.diffuse = new Color3(0.72, 0.79, 0.75);
  skyFill.groundColor = new Color3(0.27, 0.25, 0.19);
  skyFill.specular = new Color3(0.22, 0.23, 0.20);

  const rim = new DirectionalLight('cross-browser-rim', new Vector3(0.50, -0.70, -0.46), scene);
  rim.position.set(-18, 30, 24);
  rim.intensity = 1.18;
  rim.diffuse = new Color3(0.90, 0.77, 0.55);
  rim.specular = new Color3(0.72, 0.65, 0.48);

  const cameraLamp = new PointLight('camera-readable-fill', new Vector3(0, 1.4, 1.6), scene);
  cameraLamp.parent = scene.activeCamera;
  cameraLamp.intensity = 2.45;
  cameraLamp.range = 34;
  cameraLamp.diffuse = new Color3(0.88, 0.82, 0.66);
  cameraLamp.specular = new Color3(0.46, 0.42, 0.32);

  const tune = () => {
    scene.imageProcessingConfiguration.exposure = Math.max(scene.imageProcessingConfiguration.exposure, 1.48);
    scene.imageProcessingConfiguration.contrast = Math.min(scene.imageProcessingConfiguration.contrast, 1.06);
    if (scene.fogDensity > 0.0023 && !/interior/i.test(globalThis.__PW_TEST_STATE__?.carrier || '')) scene.fogDensity = 0.0020;

    const stormFill = scene.getLightByName('storm-fill');
    if (stormFill) {
      stormFill.intensity = Math.max(stormFill.intensity || 0, 1.02);
      stormFill.groundColor = new Color3(0.18, 0.18, 0.145);
    }
    const stormKey = scene.getLightByName('storm-key');
    if (stormKey) stormKey.intensity = Math.max(stormKey.intensity || 0, 1.60);

    for (const material of scene.materials) {
      const name = material.name || '';
      const glow = emissiveFor(name);
      if (glow && 'emissiveColor' in material) {
        const existing = material.emissiveColor;
        material.emissiveColor = new Color3(
          Math.max(existing?.r || 0, glow.r),
          Math.max(existing?.g || 0, glow.g),
          Math.max(existing?.b || 0, glow.b)
        );
      }
      if ('ambientColor' in material && /^authored-/.test(name)) {
        material.ambientColor = /edge|player/i.test(name)
          ? new Color3(0.72, 0.67, 0.52)
          : new Color3(0.64, 0.65, 0.58);
      }
    }

    for (const light of scene.lights) {
      if (/route-light/i.test(light.name || '')) {
        light.intensity = Math.max(light.intensity || 0, 1.15);
        light.range = Math.max(light.range || 0, 11);
      }
      if (/traveler-lamp/i.test(light.name || '')) {
        light.intensity = Math.max(light.intensity || 0, 1.25);
        light.range = Math.max(light.range || 0, 15);
      }
    }
  };

  tune();
  let passes = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    // boot()/visibility() deliberately changes the original scene lights per zone;
    // re-apply readability floors after those changes and while async GLB materials arrive.
    if (passes % 12 === 0) tune();
    passes += 1;
    if (passes > 1800) scene.onBeforeRenderObservable.remove(observer);
  });
}
